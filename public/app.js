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
  'runtimeStatus',
  'insightsSyncBtn', 'insightsClassifyBtn', 'insightsStatus', 'insightsMeta',
  'insightsSort', 'insightsFilter', 'insightsBody',
  'alertsBanner', 'overviewCards', 'accountTimelineChart', 'scoreMode',
  'scoreWeightSave', 'scoreWeightShare', 'scoreWeightEngagement', 'scoreWeightFollow',
  'scoreWeightViews', 'scoreMinReach', 'scoreSaveBtn', 'scoreStatus',
  'reportBtn', 'reportStatus', 'reportBox', 'reportHistory',
  'learningEnabled', 'learningStatus', 'learningPreview',
  'mineBtn', 'mineStatus', 'ideasList',
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
const STATUS_LABELS = {
  scheduled: 'agendado',
  publishing: 'publicando',
  published: 'publicado',
  error: 'erro',
  unknown: 'confirmar no Instagram',
};

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

async function loadRuntimeStatus() {
  try {
    const res = await fetch('/api/runtime');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const runtime = await res.json();
    const details = runtime.processing
      ? `Processando: ${runtime.currentStage || 'em andamento'}`
      : runtime.nextScheduledAt
        ? `Próximo: ${fmtDate(runtime.nextScheduledAt)}`
        : 'Nenhuma publicação agendada';
    el.runtimeStatus.textContent = runtime.batchRecoveryError
      ? `⚠ ${runtime.batchRecoveryError}`
      : `● Mac ativo · ${details}`;
    el.runtimeStatus.className = `runtime-status${runtime.batchRecoveryError ? ' warning' : ' ok'}`;
    el.runtimeStatus.title = runtime.batchRecoveryError || runtime.sleepWarning || '';
  } catch {
    el.runtimeStatus.textContent = '● Servidor local indisponível';
    el.runtimeStatus.className = 'runtime-status error';
  }
}

// ------------------------------------------------------------ abas

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab-page').forEach((p) =>
      p.classList.toggle('active', p.id === `tab-${btn.dataset.tab}`)
    );
    if (btn.dataset.tab === 'agenda') loadQueue();
    if (btn.dataset.tab === 'insights') loadInsights();
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
      <input type="datetime-local" value="${isoToLocalInput(item.scheduledAt)}" ${['published', 'publishing', 'unknown'].includes(item.status) ? 'disabled' : ''} />
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
  if (item.status === 'unknown') {
    setStatus(
      el.modalStatus,
      item.error || 'Confira se este post apareceu no Instagram antes de tentar novamente.',
      'error'
    );
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
    if (item.status !== 'publishing') addBtn('Publicar agora', '', async (e) => {
      if (item.status === 'unknown') {
        if (!confirm('Você conferiu o Instagram e confirmou que este post NÃO foi publicado?')) return;
        if (!confirm('Publicar novamente agora? Uma confirmação errada pode criar um post duplicado.')) return;
      }
      if (!confirm(`Publicar "${item.title}" no Instagram AGORA?`)) return;
      e.target.disabled = true;
      setStatus(el.modalStatus, 'Publicando...');
      const res = await fetch(`/api/queue/${item.id}/publish-now`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmUnknown: item.status === 'unknown' }),
      });
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

// ------------------------------------------------------------ análise (insights)

let insightsCache = [];
let insightsPoller = null;

let timelinesCache = {};
let accountTimelineCache = [];
let reportsCache = [];
let insightsSupportLoaded = false;

// Atalhos visuais. O cálculo e a validação definitivos acontecem no servidor.
const SCORE_PRESETS = {
  balanced: { saveRate: 3, shareRate: 3, engagementRate: 2, followRate: 3, viewsNorm: 1 },
  growth: { saveRate: 1, shareRate: 3, engagementRate: 1, followRate: 6, viewsNorm: 2 },
  authority: { saveRate: 5, shareRate: 4, engagementRate: 2, followRate: 1, viewsNorm: 0.5 },
};

function fillScoreForm(config) {
  if (!config?.weights) return;
  el.scoreMode.value = config.preset || 'custom';
  el.scoreWeightSave.value = config.weights.saveRate;
  el.scoreWeightShare.value = config.weights.shareRate;
  el.scoreWeightEngagement.value = config.weights.engagementRate;
  el.scoreWeightFollow.value = config.weights.followRate;
  el.scoreWeightViews.value = config.weights.viewsNorm;
  el.scoreMinReach.value = config.minReach;
}

function scoreFormPayload() {
  return {
    preset: el.scoreMode.value,
    minReach: Number(el.scoreMinReach.value),
    weights: {
      saveRate: Number(el.scoreWeightSave.value),
      shareRate: Number(el.scoreWeightShare.value),
      engagementRate: Number(el.scoreWeightEngagement.value),
      followRate: Number(el.scoreWeightFollow.value),
      viewsNorm: Number(el.scoreWeightViews.value),
    },
  };
}

function sparklineSVG(igId) {
  const points = (timelinesCache[igId] || []).filter((p) => p.views != null);
  if (points.length < 2) return '<span class="hint">—</span>';
  const w = 90, h = 24;
  const max = Math.max(...points.map((p) => p.views), 1);
  const min = Math.min(...points.map((p) => p.views));
  const range = Math.max(max - min, 1);
  const coords = points.map((p, i) =>
    `${(i / (points.length - 1)) * w},${h - 2 - ((p.views - min) / range) * (h - 4)}`).join(' ');
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <polyline points="${coords}" fill="none" stroke="#63d68a" stroke-width="1.5"/>
  </svg>`;
}

function renderAccountTimeline(points = accountTimelineCache) {
  if (!points || points.length < 2) {
    el.accountTimelineChart.innerHTML = '<span class="hint">O gráfico aparece depois de pelo menos dois snapshots.</span>';
    return;
  }
  const width = 900, height = 220, left = 42, right = 16, top = 18, bottom = 30;
  const times = points.map((point) => new Date(point.t).getTime());
  const minTime = Math.min(...times), maxTime = Math.max(...times);
  const values = points.flatMap((point) => [point.views || 0, point.reach || 0]);
  const observedMin = Math.min(...values), observedMax = Math.max(1, ...values);
  const observedRange = Math.max(observedMax - observedMin, 1);
  const minValue = Math.max(0, observedMin - observedRange * 0.1);
  const maxValue = observedMax + observedRange * 0.1;
  const x = (time) => left + ((time - minTime) / Math.max(maxTime - minTime, 1)) * (width - left - right);
  const y = (value) => top + (1 - (value - minValue) / Math.max(maxValue - minValue, 1)) * (height - top - bottom);
  const path = (key) => points.map((point, index) =>
    `${index ? 'L' : 'M'} ${x(new Date(point.t).getTime()).toFixed(1)} ${y(point[key] || 0).toFixed(1)}`
  ).join(' ');
  const grids = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const labelValue = minValue + (maxValue - minValue) * ratio;
    const gy = y(labelValue);
    return `<line x1="${left}" x2="${width - right}" y1="${gy}" y2="${gy}" class="chart-grid"/>
      <text x="${left - 8}" y="${gy + 4}" text-anchor="end" class="chart-label">${Math.round(labelValue)}</text>`;
  }).join('');
  const sameDay = new Date(minTime).toLocaleDateString('pt-BR') === new Date(maxTime).toLocaleDateString('pt-BR');
  const dateOptions = sameDay ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit' };
  const first = new Date(minTime).toLocaleString('pt-BR', dateOptions);
  const last = new Date(maxTime).toLocaleString('pt-BR', dateOptions);
  const latest = points[points.length - 1];
  el.accountTimelineChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolução de views e alcance">
      ${grids}
      <path d="${path('views')}" class="chart-line views"/>
      <path d="${path('reach')}" class="chart-line reach"/>
      <text x="${left}" y="${height - 7}" class="chart-label">${first}</text>
      <text x="${width - right}" y="${height - 7}" text-anchor="end" class="chart-label">${last}</text>
    </svg>
    <div class="timeline-latest">Agora: <strong>${latest.views || 0}</strong> views · <strong>${latest.reach || 0}</strong> alcance · ${latest.posts} posts fotografados</div>`;
}

async function loadAlerts() {
  const alerts = await (await fetch('/api/insights/alerts')).json();
  if (!alerts.length) {
    el.alertsBanner.hidden = true;
    return;
  }
  el.alertsBanner.hidden = false;
  el.alertsBanner.className = 'alerts-banner';
  el.alertsBanner.innerHTML = `
    <ul>${alerts.map((a) => `<li>${a.message.replace(/</g, '&lt;')}</li>`).join('')}</ul>
    <button class="icon-btn" id="alertsSeenBtn" title="Marcar como visto">✕</button>`;
  document.getElementById('alertsSeenBtn').addEventListener('click', async () => {
    await fetch('/api/insights/alerts/seen', { method: 'POST' });
    el.alertsBanner.hidden = true;
  });
}

function renderOverview(ov) {
  if (!ov || !ov.posts) {
    el.overviewCards.innerHTML = '';
    return;
  }
  const fmt = (n) => (n == null ? '—' : n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'k' : String(n));
  const cards = [
    [ov.posts, 'posts no banco'],
    [ov.posts30d, 'posts (30d)'],
    [fmt(ov.views), 'views totais'],
    [fmt(ov.reach), 'alcance total'],
    [fmt(ov.saves), 'saves'],
    [fmt(ov.follows), ov.followsKnownPosts === ov.followsTotalPosts
      ? 'seguidores de posts'
      : `seguidores (${ov.followsKnownPosts || 0}/${ov.followsTotalPosts || 0} posts)`],
    [ov.avgEngReels != null ? ov.avgEngReels + '%' : '—', 'eng médio reels'],
    [ov.avgEngFeed != null ? ov.avgEngFeed + '%' : '—', 'eng médio feed'],
  ];
  el.overviewCards.innerHTML = cards
    .map(([n, l]) => `<div class="ov-card"><div class="n">${n}</div><div class="l">${l}</div></div>`)
    .join('');
}

// Markdown mínimo e seguro para os relatórios gerados pela IA.
function miniMarkdown(md) {
  const esc = md.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const lines = esc.split('\n');
  let html = '', listType = '';
  const closeList = () => {
    if (!listType) return '';
    const close = `</${listType}>`;
    listType = '';
    return close;
  };
  for (const line of lines) {
    if (/^#\s/.test(line)) {
      html += closeList() + `<h1>${line.replace(/^#\s*/, '')}</h1>`;
    } else if (/^##\s/.test(line)) {
      html += closeList();
      html += `<h2>${line.replace(/^##\s*/, '')}</h2>`;
    } else if (/^###\s/.test(line)) {
      html += closeList() + `<h3>${line.replace(/^###\s*/, '')}</h3>`;
    } else if (/^[-*]\s/.test(line)) {
      if (listType !== 'ul') html += closeList() + '<ul>';
      listType = 'ul';
      html += `<li>${line.replace(/^[-*]\s*/, '')}</li>`;
    } else if (/^\d+\.\s/.test(line)) {
      if (listType !== 'ol') html += closeList() + '<ol>';
      listType = 'ol';
      html += `<li>${line.replace(/^\d+\.\s*/, '')}</li>`;
    } else if (/^---+$/.test(line.trim())) {
      html += closeList() + '<hr>';
    } else if (line.trim() === '') {
      html += closeList();
    } else {
      html += closeList() + `<p>${line}</p>`;
    }
  }
  html += closeList();
  return html
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+?)\*/g, '<em>$1</em>');
}

function showReport(report) {
  if (!report?.markdown) {
    el.reportBox.hidden = true;
    return;
  }
  el.reportBox.hidden = false;
  const period = report.periodStart
    ? ` · semana de ${new Date(report.periodStart).toLocaleDateString('pt-BR')}`
    : '';
  el.reportBox.innerHTML =
    `<div class="r-date">Gerado em ${fmtDate(report.generatedAt || report.at)}${period}</div>` + miniMarkdown(report.markdown);
}

function renderReportHistory(reports) {
  reportsCache = reports || [];
  if (!reportsCache.length) {
    el.reportHistory.innerHTML = '<option value="">Nenhum relatório</option>';
    showReport(null);
    return;
  }
  el.reportHistory.innerHTML = reportsCache.map((report) => {
    const label = `Semana de ${new Date(report.periodStart).toLocaleDateString('pt-BR')}`;
    return `<option value="${report.weekKey}">${label}</option>`;
  }).join('');
  showReport(reportsCache[0]);
}

function showLearning(state) {
  el.learningEnabled.checked = state.enabled !== false;
  if (state.text) {
    el.learningPreview.textContent = state.text;
    const postLabel = state.eligibleCount === 1 ? 'post tem' : 'posts têm';
    setStatus(el.learningStatus,
      `${state.eligibleCount} de ${state.totalCount} ${postLabel} alcance confiável e pode orientar o gerador.`, 'ok');
  } else {
    el.learningPreview.textContent = state.enabled === false
      ? 'Aprendizado desativado. O gerador usará somente o texto e o ângulo informados.'
      : `Ainda não há amostra suficiente: ${state.eligibleCount || 0} ${state.eligibleCount === 1 ? 'post elegível' : 'posts elegíveis'}; são necessários pelo menos 5.`;
    setStatus(el.learningStatus, '');
  }
}

function renderIdeas(payload, { announce = false } = {}) {
  const ideas = payload?.ideas || [];
  el.ideasList.innerHTML = '';
  for (const idea of ideas) {
    const card = document.createElement('div');
    card.className = 'idea-card';
    card.innerHTML = `
      <div>
        <div class="i-text">${idea.idea.replace(/</g, '&lt;')} <span class="tag">${idea.format}</span></div>
        <div class="i-evidence">${idea.evidence.replace(/</g, '&lt;')}</div>
      </div>
      <button class="secondary">Usar como ângulo</button>`;
    card.querySelector('button').addEventListener('click', () => {
      el.topic.value = idea.idea;
      switchTab('post');
      el.topic.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    el.ideasList.appendChild(card);
  }
  if (announce && ideas.length) {
    const failures = payload.failed ? ` · ${payload.failed} posts falharam na API` : '';
    setStatus(el.mineStatus, `${ideas.length} ideias extraídas de ${payload.comments} comentários${failures}.`, 'ok');
  }
}

async function loadInsights() {
  loadAlerts().catch(() => {});
  fetch('/api/insights/overview').then((r) => r.json()).then(renderOverview).catch(() => {});
  fetch('/api/insights/timelines').then((r) => r.json()).then((t) => { timelinesCache = t; renderInsights(); }).catch(() => {});
  fetch('/api/insights/account-timeline').then((r) => r.json()).then((points) => {
    accountTimelineCache = points;
    renderAccountTimeline();
  }).catch(() => {});

  if (!insightsSupportLoaded) {
    insightsSupportLoaded = true;
    fetch('/api/insights/score-config').then((r) => r.json()).then(fillScoreForm).catch(() => {});
    fetch('/api/insights/reports').then((r) => r.json()).then(renderReportHistory).catch(() => {});
    fetch('/api/insights/learning').then((r) => r.json()).then(showLearning).catch(() => {});
    fetch('/api/insights/comment-ideas').then((r) => r.json()).then((data) => renderIdeas(data)).catch(() => {});
  }

  const status = await (await fetch('/api/insights/status')).json();

  if (status.permissionError) {
    setStatus(el.insightsStatus,
      'O token atual não tem a permissão de métricas (instagram_business_manage_insights). ' +
      'No app da Meta: adicione a permissão, gere um token novo e troque no .env — a publicação continua funcionando.',
      'error');
  } else if (status.job?.running) {
    setStatus(el.insightsStatus, `Coletando... ${status.job.stage}`);
    if (!insightsPoller) insightsPoller = setInterval(loadInsights, 3000);
  } else {
    clearInterval(insightsPoller);
    insightsPoller = null;
    if (status.job?.error) setStatus(el.insightsStatus, `Erro na coleta: ${status.job.error}`, 'error');
    else setStatus(el.insightsStatus, '');
  }

  el.insightsMeta.textContent = status.mediaCount
    ? `${status.mediaCount} posts no banco (${status.appCount} publicados pelo app) · ${status.snapshotCount} snapshots acumulados · última coleta: ${status.lastSnapshotRun ? fmtDate(status.lastSnapshotRun) : 'nunca'} · coleta automática a cada 6h`
    : 'Nenhum dado ainda — clique em "Sincronizar agora".';

  const res = await fetch('/api/insights/summary');
  insightsCache = await res.json();
  renderInsights();
}

function renderInsights() {
  const sortKey = el.insightsSort.value;
  const filter = el.insightsFilter.value;

  let rows = insightsCache.filter((r) => !filter || (filter === 'REELS' ? r.productType === 'REELS' : r.productType !== 'REELS'));

  const val = (r) => {
    if (sortKey === 'postedAt') return r.postedAt || '';
    if (sortKey === 'score') return r.score ?? -1;
    if (['saveRate', 'shareRate', 'engagementRate', 'followRate'].includes(sortKey)) return r.rates[sortKey] ?? -1;
    return r.metrics[sortKey] ?? -1;
  };
  rows.sort((a, b) => {
    const aValue = val(a), bValue = val(b);
    return bValue === aValue ? 0 : bValue > aValue ? 1 : -1;
  });

  if (!rows.length) {
    el.insightsBody.innerHTML = '<tr><td colspan="9" class="hint">Nenhum dado — sincronize primeiro.</td></tr>';
    return;
  }

  // zeros viram cinza discreto; nulos viram "—" — só o sinal fica visível
  const fmt = (n) => (n == null ? '<span class="nil">—</span>' : n === 0 ? '<span class="zero">0</span>'
    : n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'k' : String(n));
  const pct = (n) => (n == null || n === 0 ? '<span class="nil">—</span>' : n.toFixed(2).replace(/\.?0+$/, '') + '%');
  const bestSave = Math.max(...rows.map((r) => r.rates.saveRate ?? 0));

  el.insightsBody.innerHTML = '';
  rows.forEach((r, i) => {
    const label = (r.hook || r.caption || `Reel de ${r.postedAt ? new Date(r.postedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '?'}`)
      .replace(/</g, '&lt;').slice(0, 60);
    const tipoIcon = r.productType === 'REELS' ? '🎬' : r.mediaType === 'CAROUSEL_ALBUM' ? '🖼' : '📷';
    const srcTag = r.source === 'app' ? '<span class="tag app">app</span>' : '';
    const themeTag = r.theme ? `<span class="tag">${r.theme.replace(/</g, '&lt;')}</span>` : '';
    const thumb = r.thumb
      ? `<img class="row-thumb" src="${r.thumb}" loading="lazy" alt="" />`
      : `<span class="row-thumb ph">${tipoIcon}</span>`;
    const delta = timelineDelta(r.igId);
    const scoreClass = r.score == null ? '' : r.score >= 60 ? 'score-hi' : r.score >= 30 ? 'score-mid' : 'score-low';

    const tr = document.createElement('tr');
    tr.className = `clickable ${i < 3 && sortKey !== 'postedAt' ? 'top-row' : ''}`;
    tr.innerHTML = `
      <td class="post-cell">
        <div class="post-flex">
          ${thumb}
          <div class="post-text">
            <span class="post-title" title="${label}">${tipoIcon} ${label}</span>
            <span class="post-tags">${srcTag}${themeTag}</span>
          </div>
        </div>
      </td>
      <td>${r.postedAt ? new Date(r.postedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—'}</td>
      <td>${sparklineSVG(r.igId)}${delta ? `<small class="delta">${delta}</small>` : ''}</td>
      <td class="score-cell">${r.score == null ? '<span class="nil">—</span>'
        : `<span class="score-pill ${scoreClass}" title="Score 0–100 ponderado pelo objetivo escolhido (${r.scoreConfidenceLabel || ''})">${r.score}</span>`}</td>
      <td>${fmt(r.metrics.views)}</td>
      <td>${fmt(r.metrics.reach)}</td>
      <td title="curtidas + comentários + shares + saves">${fmt(r.metrics.interactions)}</td>
      <td class="${r.rates.saveRate && r.rates.saveRate === bestSave ? 'best' : ''}">${pct(r.rates.saveRate)}</td>
      <td>${pct(r.rates.engagementRate)}</td>
    `;
    tr.addEventListener('click', () => openInsightModal(r));
    el.insightsBody.appendChild(tr);
  });
}

// variação de views nos últimos 7 dias (a partir dos nossos snapshots)
function timelineDelta(igId) {
  const points = (timelinesCache[igId] || []).filter((p) => p.views != null);
  if (points.length < 2) return '';
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const window = points.filter((p) => p.t >= cutoff);
  if (window.length < 2) return '';
  const diff = window[window.length - 1].views - window[0].views;
  return diff > 0 ? `+${diff} (7d)` : '';
}

// Modal de detalhe de um post da análise
function openInsightModal(r) {
  el.itemModal.hidden = false;
  const title = (r.hook || r.caption || 'Post').slice(0, 80);
  el.modalTitle.textContent = title;
  setStatus(el.modalStatus, '');

  const m = r.metrics, t = r.rates;
  const fmtV = (n, suffix = '') => (n == null ? '—' : `${n}${suffix}`);
  const cells = [
    ['Views', fmtV(m.views)], ['Alcance', fmtV(m.reach)],
    ['Curtidas', fmtV(m.likes)], ['Comentários', fmtV(m.comments)],
    ['Shares', fmtV(m.shares)], ['Saves', fmtV(m.saves)],
    ['Seguidores', fmtV(m.follows)],
    ['Tempo médio', m.avgWatchTime != null ? `${m.avgWatchTime.toFixed(1)}s` : '—'],
    ['Save rate', t.saveRate != null ? t.saveRate + '%' : '—'],
    ['Share rate', t.shareRate != null ? t.shareRate + '%' : '—'],
    ['Engajamento', t.engagementRate != null ? t.engagementRate + '%' : '—'],
    ['Conv. seguidores', t.followRate != null ? t.followRate + '%' : '—'],
  ];

  // curva grande de views
  const points = (timelinesCache[r.igId] || []).filter((p) => p.views != null);
  let chart = '<p class="hint">Ainda sem série temporal — os snapshots acumulam a cada 6h.</p>';
  if (points.length >= 2) {
    const w = 520, h = 120;
    const max = Math.max(...points.map((p) => p.views), 1);
    const min = Math.min(...points.map((p) => p.views));
    const range = Math.max(max - min, 1);
    const coords = points.map((p, i) =>
      `${(i / (points.length - 1)) * w},${h - 6 - ((p.views - min) / range) * (h - 12)}`).join(' ');
    chart = `<svg width="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="background:#0c0c0e;border:1px solid var(--border);border-radius:8px;">
      <polyline points="${coords}" fill="none" stroke="#63d68a" stroke-width="2"/>
    </svg>
    <p class="hint" style="text-align:right;">${points[0].views} → ${points[points.length - 1].views} views ${timelineDelta(r.igId) ? `(${timelineDelta(r.igId)})` : ''}</p>`;
  }

  const tags = [
    r.source === 'app' ? '<span class="tag app">publicado pelo app</span>' : '',
    r.theme ? `<span class="tag">${r.theme.replace(/</g, '&lt;')}</span>` : '',
    r.contentFormat ? `<span class="tag">hook: ${r.contentFormat.replace(/</g, '&lt;')}</span>` : '',
    r.style ? `<span class="tag">${r.style}</span>` : '',
  ].join(' ');

  el.modalBody.innerHTML = `
    <div class="insight-detail">
      ${r.thumb ? `<img class="detail-thumb" src="${r.thumb}" alt="" />` : ''}
      <div class="detail-main">
        <p class="hint" style="margin-top:0;">${r.productType === 'REELS' ? '🎬 Reel' : '🖼 Post de feed'} ·
          ${r.postedAt ? new Date(r.postedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
          ${r.score != null ? ` · score <strong>${r.score}</strong>` : ''}</p>
        <div class="detail-tags">${tags}</div>
        <div class="detail-grid">
          ${cells.map(([l, v]) => `<div class="d-cell"><div class="d-v">${v}</div><div class="d-l">${l}</div></div>`).join('')}
        </div>
      </div>
    </div>
    ${chart}
    ${r.caption ? `<div class="modal-caption">${r.caption.replace(/</g, '&lt;')}</div>` : ''}
  `;

  el.modalActions.innerHTML = '';
  const open = document.createElement('button');
  open.textContent = 'Abrir no Instagram';
  open.className = 'secondary';
  open.addEventListener('click', () => window.open(r.permalink, '_blank'));
  el.modalActions.appendChild(open);
}

el.scoreMode.addEventListener('change', () => {
  const preset = SCORE_PRESETS[el.scoreMode.value];
  if (!preset) return;
  el.scoreWeightSave.value = preset.saveRate;
  el.scoreWeightShare.value = preset.shareRate;
  el.scoreWeightEngagement.value = preset.engagementRate;
  el.scoreWeightFollow.value = preset.followRate;
  el.scoreWeightViews.value = preset.viewsNorm;
  setStatus(el.scoreStatus, 'Pesos preenchidos — salve para recalcular.', 'ok');
});

[
  el.scoreWeightSave, el.scoreWeightShare, el.scoreWeightEngagement,
  el.scoreWeightFollow, el.scoreWeightViews,
].forEach((input) => input.addEventListener('input', () => {
  el.scoreMode.value = 'custom';
  setStatus(el.scoreStatus, 'Pesos personalizados — salve para recalcular.', 'ok');
}));

el.scoreSaveBtn.addEventListener('click', async () => {
  el.scoreSaveBtn.disabled = true;
  setStatus(el.scoreStatus, 'Salvando e recalculando...');
  try {
    const res = await fetch('/api/insights/score-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scoreFormPayload()),
    });
    const config = await res.json();
    if (!res.ok) throw new Error(config.error);
    fillScoreForm(config);
    const [summaryRes, learningRes, overviewRes] = await Promise.all([
      fetch('/api/insights/summary'),
      fetch('/api/insights/learning'),
      fetch('/api/insights/overview'),
    ]);
    insightsCache = await summaryRes.json();
    showLearning(await learningRes.json());
    renderOverview(await overviewRes.json());
    renderInsights();
    setStatus(el.scoreStatus, 'Configuração salva. Scores recalculados.', 'ok');
  } catch (err) {
    setStatus(el.scoreStatus, err.message, 'error');
  } finally {
    el.scoreSaveBtn.disabled = false;
  }
});

el.reportHistory.addEventListener('change', () => {
  showReport(reportsCache.find((report) => report.weekKey === el.reportHistory.value));
});

el.reportBtn.addEventListener('click', async () => {
  el.reportBtn.disabled = true;
  setStatus(el.reportStatus, 'IA analisando teus dados e escrevendo o relatório...');
  try {
    const res = await fetch('/api/insights/report', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const reports = await (await fetch('/api/insights/reports')).json();
    renderReportHistory(reports);
    el.reportHistory.value = data.weekKey;
    showReport(data);
    setStatus(el.reportStatus, 'Relatório da semana salvo no histórico.', 'ok');
  } catch (err) {
    setStatus(el.reportStatus, err.message, 'error');
  } finally {
    el.reportBtn.disabled = false;
  }
});

el.learningEnabled.addEventListener('change', async () => {
  el.learningEnabled.disabled = true;
  try {
    const res = await fetch('/api/insights/learning', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: el.learningEnabled.checked }),
    });
    const state = await res.json();
    if (!res.ok) throw new Error(state.error);
    showLearning(state);
  } catch (err) {
    setStatus(el.learningStatus, err.message, 'error');
  } finally {
    el.learningEnabled.disabled = false;
  }
});

el.mineBtn.addEventListener('click', async () => {
  el.mineBtn.disabled = true;
  setStatus(el.mineStatus, 'Buscando comentários e minerando ideias...');
  try {
    const res = await fetch('/api/insights/mine-comments', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    if (!data.ideas.length) {
      setStatus(el.mineStatus, data.note || 'Nenhuma ideia extraída ainda.', 'ok');
      return;
    }
    renderIdeas(data, { announce: true });
  } catch (err) {
    setStatus(el.mineStatus, err.message, 'error');
  } finally {
    el.mineBtn.disabled = false;
  }
});

el.insightsSort.addEventListener('change', renderInsights);
el.insightsFilter.addEventListener('change', renderInsights);

el.insightsSyncBtn.addEventListener('click', async () => {
  const res = await fetch('/api/insights/sync', { method: 'POST' });
  if (res.status === 409) return;
  setStatus(el.insightsStatus, 'Coleta iniciada...');
  if (!insightsPoller) insightsPoller = setInterval(loadInsights, 3000);
});

el.insightsClassifyBtn.addEventListener('click', async () => {
  el.insightsClassifyBtn.disabled = true;
  setStatus(el.insightsStatus, 'Enriquecendo posts antigos (transcrição de ganchos + classificação)...');
  try {
    const res = await fetch('/api/insights/enrich', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const poll = setInterval(async () => {
      const s = await (await fetch('/api/insights/enrich/status')).json();
      if (s.running) {
        setStatus(el.insightsStatus, s.stage + (s.total ? ` [${s.done}/${s.total}]` : ''));
        return;
      }
      clearInterval(poll);
      el.insightsClassifyBtn.disabled = false;
      if (s.error) setStatus(el.insightsStatus, `Erro: ${s.error}`, 'error');
      else setStatus(el.insightsStatus, 'Posts enriquecidos — ganchos transcritos e classificados!', 'ok');
      loadInsights();
    }, 3000);
  } catch (err) {
    setStatus(el.insightsStatus, err.message, 'error');
    el.insightsClassifyBtn.disabled = false;
  }
});

// ------------------------------------------------------------ init

(async function init() {
  await loadMeta();
  await loadCarousel();
  await loadQueue();
  await loadRuntimeStatus();
  setInterval(loadRuntimeStatus, 15000);

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
