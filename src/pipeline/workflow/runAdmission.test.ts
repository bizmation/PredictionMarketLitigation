import { attachSnapshot } from "../../shared/db/repos/runPackagesRepo";
import { SourcePersistenceError } from "../connectors/connector";
import { decide } from "../gate/approval";
import { createCourtListenerCheck } from "../connectors/courtListener";
import { CONNECTOR_TIMEOUT_MS } from "../../shared/lib/timeouts";
import * as drafts from "../../shared/db/repos/draftsRepo";
import type { SourceCheck } from "../connectors/connector";
import { ensureRun, runIdFor } from "./dailyRunSteps";
import { env, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import {
  DailyRunWorkflow,
  kickDailyRun,
  startOperatorRun,
  recoverRunDispatch,
  type DailyRunParams
} from "./dailyRun";
import * as admission from "../../shared/db/repos/runAdmissionRepo";
import * as runs from "../../shared/db/repos/runsRepo";
import * as evidence from "../../shared/db/repos/evidenceRepo";
import * as accounting from "../../shared/db/repos/llmAccountingRepo";
import * as config from "../../shared/db/repos/pipelineConfigRepo";
import { fixtureCostPolicy } from "../../test/costPolicyFixture";
const db = (env as Env).DB;
let sequence = 0;
function input() {
  const date = new Date(Date.UTC(2025, 0, ++sequence))
    .toISOString()
    .slice(0, 10);
  return {
    origin: "manual" as const,
    scheduledFor: date,
    now: new Date(`${date}T17:00:00.000Z`),
    requestId: crypto.randomUUID()
  };
}
function binding(status = "running") {
  const instances = new Set<string>();
  return {
    instances,
    create: vi.fn(async ({ id }: { id: string }) => {
      if (instances.has(id)) throw new Error("arbitrary duplicate");
      instances.add(id);
    }),
    get: vi.fn(async (id: string) => {
      if (!instances.has(id)) throw new Error("not visible");
      return { status: async () => ({ status }) };
    })
  };
}
function idOf(result: Awaited<ReturnType<typeof startOperatorRun>>) {
  if (!("run" in result)) throw new Error(result.status);
  return result.run.id;
}
function fault(at: number, after = false) {
  let count = 0;
  return new Proxy(db, {
    get(target, key) {
      if (key === "batch")
        return async (stmts: D1PreparedStatement[]) => {
          if (++count === at) {
            if (after) await target.batch(stmts);
            throw new Error("storage interruption");
          }
          return target.batch(stmts);
        };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}
async function reserve(runId: string) {
  return accounting.reserve(db, {
    id: crypto.randomUUID(),
    runId,
    role: "drafter",
    key: "admission-test",
    fingerprint: "same",
    owner: crypto.randomUUID(),
    bound: 1,
    budget: 500,
    policy: fixtureCostPolicy("fake", "m", new Date().toISOString()),
    now: new Date().toISOString(),
    awaiting: false
  });
}
function localWorkflow(
  check: SourceCheck = vi.fn(async () => []),
  provider?: ReturnType<typeof fakeProvider>
) {
  class Local extends DailyRunWorkflow {
    protected override sourceChecks() {
      return { test: check };
    }
    protected override gatewayDeps() {
      return { db, provider, costPolicy: fixtureCostPolicy };
    }
  }
  const workflow = Object.create(Local.prototype) as Local;
  Object.defineProperty(workflow, "env", { value: { ...env, DB: db } });
  const cache = new Map<string, unknown>();
  const step = {
    do: async (name: string, body: () => Promise<unknown>) => {
      if (cache.has(name)) return cache.get(name);
      const value = await body();
      cache.set(name, value);
      return value;
    }
  } as unknown as WorkflowStep;
  return {
    check,
    cache,
    run: (payload: DailyRunParams, instanceId?: string) =>
      workflow.run(
        { payload, instanceId } as WorkflowEvent<DailyRunParams>,
        step
      )
  };
}
const material = [
  {
    entities: [
      {
        type: "states",
        id: "st-nv",
        body: "Nevada restricted.",
        diff: { operationalStatus: { from: "banned", to: "restricted" } }
      }
    ]
  }
];
function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((r) => {
    release = r;
  });
  return { promise, release };
}
function fakeProvider() {
  return {
    name: "admission-fake",
    complete: vi.fn(async ({ model }: { model: string }) => ({
      text: JSON.stringify(
        model === "drafter"
          ? {
              body: material[0]!.entities[0]!.body,
              diff: material[0]!.entities[0]!.diff
            }
          : {
              confidence: 99,
              citationCompleteness: 100,
              notes: "Primary source.",
              disagrees: false,
              disagreement: ""
            }
      ),
      inputTokens: 1,
      outputTokens: 1,
      reportedCostUsd: 0.01
    }))
  };
}
async function configureMaterial() {
  await config.appendVersion(db, {
    newValue: [{ name: "test", url: "https://example.test", tier: "tier1" }],
    actor: "test",
    createdAt: new Date().toISOString()
  });
  await db
    .prepare(
      `INSERT INTO gateway_config(id,version,roles_json,default_budget_cents,updated_at) VALUES('current',1,?,500,?) ON CONFLICT(id) DO UPDATE SET roles_json=excluded.roles_json, default_budget_cents=500`
    )
    .bind(
      JSON.stringify({
        drafter: { provider: "admission-fake", model: "drafter" },
        reviewer: { provider: "admission-fake", model: "reviewer" }
      }),
      new Date().toISOString()
    )
    .run();
}
describe("durable shared Run admission", () => {
  it("races all origins through material Workflow source and provider barriers", async () => {
    await configureMaterial();
    const i = input(),
      w = binding();
    const results = await Promise.all([
      startOperatorRun(db, w, i),
      startOperatorRun(db, w, {
        ...i,
        origin: "catch-up",
        requestId: crypto.randomUUID()
      }),
      kickDailyRun(w, i.now, db)
    ]);
    expect(results.filter((r) => r?.status === "started")).toHaveLength(1);
    expect(w.create).toHaveBeenCalledTimes(1);
    const winner = results.find((r) => r && "run" in r)!;
    const id = idOf(winner);
    const run = (await runs.getRunById(db, id))!;
    const sourceEntered = barrier(),
      sourceRelease = barrier(),
      providerEntered = barrier(),
      providerRelease = barrier();
    const check = vi.fn(async () => {
      sourceEntered.release();
      await sourceRelease.promise;
      return material;
    });
    const provider = fakeProvider();
    const normal = provider.complete.getMockImplementation()!;
    provider.complete.mockImplementation(async (args) => {
      providerEntered.release();
      await providerRelease.promise;
      return normal(args);
    });
    const wf = localWorkflow(check, provider);
    const execution = wf.run({
      origin: run.origin,
      scheduledFor: i.scheduledFor,
      runId: id
    });
    await sourceEntered.promise;
    await runs.completeRun(db, id, "empty", i.now.toISOString());
    expect(
      (await startOperatorRun(db, w, { ...i, requestId: crypto.randomUUID() }))
        .status
    ).toBe("conflict");
    await expect(admission.resolve(db, id)).rejects.toThrow();
    await db
      .prepare("UPDATE runs SET status='running',completed_at=NULL WHERE id=?")
      .bind(id)
      .run();
    sourceRelease.release();
    await providerEntered.promise;
    expect(
      (await startOperatorRun(db, w, { ...i, requestId: crypto.randomUUID() }))
        .status
    ).toBe("conflict");
    await expect(admission.resolve(db, id)).rejects.toThrow();
    providerRelease.release();
    await execution;
    expect(provider.complete).toHaveBeenCalledTimes(2);
    expect(check).toHaveBeenCalledTimes(1);
    const draft = (await drafts.listByRun(db, id))[0]!;
    expect(
      await decide(db, {
        draftId: draft.id,
        action: "reject",
        operator: { displayName: "Test operator" },
        now: new Date().toISOString(),
        rejectReason: "Keep existing record",
        rejectReasonPrivate: null
      })
    ).toMatchObject({ status: "decided" });
    const next = idOf(
      await startOperatorRun(db, w, { ...i, requestId: crypto.randomUUID() })
    );
    expect(next).not.toBe(id);
    await expect(
      wf.run({ origin: run.origin, scheduledFor: i.scheduledFor, runId: id })
    ).rejects.toThrow();
    expect(provider.complete).toHaveBeenCalledTimes(2);
    expect(await runs.listRunsForDate(db, i.scheduledFor)).toHaveLength(2);
  });
  it("concurrent same-request retries keep identity and never claim a row alone proves execution", async () => {
    const i = input(),
      w = binding();
    const results = await Promise.all([
      startOperatorRun(db, w, i),
      startOperatorRun(db, w, i)
    ]);
    expect(new Set(results.map(idOf)).size).toBe(1);
    expect(w.create).toHaveBeenCalledTimes(1);
    const retry = await startOperatorRun(db, w, i);
    expect(retry.status).toBe("started");
    expect(idOf(retry)).toBe(idOf(results[0]!));
  });
  it("recovers a missing binding using the exact pending Run", async () => {
    const i = input();
    const first = await startOperatorRun(db, undefined, i);
    expect(first.status).toBe("workflow_unavailable");
    const id = idOf(first);
    expect((await admission.get(db, id))?.state).toBe("unavailable");
    const w = binding();
    expect((await recoverRunDispatch(db, w, id)).status).toBe("started");
    expect(w.create.mock.calls[0]![0].id).toBe(`daily-${id}`);
  });
  it("does not let a stale unavailable observation overwrite concurrent submission", async () => {
    const i = input(),
      id = idOf(await startOperatorRun(db, undefined, i));
    await db
      .prepare("UPDATE run_admissions SET state='pending' WHERE run_id=?")
      .bind(id)
      .run();
    expect(await admission.claimSubmission(db, id)).toBe(true);
    const receipts = await evidence.listByRun(db, id);
    await admission.record(db, id, "unavailable");
    expect((await admission.get(db, id))?.state).toBe("submitting");
    expect(await evidence.listByRun(db, id)).toEqual(receipts);
  });
  it("does not infer existence from arbitrary error text and retains scrubbed uncertainty", async () => {
    const i = input();
    const w = {
      create: vi.fn(async () => {
        throw new Error("already exists sk-credentials-not-public");
      }),
      get: async () => {
        throw new Error("Bearer private");
      }
    };
    const r = await startOperatorRun(db, w, i),
      id = idOf(r);
    expect(r.status).toBe("dispatch_pending");
    expect((await admission.get(db, id))?.state).toBe("uncertain");
    expect(JSON.stringify(await evidence.listByRun(db, id))).not.toMatch(
      /credentials-not-public|Bearer private/
    );
    expect(
      (
        await startOperatorRun(db, binding(), {
          ...i,
          requestId: crypto.randomUUID()
        })
      ).status
    ).toBe("conflict");
    await recoverRunDispatch(db, w, id);
    expect(w.create).toHaveBeenCalledTimes(1);
  });
  it("positively confirms response loss without submitting a second instance", async () => {
    const i = input(),
      w = binding();
    w.create.mockImplementation(async ({ id }) => {
      w.instances.add(id);
      throw new Error("response lost");
    });
    const r = await startOperatorRun(db, w, i);
    expect(r.status).toBe("started");
    await recoverRunDispatch(db, w, idOf(r));
    expect(w.create).toHaveBeenCalledTimes(1);
  });
  for (const status of [
    "unknown",
    "errored",
    "terminated",
    "complete",
    "paused",
    "waitingForPause"
  ]) {
    it(`does not report ${status} as started`, async () => {
      const r = await startOperatorRun(db, binding(status), input());
      expect(r.status).toBe("dispatch_pending");
    });
  }
  for (const after of [false, true])
    for (const at of [1, 2, 3]) {
      it(`recovers ${after ? "lost receipt after" : "failure before"} transaction ${at} with at most one create`, async () => {
        const i = input(),
          w = binding();
        try {
          const interrupted = await startOperatorRun(fault(at, after), w, i);
          if (at === 2 || at === 3)
            expect(interrupted.status).not.toBe("started");
        } catch {
          /* intentionally interrupted */
        }
        const retry = await startOperatorRun(db, w, i);
        const id = idOf(retry);
        expect(w.create.mock.calls.length).toBeLessThanOrEqual(1);
        expect(await runs.listRunsForDate(db, i.scheduledFor)).toHaveLength(1);
        expect((await admission.get(db, id))?.state).not.toBe("pending");
        if (w.create.mock.calls.length === 0) {
          expect(retry.status).toBe("dispatch_pending");
          await recoverRunDispatch(db, w, id, true);
          expect((await admission.get(db, id))?.released).toBe(1);
        }
      });
    }
  it("fences a delayed never-entered submission, permits sequential work, and rejects old cached replay", async () => {
    const i = input(),
      w = binding();
    const id = idOf(await startOperatorRun(db, w, i));
    await recoverRunDispatch(db, w, id, true);
    const next = idOf(
      await startOperatorRun(db, w, { ...i, requestId: crypto.randomUUID() })
    );
    expect(next).not.toBe(id);
    const old = localWorkflow();
    old.cache.set("attach-run", id);
    old.cache.set("run-daily-step", {
      skip: false,
      runId: id,
      draftCount: 1,
      anyFailure: false
    });
    await expect(
      old.run({ origin: i.origin, scheduledFor: i.scheduledFor, runId: id })
    ).rejects.toThrow();
    expect(old.check).not.toHaveBeenCalled();
    await expect(reserve(id)).rejects.toThrow();
    expect((await runs.getRunById(db, id))?.status).toBe("failed");
  });
  it("refuses an unpinned legacy instance attaching to a newer admitted same-origin Run", async () => {
    const i = input();
    await startOperatorRun(db, binding(), i);
    const old = localWorkflow();
    await expect(
      old.run({ origin: i.origin, scheduledFor: i.scheduledFor })
    ).rejects.toThrow("run_admission_fenced");
    expect(old.check).not.toHaveBeenCalled();
  });
  it("keeps ownership while connector work is executing despite terminal display status", async () => {
    const i = input(),
      id = idOf(await startOperatorRun(db, binding(), i));
    await admission.enter(db, id);
    await runs.completeRun(db, id, "empty", i.now.toISOString());
    expect(
      (
        await startOperatorRun(db, binding(), {
          ...i,
          requestId: crypto.randomUUID()
        })
      ).status
    ).toBe("conflict");
    await expect(admission.resolve(db, id)).rejects.toThrow();
    await admission.finish(db, id);
    expect(
      (
        await startOperatorRun(db, binding(), {
          ...i,
          requestId: crypto.randomUUID()
        })
      ).status
    ).toBe("started");
  });
  it("blocks awaiting gates and reserved paid work even after Workflow completion", async () => {
    const i = input(),
      id = idOf(await startOperatorRun(db, binding(), i));
    const op = await reserve(id);
    await admission.finish(db, id);
    await runs.completeRun(db, id, "empty", i.now.toISOString());
    await expect(admission.resolve(db, id)).rejects.toThrow();
    expect(
      (
        await startOperatorRun(db, binding(), {
          ...i,
          requestId: crypto.randomUUID()
        })
      ).status
    ).toBe("conflict");
    await db
      .prepare(
        "UPDATE llm_operations SET state='released',liability_cents=0 WHERE id=?"
      )
      .bind(op.id)
      .run();
    await db
      .prepare("UPDATE runs SET status='awaiting' WHERE id=?")
      .bind(id)
      .run();
    await expect(admission.resolve(db, id)).rejects.toThrow();
  });
  it("preserves competing legacy history and refuses new admission", async () => {
    const i = input();
    for (const suffix of ["0000", "0001"])
      await runs.insertRun(db, {
        id: `run-${i.scheduledFor.replaceAll("-", "")}-${suffix}`,
        origin: "scheduled",
        scheduledFor: i.scheduledFor,
        mode: "hitl",
        status: "running",
        startedAt: i.now.toISOString(),
        completedAt: null,
        spendCents: 0,
        spendCurrency: "USD",
        budgetCents: 500
      });
    expect((await startOperatorRun(db, binding(), i)).status).toBe("conflict");
    expect(await runs.listRunsForDate(db, i.scheduledFor)).toHaveLength(2);
  });
  it("executes production Workflow then admits sequential work and fences its cached replay", async () => {
    await config.appendVersion(db, {
      newValue: [{ name: "test", url: "https://example.test", tier: "tier1" }],
      actor: "test",
      createdAt: new Date().toISOString()
    });
    const i = input(),
      id = idOf(await startOperatorRun(db, binding(), i)),
      wf = localWorkflow();
    const payload = {
      origin: i.origin,
      scheduledFor: i.scheduledFor,
      runId: id
    };
    await wf.run(payload);
    expect(wf.check).toHaveBeenCalledTimes(1);
    expect((await admission.get(db, id))?.finished).toBe(1);
    expect(
      (
        await startOperatorRun(db, binding(), {
          ...i,
          requestId: crypto.randomUUID()
        })
      ).status
    ).toBe("started");
    await expect(wf.run(payload)).rejects.toThrow();
    expect(wf.check).toHaveBeenCalledTimes(1);
  });

  it("completed scheduled repeats preserve the original identity after safe replacement", async () => {
    const i = input(),
      w = binding("complete");
    const first = await kickDailyRun(w, i.now, db);
    const id = idOf(first!);
    await localWorkflow().run({
      origin: "scheduled",
      scheduledFor: i.scheduledFor,
      runId: id
    });
    expect((await admission.listActive(db)).some((d) => d?.runId === id)).toBe(
      false
    );
    const repeat = await kickDailyRun(w, i.now, db);
    expect(idOf(repeat!)).toBe(id);
    expect(repeat?.status).not.toBe("started");
    expect(w.create).toHaveBeenCalledTimes(1);
  });
  it("legacy scheduled repeats preserve history without inventing instance confirmation", async () => {
    const i = input(),
      id = runIdFor(i.scheduledFor, "scheduled"),
      w = binding();
    await runs.insertRun(db, {
      id,
      origin: "scheduled",
      scheduledFor: i.scheduledFor,
      mode: "hitl",
      status: "empty",
      startedAt: i.now.toISOString(),
      completedAt: i.now.toISOString(),
      spendCents: 0,
      spendCurrency: "USD",
      budgetCents: 500
    });
    expect(await kickDailyRun(w, i.now, db)).toMatchObject({
      status: "scheduled_duplicate",
      run: { id }
    });
    expect(w.create).not.toHaveBeenCalled();
  });
  it("atomically fences a delayed legacy attach and permanently retires legacy history", async () => {
    const i = input(),
      w = binding();
    const results = await Promise.allSettled([
      ensureRun(db, "scheduled", i.scheduledFor),
      startOperatorRun(db, w, i)
    ]);
    expect(await runs.listRunsForDate(db, i.scheduledFor)).toHaveLength(1);
    const current = (await runs.listRunsForDate(db, i.scheduledFor))[0]!;
    const claim = (await admission.get(db, current.id))!;
    if (results[0]!.status === "fulfilled")
      expect(claim.request_id).toBe(admission.legacyRequestId(current.id));
    await runs.completeRun(db, current.id, "empty", new Date().toISOString());
    await admission.finish(db, current.id);
    const next = idOf(
      await startOperatorRun(db, w, { ...i, requestId: crypto.randomUUID() })
    );
    await admission.resolve(db, next);
    await expect(
      localWorkflow().run({
        origin: current.origin,
        scheduledFor: i.scheduledFor,
        runId: current.id
      })
    ).rejects.toThrow();
    await expect(reserve(current.id)).rejects.toThrow();
    const other = input(),
      legacyId = runIdFor(other.scheduledFor, "scheduled");
    await runs.insertRun(db, {
      id: legacyId,
      origin: "scheduled",
      scheduledFor: other.scheduledFor,
      mode: "hitl",
      status: "empty",
      startedAt: other.now.toISOString(),
      completedAt: other.now.toISOString(),
      spendCents: 0,
      spendCurrency: "USD",
      budgetCents: 500
    });
    const successor = idOf(await startOperatorRun(db, w, other));
    await admission.resolve(db, successor);
    await expect(admission.assertOwned(db, legacyId)).rejects.toThrow();
    await expect(reserve(legacyId)).rejects.toThrow();
  });
  for (const outcome of ["deadline", "sibling_failure"] as const) {
    it(`cancels real CourtListener pagination after ${outcome} and ownership transfer`, async () => {
      await configureMaterial();
      const i = input(),
        w = binding(),
        id = idOf(await startOperatorRun(db, w, i));
      const entered = barrier(),
        late = barrier(),
        fatal = barrier();
      const signals: AbortSignal[] = [];
      let requests = 0;
      const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
        signals.push(init.signal!);
        const index = ++requests;
        if (requests === 4) entered.release();
        if (outcome === "sibling_failure" && index === 1) {
          await fatal.promise;
          return Response.json({}, { status: 503 });
        }
        await late.promise;
        return Response.json({
          results: [
            {
              id: 97001,
              entry_number: 1,
              date_filed: "2026-10-04",
              description: "Late page"
            }
          ],
          next: "?page=2"
        });
      });
      const check = createCourtListenerCheck({
        db,
        token: "fake-only",
        fetchImpl: fetcher
      });
      const provider = fakeProvider();
      const wf = localWorkflow(check, provider);
      if (outcome === "deadline") vi.useFakeTimers();
      try {
        const execution = wf.run({
          origin: i.origin,
          scheduledFor: i.scheduledFor,
          runId: id
        });
        await entered.promise;
        if (outcome === "deadline")
          await vi.advanceTimersByTimeAsync(CONNECTOR_TIMEOUT_MS + 1);
        else fatal.release();
        await execution;
        expect(signals.every((s) => s.aborted)).toBe(true);
        expect((await runs.getRunById(db, id))?.status).toBe("failed");
        const receipts = await evidence.listByRun(db, id);
        expect(
          (
            await startOperatorRun(db, w, {
              ...i,
              requestId: crypto.randomUUID()
            })
          ).status
        ).toBe("started");
        late.release();
        // Flush late ignored-abort responses through their pagination continuations.
        for (let n = 0; n < 20; n++) await Promise.resolve();
        expect(fetcher).toHaveBeenCalledTimes(4);
        expect(await drafts.listByRun(db, id)).toEqual([]);
        expect(await evidence.listByRun(db, id)).toEqual(receipts);
        expect(provider.complete).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
        late.release();
        fatal.release();
      }
    });
  }
  for (const liability of ["dispatched", "uncertain", "issue"] as const)
    for (const release of ["resolve", "replace"] as const) {
      it(`blocks ${release} for real ${liability} liability until reconciliation`, async () => {
        const i = input(),
          w = binding(),
          id = idOf(await startOperatorRun(db, w, i));
        let op = await reserve(id);
        await accounting.claimDispatch(
          db,
          op,
          op.owner,
          new Date().toISOString()
        );
        if (liability !== "dispatched")
          await accounting.markUncertain(
            db,
            op.id,
            op.owner,
            liability === "issue" ? "reported_over_bound" : "unknown_result"
          );
        await admission.finish(db, id);
        await runs.completeRun(db, id, "empty", i.now.toISOString());
        await expect(admission.resolve(db, id)).rejects.toThrow();
        expect(
          (
            await startOperatorRun(db, w, {
              ...i,
              requestId: crypto.randomUUID()
            })
          ).status
        ).toBe("conflict");
        op = (await accounting.getOperationById(db, op.id))!;
        await accounting.reconcile(
          db,
          op.id,
          {
            requestId: crypto.randomUUID(),
            expectedVersion: op.version,
            decision: "confirmed_no_charge",
            evidenceReference: "test/provider-ledger",
            note: "Fake provider confirms no charge."
          },
          "test",
          new Date().toISOString()
        );
        if (release === "resolve") {
          await admission.resolve(db, id);
          await admission.resolve(db, id);
        }
        expect(
          (
            await startOperatorRun(db, w, {
              ...i,
              requestId: crypto.randomUUID()
            })
          ).status
        ).toBe("started");
      });
    }
  for (const pinned of [false, true]) {
    it(`acquires ${pinned ? "pinned" : "cached unpinned"} legacy ownership with the real Workflow identity before effects`, async () => {
      await configureMaterial();
      const i = input(),
        id = runIdFor(i.scheduledFor, i.origin),
        instanceId = `actual-historical-${id}`;
      await runs.insertRun(db, {
        id,
        origin: i.origin,
        scheduledFor: i.scheduledFor,
        mode: "hitl",
        status: "running",
        startedAt: i.now.toISOString(),
        completedAt: null,
        spendCents: 0,
        spendCurrency: "USD",
        budgetCents: 500
      });
      const check = vi.fn(async () => {
        expect((await admission.get(db, id))?.entered).toBe(1);
        throw new SourcePersistenceError("storage interruption");
      });
      const wf = localWorkflow(check);
      if (!pinned) {
        await attachSnapshot(db, id);
        wf.cache.set("attach-run", id);
      }
      await expect(
        wf.run(
          {
            origin: i.origin,
            scheduledFor: i.scheduledFor,
            ...(pinned ? { runId: id } : {})
          },
          instanceId
        )
      ).rejects.toThrow("source_persistence_interrupted");
      expect((await admission.get(db, id))?.instance_id).toBe(instanceId);
      expect(check).toHaveBeenCalledTimes(1);
      await expect(admission.resolve(db, id)).rejects.toThrow();
      const w = {
        create: vi.fn(async () => {}),
        get: vi.fn(async (requested: string) => {
          expect(requested).toBe(instanceId);
          return { status: async () => ({ status: "errored" }) };
        })
      };
      expect((await recoverRunDispatch(db, w, id)).status).toBe(
        "dispatch_pending"
      );
      expect(await admission.inspect(db, id)).toMatchObject({
        instanceStatus: "errored",
        canResolve: true
      });
      await recoverRunDispatch(db, w, id, true);
      expect((await admission.get(db, id))?.released).toBe(1);
      expect(w.create).not.toHaveBeenCalled();
    });
    it(`refuses competing unresolved legacy rows on ${pinned ? "pinned" : "cached"} entry`, async () => {
      const i = input(),
        id = runIdFor(i.scheduledFor, i.origin);
      for (const rowId of [id, id.slice(0, -4) + "abcd"])
        await runs.insertRun(db, {
          id: rowId,
          origin: i.origin,
          scheduledFor: i.scheduledFor,
          mode: "hitl",
          status: "running",
          startedAt: i.now.toISOString(),
          completedAt: null,
          spendCents: 0,
          spendCurrency: "USD",
          budgetCents: 500
        });
      const check = vi.fn(async () => []),
        wf = localWorkflow(check);
      wf.cache.set("attach-run", id);
      await expect(
        wf.run(
          {
            origin: i.origin,
            scheduledFor: i.scheduledFor,
            ...(pinned ? { runId: id } : {})
          },
          `actual-${id}`
        )
      ).rejects.toThrow();
      expect(await admission.get(db, id)).toBeNull();
      expect(check).not.toHaveBeenCalled();
    });
  }
  it("namespaces reserved-looking caller keys without changing same-key validation", async () => {
    for (const key of [
      "scheduled-2025-01-01",
      "legacy-run-20250101-0002",
      "internal:scheduled:2025-01-01",
      "internal:legacy:run-20250101-0002"
    ]) {
      const i = { ...input(), requestId: key },
        w = binding();
      const id = idOf(await startOperatorRun(db, w, i));
      expect((await admission.get(db, id))?.request_id).toBe(`operator:${key}`);
      expect((await admission.get(db, id))?.instance_id).toBe(`daily-${id}`);
      expect(idOf(await startOperatorRun(db, w, i))).toBe(id);
      expect(
        (await startOperatorRun(db, w, { ...i, origin: "catch-up" })).status
      ).toBe("conflict");
      expect(
        (await startOperatorRun(db, w, { ...i, scheduledFor: "2028-01-01" }))
          .status
      ).toBe("conflict");
      expect(w.create).toHaveBeenCalledTimes(1);
    }
  });
  it("projects several unresolved Runs and resolution eligibility in one query", async () => {
    const ids = [];
    for (let n = 0; n < 3; n++)
      ids.push(idOf(await startOperatorRun(db, undefined, input())));
    const i = input(),
      done = idOf(await startOperatorRun(db, undefined, i));
    await runs.completeRun(db, done, "empty", new Date().toISOString());
    await admission.finish(db, done);
    let queries = 0;
    const counted = new Proxy(db, {
      get(target, key) {
        if (key === "prepare")
          return (sql: string) => {
            queries++;
            return target.prepare(sql);
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    const projected = await admission.listActive(counted);
    expect(queries).toBe(1);
    for (const id of ids)
      expect(projected.find((d) => d.runId === id)).toMatchObject({
        state: "unavailable",
        canResolve: true
      });
    expect(projected.some((d) => d.runId === done)).toBe(false);
  });
  for (const stale of ["running", "unknown"]) {
    it(`retains authoritative dispatch state when a delayed ${stale} receipt arrives last`, async () => {
      const i = input(),
        id = idOf(await startOperatorRun(db, undefined, i));
      const reached = barrier(),
        release = barrier();
      let batches = 0;
      const slowDb = new Proxy(db, {
        get(target, key) {
          if (key === "batch")
            return async (stmts: D1PreparedStatement[]) => {
              if (++batches === 2) {
                reached.release();
                await release.promise;
              }
              return target.batch(stmts);
            };
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        }
      });
      const old = binding(stale);
      old.instances.add(`daily-${id}`);
      const pending = recoverRunDispatch(slowDb, old, id);
      await reached.promise;
      const authoritative = binding(
        stale === "running" ? "errored" : "running"
      );
      authoritative.instances.add(`daily-${id}`);
      await recoverRunDispatch(db, authoritative, id);
      release.release();
      const delayed = await pending;
      expect((await admission.get(db, id))?.instance_status).toBe(
        stale === "running" ? "errored" : "running"
      );
      expect((await admission.get(db, id))?.state).toBe("confirmed");
      expect(delayed.status).toBe("dispatch_pending");
      const receipts = await evidence.listByRun(db, id);
      expect(receipts.at(-1)?.payload).toMatchObject({
        dispatch: "confirmed",
        instanceStatus: stale === "running" ? "errored" : "running"
      });
    });
  }
  it("refuses a stale supersede predecessor when publication commits at admission", async () => {
    const i = input(),
      prior = runIdFor(i.scheduledFor, "scheduled");
    await runs.insertRun(db, {
      id: prior,
      origin: "scheduled",
      scheduledFor: i.scheduledFor,
      mode: "hitl",
      status: "empty",
      startedAt: i.now.toISOString(),
      completedAt: i.now.toISOString(),
      spendCents: 0,
      spendCurrency: "USD",
      budgetCents: 500
    });
    let published = false;
    const raced = new Proxy(db, {
      get(target, key) {
        if (key === "batch")
          return async (stmts: D1PreparedStatement[]) => {
            if (!published) {
              published = true;
              await db
                .prepare("UPDATE runs SET status='published' WHERE id=?")
                .bind(prior)
                .run();
            }
            return target.batch(stmts);
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    await expect(
      startOperatorRun(raced, binding(), { ...i, supersedePriorPublish: true })
    ).rejects.toThrow();
    expect(await runs.listRunsForDate(db, i.scheduledFor)).toHaveLength(1);
    const next = idOf(
      await startOperatorRun(db, binding(), {
        ...i,
        supersedePriorPublish: true
      })
    );
    expect(
      (await evidence.listByRun(db, next)).find(
        (e) => e.event === "run.superseded"
      )?.payload
    ).toEqual({ priorRunId: prior });
  });
  it("preserves prior confirmation but does not report started after a fresh failed lookup", async () => {
    const i = input(),
      w = binding(),
      id = idOf(await startOperatorRun(db, w, i));
    const before = await evidence.listByRun(db, id);
    w.get.mockRejectedValueOnce(new Error("inspection unavailable"));
    expect((await recoverRunDispatch(db, w, id)).status).toBe(
      "dispatch_pending"
    );
    expect((await admission.get(db, id))?.state).toBe("confirmed");
    expect((await admission.get(db, id))?.instance_status).toBe("running");
    expect(await evidence.listByRun(db, id)).toEqual(before);
  });
  it("treats a caller key matching its own legacy Run as an ordinary operator request", async () => {
    const base = input();
    const i = {
        ...base,
        requestId: `legacy-${runIdFor(base.scheduledFor, base.origin)}`
      },
      w = binding();
    const result = await startOperatorRun(db, w, i),
      id = idOf(result);
    expect(result.status).toBe("started");
    expect((await admission.get(db, id))?.instance_id).toBe(`daily-${id}`);
    expect((await admission.get(db, id))?.request_id).toBe(
      `operator:${i.requestId}`
    );
    expect(w.create).toHaveBeenCalledTimes(1);
  });
});
