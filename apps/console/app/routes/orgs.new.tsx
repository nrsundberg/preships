import { Form, Link, redirect, useActionData, useNavigation, useSearchParams } from "react-router";
import type { ActionFunctionArgs, MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
  { title: "Create organization | Preships Console" },
  {
    name: "description",
    content: "Create a new team organization in Preships Console.",
  },
];

type ActionData = { ok: true; orgId: string; message: string } | { ok: false; message: string };

export async function action({
  request,
  context,
}: ActionFunctionArgs): Promise<Response | ActionData> {
  const { requireConsoleOrgContext } = await import("~/lib/route-auth.server");
  const { createTeamOrganization } = await import("~/lib/orgs.server");

  const { session, authDb } = await requireConsoleOrgContext({ request, context });
  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { ok: false, message: "Organization name is required." };
  }
  if (name.length > 120) {
    return { ok: false, message: "Organization name must be 120 characters or less." };
  }

  const org = await createTeamOrganization({
    db: authDb,
    ownerUser: session.user,
    name,
  });

  throw redirect(`/?org=${encodeURIComponent(org.id)}`);
}

export default function NewOrgRoute() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const orgParam = searchParams.get("org");
  const isSubmitting = navigation.state === "submitting";

  return (
    <main className="mx-auto w-full max-w-xl rounded-2xl border border-border bg-panel p-6">
      <h2 className="text-xl font-semibold">Create a team organization</h2>
      <p className="mt-2 text-sm text-text-muted">
        Team orgs let you invite members and manage roles for shared workspaces.
      </p>

      <Form method="post" className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-text-primary">
            Organization name
          </span>
          <input
            name="name"
            type="text"
            required
            maxLength={120}
            placeholder="Acme, Inc."
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
          />
        </label>

        {actionData && "ok" in actionData && !actionData.ok ? (
          <p className="text-sm text-red-300">{actionData.message}</p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Link
            to={orgParam ? `/?org=${encodeURIComponent(orgParam)}` : "/"}
            className="rounded-lg border border-border bg-panel px-4 py-2 text-center text-sm font-medium text-text-primary hover:bg-panel-soft"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Creating..." : "Create organization"}
          </button>
        </div>
      </Form>
    </main>
  );
}
