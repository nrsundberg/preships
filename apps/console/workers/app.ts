import { type AppLoadContext, createRequestHandler, RouterContextProvider } from "react-router";
import { authenticateApiKey } from "../app/lib/api-keys.server";
import type { ConsoleAuthEnv } from "../app/lib/auth.server";
import { createDeviceSession, consumeDeviceToken } from "../app/lib/device-auth.server";
import {
  processStripeWebhookEvent,
  verifyStripeWebhookSignature,
} from "../app/lib/stripe-webhook.server";
import { ingestUsageForOrg } from "../app/lib/usage-ingest.server";

// @ts-expect-error Server build artifact is generated during build.
const buildImport = () => import("../build/server/index.js");

type WorkerEnv = ConsoleAuthEnv & {
  ENVIRONMENT?: string;
  STRIPE_WEBHOOK_SECRET?: string;
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
    const session = await createDeviceSession(
      env.AUTH_DB as Parameters<typeof createDeviceSession>[0],
    );
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

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(/\s+/, 2);
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") return null;
  return token.trim();
}

async function handleUsageIngestRequest(
  request: Request,
  env: WorkerEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== "/api/v1/usage/ingest") {
    return null;
  }

  const token = getBearerToken(request);
  if (!token) {
    return jsonResponse({ error: "Missing bearer token." }, 401);
  }

  const auth = await authenticateApiKey(
    env.AUTH_DB as Parameters<typeof authenticateApiKey>[0],
    token,
  );
  if (!auth.ok) {
    return jsonResponse({ error: "Invalid API key." }, 401);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  await ingestUsageForOrg({
    db: env.AUTH_DB as unknown as Parameters<typeof ingestUsageForOrg>[0]["db"],
    organizationId: auth.organizationId,
    payload: (typeof payload === "object" && payload ? payload : {}) as Parameters<
      typeof ingestUsageForOrg
    >[0]["payload"],
  });

  return jsonResponse({ ok: true });
}

async function handleStripeWebhookRequest(
  request: Request,
  env: WorkerEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== "/api/v1/billing/stripe/webhook") {
    return null;
  }

  const webhookSecret = env.STRIPE_WEBHOOK_SECRET ?? "";
  if (!webhookSecret.trim()) {
    return jsonResponse({ error: "Stripe webhook is not configured." }, 500);
  }

  const rawBody = await request.text();
  const verification = await verifyStripeWebhookSignature({
    headerValue: request.headers.get("stripe-signature"),
    rawBody,
    webhookSecret,
  });
  if (!verification.ok) {
    return jsonResponse({ error: verification.reason }, 400);
  }

  let eventPayload: unknown;
  try {
    eventPayload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const result = await processStripeWebhookEvent({
    db: env.AUTH_DB as unknown as Parameters<typeof processStripeWebhookEvent>[0]["db"],
    event: (typeof eventPayload === "object" && eventPayload ? eventPayload : {}) as Parameters<
      typeof processStripeWebhookEvent
    >[0]["event"],
  });

  return jsonResponse({
    ok: true,
    handled: result.handled,
    eventType: result.eventType,
    organizationId: result.organizationId,
  });
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext) {
    const stripeWebhookResponse = await handleStripeWebhookRequest(request, env);
    if (stripeWebhookResponse) {
      return stripeWebhookResponse;
    }

    const usageResponse = await handleUsageIngestRequest(request, env);
    if (usageResponse) {
      return usageResponse;
    }

    const cliResponse = await handleCliDeviceRequest(request, env);
    if (cliResponse) {
      return cliResponse;
    }

    const g = globalThis as typeof globalThis & { process?: { env: Record<string, unknown> } };
    if (g.process?.env) {
      Object.assign(g.process.env, env as Record<string, unknown>);
    }

    const context = new RouterContextProvider();
    (context as { cloudflare?: unknown }).cloudflare = {
      env,
      ctx,
      cf: (request as Request & { cf?: IncomingRequestCfProperties }).cf,
    };

    const serverMode = env.ENVIRONMENT === "development" ? "development" : "production";
    return createRequestHandler(buildImport, serverMode)(
      request,
      context as unknown as AppLoadContext,
    );
  },
} satisfies {
  fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response>;
};
