type CloudflareEnv = {
  AUTH_DB?: unknown;
};

type D1RunResult = {
  success: boolean;
};

type D1PreparedStatementLike = {
  bind(...values: unknown[]): {
    run(): Promise<D1RunResult>;
    first<T = unknown>(): Promise<T | null>;
    all<T = unknown>(): Promise<T[]>;
  };
};

export type D1DatabaseLike = {
  prepare(query: string): D1PreparedStatementLike;
};

export function getConsoleAuthDbFromContext(context: unknown): D1DatabaseLike | null {
  const cloudflareContext =
    typeof context === "object" && context !== null && "cloudflare" in context
      ? (context.cloudflare as { env?: CloudflareEnv })
      : undefined;

  const authDb = cloudflareContext?.env?.AUTH_DB;
  if (!authDb || typeof authDb !== "object") {
    return null;
  }

  return authDb as D1DatabaseLike;
}

export function requireConsoleAuthDbFromContext(context: unknown): D1DatabaseLike {
  const authDb = getConsoleAuthDbFromContext(context);
  if (!authDb) {
    throw new Error("AUTH_DB is unavailable in Cloudflare context.");
  }
  return authDb;
}

export function prepareQuery(db: D1DatabaseLike, query: string, bindings: readonly unknown[] = []) {
  return db.prepare(query).bind(...bindings);
}

export async function queryFirst<T>(
  db: D1DatabaseLike,
  query: string,
  bindings: readonly unknown[] = [],
): Promise<T | null> {
  return prepareQuery(db, query, bindings).first<T>();
}

export async function queryAll<T>(
  db: D1DatabaseLike,
  query: string,
  bindings: readonly unknown[] = [],
): Promise<T[]> {
  return prepareQuery(db, query, bindings).all<T>();
}

export async function executeQuery(
  db: D1DatabaseLike,
  query: string,
  bindings: readonly unknown[] = [],
): Promise<D1RunResult> {
  return prepareQuery(db, query, bindings).run();
}
