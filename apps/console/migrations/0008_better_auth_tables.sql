-- Better Auth core tables required by prismaAdapter in app/lib/auth.server.ts

CREATE TABLE IF NOT EXISTS "user" (
  id TEXT PRIMARY KEY,
  email TEXT,
  "emailVerified" INTEGER,
  name TEXT,
  image TEXT,
  "createdAt" INTEGER,
  "updatedAt" INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_email ON "user"(email);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  token TEXT NOT NULL,
  "expiresAt" INTEGER NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" INTEGER,
  "updatedAt" INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_session_token ON session(token);
CREATE INDEX IF NOT EXISTS idx_session_user_id ON session("userId");

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" INTEGER,
  "refreshTokenExpiresAt" INTEGER,
  scope TEXT,
  password TEXT,
  "createdAt" INTEGER,
  "updatedAt" INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_provider_account
  ON account("providerId", "accountId");
CREATE INDEX IF NOT EXISTS idx_account_user_id ON account("userId");

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  "expiresAt" INTEGER NOT NULL,
  "createdAt" INTEGER,
  "updatedAt" INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_identifier_value
  ON verification(identifier, value);
