import assert from "node:assert/strict";
import test from "node:test";

import {
  approveDeviceSession,
  consumeDeviceToken,
  createDeviceSession,
} from "./device-auth.server.js";

type SessionRow = {
  device_code: string;
  expires_at: string;
  approved_at: string | null;
  token: string | null;
};

class FakeDeviceDb {
  private readonly sessions = new Map<string, SessionRow>();

  prepare(query: string) {
    const db = this;
    return {
      bind(...values: unknown[]) {
        return {
          async run() {
            if (
              query.startsWith(
                "INSERT INTO cli_device_sessions (device_code, expires_at, approved_at, token)",
              )
            ) {
              const [deviceCode, expiresAt] = values as [string, string];
              db.sessions.set(deviceCode, {
                device_code: deviceCode,
                expires_at: expiresAt,
                approved_at: null,
                token: null,
              });
              return { success: true };
            }

            if (query.startsWith("UPDATE cli_device_sessions SET approved_at = ?, token = ?")) {
              const [approvedAt, token, deviceCode, nowIso] = values as [
                string,
                string,
                string,
                string,
              ];
              const row = db.sessions.get(deviceCode);
              if (!row) {
                return { success: false };
              }
              if (row.approved_at || row.token) {
                return { success: false };
              }
              if (Date.parse(row.expires_at) <= Date.parse(nowIso)) {
                return { success: false };
              }
              row.approved_at = approvedAt;
              row.token = token;
              return { success: true };
            }

            if (query.startsWith("UPDATE cli_device_sessions SET token = NULL")) {
              const [deviceCode, token] = values as [string, string];
              const row = db.sessions.get(deviceCode);
              if (!row || row.token !== token) {
                return { success: false };
              }
              row.token = null;
              return { success: true };
            }

            return { success: false };
          },
          async first<T>() {
            if (
              query.startsWith(
                "SELECT device_code, expires_at, approved_at, token FROM cli_device_sessions WHERE device_code = ?",
              )
            ) {
              const [deviceCode] = values as [string];
              return (db.sessions.get(deviceCode) ?? null) as T | null;
            }
            if (
              query.startsWith(
                "SELECT token FROM cli_device_sessions WHERE device_code = ? AND token = ?",
              )
            ) {
              const [deviceCode, token] = values as [string, string];
              const row = db.sessions.get(deviceCode);
              if (!row || row.token !== token) {
                return null;
              }
              return { token: row.token } as T;
            }
            if (query.startsWith("SELECT expires_at FROM cli_device_sessions WHERE device_code = ?")) {
              const [deviceCode] = values as [string];
              const row = db.sessions.get(deviceCode);
              if (!row) {
                return null;
              }
              return { expires_at: row.expires_at } as T;
            }
            return null;
          },
        };
      },
    };
  }

  setExpiry(deviceCode: string, expiresAtIso: string): void {
    const row = this.sessions.get(deviceCode);
    if (row) {
      row.expires_at = expiresAtIso;
    }
  }
}

test("create/approve/consume device token is one-time", async () => {
  const db = new FakeDeviceDb();
  const session = await createDeviceSession(db);

  assert.ok(session.deviceCode.length > 10);
  assert.equal(session.intervalSeconds, 2);
  assert.equal(session.expiresInSeconds, 600);

  const approved = await approveDeviceSession(db, session.deviceCode);
  assert.equal(approved, "approved");

  const firstPoll = await consumeDeviceToken(db, session.deviceCode);
  assert.equal(firstPoll.status, "approved");
  if (firstPoll.status === "approved") {
    assert.ok(firstPoll.apiKey.startsWith("psk_"));
  }

  const secondPoll = await consumeDeviceToken(db, session.deviceCode);
  assert.equal(secondPoll.status, "pending");
});

test("expired device code cannot be approved or consumed", async () => {
  const db = new FakeDeviceDb();
  const session = await createDeviceSession(db);
  db.setExpiry(session.deviceCode, new Date(Date.now() - 1_000).toISOString());

  const approved = await approveDeviceSession(db, session.deviceCode);
  assert.equal(approved, "expired");

  const poll = await consumeDeviceToken(db, session.deviceCode);
  assert.equal(poll.status, "expired");
});
