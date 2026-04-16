import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { getDashboardData } = await import("~/lib/dashboard.server");
  const { requireConsoleOrgContext } = await import("~/lib/route-auth.server");
  const url = new URL(request.url);
  const requestedOrgId = url.searchParams.get("org");
  const { authDb, orgContext } = await requireConsoleOrgContext({
    request,
    context,
    requestedOrgId,
  });
  const dashboard = await getDashboardData({
    db: authDb,
    org: orgContext.org,
    membershipRole: orgContext.membershipRole,
    tier: orgContext.tier,
  });
  return { dashboard };
}

export const meta: MetaFunction = () => [
  { title: "Dashboard | Preships Console" },
  {
    name: "description",
    content:
      "Workspace dashboard with org overview, plan tier, recent activity, and usage summary.",
  },
];

function formatCurrencyUsd(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function formatDateTime(iso: string) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function DashboardRoute() {
  const { dashboard } = useLoaderData<typeof loader>();
  const showDashboardZeroState =
    dashboard.recentActivity.items.length === 0 && !dashboard.usageSummary.hasData;

  return (
    <main className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <section className="rounded-xl border border-border bg-panel p-5 lg:col-span-1">
        <h2 className="text-lg font-semibold">Current organization</h2>
        <p className="mt-2 text-sm text-text-muted">
          {dashboard.currentOrg.name}{" "}
          <span className="ml-1 inline-flex items-center rounded-md border border-border bg-bg px-2 py-0.5 font-mono text-xs text-text-muted">
            {dashboard.currentOrg.orgId}
          </span>
        </p>
        <p className="mt-3 text-sm text-text-muted">Role: {dashboard.currentOrg.role}</p>
      </section>

      <section className="rounded-xl border border-border bg-panel p-5 lg:col-span-1">
        <h2 className="text-lg font-semibold">Plan tier</h2>
        <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-border bg-panel-soft px-3 py-1.5">
          <span className="text-sm font-semibold text-text-primary">{dashboard.planTier.tier}</span>
          <span className="text-xs text-text-muted">({dashboard.planTier.status})</span>
        </div>
        <p className="mt-3 text-sm text-text-muted">
          This reflects the active tier for your current workspace context.
        </p>
      </section>

      <section className="rounded-xl border border-border bg-panel p-5 lg:col-span-2">
        <h2 className="text-lg font-semibold">Recent activity</h2>
        {dashboard.recentActivity.items.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">
            No activity has been recorded for this organization yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {dashboard.recentActivity.items.map((item) => (
              <li key={item.id} className="rounded-lg border border-border bg-bg px-3 py-2 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-text-content">{item.message}</p>
                  <time className="shrink-0 text-xs text-text-muted" dateTime={item.occurredAtIso}>
                    {formatDateTime(item.occurredAtIso)}
                  </time>
                </div>
                <p className="mt-1 text-xs text-text-muted">{item.kind}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-border bg-panel p-5 lg:col-span-1">
        <h2 className="text-lg font-semibold">
          Usage summary ({dashboard.usageSummary.periodLabel})
        </h2>
        {dashboard.usageSummary.hasData ? (
          <div className="mt-3 space-y-3">
            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-bg p-3">
                <dt className="text-xs text-text-muted">Cost</dt>
                <dd className="mt-1 text-sm font-semibold">
                  {formatCurrencyUsd(dashboard.usageSummary.costUsd)}
                </dd>
              </div>
              <div className="rounded-lg border border-border bg-bg p-3">
                <dt className="text-xs text-text-muted">Tokens</dt>
                <dd className="mt-1 text-sm font-semibold">
                  {dashboard.usageSummary.tokens.toLocaleString()}
                </dd>
              </div>
              <div className="rounded-lg border border-border bg-bg p-3">
                <dt className="text-xs text-text-muted">Runs</dt>
                <dd className="mt-1 text-sm font-semibold">
                  {dashboard.usageSummary.runs.toLocaleString()}
                </dd>
              </div>
              <div className="rounded-lg border border-border bg-bg p-3">
                <dt className="text-xs text-text-muted">Models</dt>
                <dd className="mt-1 text-sm font-semibold">
                  {dashboard.usageSummary.models.toLocaleString()}
                </dd>
              </div>
            </dl>
            <p className="text-sm text-text-muted">
              Metrics are sourced from workspace usage snapshots for this organization.
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-text-muted">
            No usage aggregates are available yet. Summary cards will populate after org activity is
            recorded.
          </p>
        )}
      </section>
      {showDashboardZeroState ? (
        <section className="rounded-xl border border-border bg-panel-soft p-5 lg:col-span-3">
          <h2 className="text-lg font-semibold">Get started</h2>
          <p className="mt-2 text-sm text-text-muted">
            This workspace has no recorded runs or activity yet. Launch a CLI run to begin
            collecting dashboard metrics for your current organization.
          </p>
        </section>
      ) : null}
    </main>
  );
}
