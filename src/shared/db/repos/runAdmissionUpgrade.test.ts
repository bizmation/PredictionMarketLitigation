import { env, applyD1Migrations } from "cloudflare:test";
import { expect, it } from "vitest";
import { startOperatorRun } from "../../../pipeline/workflow/dailyRun";
it("upgrades competing legacy Runs and populated Evidence without deleting or inventing history", async () => {
  const { UPGRADE_DB: db, TEST_MIGRATIONS: migrations } = env as unknown as {
    UPGRADE_DB: D1Database;
    TEST_MIGRATIONS: Array<{ name: string; queries: string[] }>;
  };
  const migration = migrations.find((m) => m.name.startsWith("0023"))!;
  await applyD1Migrations(
    db,
    migrations.filter((m) => m.name < migration.name)
  );
  for (const suffix of ["aa01", "aa02"]) {
    const id = `run-20261001-${suffix}`;
    await db
      .prepare(
        "INSERT INTO runs(id,origin,mode,status,started_at,spend_cents,spend_currency,budget_cents,scheduled_for) VALUES(?,'manual','hitl','running','2026-10-01T12:00:00.000Z',0,'USD',500,'2026-10-01')"
      )
      .bind(id)
      .run();
    await db
      .prepare(
        "INSERT INTO evidence_events(id,run_id,seq,event,payload_json,created_at) VALUES(?,?,0,'run.started','{}','2026-10-01T12:00:00.000Z')"
      )
      .bind(`e-${id}`, id)
      .run();
  }
  const before = (
    await db.prepare("SELECT * FROM evidence_events ORDER BY id").all()
  ).results;
  const runs = (await db.prepare("SELECT * FROM runs ORDER BY id").all())
    .results;
  await applyD1Migrations(db, [migration]);
  expect(
    (await db.prepare("SELECT * FROM evidence_events ORDER BY id").all())
      .results
  ).toEqual(before);
  expect(
    (await db.prepare("SELECT * FROM runs ORDER BY id").all()).results
  ).toEqual(runs);
  expect(
    (
      await startOperatorRun(db, undefined, {
        origin: "catch-up",
        scheduledFor: "2026-10-01",
        now: new Date()
      })
    ).status
  ).toBe("conflict");
});
