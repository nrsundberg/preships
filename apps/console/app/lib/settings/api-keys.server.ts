import { sha256Hex } from "../api-keys.server";
import { executeQuery, queryFirst, type D1DatabaseLike } from "../db.server";

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

  await executeQuery(
    args.db,
    [
      "INSERT INTO api_keys (",
      "id, organization_id, created_by_user_id, key_name, key_prefix, token_hash, scopes, status, created_at",
      ") VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)",
    ].join(" "),
    [
      id,
      args.organizationId,
      args.createdByUserId,
      args.keyName.trim(),
      keyPrefix,
      tokenHash,
      args.scopes ?? "usage:ingest",
      nowIso,
    ],
  );

  return { id, rawKey, keyPrefix, createdAt: nowIso };
}

export async function revokeSettingsApiKey(args: {
  db: D1DatabaseLike;
  organizationId: string;
  apiKeyId: string;
}): Promise<boolean> {
  const existing = await queryFirst<{ id: string }>(
    args.db,
    [
      "SELECT id FROM api_keys",
      "WHERE id = ?",
      "AND organization_id = ?",
      "AND status = 'active'",
      "LIMIT 1",
    ].join(" "),
    [args.apiKeyId, args.organizationId],
  );

  if (!existing) {
    return false;
  }

  const revokedAt = new Date().toISOString();
  await executeQuery(
    args.db,
    [
      "UPDATE api_keys",
      "SET status = 'revoked', revoked_at = ?",
      "WHERE id = ?",
      "AND organization_id = ?",
    ].join(" "),
    [revokedAt, args.apiKeyId, args.organizationId],
  );

  return true;
}
