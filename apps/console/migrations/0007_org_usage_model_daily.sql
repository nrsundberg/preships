CREATE TABLE IF NOT EXISTS org_usage_model_daily (
  organization_id TEXT NOT NULL,
  usage_date TEXT NOT NULL,
  model_id TEXT NOT NULL,
  tokens INTEGER NOT NULL DEFAULT 0,
  runs INTEGER NOT NULL DEFAULT 0,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  PRIMARY KEY (organization_id, usage_date, model_id)
);

CREATE INDEX IF NOT EXISTS idx_org_usage_model_daily_org_date
  ON org_usage_model_daily (organization_id, usage_date DESC);

CREATE INDEX IF NOT EXISTS idx_org_usage_model_daily_org_model_date
  ON org_usage_model_daily (organization_id, model_id, usage_date DESC);

