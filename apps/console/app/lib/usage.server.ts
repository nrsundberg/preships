import type { D1DatabaseLike } from "~/lib/db.server";
import type { ConsoleOrg } from "~/lib/org-context.server";
import { resolveCurrentOrg, type CurrentOrg } from "~/lib/current-org.server";

export type UsagePeriodBoundary = {
  startIso: string;
  endIso: string;
  resetAtIso: string;
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
  points: UsageTrendPoint[];
};

export type ModelUsageEntry = {
  modelId: string;
  runs: number;
  tokens: number;
  tokenShare: number;
};

export type QuotaStatus = "healthy" | "warning" | "depleted";

export type UsagePageData = {
  currentOrg: CurrentOrg;
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

type OrgTierRow = {
  tier: string;
};

type QuotaRow = {
  monthly_runs: number | null;
  monthly_tokens: number | null;
};

type AggregateRow = {
  used_runs: number | null;
  used_tokens: number | null;
};

type TrendRow = {
  usage_date: string;
  runs: number | null;
  tokens: number | null;
};

function startOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

function nextMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

function addDaysUtc(date: Date, deltaDays: number): Date {
  return new Date(date.getTime() + deltaDays * 24 * 60 * 60 * 1000);
}

function formatMonthLabelUtc(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(d);
}

function toInt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return 0;
}

function getDefaultQuotaByTier(tier: string): FreeTierQuota {
  if (tier === "enterprise") {
    return { monthlyRuns: 20_000, monthlyTokens: 10_000_000 };
  }
  if (tier === "pro") {
    return { monthlyRuns: 2_000, monthlyTokens: 1_000_000 };
  }
  return { monthlyRuns: 250, monthlyTokens: 500_000 };
}

async function ensureOrgQuotaRow(
  db: D1DatabaseLike,
  organizationId: string,
): Promise<FreeTierQuota> {
  const existing = await db
    .prepare(
      "SELECT monthly_runs, monthly_tokens FROM org_usage_quotas WHERE organization_id = ? LIMIT 1",
    )
    .bind(organizationId)
    .first<QuotaRow>();

  if (existing) {
    return {
      monthlyRuns: Math.max(1, toInt(existing.monthly_runs)),
      monthlyTokens: Math.max(1, toInt(existing.monthly_tokens)),
    };
  }

  const tier = await db
    .prepare("SELECT tier FROM organizations WHERE id = ? LIMIT 1")
    .bind(organizationId)
    .first<OrgTierRow>();

  const defaults = getDefaultQuotaByTier(tier?.tier ?? "free");
  const nowIso = new Date().toISOString();

  await db
    .prepare(
      [
        "INSERT INTO org_usage_quotas (organization_id, monthly_runs, monthly_tokens, created_at, updated_at)",
        "VALUES (?, ?, ?, ?, ?)",
      ].join(" "),
    )
    .bind(organizationId, defaults.monthlyRuns, defaults.monthlyTokens, nowIso, nowIso)
    .run();

  return defaults;
}

async function queryPeriodAggregates(
  db: D1DatabaseLike,
  organizationId: string,
  startIsoInclusive: string,
  endIsoExclusive: string,
): Promise<{ usedRuns: number; usedTokens: number }> {
  const row = await db
    .prepare(
      [
        "SELECT",
        "COALESCE(SUM(run_count), 0) AS used_runs,",
        "COALESCE(SUM(model_token_count), 0) AS used_tokens",
        "FROM org_usage_daily",
        "WHERE organization_id = ?",
        "AND usage_date >= ?",
        "AND usage_date < ?",
      ].join(" "),
    )
    .bind(organizationId, startIsoInclusive.slice(0, 10), endIsoExclusive.slice(0, 10))
    .first<AggregateRow>();

  return {
    usedRuns: toInt(row?.used_runs),
    usedTokens: toInt(row?.used_tokens),
  };
}

async function queryTrendPoints(
  db: D1DatabaseLike,
  organizationId: string,
  startIsoInclusive: string,
  endIsoExclusive: string,
  now: Date,
): Promise<UsageTrendPoint[]> {
  const rows = await db
    .prepare(
      [
        "SELECT",
        "usage_date,",
        "COALESCE(SUM(run_count), 0) AS runs,",
        "COALESCE(SUM(model_token_count), 0) AS tokens",
        "FROM org_usage_daily",
        "WHERE organization_id = ?",
        "AND usage_date >= ?",
        "AND usage_date < ?",
        "GROUP BY usage_date",
        "ORDER BY usage_date ASC",
      ].join(" "),
    )
    .bind(organizationId, startIsoInclusive.slice(0, 10), endIsoExclusive.slice(0, 10))
    .all<TrendRow>();

  const byDay = new Map<string, { runs: number; tokens: number }>();
  for (const row of rows) {
    if (!row.usage_date) continue;
    byDay.set(row.usage_date, { runs: toInt(row.runs), tokens: toInt(row.tokens) });
  }

  const endDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
  const points: UsageTrendPoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = addDaysUtc(endDay, -i);
    const dayIso = day.toISOString().slice(0, 10);
    const values = byDay.get(dayIso) ?? { runs: 0, tokens: 0 };
    const label = new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "2-digit",
    }).format(day);
    points.push({ label, runs: values.runs, tokens: values.tokens });
  }

  return points;
}

function toDirection(delta: number): UsageTrend["runsDirection"] {
  if (Math.abs(delta) < 0.04) return "flat";
  return delta > 0 ? "up" : "down";
}

function getQuotaStatus(args: {
  monthlyRuns: number;
  monthlyTokens: number;
  remainingRuns: number;
  remainingTokens: number;
}): UsagePageData["quotaStatus"] {
  const remainingMinRatio = Math.min(
    args.monthlyRuns > 0 ? args.remainingRuns / args.monthlyRuns : 0,
    args.monthlyTokens > 0 ? args.remainingTokens / args.monthlyTokens : 0,
  );

  const status: QuotaStatus =
    remainingMinRatio > 0.35 ? "healthy" : remainingMinRatio > 0.12 ? "warning" : "depleted";
  const summary =
    status === "healthy"
      ? "You are within quota limits for this period."
      : status === "warning"
        ? "You are approaching quota limits for this period."
        : "You may hit quota limits before the next reset.";

  return { status, summary };
}

export async function getUsagePageDataFromD1(args: {
  db: D1DatabaseLike;
  org: ConsoleOrg;
  organizationId: string;
  now?: Date;
}): Promise<UsagePageData> {
  const now = args.now ?? new Date();
  const periodStart = startOfMonthUtc(now);
  const periodReset = nextMonthUtc(now);
  const periodEndInclusive = new Date(periodReset.getTime() - 1);
  const previousPeriodStart = startOfMonthUtc(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)),
  );

  const quota = await ensureOrgQuotaRow(args.db, args.organizationId);

  const current = await queryPeriodAggregates(
    args.db,
    args.organizationId,
    periodStart.toISOString(),
    periodReset.toISOString(),
  );
  const previous = await queryPeriodAggregates(
    args.db,
    args.organizationId,
    previousPeriodStart.toISOString(),
    periodStart.toISOString(),
  );

  const usedRuns = current.usedRuns;
  const usedTokens = current.usedTokens;
  const remainingRuns = Math.max(0, quota.monthlyRuns - usedRuns);
  const remainingTokens = Math.max(0, quota.monthlyTokens - usedTokens);
  const previousRuns = previous.usedRuns;
  const previousTokens = previous.usedTokens;

  const runsDelta =
    previousRuns > 0 ? (usedRuns - previousRuns) / previousRuns : usedRuns > 0 ? 1 : 0;
  const tokensDelta =
    previousTokens > 0 ? (usedTokens - previousTokens) / previousTokens : usedTokens > 0 ? 1 : 0;

  const period: UsagePeriodBoundary = {
    startIso: periodStart.toISOString(),
    endIso: periodEndInclusive.toISOString(),
    resetAtIso: periodReset.toISOString(),
    label: formatMonthLabelUtc(periodStart.toISOString()),
  };

  const trendPoints = await queryTrendPoints(
    args.db,
    args.organizationId,
    periodStart.toISOString(),
    periodReset.toISOString(),
    now,
  );
  const quotaStatus = getQuotaStatus({
    monthlyRuns: quota.monthlyRuns,
    monthlyTokens: quota.monthlyTokens,
    remainingRuns,
    remainingTokens,
  });

  return {
    currentOrg: resolveCurrentOrg(args.org),
    period,
    quota,
    cli: {
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
        runsDirection: toDirection(runsDelta),
        tokensDirection: toDirection(tokensDelta),
        points: trendPoints,
      },
    },
    // `org_usage_daily` is organization-level; no per-model breakdown exists in this aggregate table.
    models: { topModels: [] },
    quotaStatus,
  };
}
