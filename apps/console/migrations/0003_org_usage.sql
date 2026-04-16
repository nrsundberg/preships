CREATE TABLE IF NOT EXISTS org_usage_quotas (
  organization_id TEXT PRIMARY KEY,
  monthly_runs INTEGER NOT NULL,
  monthly_tokens INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS org_usage_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  model_id TEXT,
  tokens INTEGER NOT NULL DEFAULT 0,
  cost_micros INTEGER NOT NULL DEFAULT 0,
  occurred_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'cli'
);

CREATE INDEX IF NOT EXISTS idx_org_usage_events_org_occurred_at
  ON org_usage_events (organization_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_org_usage_events_org_model_occurred_at
  ON org_usage_events (organization_id, model_id, occurred_at);
