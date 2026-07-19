import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { nanoid } from 'nanoid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUEUE_FILE = path.join(__dirname, '..', 'data', 'queue.json');

// Item da fila:
// { id, title, scheduledAt (ISO), status: 'scheduled'|'published'|'error',
//   error, permalink, publishedAt, createdAt, carousel: {style, contentFormat, caption, slides} }

export async function readQueue() {
  if (!existsSync(QUEUE_FILE)) return [];
  try {
    return JSON.parse(await readFile(QUEUE_FILE, 'utf8'));
  } catch {
    return [];
  }
}

export async function writeQueue(queue) {
  await mkdir(path.dirname(QUEUE_FILE), { recursive: true });
  await writeFile(QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf8');
}

export function makePostTitle(carousel) {
  const cover = carousel.slides.find((s) => s.role === 'cover') || carousel.slides[0];
  const text = (cover?.text || 'Post sem título').replace(/\s+/g, ' ').trim();
  return text.length > 70 ? text.slice(0, 67) + '...' : text;
}

export function makeQueueItem(carousel, scheduledAt) {
  return {
    id: `p_${nanoid(8)}`,
    kind: 'carousel',
    title: makePostTitle(carousel),
    scheduledAt,
    status: 'scheduled',
    error: '',
    permalink: '',
    publishedAt: '',
    createdAt: new Date().toISOString(),
    carousel,
  };
}

export function makeReelQueueItem({ videoPath, caption, title }, scheduledAt) {
  return {
    id: `p_${nanoid(8)}`,
    kind: 'reel',
    title: `🎬 ${title || 'Reel'}`,
    scheduledAt,
    status: 'scheduled',
    error: '',
    permalink: '',
    publishedAt: '',
    createdAt: new Date().toISOString(),
    videoPath,
    caption: caption || '',
  };
}

export async function updateQueueItem(id, patch) {
  const queue = await readQueue();
  const idx = queue.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  queue[idx] = { ...queue[idx], ...patch };
  await writeQueue(queue);
  return queue[idx];
}
