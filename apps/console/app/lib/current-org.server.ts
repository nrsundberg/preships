import type { ConsoleSession } from "~/lib/auth.server";
import type { D1DatabaseLike } from "~/lib/db.server";
import type { ConsoleOrg, ConsoleOrgContext } from "~/lib/org-context.server";
import { requireConsoleOrgContext } from "~/lib/route-auth.server";

export type CurrentOrg = {
  orgId: string;
  name: string;
  role: "member" | "owner";
};

export function resolveCurrentOrg(
  orgContext: Pick<ConsoleOrgContext, "org" | "membershipRole">,
): CurrentOrg {
  const role: CurrentOrg["role"] = orgContext.membershipRole;
  return {
    orgId: orgContext.org.id,
    name: orgContext.org.name,
    role,
  };
}

export type CurrentOrgAccess = {
  session: ConsoleSession;
  authDb: D1DatabaseLike;
  orgContext: ConsoleOrgContext;
  org: ConsoleOrg;
  orgId: string;
};

type RequireCurrentOrgAccessArgs = {
  request: Request;
  context: unknown;
  requestedOrgId?: string | null;
};

export async function requireCurrentOrgAccess(
  args: RequireCurrentOrgAccessArgs,
): Promise<CurrentOrgAccess> {
  const requestedOrgId = args.requestedOrgId ?? new URL(args.request.url).searchParams.get("org");
  const { session, authDb, orgContext } = await requireConsoleOrgContext({
    ...args,
    requestedOrgId,
  });
  return {
    session,
    authDb,
    orgContext,
    org: orgContext.org,
    orgId: orgContext.org.id,
  };
}
