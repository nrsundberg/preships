export type UsagePeriodBoundary = {
  /**
   * Inclusive period start (ISO string).
   */
  startIso: string;
  /**
   * Inclusive period end (ISO string).
   */
  endIso: string;
  /**
   * Reset timestamp (ISO string) for the next quota window.
   */
  resetAtIso: string;
  /**
   * Human-friendly label (e.g. "Apr 2026").
   */
  label: string;
};

export type FreeTierQuota = {
  monthlyRuns: number;
  monthlyTokens: number;
};

export type UsageCounters = {
  usedRuns: number;
  usedTokens: number;
  remainingRuns: number;
  remainingTokens: number;
  previousRuns: number;
  previousTokens: number;
  runsDelta: number;
  tokensDelta: number;
};

export type UsageTrendPoint = {
  label: string;
  runs: number;
  tokens: number;
};

export type UsageTrend = {
  runsDirection: "up" | "down" | "flat";
  tokensDirection: "up" | "down" | "flat";
  /**
   * Placeholder series used by UI scaffolding. Not a real metric yet.
   */
  points: UsageTrendPoint[];
};

export type ModelUsageEntry = {
  modelId: string;
  runs: number;
  tokens: number;
  /**
   * Share of token usage (0-1).
   */
  tokenShare: number;
};

export type QuotaStatus = "healthy" | "warning" | "depleted";

export type UsagePageData = {
  period: UsagePeriodBoundary;
  quota: FreeTierQuota;
  cli: {
    counters: UsageCounters;
    trend: UsageTrend;
  };
  models: {
    topModels: ModelUsageEntry[];
  };
  quotaStatus: {
    status: QuotaStatus;
    summary: string;
  };
};

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function fnv1a32(input: string) {
  // Simple, deterministic hash for stable stub output.
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Convert to uint32
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function startOfMonthUtc(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

function nextMonthUtc(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

function endOfMonthUtc(now: Date) {
  const next = nextMonthUtc(now);
  return new Date(next.getTime() - 1);
}

function addDaysUtc(date: Date, deltaDays: number) {
  return new Date(date.getTime() + deltaDays * 24 * 60 * 60 * 1000);
}

function formatMonthLabelUtc(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(d);
}

export type GetFreeTierUsageStubOptions = {
  now?: Date;
};

export function getFreeTierUsagePageStub(options: GetFreeTierUsageStubOptions = {}) {
  const now = options.now ?? new Date();

  const seed = fnv1a32(`usage:${now.toISOString().slice(0, 10)}:${now.getUTCHours()}`);
  const rand = mulberry32(seed);
  const rand2 = mulberry32(seed ^ 0x9e3779b9);
  const randPrev = mulberry32(seed ^ 0x7f4a7c15);

  // Free-tier quotas (monthly window).
  const quota: FreeTierQuota = {
    monthlyRuns: 250,
    monthlyTokens: 500_000,
  };

  const periodStart = startOfMonthUtc(now);
  const periodEnd = endOfMonthUtc(now);
  const resetAt = nextMonthUtc(now);

  const period: UsagePeriodBoundary = {
    startIso: periodStart.toISOString(),
    endIso: periodEnd.toISOString(),
    resetAtIso: resetAt.toISOString(),
    label: formatMonthLabelUtc(periodStart.toISOString()),
  };

  // Progress through the current period (0..1).
  const elapsedMs = Math.max(0, now.getTime() - periodStart.getTime());
  const periodMs = Math.max(1, periodEnd.getTime() - periodStart.getTime());
  const ratio = clampInt((elapsedMs / periodMs) * 10_000, 0, 10_000) / 10_000;

  const avgTokensPerRun = clampInt(950 + rand2() * 850, 500, 3000);

  // Keep counters plausible: run usage is influenced by both quota and time elapsed.
  const timeAdjustedRuns = quota.monthlyRuns * ratio * (0.65 + rand());
  const tokensCapRuns = Math.floor(quota.monthlyTokens / avgTokensPerRun);
  const usedRuns = clampInt(Math.min(timeAdjustedRuns, tokensCapRuns), 0, quota.monthlyRuns);
  const usedTokens = clampInt(usedRuns * avgTokensPerRun, 0, quota.monthlyTokens);

  const remainingRuns = quota.monthlyRuns - usedRuns;
  const remainingTokens = quota.monthlyTokens - usedTokens;

  // Previous period (stub): roughly comparable, with some noise.
  const prevRatio = clampInt(0.6 + randPrev() * 0.35, 0, 1_0000) / 10_000;
  const prevAvgTokensPerRun = clampInt(avgTokensPerRun * (0.85 + randPrev() * 0.35), 500, 4000);
  const previousRuns = clampInt(quota.monthlyRuns * prevRatio * (0.7 + randPrev()), 0, quota.monthlyRuns);
  const previousTokens = clampInt(previousRuns * prevAvgTokensPerRun, 0, quota.monthlyTokens);

  const runsDelta = previousRuns === 0 ? 0 : (usedRuns - previousRuns) / previousRuns;
  const tokensDelta = previousTokens === 0 ? 0 : (usedTokens - previousTokens) / previousTokens;

  const runsDirection: UsageTrend["runsDirection"] =
    Math.abs(runsDelta) < 0.04 ? "flat" : runsDelta > 0 ? "up" : "down";
  const tokensDirection: UsageTrend["tokensDirection"] =
    Math.abs(tokensDelta) < 0.04 ? "flat" : tokensDelta > 0 ? "up" : "down";

  // Placeholder trend points: 7-day daily series (labels + rough distribution).
  const trendPoints: UsageTrendPoint[] = [];
  const daysBack = 6;
  const endDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const weights: number[] = [];
  const directionBoost = runsDirection === "up" ? 1.25 : runsDirection === "down" ? 0.8 : 1;
  const directionBoostTokens = tokensDirection === "up" ? 1.2 : tokensDirection === "down" ? 0.8 : 1;

  for (let i = 0; i <= daysBack; i++) {
    const t = i / daysBack; // 0..1 going backwards
    const dayIndex = daysBack - i; // 0..6 going forward

    // Make distribution slightly biased, but not strictly linear.
    const w =
      (0.65 + rand() * 0.75) *
      (1 + (dayIndex / daysBack) * (directionBoost - 1)) *
      (0.85 + 0.3 * Math.sin((i + seed) * 0.4));
    weights.push(Math.max(0.05, w));
  }

  const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
  let runsAllocated = 0;
  let tokensAllocated = 0;

  for (let i = 0; i <= daysBack; i++) {
    const day = addDaysUtc(endDay, -daysBack + i);
    const label = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "2-digit" }).format(
      day,
    );

    const runsForDay =
      i === daysBack
        ? usedRuns - runsAllocated
        : Math.max(0, Math.round((usedRuns * weights[i]) / weightSum));

    runsAllocated += runsForDay;

    const tokensForDayRaw = Math.max(0, Math.round((usedTokens * weights[i]) / weightSum));
    const tokensForDay =
      i === daysBack ? usedTokens - tokensAllocated : Math.round(tokensForDayRaw * (directionBoostTokens * (0.92 + rand() * 0.18)));

    tokensAllocated += tokensForDay;

    trendPoints.push({
      label,
      runs: runsForDay,
      tokens: tokensForDay,
    });
  }

  // Model usage distribution: 3 common models with plausible token/run ratios.
  const modelIds = ["ps-mini-chat", "ps-standard-chat", "ps-expert-code"];
  const runWeightsRaw = [0.55 + rand() * 0.25, 0.3 + rand() * 0.2, 0.12 + rand() * 0.12];
  const runWeightsSum = runWeightsRaw.reduce((a, b) => a + b, 0) || 1;
  const runWeights = runWeightsRaw.map((w) => w / runWeightsSum);

  const runAlloc: number[] = [
    clampInt(usedRuns * runWeights[0], 0, usedRuns),
    clampInt(usedRuns * runWeights[1], 0, usedRuns),
    0,
  ];
  runAlloc[2] = Math.max(0, usedRuns - runAlloc[0] - runAlloc[1]);

  const tokensPerRunFactors = [0.85 + rand() * 0.2, 1 + rand() * 0.25, 1.2 + rand() * 0.35];
  const modelTokensRaw = runAlloc.map((runs, i) => runs * avgTokensPerRun * tokensPerRunFactors[i]);
  const rawSum = modelTokensRaw.reduce((a, b) => a + b, 0) || 1;
  const scale = usedTokens / rawSum;

  const modelTokens: number[] = [
    Math.round(modelTokensRaw[0] * scale),
    Math.round(modelTokensRaw[1] * scale),
    0,
  ];
  modelTokens[2] = Math.max(0, usedTokens - modelTokens[0] - modelTokens[1]);

  const topModels: ModelUsageEntry[] = modelIds.map((modelId, i) => ({
    modelId,
    runs: runAlloc[i],
    tokens: modelTokens[i],
    tokenShare: usedTokens === 0 ? 0 : modelTokens[i] / usedTokens,
  }));

  topModels.sort((a, b) => b.tokens - a.tokens);

  // Quota status: based on minimum headroom.
  const remainingMinRatio = Math.min(
    quota.monthlyRuns === 0 ? 0 : remainingRuns / quota.monthlyRuns,
    quota.monthlyTokens === 0 ? 0 : remainingTokens / quota.monthlyTokens,
  );

  const status: QuotaStatus = remainingMinRatio > 0.35 ? "healthy" : remainingMinRatio > 0.12 ? "warning" : "depleted";
  const summary =
    status === "healthy"
      ? "You are within free-tier limits for this period."
      : status === "warning"
        ? "You are approaching free-tier quota limits this period."
        : "You may hit free-tier quota limits before the next reset.";

  const cli: UsagePageData["cli"] = {
    counters: {
      usedRuns,
      usedTokens,
      remainingRuns,
      remainingTokens,
      previousRuns,
      previousTokens,
      runsDelta,
      tokensDelta,
    },
    trend: {
      runsDirection,
      tokensDirection,
      points: trendPoints,
    },
  };

  return {
    period,
    quota,
    cli,
    models: { topModels },
    quotaStatus: { status, summary },
  } satisfies UsagePageData;
}

