CREATE TABLE IF NOT EXISTS org_profiles (
  organization_id TEXT PRIMARY KEY,
  display_name TEXT,
  website_url TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  workspace_slug TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_org_profiles_workspace_slug
  ON org_profiles (workspace_slug);

CREATE TABLE IF NOT EXISTS org_billing (
  organization_id TEXT PRIMARY KEY,
  plan_tier TEXT NOT NULL DEFAULT 'free',
  plan_status TEXT NOT NULL DEFAULT 'active',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  current_period_start_at TEXT,
  current_period_end_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_org_billing_plan_tier
  ON org_billing (plan_tier);

CREATE TABLE IF NOT EXISTS org_usage_daily (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  usage_date TEXT NOT NULL,
  run_count INTEGER NOT NULL DEFAULT 0,
  model_token_count INTEGER NOT NULL DEFAULT 0,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  model_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE (organization_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_org_usage_daily_org_date
  ON org_usage_daily (organization_id, usage_date DESC);

CREATE TABLE IF NOT EXISTS org_notifications (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT,
  notification_type TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  enabled INTEGER NOT NULL DEFAULT 1,
  threshold_value INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_org_notifications_org_user
  ON org_notifications (organization_id, user_id);

CREATE INDEX IF NOT EXISTS idx_org_notifications_org_type
  ON org_notifications (organization_id, notification_type);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  key_name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  last_used_at TEXT,
  expires_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_keys_org_status
  ON api_keys (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_api_keys_org_created_at
  ON api_keys (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  actor_user_id TEXT,
  event_kind TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata_json TEXT,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_activity_events_org_occurred_at
  ON activity_events (organization_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_events_org_kind_occurred_at
  ON activity_events (organization_id, event_kind, occurred_at DESC);
