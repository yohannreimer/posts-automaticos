# Analytics Phases 2 and 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish reliable evolution charts and configurable scoring, then add weekly report history and a controlled data-driven learning loop to content generation.

**Architecture:** Pure scoring and learning rules live in a focused module and are consumed by the SQLite analytics layer. The server owns persistence and exposes small JSON endpoints; the existing vanilla frontend renders configuration, charts, history, and learning visibility.

**Tech Stack:** Node.js ESM, `node:sqlite`, Express, vanilla JavaScript/SVG, Node test runner.

---

### Task 1: Pure score and learning rules

**Files:**
- Create: `lib/insights-score.mjs`
- Create: `test/insights-score.test.mjs`

- [x] **Step 1: Write failing tests for config bounds, missing metrics, confidence, stable scoring, and non-overlapping learnings**

```js
test('does not treat unavailable follows as zero', () => {
  const [row] = scoreSummary([reelWithNullFollows], DEFAULT_SCORE_CONFIG);
  assert.equal(row.scoreDetails.available.followRate, false);
});

test('penalizes a high rate backed by tiny reach', () => {
  const [tiny, reliable] = scoreSummary([tinyRow, reliableRow], DEFAULT_SCORE_CONFIG);
  assert.ok(tiny.score < reliable.score);
});
```

- [x] **Step 2: Run the focused test and confirm it fails**

Run: `node --test test/insights-score.test.mjs`
Expected: FAIL because `lib/insights-score.mjs` does not exist.

- [x] **Step 3: Implement config sanitization, scoring, confidence, and learning context**

```js
export function scoreSummary(rows, config = DEFAULT_SCORE_CONFIG) {
  const referenceViews = percentile(rows.map((row) => row.metrics.views), 0.9);
  return rows.map((row) => scoreRow(row, config, referenceViews));
}
```

- [x] **Step 4: Run the focused test and confirm it passes**

Run: `node --test test/insights-score.test.mjs`
Expected: all focused tests pass.

### Task 2: Persist configuration, account timeline, reports, and learning state

**Files:**
- Modify: `lib/analytics.mjs`
- Create: `test/analytics.test.mjs`

- [x] **Step 1: Write failing SQLite tests using `ANALYTICS_DB_PATH`**

```js
test('persists score configuration and weekly report history', async () => {
  analytics.saveScoreConfig({ minReach: 80, weights: { saves: 5 } });
  assert.equal(analytics.getScoreConfig().minReach, 80);
  analytics.saveWeeklyReport(report);
  assert.equal(analytics.getWeeklyReports(10).length, 1);
});
```

- [x] **Step 2: Run the focused test and confirm it fails**

Run: `node --test test/analytics.test.mjs`
Expected: FAIL because persistence functions are missing.

- [x] **Step 3: Add schema migration and analytics APIs**

```sql
CREATE TABLE IF NOT EXISTS weekly_reports (
  week_key TEXT PRIMARY KEY,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  markdown TEXT NOT NULL,
  data_json TEXT DEFAULT '{}'
);
```

- [x] **Step 4: Make `getSummary()` return server-computed score and confidence**

```js
return scoreSummary(summary, getScoreConfig());
```

- [x] **Step 5: Run both analytics test files**

Run: `node --test test/insights-score.test.mjs test/analytics.test.mjs`
Expected: all analytics tests pass.

### Task 3: Server endpoints and generator integration

**Files:**
- Modify: `server.mjs`
- Modify: `lib/claude.mjs`

- [x] **Step 1: Add score-config, account-timeline, report-history, learning, and saved-comment endpoints**

```js
app.put('/api/insights/score-config', (req, res) => {
  res.json(saveScoreConfig(req.body));
});
```

- [x] **Step 2: Separate weekly report failures from collection failures and prevent concurrent reports**

```js
if (reportJob.running) return res.status(409).json({ error: 'relatório já em andamento' });
```

- [x] **Step 3: Pass deterministic learnings into angle generation**

```js
const angles = await generateAngles({ rawText, count: n, learnings });
```

- [x] **Step 4: Check server and Claude module syntax**

Run: `node --check server.mjs && node --check lib/claude.mjs`
Expected: exit code 0.

### Task 4: Finish the Análise interface

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/style.css`

- [x] **Step 1: Replace client-side scoring with server scores and add confidence labels**

```js
const score = r.score == null ? '—' : `${r.score}<small>${r.scoreConfidenceLabel}</small>`;
```

- [x] **Step 2: Add persisted weight controls and preset shortcuts**

```html
<input id="scoreWeightSaves" type="number" min="0" max="10" step="0.5">
<button id="scoreSaveBtn">Salvar score</button>
```

- [x] **Step 3: Add aggregate timeline SVG with real timestamp spacing**

```js
function renderAccountTimeline(points) {
  // Draw views and reach with a shared real-time x-axis.
}
```

- [x] **Step 4: Add report-history selection and learning preview/toggle**

```html
<select id="reportHistory"></select>
<input id="learningEnabled" type="checkbox">
<pre id="learningPreview"></pre>
```

- [x] **Step 5: Improve markdown handling and restore saved comment ideas**

Run: `node --check public/app.js`
Expected: exit code 0.

### Task 5: Full verification

**Files:**
- Verify: all modified files

- [x] **Step 1: Run formatting and whitespace validation**

Run: `git diff --check`
Expected: exit code 0.

- [x] **Step 2: Run syntax checks**

Run: `node --check server.mjs && node --check lib/analytics.mjs && node --check lib/claude.mjs && node --check lib/insights-score.mjs && node --check public/app.js`
Expected: exit code 0.

- [x] **Step 3: Run the full test suite**

Run: `npm test`
Expected: zero failures.

- [x] **Step 4: Restart the local LaunchAgent and inspect the Análise tab**

Run: `launchctl kickstart -k gui/$(id -u)/com.yrd.posts-automaticos`
Expected: `http://localhost:4173/api/insights/status` returns HTTP 200 and the UI shows persisted configuration, chart, report history, and learning state.

- [x] **Step 5: Review final diff before commit/push**

Run: `git diff --stat && git status --short`
Expected: only analytics implementation, tests, and these design/plan documents are changed.
