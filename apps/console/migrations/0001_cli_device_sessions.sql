CREATE TABLE IF NOT EXISTS cli_device_sessions (
  device_code TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL,
  approved_at TEXT,
  token TEXT
);

CREATE INDEX IF NOT EXISTS idx_cli_device_sessions_expires_at
  ON cli_device_sessions (expires_at);
