import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";

function formatIsoDateShort(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit" }).format(d);
}

function formatIsoDateTime(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function formatCompactInt(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0, notation: "compact" }).format(
    value,
  );
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { requireConsoleOrgContext } = await import("~/lib/route-auth.server");
  const { getUsagePageDataFromD1 } = await import("~/lib/usage.server");
  const url = new URL(request.url);
  const requestedOrgId = url.searchParams.get("org");
  const { authDb, orgContext } = await requireConsoleOrgContext({
    request,
    context,
    requestedOrgId,
  });
  return getUsagePageDataFromD1({
    db: authDb,
    org: orgContext.org,
    membershipRole: orgContext.membershipRole,
    organizationId: orgContext.org.id,
  });
}

type LoaderData = Awaited<ReturnType<typeof loader>>;

export const meta: MetaFunction = () => [
  { title: "Usage | Preships Console" },
  {
    name: "description",
    content: "Track Preships usage across runs, models, tokens, and cost trends.",
  },
];

export default function UsageRoute() {
  const data = useLoaderData<typeof loader>() satisfies LoaderData;

  const runsUsedPct = Math.round((data.cli.counters.usedRuns / data.quota.monthlyRuns) * 100);
  const tokensUsedPct = Math.round((data.cli.counters.usedTokens / data.quota.monthlyTokens) * 100);
  const runsPctClamped = Math.max(0, Math.min(100, runsUsedPct));
  const tokensPctClamped = Math.max(0, Math.min(100, tokensUsedPct));

  const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

  return (
    <main className="space-y-6 rounded-xl border border-border bg-panel p-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Usage</h2>
          <p className="mt-2 text-sm text-text-muted">
            Free-tier quota window:{" "}
            <span className="font-medium text-text-primary">{data.period.label}</span>
            <span className="text-text-muted">
              {" "}
              ({formatIsoDateShort(data.period.startIso)} - {formatIsoDateShort(data.period.endIso)}
              )
            </span>
          </p>
        </div>
        <div className="rounded-lg border border-border bg-bg px-3 py-2 text-sm">
          <p className="text-xs uppercase tracking-wide text-text-muted">Next reset</p>
          <p className="mt-1 font-medium text-text-primary">
            {formatIsoDateTime(data.period.resetAtIso)}
          </p>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-xl border border-border bg-panel-soft p-5 lg:col-span-1">
          <h3 className="text-lg font-semibold">CLI Runs</h3>
          <p className="mt-2 text-sm text-text-muted">
            Runs are billed by the tokens they generate, grouped by your active quota window.
          </p>

          <div className="mt-5 space-y-4">
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-text-primary">Runs</span>
                <span className="text-text-muted">
                  {nf.format(data.cli.counters.usedRuns)} / {nf.format(data.quota.monthlyRuns)} (
                  {nf.format(data.cli.counters.remainingRuns)} remaining)
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-bg">
                <div className="h-full bg-accent" style={{ width: `${runsPctClamped}%` }} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-text-primary">Tokens</span>
                <span className="text-text-muted">
                  {nf.format(data.cli.counters.usedTokens)} / {nf.format(data.quota.monthlyTokens)}{" "}
                  ({nf.format(data.cli.counters.remainingTokens)} remaining)
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-bg">
                <div className="h-full bg-accent-soft" style={{ width: `${tokensPctClamped}%` }} />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-bg p-3">
              <p className="text-xs uppercase tracking-wide text-text-muted">Period vs previous</p>
              <p className="mt-1 text-sm text-text-primary">
                Runs:{" "}
                <span className="font-medium">
                  {data.cli.counters.runsDelta === 0
                    ? "0%"
                    : `${data.cli.counters.runsDelta > 0 ? "+" : ""}${Math.round(data.cli.counters.runsDelta * 100)}%`}
                </span>{" "}
                <span className="text-text-muted">
                  ({nf.format(data.cli.counters.previousRuns)} prev)
                </span>
              </p>
              <p className="mt-1 text-sm text-text-primary">
                Tokens:{" "}
                <span className="font-medium">
                  {data.cli.counters.tokensDelta === 0
                    ? "0%"
                    : `${data.cli.counters.tokensDelta > 0 ? "+" : ""}${Math.round(data.cli.counters.tokensDelta * 100)}%`}
                </span>{" "}
                <span className="text-text-muted">
                  ({nf.format(data.cli.counters.previousTokens)} prev)
                </span>
              </p>
            </div>

            <div className="rounded-lg border border-border bg-bg p-3">
              <p className="text-xs uppercase tracking-wide text-text-muted">7-day trend</p>
              <p className="mt-1 text-sm text-text-primary">
                Runs: <span className="font-medium">{data.cli.trend.runsDirection}</span> · Tokens:{" "}
                <span className="font-medium">{data.cli.trend.tokensDirection}</span>
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-text-muted sm:grid-cols-3">
                {data.cli.trend.points.slice(-6).map((p) => (
                  <div
                    key={p.label}
                    className="rounded border border-border bg-panel-soft px-2 py-2"
                  >
                    <p className="truncate text-[11px]">{p.label}</p>
                    <p className="mt-1 font-medium text-text-primary">
                      {formatCompactInt(p.runs)} runs
                    </p>
                    <p className="text-[11px]">{formatCompactInt(p.tokens)} tokens</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </article>

        <article className="rounded-xl border border-border bg-panel-soft p-5 lg:col-span-2">
          <h3 className="text-lg font-semibold">Model Usage</h3>
          <p className="mt-2 text-sm text-text-muted">
            Top models by token consumption in the current period.
          </p>

          <div className="mt-5 overflow-hidden rounded-lg border border-border">
            <div className="grid grid-cols-12 gap-0 bg-bg px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
              <div className="col-span-5">Model</div>
              <div className="col-span-2 text-right">Runs</div>
              <div className="col-span-3 text-right">Tokens</div>
              <div className="col-span-2 text-right">Share</div>
            </div>
            <div className="divide-y divide-border">
              {data.models.topModels.length === 0 ? (
                <div className="px-4 py-4 text-sm text-text-muted">
                  No model usage recorded for this period yet.
                </div>
              ) : (
                data.models.topModels.map((m) => (
                  <div key={m.modelId} className="grid grid-cols-12 gap-0 px-4 py-3 text-sm">
                    <div className="col-span-5">
                      <p className="truncate font-medium text-text-primary">{m.modelId}</p>
                    </div>
                    <div className="col-span-2 text-right">
                      <span className="text-text-primary">{nf.format(m.runs)}</span>
                    </div>
                    <div className="col-span-3 text-right">
                      <span className="text-text-primary">{nf.format(m.tokens)}</span>
                    </div>
                    <div className="col-span-2 text-right">
                      <span className="text-text-primary">{Math.round(m.tokenShare * 100)}%</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-border bg-bg p-3">
            <p className="text-xs uppercase tracking-wide text-text-muted">Model trend</p>
            <p className="mt-1 text-sm text-text-muted">
              Model mix reflects current-period events grouped by `model_id`.
            </p>
          </div>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-xl border border-border bg-panel-soft p-5 lg:col-span-3">
          <h3 className="text-lg font-semibold">Quota Status</h3>
          <p className="mt-2 text-sm text-text-muted">{data.quotaStatus.summary}</p>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-border bg-bg p-4">
              <p className="text-xs uppercase tracking-wide text-text-muted">Remaining runs</p>
              <p className="mt-2 text-2xl font-semibold text-text-primary">
                {nf.format(data.cli.counters.remainingRuns)}
              </p>
              <p className="mt-1 text-sm text-text-muted">
                of {nf.format(data.quota.monthlyRuns)} in {data.period.label}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-bg p-4">
              <p className="text-xs uppercase tracking-wide text-text-muted">Remaining tokens</p>
              <p className="mt-2 text-2xl font-semibold text-text-primary">
                {nf.format(data.cli.counters.remainingTokens)}
              </p>
              <p className="mt-1 text-sm text-text-muted">
                of {nf.format(data.quota.monthlyTokens)} in {data.period.label}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-bg p-4">
              <p className="text-xs uppercase tracking-wide text-text-muted">Quota window</p>
              <p className="mt-2 text-2xl font-semibold text-text-primary">{data.period.label}</p>
              <p className="mt-1 text-sm text-text-muted">
                Reset at {formatIsoDateTime(data.period.resetAtIso)}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-text-muted">
              Status:{" "}
              <span
                className={`font-medium ${
                  data.quotaStatus.status === "healthy"
                    ? "text-accent"
                    : data.quotaStatus.status === "warning"
                      ? "text-yellow-300"
                      : "text-red-400"
                }`}
              >
                {data.quotaStatus.status}
              </span>
            </div>
            <div className="text-xs text-text-muted">
              Period boundaries and counters are sourced from org-scoped D1 aggregates.
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
