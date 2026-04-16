CREATE TABLE IF NOT EXISTS org_invites (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'revoked', 'accepted')),
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  accepted_at TEXT,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_invites_token_hash
  ON org_invites (token_hash);

CREATE INDEX IF NOT EXISTS idx_org_invites_org_id_status
  ON org_invites (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_org_invites_org_id_email
  ON org_invites (organization_id, email);

