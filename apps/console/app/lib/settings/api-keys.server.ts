import { sha256Hex } from "../api-keys.server";

type D1DatabaseLike = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      run(): Promise<{ success: boolean }>;
      first<T = unknown>(): Promise<T | null>;
    };
  };
};

export type CreatedSettingsApiKey = {
  id: string;
  rawKey: string;
  keyPrefix: string;
  createdAt: string;
};

function randomBase64Url(bytes: number): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);

  let binary = "";
  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function generateRawApiKey(): string {
  return `psk_${randomBase64Url(24)}`;
}

export async function createSettingsApiKey(args: {
  db: D1DatabaseLike;
  organizationId: string;
  createdByUserId: string;
  keyName: string;
  scopes?: string;
}): Promise<CreatedSettingsApiKey> {
  const nowIso = new Date().toISOString();
  const id = crypto.randomUUID();
  const rawKey = generateRawApiKey();
  const tokenHash = await sha256Hex(rawKey);
  const keyPrefix = rawKey.slice(0, 12);

  await args.db
    .prepare(
      [
        "INSERT INTO api_keys (",
        "id, organization_id, created_by_user_id, key_name, key_prefix, token_hash, scopes, status, created_at",
        ") VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)",
      ].join(" "),
    )
    .bind(
      id,
      args.organizationId,
      args.createdByUserId,
      args.keyName.trim(),
      keyPrefix,
      tokenHash,
      args.scopes ?? "usage:ingest",
      nowIso,
    )
    .run();

  return { id, rawKey, keyPrefix, createdAt: nowIso };
}

export async function revokeSettingsApiKey(args: {
  db: D1DatabaseLike;
  organizationId: string;
  apiKeyId: string;
}): Promise<boolean> {
  const existing = await args.db
    .prepare(
      [
        "SELECT id FROM api_keys",
        "WHERE id = ?",
        "AND organization_id = ?",
        "AND status = 'active'",
        "LIMIT 1",
      ].join(" "),
    )
    .bind(args.apiKeyId, args.organizationId)
    .first<{ id: string }>();

  if (!existing) {
    return false;
  }

  const revokedAt = new Date().toISOString();
  await args.db
    .prepare(
      [
        "UPDATE api_keys",
        "SET status = 'revoked', revoked_at = ?",
        "WHERE id = ?",
        "AND organization_id = ?",
      ].join(" "),
    )
    .bind(revokedAt, args.apiKeyId, args.organizationId)
    .run();

  return true;
}
