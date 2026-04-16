import type { ConsoleSessionUser } from "./auth.server";
import { getConsoleSession } from "./auth.server";

type CloudflareEnv = {
  AUTH_DB?: unknown;
};

type D1DatabaseLike = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      run(): Promise<{ success: boolean }>;
      first<T = unknown>(): Promise<T | null>;
      all<T = unknown>(): Promise<T[]>;
    };
  };
};

export type ConsoleOrgType = "personal" | "team";

export type ConsoleOrg = {
  id: string;
  name: string;
  type: ConsoleOrgType;
  tier: string;
};

export type ConsoleOrgContext = {
  org: ConsoleOrg;
  tier: string;
};

export function getConsoleAuthDbFromContext(context: unknown): D1DatabaseLike | null {
  const cloudflareContext =
    typeof context === "object" && context !== null && "cloudflare" in context
      ? (context.cloudflare as { env?: CloudflareEnv })
      : undefined;

  const authDb = cloudflareContext?.env?.AUTH_DB;
  if (!authDb || typeof authDb !== "object") return null;
  return authDb as D1DatabaseLike;
}

function randomBase64Url(bytes: number): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);

  // btoa expects a binary string.
  let binary = "";
  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function nowIso(): string {
  return new Date().toISOString();
}

function getDefaultPersonalOrgName(user: ConsoleSessionUser): string {
  const email = (user.email ?? "").trim();
  if (email) {
    const localPart = email.split("@")[0]?.trim() || "user";
    return `${localPart}'s Personal Workspace`;
  }
  const name = (user.name ?? "").trim();
  if (name) {
    return `${name}'s Personal Workspace`;
  }
  return "Personal Workspace";
}

async function ensureMembershipForUser(
  db: D1DatabaseLike,
  params: { organizationId: string; userId: string },
): Promise<void> {
  const existing = await db
    .prepare(
      "SELECT id FROM memberships WHERE organization_id = ? AND user_id = ? LIMIT 1",
    )
    .bind(params.organizationId, params.userId)
    .first<{ id: string }>();

  if (existing) return;

  const membershipId = randomBase64Url(12);
  await db
    .prepare(
      "INSERT INTO memberships (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(membershipId, params.organizationId, params.userId, "owner", nowIso())
    .run();
}

export async function resolveConsoleOrgContextFromSessionUser(
  authDb: D1DatabaseLike,
  user: ConsoleSessionUser,
): Promise<ConsoleOrgContext> {
  const userId = user.id;

  // Fast path: existing default personal org.
  const existingOrg = await authDb
    .prepare(
      "SELECT id, name, type, tier FROM organizations WHERE personal_owner_user_id = ? LIMIT 1",
    )
    .bind(userId)
    .first<ConsoleOrg>();

  if (existingOrg) {
    await ensureMembershipForUser(authDb, { organizationId: existingOrg.id, userId });
    return { org: existingOrg, tier: existingOrg.tier };
  }

  // Slow path: create on first access.
  const orgId = randomBase64Url(16);
  const createdAt = nowIso();
  const orgName = getDefaultPersonalOrgName(user);

  const insertResult = await authDb
    .prepare(
      [
        "INSERT INTO organizations (id, name, type, tier, personal_owner_user_id, created_at)",
        "VALUES (?, ?, ?, ?, ?, ?)",
      ].join(" "),
    )
    .bind(orgId, orgName, "personal", "free", userId, createdAt)
    .run();

  // If this failed due to a concurrent create, re-read.
  let createdOrg =
    (insertResult.success
      ? await authDb
          .prepare("SELECT id, name, type, tier FROM organizations WHERE id = ? LIMIT 1")
          .bind(orgId)
          .first<ConsoleOrg>()
      : null) ?? null;

  if (!createdOrg) {
    createdOrg = await authDb
      .prepare(
        "SELECT id, name, type, tier FROM organizations WHERE personal_owner_user_id = ? LIMIT 1",
      )
      .bind(userId)
      .first<ConsoleOrg>();
  }

  if (!createdOrg) {
    throw new Error("Failed to resolve/create default personal org.");
  }

  await ensureMembershipForUser(authDb, { organizationId: createdOrg.id, userId });
  return { org: createdOrg, tier: createdOrg.tier };
}

// Convenience helper for places that only have access to the request+context.
export async function getConsoleOrgContext(request: Request, context: unknown): Promise<ConsoleOrgContext> {
  const session = await getConsoleSession(request);
  if (!session) {
    throw new Error("Missing console session.");
  }

  const authDb = getConsoleAuthDbFromContext(context);
  if (!authDb) {
    throw new Error("AUTH_DB is unavailable in Cloudflare context.");
  }

  return resolveConsoleOrgContextFromSessionUser(authDb, session.user);
}

