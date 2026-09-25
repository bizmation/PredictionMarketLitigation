import type { Db } from "../client";

/** False predicates raise a constraint error; D1 rolls back the entire batch. */
export function assertStmt(
  db: Db,
  name: string,
  predicate: string,
  binds: unknown[] = []
): D1PreparedStatement {
  return db
    .prepare(`INSERT INTO gate_assertions (assertion, satisfied)
    SELECT ?, 0 WHERE NOT COALESCE((${predicate}), 0)`)
    .bind(name, ...binds);
}
