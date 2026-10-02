import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import * as accounting from "./llmAccountingRepo";
import * as runs from "./runsRepo";
import { LlmCallRecordSchema } from "../../schemas/gateway";
import { fixtureCostPolicy } from "../../../test/costPolicyFixture";

const db = (env as Env).DB;
let sequence = 0;
async function setup(budget = 100) {
  const n = ++sequence;
  const now = new Date(Date.UTC(2026, 0, n)).toISOString();
  const runId = `run-202601${String(n).padStart(2, "0")}-${n.toString(16).padStart(4, "0")}`;
  await runs.insertRun(db, {
    id: runId,
    origin: "manual",
    mode: "hitl",
    status: "running",
    startedAt: now,
    completedAt: null,
    spendCents: 0,
    spendCurrency: "USD",
    budgetCents: budget,
    scheduledFor: null
  });
  const policy = fixtureCostPolicy("fake", "m", now);
  const input = {
    id: crypto.randomUUID(),
    runId,
    role: "drafter",
    key: "draft:1:drafter",
    fingerprint: "fp",
    owner: crypto.randomUUID(),
    bound: 50,
    budget,
    policy,
    now,
    awaiting: false
  };
  return { input, runId, now };
}
function call(op: accounting.Operation, cost = 1, issue: string | null = null) {
  return LlmCallRecordSchema.parse({
    id: op.id,
    runId: op.run_id,
    role: "drafter",
    provider: "fake",
    model: "m",
    tokens: { input: 1, output: 1 },
    costCents: cost,
    costBasis: "provider_reported",
    admissionBoundCents: 50,
    reportedCostCents: cost,
    reportedCostUsd: String(cost / 100),
    currency: "USD",
    createdAt: op.created_at,
    accountingIssue: issue
  });
}
function batchFault(kind: "rollback" | "lost", at: number) {
  let count = 0;
  return new Proxy(db, {
    get(target, prop) {
      if (prop === "batch")
        return async (statements: D1PreparedStatement[]) => {
          if (++count === at) {
            if (kind === "rollback")
              return target.batch([
                ...statements,
                target.prepare(
                  "INSERT INTO gate_assertions VALUES ('injected',0)"
                )
              ]);
            await target.batch(statements);
            throw new Error("response lost");
          }
          return target.batch(statements);
        };
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}
describe("atomic LLM accounting on real D1", () => {
  it("reserves one winner and refuses partial admission across overlapping periods", async () => {
    const { input, runId, now } = await setup(50);
    for (const [id, cap] of [
      ["a", 100],
      ["b", 50]
    ] as const)
      await db
        .prepare("INSERT INTO llm_periods VALUES (?,?,?,?,?)")
        .bind(
          `${runId}-${id}`,
          now,
          new Date(Date.parse(now) + 86400000).toISOString(),
          cap,
          "reviewed fixture"
        )
        .run();
    const results = await Promise.allSettled([
      accounting.reserve(db, input),
      accounting.reserve(db, {
        ...input,
        id: crypto.randomUUID(),
        key: "second",
        owner: "second"
      })
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await accounting.accountingForRun(db, runId)).toMatchObject({
      totalCents: 50,
      reservedCents: 50
    });
    expect(
      (
        await db
          .prepare("SELECT * FROM llm_operation_periods WHERE operation_id=?")
          .bind(input.id)
          .all()
      ).results
    ).toHaveLength(2);
  });
  it("rolls reservation and cached total back together", async () => {
    const { input, runId } = await setup();
    await expect(
      accounting.reserve(batchFault("rollback", 1), input)
    ).rejects.toThrow();
    expect(await accounting.getOperation(db, runId, input.key)).toBeNull();
    expect(await accounting.accountingForRun(db, runId)).toMatchObject({
      totalCents: 0
    });
  });
  it("does not convert a lost reservation response into dispatch ownership", async () => {
    const { input, runId } = await setup();
    await expect(
      accounting.reserve(batchFault("lost", 1), input)
    ).rejects.toThrow("response lost");
    expect(await accounting.getOperation(db, runId, input.key)).toMatchObject({
      state: "reserved"
    });
    const retry = await accounting.reserve(db, {
      ...input,
      owner: "new-owner"
    });
    await expect(
      accounting.claimDispatch(db, retry, "new-owner", input.now)
    ).rejects.toThrow();
    expect(await accounting.accountingForRun(db, runId)).toMatchObject({
      reservedCents: 50
    });
  });
  it("retains ownership after dispatch response loss and forbids another claim", async () => {
    const { input } = await setup();
    const op = await accounting.reserve(db, input);
    await expect(
      accounting.claimDispatch(batchFault("lost", 1), op, op.owner, input.now)
    ).rejects.toThrow();
    await expect(
      accounting.claimDispatch(db, op, op.owner, input.now)
    ).rejects.toThrow();
    expect(await accounting.getOperationById(db, op.id)).toMatchObject({
      state: "dispatched"
    });
  });
  it("rolls settlement back at its last boundary; commits replay atomically and idempotently after response loss", async () => {
    const { input, runId } = await setup();
    const op = await accounting.reserve(db, input);
    await accounting.claimDispatch(db, op, op.owner, input.now);
    await expect(
      accounting.settle(
        batchFault("rollback", 1),
        op,
        call(op),
        { text: "private" },
        "gen-1"
      )
    ).rejects.toThrow();
    expect(await accounting.accountingForRun(db, runId)).toMatchObject({
      totalCents: 50,
      uncertainCents: 50
    });
    expect(
      await db.prepare("SELECT * FROM llm_calls WHERE id=?").bind(op.id).first()
    ).toBeNull();
    expect(
      (await accounting.getOperationById(db, op.id))?.response_evidence_json
    ).toContain("private");
  });
  it("commits replay atomically and idempotently after settlement response loss", async () => {
    const { input, runId } = await setup();
    const op = await accounting.reserve(db, input);
    await accounting.claimDispatch(db, op, op.owner, input.now);
    await accounting.settle(
      batchFault("lost", 1),
      op,
      call(op),
      { text: "private" },
      "gen-1"
    );
    await accounting.settle(db, op, call(op), { text: "private" }, "gen-1");
    expect(await accounting.accountingForRun(db, runId)).toMatchObject({
      totalCents: 1,
      reservedCents: 0
    });
    expect(
      (await accounting.getOperationById(db, op.id))?.result_json
    ).toContain("private");
    await expect(
      accounting.settle(db, op, call(op, 2), { text: "other" }, null)
    ).rejects.toThrow();
  });
  it("reconciles with an immutable receipt, conflicts on stale/changed requests and preserves the original role", async () => {
    const { input, runId } = await setup();
    const op = await accounting.reserve(db, input);
    await accounting.claimDispatch(db, op, op.owner, input.now);
    await accounting.markUncertain(db, op.id, op.owner, "timeout");
    const request = {
      requestId: crypto.randomUUID(),
      expectedVersion: 3,
      decision: "confirmed_charge" as const,
      originalUsd: "0.010000000000000001",
      evidenceReference: "ticket:charge-1",
      note: "Provider invoice checked"
    };
    await expect(
      accounting.reconcile(
        batchFault("rollback", 1),
        op.id,
        request,
        "Operator",
        input.now
      )
    ).rejects.toThrow();
    expect(await accounting.accountingForRun(db, runId)).toMatchObject({
      uncertainCents: 50
    });
    const receipt = await accounting.reconcile(
      db,
      op.id,
      request,
      "Operator",
      input.now
    );
    expect(
      await accounting.reconcile(db, op.id, request, "Operator", input.now)
    ).toEqual(receipt);
    expect(
      await db
        .prepare("SELECT role,cost_cents FROM llm_calls WHERE id=?")
        .bind(op.id)
        .first()
    ).toEqual({ role: "drafter", cost_cents: 2 });
    await expect(
      accounting.reconcile(
        db,
        op.id,
        { ...request, note: "changed" },
        "Operator",
        input.now
      )
    ).rejects.toThrow();
    await expect(
      accounting.reconcile(
        db,
        op.id,
        { ...request, requestId: "stale" },
        "Operator",
        input.now
      )
    ).rejects.toThrow();
    await expect(
      accounting.settle(db, op, call(op), { text: "late" }, null)
    ).rejects.toThrow();
    expect(await accounting.accountingForRun(db, runId)).toMatchObject({
      totalCents: 2,
      uncertainCents: 0,
      issueCount: 0
    });
  });
  it("explicit no-charge releases a proven never-dispatched operation and leaves no replay result", async () => {
    const { input, runId } = await setup();
    const op = await accounting.reserve(db, input);
    await accounting.reconcile(
      db,
      op.id,
      {
        requestId: crypto.randomUUID(),
        expectedVersion: 1,
        decision: "confirmed_no_charge",
        evidenceReference: "incident:pre-dispatch",
        note: "Dispatch owner stopped before claim"
      },
      "Operator",
      input.now
    );
    expect(await accounting.accountingForRun(db, runId)).toMatchObject({
      totalCents: 0
    });
    expect(await accounting.getOperationById(db, op.id)).toMatchObject({
      state: "reconciled",
      result_json: null
    });
  });
  it("retains original closed period attribution and full over-bound charges; reconciliation never raises caps", async () => {
    const { input, runId, now } = await setup(200);
    const end = new Date(Date.parse(now) + 1000).toISOString();
    await db
      .prepare("INSERT INTO llm_periods VALUES (?,?,?,?,?)")
      .bind(runId, now, end, 50, "reviewed fixture")
      .run();
    const op = await accounting.reserve(db, input);
    await accounting.claimDispatch(db, op, op.owner, now);
    await accounting.settle(
      db,
      op,
      {
        ...call(op, 70, "reported_cost_exceeds_bound"),
        createdAt: new Date(Date.parse(now) + 2000).toISOString()
      },
      null,
      null
    );
    expect(
      await db
        .prepare(
          "SELECT total_cents FROM llm_period_accounting WHERE period_id=?"
        )
        .bind(runId)
        .first()
    ).toEqual({ total_cents: 70 });
    expect(await accounting.accountingForRun(db, runId)).toMatchObject({
      totalCents: 70,
      issueCount: 1
    });
    await expect(
      accounting.reserve(db, {
        ...input,
        id: "blocked-" + runId,
        key: "second",
        owner: "second"
      })
    ).rejects.toThrow();
    await accounting.reconcile(
      db,
      op.id,
      {
        requestId: crypto.randomUUID(),
        expectedVersion: 3,
        decision: "confirmed_charge",
        originalUsd: "0.70",
        evidenceReference: "invoice:70",
        note: "Charge confirmed"
      },
      "Operator",
      now
    );
    await expect(
      accounting.reserve(db, {
        ...input,
        id: "blocked2-" + runId,
        key: "second",
        owner: "second"
      })
    ).rejects.toThrow();
    expect(
      await db
        .prepare("SELECT cap_cents FROM llm_periods WHERE id=?")
        .bind(runId)
        .first()
    ).toEqual({ cap_cents: 50 });
  });
  it("counts historical ledger entries in newly provisioned periods and refuses period mutation", async () => {
    const { input, runId, now } = await setup();
    await db
      .prepare(
        "INSERT INTO llm_calls (id,run_id,role,provider,model,cost_cents,currency,created_at) VALUES (?,?,'drafter','fake','m',51,'USD',?)"
      )
      .bind("old-" + runId, runId, now)
      .run();
    await db
      .prepare("INSERT INTO llm_periods VALUES (?,?,?,?,?)")
      .bind(
        runId,
        now,
        new Date(Date.parse(now) + 1000).toISOString(),
        100,
        "reviewed historical window"
      )
      .run();
    await expect(accounting.reserve(db, input)).rejects.toThrow();
    await expect(
      db
        .prepare("UPDATE llm_periods SET cap_cents=1000 WHERE id=?")
        .bind(runId)
        .run()
    ).rejects.toThrow();
    await expect(
      db.prepare("DELETE FROM llm_periods WHERE id=?").bind(runId).run()
    ).rejects.toThrow();
  });
});

it("records newly provisioned applicable periods and their transactional before/after totals", async () => {
  const { input, now, runId } = await setup();
  const op = await accounting.reserve(db, input);
  await db
    .prepare("INSERT INTO llm_periods VALUES (?,?,?,?,?)")
    .bind(
      "late-period-" + runId,
      now,
      new Date(Date.parse(now) + 1000).toISOString(),
      100,
      "reviewed after reservation"
    )
    .run();
  const result = await accounting.reconcile(
    db,
    op.id,
    {
      requestId: "late-period-reconcile-" + runId,
      expectedVersion: 1,
      decision: "confirmed_charge",
      originalUsd: "0.03",
      evidenceReference: "ticket:late-period",
      note: "Confirmed"
    },
    "Operator",
    now
  );
  expect(result.periods).toEqual([
    { periodId: "late-period-" + runId, totalCents: 3, capCents: 100 }
  ]);
  const receipt = await db
    .prepare(
      "SELECT before_json,after_json FROM llm_reconciliations WHERE operation_id=?"
    )
    .bind(op.id)
    .first<{ before_json: string; after_json: string }>();
  expect(JSON.parse(receipt!.before_json).periods).toEqual([
    { periodId: "late-period-" + runId, totalCents: 50, capCents: 100 }
  ]);
  expect(JSON.parse(receipt!.after_json).totalCents).toBe(3);
});
