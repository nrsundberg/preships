import type { ConsoleOrg } from "~/lib/org-context.server";
import { resolveCurrentOrg, type CurrentOrg } from "~/lib/current-org.server";
import type { D1DatabaseLike } from "~/lib/db.server";
import { queryAll, queryFirst } from "~/lib/db.server";

export type DashboardPlanTier = string;

export type PlanTierInfo = {
  tier: DashboardPlanTier;
  status: "active" | "trialing";
};

export type RecentActivityKind = string;

export type RecentActivityItem = {
  id: string;
  kind: RecentActivityKind;
  message: string;
  occurredAtIso: string;
};

export type RecentActivity = {
  items: RecentActivityItem[];
};

export type UsageSummary = {
  periodLabel: string;
  costUsd: number;
  tokens: number;
  runs: number;
  models: number;
  hasData: boolean;
};

export type DashboardData = {
  currentOrg: CurrentOrg;
  planTier: PlanTierInfo;
  recentActivity: RecentActivity;
  usageSummary: UsageSummary;
};

type ActivityRow = {
  id: string;
  event_kind: string;
  target_type: string | null;
  target_id: string | null;
  message: string;
  occurred_at: string | null;
};

type UsageSummaryRow = {
  period_label: string;
  cost_usd: number;
  tokens: number;
  runs: number;
  models: number;
};
function toActivityItems(rows: ActivityRow[]): RecentActivityItem[] {
  return rows.map((row) => ({
    id: row.id,
    kind: row.event_kind,
    message: row.message,
    occurredAtIso: row.occurred_at ?? new Date().toISOString(),
  }));
}

function toSafeNumber(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export async function getDashboardData({
  db,
  org,
  tier,
}: {
  db: D1DatabaseLike;
  org: ConsoleOrg;
  tier: string;
}): Promise<DashboardData> {
  const currentOrg = resolveCurrentOrg(org);

  const recentActivityRows = await queryAll<ActivityRow>(
    db,
    [
      "SELECT id, event_kind, target_type, target_id,",
      "  CASE",
      "    WHEN target_type IS NOT NULL THEN event_kind || ' · ' || target_type",
      "    ELSE event_kind",
      "  END AS message,",
      "  occurred_at",
      "FROM activity_events",
      "WHERE organization_id = ?",
      "ORDER BY occurred_at DESC",
      "LIMIT 12",
    ].join(" "),
    [org.id],
  );

  const usageSummaryRow = await queryFirst<UsageSummaryRow>(
    db,
    [
      "SELECT",
      "  COALESCE(MAX(strftime('%Y-%m', usage_date)), 'this-month') AS period_label,",
      "  COALESCE(CAST(SUM(cost_cents) AS FLOAT) / 100.0, 0) AS cost_usd,",
      "  COALESCE(SUM(model_token_count), 0) AS tokens,",
      "  COALESCE(SUM(run_count), 0) AS runs,",
      "  COALESCE(MAX(model_count), 0) AS models",
      "FROM org_usage_daily",
      "WHERE organization_id = ?",
    ].join(" "),
    [org.id],
  );

  const recentActivity: RecentActivity = {
    items: toActivityItems(recentActivityRows),
  };
  const usageHasData =
    toSafeNumber(usageSummaryRow?.runs) > 0 ||
    toSafeNumber(usageSummaryRow?.tokens) > 0 ||
    toSafeNumber(usageSummaryRow?.cost_usd) > 0;

  return {
    currentOrg,
    planTier: {
      tier,
      status: "active",
    },
    recentActivity,
    usageSummary: {
      periodLabel: usageSummaryRow?.period_label ?? "This month",
      costUsd: toSafeNumber(usageSummaryRow?.cost_usd),
      tokens: toSafeNumber(usageSummaryRow?.tokens),
      runs: toSafeNumber(usageSummaryRow?.runs),
      models: toSafeNumber(usageSummaryRow?.models),
      hasData: usageHasData,
    },
  };
}
