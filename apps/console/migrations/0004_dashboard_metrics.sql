CREATE TABLE IF NOT EXISTS org_activity_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  actor_user_id TEXT,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_org_activity_events_org_occurred
  ON org_activity_events (organization_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_org_activity_events_actor
  ON org_activity_events (actor_user_id);

CREATE TABLE IF NOT EXISTS dashboard_usage_monthly (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_label TEXT NOT NULL,
  cost_usd REAL NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,
  runs INTEGER NOT NULL DEFAULT 0,
  models INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_usage_monthly_org_period
  ON dashboard_usage_monthly (organization_id, period_start DESC);
