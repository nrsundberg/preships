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

export type ConsoleAuthEnv = {
  AUTH_DB: D1DatabaseLike;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
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

const authByDatabase = new WeakMap<D1DatabaseLike, ReturnType<typeof createAuth>>();

function createAuth(env: ConsoleAuthEnv) {
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
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(db, {
      provider: "sqlite",
    }),
    emailAndPassword: {
      enabled: true,
    },
    socialProviders,
    trustedOrigins: ["https://console.preships.io", "http://localhost:8788"],
  });
}

function getAuth(env: ConsoleAuthEnv) {
  const existing = authByDatabase.get(env.AUTH_DB);
  if (existing) {
    return existing;
  }

  const auth = createAuth(env);
  authByDatabase.set(env.AUTH_DB, auth);
  return auth;
}

export function isAuthApiRequest(request: Request): boolean {
  const pathname = new URL(request.url).pathname;
  return pathname === "/api/auth" || pathname.startsWith("/api/auth/");
}

export function handleAuthRequest(request: Request, env: ConsoleAuthEnv): Promise<Response> {
  return getAuth(env).handler(request);
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
