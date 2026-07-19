import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';

import { createReelBatchStore } from '../lib/reel-batch.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'posts-reel-batch-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataDir = path.join(root, 'data');
  const reelsDir = path.join(dataDir, 'reels');
  const filePath = path.join(dataDir, 'reel-batch.json');
  await mkdir(reelsDir, { recursive: true });

  return {
    root,
    dataDir,
    reelsDir,
    filePath,
    async loadedStore(options = {}) {
      const store = createReelBatchStore({ filePath, reelsDir, now: () => 123456, ...options });
      await store.load();
      return store;
    },
  };
}

test('saves jobs atomically and reloads them', async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.reelsDir, 'source.mp4'), 'video');
  const store = await f.loadedStore();

  await store.upsert({ file: 'source.mp4', name: 'Source', status: 'queued', stage: 'na fila...' });
  await store.patch('source.mp4', { stage: 'transcrevendo...' });

  const reloaded = await f.loadedStore();
  assert.equal(reloaded.items.length, 1);
  assert.equal(reloaded.items[0].file, 'source.mp4');
  assert.equal(reloaded.items[0].stage, 'transcrevendo...');
  assert.equal((await readdir(f.dataDir)).some((name) => name.includes('.tmp-')), false);

  await reloaded.remove('source.mp4');
  assert.deepEqual(JSON.parse(await readFile(f.filePath, 'utf8')), []);
});

test('recovers processing jobs as queued when the source exists', async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.reelsDir, 'source.mp4'), 'video');
  await writeFile(f.filePath, JSON.stringify([
    { file: 'source.mp4', name: 'Source', status: 'processing', stage: 'transcrevendo...' },
  ]));

  const store = await f.loadedStore();

  assert.equal(store.items[0].status, 'queued');
  assert.match(store.items[0].stage, /retomar/i);
});

test('marks queued jobs with a missing source as error', async (t) => {
  const f = await fixture(t);
  await writeFile(f.filePath, JSON.stringify([
    { file: 'missing.mp4', name: 'Missing', status: 'queued' },
  ]));

  const store = await f.loadedStore();

  assert.equal(store.items[0].status, 'error');
  assert.match(store.items[0].error, /não foi encontrado/i);
});

test('keeps done jobs only when the final video exists', async (t) => {
  const f = await fixture(t);
  await writeFile(f.filePath, JSON.stringify([
    { file: 'source.mp4', name: 'Source', status: 'done', result: { file: 'final.mp4' } },
  ]));

  const store = await f.loadedStore();

  assert.equal(store.items[0].status, 'error');
  assert.match(store.items[0].error, /vídeo final/i);
});

test('preserves corrupt JSON and reports a recovery error', async (t) => {
  const f = await fixture(t);
  await writeFile(f.filePath, '{broken');

  const store = await f.loadedStore();
  const names = await readdir(f.dataDir);

  assert.match(store.recoveryError, /corrompida/i);
  assert.equal(store.items.length, 0);
  assert.equal(names.includes('reel-batch.json.corrupt-123456'), true);
});
