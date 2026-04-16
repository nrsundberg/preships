import { type AppLoadContext, createRequestHandler, RouterContextProvider } from "react-router";
import { handleAuthRequest, isAuthApiRequest, type ConsoleAuthEnv } from "../app/lib/auth.server";
import { createDeviceSession, consumeDeviceToken } from "../app/lib/device-auth.server";

// @ts-expect-error Server build artifact is generated during build.
const buildImport = () => import("../build/server/index.js");

type WorkerEnv = ConsoleAuthEnv & {
  ENVIRONMENT?: string;
};

function jsonResponse(payload: unknown, status = 200): Response {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
    },
  });
}

async function handleCliDeviceRequest(request: Request, env: WorkerEnv): Promise<Response | null> {
  const url = new URL(request.url);

  if (request.method === "POST" && url.pathname === "/api/v1/cli/auth/device") {
    const session = await createDeviceSession(env.AUTH_DB as Parameters<typeof createDeviceSession>[0]);
    const loginUrl = new URL("/login/device", url.origin);
    loginUrl.searchParams.set("code", session.deviceCode);

    return jsonResponse({
      deviceCode: session.deviceCode,
      loginUrl: loginUrl.toString(),
      intervalSeconds: session.intervalSeconds,
      expiresInSeconds: session.expiresInSeconds,
    });
  }

  if (request.method === "POST" && url.pathname === "/api/v1/cli/auth/token") {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body." }, 400);
    }

    const deviceCode =
      typeof body === "object" &&
      body !== null &&
      "deviceCode" in body &&
      typeof body.deviceCode === "string"
        ? body.deviceCode
        : "";

    if (!deviceCode.trim()) {
      return jsonResponse({ error: "deviceCode is required." }, 400);
    }

    const result = await consumeDeviceToken(
      env.AUTH_DB as Parameters<typeof consumeDeviceToken>[0],
      deviceCode,
    );

    if (result.status === "pending") {
      return jsonResponse({ status: "pending" }, 202);
    }

    if (result.status === "expired") {
      return jsonResponse({ status: "expired" }, 410);
    }

    if (result.status === "approved") {
      return jsonResponse({ apiKey: result.apiKey });
    }

    return jsonResponse({ error: "Unknown device code." }, 404);
  }

  return null;
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext) {
    const cliResponse = await handleCliDeviceRequest(request, env);
    if (cliResponse) {
      return cliResponse;
    }

    if (isAuthApiRequest(request)) {
      return handleAuthRequest(request, env);
    }

    const context = new RouterContextProvider();
    (context as { cloudflare?: unknown }).cloudflare = { env, ctx };

    const serverMode = env.ENVIRONMENT === "development" ? "development" : "production";
    return createRequestHandler(buildImport, serverMode)(request, context as unknown as AppLoadContext);
  },
} satisfies {
  fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response>;
};
