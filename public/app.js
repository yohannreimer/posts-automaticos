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
  'reelDrop', 'reelInput', 'reelBatchControls', 'reelStartDate', 'reelStartTime',
  'reelDistributeBtn', 'reelScheduleAllBtn', 'reelBatchStatus', 'reelBatchList',
  'itemModal', 'modalTitle', 'modalClose', 'modalBody', 'modalActions', 'modalStatus',
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
const STATUS_LABELS = { scheduled: 'agendado', published: 'publicado', error: 'erro' };

function setStatus(node, msg, type) {
  node.textContent = msg || '';
  node.className = 'status' + (type ? ` ${type}` : '');
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function isoToLocalInput(iso) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

// ------------------------------------------------------------ abas

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab-page').forEach((p) =>
      p.classList.toggle('active', p.id === `tab-${btn.dataset.tab}`)
    );
    if (btn.dataset.tab === 'agenda') loadQueue();
  });
});

function switchTab(name) {
  document.querySelector(`.tab-btn[data-tab="${name}"]`).click();
}

// ------------------------------------------------------------ carrossel (Criar post)

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
  iframe.style.transform = `scale(${wrap.clientWidth / 1080})`;
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
    role: 'content', variant: 'light', text: 'Novo slide',
    badge: '', eyebrow: '', signature: '', highlight: '', decoration: '',
  });
  await saveCarousel();
  renderSlides();
});

el.ytBtn.addEventListener('click', async () => {
  const url = el.ytUrl.value.trim();
  if (!url) return setStatus(el.ytStatus, 'Cole um link do YouTube primeiro.', 'error');
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
  if (!rawText) return setStatus(el.genStatus, 'Cole um texto primeiro.', 'error');
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
  if (!state.slides.length) return setStatus(el.exportStatus, 'Nenhum slide pra exportar.', 'error');
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
  if (!state.slides.length) return setStatus(el.publishStatus, 'Nenhum slide pra publicar.', 'error');
  const pub = state.meta.publish || {};
  if (!pub.instagram) {
    return setStatus(el.publishStatus, 'Configure as chaves do Instagram no .env (SETUP-INSTAGRAM.md) e reinicie.', 'error');
  }
  const cap = el.caption.value;
  const preview = cap.length > 300 ? cap.slice(0, 300) + '…\n\n[prévia cortada — a legenda completa será publicada]' : cap;
  if (!confirm(`Publicar ${state.slides.length} slide${state.slides.length > 1 ? 's' : ''} no Instagram agora?\n\nLegenda:\n${preview}`)) return;

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

el.scheduleBtn.addEventListener('click', async () => {
  if (!state.slides.length) return setStatus(el.publishStatus, 'Nenhum slide pra agendar.', 'error');
  if (!el.scheduleAt.value) return setStatus(el.publishStatus, 'Escolha data e hora do agendamento.', 'error');
  state.caption = el.caption.value;
  await saveCarousel();
  const res = await fetch('/api/queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scheduledAt: new Date(el.scheduleAt.value).toISOString() }),
  });
  const data = await res.json();
  if (!res.ok) return setStatus(el.publishStatus, data.error, 'error');
  setStatus(el.publishStatus, `Agendado para ${fmtDate(data.scheduledAt)}. Veja na aba Agenda.`, 'ok');
});

// ------------------------------------------------------------ planejador em lote

let planPoller = null;
function pollPlanStatus() {
  clearInterval(planPoller);
  planPoller = setInterval(async () => {
    const s = await (await fetch('/api/plan/status')).json();
    if (s.running) {
      setStatus(el.planStatus, `Gerando ${s.done}/${s.total}... ${s.currentTitle ? `(${s.currentTitle})` : ''}`);
    } else {
      clearInterval(planPoller);
      el.planBtn.disabled = false;
      if (s.error) setStatus(el.planStatus, `Erro: ${s.error}`, 'error');
      else if (s.total) setStatus(el.planStatus, `Pronto! ${s.total} posts agendados — veja na aba Agenda.`, 'ok');
    }
  }, 3000);
}

el.planBtn.addEventListener('click', async () => {
  const rawText = el.rawText.value.trim();
  if (!rawText) return setStatus(el.planStatus, 'Cole o texto de origem primeiro (caixa lá em cima).', 'error');
  if (!el.planDate.value) return setStatus(el.planStatus, 'Escolha a data inicial.', 'error');
  const count = Number(el.planCount.value) || 10;
  if (!confirm(`Gerar e agendar ${count} posts, 1 por dia a partir de ${el.planDate.value} às ${el.planTime.value}?\n\nIsso faz ${count + 1} chamadas à IA e pode levar alguns minutos.`)) return;

  el.planBtn.disabled = true;
  setStatus(el.planStatus, 'Planejando ângulos...');
  const res = await fetch('/api/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rawText, count,
      startDate: el.planDate.value,
      time: el.planTime.value,
      slideCount: Number(el.slideCount.value) || 8,
      author: el.author.value.trim(),
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    el.planBtn.disabled = false;
    return setStatus(el.planStatus, data.error, 'error');
  }
  pollPlanStatus();
});

// ------------------------------------------------------------ agenda

let queueCache = [];
let queueView = 'calendar';
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

el.viewListBtn.addEventListener('click', () => { queueView = 'list'; renderQueueViews(); });
el.viewCalBtn.addEventListener('click', () => { queueView = 'calendar'; renderQueueViews(); });
el.calPrev.addEventListener('click', () => { calMonth.setMonth(calMonth.getMonth() - 1); renderCalendar(queueCache); });
el.calNext.addEventListener('click', () => { calMonth.setMonth(calMonth.getMonth() + 1); renderCalendar(queueCache); });

function renderCalendar(queue) {
  const y = calMonth.getFullYear();
  const m = calMonth.getMonth();
  el.calLabel.textContent = calMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const byDay = {};
  for (const item of queue) {
    const d = new Date(item.scheduledAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
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
  start.setDate(1 - first.getDay());
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

    const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
    for (const item of byDay[key] || []) {
      const chip = document.createElement('div');
      chip.className = `cal-chip ${item.status}`;
      const hh = new Date(item.scheduledAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      chip.textContent = `${hh} ${item.title}`;
      chip.title = `${item.title} — clique para ver`;
      chip.addEventListener('click', () => openItemModal(item));
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
    row.innerHTML = `
      <span class="q-title" style="cursor:pointer" title="clique para ver">${item.title}</span>
      <span class="q-status ${item.status}" title="${item.error || ''}">${STATUS_LABELS[item.status] || item.status}</span>
      <input type="datetime-local" value="${isoToLocalInput(item.scheduledAt)}" ${item.status === 'published' ? 'disabled' : ''} />
      <button class="icon-btn danger" data-action="del" title="Remover">✕</button>
    `;
    row.querySelector('.q-title').addEventListener('click', () => openItemModal(item));
    row.querySelector('input').addEventListener('change', async (e) => {
      await fetch(`/api/queue/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt: new Date(e.target.value).toISOString(), status: 'scheduled' }),
      });
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

// ------------------------------------------------------------ modal de preview

function closeModal() {
  el.itemModal.hidden = true;
  el.modalBody.innerHTML = '';
  el.modalActions.innerHTML = '';
  setStatus(el.modalStatus, '');
}
el.modalClose.addEventListener('click', closeModal);
el.itemModal.addEventListener('click', (e) => { if (e.target === el.itemModal) closeModal(); });

function openItemModal(item) {
  el.itemModal.hidden = false;
  el.modalTitle.textContent = item.title;
  setStatus(el.modalStatus, '');

  // corpo
  if (item.kind === 'reel') {
    const file = item.videoPath ? item.videoPath.split('/').pop() : '';
    el.modalBody.innerHTML = `
      <video controls playsinline src="/reels/${file}"></video>
      <div class="modal-caption">${(item.caption || '(sem legenda)').replace(/</g, '&lt;')}</div>
    `;
  } else {
    const slides = item.carousel?.slides || [];
    el.modalBody.innerHTML = `
      <div class="modal-slides">
        ${slides.map((s, i) => `
          <div class="modal-slide"><iframe src="/api/queue/${item.id}/slide/${i}" loading="lazy"></iframe></div>
        `).join('')}
      </div>
      <div class="modal-caption">${(item.carousel?.caption || '(sem legenda)').replace(/</g, '&lt;')}</div>
    `;
  }

  // ações
  el.modalActions.innerHTML = '';
  const addBtn = (label, cls, fn) => {
    const b = document.createElement('button');
    b.textContent = label;
    if (cls) b.className = cls;
    b.addEventListener('click', fn);
    el.modalActions.appendChild(b);
    return b;
  };

  if (item.permalink) {
    addBtn('Abrir no Instagram', 'secondary', () => window.open(item.permalink, '_blank'));
  }
  if (item.status !== 'published') {
    if (item.kind !== 'reel') {
      addBtn('Abrir no editor', 'secondary', async () => {
        await fetch(`/api/queue/${item.id}/load`, { method: 'POST' });
        await loadCarousel();
        closeModal();
        switchTab('post');
      });
    }
    addBtn('Publicar agora', '', async (e) => {
      if (!confirm(`Publicar "${item.title}" no Instagram AGORA?`)) return;
      e.target.disabled = true;
      setStatus(el.modalStatus, 'Publicando...');
      const res = await fetch(`/api/queue/${item.id}/publish-now`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) setStatus(el.modalStatus, data.error, 'error');
      else {
        el.modalStatus.innerHTML = data.permalink
          ? `Publicado! <a href="${data.permalink}" target="_blank">${data.permalink}</a>` : 'Publicado!';
        el.modalStatus.className = 'status ok';
      }
      loadQueue();
    });
    addBtn('Remover', 'icon-btn danger', async () => {
      if (!confirm(`Remover "${item.title}" da agenda?`)) return;
      await fetch(`/api/queue/${item.id}`, { method: 'DELETE' });
      closeModal();
      loadQueue();
    });
  }
}

// ------------------------------------------------------------ reels em lote

let reelBatchCache = [];
let reelPoller = null;
const reelDates = {}; // file -> datetime-local value
const reelScheduled = new Set(); // arquivos já agendados nesta sessão

el.reelDrop.addEventListener('click', () => el.reelInput.click());
el.reelInput.addEventListener('change', async () => {
  const files = [...el.reelInput.files];
  if (!files.length) return;
  el.reelBatchControls.hidden = false;
  for (const f of files) {
    setStatus(el.reelBatchStatus, `Enviando ${f.name} (${(f.size / 1e6).toFixed(0)}MB)...`);
    const formData = new FormData();
    formData.append('video', f);
    const res = await fetch('/api/reels/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) {
      setStatus(el.reelBatchStatus, `${f.name}: ${data.error}`, 'error');
      continue;
    }
    await fetch('/api/reels/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: data.file, name: f.name }),
    });
  }
  setStatus(el.reelBatchStatus, 'Vídeos na fila de processamento.', 'ok');
  el.reelInput.value = '';
  startReelPolling();
});

function startReelPolling() {
  pollReelBatch();
  clearInterval(reelPoller);
  reelPoller = setInterval(pollReelBatch, 3000);
}

async function pollReelBatch() {
  const res = await fetch('/api/reels/batch');
  reelBatchCache = await res.json();
  renderReelBatch();
  if (!reelBatchCache.some((i) => i.status === 'queued' || i.status === 'processing')) {
    clearInterval(reelPoller);
    reelPoller = null;
  }
}

function renderReelBatch() {
  if (!reelBatchCache.length) {
    el.reelBatchList.innerHTML = '';
    return;
  }
  el.reelBatchControls.hidden = false;
  el.reelBatchList.innerHTML = '';

  for (const item of reelBatchCache) {
    const div = document.createElement('div');
    div.className = 'reel-item';
    const done = item.status === 'done' && item.result;
    const scheduled = reelScheduled.has(item.file);

    div.innerHTML = `
      ${done
        ? `<video controls playsinline src="/reels/${item.result.file}"></video>`
        : `<div class="placeholder">${item.status === 'error' ? '⚠️' : '⏳'}</div>`}
      <div>
        <div class="r-head">
          <span class="r-name">${item.name}</span>
          <span class="q-status ${item.status === 'done' ? (scheduled ? 'published' : 'scheduled') : item.status === 'error' ? 'error' : 'scheduled'}">
            ${item.status === 'queued' ? 'na fila' : item.status === 'processing' ? 'processando' : item.status === 'error' ? 'erro' : scheduled ? 'agendado ✓' : 'pronto'}
          </span>
        </div>
        ${item.status === 'processing' || item.status === 'queued' ? `<p class="hint">${item.stage || ''}</p>` : ''}
        ${item.status === 'error' ? `<p class="status error">${item.error}</p>` : ''}
        ${done ? `
          <label>Gancho (edite e reprocesse se quiser)</label>
          <div class="row">
            <input type="text" data-f="hook" value="${(item.result.hook || '').replace(/"/g, '&quot;')}" style="flex:3" />
            <button class="secondary inline" data-a="reproc" style="flex:1">Reprocessar</button>
          </div>
          <label>Legenda do post</label>
          <textarea data-f="caption">${item.result.caption || ''}</textarea>
          <div class="r-actions" style="margin-top:10px;">
            <input type="datetime-local" data-f="date" value="${reelDates[item.file] || ''}" />
            <button class="secondary" data-a="schedule" ${scheduled ? 'disabled' : ''}>Agendar</button>
            <button data-a="publish">Publicar agora</button>
            <button class="icon-btn danger" data-a="remove" title="Tirar da lista">✕</button>
          </div>
          <div class="status" data-f="status"></div>
        ` : ''}
      </div>
    `;

    if (done) {
      const $ = (sel) => div.querySelector(sel);
      $('[data-f="date"]').addEventListener('change', (e) => { reelDates[item.file] = e.target.value; });
      $('[data-a="reproc"]').addEventListener('click', async () => {
        await fetch('/api/reels/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: item.file, name: item.name, hookOverride: $('[data-f="hook"]').value.trim() }),
        });
        startReelPolling();
      });
      $('[data-a="schedule"]').addEventListener('click', async () => {
        const dateVal = $('[data-f="date"]').value;
        if (!dateVal) return setStatus($('[data-f="status"]'), 'Escolha a data.', 'error');
        const res = await fetch('/api/reels/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file: item.result.file,
            caption: $('[data-f="caption"]').value,
            title: $('[data-f="hook"]').value || item.result.hook,
            scheduledAt: new Date(dateVal).toISOString(),
          }),
        });
        const data = await res.json();
        if (!res.ok) return setStatus($('[data-f="status"]'), data.error, 'error');
        reelScheduled.add(item.file);
        setStatus($('[data-f="status"]'), `Agendado para ${fmtDate(data.scheduledAt)}.`, 'ok');
        renderReelBatch();
      });
      $('[data-a="publish"]').addEventListener('click', async (e) => {
        if (!confirm(`Publicar "${item.name}" no Instagram AGORA?`)) return;
        e.target.disabled = true;
        setStatus($('[data-f="status"]'), 'Publicando... (1-3 min)');
        const res = await fetch('/api/reels/publish-now', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: item.result.file, caption: $('[data-f="caption"]').value }),
        });
        const data = await res.json();
        const st = $('[data-f="status"]');
        if (!res.ok) { setStatus(st, data.error, 'error'); e.target.disabled = false; }
        else {
          st.innerHTML = data.permalink
            ? `Publicado! <a href="${data.permalink}" target="_blank">${data.permalink}</a>` : 'Publicado!';
          st.className = 'status ok';
        }
      });
      $('[data-a="remove"]').addEventListener('click', async () => {
        await fetch(`/api/reels/batch/${item.file}`, { method: 'DELETE' });
        pollReelBatch();
      });
    }
    el.reelBatchList.appendChild(div);
  }
}

el.reelDistributeBtn.addEventListener('click', () => {
  if (!el.reelStartDate.value) return setStatus(el.reelBatchStatus, 'Escolha a data inicial.', 'error');
  let d = new Date(`${el.reelStartDate.value}T${el.reelStartTime.value || '18:00'}`);
  for (const item of reelBatchCache) {
    if (item.status !== 'done' || reelScheduled.has(item.file)) continue;
    reelDates[item.file] = isoToLocalInput(d.toISOString());
    d = new Date(d.getTime() + 24 * 3600 * 1000);
  }
  renderReelBatch();
  setStatus(el.reelBatchStatus, 'Datas preenchidas — revise e clique em "Agendar todos os prontos".', 'ok');
});

el.reelScheduleAllBtn.addEventListener('click', async () => {
  const ready = reelBatchCache.filter((i) => i.status === 'done' && !reelScheduled.has(i.file) && reelDates[i.file]);
  if (!ready.length) return setStatus(el.reelBatchStatus, 'Nenhum reel pronto com data preenchida.', 'error');
  if (!confirm(`Agendar ${ready.length} reel${ready.length > 1 ? 's' : ''}?`)) return;
  let ok = 0;
  for (const item of ready) {
    const div = [...el.reelBatchList.children][reelBatchCache.indexOf(item)];
    const caption = div?.querySelector('[data-f="caption"]')?.value ?? item.result.caption;
    const hook = div?.querySelector('[data-f="hook"]')?.value ?? item.result.hook;
    const res = await fetch('/api/reels/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file: item.result.file, caption, title: hook,
        scheduledAt: new Date(reelDates[item.file]).toISOString(),
      }),
    });
    if (res.ok) { reelScheduled.add(item.file); ok++; }
  }
  renderReelBatch();
  setStatus(el.reelBatchStatus, `${ok} reels agendados — veja na aba Agenda.`, 'ok');
});

// ------------------------------------------------------------ init

(async function init() {
  await loadMeta();
  await loadCarousel();
  await loadQueue();

  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
  el.planDate.value = tomorrow.toISOString().slice(0, 10);
  el.reelStartDate.value = tomorrow.toISOString().slice(0, 10);
  el.scheduleAt.value = isoToLocalInput(tomorrow.toISOString()).slice(0, 11) + '18:00';

  const plan = await (await fetch('/api/plan/status')).json();
  if (plan.running) {
    el.planBtn.disabled = true;
    pollPlanStatus();
  }
  const batch = await (await fetch('/api/reels/batch')).json();
  if (batch.length) {
    reelBatchCache = batch;
    renderReelBatch();
    if (batch.some((i) => i.status === 'queued' || i.status === 'processing')) startReelPolling();
  }
})();
