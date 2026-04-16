import type { D1DatabaseLike } from "./db.server";

export type BillingPlanTier = "free" | "pro" | "enterprise";

export type BillingLimits = {
  seats: number;
  projects: number;
  monthlyRuns: number;
  monthlyModelTokens: number;
};

export type BillingPlan = {
  tier: BillingPlanTier;
  name: string;
  status: "active" | "trialing";
  currentPeriodEndISO: string;
};

export type BillingStripeState = {
  isIntegrated: boolean;
  customerId: string | null;
  subscriptionId: string | null;
  priceId: string | null;
};

export type BillingPreferences = {
  emailInvoices: boolean;
  taxExempt: boolean;
  invoiceMemo: string | null;
};

export type BillingContact = {
  billingEmail: string | null;
  billingName: string | null;
};

export type BillingLinks = {
  upgradeCheckoutUrl: string;
  billingPortalUrl: string;
};

export type BillingModel = {
  org: {
    id: string;
    name: string;
  };
  plan: BillingPlan;
  limits: BillingLimits;
  stripe: BillingStripeState;
  contact: BillingContact;
  preferences: BillingPreferences;
  links: BillingLinks;
};

type BillingProfileRow = {
  organization_id: string;
  plan_tier: BillingPlanTier;
  plan_status: "active" | "trialing";
  billing_email: string | null;
  billing_name: string | null;
  email_invoices: number;
  tax_exempt: number;
  invoice_memo: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  current_period_end_at: string | null;
};

export function isBillingPlanTier(value: string): value is BillingPlanTier {
  return value === "free" || value === "pro" || value === "enterprise";
}

function boolToSql(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function defaultCurrentPeriodEndIso(): string {
  return addDaysISO(30);
}

function getPlanName(tier: BillingPlanTier): string {
  if (tier === "free") return "Free";
  if (tier === "pro") return "Pro";
  return "Enterprise";
}

export function getLimitsForTier(tier: BillingPlanTier): BillingLimits {
  switch (tier) {
    case "free":
      return {
        seats: 3,
        projects: 1,
        monthlyRuns: 200,
        monthlyModelTokens: 100_000,
      };
    case "pro":
      return {
        seats: 10,
        projects: 20,
        monthlyRuns: 2_000,
        monthlyModelTokens: 1_000_000,
      };
    case "enterprise":
      return {
        seats: 50,
        projects: 200,
        monthlyRuns: 20_000,
        monthlyModelTokens: 10_000_000,
      };
  }
}

function toBillingModel(args: {
  orgId: string;
  orgName: string;
  row: BillingProfileRow;
}): BillingModel {
  return {
    org: {
      id: args.orgId,
      name: args.orgName,
    },
    plan: {
      tier: args.row.plan_tier,
      name: getPlanName(args.row.plan_tier),
      status: args.row.plan_status,
      currentPeriodEndISO: args.row.current_period_end_at ?? defaultCurrentPeriodEndIso(),
    },
    limits: getLimitsForTier(args.row.plan_tier),
    stripe: {
      isIntegrated: Boolean(
        args.row.stripe_customer_id || args.row.stripe_subscription_id || args.row.stripe_price_id,
      ),
      customerId: args.row.stripe_customer_id,
      subscriptionId: args.row.stripe_subscription_id,
      priceId: args.row.stripe_price_id,
    },
    contact: {
      billingEmail: args.row.billing_email,
      billingName: args.row.billing_name,
    },
    preferences: {
      emailInvoices: Boolean(args.row.email_invoices),
      taxExempt: Boolean(args.row.tax_exempt),
      invoiceMemo: args.row.invoice_memo,
    },
    links: {
      upgradeCheckoutUrl: `/api/billing/checkout?orgId=${encodeURIComponent(args.orgId)}`,
      billingPortalUrl: `/api/billing/portal?orgId=${encodeURIComponent(args.orgId)}`,
    },
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

async function ensureOrgBillingTable(db: D1DatabaseLike): Promise<void> {
  await db
    .prepare(
      [
        "CREATE TABLE IF NOT EXISTS org_billing (",
        "organization_id TEXT PRIMARY KEY,",
        "plan_tier TEXT NOT NULL DEFAULT 'free',",
        "plan_status TEXT NOT NULL DEFAULT 'active',",
        "stripe_customer_id TEXT,",
        "stripe_subscription_id TEXT,",
        "stripe_price_id TEXT,",
        "current_period_start_at TEXT,",
        "current_period_end_at TEXT,",
        "billing_email TEXT,",
        "billing_name TEXT,",
        "email_invoices INTEGER NOT NULL DEFAULT 1,",
        "tax_exempt INTEGER NOT NULL DEFAULT 0,",
        "invoice_memo TEXT,",
        "created_at TEXT NOT NULL,",
        "updated_at TEXT NOT NULL",
        ")",
      ].join(" "),
    )
    .bind()
    .run();

  for (const statement of [
    "ALTER TABLE org_billing ADD COLUMN billing_email TEXT",
    "ALTER TABLE org_billing ADD COLUMN billing_name TEXT",
    "ALTER TABLE org_billing ADD COLUMN email_invoices INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE org_billing ADD COLUMN tax_exempt INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE org_billing ADD COLUMN invoice_memo TEXT",
  ]) {
    try {
      await db.prepare(statement).bind().run();
    } catch {
      // Ignore duplicate-column failures on already-migrated environments.
    }
  }
}

async function getBillingProfileRow(
  db: D1DatabaseLike,
  organizationId: string,
): Promise<BillingProfileRow | null> {
  await ensureOrgBillingTable(db);
  return db
    .prepare(
      [
        "SELECT organization_id, plan_tier, plan_status, billing_email, billing_name,",
        "email_invoices, tax_exempt, invoice_memo, stripe_customer_id,",
        "stripe_subscription_id, stripe_price_id, current_period_end_at",
        "FROM org_billing WHERE organization_id = ? LIMIT 1",
      ].join(" "),
    )
    .bind(organizationId)
    .first<BillingProfileRow>();
}

async function createDefaultBillingProfile(
  db: D1DatabaseLike,
  organizationId: string,
): Promise<BillingProfileRow> {
  await ensureOrgBillingTable(db);
  const defaultTier: BillingPlanTier = "free";
  const currentPeriodEndIso = defaultCurrentPeriodEndIso();
  const now = nowIso();
  await db
    .prepare(
      [
        "INSERT INTO org_billing (",
        "organization_id, plan_tier, plan_status, email_invoices, tax_exempt, current_period_end_at, created_at, updated_at",
        ") VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ].join(" "),
    )
    .bind(organizationId, defaultTier, "active", 1, 0, currentPeriodEndIso, now, now)
    .run();

  return {
    organization_id: organizationId,
    plan_tier: defaultTier,
    plan_status: "active",
    billing_email: null,
    billing_name: null,
    email_invoices: 1,
    tax_exempt: 0,
    invoice_memo: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    stripe_price_id: null,
    current_period_end_at: currentPeriodEndIso,
  };
}

export async function getBillingModelForOrg(params: {
  db: D1DatabaseLike;
  orgId: string;
  orgName: string;
}): Promise<BillingModel> {
  let row = await getBillingProfileRow(params.db, params.orgId);
  if (!row) {
    row = await createDefaultBillingProfile(params.db, params.orgId);
  }
  return toBillingModel({ orgId: params.orgId, orgName: params.orgName, row });
}

export async function updateSelectedPlanTier(params: {
  db: D1DatabaseLike;
  orgId: string;
  tier: BillingPlanTier;
}): Promise<void> {
  await ensureOrgBillingTable(params.db);
  await params.db
    .prepare(
      ["UPDATE org_billing", "SET plan_tier = ?, updated_at = ?", "WHERE organization_id = ?"].join(
        " ",
      ),
    )
    .bind(params.tier, nowIso(), params.orgId)
    .run();
}

export async function updateBillingContactAndPreferences(params: {
  db: D1DatabaseLike;
  orgId: string;
  billingEmail: string | null;
  billingName: string | null;
  emailInvoices: boolean;
  taxExempt: boolean;
  invoiceMemo: string | null;
}): Promise<void> {
  await ensureOrgBillingTable(params.db);
  await params.db
    .prepare(
      [
        "UPDATE org_billing",
        "SET billing_email = ?, billing_name = ?, email_invoices = ?, tax_exempt = ?, invoice_memo = ?, updated_at = ?",
        "WHERE organization_id = ?",
      ].join(" "),
    )
    .bind(
      normalizeOptionalText(params.billingEmail),
      normalizeOptionalText(params.billingName),
      boolToSql(params.emailInvoices),
      boolToSql(params.taxExempt),
      normalizeOptionalText(params.invoiceMemo),
      nowIso(),
      params.orgId,
    )
    .run();
}
