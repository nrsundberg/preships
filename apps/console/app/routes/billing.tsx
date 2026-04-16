import { Form, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
  { title: "Billing | Preships Console" },
  {
    name: "description",
    content: "Manage plans, limits, and payment details for your Preships Console workspace.",
  },
];

type BillingActionResult = {
  ok: boolean;
  message: string;
  error?: string;
};

type BillingCloudEnv = {
  STRIPE_SECRET_KEY?: string;
  STRIPE_SECRET?: string;
  STRIPE_PRICE_PRO?: string;
  STRIPE_PRICE_ENTERPRISE?: string;
  STRIPE_PRODUCT_PRO?: string;
  STRIPE_PRODUCT_ENTERPRISE?: string;
};

function normalizeStripeId(
  value: string | undefined,
  expectedPrefix: "price_" | "prod_",
): string | undefined {
  const raw = (value ?? "").trim();
  if (!raw) return undefined;
  if (raw.includes("replace_me")) return undefined;
  return raw.startsWith(expectedPrefix) ? raw : undefined;
}

function parseCheckbox(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { requireCurrentOrgAccess } = await import("~/lib/current-org.server");
  const { getBillingModelForOrg } = await import("~/lib/billing.server");
  const { authDb, org } = await requireCurrentOrgAccess({ request, context });

  return getBillingModelForOrg({
    db: authDb,
    orgId: org.id,
    orgName: org.name,
  });
}

export async function action({
  request,
  context,
}: ActionFunctionArgs): Promise<BillingActionResult> {
  const { requireCurrentOrgAccess } = await import("~/lib/current-org.server");
  const {
    getBillingModelForOrg,
    createStripeCheckoutSession,
    createStripePortalSession,
    isBillingPlanTier,
    updateBillingContactAndPreferences,
    updateSelectedPlanTier,
  } = await import("~/lib/billing.server");
  const { authDb, org } = await requireCurrentOrgAccess({ request, context });

  const billingModel = await getBillingModelForOrg({
    db: authDb,
    orgId: org.id,
    orgName: org.name,
  });

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const cloudflareContext =
    typeof context === "object" && context !== null && "cloudflare" in context
      ? (context.cloudflare as { env?: BillingCloudEnv })
      : undefined;
  const env = cloudflareContext?.env;
  const stripeSecret = env?.STRIPE_SECRET_KEY ?? env?.STRIPE_SECRET;

  if (intent === "update-plan-tier") {
    const tierValue = String(formData.get("tier") ?? "");
    if (!isBillingPlanTier(tierValue)) {
      return { ok: false, message: "Unable to update plan.", error: "Invalid plan tier." };
    }

    await updateSelectedPlanTier({
      db: authDb,
      orgId: org.id,
      tier: tierValue,
    });
    return { ok: true, message: "Plan preference saved." };
  }

  if (intent === "update-billing-contact") {
    const billingEmail = String(formData.get("billingEmail") ?? "").trim();
    if (billingEmail.length > 0 && !billingEmail.includes("@")) {
      return {
        ok: false,
        message: "Unable to save billing details.",
        error: "Billing email must be a valid email address.",
      };
    }

    await updateBillingContactAndPreferences({
      db: authDb,
      orgId: org.id,
      billingEmail,
      billingName: String(formData.get("billingName") ?? ""),
      emailInvoices: parseCheckbox(formData, "emailInvoices"),
      taxExempt: parseCheckbox(formData, "taxExempt"),
      invoiceMemo: String(formData.get("invoiceMemo") ?? ""),
    });
    return { ok: true, message: "Billing contact and preferences saved." };
  }

  if (intent === "open-checkout") {
    if (!stripeSecret) {
      return {
        ok: false,
        message: "Stripe is not configured.",
        error: "Missing STRIPE_SECRET_KEY or STRIPE_SECRET.",
      };
    }
    const targetTier = String(formData.get("tier") ?? "pro");
    const priceId = normalizeStripeId(
      targetTier === "enterprise" ? env?.STRIPE_PRICE_ENTERPRISE : env?.STRIPE_PRICE_PRO,
      "price_",
    );
    const productId = normalizeStripeId(
      targetTier === "enterprise" ? env?.STRIPE_PRODUCT_ENTERPRISE : env?.STRIPE_PRODUCT_PRO,
      "prod_",
    );
    const fallbackAmountCents = targetTier === "enterprise" ? 5000 : 2000;
    if (!priceId && !productId) {
      return {
        ok: false,
        message: "Stripe is not fully configured.",
        error:
          "Missing STRIPE_PRICE_PRO/STRIPE_PRICE_ENTERPRISE or STRIPE_PRODUCT_PRO/STRIPE_PRODUCT_ENTERPRISE.",
      };
    }
    const origin = new URL(request.url).origin;
    const checkoutUrl = await createStripeCheckoutSession({
      db: authDb,
      orgId: org.id,
      orgName: org.name,
      billingEmail: billingModel.contact.billingEmail,
      stripeSecretKey: stripeSecret,
      stripePriceId: priceId,
      stripeProductId: priceId ? undefined : productId,
      unitAmountCents: priceId ? undefined : fallbackAmountCents,
      successUrl: `${origin}/billing?checkout=success`,
      cancelUrl: `${origin}/billing?checkout=cancel`,
    });
    throw Response.redirect(checkoutUrl, 302);
  }

  if (intent === "open-portal") {
    if (!stripeSecret) {
      return {
        ok: false,
        message: "Stripe is not configured.",
        error: "Missing STRIPE_SECRET_KEY or STRIPE_SECRET.",
      };
    }
    const origin = new URL(request.url).origin;
    const portalUrl = await createStripePortalSession({
      db: authDb,
      orgId: org.id,
      orgName: org.name,
      billingEmail: billingModel.contact.billingEmail,
      stripeSecretKey: stripeSecret,
      returnUrl: `${origin}/billing`,
    });
    throw Response.redirect(portalUrl, 302);
  }

  return { ok: false, message: "No changes applied.", error: "Unknown action intent." };
}

export default function BillingRoute() {
  const billing = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { limits, org, plan, stripe } = billing;

  function formatCompactInt(value: number): string {
    return new Intl.NumberFormat(undefined, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }

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
            Renewal: {new Date(plan.currentPeriodEndISO).toLocaleDateString()}
          </p>

          <Form method="post" className="mt-4 space-y-3">
            <input type="hidden" name="intent" value="update-plan-tier" />
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text-primary">Plan tier</span>
              <select
                name="tier"
                defaultValue={plan.tier}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              >
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </label>
            <button
              type="submit"
              className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90"
            >
              Save plan preference
            </button>
          </Form>

          <Form method="post" className="mt-3 space-y-2">
            <input type="hidden" name="intent" value="open-checkout" />
            <input type="hidden" name="tier" value={plan.tier === "free" ? "pro" : plan.tier} />
            <button
              type="submit"
              className="block w-full rounded-lg border border-border bg-panel px-4 py-2 text-center text-sm font-medium text-text-primary hover:bg-panel-soft"
            >
              Open Stripe checkout
            </button>
          </Form>
          <Form method="post" className="mt-2">
            <input type="hidden" name="intent" value="open-portal" />
            <button
              type="submit"
              className="block w-full rounded-lg border border-border bg-panel px-4 py-2 text-center text-sm font-medium text-text-primary hover:bg-panel-soft"
            >
              Open Stripe billing portal
            </button>
          </Form>

          {!stripe.isIntegrated && (
            <p className="mt-3 text-xs text-text-muted">
              Stripe IDs are populated once checkout/portal sessions are created.
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
          <h3 className="text-sm font-semibold">Billing details</h3>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-text-muted">Stripe customer</span>
              <code className="text-xs text-text-muted">{stripe.customerId ?? "not set"}</code>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-text-muted">Stripe subscription</span>
              <code className="text-xs text-text-muted">{stripe.subscriptionId ?? "not set"}</code>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-text-muted">Price ID</span>
              <code className="text-xs text-text-muted">{stripe.priceId ?? "not set"}</code>
            </div>
          </div>

          <Form method="post" className="mt-4 space-y-3">
            <input type="hidden" name="intent" value="update-billing-contact" />
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text-primary">
                Billing email
              </span>
              <input
                name="billingEmail"
                type="email"
                defaultValue={billing.contact.billingEmail ?? ""}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text-primary">
                Billing contact name
              </span>
              <input
                name="billingName"
                type="text"
                defaultValue={billing.contact.billingName ?? ""}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              />
            </label>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                name="emailInvoices"
                defaultChecked={billing.preferences.emailInvoices}
                className="mt-1 h-4 w-4 rounded border-border bg-bg text-accent outline-none focus:ring-accent"
              />
              <span className="text-sm text-text-primary">Send invoice emails</span>
            </label>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                name="taxExempt"
                defaultChecked={billing.preferences.taxExempt}
                className="mt-1 h-4 w-4 rounded border-border bg-bg text-accent outline-none focus:ring-accent"
              />
              <span className="text-sm text-text-primary">Tax exempt organization</span>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text-primary">Invoice memo</span>
              <textarea
                name="invoiceMemo"
                rows={3}
                defaultValue={billing.preferences.invoiceMemo ?? ""}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              />
            </label>
            <button
              type="submit"
              className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90"
            >
              Save billing details
            </button>
          </Form>
        </section>
      </div>

      {actionData ? (
        <p
          className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
            actionData.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-rose-500/30 bg-rose-500/10 text-rose-200"
          }`}
        >
          {actionData.error ? `${actionData.message} ${actionData.error}` : actionData.message}
        </p>
      ) : null}
    </main>
  );
}
