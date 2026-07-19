import test from 'node:test';
import assert from 'node:assert/strict';

import { recoverInterruptedPublications, runDuePublications } from '../lib/scheduler.mjs';

const now = () => new Date('2026-07-19T18:00:00.000Z');
const dueItem = {
  id: 'post-1',
  title: 'Post de teste',
  status: 'scheduled',
  scheduledAt: '2026-07-19T17:00:00.000Z',
};
const logger = { log() {}, error() {}, warn() {} };

test('marks an item publishing before calling the publisher', async () => {
  const transitions = [];
  let statusAtPublish = '';

  await runDuePublications({
    readQueue: async () => [dueItem],
    updateItem: async (_id, patch) => { transitions.push(patch.status); },
    publishItem: async () => {
      statusAtPublish = transitions.at(-1);
      return { id: 'ig-1', permalink: 'https://instagram.test/p/1' };
    },
    now,
    logger,
  });

  assert.equal(statusAtPublish, 'publishing');
  assert.deepEqual(transitions, ['publishing', 'published']);
});

test('turns interrupted publishing items into unknown at startup', async () => {
  const patches = [];

  await recoverInterruptedPublications({
    readQueue: async () => [{ ...dueItem, status: 'publishing' }],
    updateItem: async (id, patch) => { patches.push({ id, patch }); },
    logger,
  });

  assert.equal(patches.length, 1);
  assert.equal(patches[0].id, dueItem.id);
  assert.equal(patches[0].patch.status, 'unknown');
  assert.match(patches[0].patch.error, /Instagram/i);
});

test('publishes overdue scheduled items and ignores unknown items', async () => {
  let calls = 0;

  await runDuePublications({
    readQueue: async () => [dueItem, { ...dueItem, id: 'unknown', status: 'unknown' }],
    updateItem: async () => {},
    publishItem: async () => { calls++; return { id: 'ig-1' }; },
    now,
    logger,
  });

  assert.equal(calls, 1);
});

test('stores an ordinary publishing error', async () => {
  const patches = [];

  await runDuePublications({
    readQueue: async () => [dueItem],
    updateItem: async (_id, patch) => { patches.push(patch); },
    publishItem: async () => { throw new Error('serviço indisponível'); },
    now,
    logger,
  });

  assert.equal(patches.at(-1).status, 'error');
  assert.equal(patches.at(-1).error, 'serviço indisponível');
});

test('runs the external publication inside the awake guard', async () => {
  const events = [];

  await runDuePublications({
    readQueue: async () => [dueItem],
    updateItem: async () => {},
    publishItem: async () => { events.push('publish'); return { id: 'ig-1' }; },
    withAwake: async (task) => {
      events.push('awake-start');
      const result = await task();
      events.push('awake-stop');
      return result;
    },
    now,
    logger,
  });

  assert.deepEqual(events, ['awake-start', 'publish', 'awake-stop']);
});
