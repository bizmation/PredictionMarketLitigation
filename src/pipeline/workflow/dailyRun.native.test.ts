import { env, introspectWorkflowInstance } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { fixture } from "../../test/nativeWorkflow";
import * as configRepo from "../../shared/db/repos/pipelineConfigRepo";
import * as draftsRepo from "../../shared/db/repos/draftsRepo";
import * as runsRepo from "../../shared/db/repos/runsRepo";
import * as admission from "../../shared/db/repos/runAdmissionRepo";
import { handlePublicApi } from "../../shared/api/publicRouter";
import { RunDetailSchema } from "../../shared/schemas/run";
import worker from "../../server";
import { runIdFor } from "./dailyRunSteps";
import { kickDailyRun, startOperatorRun } from "./dailyRun";

// A separate workerd project avoids the Agents wrapper's conflicting exports.
// Every checkpoint/body is the inherited production implementation. Only the
// external source/provider edges in nativeWorkflow.ts are deterministic.
const native = env as unknown as { DB: D1Database; DAILY_RUN: Workflow };
const db = native.DB;
let sequence = 0;
let fixtureSequence = 0;
const handles: Awaited<ReturnType<typeof introspectWorkflowInstance>>[] = [];
const releases: (() => void)[] = [];
function barrier() {
  // Keep waits in their own workerd request context. Resolving a Promise
  // created by the test from the Workflow request can stall later D1 I/O.
  let released = false,
    entered = false;
  const release = () => {
    released = true;
  };
  releases.push(release);
  const reached = (async () => {
    while (!entered && !released) await new Promise((r) => setTimeout(r, 10));
  })();
  return {
    release,
    reached,
    hold: async () => {
      entered = true;
      while (!released) await new Promise((r) => setTimeout(r, 10));
    }
  };
}
async function configure(names: string[]) {
  await configRepo.appendVersion(db, {
    newValue: names.map((name) => ({
      name,
      url: `https://example.test/${name}`,
      tier: "tier1"
    })),
    actor: "Test",
    createdAt: new Date().toISOString()
  });
}
beforeEach(async () => {
  fixture.now = new Date(Date.UTC(2030, 0, ++fixtureSequence)).toISOString();
  fixture.gatewayConstructions = 0;
  fixture.sourceCalls = 0;
  fixture.providerCalls = 0;
  fixture.sourceBarrier = undefined;
  fixture.providerBarrier = undefined;
  await db.prepare("DELETE FROM pipeline_config_versions").run();
  await configure(["material"]);
  await db
    .prepare("UPDATE states SET operational_status='banned' WHERE id='st-nv'")
    .run();
  await db
    .prepare(
      "UPDATE gateway_config SET roles_json=?,default_budget_cents=500 WHERE id='current'"
    )
    .bind(
      JSON.stringify({
        drafter: { provider: "native-fixture", model: "drafter" },
        reviewer: { provider: "native-fixture", model: "reviewer" }
      })
    )
    .run();
});
afterEach(async () => {
  for (const release of releases.splice(0)) release();
  let disposals: PromiseSettledResult<void>[];
  try {
    disposals = await Promise.allSettled(
      handles.splice(0).map(async (handle) => handle.dispose())
    );
  } finally {
    vi.unstubAllGlobals();
  }
  const failures = disposals.filter((result) => result.status === "rejected");
  if (failures.length)
    throw new AggregateError(
      failures.map((result) => result.reason),
      "Native Workflow introspector cleanup failed"
    );
});
async function launch(date = `2026-11-${String(++sequence).padStart(2, "0")}`) {
  const id = runIdFor(date, "manual");
  const instanceId = `daily-${id}`;
  const handle = await introspectWorkflowInstance(native.DAILY_RUN, instanceId);
  handles.push(handle);
  await handle.modify(async (modifier) => modifier.disableRetryDelays());
  const dispatched = startOperatorRun(db, native.DAILY_RUN, {
    origin: "manual",
    scheduledFor: date,
    now: new Date(),
    requestId: crypto.randomUUID()
  });
  const complete = async () => {
    await handle.waitForStatus("complete");
    const result = await dispatched;
    expect("run" in result && result.run.id).toBe(id);
    expect((await admission.get(db, id))?.state).toBe("confirmed");
  };
  return {
    id,
    date,
    handle,
    complete,
    restart: async () => {
      const instance = await native.DAILY_RUN.get(instanceId);
      const before = fixture.gatewayConstructions;
      await instance.restart();
      // This seam is reached inside the real package checkpoint body. A stale
      // pre-restart "complete" status cannot satisfy this observation.
      await vi.waitFor(() =>
        expect(fixture.gatewayConstructions).toBeGreaterThan(before)
      );
      expect(await handle.waitForStepResult({ name: "attach-run" })).toBe(id);
    }
  };
}
async function detail(id: string) {
  const path = `/api/runs/${id}`;
  const response = await handlePublicApi(
    new Request(`https://example.test${path}`),
    env as Env,
    path
  );
  expect(response?.status).toBe(200);
  return RunDetailSchema.parse(await response!.json());
}
async function canonical() {
  return db
    .prepare("SELECT operational_status FROM states WHERE id='st-nv'")
    .first<string>("operational_status");
}
async function packageRows(id: string) {
  const [snapshot, journal] = await db.batch([
    db.prepare("SELECT * FROM run_source_snapshots WHERE run_id=?").bind(id),
    db
      .prepare(
        "SELECT * FROM run_source_packages WHERE run_id=? ORDER BY source_name"
      )
      .bind(id)
  ]);
  return { snapshot: snapshot!.results, journal: journal!.results };
}
async function stopped(id: string) {
  const publicRun = await detail(id);
  expect(publicRun.status).toBe("stopped");
  expect(
    publicRun.evidence.filter((event) => event.event === "run.stopped")
  ).toEqual([
    expect.objectContaining({ payload: { reason: "budget_stopped" } })
  ]);
  expect(publicRun.drafts).toHaveLength(1);
  expect(publicRun.drafts[0]).toMatchObject({
    readiness: "ready",
    outcome: null,
    evalSummary: {
      status: "evals_not_run",
      basis: expect.stringContaining("budget_stopped")
    }
  });
  return publicRun;
}
async function material(id: string) {
  const drafts = await draftsRepo.listByRun(db, id);
  expect(
    drafts,
    "native material must persist a Draft from the forwarded registry"
  ).toHaveLength(1);
  expect(
    drafts[0],
    "native review must persist completed evaluation"
  ).toMatchObject({
    readiness: "ready",
    outcome: null,
    confidence: 99,
    evalSummary: { status: "ok" }
  });
  const publicRun = await detail(id);
  expect(publicRun).toMatchObject({
    status: "awaiting",
    spendCents: 2,
    reservedCents: 0,
    uncertainCents: 0,
    reportedCostCents: 2
  });
  expect(publicRun.drafts).toEqual(drafts);
  expect(publicRun.llmCalls).toHaveLength(2);
  expect(publicRun.evidence.map((e) => e.event)).toEqual(
    expect.arrayContaining([
      "source.fetched",
      "draft.created",
      "draft.evaluated"
    ])
  );
  const accounting = await runsRepo.accountingSnapshot(db, id);
  expect(
    accounting?.accountingOperations?.map((o) => (o as { state: string }).state)
  ).toEqual(["settled", "settled"]);
  expect(await canonical()).toBe("banned");
  return publicRun;
}
it("native material persists evaluated Draft and accounting", async () => {
  const run = await launch();
  await run.complete();
  await material(run.id);
  expect(fixture.sourceCalls).toBe(1);
  expect(fixture.providerCalls).toBe(2);
});
it("empty collection has truthful completion and no paid work", async () => {
  await configure(["empty"]);
  const run = await launch();
  await run.complete();
  expect(await detail(run.id)).toMatchObject({
    status: "empty",
    drafts: [],
    llmCalls: [],
    spendCents: 0
  });
  expect((await detail(run.id)).evidence.map((e) => e.event)).toEqual(
    expect.arrayContaining(["source.fetched", "run.empty"])
  );
  expect(fixture.providerCalls).toBe(0);
});
it("all-source failure is failed, scrubbed and never empty", async () => {
  await configure(["failed"]);
  const run = await launch();
  await run.complete();
  const evidence = await detail(run.id);
  expect(evidence).toMatchObject({
    status: "failed",
    drafts: [],
    llmCalls: []
  });
  expect(
    evidence.evidence.some(
      (e) =>
        e.event === "source.skipped" &&
        (e.payload as { reason?: string }).reason === "unavailable"
    )
  ).toBe(true);
  expect(JSON.stringify(evidence)).not.toContain("secret-fixture");
  expect(fixture.providerCalls).toBe(0);
});
it("partial failure retains material review and failed source evidence", async () => {
  await configure(["material", "failed"]);
  const run = await launch();
  await run.complete();
  const evidence = await material(run.id);
  expect(
    evidence.evidence.some(
      (e) =>
        e.event === "source.skipped" &&
        (e.payload as { failed?: boolean }).failed === true
    )
  ).toBe(true);
});
it("insufficient frozen allowance stops without dispatch or hidden liability", async () => {
  await db
    .prepare(
      "UPDATE gateway_config SET default_budget_cents=0 WHERE id='current'"
    )
    .run();
  const run = await launch();
  await run.complete();
  expect(await stopped(run.id)).toMatchObject({
    status: "stopped",
    budgetCents: 0,
    spendCents: 0,
    reservedCents: 0,
    uncertainCents: 0,
    llmCalls: []
  });
  expect((await detail(run.id)).drafts[0]).toMatchObject({
    readiness: "ready",
    evalSummary: { status: "evals_not_run" }
  });
  expect(fixture.providerCalls).toBe(0);
  expect(await canonical()).toBe("banned");
});
it("native restart preserves Run, package, Draft and paid identities", async () => {
  const run = await launch();
  await run.complete();
  const before = await material(run.id);
  const packaged = await packageRows(run.id);
  expect(packaged.snapshot).toHaveLength(1);
  expect(packaged.journal).toEqual([
    expect.objectContaining({
      run_id: run.id,
      source_name: "material",
      completed: 1
    })
  ]);
  await run.restart();
  await run.complete();
  expect(await detail(run.id)).toEqual(before);
  expect(await packageRows(run.id)).toEqual(packaged);
  expect(fixture.sourceCalls).toBe(1);
  expect(fixture.providerCalls).toBe(2);
  // Native restart does not claim to simulate a checkpoint lost after a commit;
  // dailyRunRecovery.test.ts retains those precise synthetic schedules.
});
it("held native collection excludes competing manual, catch-up and scheduled origins", async () => {
  const held = barrier();
  fixture.sourceBarrier = held.hold;
  const run = await launch("2026-12-04");
  const finished = run.complete();
  await held.reached;
  const attempts = await Promise.all([
    ...(["manual", "catch-up"] as const).map((origin) =>
      startOperatorRun(db, native.DAILY_RUN, {
        origin,
        scheduledFor: run.date,
        requestId: crypto.randomUUID(),
        now: new Date()
      })
    ),
    kickDailyRun(native.DAILY_RUN, new Date("2026-12-04T17:00:00Z"), db)
  ]);
  expect(attempts.map((a) => a?.status)).toEqual([
    "conflict",
    "conflict",
    "conflict"
  ]);
  expect((await detail(run.id)).id).toBe(run.id);
  expect(fixture.sourceCalls).toBe(1);
  held.release();
  await finished;
  await material(run.id);
});
it("authenticated gate refuses held native review, then decides once and seals", async () => {
  const held = barrier();
  fixture.providerBarrier = async (model) => {
    if (model === "reviewer") await held.hold();
  };
  const run = await launch();
  await held.reached;
  const [draft] = await draftsRepo.listByRun(db, run.id);
  const pair = await generateKeyPair("RS256", { extractable: true });
  const jwk = await exportJWK(pair.publicKey);
  jwk.kid = "native-key";
  vi.stubGlobal("fetch", async () => Response.json({ keys: [jwk] }));
  const team = "https://native.cloudflareaccess.com",
    aud = "native-aud",
    email = "native@example.test";
  const token = await new SignJWT({ email })
    .setProtectedHeader({ alg: "RS256", kid: "native-key" })
    .setIssuer(team)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(pair.privateKey);
  const approve = () =>
    worker.fetch(
      new Request(
        `https://example.test/api/admin/drafts/${encodeURIComponent(draft!.id)}/decision`,
        {
          method: "POST",
          headers: {
            "cf-access-jwt-assertion": token,
            "content-type": "application/json"
          },
          body: JSON.stringify({ action: "approve" })
        }
      ),
      {
        ...env,
        ACCESS_DEV_BYPASS: undefined,
        TEAM_DOMAIN: team,
        POLICY_AUD: aud,
        OPERATOR_EMAIL: email,
        OPERATOR_DISPLAY_NAME: "Native Operator"
      } as Env
    );
  const premature = await approve();
  expect(premature.status).toBe(409);
  expect(await premature.json()).toMatchObject({ code: "draft_not_ready" });
  expect(await canonical()).toBe("banned");
  held.release();
  await run.complete();
  await material(run.id);
  const approved = await approve();
  expect(approved.status).toBe(200);
  expect(await approved.json()).toMatchObject({
    outcome: "approved",
    decidedBy: "Native Operator"
  });
  const repeated = await approve();
  expect(repeated.status).toBe(409);
  expect(await repeated.json()).toMatchObject({
    code: "conflict",
    message: "Draft already decided."
  });
  const sealed = await detail(run.id);
  expect(sealed).toMatchObject({
    status: "published",
    drafts: [{ decidedBy: "Native Operator", outcome: "approved" }]
  });
  expect(sealed.evidence).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        event: "gate.decided",
        payload: expect.objectContaining({ decidedBy: "Native Operator" })
      })
    ])
  );
  expect(await canonical()).toBe("restricted");
  await run.restart();
  await run.complete();
  expect(await detail(run.id)).toEqual(sealed);
  expect(fixture.providerCalls).toBe(2);
});
it("two native workloads cannot overspend a shared bounded period", async () => {
  await db
    .prepare("INSERT INTO llm_periods VALUES (?,?,?,?,?)")
    .bind(
      "native-cap",
      fixture.now,
      new Date(Date.parse(fixture.now) + 86400000).toISOString(),
      50,
      "deterministic local test"
    )
    .run();
  const held = barrier();
  fixture.providerBarrier = held.hold;
  const first = await launch();
  await held.reached;
  const second = await launch();
  await second.complete();
  expect(await stopped(second.id)).toMatchObject({
    status: "stopped",
    spendCents: 0,
    llmCalls: []
  });
  expect(fixture.providerCalls).toBe(1);
  expect((await detail(first.id)).reservedCents).toBe(50);
  held.release();
  await first.complete();
  expect(await stopped(first.id)).toMatchObject({
    status: "stopped",
    spendCents: 1,
    reservedCents: 0,
    uncertainCents: 0
  });
  expect(fixture.providerCalls).toBe(1);
  expect(
    await db
      .prepare(
        "SELECT total_cents FROM llm_period_accounting WHERE period_id='native-cap'"
      )
      .first("total_cents")
  ).toBe(1);
});
