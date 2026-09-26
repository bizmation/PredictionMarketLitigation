import { env } from "cloudflare:test";
import { expect, it } from "vitest";

it("backfills pre-0020 zero and nonzero legacy amounts without inventing measured charges", async () => {
  const { DB: db, TEST_MIGRATIONS: migrations } = env as unknown as {
    DB: D1Database;
    TEST_MIGRATIONS: Array<{ name: string; queries: string[] }>;
  };
  // Use the actual pre-0020 table definition in an isolated local-D1 table.
  const old = migrations
    .find((m) => m.name.startsWith("0013"))!
    .queries.find((q) => q.includes("CREATE TABLE llm_calls_new"))!;
  await db
    .prepare(old.replaceAll("llm_calls_new", "cost_migration_fixture"))
    .run();
  await db
    .prepare(
      `INSERT INTO runs (id,origin,mode,status,started_at,spend_cents,spend_currency,budget_cents) VALUES ('run-20260926-c032','manual','hitl','running','2026-09-26T15:00:00.000Z',17,'USD',500)`
    )
    .run();
  await db.batch(
    [0, 17].map((amount) =>
      db
        .prepare(
          `INSERT INTO cost_migration_fixture (id,run_id,role,provider,model,cost_cents,currency,created_at) VALUES (?,'run-20260926-c032','drafter','workersai','legacy',?,'USD','2026-09-26T15:00:00.000Z')`
        )
        .bind(`legacy-${amount}`, amount)
    )
  );
  const migration = migrations.find((m) => m.name.startsWith("0020"))!;
  await db.batch(
    migration.queries.map((sql) =>
      db.prepare(sql.replaceAll("llm_calls", "cost_migration_fixture"))
    )
  );
  const { results } = await db
    .prepare(
      "SELECT cost_cents,cost_basis,estimated_cost_cents,reported_cost_cents,reported_cost_usd,reported_cost_source,admission_bound_cents,policy_json FROM cost_migration_fixture ORDER BY cost_cents"
    )
    .all();
  expect(results).toEqual(
    [0, 17].map((amount) => ({
      cost_cents: amount,
      cost_basis: "legacy_estimate",
      estimated_cost_cents: amount,
      reported_cost_cents: null,
      reported_cost_usd: null,
      reported_cost_source: null,
      admission_bound_cents: null,
      policy_json: null
    }))
  );
});
