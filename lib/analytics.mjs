// Analytics: coleta métricas dos posts publicados no Instagram e acumula
// snapshots ao longo do tempo (a API só entrega totais do momento — a curva
// de crescimento é construída por NÓS, fotografando periodicamente).
//
// Banco: SQLite embutido do Node (node:sqlite), arquivo data/analytics.db.
// Somente leitura na API da Meta — nunca toca em publicação/fila.

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import {
  DEFAULT_SCORE_CONFIG,
  sanitizeScoreConfig,
  scoreSummary,
  buildLearningContext,
} from './insights-score.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.ANALYTICS_DB_PATH || path.join(__dirname, '..', 'data', 'analytics.db');
export const THUMBS_DIR = path.join(path.dirname(DB_PATH), 'thumbs');

const BASE = process.env.IG_GRAPH_BASE || 'https://graph.instagram.com/v21.0';

let db = null;
export function getDB() {
  if (db) return db;
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS media (
      ig_id TEXT PRIMARY KEY,
      media_type TEXT,
      product_type TEXT,
      permalink TEXT,
      caption TEXT,
      posted_at TEXT,
      source TEXT DEFAULT 'external',
      meta_json TEXT DEFAULT '{}',
      duration REAL DEFAULT 0,
      last_snapshot_at TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ig_id TEXT NOT NULL,
      taken_at TEXT NOT NULL,
      views INTEGER, reach INTEGER, likes INTEGER, comments INTEGER,
      shares INTEGER, saves INTEGER, total_interactions INTEGER, follows INTEGER,
      avg_watch_time REAL, total_watch_time REAL,
      raw_json TEXT DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_snap_media ON snapshots(ig_id, taken_at);
    CREATE TABLE IF NOT EXISTS meta_kv (k TEXT PRIMARY KEY, v TEXT);
    CREATE TABLE IF NOT EXISTS weekly_reports (
      week_key TEXT PRIMARY KEY,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      markdown TEXT NOT NULL,
      data_json TEXT DEFAULT '{}'
    );
  `);

  // Preserva o relatório único criado pela versão anterior à tabela histórica.
  const reportCount = db.prepare('SELECT COUNT(*) AS c FROM weekly_reports').get().c;
  const legacyReport = reportCount === 0
    ? db.prepare("SELECT v FROM meta_kv WHERE k = 'last_report'").get()
    : null;
  if (legacyReport?.v) {
    try {
      const parsed = JSON.parse(legacyReport.v);
      if (parsed.markdown) {
        const generatedAt = parsed.at || new Date().toISOString();
        const period = getWeeklyPeriod(new Date(generatedAt));
        db.prepare(`
          INSERT OR IGNORE INTO weekly_reports
            (week_key, period_start, period_end, generated_at, markdown, data_json)
          VALUES (?, ?, ?, ?, ?, '{}')
        `).run(period.weekKey, period.periodStart, period.periodEnd, generatedAt, parsed.markdown);
      }
    } catch {
      // KV legado corrompido não impede a abertura do analytics.
    }
  }
  return db;
}

export function closeAnalyticsDB() {
  if (!db) return;
  db.close();
  db = null;
}

function kvGet(key, fallback = '') {
  const row = getDB().prepare('SELECT v FROM meta_kv WHERE k = ?').get(key);
  return row ? row.v : fallback;
}
function kvSet(key, value) {
  getDB().prepare('INSERT INTO meta_kv(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(key, String(value));
}

// ---------------------------------------------------------------- API da Meta

async function ig(pathname, params = {}) {
  const url = new URL(`${BASE}/${pathname}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', process.env.IG_ACCESS_TOKEN);
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const err = new Error(data.error?.message || `HTTP ${res.status}`);
    err.igCode = data.error?.code;
    throw err;
  }
  return data;
}

function isPermissionError(err) {
  return /permission|#10\b|#100.*metric|not authorized/i.test(err.message || '');
}

// ---------------------------------------------------------------- sync de mídia

// Puxa a lista de posts publicados (paginado) e faz upsert no banco.
export async function syncMedia({ maxPages = 6 } = {}) {
  const database = getDB();
  const upsert = database.prepare(`
    INSERT INTO media (ig_id, media_type, product_type, permalink, caption, posted_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(ig_id) DO UPDATE SET
      permalink = excluded.permalink,
      caption = excluded.caption
  `);

  let url = `${process.env.IG_USER_ID}/media`;
  let params = { fields: 'id,media_type,media_product_type,permalink,caption,timestamp,thumbnail_url,media_url', limit: '50' };
  let count = 0;

  mkdirSync(THUMBS_DIR, { recursive: true });
  for (let page = 0; page < maxPages; page++) {
    const data = await ig(url, params);
    for (const m of data.data || []) {
      upsert.run(m.id, m.media_type || '', m.media_product_type || '', m.permalink || '', m.caption || '', m.timestamp || '');
      count++;
      // miniatura local (as URLs do CDN da Meta expiram — baixamos uma vez)
      const thumbFile = path.join(THUMBS_DIR, `${m.id}.jpg`);
      const thumbUrl = m.thumbnail_url || (m.media_type !== 'VIDEO' ? m.media_url : '');
      if (thumbUrl && !existsSync(thumbFile)) {
        try {
          const res = await fetch(thumbUrl);
          if (res.ok) writeFileSync(thumbFile, Buffer.from(await res.arrayBuffer()));
        } catch {
          // sem miniatura não é fatal
        }
      }
    }
    const next = data.paging?.next;
    if (!next) break;
    // paging.next é URL completa com token; reusa só o cursor
    const cursor = new URL(next).searchParams.get('after');
    if (!cursor) break;
    params = { ...params, after: cursor };
  }
  kvSet('last_media_sync', new Date().toISOString());
  return count;
}

// Vincula posts publicados pelo app (fila) à mídia do Instagram, herdando a
// metadata rica (hook, estilo, slides, transcrição...).
export function linkQueueMetadata(queue) {
  const database = getDB();
  const byPermalink = database.prepare('SELECT ig_id FROM media WHERE permalink = ?');
  const setMeta = database.prepare('SELECT meta_json FROM media WHERE ig_id = ?');
  const update = database.prepare('UPDATE media SET source = ?, meta_json = ?, duration = ? WHERE ig_id = ?');

  let linked = 0;
  for (const item of queue) {
    if (item.status !== 'published' || !item.permalink) continue;
    const row = byPermalink.get(item.permalink);
    if (!row) continue;
    const existing = JSON.parse(setMeta.get(row.ig_id)?.meta_json || '{}');
    if (existing.linked) continue;

    const meta = { linked: true, kind: item.kind || 'carousel', title: item.title || '' };
    let duration = 0;
    if (item.kind === 'reel') {
      meta.caption = item.caption || '';
      meta.hook = (item.title || '').replace(/^🎬\s*/, '');
    } else if (item.carousel) {
      meta.style = item.carousel.style;
      meta.contentFormat = item.carousel.contentFormat || '';
      meta.slideCount = item.carousel.slides?.length || 0;
      meta.hook = item.carousel.slides?.find((s) => s.role === 'cover')?.text || '';
      meta.caption = item.carousel.caption || '';
    }
    update.run('app', JSON.stringify({ ...existing, ...meta }), duration, row.ig_id);
    linked++;
  }
  return linked;
}

// ---------------------------------------------------------------- insights

// Conjuntos de métricas por tipo. Se a API rejeitar o lote (métrica não
// suportada pro formato/conta), caímos pro modo métrica-a-métrica e
// memorizamos o que funciona.
const METRICS = {
  REELS: ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions', 'ig_reels_avg_watch_time', 'ig_reels_video_view_total_time'],
  FEED: ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions', 'follows'],
};

const supportedCache = {}; // product_type -> lista confirmada

async function fetchInsights(igId, productType) {
  const wanted = supportedCache[productType] || METRICS[productType] || METRICS.FEED;
  const parse = (data) => {
    const out = {};
    for (const item of data.data || []) {
      const v = item.values?.[0]?.value;
      if (v !== undefined && v !== null && typeof v !== 'object') out[item.name] = Number(v);
    }
    return out;
  };

  try {
    const data = await ig(`${igId}/insights`, { metric: wanted.join(',') });
    supportedCache[productType] = wanted;
    return parse(data);
  } catch (err) {
    if (isPermissionError(err) && !/metric/i.test(err.message)) throw err;
    // lote rejeitado: descobre métrica a métrica
    const ok = [];
    const out = {};
    for (const m of wanted) {
      try {
        const data = await ig(`${igId}/insights`, { metric: m });
        Object.assign(out, parse(data));
        ok.push(m);
      } catch {
        // métrica não existe pra esse formato — segue
      }
    }
    if (ok.length) supportedCache[productType] = ok;
    return out;
  }
}

// Fotografa métricas: posts recentes (<60d) toda rodada; antigos 1x/semana.
export async function snapshotAll({ log = () => {} } = {}) {
  const database = getDB();
  const now = new Date();
  const cutoffRecent = new Date(now - 60 * 24 * 3600 * 1000).toISOString();
  const cutoffWeekly = new Date(now - 7 * 24 * 3600 * 1000).toISOString();

  const targets = database.prepare(`
    SELECT ig_id, product_type, posted_at, last_snapshot_at FROM media
    WHERE posted_at >= ? OR last_snapshot_at < ? OR last_snapshot_at = ''
    ORDER BY posted_at DESC LIMIT 300
  `).all(cutoffRecent, cutoffWeekly);

  const insert = database.prepare(`
    INSERT INTO snapshots (ig_id, taken_at, views, reach, likes, comments, shares, saves,
      total_interactions, follows, avg_watch_time, total_watch_time, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const touch = database.prepare('UPDATE media SET last_snapshot_at = ? WHERE ig_id = ?');

  let done = 0, failed = 0, permissionError = '';
  for (const t of targets) {
    try {
      const productType = t.product_type === 'REELS' ? 'REELS' : 'FEED';
      const m = await fetchInsights(t.ig_id, productType);
      insert.run(
        t.ig_id, now.toISOString(),
        m.views ?? null, m.reach ?? null, m.likes ?? null, m.comments ?? null,
        m.shares ?? null, m.saved ?? null, m.total_interactions ?? null, m.follows ?? null,
        m.ig_reels_avg_watch_time != null ? m.ig_reels_avg_watch_time / 1000 : null,
        m.ig_reels_video_view_total_time != null ? m.ig_reels_video_view_total_time / 1000 : null,
        JSON.stringify(m)
      );
      touch.run(now.toISOString(), t.ig_id);
      done++;
    } catch (err) {
      failed++;
      if (isPermissionError(err)) {
        permissionError = err.message;
        break; // sem permissão, não adianta insistir nos outros
      }
      log(`[analytics] falha em ${t.ig_id}: ${err.message}`);
    }
  }
  kvSet('last_snapshot_run', now.toISOString());
  if (permissionError) kvSet('permission_error', permissionError);
  else kvSet('permission_error', '');
  return { done, failed, permissionError };
}

// ---------------------------------------------------------------- resumo

function rate(a, b) {
  return a != null && b ? Math.round((a / b) * 10000) / 100 : null; // %
}

function getRawSummary() {
  const database = getDB();
  const media = database.prepare(`
    SELECT m.*, s.views, s.reach, s.likes, s.comments, s.shares, s.saves,
           s.total_interactions, s.follows, s.avg_watch_time, s.total_watch_time, s.taken_at
    FROM media m
    LEFT JOIN snapshots s ON s.id = (
      SELECT id FROM snapshots WHERE ig_id = m.ig_id ORDER BY taken_at DESC LIMIT 1
    )
    ORDER BY m.posted_at DESC
  `).all();

  return media.map((m) => {
    const meta = JSON.parse(m.meta_json || '{}');
    const interactionParts = [m.likes, m.comments, m.shares, m.saves];
    const fallbackInteractions = interactionParts.some((value) => value != null)
      ? interactionParts.reduce((total, value) => total + (value || 0), 0)
      : null;
    const interactions = m.total_interactions ?? fallbackInteractions;
    return {
      igId: m.ig_id,
      thumb: existsSync(path.join(THUMBS_DIR, `${m.ig_id}.jpg`)) ? `/thumbs/${m.ig_id}.jpg` : '',
      permalink: m.permalink,
      postedAt: m.posted_at,
      productType: m.product_type,
      mediaType: m.media_type,
      source: m.source,
      caption: (m.caption || '').slice(0, 120),
      hook: meta.hook || '',
      style: meta.style || '',
      contentFormat: meta.contentFormat || meta.classify?.hook_type || '',
      theme: meta.classify?.theme || '',
      snapshotAt: m.taken_at || '',
      metrics: {
        views: m.views, reach: m.reach, likes: m.likes, comments: m.comments,
        shares: m.shares, saves: m.saves, interactions, follows: m.follows,
        avgWatchTime: m.avg_watch_time,
      },
      rates: {
        saveRate: rate(m.saves, m.reach),
        shareRate: rate(m.shares, m.reach),
        engagementRate: rate(interactions, m.reach),
        followRate: rate(m.follows, m.reach),
      },
    };
  });
}

export function getSummary() {
  return scoreSummary(getRawSummary(), getScoreConfig());
}

export function getStatus() {
  const database = getDB();
  const mediaCount = database.prepare('SELECT COUNT(*) AS c FROM media').get().c;
  const appCount = database.prepare("SELECT COUNT(*) AS c FROM media WHERE source = 'app'").get().c;
  const snapCount = database.prepare('SELECT COUNT(*) AS c FROM snapshots').get().c;
  return {
    mediaCount,
    appCount,
    snapshotCount: snapCount,
    lastMediaSync: kvGet('last_media_sync'),
    lastSnapshotRun: kvGet('last_snapshot_run'),
    permissionError: kvGet('permission_error'),
  };
}

// Reels sem texto nenhum (nem hook, nem legenda) — candidatos a transcrição.
export function getReelsNeedingHook(limit = 30) {
  const rows = getDB().prepare(`
    SELECT ig_id, meta_json FROM media
    WHERE product_type = 'REELS' AND (caption IS NULL OR caption = '')
    ORDER BY posted_at DESC LIMIT ?
  `).all(limit);
  return rows
    .filter((r) => !JSON.parse(r.meta_json || '{}').hook)
    .map((r) => r.ig_id);
}

// Busca a URL do vídeo na hora (as URLs do CDN expiram; não adianta guardar).
export async function fetchMediaUrl(igId) {
  const data = await ig(igId, { fields: 'media_url' });
  return data.media_url || '';
}

export function saveHook(igId, hook) {
  const database = getDB();
  const row = database.prepare('SELECT meta_json FROM media WHERE ig_id = ?').get(igId);
  if (!row) return;
  const meta = JSON.parse(row.meta_json || '{}');
  meta.hook = hook;
  meta.hookSource = 'whisper';
  database.prepare('UPDATE media SET meta_json = ? WHERE ig_id = ?').run(JSON.stringify(meta), igId);
}

// Marca classificação da IA em posts externos (tema, tipo de hook, CTA).
export function saveClassification(igId, classify) {
  const database = getDB();
  const row = database.prepare('SELECT meta_json FROM media WHERE ig_id = ?').get(igId);
  if (!row) return;
  const meta = JSON.parse(row.meta_json || '{}');
  meta.classify = classify;
  database.prepare('UPDATE media SET meta_json = ? WHERE ig_id = ?').run(JSON.stringify(meta), igId);
}

// ---------------------------------------------------------------- fase 2/3

// Série temporal de um post (pra curvas de crescimento).
export function getTimelines() {
  const database = getDB();
  const rows = database.prepare(`
    SELECT ig_id, taken_at, views, reach FROM snapshots ORDER BY taken_at ASC
  `).all();
  const out = {};
  for (const r of rows) {
    (out[r.ig_id] = out[r.ig_id] || []).push({ t: r.taken_at, views: r.views, reach: r.reach });
  }
  return out;
}

// Evolução agregada da conta. Quando uma rodada não fotografa um post antigo,
// carrega o último valor conhecido pra frente em vez de criar uma queda falsa.
export function getAccountTimeline() {
  const rows = getDB().prepare(`
    SELECT ig_id, taken_at, views, reach FROM snapshots ORDER BY taken_at ASC, id ASC
  `).all();
  const byTime = new Map();
  for (const row of rows) {
    if (!byTime.has(row.taken_at)) byTime.set(row.taken_at, []);
    byTime.get(row.taken_at).push(row);
  }

  const latest = new Map();
  const timeline = [];
  for (const [takenAt, updates] of byTime) {
    for (const row of updates) latest.set(row.ig_id, row);
    let views = 0, reach = 0;
    for (const row of latest.values()) {
      views += row.views || 0;
      reach += row.reach || 0;
    }
    timeline.push({ t: takenAt, views, reach, posts: latest.size });
  }
  return timeline;
}

export function getScoreConfig() {
  const raw = kvGet('score_config');
  if (!raw) return sanitizeScoreConfig(DEFAULT_SCORE_CONFIG);
  try {
    return sanitizeScoreConfig(JSON.parse(raw));
  } catch {
    return sanitizeScoreConfig(DEFAULT_SCORE_CONFIG);
  }
}

export function saveScoreConfig(input = {}) {
  const current = getScoreConfig();
  const config = sanitizeScoreConfig({
    ...current,
    ...input,
    weights: { ...current.weights, ...(input.weights || {}) },
  });
  kvSet('score_config', JSON.stringify(config));
  return config;
}

// Visão geral da conta a partir dos últimos snapshots.
export function getOverview() {
  const database = getDB();
  const rows = database.prepare(`
    SELECT m.product_type, m.posted_at, s.views, s.reach, s.likes, s.comments, s.shares, s.saves, s.follows
    FROM media m
    JOIN snapshots s ON s.id = (SELECT id FROM snapshots WHERE ig_id = m.ig_id ORDER BY taken_at DESC LIMIT 1)
  `).all();

  const sum = (arr, k) => arr.reduce((a, r) => a + (r[k] || 0), 0);
  const sumKnown = (arr, k) => {
    const known = arr.filter((row) => row[k] != null);
    return known.length ? sum(known, k) : null;
  };
  const last30 = rows.filter((r) => r.posted_at >= new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString());
  const reels = rows.filter((r) => r.product_type === 'REELS');
  const feed = rows.filter((r) => r.product_type !== 'REELS');
  const avgEng = (arr) => {
    const minReach = getScoreConfig().minReach;
    const withReach = arr.filter((r) => r.reach >= minReach);
    if (!withReach.length) return null;
    const interactions = withReach.reduce((a, r) => a + (r.likes || 0) + (r.comments || 0) + (r.shares || 0) + (r.saves || 0), 0);
    const reach = sum(withReach, 'reach');
    return reach ? Math.round((interactions / reach) * 10000) / 100 : null;
  };

  return {
    posts: rows.length,
    posts30d: last30.length,
    views: sum(rows, 'views'),
    reach: sum(rows, 'reach'),
    saves: sum(rows, 'saves'),
    shares: sum(rows, 'shares'),
    follows: sumKnown(rows, 'follows'),
    followsKnownPosts: rows.filter((row) => row.follows != null).length,
    followsTotalPosts: rows.length,
    avgEngReels: avgEng(reels),
    avgEngFeed: avgEng(feed),
  };
}

// Aprendizados da conta em texto — injetado nos prompts de geração pra
// calibrar o conteúdo novo pelo que JÁ funcionou com a tua audiência.
export function getLearnings() {
  return getLearningState().text;
}

export function getLearningState() {
  const enabled = kvGet('learning_enabled', 'true') !== 'false';
  return {
    enabled,
    ...buildLearningContext(getRawSummary(), getScoreConfig(), { enabled }),
  };
}

export function setLearningEnabled(enabled) {
  kvSet('learning_enabled', enabled ? 'true' : 'false');
  return getLearningState();
}

export function getWeeklyPeriod(reference = new Date()) {
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const weekKey = [start.getFullYear(), String(start.getMonth() + 1).padStart(2, '0'), String(start.getDate()).padStart(2, '0')].join('-');
  return { weekKey, periodStart: start.toISOString(), periodEnd: end.toISOString() };
}

export function saveWeeklyReport({ weekKey, periodStart, periodEnd, generatedAt, markdown, data = {} }) {
  getDB().prepare(`
    INSERT INTO weekly_reports (week_key, period_start, period_end, generated_at, markdown, data_json)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(week_key) DO UPDATE SET
      period_start = excluded.period_start,
      period_end = excluded.period_end,
      generated_at = excluded.generated_at,
      markdown = excluded.markdown,
      data_json = excluded.data_json
  `).run(weekKey, periodStart, periodEnd, generatedAt, markdown, JSON.stringify(data));
  const row = getDB().prepare(`
    SELECT week_key, period_start, period_end, generated_at, markdown, data_json
    FROM weekly_reports WHERE week_key = ?
  `).get(weekKey);
  return mapWeeklyReport(row);
}

function mapWeeklyReport(row) {
  if (!row) return null;
  let data = {};
  try { data = JSON.parse(row.data_json || '{}'); } catch { /* mantém relatório legível */ }
  return {
    weekKey: row.week_key,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    generatedAt: row.generated_at,
    at: row.generated_at,
    markdown: row.markdown,
    data,
  };
}

export function getWeeklyReports(limit = 12) {
  return getDB().prepare(`
    SELECT week_key, period_start, period_end, generated_at, markdown, data_json
    FROM weekly_reports ORDER BY period_start DESC LIMIT ?
  `).all(Math.max(1, Math.min(Number(limit) || 12, 52))).map(mapWeeklyReport);
}

export function getLatestWeeklyReport() {
  return getWeeklyReports(1)[0] || { weekKey: '', periodStart: '', periodEnd: '', generatedAt: '', at: '', markdown: '', data: {} };
}

// Alertas de decolagem: post recente performando muito acima da mediana.
export function checkAlerts() {
  const database = getDB();
  database.exec(`CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ig_id TEXT, created_at TEXT, message TEXT, seen INTEGER DEFAULT 0
  )`);
  const summary = getSummary();
  const old = summary
    .filter((r) => r.postedAt < new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
    .map((r) => r.metrics.views || 0)
    .sort((a, b) => a - b);
  if (old.length < 3) return [];
  const median = old[Math.floor(old.length / 2)] || 0;

  const created = [];
  const recent = summary.filter((r) => r.postedAt >= new Date(Date.now() - 72 * 3600 * 1000).toISOString());
  const exists = database.prepare('SELECT 1 FROM alerts WHERE ig_id = ?');
  const insert = database.prepare('INSERT INTO alerts (ig_id, created_at, message) VALUES (?, ?, ?)');
  for (const r of recent) {
    const v = r.metrics.views || 0;
    if (v >= Math.max(100, median * 3) && !exists.get(r.igId)) {
      const msg = `🚀 Post decolando: ${v} views (${Math.round(v / Math.max(median, 1))}x a mediana da conta) — "${(r.hook || r.caption || '').slice(0, 60)}". Aproveita: responde comentários e compartilha no story.`;
      insert.run(r.igId, new Date().toISOString(), msg);
      created.push(msg);
    }
  }
  return created;
}

export function getAlerts() {
  const database = getDB();
  database.exec(`CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ig_id TEXT, created_at TEXT, message TEXT, seen INTEGER DEFAULT 0
  )`);
  return database.prepare('SELECT * FROM alerts WHERE seen = 0 ORDER BY created_at DESC LIMIT 10').all();
}

export function markAlertsSeen() {
  getDB().prepare('UPDATE alerts SET seen = 1').run();
}

// Comentários dos posts recentes (pra mineração de ideias).
export async function fetchRecentComments({ mediaLimit = 10, perMedia = 50 } = {}) {
  const database = getDB();
  const media = database.prepare(`
    SELECT ig_id, caption FROM media ORDER BY posted_at DESC LIMIT ?
  `).all(mediaLimit);

  const all = [];
  let failed = 0;
  let lastError = '';
  for (const m of media) {
    try {
      const data = await ig(`${m.ig_id}/comments`, { fields: 'text,like_count,username', limit: String(perMedia) });
      for (const c of data.data || []) {
        if (c.text) all.push({ post: (m.caption || '').slice(0, 60), text: c.text, likes: c.like_count || 0 });
      }
    } catch (err) {
      failed++;
      lastError = err.message || 'erro desconhecido';
    }
  }
  return { comments: all, attempted: media.length, failed, lastError };
}

export function kvGetPublic(key) { return kvGet(key); }
export function kvSetPublic(key, value) { kvSet(key, value); }

export function getUnclassified(limit = 20) {
  const database = getDB();
  return database.prepare(`
    SELECT ig_id, caption FROM media
    WHERE caption != '' AND json_extract(meta_json, '$.classify') IS NULL
    ORDER BY posted_at DESC LIMIT ?
  `).all(limit);
}
