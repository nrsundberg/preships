import { Form, NavLink, Outlet, redirect } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";

import { getConsoleSession } from "~/lib/auth.server";
import { getConsoleAuthDbFromContext, resolveConsoleOrgContextFromSessionUser } from "~/lib/org-context.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const session = await getConsoleSession(request);
  if (!session) {
    const url = new URL(request.url);
    const redirectTo = `${url.pathname}${url.search}`;
    throw redirect(`/login?redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  const authDb = getConsoleAuthDbFromContext(context);
  if (!authDb) {
    throw new Response("Console auth DB is unavailable.", { status: 500 });
  }

  const orgContext = await resolveConsoleOrgContextFromSessionUser(authDb, session.user);

  return {
    session,
    org: orgContext.org,
    tier: orgContext.tier,
  };
}

export type AppShellLoaderData = Awaited<ReturnType<typeof loader>>;

export const meta: MetaFunction = () => [
  { title: "Console | Preships" },
  {
    name: "description",
    content: "Preships Console workspace overview for projects, billing, usage, and account settings.",
  },
];

function navClassName({ isActive }: { isActive: boolean }) {
  return isActive
    ? "rounded-lg border border-border bg-panel-soft px-3 py-2 text-sm font-medium text-text-primary"
    : "rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-text-muted hover:border-border hover:text-text-primary";
}

export default function AppShell() {
  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <div className="mx-auto flex w-full max-w-6xl flex-col px-6 py-8">
        <header className="mb-8 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-text-muted">Preships Console</p>
            <h1 className="mt-1 text-2xl font-semibold">Account Workspace</h1>
          </div>
          <Form action="/api/auth/sign-out" method="post">
            <button
              type="submit"
              className="rounded-lg border border-border bg-panel px-4 py-2 text-sm font-medium text-text-primary hover:bg-panel-soft"
            >
              Sign out
            </button>
          </Form>
        </header>

        <nav className="mb-8 flex flex-wrap gap-2">
          <NavLink to="/" end className={navClassName}>
            Dashboard
          </NavLink>
          <NavLink to="/billing" className={navClassName}>
            Billing
          </NavLink>
          <NavLink to="/usage" className={navClassName}>
            Usage
          </NavLink>
          <NavLink to="/settings" className={navClassName}>
            Settings
          </NavLink>
        </nav>

        <Outlet />
      </div>
    </div>
  );
}
