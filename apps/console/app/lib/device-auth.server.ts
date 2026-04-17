const DEVICE_CODE_BYTES = 18;
const API_KEY_BYTES = 24;

import { createApiKeyForOrg } from "./api-keys.server";
import { executeQuery, queryFirst, type D1DatabaseLike } from "./db.server";

export const DEVICE_AUTH_POLL_INTERVAL_SECONDS = 2;
export const DEVICE_AUTH_EXPIRES_IN_SECONDS = 600;

type DeviceSessionRow = {
  device_code: string;
  expires_at: string;
  approved_at: string | null;
  token: string | null;
};

type DeviceSessionStatus =
  | { status: "approved"; apiKey: string }
  | { status: "pending" }
  | { status: "expired" }
  | { status: "not_found" };

function randomBase64Url(bytes: number): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);

  let binary = "";
  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function toIsoDate(timestampMs: number): string {
  return new Date(timestampMs).toISOString();
}

export async function createDeviceSession(db: D1DatabaseLike): Promise<{
  deviceCode: string;
  intervalSeconds: number;
  expiresInSeconds: number;
}> {
  const now = Date.now();
  const deviceCode = randomBase64Url(DEVICE_CODE_BYTES);
  const expiresAt = toIsoDate(now + DEVICE_AUTH_EXPIRES_IN_SECONDS * 1000);

  const insertResult = await executeQuery(
    db,
    "INSERT INTO cli_device_sessions (device_code, expires_at, approved_at, token) VALUES (?, ?, NULL, NULL)",
    [deviceCode, expiresAt],
  );

  if (!insertResult.success) {
    throw new Error("Failed to create device auth session.");
  }

  return {
    deviceCode,
    intervalSeconds: DEVICE_AUTH_POLL_INTERVAL_SECONDS,
    expiresInSeconds: DEVICE_AUTH_EXPIRES_IN_SECONDS,
  };
}

export async function approveDeviceSession(
  db: D1DatabaseLike,
  deviceCode: string,
  context?: { organizationId?: string; userId?: string },
): Promise<"approved" | "not_found" | "expired"> {
  const normalizedCode = deviceCode.trim();
  if (!normalizedCode) {
    return "not_found";
  }

  const nowIso = toIsoDate(Date.now());
  const token = `psk_${randomBase64Url(API_KEY_BYTES)}`;

  const updateResult = await executeQuery(
    db,
    [
      "UPDATE cli_device_sessions",
      "SET approved_at = ?, token = ?",
      "WHERE device_code = ?",
      "  AND approved_at IS NULL",
      "  AND token IS NULL",
      "  AND expires_at > ?",
    ].join(" "),
    [nowIso, token, normalizedCode, nowIso],
  );

  if (updateResult.success) {
    const approved = await queryFirst<{ token: string | null }>(
      db,
      "SELECT token FROM cli_device_sessions WHERE device_code = ? AND token = ?",
      [normalizedCode, token],
    );
    if (approved?.token === token) {
      if (context?.organizationId && context?.userId) {
        await createApiKeyForOrg({
          db,
          organizationId: context.organizationId,
          createdByUserId: context.userId,
          keyName: "CLI Device Login",
          rawToken: token,
          scopes: "usage:ingest",
        });
      }
      return "approved";
    }
  }

  const existing = await queryFirst<{ expires_at: string }>(
    db,
    "SELECT expires_at FROM cli_device_sessions WHERE device_code = ?",
    [normalizedCode],
  );

  if (!existing) {
    return "not_found";
  }

  if (Date.parse(existing.expires_at) <= Date.now()) {
    return "expired";
  }

  return "not_found";
}

export async function consumeDeviceToken(
  db: D1DatabaseLike,
  deviceCode: string,
): Promise<DeviceSessionStatus> {
  const normalizedCode = deviceCode.trim();
  if (!normalizedCode) {
    return { status: "not_found" };
  }

  const session = await queryFirst<DeviceSessionRow>(
    db,
    "SELECT device_code, expires_at, approved_at, token FROM cli_device_sessions WHERE device_code = ?",
    [normalizedCode],
  );

  if (!session) {
    return { status: "not_found" };
  }

  if (Date.parse(session.expires_at) <= Date.now()) {
    return { status: "expired" };
  }

  if (!session.approved_at || !session.token) {
    return { status: "pending" };
  }

  const token = session.token;
  const consumeResult = await executeQuery(
    db,
    "UPDATE cli_device_sessions SET token = NULL WHERE device_code = ? AND token = ?",
    [normalizedCode, token],
  );

  if (!consumeResult.success) {
    return { status: "pending" };
  }

  return { status: "approved", apiKey: token };
}
