import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { nanoid } from 'nanoid';
import { chromium } from 'playwright';

import { generateSlides, generateAngles } from './lib/claude.mjs';
import { fetchYoutubeTranscript } from './lib/youtube.mjs';
import { publishToInstagram, instagramEnabled } from './lib/instagram.mjs';
import { uploadPublicImage, imghostEnabled } from './lib/imghost.mjs';
import { readQueue, writeQueue, makeQueueItem, makeReelQueueItem, updateQueueItem } from './lib/queue.mjs';
import { publishReelToInstagram } from './lib/instagram.mjs';
import { uploadPublicVideo } from './lib/imghost.mjs';
import { analyzeReel } from './lib/claude.mjs';
import {
  probeVideo, detectFormat, transcribeVideo, buildBlocks, buildEvents,
  renderOverlayPNGs, burnOverlays,
} from './lib/captions.mjs';
import { renderSlideHTML, CANVAS } from './templates/render.mjs';
import { STYLES, ROLES, VARIANTS, isValidStyle, migrateLegacySlide } from './templates/registry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, 'data', 'slides.json');
const OUTPUT_DIR = path.join(__dirname, 'output');

const app = express();

// Proteção por senha (essencial quando exposto na internet, ex: VPS).
// Ativa automaticamente quando APP_PASSWORD existe no .env.
if (process.env.APP_PASSWORD) {
  app.use((req, res, next) => {
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Basic ')) {
      const decoded = Buffer.from(auth.slice(6), 'base64').toString();
      const pass = decoded.slice(decoded.indexOf(':') + 1);
      if (pass === process.env.APP_PASSWORD) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Posts Automaticos"');
    res.status(401).send('Autenticação necessária');
  });
}

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/output', express.static(OUTPUT_DIR));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const REELS_DIR = path.join(__dirname, 'data', 'reels');
const videoUpload = multer({
  storage: multer.diskStorage({
    destination: async (req, file, cb) => {
      await mkdir(REELS_DIR, { recursive: true });
      cb(null, REELS_DIR);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '.mp4') || '.mp4';
      cb(null, `reel-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
});
app.use('/reels', express.static(REELS_DIR));

const EMPTY_CAROUSEL = { style: 'grid', contentFormat: '', caption: '', slides: [] };

async function readCarousel() {
  if (!existsSync(DATA_FILE)) return { ...EMPTY_CAROUSEL };
  const raw = await readFile(DATA_FILE, 'utf8').catch(() => 'null');
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }
  if (!data) return { ...EMPTY_CAROUSEL };
  // formato antigo: array puro de slides com "template"
  if (Array.isArray(data)) {
    return { ...EMPTY_CAROUSEL, slides: data.map(migrateLegacySlide) };
  }
  return {
    style: isValidStyle(data.style) ? data.style : 'grid',
    contentFormat: data.contentFormat || '',
    caption: data.caption || '',
    slides: (data.slides || []).map(migrateLegacySlide),
  };
}

async function writeCarousel(carousel) {
  await mkdir(path.dirname(DATA_FILE), { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(carousel, null, 2), 'utf8');
}

app.get('/api/meta', (req, res) => {
  res.json({
    styles: STYLES,
    roles: ROLES,
    variants: VARIANTS,
    publish: { instagram: instagramEnabled(), imghost: imghostEnabled() },
  });
});

app.get('/api/carousel', async (req, res) => {
  res.json(await readCarousel());
});

app.post('/api/carousel', async (req, res) => {
  const { style, contentFormat, caption, slides } = req.body || {};
  if (!Array.isArray(slides)) return res.status(400).json({ error: 'slides deve ser um array' });
  await writeCarousel({
    style: isValidStyle(style) ? style : 'grid',
    contentFormat: contentFormat || '',
    caption: caption || '',
    slides,
  });
  res.json({ ok: true });
});

app.post('/api/upload-text', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'nenhum arquivo enviado' });
  res.json({ text: req.file.buffer.toString('utf8') });
});

app.post('/api/youtube', async (req, res) => {
  try {
    const text = await fetchYoutubeTranscript((req.body || {}).url);
    res.json({ text });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/generate', async (req, res) => {
  const { rawText, slideCount, author, topic } = req.body || {};
  try {
    const carousel = await generateSlides({
      rawText,
      slideCount: slideCount || 8,
      author: author || '',
      topic: topic || '',
    });
    await writeCarousel(carousel);
    res.json(carousel);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/render/:id', async (req, res) => {
  const carousel = await readCarousel();
  const index = carousel.slides.findIndex((s) => s.id === req.params.id);
  if (index === -1) return res.status(404).send('slide não encontrado');
  res.send(
    renderSlideHTML(carousel.slides[index], {
      style: carousel.style,
      index,
      total: carousel.slides.length,
      baseVariant: carousel.slides[0]?.variant,
    })
  );
});

// Renderiza todos os slides do carrossel em PNG (buffers em memória).
async function renderCarouselPNGs(carousel) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: CANVAS.width, height: CANVAS.height } });
    const images = [];
    for (let i = 0; i < carousel.slides.length; i++) {
      const html = renderSlideHTML(carousel.slides[i], {
        style: carousel.style,
        index: i,
        total: carousel.slides.length,
        baseVariant: carousel.slides[0]?.variant,
      });
      await page.setContent(html, { waitUntil: 'networkidle' });
      const fileName = `slide-${String(i + 1).padStart(2, '0')}.png`;
      images.push({ fileName, buffer: await page.screenshot() });
    }
    await page.close();
    return images;
  } finally {
    await browser.close();
  }
}

app.post('/api/export', async (req, res) => {
  const carousel = await readCarousel();
  if (!carousel.slides.length) return res.status(400).json({ error: 'nenhum slide pra exportar' });

  try {
    const images = await renderCarouselPNGs(carousel);
    const batchId = `${Date.now()}-${nanoid(6)}`;
    const batchDir = path.join(OUTPUT_DIR, batchId);
    await mkdir(batchDir, { recursive: true });
    const files = [];
    for (const { fileName, buffer } of images) {
      await writeFile(path.join(batchDir, fileName), buffer);
      files.push(`/output/${batchId}/${fileName}`);
    }
    res.json({ batchId, files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/publish', async (req, res) => {
  const carousel = await readCarousel();
  if (!carousel.slides.length) return res.status(400).json({ error: 'nenhum slide pra publicar' });
  if (carousel.slides.length > 10) {
    return res.status(400).json({
      error: `A API do Instagram aceita no máximo 10 slides por carrossel (você tem ${carousel.slides.length}).`,
    });
  }
  if (!instagramEnabled() || !imghostEnabled()) {
    return res.status(400).json({
      error:
        'Publicação não configurada. Preencha IG_ACCESS_TOKEN, IG_USER_ID e IMGBB_API_KEY no .env — passo a passo no SETUP-INSTAGRAM.md.',
    });
  }

  const caption = (req.body || {}).caption ?? carousel.caption ?? '';
  try {
    const images = await renderCarouselPNGs(carousel);
    const imageUrls = [];
    for (const { fileName, buffer } of images) {
      imageUrls.push(await uploadPublicImage(buffer, fileName));
    }
    const result = await publishToInstagram({ imageUrls, caption });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------------------ fila / agenda

async function publishQueueItem(item) {
  if (item.kind === 'reel') {
    const videoUrl = await uploadPublicVideo(await readFile(item.videoPath), 'reel');
    return publishReelToInstagram({ videoUrl, caption: item.caption || '' });
  }
  const images = await renderCarouselPNGs(item.carousel);
  const imageUrls = [];
  for (const { fileName, buffer } of images) {
    imageUrls.push(await uploadPublicImage(buffer, fileName));
  }
  return publishToInstagram({ imageUrls, caption: item.carousel.caption || '' });
}

app.get('/api/queue', async (req, res) => {
  const queue = await readQueue();
  queue.sort((a, b) => (a.scheduledAt || '').localeCompare(b.scheduledAt || ''));
  res.json(queue);
});

// Agenda o carrossel atual do editor (ou um carrossel enviado no corpo)
app.post('/api/queue', async (req, res) => {
  const { scheduledAt, carousel } = req.body || {};
  if (!scheduledAt) return res.status(400).json({ error: 'scheduledAt é obrigatório' });
  const data = carousel || (await readCarousel());
  if (!data.slides?.length) return res.status(400).json({ error: 'nenhum slide pra agendar' });
  if (data.slides.length > 10) {
    return res.status(400).json({ error: 'máximo de 10 slides por post no Instagram' });
  }
  const queue = await readQueue();
  const item = makeQueueItem(data, scheduledAt);
  queue.push(item);
  await writeQueue(queue);
  res.json(item);
});

app.put('/api/queue/:id', async (req, res) => {
  const { scheduledAt, status, carousel } = req.body || {};
  const patch = {};
  if (scheduledAt) patch.scheduledAt = scheduledAt;
  if (status === 'scheduled') Object.assign(patch, { status, error: '' }); // reagendar item com erro
  if (carousel) patch.carousel = carousel;
  const item = await updateQueueItem(req.params.id, patch);
  if (!item) return res.status(404).json({ error: 'post não encontrado' });
  res.json(item);
});

app.delete('/api/queue/:id', async (req, res) => {
  const queue = await readQueue();
  const next = queue.filter((p) => p.id !== req.params.id);
  if (next.length === queue.length) return res.status(404).json({ error: 'post não encontrado' });
  await writeQueue(next);
  res.json({ ok: true });
});

// Renderiza um slide de um post AGENDADO (preview no modal da agenda)
app.get('/api/queue/:id/slide/:index', async (req, res) => {
  const queue = await readQueue();
  const item = queue.find((p) => p.id === req.params.id);
  if (!item || item.kind === 'reel') return res.status(404).send('não encontrado');
  const i = Number(req.params.index);
  const slide = item.carousel.slides[i];
  if (!slide) return res.status(404).send('slide não encontrado');
  res.send(
    renderSlideHTML(slide, {
      style: item.carousel.style,
      index: i,
      total: item.carousel.slides.length,
      baseVariant: item.carousel.slides[0]?.variant,
    })
  );
});

// Copia o carrossel do post agendado para o editor
app.post('/api/queue/:id/load', async (req, res) => {
  const queue = await readQueue();
  const item = queue.find((p) => p.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'post não encontrado' });
  if (item.kind === 'reel') return res.status(400).json({ error: 'post de Reel não abre no editor de slides' });
  await writeCarousel(item.carousel);
  res.json(item.carousel);
});

app.post('/api/queue/:id/publish-now', async (req, res) => {
  const queue = await readQueue();
  const item = queue.find((p) => p.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'post não encontrado' });
  try {
    const result = await publishQueueItem(item);
    await updateQueueItem(item.id, {
      status: 'published',
      permalink: result.permalink,
      publishedAt: new Date().toISOString(),
      error: '',
    });
    res.json(result);
  } catch (err) {
    await updateQueueItem(item.id, { status: 'error', error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------------------ reels

// Fila de processamento: aceita vários vídeos, processa um por vez.
// item: { file, name, status: queued|processing|done|error, stage, error, result }
const reelBatch = [];
let reelWorkerBusy = false;

async function processOneReel(item, hookOverride) {
  const videoPath = path.join(REELS_DIR, item.file);
  const id = path.basename(item.file, path.extname(item.file));
  const workDir = path.join(REELS_DIR, `work-${id}`);
  await mkdir(workDir, { recursive: true });

  item.stage = 'analisando vídeo...';
  const probe = await probeVideo(videoPath);
  const format = await detectFormat(videoPath, probe);

  item.stage = 'transcrevendo áudio (Whisper)...';
  const words = await transcribeVideo(videoPath, workDir);
  const blocks = buildBlocks(words);

  item.stage = 'IA planejando gancho e destaques...';
  const plan = await analyzeReel({ blocks });
  const hook = (hookOverride || plan.hook || '').trim();

  item.stage = 'renderizando legendas...';
  const events = buildEvents(blocks, plan.highlights);
  const pngDir = path.join(workDir, 'pngs');
  const stripH = Math.round(format.canvas.width * 0.5);
  await renderOverlayPNGs({ events, hook, width: format.canvas.width, stripH, outDir: pngDir });

  item.stage = 'compondo vídeo final (ffmpeg)...';
  const outFile = `${id}-final.mp4`;
  await burnOverlays({
    videoPath, events, hook, format, pngDir,
    outPath: path.join(REELS_DIR, outFile), workDir,
  });

  return {
    file: outFile,
    sourceFile: item.file,
    hook,
    caption: plan.caption,
    transcript: words.map((w) => w.t).join(' '),
    format: format.type,
    duration: probe.duration,
  };
}

async function reelWorker() {
  if (reelWorkerBusy) return;
  reelWorkerBusy = true;
  try {
    let item;
    while ((item = reelBatch.find((i) => i.status === 'queued'))) {
      item.status = 'processing';
      try {
        item.result = await processOneReel(item, item.hookOverride);
        item.status = 'done';
        item.stage = '';
      } catch (err) {
        item.status = 'error';
        item.error = err.message;
        item.stage = '';
      }
    }
  } finally {
    reelWorkerBusy = false;
  }
}

app.get('/api/reels/batch', (req, res) => res.json(reelBatch));

app.post('/api/reels/upload', videoUpload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'nenhum vídeo enviado' });
  res.json({ file: req.file.filename, size: req.file.size });
});

// Enfileira o processamento (transcrição, IA, legenda, composição).
app.post('/api/reels/process', async (req, res) => {
  const { file, hookOverride, name } = req.body || {};
  const videoPath = path.join(REELS_DIR, path.basename(file || ''));
  if (!file || !existsSync(videoPath)) return res.status(400).json({ error: 'vídeo não encontrado — envie primeiro' });

  const existing = reelBatch.find((i) => i.file === path.basename(file));
  if (existing && existing.status === 'processing') {
    return res.status(409).json({ error: 'esse vídeo já está sendo processado' });
  }
  if (existing) {
    Object.assign(existing, {
      status: 'queued', stage: 'na fila...', error: '', result: null,
      hookOverride: (hookOverride || '').trim(),
    });
  } else {
    reelBatch.push({
      file: path.basename(file),
      name: name || path.basename(file),
      status: 'queued', stage: 'na fila...', error: '', result: null,
      hookOverride: (hookOverride || '').trim(),
    });
  }
  res.json({ ok: true });
  reelWorker();
});

app.delete('/api/reels/batch/:file', (req, res) => {
  const idx = reelBatch.findIndex((i) => i.file === req.params.file);
  if (idx === -1) return res.status(404).json({ error: 'item não encontrado' });
  if (reelBatch[idx].status === 'processing') return res.status(409).json({ error: 'em processamento' });
  reelBatch.splice(idx, 1);
  res.json({ ok: true });
});

app.post('/api/reels/schedule', async (req, res) => {
  const { file, caption, title, scheduledAt } = req.body || {};
  if (!scheduledAt) return res.status(400).json({ error: 'scheduledAt é obrigatório' });
  const videoPath = path.join(REELS_DIR, path.basename(file || ''));
  if (!file || !existsSync(videoPath)) return res.status(400).json({ error: 'vídeo processado não encontrado' });
  const queue = await readQueue();
  const item = makeReelQueueItem({ videoPath, caption, title }, scheduledAt);
  queue.push(item);
  await writeQueue(queue);
  res.json(item);
});

app.post('/api/reels/publish-now', async (req, res) => {
  const { file, caption } = req.body || {};
  const videoPath = path.join(REELS_DIR, path.basename(file || ''));
  if (!file || !existsSync(videoPath)) return res.status(400).json({ error: 'vídeo processado não encontrado' });
  try {
    const videoUrl = await uploadPublicVideo(await readFile(videoPath), 'reel');
    const result = await publishReelToInstagram({ videoUrl, caption: caption || '' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------------------ agendador

let schedulerBusy = false;
async function schedulerTick() {
  if (schedulerBusy) return;
  if (!instagramEnabled() || !imghostEnabled()) return;
  schedulerBusy = true;
  try {
    const queue = await readQueue();
    const now = new Date().toISOString();
    const due = queue.filter((p) => p.status === 'scheduled' && p.scheduledAt <= now);
    for (const item of due) {
      console.log(`[agendador] publicando "${item.title}" (${item.id})...`);
      try {
        const result = await publishQueueItem(item);
        await updateQueueItem(item.id, {
          status: 'published',
          permalink: result.permalink,
          publishedAt: new Date().toISOString(),
          error: '',
        });
        console.log(`[agendador] publicado: ${result.permalink || result.id}`);
      } catch (err) {
        await updateQueueItem(item.id, { status: 'error', error: err.message });
        console.error(`[agendador] erro em "${item.title}": ${err.message}`);
      }
    }
  } finally {
    schedulerBusy = false;
  }
}
setInterval(schedulerTick, 60 * 1000);

// ------------------------------------------------------------ planejador em lote

const planJob = { running: false, total: 0, done: 0, currentTitle: '', error: '', finishedAt: '' };

app.get('/api/plan/status', (req, res) => res.json(planJob));

app.post('/api/plan', async (req, res) => {
  const { rawText, count, startDate, time, slideCount, author } = req.body || {};
  if (planJob.running) return res.status(409).json({ error: 'já existe um planejamento em andamento' });
  if (!rawText?.trim()) return res.status(400).json({ error: 'cole o texto-fonte primeiro' });
  const n = Math.min(Math.max(Number(count) || 5, 1), 30);
  if (!startDate) return res.status(400).json({ error: 'escolha a data inicial' });

  Object.assign(planJob, { running: true, total: n, done: 0, currentTitle: 'planejando ângulos...', error: '', finishedAt: '' });
  res.json({ ok: true, total: n });

  // roda em background; o front acompanha via /api/plan/status
  (async () => {
    try {
      const angles = await generateAngles({ rawText, count: n });
      planJob.total = angles.length;
      for (let i = 0; i < angles.length; i++) {
        const angle = angles[i];
        planJob.currentTitle = angle.title;
        const carousel = await generateSlides({
          rawText,
          slideCount: Math.min(Number(slideCount) || 8, 10),
          author: author || '',
          topic: `${angle.title} — ${angle.focus}`,
        });
        const when = new Date(`${startDate}T${time || '18:00'}:00`);
        when.setDate(when.getDate() + i);
        const queue = await readQueue();
        queue.push(makeQueueItem(carousel, when.toISOString()));
        await writeQueue(queue);
        planJob.done = i + 1;
      }
      planJob.currentTitle = '';
      planJob.finishedAt = new Date().toISOString();
    } catch (err) {
      planJob.error = err.message;
    } finally {
      planJob.running = false;
    }
  })();
});

const PORT = process.env.PORT || 4173;
app.listen(PORT, () => {
  console.log(`Posts Automáticos rodando em http://localhost:${PORT}`);
});
