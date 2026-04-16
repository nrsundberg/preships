import type { ConsoleOrgContext } from "./org-context.server";
import type { ConsoleSession } from "./auth.server";

type D1DatabaseLike = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      run(): Promise<{ success: boolean }>;
      first<T = unknown>(): Promise<T | null>;
      all<T = unknown>(): Promise<{ results: T[] } | T[]>;
    };
  };
};

type MembershipRow = {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
  created_at: string;
  user_name: string | null;
  user_email: string | null;
};

type ApiKeyRow = {
  id: string;
  organization_id: string;
  key_name: string;
  key_prefix: string;
  created_by_user_id: string;
  status: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

type NotificationRow = {
  id: string;
  organization_id: string;
  user_id: string | null;
  notification_type: string;
  enabled: number;
  updated_at: string;
};

export type SettingsMember = {
  id: string;
  userId: string;
  role: string;
  createdAt: string;
  name: string | null;
  email: string | null;
};

export type SettingsApiKeyMetadata = {
  id: string;
  name: string;
  keyPrefix: string;
  createdByUserId: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type SettingsNotificationPreferences = {
  usageAlerts: boolean;
  memberInvites: boolean;
  securityAlerts: boolean;
  updatedAt: string | null;
};

export type SettingsPageData = {
  organization: {
    id: string;
    name: string;
    type: string;
    tier: string;
  };
  members: SettingsMember[];
  apiKeys: SettingsApiKeyMetadata[];
  notificationPreferences: SettingsNotificationPreferences;
};

function nowIso(): string {
  return new Date().toISOString();
}

function randomBase64Url(bytes: number): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);

  let binary = "";
  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

const NOTIFICATION_TYPE_MAP = {
  usageAlerts: "usage-alerts",
  memberInvites: "member-invites",
  securityAlerts: "security-alerts",
} as const;

async function getOrCreateNotification(
  db: D1DatabaseLike,
  args: {
    orgId: string;
    userId: string;
    notificationType: string;
  },
): Promise<NotificationRow> {
  const existing = await db
    .prepare(
      [
        "SELECT id, organization_id, user_id, notification_type, enabled, updated_at",
        "FROM org_notifications",
        "WHERE organization_id = ?",
        "AND user_id = ?",
        "AND notification_type = ?",
        "LIMIT 1",
      ].join(" "),
    )
    .bind(args.orgId, args.userId, args.notificationType)
    .first<NotificationRow>();
  if (existing) return existing;

  const id = randomBase64Url(12);
  const timestamp = nowIso();
  await db
    .prepare(
      [
        "INSERT INTO org_notifications",
        "(id, organization_id, user_id, notification_type, channel, enabled, threshold_value, created_at, updated_at)",
        "VALUES (?, ?, ?, ?, 'email', 1, NULL, ?, ?)",
      ].join(" "),
    )
    .bind(id, args.orgId, args.userId, args.notificationType, timestamp, timestamp)
    .run();

  return {
    id,
    organization_id: args.orgId,
    user_id: args.userId,
    notification_type: args.notificationType,
    enabled: 1,
    updated_at: timestamp,
  };
}

function toResultArray<T>(value: { results: T[] } | T[]): T[] {
  return Array.isArray(value) ? value : value.results;
}

export async function getSettingsPageData(args: {
  db: D1DatabaseLike;
  session: ConsoleSession;
  orgContext: ConsoleOrgContext;
}): Promise<SettingsPageData> {
  const { db, session, orgContext } = args;

  const org = await db
    .prepare("SELECT id, name, type, tier FROM organizations WHERE id = ? LIMIT 1")
    .bind(orgContext.org.id)
    .first<{ id: string; name: string; type: string; tier: string }>();

  if (!org) {
    throw new Response("Organization was not found.", { status: 404 });
  }

  const membersRaw = await db
    .prepare(
      [
        "SELECT m.id, m.organization_id, m.user_id, m.role, m.created_at, u.name AS user_name, u.email AS user_email",
        "FROM memberships m",
        'LEFT JOIN "user" u ON u.id = m.user_id',
        "WHERE m.organization_id = ?",
        "ORDER BY m.created_at ASC",
      ].join(" "),
    )
    .bind(org.id)
    .all<MembershipRow>();
  const membersRows = toResultArray(membersRaw);

  const apiKeysRaw = await db
    .prepare(
      [
        "SELECT id, organization_id, key_name, key_prefix, created_by_user_id, status, last_used_at, revoked_at, created_at",
        "FROM api_keys",
        "WHERE organization_id = ?",
        "ORDER BY created_at DESC",
      ].join(" "),
    )
    .bind(org.id)
    .all<ApiKeyRow>();
  const apiKeyRows = toResultArray(apiKeysRaw);

  const notificationRowsRaw = await db
    .prepare(
      [
        "SELECT id, organization_id, user_id, notification_type, enabled, updated_at",
        "FROM org_notifications",
        "WHERE organization_id = ?",
        "AND user_id = ?",
        "AND notification_type IN ('usage-alerts', 'member-invites', 'security-alerts')",
      ].join(" "),
    )
    .bind(org.id, session.user.id)
    .all<NotificationRow>();
  const notificationRows = toResultArray(notificationRowsRaw);
  const notificationByType = new Map(
    notificationRows.map((row) => [row.notification_type, row] as const),
  );

  for (const notificationType of Object.values(NOTIFICATION_TYPE_MAP)) {
    if (notificationByType.has(notificationType)) continue;
    const created = await getOrCreateNotification(db, {
      orgId: org.id,
      userId: session.user.id,
      notificationType,
    });
    notificationByType.set(notificationType, created);
  }

  const usageNotification = notificationByType.get("usage-alerts");
  const invitesNotification = notificationByType.get("member-invites");
  const securityNotification = notificationByType.get("security-alerts");
  const updatedCandidates = [
    usageNotification?.updated_at ?? null,
    invitesNotification?.updated_at ?? null,
    securityNotification?.updated_at ?? null,
  ].filter((value): value is string => Boolean(value));
  const updatedAt = updatedCandidates.sort().at(-1) ?? null;

  return {
    organization: org,
    members: membersRows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      role: row.role,
      createdAt: row.created_at,
      name: row.user_name,
      email: row.user_email,
    })),
    apiKeys: apiKeyRows.map((row) => ({
      id: row.id,
      name: row.key_name,
      keyPrefix: row.key_prefix,
      createdByUserId: row.created_by_user_id,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      revokedAt: row.revoked_at ?? (row.status === "revoked" ? row.created_at : null),
    })),
    notificationPreferences: {
      usageAlerts: usageNotification?.enabled === 1,
      memberInvites: invitesNotification?.enabled === 1,
      securityAlerts: securityNotification?.enabled === 1,
      updatedAt,
    },
  };
}

export async function updateOrganizationProfile(args: {
  db: D1DatabaseLike;
  orgId: string;
  organizationName: string;
}): Promise<void> {
  const trimmedName = args.organizationName.trim();
  await args.db
    .prepare("UPDATE organizations SET name = ? WHERE id = ?")
    .bind(trimmedName, args.orgId)
    .run();
}

export async function updateNotificationPreferences(args: {
  db: D1DatabaseLike;
  orgId: string;
  userId: string;
  usageAlerts: boolean;
  memberInvites: boolean;
  securityAlerts: boolean;
}): Promise<void> {
  const updatedAt = nowIso();
  const updates: Array<{ type: string; enabled: boolean }> = [
    { type: NOTIFICATION_TYPE_MAP.usageAlerts, enabled: args.usageAlerts },
    { type: NOTIFICATION_TYPE_MAP.memberInvites, enabled: args.memberInvites },
    { type: NOTIFICATION_TYPE_MAP.securityAlerts, enabled: args.securityAlerts },
  ];

  for (const update of updates) {
    const existing = await args.db
      .prepare(
        [
          "SELECT id FROM org_notifications",
          "WHERE organization_id = ?",
          "AND user_id = ?",
          "AND notification_type = ?",
          "LIMIT 1",
        ].join(" "),
      )
      .bind(args.orgId, args.userId, update.type)
      .first<{ id: string }>();

    if (existing) {
      await args.db
        .prepare("UPDATE org_notifications SET enabled = ?, updated_at = ? WHERE id = ?")
        .bind(update.enabled ? 1 : 0, updatedAt, existing.id)
        .run();
      continue;
    }

    await args.db
      .prepare(
        [
          "INSERT INTO org_notifications",
          "(id, organization_id, user_id, notification_type, channel, enabled, threshold_value, created_at, updated_at)",
          "VALUES (?, ?, ?, ?, 'email', ?, NULL, ?, ?)",
        ].join(" "),
      )
      .bind(
        randomBase64Url(12),
        args.orgId,
        args.userId,
        update.type,
        update.enabled ? 1 : 0,
        updatedAt,
        updatedAt,
      )
      .run();
  }
}
