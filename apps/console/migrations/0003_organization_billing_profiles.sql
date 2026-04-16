CREATE TABLE IF NOT EXISTS organization_billing_profiles (
  organization_id TEXT PRIMARY KEY,
  selected_plan_tier TEXT NOT NULL CHECK (selected_plan_tier IN ('free', 'pro', 'enterprise')) DEFAULT 'free',
  billing_email TEXT,
  billing_name TEXT,
  email_invoices INTEGER NOT NULL DEFAULT 1,
  tax_exempt INTEGER NOT NULL DEFAULT 0,
  invoice_memo TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  current_period_end_iso TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_org_billing_profiles_plan_tier
  ON organization_billing_profiles (selected_plan_tier);
