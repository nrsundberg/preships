import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import type { ConsoleAuthEnv } from "~/lib/auth.server";

function getConsoleAuthEnv(context: unknown): ConsoleAuthEnv | null {
  const cloudflareContext =
    typeof context === "object" && context !== null && "cloudflare" in context
      ? (context.cloudflare as { env?: ConsoleAuthEnv })
      : undefined;

  return cloudflareContext?.env ?? null;
}

function forwardAuthRequest(request: Request, context: unknown): Promise<Response> {
  const env = getConsoleAuthEnv(context);
  if (!env) {
    return Promise.resolve(
      Response.json(
        { error: "Console auth environment is unavailable." },
        { status: 500, headers: { "cache-control": "no-store" } },
      ),
    );
  }

  return import("~/lib/auth.server").then(({ handleAuthRequest }) =>
    handleAuthRequest(request, env),
  );
}

export function loader({ request, context }: LoaderFunctionArgs) {
  return forwardAuthRequest(request, context);
}

export function action({ request, context }: ActionFunctionArgs) {
  return forwardAuthRequest(request, context);
}
