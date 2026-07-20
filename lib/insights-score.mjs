const METRIC_KEYS = ['saveRate', 'shareRate', 'engagementRate', 'followRate', 'viewsNorm'];

export const SCORE_PRESETS = Object.freeze({
  balanced: Object.freeze({ saveRate: 3, shareRate: 3, engagementRate: 2, followRate: 3, viewsNorm: 1 }),
  growth: Object.freeze({ saveRate: 1, shareRate: 3, engagementRate: 1, followRate: 6, viewsNorm: 2 }),
  authority: Object.freeze({ saveRate: 5, shareRate: 4, engagementRate: 2, followRate: 1, viewsNorm: 0.5 }),
});

export const DEFAULT_SCORE_CONFIG = Object.freeze({
  preset: 'balanced',
  minReach: 50,
  weights: SCORE_PRESETS.balanced,
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cloneDefault() {
  return {
    preset: DEFAULT_SCORE_CONFIG.preset,
    minReach: DEFAULT_SCORE_CONFIG.minReach,
    weights: { ...DEFAULT_SCORE_CONFIG.weights },
  };
}

export function sanitizeScoreConfig(input = {}) {
  const weights = {};
  for (const key of METRIC_KEYS) {
    weights[key] = clamp(finiteNumber(input.weights?.[key], DEFAULT_SCORE_CONFIG.weights[key]), 0, 10);
  }
  if (!Object.values(weights).some((weight) => weight > 0)) return cloneDefault();

  return {
    preset: Object.hasOwn(SCORE_PRESETS, input.preset) ? input.preset : 'custom',
    minReach: Math.round(clamp(finiteNumber(input.minReach, DEFAULT_SCORE_CONFIG.minReach), 10, 10000)),
    weights,
  };
}

function percentile(values, percentileValue) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 1;
  const index = Math.max(0, Math.ceil(percentileValue * sorted.length) - 1);
  return Math.max(1, sorted[index]);
}

function normalizeRate(value, ceiling) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return clamp(Number(value) / ceiling, 0, 1);
}

function confidenceLabel(confidence) {
  if (confidence >= 1) return 'confiável';
  if (confidence >= 0.4) return 'amostra crescendo';
  return 'baixa amostra';
}

export function scoreSummary(rows, rawConfig = DEFAULT_SCORE_CONFIG) {
  const config = sanitizeScoreConfig(rawConfig);
  const referenceViews = percentile(rows.map((row) => Number(row.metrics?.views)), 0.9);

  return rows.map((row) => {
    const parts = {
      saveRate: normalizeRate(row.rates?.saveRate, 3),
      shareRate: normalizeRate(row.rates?.shareRate, 3),
      engagementRate: normalizeRate(row.rates?.engagementRate, 10),
      followRate: normalizeRate(row.rates?.followRate, 1),
      viewsNorm: row.metrics?.views == null ? null : clamp(Number(row.metrics.views) / referenceViews, 0, 1),
    };
    const available = Object.fromEntries(METRIC_KEYS.map((key) => [key, parts[key] != null]));
    const denominator = METRIC_KEYS.reduce(
      (total, key) => total + (available[key] ? config.weights[key] : 0),
      0
    );
    const weighted = METRIC_KEYS.reduce(
      (total, key) => total + (available[key] ? parts[key] * config.weights[key] : 0),
      0
    );
    const reach = Number(row.metrics?.reach);
    const confidence = Number.isFinite(reach) && reach >= 0
      ? clamp(reach / config.minReach, 0, 1)
      : 0;
    const confidenceMultiplier = 0.25 + confidence * 0.75;
    const baseScore = denominator > 0 ? (weighted / denominator) * 100 : null;
    const score = baseScore == null ? null : Math.round(baseScore * confidenceMultiplier);

    return {
      ...row,
      score,
      scoreConfidence: Math.round(confidence * 100),
      scoreConfidenceLabel: confidenceLabel(confidence),
      scoreDetails: {
        available,
        denominator,
        referenceViews,
        baseScore: baseScore == null ? null : Math.round(baseScore),
      },
    };
  });
}

function learningDescription(row) {
  const label = row.productType === 'REELS' ? 'reel' : 'feed';
  const text = (row.hook || row.caption || '(sem texto)').replace(/\s+/g, ' ').slice(0, 100);
  const extras = [
    row.theme ? `tema: ${row.theme}` : '',
    row.contentFormat ? `gancho: ${row.contentFormat}` : '',
  ].filter(Boolean).join(', ');
  return `- [${label}] score ${row.score}, alcance ${row.metrics.reach}, eng ${row.rates.engagementRate ?? 'indisponível'}%, ` +
    `saves ${row.metrics.saves ?? 'indisponível'}, shares ${row.metrics.shares ?? 'indisponível'}: "${text}"${extras ? ` (${extras})` : ''}`;
}

export function buildLearningContext(rows, rawConfig = DEFAULT_SCORE_CONFIG, { enabled = true, minPosts = 5 } = {}) {
  const config = sanitizeScoreConfig(rawConfig);
  const scored = scoreSummary(rows, config);
  const eligible = scored
    .filter((row) => {
      const hasContentContext = Boolean((row.hook || row.caption || row.theme || row.contentFormat || '').trim());
      return row.score != null && Number(row.metrics?.reach) >= config.minReach && hasContentContext;
    })
    .sort((a, b) => b.score - a.score);

  const empty = {
    text: '',
    totalCount: rows.length,
    eligibleCount: eligible.length,
    minReach: config.minReach,
    topIds: [],
    bottomIds: [],
  };
  if (!enabled || eligible.length < minPosts) return empty;

  const top = eligible.slice(0, Math.min(3, Math.ceil(eligible.length / 2)));
  const topIds = new Set(top.map((row) => row.igId));
  const bottom = eligible
    .filter((row) => !topIds.has(row.igId))
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);

  return {
    ...empty,
    topIds: top.map((row) => row.igId),
    bottomIds: bottom.map((row) => row.igId),
    text: [
      `DADOS REAIS DA CONTA (somente posts com alcance mínimo ${config.minReach}; use para calibrar tema, gancho e tom sem copiar):`,
      'Padrões com melhor score confiável:',
      ...top.map(learningDescription),
      'Padrões com pior score confiável (trate como hipótese a evitar/testar):',
      ...bottom.map(learningDescription),
    ].join('\n'),
  };
}
