import type { MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
  { title: "Usage | Preships Console" },
  {
    name: "description",
    content: "Track Preships usage across runs, models, tokens, and cost trends.",
  },
];

export default function UsageRoute() {
  return (
    <main className="rounded-xl border border-border bg-panel p-6">
      <h2 className="text-xl font-semibold">Usage</h2>
      <p className="mt-3 text-sm text-text-muted">
        Placeholder usage view. Upcoming work will show token, run, and cost breakdowns by project and model.
      </p>
    </main>
  );
}
