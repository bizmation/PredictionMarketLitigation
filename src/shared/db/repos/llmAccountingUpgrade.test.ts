import { env, applyD1Migrations } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import { complete } from "../../../pipeline/ai/gateway";
import { fixtureCostPolicy } from "../../../test/costPolicyFixture";
import * as accounting from "./llmAccountingRepo";

it("upgrades populated legacy accounting without fabricating or discarding charges", async () => {
  const { UPGRADE_DB: db, TEST_MIGRATIONS: migrations } = env as unknown as {
    UPGRADE_DB: D1Database;
    TEST_MIGRATIONS: Array<{ name: string; queries: string[] }>;
  };
  const migration = migrations.find((m) => m.name.startsWith("0021"))!;
  await applyD1Migrations(
    db,
    migrations.filter((m) => m.name < migration.name)
  );
  const now = "2026-10-02T12:00:00.000Z";
  for (const [suffix, cached] of [
    ["aa01", 80],
    ["aa02", 30],
    ["aa03", 10]
  ] as const) {
    const id = "run-20261002-" + suffix;
    await db
      .prepare(
        "INSERT INTO runs (id,origin,mode,status,started_at,spend_cents,spend_currency,budget_cents) VALUES (?,'manual','hitl','running',?,?,'USD',100)"
      )
      .bind(id, now, cached)
      .run();
    await db
      .prepare(
        "INSERT INTO llm_calls (id,run_id,role,provider,model,cost_cents,currency,created_at,cost_basis,estimated_cost_cents) VALUES (?,?,'drafter','fake','m',30,'USD',?,'legacy_estimate',30)"
      )
      .bind("call-" + suffix, id, now)
      .run();
  }
  const anomalous = "run-20261002-aa04";
  await db
    .prepare(
      "INSERT INTO runs (id,origin,mode,status,started_at,spend_cents,spend_currency,budget_cents) VALUES (?,'manual','hitl','running',?,75,'USD',100)"
    )
    .bind(anomalous, now)
    .run();
  await db
    .prepare(
      "INSERT INTO llm_calls (id,run_id,role,provider,model,tokens_json,cost_cents,currency,created_at,cost_basis,admission_bound_cents,estimated_cost_cents,reported_cost_cents,reported_cost_usd,reported_cost_source,accounting_issue,policy_json) VALUES ('old-anomaly',?,'reviewer','fake','m','{\"input\":2,\"output\":3}',75,'USD',?,'conservative_bound',50,1,75,'0.75','fake.usage.cost','reported_cost_exceeds_bound',?)"
    )
    .bind(anomalous, now, JSON.stringify(fixtureCostPolicy("fake", "m", now)))
    .run();
  const originals = (
    await db.prepare("SELECT * FROM llm_calls ORDER BY id").all()
  ).results;
  await applyD1Migrations(db, [migration]);
  expect(
    (await db.prepare("SELECT * FROM llm_calls ORDER BY id").all()).results
  ).toEqual(originals);
  expect(
    (
      await db
        .prepare(
          "SELECT run_id,amount_cents FROM llm_legacy_adjustments ORDER BY run_id"
        )
        .all()
    ).results
  ).toEqual([
    { run_id: "run-20261002-aa01", amount_cents: 50 },
    { run_id: "run-20261002-aa02", amount_cents: 0 },
    { run_id: "run-20261002-aa03", amount_cents: 0 },
    { run_id: anomalous, amount_cents: 0 }
  ]);
  expect(
    (
      await db
        .prepare("SELECT total_cents FROM llm_run_accounting ORDER BY run_id")
        .all()
    ).results
  ).toEqual([
    { total_cents: 80 },
    { total_cents: 30 },
    { total_cents: 30 },
    { total_cents: 75 }
  ]);
  const op = (await accounting.getOperationById(db, "old-anomaly"))!;
  expect(JSON.parse(op.response_evidence_json!)).toMatchObject({
    role: "reviewer",
    reportedCostUsd: "0.75",
    reportedCostSource: "fake.usage.cost",
    costBasis: "conservative_bound",
    accountingIssue: "reported_cost_exceeds_bound",
    tokens: { input: 2, output: 3 }
  });
  await accounting.reconcile(
    db,
    op.id,
    {
      requestId: "legacy-reconcile",
      expectedVersion: 1,
      decision: "confirmed_no_charge",
      evidenceReference: "invoice:old",
      note: "Provider corrected invoice"
    },
    "Operator",
    now
  );
  const receipt = await db
    .prepare("SELECT before_json FROM llm_reconciliations WHERE request_id=?")
    .bind("legacy-reconcile")
    .first<{ before_json: string }>();
  expect(JSON.parse(receipt!.before_json).ledger).toEqual(
    JSON.parse(op.response_evidence_json!)
  );
  await db
    .prepare("UPDATE gateway_config SET roles_json=? WHERE id='current'")
    .bind(JSON.stringify({ drafter: { provider: "fake", model: "m" } }))
    .run();
  // Exercise today's gateway against the complete current schema after proving
  // the populated 0021 upgrade above preserves all original accounting.
  await applyD1Migrations(
    db,
    migrations.filter((m) => m.name > migration.name)
  );
  const dispatch = vi.fn(async () => ({
    text: "ok",
    inputTokens: 1,
    outputTokens: 1,
    reportedCostUsd: 0.01
  }));
  const deps = {
    db,
    provider: { name: "fake", complete: dispatch },
    costPolicy: fixtureCostPolicy,
    now: () => now
  };
  await expect(
    complete(deps, {
      operationKey: "new",
      role: "drafter",
      runId: "run-20261002-aa01",
      prompt: "x"
    })
  ).rejects.toMatchObject({ code: "budget_stopped" });
  expect(dispatch).not.toHaveBeenCalled();
  await complete(deps, {
    operationKey: "new",
    role: "drafter",
    runId: "run-20261002-aa02",
    prompt: "x"
  });
  expect(dispatch).toHaveBeenCalledTimes(1);
});
