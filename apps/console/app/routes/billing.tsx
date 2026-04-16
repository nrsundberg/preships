import type { MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
  { title: "Billing | Preships Console" },
  {
    name: "description",
    content: "Manage plans, invoices, and payment details in Preships Console billing.",
  },
];

export default function BillingRoute() {
  return (
    <main className="rounded-xl border border-border bg-panel p-6">
      <h2 className="text-xl font-semibold">Billing</h2>
      <p className="mt-3 text-sm text-text-muted">
        Placeholder billing view. Upcoming work will show plan details, invoices, and payment method management.
      </p>
    </main>
  );
}
