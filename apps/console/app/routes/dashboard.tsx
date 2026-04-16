import type { MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
  { title: "Dashboard | Preships Console" },
  {
    name: "description",
    content: "Workspace dashboard with project status, spend summary, and alerts for Preships Console.",
  },
];

export default function DashboardRoute() {
  return (
    <main className="grid gap-4 sm:grid-cols-3">
      <article className="rounded-xl border border-border bg-panel p-5">
        <h2 className="text-lg font-semibold">Projects</h2>
        <p className="mt-2 text-sm text-text-muted">0 active projects connected to this workspace.</p>
      </article>
      <article className="rounded-xl border border-border bg-panel p-5">
        <h2 className="text-lg font-semibold">Spend This Month</h2>
        <p className="mt-2 text-sm text-text-muted">$0.00 across model and compute usage.</p>
      </article>
      <article className="rounded-xl border border-border bg-panel p-5">
        <h2 className="text-lg font-semibold">Alerts</h2>
        <p className="mt-2 text-sm text-text-muted">No alerts configured yet. Add usage thresholds in settings.</p>
      </article>
    </main>
  );
}
