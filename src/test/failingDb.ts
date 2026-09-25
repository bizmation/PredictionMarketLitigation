import type { Db } from "../shared/db/client";

/**
 * Story 3.19 — test helper for the best-effort Evidence catches.
 *
 * `failBatchAfter(db, n)` returns a Proxy over a real `D1Database` whose
 * nth `batch()` call (1-based) throws; every other call — including the
 * other `batch()` calls and all `prepare`/`exec`/`dump` traffic — passes
 * straight through to the target with `apply` on the real object, so the
 * row the code wrote before the failing batch is really committed. Tests
 * pass `testEnv.DB` directly and read the same target back afterwards.
 */
export function failBatchAfter(
  db: Db,
  n: number,
  error: Error = new Error("D1 batch failed (failBatchAfter)")
): Db & { batchCalls: () => number } {
  let calls = 0;
  const proxy = new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "batchCalls") return () => calls;
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (prop === "batch" && typeof value === "function") {
        return (...args: unknown[]) => {
          calls += 1;
          if (calls === n) return Promise.reject(error);
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      if (typeof value === "function") {
        return (...args: unknown[]) =>
          (value as (...a: unknown[]) => unknown).apply(target, args);
      }
      return value;
    }
  });
  return proxy as Db & { batchCalls: () => number };
}

/** Pause immediately before a real D1 batch, retaining real transactional behavior. */
export function pauseBatch(db: Db) {
  let arrive!: () => void;
  let release!: () => void;
  const arrived = new Promise<void>((resolve) => {
    arrive = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const proxy = new Proxy(db, {
    get(target, prop) {
      if (prop === "batch")
        return async (statements: D1PreparedStatement[]) => {
          arrive();
          await released;
          return target.batch(statements);
        };
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  return { db: proxy, arrived, release };
}

/** Pause a conditional write immediately before executing its real statement. */
export function pauseStatement(db: Db, matches: (sql: string) => boolean) {
  let arrive!: () => void;
  let release!: () => void;
  const arrived = new Promise<void>((resolve) => {
    arrive = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  function wrap(statement: D1PreparedStatement): D1PreparedStatement {
    return new Proxy(statement, {
      get(target, prop) {
        if (prop === "bind")
          return (...values: unknown[]) => wrap(target.bind(...values));
        if (prop === "run")
          return async () => {
            arrive();
            await released;
            return target.run();
          };
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
  }
  const proxy = new Proxy(db, {
    get(target, prop) {
      if (prop === "prepare")
        return (sql: string) =>
          matches(sql) ? wrap(target.prepare(sql)) : target.prepare(sql);
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  return { db: proxy, arrived, release };
}
