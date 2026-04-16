import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
  useSearchParams,
} from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";

type LoaderData = {
  org: { id: string; name: string; type: "personal" | "team" };
  currentUser: { id: string; email?: string | null };
  membershipRole: "owner" | "member";
  members: Array<{ userId: string; role: "owner" | "member"; createdAt: string }>;
  invites: Array<{
    id: string;
    email: string;
    role: "owner" | "member";
    status: "pending" | "revoked" | "accepted";
    createdAt: string;
    acceptedAt: string | null;
  }>;
};

type ActionData =
  | { ok: true; intent: "invite"; message: string; inviteUrl: string }
  | { ok: true; intent: "revoke-invite" | "update-role"; message: string }
  | { ok: false; intent: "invite" | "revoke-invite" | "update-role"; message: string };

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? `Members | ${data.org.name} | Preships Console` : "Members | Preships Console" },
];

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export async function loader({
  request,
  context,
  params,
}: LoaderFunctionArgs): Promise<LoaderData> {
  const { requireConsoleOrgContext } = await import("~/lib/route-auth.server");
  const { listOrgInvites, listOrgMembers } = await import("~/lib/orgs.server");

  const orgId = String(params.orgId ?? "").trim();
  if (!orgId) {
    throw new Response("Missing organization id.", { status: 400 });
  }

  const { session, authDb, orgContext } = await requireConsoleOrgContext({
    request,
    context,
    requestedOrgId: orgId,
  });

  const [members, invites] = await Promise.all([
    listOrgMembers({ db: authDb, organizationId: orgContext.org.id }),
    listOrgInvites({ db: authDb, organizationId: orgContext.org.id }),
  ]);

  return {
    org: {
      id: orgContext.org.id,
      name: orgContext.org.name,
      type: orgContext.org.type,
    },
    currentUser: session.user,
    membershipRole: orgContext.membershipRole,
    members,
    invites,
  };
}

function getIntent(formData: FormData): ActionData["intent"] | null {
  const intent = String(formData.get("intent") ?? "").trim();
  if (intent === "invite" || intent === "revoke-invite" || intent === "update-role") return intent;
  return null;
}

export async function action({
  request,
  context,
  params,
}: ActionFunctionArgs): Promise<ActionData> {
  const { requireConsoleOrgContext } = await import("~/lib/route-auth.server");
  const {
    createOrgInvite,
    parseInviteRoleFromForm,
    requireOrgOwnerRole,
    revokeOrgInvite,
    updateMemberRole,
  } = await import("~/lib/orgs.server");

  const orgId = String(params.orgId ?? "").trim();
  if (!orgId) {
    return { ok: false, intent: "invite", message: "Missing organization id." };
  }

  const { session, authDb, orgContext } = await requireConsoleOrgContext({
    request,
    context,
    requestedOrgId: orgId,
  });

  const formData = await request.formData();
  const intent = getIntent(formData);
  if (!intent) {
    return { ok: false, intent: "invite", message: "Unknown action." };
  }

  // Access control: only owners can mutate membership/invites.
  try {
    await requireOrgOwnerRole({
      db: authDb,
      organizationId: orgContext.org.id,
      userId: session.user.id,
    });
  } catch {
    return { ok: false, intent, message: "Only organization owners can manage members." };
  }

  if (intent === "invite") {
    const email = String(formData.get("email") ?? "").trim();
    const role = parseInviteRoleFromForm(formData);
    if (!email) {
      return { ok: false, intent, message: "Email is required." };
    }
    if (!role) {
      return { ok: false, intent, message: "Role is required." };
    }

    try {
      const { token } = await createOrgInvite({
        db: authDb,
        organizationId: orgContext.org.id,
        inviterUserId: session.user.id,
        email,
        role,
      });
      const origin = new URL(request.url).origin;
      const inviteUrl = `${origin}/orgs/invites/${encodeURIComponent(token)}/accept`;
      return {
        ok: true,
        intent,
        message: "Invite created. Share the acceptance link with the recipient.",
        inviteUrl,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create invite.";
      return { ok: false, intent, message };
    }
  }

  if (intent === "revoke-invite") {
    const inviteId = String(formData.get("inviteId") ?? "").trim();
    if (!inviteId) {
      return { ok: false, intent, message: "Invite id is required." };
    }
    await revokeOrgInvite({ db: authDb, organizationId: orgContext.org.id, inviteId });
    return { ok: true, intent, message: "Invite revoked." };
  }

  const targetUserId = String(formData.get("userId") ?? "").trim();
  const roleValue = String(formData.get("role") ?? "").trim();
  if (!targetUserId) {
    return { ok: false, intent, message: "User id is required." };
  }
  if (targetUserId === session.user.id) {
    return { ok: false, intent, message: "You cannot change your own role." };
  }
  if (roleValue !== "owner" && roleValue !== "member") {
    return { ok: false, intent, message: "Invalid role." };
  }
  await updateMemberRole({
    db: authDb,
    organizationId: orgContext.org.id,
    userId: targetUserId,
    role: roleValue,
  });
  return { ok: true, intent, message: "Member role updated." };
}

export default function OrgMembersRoute() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const orgParam = searchParams.get("org");

  const pendingIntent =
    navigation.state === "submitting" ? String(navigation.formData?.get("intent") ?? "") : null;
  const isOwner = data.membershipRole === "owner";

  return (
    <main className="space-y-6">
      <header className="rounded-2xl border border-border bg-panel p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Members</h2>
            <p className="mt-2 text-sm text-text-muted">
              Manage invites and roles for{" "}
              <span className="text-text-primary">{data.org.name}</span>.
            </p>
          </div>
          <Link
            to={orgParam ? `/?org=${encodeURIComponent(orgParam)}` : "/"}
            className="rounded-lg border border-border bg-panel px-4 py-2 text-center text-sm font-medium text-text-primary hover:bg-panel-soft"
          >
            Back to dashboard
          </Link>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-border bg-panel p-6">
          <h3 className="text-lg font-semibold">Invite member</h3>
          <p className="mt-2 text-sm text-text-muted">
            Owners can invite collaborators to this team organization.
          </p>

          {!isOwner ? (
            <div className="mt-4 rounded-lg border border-border bg-bg p-4 text-sm text-text-muted">
              You are a <span className="font-medium text-text-primary">{data.membershipRole}</span>
              . Only owners can invite or change roles.
            </div>
          ) : (
            <Form method="post" className="mt-4 space-y-3">
              <input type="hidden" name="intent" value="invite" />
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-text-primary">Email</span>
                <input
                  name="email"
                  type="email"
                  required
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-text-primary">Role</span>
                <select
                  name="role"
                  defaultValue="member"
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                >
                  <option value="member">Member</option>
                  <option value="owner">Owner</option>
                </select>
              </label>

              {actionData?.intent === "invite" ? (
                <div
                  className={`rounded-lg border p-3 text-sm ${
                    actionData.ok
                      ? "border-accent/40 bg-accent/10 text-accent"
                      : "border-red-400/40 bg-red-500/10 text-red-200"
                  }`}
                >
                  <p>{actionData.message}</p>
                  {"inviteUrl" in actionData && actionData.inviteUrl ? (
                    <p className="mt-2 break-all text-xs text-text-primary">
                      Acceptance link: <code>{actionData.inviteUrl}</code>
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="flex items-center justify-end">
                <button
                  type="submit"
                  disabled={pendingIntent === "invite"}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pendingIntent === "invite" ? "Creating..." : "Create invite"}
                </button>
              </div>
            </Form>
          )}
        </article>

        <article className="rounded-2xl border border-border bg-panel p-6">
          <h3 className="text-lg font-semibold">Pending invites</h3>
          <p className="mt-2 text-sm text-text-muted">
            Invites must be accepted by the recipient’s signed-in account.
          </p>

          {data.invites.length === 0 ? (
            <div className="mt-4 rounded-lg border border-border bg-bg p-4 text-sm text-text-muted">
              No invites created yet.
            </div>
          ) : (
            <ul className="mt-4 space-y-2">
              {data.invites.map((invite) => (
                <li
                  key={invite.id}
                  className="rounded-lg border border-border bg-bg px-3 py-3 text-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-text-primary">{invite.email}</p>
                      <p className="mt-1 text-xs text-text-muted">
                        Role: {invite.role} · Status: {invite.status} · Created{" "}
                        {formatDateTime(invite.createdAt)}
                        {invite.acceptedAt
                          ? ` · Accepted ${formatDateTime(invite.acceptedAt)}`
                          : ""}
                      </p>
                    </div>
                    {isOwner && invite.status === "pending" ? (
                      <Form method="post">
                        <input type="hidden" name="intent" value="revoke-invite" />
                        <input type="hidden" name="inviteId" value={invite.id} />
                        <button
                          type="submit"
                          disabled={pendingIntent === "revoke-invite"}
                          className="rounded-md border border-yellow-300/60 px-2.5 py-1 text-xs font-medium text-yellow-200 hover:bg-yellow-300/10 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {pendingIntent === "revoke-invite" ? "Revoking..." : "Revoke"}
                        </button>
                      </Form>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {actionData?.intent === "revoke-invite" ? (
            <p className={`mt-3 text-sm ${actionData.ok ? "text-accent" : "text-red-300"}`}>
              {actionData.message}
            </p>
          ) : null}
        </article>
      </section>

      <section className="rounded-2xl border border-border bg-panel p-6">
        <h3 className="text-lg font-semibold">Members</h3>
        <p className="mt-2 text-sm text-text-muted">
          Membership roles apply to team org management actions like invites and role changes.
        </p>

        {data.members.length === 0 ? (
          <div className="mt-4 rounded-lg border border-border bg-bg p-4 text-sm text-text-muted">
            No members found.
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {data.members.map((member) => (
              <li
                key={member.userId}
                className="rounded-lg border border-border bg-bg px-3 py-3 text-sm"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-text-primary">
                      {member.userId === data.currentUser.id ? "You" : member.userId}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      Role: {member.role} · Joined {formatDateTime(member.createdAt)}
                    </p>
                  </div>

                  {isOwner && member.userId !== data.currentUser.id ? (
                    <Form method="post" className="flex items-center gap-2">
                      <input type="hidden" name="intent" value="update-role" />
                      <input type="hidden" name="userId" value={member.userId} />
                      <select
                        name="role"
                        defaultValue={member.role}
                        className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                      >
                        <option value="member">Member</option>
                        <option value="owner">Owner</option>
                      </select>
                      <button
                        type="submit"
                        disabled={pendingIntent === "update-role"}
                        className="rounded-lg border border-border bg-panel px-4 py-2 text-sm font-medium text-text-primary hover:bg-panel-soft disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {pendingIntent === "update-role" ? "Saving..." : "Save"}
                      </button>
                    </Form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        {actionData?.intent === "update-role" ? (
          <p className={`mt-3 text-sm ${actionData.ok ? "text-accent" : "text-red-300"}`}>
            {actionData.message}
          </p>
        ) : null}
      </section>
    </main>
  );
}
