# Mac-Local Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the native Mac runtime restart automatically, persist and recover Reel jobs, keep the Mac awake during active work, and publish overdue scheduled posts safely after restart.

**Architecture:** Extract persistence, scheduler, and macOS-awake behavior into focused modules tested with Node's built-in test runner. `server.mjs` composes those modules, exposes runtime health, and bootstraps recovery before listening. A LaunchAgent installer keeps the already-fast native `npm start` runtime alive without requiring an open Terminal.

**Tech Stack:** Node.js 22 ESM, `node:test`, Express, macOS `launchd`, `caffeinate`, vanilla HTML/CSS/JavaScript.

---

## File map

- Create `lib/reel-batch.mjs`: atomic disk store and startup recovery for Reel jobs.
- Create `lib/scheduler.mjs`: publication state transitions and overdue processing.
- Create `lib/mac-awake.mjs`: scoped macOS sleep inhibitor.
- Create `test/reel-batch.test.mjs`: persistence and recovery tests.
- Create `test/scheduler.test.mjs`: publication safety tests.
- Create `test/mac-awake.test.mjs`: platform and cleanup tests.
- Create `scripts/install-macos-service.sh`: install/load the per-user LaunchAgent.
- Create `scripts/uninstall-macos-service.sh`: unload/remove the LaunchAgent.
- Modify `server.mjs`: compose stores, recovery, scheduler, awake guard, and runtime endpoint.
- Modify `public/index.html`: add local runtime indicator.
- Modify `public/app.js`: show runtime and uncertain publication state.
- Modify `public/style.css`: runtime indicator and new status colors.
- Modify `package.json`: add the built-in test command and service helpers.
- Modify `README.md`: document native Mac operation and VPS cutover.

### Task 1: Reel batch disk store

**Files:**
- Create: `lib/reel-batch.mjs`
- Create: `test/reel-batch.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add the test command**

Add this script to `package.json`:

```json
"test": "node --test"
```

- [ ] **Step 2: Write failing persistence and recovery tests**

Create tests using `mkdtemp`, `tmpdir`, `writeFile`, and `mkdir`. Cover:

```js
test('saves jobs atomically and reloads them', async () => {
  const store = createReelBatchStore({ filePath, reelsDir });
  await store.load();
  await store.upsert({ file: 'source.mp4', name: 'source.mp4', status: 'queued' });
  assert.equal((await createLoadedStore()).items[0].file, 'source.mp4');
});

test('recovers processing jobs as queued when source exists', async () => {
  await writeFile(path.join(reelsDir, 'source.mp4'), 'video');
  await writeFile(filePath, JSON.stringify([{ file: 'source.mp4', status: 'processing' }]));
  const store = await createLoadedStore();
  assert.equal(store.items[0].status, 'queued');
});

test('keeps done jobs only when the final video exists', async () => {
  await writeFile(filePath, JSON.stringify([{ file: 'source.mp4', status: 'done', result: { file: 'final.mp4' } }]));
  const store = await createLoadedStore();
  assert.equal(store.items[0].status, 'error');
});

test('preserves corrupt JSON and reports a recovery error', async () => {
  await writeFile(filePath, '{broken');
  const store = await createLoadedStore();
  assert.match(store.recoveryError, /corrompida/i);
  assert.equal(store.items.length, 0);
  assert.equal((await readdir(dataDir)).some((name) => name.includes('.corrupt-')), true);
});
```

- [ ] **Step 3: Run the tests and verify they fail**

Run: `npm test -- test/reel-batch.test.mjs`

Expected: FAIL because `lib/reel-batch.mjs` does not exist.

- [ ] **Step 4: Implement the store**

Implement `createReelBatchStore({ filePath, reelsDir, now = () => Date.now() })` with:

```js
return {
  get items() { return items; },
  get recoveryError() { return recoveryError; },
  load,
  save,
  upsert,
  patch,
  remove,
};
```

`save()` writes to a sibling temporary file and renames it over the destination.
`load()` validates an array, preserves invalid JSON as
`reel-batch.json.corrupt-<timestamp>`, converts `processing` to `queued`, validates
source/final files, and persists any recovered state.

- [ ] **Step 5: Run the focused tests**

Run: `npm test -- test/reel-batch.test.mjs`

Expected: all Reel store tests PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json lib/reel-batch.mjs test/reel-batch.test.mjs
git commit -m "feat: persist and recover Reel jobs"
```

### Task 2: Safe scheduler state machine

**Files:**
- Create: `lib/scheduler.mjs`
- Create: `test/scheduler.test.mjs`

- [ ] **Step 1: Write failing scheduler tests**

Cover the required transitions with injected queue functions:

```js
test('marks an item publishing before calling the publisher', async () => {
  const transitions = [];
  await runDuePublications({
    readQueue: async () => [dueItem],
    updateItem: async (_id, patch) => transitions.push(patch.status),
    publishItem: async () => ({ id: 'ig-1', permalink: 'https://instagram.test/p/1' }),
    now: () => new Date('2026-07-19T18:00:00Z'),
  });
  assert.deepEqual(transitions, ['publishing', 'published']);
});

test('turns interrupted publishing items into unknown at startup', async () => {
  const patches = [];
  await recoverInterruptedPublications({
    readQueue: async () => [{ ...dueItem, status: 'publishing' }],
    updateItem: async (id, patch) => patches.push({ id, patch }),
  });
  assert.equal(patches[0].patch.status, 'unknown');
});

test('publishes overdue scheduled items and ignores unknown items', async () => {
  let calls = 0;
  await runDuePublications({
    readQueue: async () => [dueItem, { ...dueItem, id: 'unknown', status: 'unknown' }],
    updateItem: async () => {},
    publishItem: async () => { calls++; return { id: 'ig-1' }; },
    now: () => new Date('2026-07-19T18:00:00Z'),
  });
  assert.equal(calls, 1);
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- test/scheduler.test.mjs`

Expected: FAIL because `lib/scheduler.mjs` does not exist.

- [ ] **Step 3: Implement scheduler helpers**

Export:

```js
export async function recoverInterruptedPublications({ readQueue, updateItem, logger = console })
export async function runDuePublications({
  readQueue, updateItem, publishItem, withAwake = (task) => task(),
  now = () => new Date(), logger = console,
})
```

Persist `publishing` before the external call. Persist `published` with remote IDs
after success, or `error` after a caught error. Recovery changes only `publishing`
items to `unknown` with an explanatory error.

- [ ] **Step 4: Run the focused tests**

Run: `npm test -- test/scheduler.test.mjs`

Expected: all scheduler tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/scheduler.mjs test/scheduler.test.mjs
git commit -m "feat: make scheduled publishing restart-safe"
```

### Task 3: Scoped macOS awake guard

**Files:**
- Create: `lib/mac-awake.mjs`
- Create: `test/mac-awake.test.mjs`

- [ ] **Step 1: Write failing awake-guard tests**

Use an injected `spawnProcess` fake:

```js
test('starts caffeinate on macOS and kills it after work', async () => {
  let command = '';
  let killed = false;
  const withAwake = createAwakeGuard({
    platform: 'darwin',
    spawnProcess: (cmd) => { command = cmd; return { kill: () => { killed = true; } }; },
  });
  assert.equal(await withAwake(async () => 42), 42);
  assert.equal(command, 'caffeinate');
  assert.equal(killed, true);
});

test('does not spawn caffeinate outside macOS', async () => {
  let spawned = false;
  const withAwake = createAwakeGuard({ platform: 'linux', spawnProcess: () => { spawned = true; } });
  await withAwake(async () => {});
  assert.equal(spawned, false);
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- test/mac-awake.test.mjs`

Expected: FAIL because `lib/mac-awake.mjs` does not exist.

- [ ] **Step 3: Implement `createAwakeGuard`**

On Darwin, spawn `caffeinate -i` with ignored stdio. Always terminate the child in
`finally`, including when the wrapped task throws. Outside Darwin, call the task
without spawning.

- [ ] **Step 4: Run the focused tests**

Run: `npm test -- test/mac-awake.test.mjs`

Expected: all awake-guard tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/mac-awake.mjs test/mac-awake.test.mjs
git commit -m "feat: keep Mac awake during active jobs"
```

### Task 4: Compose recovery in the server

**Files:**
- Modify: `server.mjs:1-70,242-340,343-512,562-end`

- [ ] **Step 1: Import and initialize the focused modules**

Add imports for `createReelBatchStore`, `createAwakeGuard`,
`recoverInterruptedPublications`, and `runDuePublications`. Configure the store at
`data/reel-batch.json` and keep `reelBatch` as `store.items` after startup.

- [ ] **Step 2: Persist every Reel transition**

Replace direct array-only mutations with `store.upsert`, `store.patch`, and
`store.remove`. Make stage changes await a helper:

```js
async function setReelState(item, patch) {
  Object.assign(item, patch);
  await reelBatchStore.save();
}
```

Wrap `processOneReel` with `withAwake`, persist `processing`, each major stage,
`done`, and `error`, and start the worker after startup recovery.

- [ ] **Step 3: Replace scheduler internals**

Have `schedulerTick()` delegate to `runDuePublications` while preserving the busy
guard. `publish-now` must also persist `publishing` before its external call and use
the awake guard. Permit explicit retry of `unknown` only through this manual route.

- [ ] **Step 4: Add a boot sequence and runtime endpoint**

Before `app.listen`:

```js
await reelBatchStore.load();
await recoverInterruptedPublications({ readQueue, updateItem: updateQueueItem });
app.listen(PORT, () => { /* log */ });
await schedulerTick();
reelWorker();
setInterval(schedulerTick, 60_000);
```

Add `GET /api/runtime` returning:

```js
{
  active: true,
  processing: reelWorkerBusy,
  currentStage,
  nextScheduledAt,
  batchRecoveryError: reelBatchStore.recoveryError,
  sleepWarning: 'O Mac precisa estar acordado para publicar.',
}
```

- [ ] **Step 5: Run all automated tests and syntax checks**

Run:

```bash
npm test
node --check server.mjs
node --check public/app.js
```

Expected: all tests PASS and both syntax checks exit 0.

- [ ] **Step 6: Commit**

```bash
git add server.mjs
git commit -m "feat: recover local processing and publishing"
```

### Task 5: Runtime and uncertain-state UI

**Files:**
- Modify: `public/index.html:8-20`
- Modify: `public/app.js:1-35,399-590,785-end`
- Modify: `public/style.css:20-45`

- [ ] **Step 1: Add runtime markup**

Add `<div id="runtimeStatus" class="runtime-status"></div>` beside the header tabs
and register it in the `el` list.

- [ ] **Step 2: Render runtime state**

Add `loadRuntimeStatus()` that fetches `/api/runtime`, displays whether a Reel is
processing, the next publication time, and any recovery warning. Poll every 15
seconds and call it during init.

- [ ] **Step 3: Render publication safety states**

Extend labels with:

```js
const STATUS_LABELS = {
  scheduled: 'agendado', publishing: 'publicando', published: 'publicado',
  error: 'erro', unknown: 'confirmar no Instagram',
};
```

Disable date editing while `publishing`. For `unknown`, show the stored warning and
require a second, explicit confirmation before `publish-now` can retry.

- [ ] **Step 4: Add minimal styles**

Style `.runtime-status`, `.q-status.publishing`, `.q-status.unknown`,
`.cal-chip.publishing`, and `.cal-chip.unknown` without changing the existing visual
system.

- [ ] **Step 5: Run syntax checks**

Run:

```bash
node --check public/app.js
npm test
```

Expected: syntax check exits 0 and all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/app.js public/style.css
git commit -m "feat: show local runtime recovery status"
```

### Task 6: macOS LaunchAgent installation

**Files:**
- Create: `scripts/install-macos-service.sh`
- Create: `scripts/uninstall-macos-service.sh`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Implement the installer**

The installer resolves the repository directory and current Node executable, creates
`data/logs`, and writes `~/Library/LaunchAgents/com.yrd.posts-automaticos.plist`.
The plist uses `RunAtLoad`, `KeepAlive`, the absolute `node` path, `server.mjs`, the
repository as `WorkingDirectory`, and persistent stdout/stderr paths. Load it with
`launchctl bootstrap gui/$(id -u)` and restart it with `launchctl kickstart -k`.

The script must not embed API keys; `dotenv` continues to read `.env` from the
working directory.

- [ ] **Step 2: Implement the uninstaller**

Unload the same label with `launchctl bootout`, remove only its exact plist, and
leave `data`, videos, logs, `.env`, and the repository untouched.

- [ ] **Step 3: Add package helpers**

Add:

```json
"service:install": "bash scripts/install-macos-service.sh",
"service:uninstall": "bash scripts/uninstall-macos-service.sh"
```

- [ ] **Step 4: Document operation and migration**

Document installation, `launchctl print`, log paths, browser URL, sleep behavior,
manual recovery, uninstall, and the exact VPS cutover rule: validate manual and
scheduled Mac publication before stopping (not deleting) the Portainer stack.

- [ ] **Step 5: Validate scripts without installing**

Run:

```bash
bash -n scripts/install-macos-service.sh
bash -n scripts/uninstall-macos-service.sh
npm test
```

Expected: both shell parsers exit 0 and all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts package.json README.md
git commit -m "feat: run Posts Automáticos as a Mac service"
```

### Task 7: End-to-end verification and cutover handoff

**Files:**
- Modify only if verification exposes a defect.

- [ ] **Step 1: Run the full automated verification**

Run:

```bash
npm test
node --check server.mjs
node --check public/app.js
bash -n scripts/install-macos-service.sh
bash -n scripts/uninstall-macos-service.sh
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 2: Start a disposable local server check**

Start the server on an unused port with publication credentials disabled, request
`/api/runtime` and `/api/reels/batch`, then stop it. Expected: HTTP 200, valid JSON,
and no unhandled startup error.

- [ ] **Step 3: Perform manual Mac acceptance checks**

After user authorization to install the LaunchAgent:

1. Install and verify the service appears in `launchctl print`.
2. Close the browser and confirm the server remains reachable.
3. Force-restart the service and confirm Reel batch state remains.
4. Process a short Reel and confirm the Mac stays awake.
5. Schedule a controlled post and confirm it publishes.

- [ ] **Step 4: Stop the VPS scheduler only after acceptance**

In Portainer, stop or scale the Posts Automáticos service to zero only after all
future VPS queue items have been reconciled and the controlled Mac schedule passes.
Do not delete the stack or volumes.

- [ ] **Step 5: Final status and remaining risks**

Report automated results, LaunchAgent state, next scheduled publication, whether the
VPS scheduler remains active, and the known constraint that manual sleep, logout,
shutdown, or a closed lid prevents on-time publication.
