import {
  Form,
  Link,
  NavLink,
  Outlet,
  useLoaderData,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { requireConsoleOrgContext } = await import("~/lib/route-auth.server");
  const { listUserOrganizations } = await import("~/lib/orgs.server");
  const url = new URL(request.url);
  const requestedOrgId = url.searchParams.get("org");
  const { session, authDb, orgContext } = await requireConsoleOrgContext({
    request,
    context,
    requestedOrgId,
  });
  const orgs = await listUserOrganizations(authDb, session.user.id);

  return {
    session,
    org: orgContext.org,
    tier: orgContext.tier,
    membershipRole: orgContext.membershipRole,
    orgs,
  };
}

export type AppShellLoaderData = Awaited<ReturnType<typeof loader>>;

export const meta: MetaFunction = () => [
  { title: "Console | Preships" },
  {
    name: "description",
    content:
      "Preships Console workspace overview for projects, billing, usage, and account settings.",
  },
];

function navClassName({ isActive }: { isActive: boolean }) {
  return isActive
    ? "rounded-lg border border-border bg-panel-soft px-3 py-2 text-sm font-medium text-text-primary"
    : "rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-text-muted hover:border-border hover:text-text-primary";
}

export default function AppShell() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const currentOrgId = searchParams.get("org") ?? data.org.id;

  function withOrgSearch(pathname: string) {
    const next = new URLSearchParams(searchParams);
    next.set("org", currentOrgId);
    return `${pathname}?${next.toString()}`;
  }

  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <div className="mx-auto flex w-full max-w-6xl flex-col px-6 py-8">
        <header className="mb-8 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-text-muted">Preships Console</p>
            <h1 className="mt-1 text-2xl font-semibold">Account Workspace</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-text-muted">
              <label className="inline-flex items-center gap-2">
                <span className="text-xs uppercase tracking-wide">Organization</span>
                <select
                  value={currentOrgId}
                  onChange={(event) => {
                    const nextOrg = event.target.value;
                    const next = new URLSearchParams(searchParams);
                    next.set("org", nextOrg);
                    navigate(`${location.pathname}?${next.toString()}`);
                  }}
                  className="rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                >
                  {data.orgs.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} {org.type === "team" ? "(team)" : "(personal)"}
                    </option>
                  ))}
                </select>
              </label>
              <span className="hidden text-text-muted sm:inline">·</span>
              <span className="text-xs uppercase tracking-wide">
                Role: <span className="font-medium text-text-primary">{data.membershipRole}</span>
              </span>
              <span className="hidden text-text-muted sm:inline">·</span>
              <Link to={withOrgSearch("/orgs/new")} className="text-accent hover:underline">
                Create team org
              </Link>
              {data.org.type === "team" ? (
                <>
                  <span className="hidden text-text-muted sm:inline">·</span>
                  <Link
                    to={withOrgSearch(`/orgs/${data.org.id}/members`)}
                    className="text-accent hover:underline"
                  >
                    Manage members
                  </Link>
                </>
              ) : null}
            </div>
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
          <NavLink to={withOrgSearch("/")} end className={navClassName}>
            Dashboard
          </NavLink>
          <NavLink to={withOrgSearch("/billing")} className={navClassName}>
            Billing
          </NavLink>
          <NavLink to={withOrgSearch("/usage")} className={navClassName}>
            Usage
          </NavLink>
          <NavLink to={withOrgSearch("/settings")} className={navClassName}>
            Settings
          </NavLink>
        </nav>

        <Outlet />
      </div>
    </div>
  );
}
