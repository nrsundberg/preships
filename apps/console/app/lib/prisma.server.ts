import type { D1Database } from "@cloudflare/workers-types";
import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "../db/generated/client";

export type ConsolePrismaEnv = {
  AUTH_DB: D1Database;
};

type CloudflareLoadContext = {
  cloudflare?: {
    env?: Partial<ConsolePrismaEnv>;
  };
};

const clientsByBinding = new WeakMap<D1Database, PrismaClient>();

function getAuthDbBinding(context: unknown): D1Database | null {
  const cloudflare =
    typeof context === "object" && context !== null && "cloudflare" in context
      ? (context as CloudflareLoadContext).cloudflare
      : undefined;
  const authDb = cloudflare?.env?.AUTH_DB;
  return authDb ?? null;
}

export function getPrismaFromD1(authDb: D1Database): PrismaClient {
  const cached = clientsByBinding.get(authDb);
  if (cached) {
    return cached;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaD1(authDb),
  });
  clientsByBinding.set(authDb, prisma);
  return prisma;
}

export function getPrisma(context: unknown): PrismaClient {
  const authDb = getAuthDbBinding(context);
  if (!authDb) {
    throw new Error("AUTH_DB is unavailable in Cloudflare context.");
  }
  return getPrismaFromD1(authDb);
}
