import type { ConsoleSession } from "~/lib/auth.server";

export type DashboardPlanTier = "free";

export type CurrentOrg = {
  orgId: string;
  name: string;
  role: "member" | "owner";
};

export type PlanTierInfo = {
  tier: DashboardPlanTier;
  status: "active";
};

export type RecentActivityKind = "run.succeeded" | "run.failed" | "api_key.created" | "alert.created";

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
};

export type DashboardData = {
  currentOrg: CurrentOrg;
  planTier: PlanTierInfo;
  recentActivity: RecentActivity;
  usageSummary: UsageSummary;
};

type OrgQuery = {
  /**
   * Optional org identifier to support future org-aware queries.
   * When omitted, the dashboard will derive an org context from the authenticated session.
   */
  orgId?: string | null;
};

type OrgContext = {
  orgId: string;
  name: string;
  role: CurrentOrg["role"];
};

function derivePlaceholderOrgContext(session: ConsoleSession): OrgContext {
  const userId = session.user.id ?? "unknown";
  const suffix = userId.slice(0, 8);
  return {
    orgId: `org_${suffix}`,
    name: "Personal Workspace",
    role: "owner",
  };
}

function overrideOrgContextForQuery(context: OrgContext, orgId: string): OrgContext {
  return {
    ...context,
    orgId,
    name: `Organization ${orgId.slice(0, 6)}`,
  };
}

async function getOrgContext(session: ConsoleSession, query: OrgQuery): Promise<OrgContext> {
  const base = derivePlaceholderOrgContext(session);
  if (query.orgId && query.orgId.trim()) {
    return overrideOrgContextForQuery(base, query.orgId.trim());
  }
  return base;
}

export async function getDashboardData({
  session,
  orgId,
}: {
  session: ConsoleSession;
  orgId?: string | null;
}): Promise<DashboardData> {
  const org = await getOrgContext(session, { orgId });
  const now = Date.now();

  const recentActivity: RecentActivity = {
    items: [
      {
        id: "activity_run_succeeded_1",
        kind: "run.succeeded",
        message: "Run succeeded: QA regression suite",
        occurredAtIso: new Date(now - 1000 * 60 * 18).toISOString(),
      },
      {
        id: "activity_api_key_created_1",
        kind: "api_key.created",
        message: "Created a CLI API key",
        occurredAtIso: new Date(now - 1000 * 60 * 60 * 6).toISOString(),
      },
      {
        id: "activity_alert_created_1",
        kind: "alert.created",
        message: "Added an alerts threshold (usage)",
        occurredAtIso: new Date(now - 1000 * 60 * 60 * 26).toISOString(),
      },
      {
        id: "activity_run_failed_1",
        kind: "run.failed",
        message: "Run failed: Response schema mismatch",
        occurredAtIso: new Date(now - 1000 * 60 * 60 * 42).toISOString(),
      },
    ],
  };

  return {
    currentOrg: org,
    planTier: {
      tier: "free",
      status: "active",
    },
    recentActivity,
    usageSummary: {
      periodLabel: "This month",
      costUsd: 0,
      tokens: 1254300,
      runs: 42,
      models: 3,
    },
  };
}

