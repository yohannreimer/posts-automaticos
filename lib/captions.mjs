// Pipeline de legendas premium para Reels:
//   transcrição (whisper.cpp) → blocos → análise IA (gancho + palavras-douradas)
//   → PNGs transparentes (Playwright) → composição no vídeo (ffmpeg overlay).
//
// Requer no sistema: ffmpeg/ffprobe e whisper-cli (configuráveis via
// WHISPER_BIN e WHISPER_MODEL no .env).

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.join(__dirname, '..', 'assets', 'fonts');

const WHISPER_BIN = process.env.WHISPER_BIN || 'whisper-cli';
const WHISPER_MODEL =
  process.env.WHISPER_MODEL ||
  path.join(__dirname, '..', 'assets', 'models', 'ggml-large-v3-turbo-q5_0.bin');

function run(cmd, args, { timeoutMs = 600000 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`${cmd} excedeu o tempo limite`)); }, timeoutMs);
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => { clearTimeout(timer); reject(new Error(`${cmd}: ${e.message}`)); });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ out, err });
      else reject(new Error(`${cmd} saiu com código ${code}: ${err.slice(-400)}`));
    });
  });
}

// ---------------------------------------------------------------- probe

export async function probeVideo(videoPath) {
  const { out } = await run('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height:format=duration',
    '-of', 'json', videoPath,
  ]);
  const data = JSON.parse(out);
  return {
    width: data.streams[0].width,
    height: data.streams[0].height,
    duration: parseFloat(data.format.duration),
  };
}

// Decide o layout do Reel. Retorna também o canvas final (o vídeo horizontal
// puro é montado num 9:16 com faixas pretas criadas por nós).
export async function detectFormat(videoPath, probe) {
  // horizontal puro (ex: 1920x1080) → montamos o canvas 1080x1920
  if (probe.width > probe.height) {
    const W = 1080, H = 1920;
    const vidH = Math.round((W * probe.height) / probe.width / 2) * 2;
    const top = Math.round((H - vidH) / 2 / 2) * 2;
    return { type: 'landscape', top, bottom: top + vidH, canvas: { width: W, height: H } };
  }

  const canvas = { width: probe.width, height: probe.height };

  // vertical: pode ter faixas pretas já embutidas (vídeo horizontal editado)
  const mid = Math.max(1, probe.duration / 2 - 3);
  const { err } = await run('ffmpeg', [
    '-ss', String(mid), '-t', '5', '-i', videoPath,
    '-vf', 'cropdetect=24:2:0', '-f', 'null', '-',
  ]);
  const crops = [...err.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
  if (crops.length) {
    const last = crops[crops.length - 1];
    const [, , h, , y] = last.map(Number);
    // faixa preta relevante = conteúdo ocupa menos de 80% da altura
    if (h < probe.height * 0.8 && y > probe.height * 0.05) {
      return { type: 'horizontal', top: y, bottom: y + h, canvas };
    }
  }
  return { type: 'vertical', top: 0, bottom: probe.height, canvas };
}

// ---------------------------------------------------------------- transcrição

export async function transcribeVideo(videoPath, workDir) {
  await mkdir(workDir, { recursive: true });
  const wav = path.join(workDir, 'audio.wav');
  const jsonPrefix = path.join(workDir, 'words');
  const jsonFile = `${jsonPrefix}.json`;

  if (!existsSync(jsonFile)) {
    await run('ffmpeg', ['-y', '-v', 'error', '-i', videoPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav]);
    await run(WHISPER_BIN, ['-m', WHISPER_MODEL, '-f', wav, '-l', 'pt', '-ml', '1', '-sow', '-oj', '-of', jsonPrefix]);
  }
  const data = JSON.parse(await readFile(jsonFile, 'utf8'));
  const words = [];
  for (const s of data.transcription || []) {
    const t = s.text.trim();
    if (!t) continue;
    words.push({ t, a: s.offsets.from / 1000, b: s.offsets.to / 1000 });
  }
  if (!words.length) throw new Error('Transcrição vazia — o vídeo tem fala?');
  return words;
}

export function buildBlocks(words, { maxWords = 4, maxGap = 1.0 } = {}) {
  const blocks = [];
  let cur = [];
  for (const w of words) {
    if (cur.length && (cur.length >= maxWords || w.a - cur[cur.length - 1].b > maxGap || /[.!?]$/.test(cur[cur.length - 1].t))) {
      blocks.push(cur);
      cur = [];
    }
    cur.push(w);
  }
  if (cur.length) blocks.push(cur);
  return blocks;
}

// highlights: [{block, word}] vindos da IA
export function buildEvents(blocks, highlights = []) {
  const hlSet = new Set(highlights.map((h) => `${h.block}:${h.word}`));
  return blocks.map((block, bi) => ({
    start: Math.round(block[0].a * 1000) / 1000,
    end: Math.round(Math.max(block[block.length - 1].b, block[0].a + 0.5) * 1000) / 1000,
    words: block.map((w, wi) => ({ t: w.t, hl: hlSet.has(`${bi}:${wi}`) })),
  }));
}

// ---------------------------------------------------------------- render PNGs

let fontCSS = null;
function getFontCSS() {
  if (fontCSS) return fontCSS;
  const b64 = (f) => readFileSync(path.join(FONTS_DIR, f)).toString('base64');
  fontCSS = `
    @font-face { font-family: 'Playfair Display'; src: url(data:font/ttf;base64,${b64('playfair.ttf')}); font-weight: 400 900; }
    @font-face { font-family: 'Playfair Display'; src: url(data:font/ttf;base64,${b64('playfair-italic.ttf')}); font-weight: 400 900; font-style: italic; }
  `;
  return fontCSS;
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// Gera os PNGs das legendas + do gancho. Tamanhos proporcionais à largura do vídeo.
export async function renderOverlayPNGs({ events, hook, width, stripH, outDir }) {
  await mkdir(outDir, { recursive: true });
  const scale = width / 606;
  const capSize = Math.round(40 * scale);
  const hookSize = Math.round(46 * scale);

  const base = (inner, fontSize, extra = '') => `
    <style>
      ${getFontCSS()}
      * { margin: 0; padding: 0; }
      body { width: ${width}px; height: ${stripH}px; display: flex; align-items: center;
        justify-content: center; background: transparent; overflow: hidden; }
      .cap { font-family: 'Playfair Display', serif; font-weight: 600; font-size: ${fontSize}px;
        color: rgba(255,255,255,.97); line-height: 1.3; text-align: center; max-width: ${Math.round(width * 0.9)}px;
        text-shadow: 0 2px 18px rgba(0,0,0,.65), 0 1px 3px rgba(0,0,0,.5); ${extra} }
      .hl { font-style: italic; color: #E9C46A; }
    </style>
    <div class="cap">${inner}</div>`;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: stripH } });
    for (let i = 0; i < events.length; i++) {
      const html = events[i].words
        .map((w) => `<span class="${w.hl ? 'hl' : ''}">${esc(w.t)}</span>`)
        .join(' ');
      await page.setContent(base(html, capSize));
      await page.screenshot({ path: path.join(outDir, `e${String(i).padStart(3, '0')}.png`), omitBackground: true });
    }
    if (hook) {
      // gancho: serif itálico, um pouco maior, com a última palavra dourada
      const hookWords = hook.trim().split(/\s+/);
      const html = hookWords
        .map((w, i) => (i === hookWords.length - 1 ? `<span class="hl">${esc(w)}</span>` : esc(w)))
        .join(' ');
      await page.setContent(base(html, hookSize, 'font-weight: 700;'));
      await page.screenshot({ path: path.join(outDir, 'hook.png'), omitBackground: true });
    }
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------- composição

export async function burnOverlays({ videoPath, events, hook, format, pngDir, outPath, workDir }) {
  const W = format.canvas.width;
  const H = format.canvas.height;
  const stripH = Math.round(W * 0.5); // faixa generosa; texto centrado nela

  let capY, hookY, hookEnable;
  if (format.type === 'horizontal' || format.type === 'landscape') {
    // legenda centrada na faixa preta de baixo; gancho fixo na de cima
    const lowerCenter = format.bottom + (H - format.bottom) / 2;
    capY = Math.round(Math.min(lowerCenter - stripH / 2, H - stripH));
    const upperCenter = format.top / 2;
    hookY = Math.round(Math.max(upperCenter - stripH / 2, 0));
    hookEnable = null; // o vídeo inteiro
  } else {
    capY = Math.round(H * 0.574);
    hookY = Math.round(H * 0.06);
    hookEnable = `between(t,0,4.5)`;
  }

  const inputs = [];
  const chain = [];
  let prev = '0:v';
  let inputIdx = 1;

  // horizontal puro: primeiro monta o canvas 9:16 com o vídeo centralizado
  if (format.type === 'landscape') {
    const vidH = format.bottom - format.top;
    chain.push(`[0:v]scale=${W}:${vidH},pad=${W}:${H}:0:${format.top}:black[base]`);
    prev = 'base';
  }

  for (let i = 0; i < events.length; i++) {
    inputs.push('-i', path.join(pngDir, `e${String(i).padStart(3, '0')}.png`));
    const out = `v${inputIdx}`;
    chain.push(`[${prev}][${inputIdx}:v]overlay=x=0:y=${capY}:enable='between(t,${events[i].start},${events[i].end})'[${out}]`);
    prev = out;
    inputIdx++;
  }
  if (hook) {
    inputs.push('-i', path.join(pngDir, 'hook.png'));
    const out = `v${inputIdx}`;
    const enable = hookEnable ? `:enable='${hookEnable}'` : '';
    chain.push(`[${prev}][${inputIdx}:v]overlay=x=0:y=${hookY}${enable}[${out}]`);
    prev = out;
    inputIdx++;
  }

  const filterFile = path.join(workDir, 'filter.txt');
  await writeFile(filterFile, chain.join(';\n'), 'utf8');

  await run('ffmpeg', [
    '-y', '-v', 'error',
    '-i', videoPath, ...inputs,
    '-filter_complex_script', filterFile,
    '-map', `[${prev}]`, '-map', '0:a?',
    '-c:v', 'libx264', '-crf', '18', '-preset', 'fast',
    '-c:a', 'copy', '-movflags', '+faststart',
    outPath,
  ], { timeoutMs: 1800000 });
  return outPath;
}
