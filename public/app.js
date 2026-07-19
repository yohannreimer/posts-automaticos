const state = {
  style: 'grid',
  contentFormat: '',
  caption: '',
  slides: [],
  meta: { styles: [], roles: [], variants: [], publish: {} },
};

const el = {};
[
  'ytUrl', 'ytBtn', 'ytStatus', 'rawText', 'fileDrop', 'fileInput', 'slideCount', 'author',
  'topic', 'generateBtn', 'genStatus', 'styleSelect', 'formatLabel', 'slideCountLabel',
  'addSlideBtn', 'exportBtn', 'exportStatus', 'results', 'slidesContainer',
  'caption', 'publishBtn', 'publishStatus', 'scheduleAt', 'scheduleBtn', 'queueList',
  'planCount', 'planDate', 'planTime', 'planBtn', 'planStatus',
  'queueCalendar', 'viewListBtn', 'viewCalBtn', 'calPrev', 'calNext', 'calLabel', 'calGrid',
  'reelDrop', 'reelInput', 'reelStatus', 'reelResult', 'reelPreview', 'reelHook',
  'reelReprocessBtn', 'reelCaption', 'reelScheduleAt', 'reelScheduleBtn', 'reelPublishBtn', 'reelPubStatus',
].forEach((id) => (el[id] = document.getElementById(id)));

const FORMAT_LABELS = {
  'passo-a-passo': 'formato: passo a passo',
  licoes: 'formato: lições',
  'mito-vs-fato': 'formato: mito vs fato',
  'hot-take': 'formato: hot take',
  'cheat-sheet': 'formato: cheat sheet',
  stats: 'formato: estatísticas',
  narrativa: 'formato: narrativa',
};

function setStatus(node, msg, type) {
  node.textContent = msg || '';
  node.className = 'status' + (type ? ` ${type}` : '');
}

async function loadMeta() {
  const res = await fetch('/api/meta');
  state.meta = await res.json();
  el.styleSelect.innerHTML = state.meta.styles
    .map((s) => `<option value="${s.id}" title="${s.description}">${s.label}</option>`)
    .join('');
}

async function loadCarousel() {
  const res = await fetch('/api/carousel');
  const data = await res.json();
  state.style = data.style;
  state.contentFormat = data.contentFormat || '';
  state.caption = data.caption || '';
  state.slides = data.slides;
  el.styleSelect.value = state.style;
  el.caption.value = state.caption;
  renderSlides();
}

async function saveCarousel() {
  await fetch('/api/carousel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      style: state.style,
      contentFormat: state.contentFormat,
      caption: state.caption,
      slides: state.slides,
    }),
  });
}

function options(list, selected) {
  return list
    .map((o) => `<option value="${o.id}" ${o.id === selected ? 'selected' : ''}>${o.label}</option>`)
    .join('');
}

function scaleFrame(wrap, iframe) {
  const width = wrap.clientWidth;
  iframe.style.transform = `scale(${width / 1080})`;
}

function refreshAllFrames() {
  document.querySelectorAll('.slide-card iframe').forEach((iframe) => {
    iframe.src = iframe.dataset.src + '&t=' + Date.now();
  });
}

function renderSlides() {
  el.formatLabel.textContent = FORMAT_LABELS[state.contentFormat] || '';
  el.slideCountLabel.textContent = state.slides.length
    ? `${state.slides.length} slide${state.slides.length > 1 ? 's' : ''}`
    : '';

  if (!state.slides.length) {
    el.slidesContainer.innerHTML =
      '<div class="empty-state">Nenhum slide ainda. Gere um carrossel ao lado.</div>';
    return;
  }

  el.slidesContainer.innerHTML = '<div class="slides" id="slidesGrid"></div>';
  const grid = document.getElementById('slidesGrid');

  state.slides.forEach((slide, i) => {
    const card = document.createElement('div');
    card.className = 'slide-card';
    card.innerHTML = `
      <div class="slide-frame-wrap">
        <iframe data-src="/api/render/${slide.id}?v=1" src="/api/render/${slide.id}?v=1&t=${Date.now()}"></iframe>
      </div>
      <div class="slide-controls">
        <div class="top-row">
          <select data-field="role">${options(state.meta.roles, slide.role)}</select>
          <select data-field="variant">${options(state.meta.variants, slide.variant)}</select>
          <button class="icon-btn" data-action="up">↑</button>
          <button class="icon-btn" data-action="down">↓</button>
          <button class="icon-btn danger" data-action="delete">✕</button>
        </div>
        <textarea data-field="text" placeholder="Texto do slide">${slide.text || ''}</textarea>
        <div class="row">
          <input type="text" data-field="badge" placeholder="badge (1, MITO, 87%)" value="${slide.badge || ''}" />
          <input type="text" data-field="eyebrow" placeholder="eyebrow" value="${slide.eyebrow || ''}" />
        </div>
        <div class="row">
          <input type="text" data-field="signature" placeholder="assinatura" value="${slide.signature || ''}" />
          <input type="text" data-field="highlight" placeholder="palavra em destaque" value="${slide.highlight || ''}" />
          <select data-field="decoration">
            <option value="" ${!slide.decoration ? 'selected' : ''}>sem decoração</option>
            <option value="arrow" ${slide.decoration === 'arrow' ? 'selected' : ''}>seta</option>
          </select>
        </div>
      </div>
    `;

    const wrap = card.querySelector('.slide-frame-wrap');
    const iframe = card.querySelector('iframe');
    requestAnimationFrame(() => scaleFrame(wrap, iframe));
    window.addEventListener('resize', () => scaleFrame(wrap, iframe));

    card.querySelectorAll('[data-field]').forEach((input) => {
      input.addEventListener('change', async () => {
        state.slides[i][input.dataset.field] = input.value;
        await saveCarousel();
        // role/variant mudam o layout do próprio slide; ordem/total afetam
        // vizinhos no estilo panorâmico — mais simples recarregar todos
        refreshAllFrames();
      });
    });

    card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      state.slides.splice(i, 1);
      await saveCarousel();
      renderSlides();
    });
    card.querySelector('[data-action="up"]').addEventListener('click', async () => {
      if (i === 0) return;
      [state.slides[i - 1], state.slides[i]] = [state.slides[i], state.slides[i - 1]];
      await saveCarousel();
      renderSlides();
    });
    card.querySelector('[data-action="down"]').addEventListener('click', async () => {
      if (i === state.slides.length - 1) return;
      [state.slides[i + 1], state.slides[i]] = [state.slides[i], state.slides[i + 1]];
      await saveCarousel();
      renderSlides();
    });

    grid.appendChild(card);
  });
}

el.styleSelect.addEventListener('change', async () => {
  state.style = el.styleSelect.value;
  await saveCarousel();
  refreshAllFrames();
});

el.addSlideBtn.addEventListener('click', async () => {
  state.slides.push({
    id: `s${Date.now()}`,
    role: 'content',
    variant: 'light',
    text: 'Novo slide',
    badge: '',
    eyebrow: '',
    signature: '',
    highlight: '',
    decoration: '',
  });
  await saveCarousel();
  renderSlides();
});

el.ytBtn.addEventListener('click', async () => {
  const url = el.ytUrl.value.trim();
  if (!url) {
    setStatus(el.ytStatus, 'Cole um link do YouTube primeiro.', 'error');
    return;
  }
  el.ytBtn.disabled = true;
  setStatus(el.ytStatus, 'Buscando transcrição...');
  try {
    const res = await fetch('/api/youtube', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'erro desconhecido');
    el.rawText.value = data.text;
    setStatus(el.ytStatus, `Transcrição carregada (${data.text.length.toLocaleString('pt-BR')} caracteres).`, 'ok');
  } catch (err) {
    setStatus(el.ytStatus, err.message, 'error');
  } finally {
    el.ytBtn.disabled = false;
  }
});

el.fileDrop.addEventListener('click', () => el.fileInput.click());
el.fileInput.addEventListener('change', async () => {
  const file = el.fileInput.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/upload-text', { method: 'POST', body: formData });
  const data = await res.json();
  if (data.text) el.rawText.value = data.text;
});

el.generateBtn.addEventListener('click', async () => {
  const rawText = el.rawText.value.trim();
  if (!rawText) {
    setStatus(el.genStatus, 'Cole um texto primeiro.', 'error');
    return;
  }
  el.generateBtn.disabled = true;
  setStatus(el.genStatus, 'Gerando com a IA...');
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawText,
        slideCount: Number(el.slideCount.value) || 8,
        author: el.author.value.trim(),
        topic: el.topic.value.trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'erro desconhecido');
    state.style = data.style;
    state.contentFormat = data.contentFormat || '';
    state.caption = data.caption || '';
    state.slides = data.slides;
    el.styleSelect.value = state.style;
    el.caption.value = state.caption;
    renderSlides();
    setStatus(el.genStatus, `Gerado! ${data.slides.length} slides.`, 'ok');
  } catch (err) {
    setStatus(el.genStatus, err.message, 'error');
  } finally {
    el.generateBtn.disabled = false;
  }
});

el.exportBtn.addEventListener('click', async () => {
  if (!state.slides.length) {
    setStatus(el.exportStatus, 'Nenhum slide pra exportar.', 'error');
    return;
  }
  el.exportBtn.disabled = true;
  setStatus(el.exportStatus, 'Exportando imagens...');
  try {
    const res = await fetch('/api/export', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'erro desconhecido');
    setStatus(el.exportStatus, `Exportado! Pasta output/${data.batchId}`, 'ok');
    el.results.innerHTML = data.files
      .map((f) => `<div><a href="${f}" download target="_blank">${f}</a></div>`)
      .join('');
  } catch (err) {
    setStatus(el.exportStatus, err.message, 'error');
  } finally {
    el.exportBtn.disabled = false;
  }
});

el.caption.addEventListener('change', async () => {
  state.caption = el.caption.value;
  await saveCarousel();
});

el.publishBtn.addEventListener('click', async () => {
  if (!state.slides.length) {
    setStatus(el.publishStatus, 'Nenhum slide pra publicar.', 'error');
    return;
  }
  const pub = state.meta.publish || {};
  if (!pub.instagram || !pub.imghost) {
    setStatus(
      el.publishStatus,
      'Configure IG_ACCESS_TOKEN, IG_USER_ID e IMGBB_API_KEY no .env (veja SETUP-INSTAGRAM.md) e reinicie o servidor.',
      'error'
    );
    return;
  }
  const cap = el.caption.value;
  const preview = cap.length > 300 ? cap.slice(0, 300) + '…\n\n[prévia cortada — a legenda completa será publicada]' : cap;
  const ok = confirm(
    `Publicar ${state.slides.length} slide${state.slides.length > 1 ? 's' : ''} no Instagram agora?\n\nLegenda:\n${preview}`
  );
  if (!ok) return;

  el.publishBtn.disabled = true;
  setStatus(el.publishStatus, 'Publicando... (renderiza, envia e aguarda o Instagram — pode levar ~1 min)');
  try {
    state.caption = el.caption.value;
    await saveCarousel();
    const res = await fetch('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caption: state.caption }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'erro desconhecido');
    el.publishStatus.innerHTML = data.permalink
      ? `Publicado! <a href="${data.permalink}" target="_blank">${data.permalink}</a>`
      : `Publicado! (id ${data.id})`;
    el.publishStatus.className = 'status ok';
  } catch (err) {
    setStatus(el.publishStatus, err.message, 'error');
  } finally {
    el.publishBtn.disabled = false;
  }
});

// ------------------------------------------------------------ agenda / fila

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// converte ISO → valor aceito pelo input datetime-local (hora local)
function isoToLocalInput(iso) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const STATUS_LABELS = { scheduled: 'agendado', published: 'publicado', error: 'erro' };

let queueCache = [];
let queueView = 'list';
let calMonth = new Date();

async function loadQueue() {
  const res = await fetch('/api/queue');
  queueCache = await res.json();
  renderQueueViews();
}

function renderQueueViews() {
  renderQueueList(queueCache);
  renderCalendar(queueCache);
  el.queueList.hidden = queueView !== 'list';
  el.queueCalendar.hidden = queueView !== 'calendar';
  el.viewListBtn.classList.toggle('active', queueView === 'list');
  el.viewCalBtn.classList.toggle('active', queueView === 'calendar');
}

function renderCalendar(queue) {
  const y = calMonth.getFullYear();
  const m = calMonth.getMonth();
  el.calLabel.textContent = calMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  // agrupa posts por dia local (YYYY-MM-DD)
  const byDay = {};
  for (const item of queue) {
    const d = new Date(item.scheduledAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    (byDay[key] = byDay[key] || []).push(item);
  }

  el.calGrid.innerHTML = '';
  for (const dow of ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']) {
    const h = document.createElement('div');
    h.className = 'cal-dow';
    h.textContent = dow;
    el.calGrid.appendChild(h);
  }

  const first = new Date(y, m, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay()); // volta até o domingo
  const todayKey = new Date().toDateString();

  for (let i = 0; i < 42; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const cell = document.createElement('div');
    cell.className = 'cal-day';
    if (day.getMonth() !== m) cell.classList.add('other');
    if (day.toDateString() === todayKey) cell.classList.add('today');
    const num = document.createElement('div');
    num.className = 'd';
    num.textContent = day.getDate();
    cell.appendChild(num);

    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    for (const item of byDay[key] || []) {
      const chip = document.createElement('div');
      chip.className = `cal-chip ${item.status}`;
      const hh = new Date(item.scheduledAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      chip.textContent = `${hh} ${item.title}`;
      chip.title = `${item.title}\n${STATUS_LABELS[item.status] || item.status}${item.error ? ` — ${item.error}` : ''}\nClique para abrir no editor`;
      chip.addEventListener('click', async () => {
        if (item.permalink && item.status === 'published') {
          window.open(item.permalink, '_blank');
          return;
        }
        await fetch(`/api/queue/${item.id}/load`, { method: 'POST' });
        await loadCarousel();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      cell.appendChild(chip);
    }
    el.calGrid.appendChild(cell);
  }
}

function renderQueueList(queue) {
  if (!queue.length) {
    el.queueList.innerHTML = '<div class="empty-state small">Nenhum post agendado ainda.</div>';
    return;
  }
  el.queueList.innerHTML = '';
  for (const item of queue) {
    const row = document.createElement('div');
    row.className = 'queue-item';
    const statusHtml = item.permalink
      ? `<a href="${item.permalink}" target="_blank" class="q-status ${item.status}">${STATUS_LABELS[item.status] || item.status}</a>`
      : `<span class="q-status ${item.status}" title="${item.error || ''}">${STATUS_LABELS[item.status] || item.status}</span>`;
    row.innerHTML = `
      <span class="q-title" title="${item.title}">${item.title}</span>
      ${statusHtml}
      <input type="datetime-local" value="${isoToLocalInput(item.scheduledAt)}" ${item.status === 'published' ? 'disabled' : ''} />
      <button class="icon-btn" data-action="edit" title="Carregar no editor">✎</button>
      <button class="icon-btn" data-action="now" title="Publicar agora">▶</button>
      <button class="icon-btn danger" data-action="del" title="Remover">✕</button>
    `;

    row.querySelector('input').addEventListener('change', async (e) => {
      await fetch(`/api/queue/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt: new Date(e.target.value).toISOString(), status: 'scheduled' }),
      });
      loadQueue();
    });
    row.querySelector('[data-action="edit"]').addEventListener('click', async () => {
      await fetch(`/api/queue/${item.id}/load`, { method: 'POST' });
      await loadCarousel();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    row.querySelector('[data-action="now"]').addEventListener('click', async () => {
      if (!confirm(`Publicar "${item.title}" no Instagram AGORA?`)) return;
      row.querySelector('[data-action="now"]').disabled = true;
      const res = await fetch(`/api/queue/${item.id}/publish-now`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) alert(`Erro: ${data.error}`);
      loadQueue();
    });
    row.querySelector('[data-action="del"]').addEventListener('click', async () => {
      if (item.status !== 'published' && !confirm(`Remover "${item.title}" da agenda?`)) return;
      await fetch(`/api/queue/${item.id}`, { method: 'DELETE' });
      loadQueue();
    });

    el.queueList.appendChild(row);
  }
}

el.viewListBtn.addEventListener('click', () => { queueView = 'list'; renderQueueViews(); });
el.viewCalBtn.addEventListener('click', () => { queueView = 'calendar'; renderQueueViews(); });
el.calPrev.addEventListener('click', () => { calMonth.setMonth(calMonth.getMonth() - 1); renderCalendar(queueCache); });
el.calNext.addEventListener('click', () => { calMonth.setMonth(calMonth.getMonth() + 1); renderCalendar(queueCache); });

el.scheduleBtn.addEventListener('click', async () => {
  if (!state.slides.length) {
    setStatus(el.publishStatus, 'Nenhum slide pra agendar.', 'error');
    return;
  }
  if (!el.scheduleAt.value) {
    setStatus(el.publishStatus, 'Escolha data e hora do agendamento.', 'error');
    return;
  }
  state.caption = el.caption.value;
  await saveCarousel();
  const res = await fetch('/api/queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scheduledAt: new Date(el.scheduleAt.value).toISOString() }),
  });
  const data = await res.json();
  if (!res.ok) {
    setStatus(el.publishStatus, data.error, 'error');
    return;
  }
  setStatus(el.publishStatus, `Agendado para ${fmtDate(data.scheduledAt)}.`, 'ok');
  loadQueue();
});

// ------------------------------------------------------------ planejador

let planPoller = null;

function pollPlanStatus() {
  clearInterval(planPoller);
  planPoller = setInterval(async () => {
    const s = await (await fetch('/api/plan/status')).json();
    if (s.running) {
      setStatus(el.planStatus, `Gerando ${s.done}/${s.total}... ${s.currentTitle ? `(${s.currentTitle})` : ''}`);
      loadQueue();
    } else {
      clearInterval(planPoller);
      el.planBtn.disabled = false;
      if (s.error) setStatus(el.planStatus, `Erro: ${s.error}`, 'error');
      else if (s.total) setStatus(el.planStatus, `Pronto! ${s.total} posts agendados.`, 'ok');
      loadQueue();
    }
  }, 3000);
}

el.planBtn.addEventListener('click', async () => {
  const rawText = el.rawText.value.trim();
  if (!rawText) {
    setStatus(el.planStatus, 'Cole o texto de origem primeiro (caixa lá em cima).', 'error');
    return;
  }
  if (!el.planDate.value) {
    setStatus(el.planStatus, 'Escolha a data inicial.', 'error');
    return;
  }
  const count = Number(el.planCount.value) || 10;
  if (!confirm(`Gerar e agendar ${count} posts, 1 por dia a partir de ${el.planDate.value} às ${el.planTime.value}?\n\nIsso faz ${count + 1} chamadas à IA e pode levar alguns minutos.`)) return;

  el.planBtn.disabled = true;
  setStatus(el.planStatus, 'Planejando ângulos...');
  const res = await fetch('/api/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rawText,
      count,
      startDate: el.planDate.value,
      time: el.planTime.value,
      slideCount: Number(el.slideCount.value) || 8,
      author: el.author.value.trim(),
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    el.planBtn.disabled = false;
    setStatus(el.planStatus, data.error, 'error');
    return;
  }
  pollPlanStatus();
});

// ------------------------------------------------------------ reels

const reel = { sourceFile: '', result: null };

function pollReelStatus() {
  const timer = setInterval(async () => {
    const s = await (await fetch('/api/reels/status')).json();
    if (s.running) {
      setStatus(el.reelStatus, s.stage);
      return;
    }
    clearInterval(timer);
    if (s.error) {
      setStatus(el.reelStatus, `Erro: ${s.error}`, 'error');
      return;
    }
    if (s.result) {
      reel.result = s.result;
      const fmtLabel = s.result.format === 'vertical'
        ? 'vertical (gancho nos primeiros segundos)'
        : 'horizontal → tela 9:16 com faixas (gancho fixo em cima)';
      setStatus(el.reelStatus, `Pronto! Formato: ${fmtLabel}.`, 'ok');
      el.reelResult.hidden = false;
      el.reelPreview.src = `/reels/${s.result.file}?t=${Date.now()}`;
      el.reelHook.value = s.result.hook || '';
      el.reelCaption.value = s.result.caption || '';
    }
  }, 3000);
}

async function startReelProcess(hookOverride) {
  setStatus(el.reelStatus, 'Processando... (transcrição + IA + render — alguns minutos)');
  el.reelResult.hidden = true;
  const res = await fetch('/api/reels/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: reel.sourceFile, hookOverride: hookOverride || '' }),
  });
  const data = await res.json();
  if (!res.ok) {
    setStatus(el.reelStatus, data.error, 'error');
    return;
  }
  pollReelStatus();
}

el.reelDrop.addEventListener('click', () => el.reelInput.click());
el.reelInput.addEventListener('change', async () => {
  const file = el.reelInput.files[0];
  if (!file) return;
  setStatus(el.reelStatus, `Enviando ${file.name} (${(file.size / 1e6).toFixed(0)}MB)...`);
  const formData = new FormData();
  formData.append('video', file);
  const res = await fetch('/api/reels/upload', { method: 'POST', body: formData });
  const data = await res.json();
  if (!res.ok) {
    setStatus(el.reelStatus, data.error, 'error');
    return;
  }
  reel.sourceFile = data.file;
  startReelProcess();
});

el.reelReprocessBtn.addEventListener('click', () => {
  if (!reel.sourceFile) return;
  startReelProcess(el.reelHook.value.trim());
});

el.reelScheduleBtn.addEventListener('click', async () => {
  if (!reel.result) return;
  if (!el.reelScheduleAt.value) {
    setStatus(el.reelPubStatus, 'Escolha data e hora.', 'error');
    return;
  }
  const res = await fetch('/api/reels/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file: reel.result.file,
      caption: el.reelCaption.value,
      title: el.reelHook.value || reel.result.hook,
      scheduledAt: new Date(el.reelScheduleAt.value).toISOString(),
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    setStatus(el.reelPubStatus, data.error, 'error');
    return;
  }
  setStatus(el.reelPubStatus, `Reel agendado para ${fmtDate(data.scheduledAt)}.`, 'ok');
  loadQueue();
});

el.reelPublishBtn.addEventListener('click', async () => {
  if (!reel.result) return;
  if (!confirm('Publicar este Reel no Instagram AGORA?')) return;
  el.reelPublishBtn.disabled = true;
  setStatus(el.reelPubStatus, 'Publicando Reel... (o Instagram processa o vídeo — 1-3 min)');
  try {
    const res = await fetch('/api/reels/publish-now', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: reel.result.file, caption: el.reelCaption.value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'erro desconhecido');
    el.reelPubStatus.innerHTML = data.permalink
      ? `Publicado! <a href="${data.permalink}" target="_blank">${data.permalink}</a>`
      : `Publicado! (id ${data.id})`;
    el.reelPubStatus.className = 'status ok';
  } catch (err) {
    setStatus(el.reelPubStatus, err.message, 'error');
  } finally {
    el.reelPublishBtn.disabled = false;
  }
});

(async function init() {
  await loadMeta();
  await loadCarousel();
  await loadQueue();
  // retoma acompanhamento de um Reel em processamento ou mostra o último pronto
  const rs = await (await fetch('/api/reels/status')).json();
  if (rs.running) {
    pollReelStatus();
  } else if (rs.result) {
    reel.sourceFile = rs.result.sourceFile;
    reel.result = rs.result;
    el.reelResult.hidden = false;
    el.reelPreview.src = `/reels/${rs.result.file}`;
    el.reelHook.value = rs.result.hook || '';
    el.reelCaption.value = rs.result.caption || '';
    setStatus(el.reelStatus, 'Último Reel processado carregado.', 'ok');
  }
  // defaults do planejador: amanhã, 18h
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
  el.planDate.value = tomorrow.toISOString().slice(0, 10);
  el.scheduleAt.value = isoToLocalInput(tomorrow.toISOString()).slice(0, 11) + '18:00';
  // retoma acompanhamento se um planejamento estiver rodando
  const s = await (await fetch('/api/plan/status')).json();
  if (s.running) {
    el.planBtn.disabled = true;
    pollPlanStatus();
  }
})();
