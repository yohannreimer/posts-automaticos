import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';

const root = await mkdtemp(path.join(os.tmpdir(), 'posts-analytics-'));
process.env.ANALYTICS_DB_PATH = path.join(root, 'analytics.db');
const analytics = await import(`../lib/analytics.mjs?test=${Date.now()}`);

test.after(async () => {
  analytics.closeAnalyticsDB();
  await rm(root, { recursive: true, force: true });
});

test('persists a sanitized score configuration', () => {
  const saved = analytics.saveScoreConfig({
    preset: 'custom',
    minReach: 80,
    weights: { saveRate: 5, shareRate: 2, engagementRate: 3, followRate: 1, viewsNorm: 0.5 },
  });

  assert.equal(saved.minReach, 80);
  assert.equal(saved.weights.saveRate, 5);
  assert.deepEqual(analytics.getScoreConfig(), saved);
});

test('builds an account timeline carrying unchanged posts forward', () => {
  const db = analytics.getDB();
  const insert = db.prepare(`
    INSERT INTO snapshots (ig_id, taken_at, views, reach) VALUES (?, ?, ?, ?)
  `);
  insert.run('post-1', '2026-07-19T10:00:00.000Z', 10, 8);
  insert.run('post-2', '2026-07-19T10:00:00.000Z', 20, 16);
  insert.run('post-1', '2026-07-19T16:00:00.000Z', 15, 11);

  assert.deepEqual(analytics.getAccountTimeline(), [
    { t: '2026-07-19T10:00:00.000Z', views: 30, reach: 24, posts: 2 },
    { t: '2026-07-19T16:00:00.000Z', views: 35, reach: 27, posts: 2 },
  ]);
});

test('keeps a real zero interaction rate instead of marking it unavailable', () => {
  const db = analytics.getDB();
  db.prepare(`
    INSERT INTO media (ig_id, media_type, product_type, posted_at)
    VALUES ('zero-post', 'VIDEO', 'REELS', '2026-07-19T12:00:00.000Z')
  `).run();
  db.prepare(`
    INSERT INTO snapshots (ig_id, taken_at, views, reach, likes, comments, shares, saves)
    VALUES ('zero-post', '2026-07-19T18:00:00.000Z', 100, 100, 0, 0, 0, 0)
  `).run();

  const post = analytics.getSummary().find((item) => item.igId === 'zero-post');
  assert.equal(post.metrics.interactions, 0);
  assert.equal(post.rates.engagementRate, 0);
  assert.equal(post.scoreDetails.available.engagementRate, true);
});

test('keeps one report per week while preserving report history', () => {
  analytics.saveWeeklyReport({
    weekKey: '2026-07-13',
    periodStart: '2026-07-13T03:00:00.000Z',
    periodEnd: '2026-07-20T03:00:00.000Z',
    generatedAt: '2026-07-19T20:00:00.000Z',
    markdown: 'primeira versão',
    data: { posts: 2 },
  });
  analytics.saveWeeklyReport({
    weekKey: '2026-07-13',
    periodStart: '2026-07-13T03:00:00.000Z',
    periodEnd: '2026-07-20T03:00:00.000Z',
    generatedAt: '2026-07-19T21:00:00.000Z',
    markdown: 'versão atualizada',
    data: { posts: 3 },
  });
  analytics.saveWeeklyReport({
    weekKey: '2026-07-06',
    periodStart: '2026-07-06T03:00:00.000Z',
    periodEnd: '2026-07-13T03:00:00.000Z',
    generatedAt: '2026-07-13T21:00:00.000Z',
    markdown: 'semana anterior',
    data: { posts: 4 },
  });

  const reports = analytics.getWeeklyReports(10);
  assert.equal(reports.length, 2);
  assert.equal(reports[0].markdown, 'versão atualizada');
  assert.equal(reports[0].data.posts, 3);
});

test('persists whether generator learning is enabled', () => {
  assert.equal(analytics.getLearningState().enabled, true);
  analytics.setLearningEnabled(false);
  assert.equal(analytics.getLearningState().enabled, false);
});
