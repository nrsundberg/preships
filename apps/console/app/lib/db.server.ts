import { getPrisma } from "./prisma.server";

type PrismaRawClientLike = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<unknown>;
};

type LegacyPreparedClientLike = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      first<T = unknown>(): Promise<T | null>;
      all?<T = unknown>(): Promise<T[] | { results: T[] }>;
      run(): Promise<{ success: boolean }>;
    };
  };
};

export type D1DatabaseLike = PrismaRawClientLike | LegacyPreparedClientLike;

export function getConsoleAuthDbFromContext(context: unknown): D1DatabaseLike | null {
  try {
    return getPrisma(context);
  } catch {
    return null;
  }
}

export function requireConsoleAuthDbFromContext(context: unknown): D1DatabaseLike {
  const database = getConsoleAuthDbFromContext(context);
  if (!database) {
    throw new Error("AUTH_DB is unavailable in Cloudflare context.");
  }
  return database;
}

export async function queryFirst<T>(
  db: D1DatabaseLike,
  query: string,
  bindings: readonly unknown[] = [],
): Promise<T | null> {
  if ("$queryRawUnsafe" in db) {
    const rows = (await db.$queryRawUnsafe<T[]>(query, ...bindings)) as T[];
    return rows[0] ?? null;
  }
  return db
    .prepare(query)
    .bind(...bindings)
    .first<T>();
}

export async function queryAll<T>(
  db: D1DatabaseLike,
  query: string,
  bindings: readonly unknown[] = [],
): Promise<T[]> {
  if ("$queryRawUnsafe" in db) {
    return (await db.$queryRawUnsafe<T[]>(query, ...bindings)) as T[];
  }
  const bound = db.prepare(query).bind(...bindings);
  if (!bound.all) {
    return [];
  }
  const rows = await bound.all<T>();
  return Array.isArray(rows) ? rows : rows.results;
}

export async function executeQuery(
  db: D1DatabaseLike,
  query: string,
  bindings: readonly unknown[] = [],
): Promise<{ success: boolean }> {
  if ("$executeRawUnsafe" in db) {
    await db.$executeRawUnsafe(query, ...bindings);
    return { success: true };
  }
  return db
    .prepare(query)
    .bind(...bindings)
    .run();
}
