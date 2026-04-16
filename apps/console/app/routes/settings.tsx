import type { MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
  { title: "Settings | Preships Console" },
  {
    name: "description",
    content: "Configure workspace members, API keys, and notification preferences in Preships Console.",
  },
];

export default function SettingsRoute() {
  return (
    <main className="rounded-xl border border-border bg-panel p-6">
      <h2 className="text-xl font-semibold">Settings</h2>
      <p className="mt-3 text-sm text-text-muted">
        Placeholder settings view. Upcoming work will include members, API keys, and notification preferences.
      </p>
    </main>
  );
}
