CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('personal', 'team')) DEFAULT 'personal',
  tier TEXT NOT NULL DEFAULT 'free',
  personal_owner_user_id TEXT UNIQUE,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_organizations_personal_owner_user_id
  ON organizations (personal_owner_user_id);

CREATE INDEX IF NOT EXISTS idx_organizations_tier
  ON organizations (tier);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user_id
  ON memberships (user_id);

CREATE INDEX IF NOT EXISTS idx_memberships_org_id
  ON memberships (organization_id);

