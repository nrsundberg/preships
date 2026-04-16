import { Form } from "react-router";
import type { MetaFunction } from "react-router";
import type { ReactNode } from "react";

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
        {description ? (
          <p className="mt-2 text-sm text-text-muted">{description}</p>
        ) : null}
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

export default function SettingsRoute() {
  return (
    <main className="grid gap-4 lg:grid-cols-2">
      <SettingsPanel
        title="Organization profile"
        description="Basic details used across your workspace."
      >
        <Form
          method="post"
          action="/api/settings/organization/profile"
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text-primary">
                Organization name
              </span>
              <input
                name="organizationName"
                type="text"
                required
                disabled
                defaultValue="Preships Workspace"
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text-primary">
                Website
              </span>
              <input
                name="website"
                type="url"
                disabled
                defaultValue="https://preships.example"
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text-primary">
                Primary timezone
              </span>
              <input
                name="timezone"
                type="text"
                disabled
                defaultValue="UTC"
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text-primary">
                Workspace slug
              </span>
              <input
                name="workspaceSlug"
                type="text"
                disabled
                defaultValue="preships"
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
          </div>

          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save profile (coming soon)
            </button>
          </div>
        </Form>
      </SettingsPanel>

      <SettingsPanel
        title="Member management"
        description="Invite collaborators and manage roles."
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-bg p-4 text-sm text-text-muted">
            Member management UI is not implemented yet. This panel is a scaffold
            for future invite flows and role management.
          </div>

          <Form
            method="post"
            action="/api/settings/members/invite"
            className="space-y-3"
          >
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text-primary">
                Invite by email
              </span>
              <input
                name="email"
                type="email"
                disabled
                placeholder="name@company.com"
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            <button
              type="submit"
              disabled
              className="w-full rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-panel-soft disabled:cursor-not-allowed disabled:opacity-60"
            >
              Invite member (coming soon)
            </button>
          </Form>
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="API keys"
        description="Create and revoke keys for Preships API access."
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-bg p-4 text-sm text-text-muted">
            No API keys found yet. Add this section’s persistence when the API
            key endpoints are ready.
          </div>

          <Form
            method="post"
            action="/api/settings/api-keys/create"
            className="space-y-3"
          >
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text-primary">
                Key name
              </span>
              <input
                name="keyName"
                type="text"
                disabled
                placeholder="CLI access"
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            <button
              type="submit"
              disabled
              className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Create API key (coming soon)
            </button>
          </Form>
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Notification preferences"
        description="Choose which events trigger email notifications."
      >
        <Form
          method="post"
          action="/api/settings/notifications"
          className="space-y-4"
        >
          <div className="space-y-3">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                name="usageAlerts"
                disabled
                defaultChecked
                className="mt-1 h-4 w-4 rounded border-border bg-bg text-accent outline-none focus:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
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
                disabled
                defaultChecked
                className="mt-1 h-4 w-4 rounded border-border bg-bg text-accent outline-none focus:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
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
                disabled
                defaultChecked
                className="mt-1 h-4 w-4 rounded border-border bg-bg text-accent outline-none focus:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
              />
              <span className="text-sm text-text-primary">
                Security alerts
                <span className="block text-xs text-text-muted">
                  Notify me about sign-in and credential changes.
                </span>
              </span>
            </label>
          </div>

          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save preferences (coming soon)
            </button>
          </div>
        </Form>
      </SettingsPanel>
    </main>
  );
}
