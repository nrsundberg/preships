import { getConsoleSession, type ConsoleSession } from "./auth.server";
import { getConsoleAuthDbFromContext, type D1DatabaseLike } from "./db.server";
import {
  resolveConsoleOrgContextFromSessionUser,
  type ConsoleOrgContext,
} from "./org-context.server";

export type ResolvedConsoleOrgAccess = {
  session: ConsoleSession;
  authDb: D1DatabaseLike;
  orgContext: ConsoleOrgContext;
};

export async function requireConsoleOrgAccess(args: {
  request: Request;
  context: unknown;
  requestedOrgId?: string | null;
}): Promise<ResolvedConsoleOrgAccess> {
  const session = await getConsoleSession(args.request);
  if (!session) {
    throw new Error("Missing console session.");
  }

  const authDb = getConsoleAuthDbFromContext(args.context);
  if (!authDb) {
    throw new Error("AUTH_DB is unavailable in Cloudflare context.");
  }

  const orgContext = await resolveConsoleOrgContextFromSessionUser(authDb, session.user, {
    requestedOrgId: args.requestedOrgId,
  });

  return { session, authDb, orgContext };
}
