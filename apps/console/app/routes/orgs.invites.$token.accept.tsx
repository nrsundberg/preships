import { Form, Link, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";

type LoaderData = {
  token: string;
  invite: {
    email: string;
    role: "owner" | "member";
    status: "pending" | "revoked" | "accepted";
    organizationId: string;
    organizationName: string | null;
  } | null;
  sessionEmail: string | null;
};

type ActionData = { ok: true; message: string } | { ok: false; message: string };

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  {
    title: data?.invite
      ? `Accept invite | ${data.invite.organizationName ?? "Organization"}`
      : "Accept invite",
  },
];

export async function loader({
  request,
  context,
  params,
}: LoaderFunctionArgs): Promise<LoaderData> {
  const { requireConsoleSession } = await import("~/lib/route-auth.server");
  const { getConsoleAuthDbFromContext } = await import("~/lib/db.server");
  const { getInviteByToken } = await import("~/lib/orgs.server");

  const session = await requireConsoleSession(request);
  const authDb = getConsoleAuthDbFromContext(context);
  if (!authDb) {
    throw new Response("Console auth DB is unavailable.", { status: 500 });
  }

  const token = String(params.token ?? "").trim();
  const invite = token ? await getInviteByToken({ db: authDb, token }) : null;
  const orgRow = invite?.organizationId
    ? await authDb
        .prepare("SELECT name FROM organizations WHERE id = ? LIMIT 1")
        .bind(invite.organizationId)
        .first<{ name: string }>()
    : null;

  return {
    token,
    invite: invite
      ? {
          email: invite.email,
          role: invite.role,
          status: invite.status,
          organizationId: invite.organizationId,
          organizationName: orgRow?.name ?? null,
        }
      : null,
    sessionEmail: session.user.email ?? null,
  };
}

export async function action({
  request,
  context,
  params,
}: ActionFunctionArgs): Promise<Response | ActionData> {
  const { requireConsoleSession } = await import("~/lib/route-auth.server");
  const { getConsoleAuthDbFromContext } = await import("~/lib/db.server");
  const { acceptInvite } = await import("~/lib/orgs.server");

  const session = await requireConsoleSession(request);
  const authDb = getConsoleAuthDbFromContext(context);
  if (!authDb) {
    return { ok: false, message: "Invite service is unavailable." };
  }

  const token = String(params.token ?? "").trim();
  if (!token) {
    return { ok: false, message: "Missing invite token." };
  }

  const accepted = await acceptInvite({ db: authDb, token, user: session.user });
  if ("error" in accepted) {
    return { ok: false, message: accepted.error };
  }

  throw redirect(`/?org=${encodeURIComponent(accepted.organizationId)}`);
}

export default function AcceptInviteRoute() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const invite = data.invite;
  const emailMatches =
    Boolean(invite?.email) &&
    Boolean(data.sessionEmail) &&
    invite?.email.toLowerCase() === (data.sessionEmail ?? "").toLowerCase();

  return (
    <main className="mx-auto w-full max-w-xl rounded-2xl border border-border bg-panel p-6">
      <h2 className="text-xl font-semibold">Accept organization invite</h2>
      <p className="mt-2 text-sm text-text-muted">
        {invite?.organizationName ? (
          <>
            You’ve been invited to join{" "}
            <span className="text-text-primary">{invite.organizationName}</span>.
          </>
        ) : (
          "Review the invite details below."
        )}
      </p>

      {!invite ? (
        <div className="mt-6 rounded-lg border border-border bg-bg p-4 text-sm text-text-muted">
          Invite not found.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="rounded-lg border border-border bg-bg p-4 text-sm">
            <p className="text-text-muted">
              Invited email: <span className="font-medium text-text-primary">{invite.email}</span>
            </p>
            <p className="mt-1 text-text-muted">
              Signed-in email:{" "}
              <span className="font-medium text-text-primary">
                {data.sessionEmail ?? "missing"}
              </span>
            </p>
            <p className="mt-1 text-text-muted">
              Role: <span className="font-medium text-text-primary">{invite.role}</span>
            </p>
            <p className="mt-1 text-text-muted">
              Status: <span className="font-medium text-text-primary">{invite.status}</span>
            </p>
          </div>

          {!emailMatches ? (
            <div className="rounded-lg border border-yellow-300/40 bg-yellow-300/10 p-4 text-sm text-yellow-100">
              This invite is for a different email. Sign in with <code>{invite.email}</code> to
              accept it.
            </div>
          ) : invite.status !== "pending" ? (
            <div className="rounded-lg border border-border bg-bg p-4 text-sm text-text-muted">
              This invite is no longer pending.
            </div>
          ) : (
            <Form method="post" className="space-y-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Accepting..." : "Accept invite"}
              </button>
            </Form>
          )}

          {actionData ? (
            <p className={`text-sm ${actionData.ok ? "text-accent" : "text-red-300"}`}>
              {actionData.message}
            </p>
          ) : null}
        </div>
      )}

      <div className="mt-6">
        <Link
          to="/"
          className="block rounded-lg border border-border px-4 py-2 text-center text-sm font-medium text-text-primary hover:bg-panel-soft"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
