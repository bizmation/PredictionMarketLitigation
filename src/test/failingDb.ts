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
