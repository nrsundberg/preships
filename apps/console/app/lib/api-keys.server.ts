import { executeQuery, type D1DatabaseLike, queryFirst } from "./db.server";

type ApiKeyRow = {
  id: string;
  organization_id: string;
  status: string;
};

export type ApiKeyAuthResult = { ok: true; keyId: string; organizationId: string } | { ok: false };

function bytesToHex(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let out = "";
  for (const byte of view) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

export async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return bytesToHex(digest);
}

export async function authenticateApiKey(
  db: D1DatabaseLike,
  bearerToken: string,
): Promise<ApiKeyAuthResult> {
  const token = bearerToken.trim();
  if (!token) {
    return { ok: false };
  }

  const tokenHash = await sha256Hex(token);
  const row = await queryFirst<ApiKeyRow>(
    db,
    "SELECT id, organization_id, status FROM api_keys WHERE token_hash = ? LIMIT 1",
    [tokenHash],
  );

  if (!row || row.status !== "active") {
    return { ok: false };
  }

  await executeQuery(db, "UPDATE api_keys SET last_used_at = ? WHERE id = ?", [
    new Date().toISOString(),
    row.id,
  ]);

  return { ok: true, keyId: row.id, organizationId: row.organization_id };
}

export async function createApiKeyForOrg(params: {
  db: D1DatabaseLike;
  organizationId: string;
  createdByUserId: string;
  keyName: string;
  rawToken: string;
  scopes?: string;
}): Promise<void> {
  const tokenHash = await sha256Hex(params.rawToken);
  const keyPrefix = params.rawToken.slice(0, 12);
  const nowIso = new Date().toISOString();
  const id = crypto.randomUUID();

  await executeQuery(
    params.db,
    [
      "INSERT INTO api_keys (",
      "id, organization_id, created_by_user_id, key_name, key_prefix, token_hash, scopes, status, created_at",
      ") VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)",
    ].join(" "),
    [
      id,
      params.organizationId,
      params.createdByUserId,
      params.keyName,
      keyPrefix,
      tokenHash,
      params.scopes ?? "usage:ingest",
      nowIso,
    ],
  );
}
