import { redirect } from "react-router";

import type { ConsoleSession } from "./auth.server";
import { getConsoleSession } from "./auth.server";
import type { D1DatabaseLike } from "./db.server";
import { getConsoleAuthDbFromContext } from "./db.server";
import type { ConsoleOrgContext } from "./org-context.server";
import { resolveConsoleOrgContextFromSessionUser } from "./org-context.server";

function buildRedirectTo(request: Request): string {
  const url = new URL(request.url);
  return `${url.pathname}${url.search}`;
}

export async function requireConsoleSession(
  request: Request,
  context: unknown,
): Promise<ConsoleSession> {
  const session = await getConsoleSession(request, context);
  if (!session) {
    throw redirect(`/login?redirectTo=${encodeURIComponent(buildRedirectTo(request))}`);
  }

  return session;
}

type RequireConsoleOrgContextArgs = {
  request: Request;
  context: unknown;
  requestedOrgId?: string | null;
};

export async function requireConsoleOrgContext({
  request,
  context,
  requestedOrgId,
}: RequireConsoleOrgContextArgs): Promise<{
  session: ConsoleSession;
  authDb: D1DatabaseLike;
  orgContext: ConsoleOrgContext;
}> {
  const session = await requireConsoleSession(request, context);
  const authDb = getConsoleAuthDbFromContext(context);
  if (!authDb) {
    throw new Response("Console auth DB is unavailable.", { status: 500 });
  }

  try {
    const orgContext = await resolveConsoleOrgContextFromSessionUser(authDb, session.user, {
      requestedOrgId,
    });
    return { session, authDb, orgContext };
  } catch (error) {
    if (requestedOrgId) {
      throw new Response("Organization access denied.", { status: 403 });
    }
    throw error;
  }
}
