import type { D1DatabaseLike } from "~/lib/db.server";
import type { ConsoleSessionUser } from "~/lib/auth.server";

export type OrgMembershipRole = "owner" | "member";

export type OrgSummary = {
  id: string;
  name: string;
  type: "personal" | "team";
  tier: string;
  membershipRole: OrgMembershipRole;
};

export type OrgInviteRole = OrgMembershipRole;
export type OrgInviteStatus = "pending" | "revoked" | "accepted";

export type OrgInvite = {
  id: string;
  organizationId: string;
  email: string;
  role: OrgInviteRole;
  status: OrgInviteStatus;
  createdAt: string;
  acceptedAt: string | null;
};

type OrgSummaryRow = {
  id: string;
  name: string;
  type: "personal" | "team";
  tier: string;
  membership_role: OrgMembershipRole;
};

type InviteRow = {
  id: string;
  organization_id: string;
  email: string;
  role: OrgInviteRole;
  status: OrgInviteStatus;
  created_at: string;
  accepted_at: string | null;
};

function randomBase64Url(bytes: number): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);

  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return bytesToHex(digest);
}

function coerceInviteRole(value: string): OrgInviteRole | null {
  const v = value.trim();
  if (v === "owner" || v === "member") return v;
  return null;
}

export async function listUserOrganizations(
  db: D1DatabaseLike,
  userId: string,
): Promise<OrgSummary[]> {
  const rows = await db
    .prepare(
      [
        "SELECT o.id, o.name, o.type, o.tier,",
        "CASE WHEN m.role = 'owner' THEN 'owner' ELSE 'member' END AS membership_role",
        "FROM memberships m",
        "INNER JOIN organizations o ON o.id = m.organization_id",
        "WHERE m.user_id = ?",
        "ORDER BY o.created_at DESC",
      ].join(" "),
    )
    .bind(userId)
    .all<OrgSummaryRow>();

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    tier: row.tier,
    membershipRole: row.membership_role,
  }));
}

export async function createTeamOrganization(params: {
  db: D1DatabaseLike;
  ownerUser: ConsoleSessionUser;
  name: string;
}): Promise<OrgSummary> {
  const orgId = randomBase64Url(16);
  const createdAt = nowIso();
  const orgName = params.name.trim();

  await params.db
    .prepare(
      "INSERT INTO organizations (id, name, type, tier, personal_owner_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(orgId, orgName, "team", "free", null, createdAt)
    .run();

  const membershipId = randomBase64Url(12);
  await params.db
    .prepare(
      "INSERT INTO memberships (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(membershipId, orgId, params.ownerUser.id, "owner", createdAt)
    .run();

  return {
    id: orgId,
    name: orgName,
    type: "team",
    tier: "free",
    membershipRole: "owner",
  };
}

export async function requireOrgOwnerRole(params: {
  db: D1DatabaseLike;
  organizationId: string;
  userId: string;
}): Promise<void> {
  const row = await params.db
    .prepare("SELECT role FROM memberships WHERE organization_id = ? AND user_id = ? LIMIT 1")
    .bind(params.organizationId, params.userId)
    .first<{ role: string }>();

  if (!row || row.role !== "owner") {
    throw new Response("Organization owner access required.", { status: 403 });
  }
}

export async function listOrgMembers(params: {
  db: D1DatabaseLike;
  organizationId: string;
}): Promise<
  Array<{
    userId: string;
    role: OrgMembershipRole;
    createdAt: string;
  }>
> {
  const rows = await params.db
    .prepare(
      [
        "SELECT user_id AS userId,",
        "CASE WHEN role = 'owner' THEN 'owner' ELSE 'member' END AS role,",
        "created_at AS createdAt",
        "FROM memberships",
        "WHERE organization_id = ?",
        "ORDER BY CASE WHEN role = 'owner' THEN 0 ELSE 1 END, created_at ASC",
      ].join(" "),
    )
    .bind(params.organizationId)
    .all<{ userId: string; role: OrgMembershipRole; createdAt: string }>();

  return rows;
}

export async function listOrgInvites(params: {
  db: D1DatabaseLike;
  organizationId: string;
}): Promise<OrgInvite[]> {
  const rows = await params.db
    .prepare(
      [
        "SELECT id, organization_id, email, role, status, created_at, accepted_at",
        "FROM org_invites",
        "WHERE organization_id = ?",
        "ORDER BY created_at DESC",
        "LIMIT 50",
      ].join(" "),
    )
    .bind(params.organizationId)
    .all<InviteRow>();

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
  }));
}

export async function createOrgInvite(params: {
  db: D1DatabaseLike;
  organizationId: string;
  inviterUserId: string;
  email: string;
  role: OrgInviteRole;
}): Promise<{ invite: OrgInvite; token: string }> {
  const email = normalizeEmail(params.email);
  if (!email.includes("@")) {
    throw new Error("Invalid email.");
  }

  // Best-effort duplicate prevention (the auth schema owns the user table).
  try {
    const existingMember = await params.db
      .prepare(
        [
          "SELECT m.id",
          "FROM memberships m",
          "WHERE m.organization_id = ?",
          "  AND m.user_id IN (SELECT id FROM user WHERE lower(email) = ? LIMIT 1)",
          "LIMIT 1",
        ].join(" "),
      )
      .bind(params.organizationId, email)
      .first<{ id: string }>();
    if (existingMember) {
      throw new Error("User is already a member of this organization.");
    }
  } catch {
    // If the auth tables differ, we still allow invites by email.
  }

  const token = `psinv_${randomBase64Url(24)}`;
  const tokenHash = await sha256Hex(token);
  const createdAt = nowIso();
  const inviteId = randomBase64Url(12);

  await params.db
    .prepare(
      [
        "INSERT INTO org_invites (id, organization_id, email, role, status, token_hash, created_at, accepted_at)",
        "VALUES (?, ?, ?, ?, ?, ?, ?, NULL)",
      ].join(" "),
    )
    .bind(inviteId, params.organizationId, email, params.role, "pending", tokenHash, createdAt)
    .run();

  return {
    invite: {
      id: inviteId,
      organizationId: params.organizationId,
      email,
      role: params.role,
      status: "pending",
      createdAt,
      acceptedAt: null,
    },
    token,
  };
}

export async function revokeOrgInvite(params: {
  db: D1DatabaseLike;
  organizationId: string;
  inviteId: string;
}): Promise<boolean> {
  const result = await params.db
    .prepare(
      "UPDATE org_invites SET status = 'revoked' WHERE id = ? AND organization_id = ? AND status = 'pending'",
    )
    .bind(params.inviteId, params.organizationId)
    .run();
  return result.success;
}

export async function updateMemberRole(params: {
  db: D1DatabaseLike;
  organizationId: string;
  userId: string;
  role: OrgMembershipRole;
}): Promise<boolean> {
  const result = await params.db
    .prepare("UPDATE memberships SET role = ? WHERE organization_id = ? AND user_id = ?")
    .bind(params.role, params.organizationId, params.userId)
    .run();
  return result.success;
}

export async function getInviteByToken(params: {
  db: D1DatabaseLike;
  token: string;
}): Promise<OrgInvite | null> {
  const token = params.token.trim();
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await params.db
    .prepare(
      [
        "SELECT id, organization_id, email, role, status, created_at, accepted_at",
        "FROM org_invites",
        "WHERE token_hash = ?",
        "LIMIT 1",
      ].join(" "),
    )
    .bind(tokenHash)
    .first<InviteRow>();

  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
  };
}

export async function acceptInvite(params: {
  db: D1DatabaseLike;
  token: string;
  user: ConsoleSessionUser;
}): Promise<{ organizationId: string } | { error: string }> {
  const invite = await getInviteByToken({ db: params.db, token: params.token });
  if (!invite) return { error: "Invite not found." };
  if (invite.status !== "pending") return { error: "Invite is no longer valid." };

  const sessionEmail = normalizeEmail(params.user.email ?? "");
  if (!sessionEmail || sessionEmail !== normalizeEmail(invite.email)) {
    return { error: "Invite email does not match the signed-in account." };
  }

  const membershipId = randomBase64Url(12);
  const now = nowIso();
  await params.db
    .prepare(
      [
        "INSERT OR IGNORE INTO memberships (id, organization_id, user_id, role, created_at)",
        "VALUES (?, ?, ?, ?, ?)",
      ].join(" "),
    )
    .bind(membershipId, invite.organizationId, params.user.id, invite.role, now)
    .run();

  await params.db
    .prepare(
      "UPDATE org_invites SET status = 'accepted', accepted_at = ? WHERE id = ? AND status = 'pending'",
    )
    .bind(now, invite.id)
    .run();

  return { organizationId: invite.organizationId };
}

export function parseInviteRoleFromForm(formData: FormData): OrgInviteRole | null {
  return coerceInviteRole(String(formData.get("role") ?? ""));
}
