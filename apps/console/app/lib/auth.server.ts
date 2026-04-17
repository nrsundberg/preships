import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";

export type ConsoleSessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
};

export type ConsoleSession = {
  user: ConsoleSessionUser;
};

type D1DatabaseLike = Parameters<typeof drizzle>[0];

/** Worker / Cloudflare bindings used by Better Auth and loaders. */
export type ConsoleAuthEnv = {
  AUTH_DB: D1DatabaseLike;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
  ENVIRONMENT?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
};

type BetterAuthResponse = {
  user?: ConsoleSessionUser | null;
  session?: unknown;
  data?: {
    user?: ConsoleSessionUser | null;
    session?: unknown;
  };
};

type CloudflareLoadContext = {
  cloudflare?: {
    env?: ConsoleAuthEnv;
    ctx?: { waitUntil: (promise: Promise<unknown>) => void };
  };
};

function getEnvFromContext(context: unknown): ConsoleAuthEnv | null {
  const cf =
    typeof context === "object" && context !== null && "cloudflare" in context
      ? (context as CloudflareLoadContext).cloudflare
      : undefined;
  const env = cf?.env;
  if (!env?.AUTH_DB || !env.BETTER_AUTH_SECRET) {
    return null;
  }
  return env;
}

/**
 * Better Auth instance for this request (matches sam-barber-files / tome-bingo: build from context).
 * Uses `ctx.waitUntil` when Cloudflare context is present so background work is not dropped on Workers.
 */
export function getAuth(context: unknown) {
  const env = getEnvFromContext(context);
  if (!env) {
    throw new Error("Console auth environment is unavailable.");
  }

  const cloudflare =
    typeof context === "object" && context !== null && "cloudflare" in context
      ? (context as CloudflareLoadContext).cloudflare
      : undefined;
  const executionCtx = cloudflare?.ctx;
  const isProduction = env.ENVIRONMENT !== "development";

  const db = drizzle(env.AUTH_DB);
  const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    };
  }
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    socialProviders.github = {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    };
  }

  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    basePath: "/api/auth",
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(db, {
      provider: "sqlite",
    }),
    emailAndPassword: {
      enabled: true,
    },
    socialProviders,
    trustedOrigins: [
      "https://console.preships.io",
      "http://localhost:8788",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ],
    advanced: {
      cookiePrefix: "preships",
      useSecureCookies: isProduction,
      ...(executionCtx
        ? {
            backgroundTasks: {
              handler: (promise: Promise<unknown>) => {
                executionCtx.waitUntil(promise);
              },
            },
          }
        : {}),
    },
  });
}

function toConsoleSession(payload: BetterAuthResponse | null): ConsoleSession | null {
  const user = payload?.user ?? payload?.data?.user;
  const session = payload?.session ?? payload?.data?.session;

  if (!user?.id || !session) {
    return null;
  }

  return { user };
}

export async function getConsoleSession(request: Request): Promise<ConsoleSession | null> {
  const cookie = request.headers.get("cookie");
  if (!cookie) {
    return null;
  }

  const url = new URL(request.url);
  const endpoint = new URL("/api/auth/get-session", url.origin);

  try {
    const response = await fetch(endpoint, {
      headers: {
        accept: "application/json",
        cookie,
      },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as BetterAuthResponse | null;
    return toConsoleSession(payload);
  } catch {
    return null;
  }
}
