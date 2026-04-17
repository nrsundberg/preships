import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { getAuth } from "~/lib/auth.server";

function forwardAuthRequest(request: Request, context: unknown): Promise<Response> {
  try {
    const auth = getAuth(context);
    return auth.handler(request);
  } catch {
    return Promise.resolve(
      Response.json(
        { error: "Console auth environment is unavailable." },
        { status: 500, headers: { "cache-control": "no-store" } },
      ),
    );
  }
}

export function loader({ request, context }: LoaderFunctionArgs) {
  return forwardAuthRequest(request, context);
}

export function action({ request, context }: ActionFunctionArgs) {
  return forwardAuthRequest(request, context);
}
