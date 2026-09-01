/**
 * D1 client helpers — snake_case rows in, camelCase domain objects out.
 *
 * The mapping lives ONLY in the repo layer (architecture #Data-Exchange-Formats).
 * Never leak snake_case onto the public API wire.
 */

export type Db = D1Database;

export function getDb(env: Env): Db {
  if (!env.DB) {
    throw new Error("D1 binding env.DB is missing");
  }
  return env.DB;
}

/** Coerce D1 INTEGER 0/1 (or already-boolean) to boolean. */
export function asBool(value: unknown): boolean {
  return value === 1 || value === true;
}
