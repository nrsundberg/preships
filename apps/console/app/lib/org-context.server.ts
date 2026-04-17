import type { ConsoleSessionUser } from "./auth.server";
import { getConsoleSession } from "./auth.server";
import {
  executeQuery,
  getConsoleAuthDbFromContext,
  queryFirst,
  type D1DatabaseLike,
} from "./db.server";

export { getConsoleAuthDbFromContext } from "./db.server";

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
  membershipRole: "owner" | "member";
};

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
  const existing = await queryFirst<{ id: string }>(
    db,
    "SELECT id FROM memberships WHERE organization_id = ? AND user_id = ? LIMIT 1",
    [params.organizationId, params.userId],
  );

  if (existing) return;

  const membershipId = randomBase64Url(12);
  await executeQuery(
    db,
    "INSERT INTO memberships (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)",
    [membershipId, params.organizationId, params.userId, "owner", nowIso()],
  );
}

async function getOrgFromMembership(
  authDb: D1DatabaseLike,
  params: { organizationId: string; userId: string },
): Promise<(ConsoleOrg & { membershipRole: "owner" | "member" }) | null> {
  return queryFirst<ConsoleOrg & { membershipRole: "owner" | "member" }>(
    authDb,
    [
      "SELECT o.id, o.name, o.type, o.tier,",
      "CASE WHEN m.role = 'owner' THEN 'owner' ELSE 'member' END AS membershipRole",
      "FROM memberships m",
      "INNER JOIN organizations o ON o.id = m.organization_id",
      "WHERE m.organization_id = ? AND m.user_id = ?",
      "LIMIT 1",
    ].join(" "),
    [params.organizationId, params.userId],
  );
}

export async function resolveConsoleOrgContextFromSessionUser(
  authDb: D1DatabaseLike,
  user: ConsoleSessionUser,
  options: { requestedOrgId?: string | null } = {},
): Promise<ConsoleOrgContext> {
  const userId = user.id;
  const requestedOrgId = options.requestedOrgId?.trim() ?? "";

  if (requestedOrgId) {
    const requestedOrg = await getOrgFromMembership(authDb, {
      organizationId: requestedOrgId,
      userId,
    });
    if (!requestedOrg) {
      throw new Error("User does not have access to the requested organization.");
    }

    return {
      org: requestedOrg,
      tier: requestedOrg.tier,
      membershipRole: requestedOrg.membershipRole,
    };
  }

  // Fast path: existing default personal org.
  const existingOrg = await queryFirst<ConsoleOrg>(
    authDb,
    "SELECT id, name, type, tier FROM organizations WHERE personal_owner_user_id = ? LIMIT 1",
    [userId],
  );

  if (existingOrg) {
    await ensureMembershipForUser(authDb, { organizationId: existingOrg.id, userId });
    return { org: existingOrg, tier: existingOrg.tier, membershipRole: "owner" };
  }

  // Slow path: create on first access.
  const orgId = randomBase64Url(16);
  const createdAt = nowIso();
  const orgName = getDefaultPersonalOrgName(user);

  const insertResult = await executeQuery(
    authDb,
    [
      "INSERT INTO organizations (id, name, type, tier, personal_owner_user_id, created_at)",
      "VALUES (?, ?, ?, ?, ?, ?)",
    ].join(" "),
    [orgId, orgName, "personal", "free", userId, createdAt],
  );

  // If this failed due to a concurrent create, re-read.
  let createdOrg =
    (insertResult.success
      ? await queryFirst<ConsoleOrg>(
          authDb,
          "SELECT id, name, type, tier FROM organizations WHERE id = ? LIMIT 1",
          [orgId],
        )
      : null) ?? null;

  if (!createdOrg) {
    createdOrg = await queryFirst<ConsoleOrg>(
      authDb,
      "SELECT id, name, type, tier FROM organizations WHERE personal_owner_user_id = ? LIMIT 1",
      [userId],
    );
  }

  if (!createdOrg) {
    throw new Error("Failed to resolve/create default personal org.");
  }

  await ensureMembershipForUser(authDb, { organizationId: createdOrg.id, userId });
  return { org: createdOrg, tier: createdOrg.tier, membershipRole: "owner" };
}

// Convenience helper for places that only have access to the request+context.
export async function getConsoleOrgContext(
  request: Request,
  context: unknown,
): Promise<ConsoleOrgContext> {
  const session = await getConsoleSession(request, context);
  if (!session) {
    throw new Error("Missing console session.");
  }

  const authDb = getConsoleAuthDbFromContext(context);
  if (!authDb) {
    throw new Error("AUTH_DB is unavailable in Cloudflare context.");
  }

  return resolveConsoleOrgContextFromSessionUser(authDb, session.user);
}
