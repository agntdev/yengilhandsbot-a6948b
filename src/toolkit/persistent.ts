/** Minimal Cloudflare D1 contract used for durable domain records. */
export interface D1Result {
  meta?: { changes?: number };
  results?: unknown[];
}

export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  run<T = unknown>(): Promise<D1Result & { results?: T[] }>;
  first<T = unknown>(): Promise<T | null>;
}

export interface PersistentDatabase {
  prepare(query: string): D1Statement;
  batch<T = unknown>(statements: D1Statement[]): Promise<Array<D1Result & { results?: T[] }>>;
  exec(query: string): Promise<unknown>;
}

/** Returns the Workers D1 binding, if this deployment has one. */
export function persistentDatabase(ctx: object): PersistentDatabase | undefined {
  const db = (ctx as { env?: { DB?: unknown } }).env?.DB;
  if (!db || typeof (db as PersistentDatabase).prepare !== "function") return undefined;
  return db as PersistentDatabase;
}
