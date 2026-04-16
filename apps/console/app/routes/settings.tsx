import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import type { ReactNode } from "react";

import { getConsoleAuthDbFromContext } from "~/lib/org-context.server";
import { requireConsoleOrgContext } from "~/lib/route-auth.server";
import {
  getSettingsPageData,
  updateNotificationPreferences,
  updateOrganizationProfile,
} from "~/lib/settings.server";

type PanelProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

function SettingsPanel({ title, description, children }: PanelProps) {
  return (
    <article className="rounded-xl border border-border bg-panel p-5">
      <header>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? <p className="mt-2 text-sm text-text-muted">{description}</p> : null}
      </header>
      <div className="mt-4">{children}</div>
    </article>
  );
}

export const meta: MetaFunction = () => [
  { title: "Settings | Preships Console" },
  {
    name: "description",
    content:
      "Configure organization profile, members, API keys, and notification preferences in Preships Console.",
  },
];

type ActionData =
  | { ok: true; intent: "update-profile" | "update-notifications"; message: string }
  | { ok: false; intent: "update-profile" | "update-notifications"; message: string };

function getIntent(formData: FormData): ActionData["intent"] | null {
  const intent = `${formData.get("intent") ?? ""}`.trim();
  if (intent === "update-profile" || intent === "update-notifications") {
    return intent;
  }
  return null;
}

function isChecked(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { session, orgContext } = await requireConsoleOrgContext({ request, context });
  const authDb = getConsoleAuthDbFromContext(context);
  if (!authDb) {
    throw new Response("Console auth DB is unavailable.", { status: 500 });
  }

  return getSettingsPageData({
    db: authDb as Parameters<typeof getSettingsPageData>[0]["db"],
    session,
    orgContext,
  });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { session, orgContext } = await requireConsoleOrgContext({ request, context });
  const authDb = getConsoleAuthDbFromContext(context);
  if (!authDb) {
    return {
      ok: false,
      intent: "update-profile",
      message: "Settings service is currently unavailable.",
    } satisfies ActionData;
  }

  const formData = await request.formData();
  const intent = getIntent(formData);
  if (!intent) {
    return {
      ok: false,
      intent: "update-profile",
      message: "Unknown settings action.",
    } satisfies ActionData;
  }

  if (intent === "update-profile") {
    const organizationName = `${formData.get("organizationName") ?? ""}`.trim();
    if (!organizationName) {
      return {
        ok: false,
        intent,
        message: "Organization name is required.",
      } satisfies ActionData;
    }
    if (organizationName.length > 120) {
      return {
        ok: false,
        intent,
        message: "Organization name must be 120 characters or less.",
      } satisfies ActionData;
    }

    try {
      await updateOrganizationProfile({
        db: authDb as Parameters<typeof updateOrganizationProfile>[0]["db"],
        orgId: orgContext.org.id,
        organizationName,
      });
    } catch {
      return {
        ok: false,
        intent,
        message: "Failed to update organization profile. Please try again.",
      } satisfies ActionData;
    }
    return {
      ok: true,
      intent,
      message: "Organization profile updated.",
    } satisfies ActionData;
  }

  try {
    await updateNotificationPreferences({
      db: authDb as Parameters<typeof updateNotificationPreferences>[0]["db"],
      orgId: orgContext.org.id,
      userId: session.user.id,
      usageAlerts: isChecked(formData, "usageAlerts"),
      memberInvites: isChecked(formData, "memberInvites"),
      securityAlerts: isChecked(formData, "securityAlerts"),
    });
  } catch {
    return {
      ok: false,
      intent,
      message: "Failed to update notification preferences. Please try again.",
    } satisfies ActionData;
  }
  return {
    ok: true,
    intent,
    message: "Notification preferences updated.",
  } satisfies ActionData;
}

export default function SettingsRoute() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  const pendingIntent =
    navigation.state === "submitting" ? getIntent(navigation.formData ?? new FormData()) : null;
  const profileIsSaving = pendingIntent === "update-profile";
  const notificationsIsSaving = pendingIntent === "update-notifications";

  const profileFeedback = actionData?.intent === "update-profile" ? actionData : null;
  const notificationsFeedback = actionData?.intent === "update-notifications" ? actionData : null;

  return (
    <main className="grid gap-4 lg:grid-cols-2">
      <SettingsPanel
        title="Organization profile"
        description="Basic details used across your workspace."
      >
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="update-profile" />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text-primary">
                Organization name
              </span>
              <input
                name="organizationName"
                type="text"
                required
                maxLength={120}
                defaultValue={data.organization.name}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text-primary">
                Organization type
              </span>
              <input
                type="text"
                disabled
                value={data.organization.type}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-primary outline-none disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text-primary">Plan tier</span>
              <input
                type="text"
                disabled
                value={data.organization.tier}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-primary outline-none disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text-primary">
                Organization ID
              </span>
              <input
                type="text"
                disabled
                value={data.organization.id}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-primary outline-none disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
          </div>

          {profileFeedback ? (
            <p className={`text-sm ${profileFeedback.ok ? "text-accent" : "text-red-400"}`}>
              {profileFeedback.message}
            </p>
          ) : null}

          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={profileIsSaving}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {profileIsSaving ? "Saving..." : "Save profile"}
            </button>
          </div>
        </Form>
      </SettingsPanel>

      <SettingsPanel title="Member management" description="Invite collaborators and manage roles.">
        <div className="space-y-4">
          {data.members.length === 0 ? (
            <div className="rounded-lg border border-border bg-bg p-4 text-sm text-text-muted">
              No members found for this organization.
            </div>
          ) : (
            <ul className="space-y-2">
              {data.members.map((member) => (
                <li
                  key={member.id}
                  className="rounded-lg border border-border bg-bg px-3 py-3 text-sm"
                >
                  <p className="font-medium text-text-primary">
                    {member.name || member.email || member.userId}
                  </p>
                  <p className="text-xs text-text-muted">
                    {member.email || "No email"} · {member.role} · joined{" "}
                    {formatDateTime(member.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SettingsPanel>

      <SettingsPanel title="API keys" description="Create and revoke keys for Preships API access.">
        <div className="space-y-4">
          {data.apiKeys.length === 0 ? (
            <div className="rounded-lg border border-border bg-bg p-4 text-sm text-text-muted">
              No API keys exist for this organization yet.
            </div>
          ) : (
            <ul className="space-y-2">
              {data.apiKeys.map((apiKey) => (
                <li
                  key={apiKey.id}
                  className="rounded-lg border border-border bg-bg px-3 py-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-medium text-text-primary">{apiKey.name}</p>
                    <span
                      className={`text-xs ${apiKey.revokedAt ? "text-yellow-300" : "text-accent"}`}
                    >
                      {apiKey.revokedAt ? "Revoked" : "Active"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-text-muted">
                    Prefix: <code>{apiKey.keyPrefix}</code> · created{" "}
                    {formatDateTime(apiKey.createdAt)} · last used{" "}
                    {formatDateTime(apiKey.lastUsedAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Notification preferences"
        description="Choose which events trigger email notifications."
      >
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="update-notifications" />
          <div className="space-y-3">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                name="usageAlerts"
                defaultChecked={data.notificationPreferences.usageAlerts}
                className="mt-1 h-4 w-4 rounded border-border bg-bg text-accent outline-none focus:ring-accent"
              />
              <span className="text-sm text-text-primary">
                Usage alerts
                <span className="block text-xs text-text-muted">
                  Notify me when usage thresholds are exceeded.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                name="memberInvites"
                defaultChecked={data.notificationPreferences.memberInvites}
                className="mt-1 h-4 w-4 rounded border-border bg-bg text-accent outline-none focus:ring-accent"
              />
              <span className="text-sm text-text-primary">
                Member invites
                <span className="block text-xs text-text-muted">
                  Send email when someone invites me to the workspace.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                name="securityAlerts"
                defaultChecked={data.notificationPreferences.securityAlerts}
                className="mt-1 h-4 w-4 rounded border-border bg-bg text-accent outline-none focus:ring-accent"
              />
              <span className="text-sm text-text-primary">
                Security alerts
                <span className="block text-xs text-text-muted">
                  Notify me about sign-in and credential changes.
                </span>
              </span>
            </label>
          </div>

          <p className="text-xs text-text-muted">
            Last updated: {formatDateTime(data.notificationPreferences.updatedAt)}
          </p>

          {notificationsFeedback ? (
            <p className={`text-sm ${notificationsFeedback.ok ? "text-accent" : "text-red-400"}`}>
              {notificationsFeedback.message}
            </p>
          ) : null}

          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={notificationsIsSaving}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {notificationsIsSaving ? "Saving..." : "Save preferences"}
            </button>
          </div>
        </Form>
      </SettingsPanel>
    </main>
  );
}
