import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SCORE_CONFIG,
  sanitizeScoreConfig,
  scoreSummary,
  buildLearningContext,
} from '../lib/insights-score.mjs';

function row({
  id,
  reach,
  views,
  saveRate = 0,
  shareRate = 0,
  engagementRate = 0,
  followRate = null,
  saves = 0,
  shares = 0,
  hook = '',
} = {}) {
  return {
    igId: id,
    productType: 'REELS',
    hook,
    caption: hook,
    theme: '',
    contentFormat: '',
    metrics: { reach, views, saves, shares },
    rates: { saveRate, shareRate, engagementRate, followRate },
  };
}

test('sanitizes score configuration without allowing unusable weights', () => {
  const config = sanitizeScoreConfig({
    preset: 'anything',
    minReach: 1,
    weights: { saveRate: 99, shareRate: -4, engagementRate: '4.5', followRate: 0, viewsNorm: 0 },
  });

  assert.equal(config.preset, 'custom');
  assert.equal(config.minReach, 10);
  assert.deepEqual(config.weights, {
    saveRate: 10,
    shareRate: 0,
    engagementRate: 4.5,
    followRate: 0,
    viewsNorm: 0,
  });

  assert.deepEqual(
    sanitizeScoreConfig({ weights: { saveRate: 0, shareRate: 0, engagementRate: 0, followRate: 0, viewsNorm: 0 } }),
    DEFAULT_SCORE_CONFIG
  );
});

test('does not treat an unavailable follows metric as zero', () => {
  const [scored] = scoreSummary([
    row({ id: 'reel', reach: 100, views: 100, engagementRate: 5, followRate: null }),
  ]);

  assert.equal(scored.scoreDetails.available.followRate, false);
  assert.equal(scored.scoreDetails.denominator, 9);
  assert.equal(scored.scoreConfidenceLabel, 'confiável');
});

test('penalizes a high rate backed by a tiny sample', () => {
  const scored = scoreSummary([
    row({ id: 'tiny', reach: 2, views: 4, engagementRate: 50 }),
    row({ id: 'reliable', reach: 100, views: 100, engagementRate: 10 }),
  ]);
  const tiny = scored.find((item) => item.igId === 'tiny');
  const reliable = scored.find((item) => item.igId === 'reliable');

  assert.ok(tiny.score < reliable.score);
  assert.equal(tiny.scoreConfidenceLabel, 'baixa amostra');
  assert.equal(reliable.scoreConfidenceLabel, 'confiável');
});

test('scores are stable when the already-scored rows are filtered', () => {
  const scored = scoreSummary([
    row({ id: 'a', reach: 100, views: 200, engagementRate: 4 }),
    row({ id: 'b', reach: 80, views: 100, engagementRate: 6 }),
  ]);
  const scoreBeforeFilter = scored.find((item) => item.igId === 'b').score;
  const filtered = scored.filter((item) => item.igId === 'b');

  assert.equal(filtered[0].score, scoreBeforeFilter);
});

test('learning context requires reliable samples and never overlaps winners and losers', () => {
  const rows = Array.from({ length: 7 }, (_, index) => row({
    id: `p${index + 1}`,
    reach: 100 + index,
    views: 100 + index * 10,
    engagementRate: index + 1,
    hook: `Gancho ${index + 1}`,
  }));

  const learning = buildLearningContext(rows, DEFAULT_SCORE_CONFIG);
  const overlap = learning.topIds.filter((id) => learning.bottomIds.includes(id));

  assert.equal(learning.eligibleCount, 7);
  assert.equal(overlap.length, 0);
  assert.match(learning.text, /DADOS REAIS DA CONTA/);
  assert.match(learning.text, /Gancho 7/);
});

test('learning context stays empty with too little reliable data or when disabled', () => {
  const small = Array.from({ length: 4 }, (_, index) => row({
    id: `p${index}`,
    reach: 100,
    views: 100,
    engagementRate: index,
  }));

  assert.equal(buildLearningContext(small, DEFAULT_SCORE_CONFIG).text, '');
  assert.equal(buildLearningContext([...small, row({ id: 'p5', reach: 100, views: 100 })], DEFAULT_SCORE_CONFIG, { enabled: false }).text, '');
});
