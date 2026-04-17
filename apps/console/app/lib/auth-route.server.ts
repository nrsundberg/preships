import { getAuth } from "~/lib/auth.server";

export async function forwardAuthRequest(
  request: Request,
  context: unknown,
  getAuthFromContext: typeof getAuth = getAuth,
): Promise<Response> {
  const auth = getAuthFromContext(context);
  return auth.handler(request);
}
