import test from 'node:test';
import assert from 'node:assert/strict';

import { createAwakeGuard } from '../lib/mac-awake.mjs';

test('starts caffeinate on macOS and kills it after work', async () => {
  let command = '';
  let args = [];
  let killed = false;
  const withAwake = createAwakeGuard({
    platform: 'darwin',
    spawnProcess: (cmd, receivedArgs) => {
      command = cmd;
      args = receivedArgs;
      return { kill: () => { killed = true; } };
    },
  });

  assert.equal(await withAwake(async () => 42), 42);
  assert.equal(command, 'caffeinate');
  assert.deepEqual(args, ['-i']);
  assert.equal(killed, true);
});

test('kills caffeinate when work throws', async () => {
  let killed = false;
  const withAwake = createAwakeGuard({
    platform: 'darwin',
    spawnProcess: () => ({ kill: () => { killed = true; } }),
  });

  await assert.rejects(withAwake(async () => { throw new Error('falhou'); }), /falhou/);
  assert.equal(killed, true);
});

test('does not spawn caffeinate outside macOS', async () => {
  let spawned = false;
  const withAwake = createAwakeGuard({
    platform: 'linux',
    spawnProcess: () => { spawned = true; },
  });

  await withAwake(async () => {});
  assert.equal(spawned, false);
});
