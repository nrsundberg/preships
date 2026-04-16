import { redirect, useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";

import {
  formatCompactInt,
  getBillingModelPlaceholder,
  getOrgNamePlaceholder,
  getPlanTierForOrg,
} from "~/lib/billing.server";

import { getConsoleSession } from "~/lib/auth.server";

export const meta: MetaFunction = () => [
  { title: "Billing | Preships Console" },
  {
    name: "description",
    content: "Manage plans, limits, and payment details for your Preships Console workspace.",
  },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await getConsoleSession(request);
  if (!session) {
    const url = new URL(request.url);
    const redirectTo = `${url.pathname}${url.search}`;
    throw redirect(`/login?redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  // Placeholder org + plan derived from the currently authenticated console user.
  const orgId = `org_${session.user.id}`;
  const orgName = getOrgNamePlaceholder(session.user.email);
  const planTier = getPlanTierForOrg(orgId);

  return getBillingModelPlaceholder({ orgId, orgName, planTier });
}

export default function BillingRoute() {
  const billing = useLoaderData<typeof loader>();
  const { limits, org, plan, stripe, links } = billing;

  return (
    <main className="rounded-xl border border-border bg-panel p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Billing</h2>
          <p className="mt-2 text-sm text-text-muted">
            Manage plans and payment details for{" "}
            <span className="text-text-primary">{org.name}</span>.
          </p>
        </div>

        <div className="w-full rounded-lg border border-border bg-panel-soft p-4 sm:max-w-xs">
          <p className="text-xs uppercase tracking-wide text-text-muted">Current plan</p>
          <p className="mt-1 text-lg font-semibold">{plan.name}</p>
          <p className="mt-1 text-sm text-text-muted">
            Status: <span className="text-text-primary">{plan.status}</span>
          </p>
          <p className="mt-2 text-xs text-text-muted">
            Renewal (placeholder):{" "}
            {new Date(plan.currentPeriodEndISO).toLocaleDateString()}
          </p>

          <div className="mt-4 space-y-3">
            <button
              type="button"
              disabled={!stripe.isIntegrated}
              className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Upgrade plan
            </button>
            <button
              type="button"
              disabled={!stripe.isIntegrated}
              className="w-full rounded-lg border border-border bg-panel px-4 py-2 text-sm font-medium text-text-primary hover:bg-panel-soft disabled:cursor-not-allowed disabled:opacity-60"
            >
              Manage billing
            </button>
          </div>

          {!stripe.isIntegrated && (
            <p className="mt-3 text-xs text-text-muted">
              Stripe integration scaffolded. Checkout/portal wiring will come next.
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-border bg-panel-soft p-4">
          <h3 className="text-sm font-semibold">Limits</h3>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex items-baseline justify-between gap-3">
              <span className="text-text-muted">Seats</span>
              <span className="font-medium text-text-primary">{limits.seats}</span>
            </li>
            <li className="flex items-baseline justify-between gap-3">
              <span className="text-text-muted">Projects</span>
              <span className="font-medium text-text-primary">{limits.projects}</span>
            </li>
            <li className="flex items-baseline justify-between gap-3">
              <span className="text-text-muted">Runs / month</span>
              <span className="font-medium text-text-primary">
                {formatCompactInt(limits.monthlyRuns)}
              </span>
            </li>
            <li className="flex items-baseline justify-between gap-3">
              <span className="text-text-muted">Model tokens / month</span>
              <span className="font-medium text-text-primary">
                {formatCompactInt(limits.monthlyModelTokens)}{" "}
                <span className="text-text-muted">tokens</span>
              </span>
            </li>
          </ul>
        </section>

        <section className="rounded-lg border border-border bg-panel-soft p-4">
          <h3 className="text-sm font-semibold">Billing details (Stripe placeholder)</h3>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-text-muted">Stripe customer</span>
              <code className="text-xs text-text-muted">
                {stripe.customerId ?? "not set"}
              </code>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-text-muted">Stripe subscription</span>
              <code className="text-xs text-text-muted">
                {stripe.subscriptionId ?? "not set"}
              </code>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-text-muted">Price ID</span>
              <code className="text-xs text-text-muted">
                {stripe.priceId ?? "not set"}
              </code>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-xs text-text-muted">
              Upgrade checkout URL (placeholder):
            </p>
            <code className="block overflow-x-auto rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-muted">
              {links.upgradeCheckoutUrl}
            </code>

            <p className="text-xs text-text-muted">
              Billing portal URL (placeholder):
            </p>
            <code className="block overflow-x-auto rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-muted">
              {links.billingPortalUrl}
            </code>
          </div>
        </section>
      </div>
    </main>
  );
}
