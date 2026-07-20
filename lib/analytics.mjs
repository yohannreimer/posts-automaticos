// Analytics: coleta métricas dos posts publicados no Instagram e acumula
// snapshots ao longo do tempo (a API só entrega totais do momento — a curva
// de crescimento é construída por NÓS, fotografando periodicamente).
//
// Banco: SQLite embutido do Node (node:sqlite), arquivo data/analytics.db.
// Somente leitura na API da Meta — nunca toca em publicação/fila.

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'analytics.db');

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
  `);
  return db;
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
  let params = { fields: 'id,media_type,media_product_type,permalink,caption,timestamp', limit: '50' };
  let count = 0;

  for (let page = 0; page < maxPages; page++) {
    const data = await ig(url, params);
    for (const m of data.data || []) {
      upsert.run(m.id, m.media_type || '', m.media_product_type || '', m.permalink || '', m.caption || '', m.timestamp || '');
      count++;
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

export function getSummary() {
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
    const interactions = m.total_interactions ??
      ((m.likes || 0) + (m.comments || 0) + (m.shares || 0) + (m.saves || 0) || null);
    return {
      igId: m.ig_id,
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

// Marca classificação da IA em posts externos (tema, tipo de hook, CTA).
export function saveClassification(igId, classify) {
  const database = getDB();
  const row = database.prepare('SELECT meta_json FROM media WHERE ig_id = ?').get(igId);
  if (!row) return;
  const meta = JSON.parse(row.meta_json || '{}');
  meta.classify = classify;
  database.prepare('UPDATE media SET meta_json = ? WHERE ig_id = ?').run(JSON.stringify(meta), igId);
}

export function getUnclassified(limit = 20) {
  const database = getDB();
  return database.prepare(`
    SELECT ig_id, caption FROM media
    WHERE caption != '' AND json_extract(meta_json, '$.classify') IS NULL
    ORDER BY posted_at DESC LIMIT ?
  `).all(limit);
}
