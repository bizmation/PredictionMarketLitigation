import * as admission from "../../shared/db/repos/runAdmissionRepo";
import { startOperatorRun } from "./dailyRun";
import { runConnector } from "../connectors/connector";
import { decide } from "../gate/approval";
import { PollSourcesSchema } from "../../shared/schemas/pipelineConfig";
import { env, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../../shared/db/client";
import * as draftsRepo from "../../shared/db/repos/draftsRepo";
import * as evidenceRepo from "../../shared/db/repos/evidenceRepo";
import * as runsRepo from "../../shared/db/repos/runsRepo";
import * as packagesRepo from "../../shared/db/repos/runPackagesRepo";
import * as configRepo from "../../shared/db/repos/pipelineConfigRepo";
import * as modeRepo from "../../shared/db/repos/modeRepo";
import { fixtureCostPolicy } from "../../test/costPolicyFixture";
import { append } from "../projector/evidence";
import { type GatewayDeps } from "../ai/gateway";
import {
  SourceUnavailableError,
  type SourceCheck
} from "../connectors/connector";
import { COURTLISTENER_MAX_ATTEMPTS } from "../connectors/courtListener";
import { DailyRunWorkflow, type DailyRunParams } from "./dailyRun";
import {
  ensureRun,
  finishAwaiting,
  finishEmpty,
  runIdFor
} from "./dailyRunSteps";

const db = (env as Env).DB;
const source = {
  name: "original",
  url: "https://example.test/original",
  tier: "tier1" as const
};
const entity = {
  type: "states",
  id: "st-nv",
  body: "Nevada restricted.",
  diff: { operationalStatus: { from: "banned", to: "restricted" } }
};
let sequence = 0;
let date: string;
let runId: string;

/** Executes the production entrypoint with deterministic local checkpoints.
 * A lost checkpoint throws AFTER the body commits D1, then re-runs that body.
 * This deliberately does not pretend to test the hosted Workflow service. */
class Checkpoints {
  values = new Map<string, unknown>();
  lose: string | undefined;
  after?: (name: string) => Promise<void>;
  step = {
    do: async (name: string, body: () => Promise<unknown>) => {
      if (this.values.has(name)) return this.values.get(name);
      const value = await body();
      await this.after?.(name);
      if (this.lose === name) {
        this.lose = undefined;
        throw new Error("checkpoint_lost");
      }
      this.values.set(name, value);
      return value;
    }
  } as unknown as WorkflowStep;
}

/** Faults only storage calls: connectors, orchestration, SQL and gate remain real. */
function interruptDb(
  onCall: (
    sql: string,
    phase: "before" | "after",
    values: unknown[]
  ) => void | Promise<void>
): Db {
  const originals = new WeakMap<D1PreparedStatement, D1PreparedStatement>();
  const queries = new WeakMap<D1PreparedStatement, string>();
  const bindings = new WeakMap<D1PreparedStatement, unknown[]>();
  function wrap(
    statement: D1PreparedStatement,
    sql: string,
    values: unknown[] = []
  ): D1PreparedStatement {
    const proxy = new Proxy(statement, {
      get(target, key) {
        if (key === "bind")
          return (...values: unknown[]) =>
            wrap(target.bind(...values), sql, values);
        if (key === "run" || key === "all" || key === "first")
          return async (...args: unknown[]) => {
            await onCall(sql, "before", values);
            const result = await (
              target[key] as (...args: unknown[]) => Promise<unknown>
            ).apply(target, args);
            await onCall(sql, "after", values);
            return result;
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    originals.set(proxy, statement);
    queries.set(proxy, sql);
    bindings.set(proxy, values);
    return proxy;
  }
  return new Proxy(db, {
    get(target, key) {
      if (key === "prepare")
        return (sql: string) => wrap(target.prepare(sql), sql);
      if (key === "batch")
        return async (statements: D1PreparedStatement[]) => {
          const sql = statements
            .map((statement) => queries.get(statement) ?? "")
            .join("\n");
          const values = statements.flatMap(
            (statement) => bindings.get(statement) ?? []
          );
          await onCall(sql, "before", values);
          const result = await target.batch(
            statements.map((statement) => originals.get(statement) ?? statement)
          );
          await onCall(sql, "after", values);
          return result;
        };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

function harness(
  checks: Record<string, SourceCheck> | undefined,
  database: Db = db
) {
  const provider = {
    name: "replay-fake",
    complete: vi.fn(async ({ model }: { model: string }) => ({
      text: JSON.stringify(
        model === "drafter"
          ? { body: entity.body, diff: entity.diff }
          : {
              confidence: 99,
              citationCompleteness: 100,
              notes: "Primary source supports the change.",
              disagrees: false,
              disagreement: ""
            }
      ),
      inputTokens: 1,
      outputTokens: 1,
      reportedCostUsd: 0.01
    }))
  };
  class LocalWorkflow extends DailyRunWorkflow {
    protected override sourceChecks(database: Db) {
      return checks ?? super.sourceChecks(database);
    }
    protected override gatewayDeps(): GatewayDeps {
      return { db: database, provider, costPolicy: fixtureCostPolicy };
    }
  }
  // Execute the real inherited run method without a hosted native context.
  const workflow = Object.create(LocalWorkflow.prototype) as LocalWorkflow;
  Object.defineProperty(workflow, "env", {
    value: {
      ...env,
      DB: database,
      COURTLISTENER_API_TOKEN: "local-test-token",
      courtListenerWait: async () => {}
    }
  });
  const checkpoints = new Checkpoints();
  return {
    provider,
    checkpoints,
    run: (
      params: DailyRunParams = { origin: "scheduled", scheduledFor: date }
    ) =>
      workflow.run(
        { payload: params } as WorkflowEvent<DailyRunParams>,
        checkpoints.step
      )
  };
}

async function configure(sources = [source]) {
  return configRepo.appendVersion(db, {
    newValue: sources,
    actor: "Test operator",
    createdAt: new Date().toISOString()
  });
}
async function state() {
  return {
    run: await runsRepo.getRunById(db, runId),
    drafts: await draftsRepo.listByRun(db, runId),
    evidence: await evidenceRepo.listByRun(db, runId),
    accounting: await runsRepo.accountingSnapshot(db, runId)
  };
}

beforeEach(async () => {
  date = new Date(Date.UTC(2026, 7, ++sequence)).toISOString().slice(0, 10);
  runId = runIdFor(date, "scheduled");
  await db
    .prepare(
      "UPDATE states SET operational_status = 'banned' WHERE id = 'st-nv'"
    )
    .run();
  await db.prepare("DELETE FROM pipeline_config_versions").run();
  await configure();
  await db
    .prepare(`INSERT INTO gateway_config (id, version, roles_json, default_budget_cents, updated_at)
    VALUES ('current', 1, ?, 500, ?) ON CONFLICT(id) DO UPDATE SET roles_json=excluded.roles_json,
    default_budget_cents=500, updated_at=excluded.updated_at`)
    .bind(
      JSON.stringify({
        drafter: { provider: "replay-fake", model: "drafter" },
        reviewer: { provider: "replay-fake", model: "reviewer" }
      }),
      new Date().toISOString()
    )
    .run();
  await modeRepo.set(db, {
    mode: "hitl",
    actor: "Test operator",
    now: new Date().toISOString()
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("DailyRunWorkflow durable replay (3.32)", () => {
  it("recovers its durable package after checkpoint loss and performs paid review only once", async () => {
    const check = vi.fn(() => [{ entities: [entity] }]);
    const h = harness({ original: check });
    h.checkpoints.lose = "run-daily-step";
    await expect(h.run()).rejects.toThrow("checkpoint_lost");
    const original = (await draftsRepo.listByRun(db, runId))[0]!;
    expect(h.provider.complete).not.toHaveBeenCalled();
    h.checkpoints.lose = "draft-and-review";
    await expect(h.run()).rejects.toThrow("checkpoint_lost");
    const completed = await state();
    expect(completed.run?.status).toBe("awaiting");
    expect(completed.run?.spendCents).toBe(2);
    expect(completed.drafts[0]?.id).toBe(original.id);
    expect(completed.drafts[0]?.readiness).toBe("ready");
    expect(completed.accounting?.accountingOperations).toHaveLength(2);
    expect(completed.accounting?.llmCalls).toHaveLength(2);
    await h.run();
    h.checkpoints.values.delete("run-daily-step");
    h.checkpoints.values.delete("draft-and-review");
    await h.run();
    expect(await state()).toEqual(completed);
    expect(check).toHaveBeenCalledTimes(1);
    expect(h.provider.complete).toHaveBeenCalledTimes(2);
    expect(
      completed.evidence.some((event) => event.event === "run.empty")
    ).toBe(false);
  });

  it("drains every original entity and repairs creation receipts after insert interruption", async () => {
    let interrupted = false;
    const database = interruptDb((sql, phase) => {
      if (
        !interrupted &&
        phase === "after" &&
        sql.includes("INSERT OR IGNORE INTO drafts")
      ) {
        interrupted = true;
        throw new Error("insert_interrupted");
      }
    });
    const check = vi.fn(() => [
      { entities: [entity, { ...entity, id: "st-ca" }] }
    ]);
    const h = harness({ original: check }, database);
    await expect(h.run()).rejects.toThrow("insert_interrupted");
    expect((await state()).run?.status).toBe("running");
    expect((await state()).drafts).toHaveLength(1);
    expect(
      (await state()).evidence.filter(
        (event) => event.event === "draft.created"
      )
    ).toHaveLength(0);
    expect(
      (await state()).evidence.filter(
        (event) => event.event === "source.fetched"
      )
    ).toHaveLength(1);
    await h.run();
    const recovered = await state();
    expect(recovered.run?.status).toBe("awaiting");
    expect(recovered.drafts).toHaveLength(2);
    expect(
      recovered.evidence.filter((event) => event.event === "draft.created")
    ).toHaveLength(2);
    expect(check).toHaveBeenCalledTimes(1);
    expect(h.provider.complete).toHaveBeenCalledTimes(4);
  });

  it("recovers paid results when evaluation persistence is interrupted before its commit", async () => {
    let interrupted = false;
    const database = interruptDb((sql, phase) => {
      if (
        !interrupted &&
        phase === "before" &&
        sql.includes("UPDATE drafts") &&
        sql.includes("eval_summary_json")
      ) {
        interrupted = true;
        throw new Error("review_interrupted");
      }
    });
    const h = harness({ original: () => [{ entities: [entity] }] }, database);
    await expect(h.run()).rejects.toThrow("review_interrupted");
    expect(h.provider.complete).toHaveBeenCalledTimes(2);
    expect((await state()).drafts[0]?.evalSummary).toBeNull();
    await h.run();
    expect((await state()).run?.status).toBe("awaiting");
    expect((await state()).run?.spendCents).toBe(2);
    expect(h.provider.complete).toHaveBeenCalledTimes(2);
  });

  it("preserves YOLO decisions, accounting and actual publication after lost review/package checkpoints", async () => {
    await modeRepo.set(db, {
      mode: "yolo",
      actor: "Test operator",
      now: new Date().toISOString()
    });
    const h = harness({ original: () => [{ entities: [entity] }] });
    h.checkpoints.lose = "draft-and-review";
    await expect(h.run()).rejects.toThrow("checkpoint_lost");
    const published = await state();
    expect(published.run?.status).toBe("published");
    expect(published.drafts[0]?.outcome).toBe("approved");
    expect(
      await db
        .prepare("SELECT operational_status FROM states WHERE id='st-nv'")
        .first()
    ).toEqual({ operational_status: "restricted" });
    const publications = await db
      .prepare(
        "SELECT * FROM states WHERE id = 'st-nv' AND provenance_kind = 'agent' AND published_at IS NOT NULL AND ? IS NOT NULL"
      )
      .bind(runId)
      .all();
    expect(publications.results).toHaveLength(1);
    await h.run();
    h.checkpoints.values.clear();
    await h.run();
    expect(await state()).toEqual(published);
    expect(
      (
        await db
          .prepare(
            "SELECT * FROM states WHERE id = 'st-nv' AND provenance_kind = 'agent' AND published_at IS NOT NULL AND ? IS NOT NULL"
          )
          .bind(runId)
          .all()
      ).results
    ).toEqual(publications.results);
    expect(h.provider.complete).toHaveBeenCalledTimes(2);
  });

  it("resumes YOLO publication if interrupted just after the awaiting transition", async () => {
    await modeRepo.set(db, {
      mode: "yolo",
      actor: "Test operator",
      now: new Date().toISOString()
    });
    let interrupted = false;
    const h = harness(
      { original: () => [{ entities: [entity] }] },
      interruptDb((sql, phase) => {
        if (
          !interrupted &&
          phase === "after" &&
          sql.includes("UPDATE runs SET status = ?")
        ) {
          interrupted = true;
          throw new Error("awaiting_interrupted");
        }
      })
    );
    await expect(h.run()).rejects.toThrow("awaiting_interrupted");
    expect((await state()).run?.status).toBe("awaiting");
    h.checkpoints.values.delete("run-daily-step");
    await h.run();
    expect((await state()).run?.status).toBe("published");
    expect(h.provider.complete).toHaveBeenCalledTimes(2);
  });

  it.each(["generic", "exception", "unavailable"])(
    "retains %s sibling failure with material on replay",
    async (kind) => {
      await configure([source, { ...source, name: "failure" }]);
      const failed = vi.fn(() => {
        if (kind === "exception") throw new Error("connector exception");
        if (kind === "unavailable")
          throw new SourceUnavailableError("down", { docketIds: [123] });
        return [
          {
            entities: [],
            failed: true,
            fetched: { docketIds: [123], errors: ["fetch failed"] }
          }
        ];
      });
      const h = harness({
        original: () => [{ entities: [entity] }],
        failure: failed
      });
      h.checkpoints.lose = "run-daily-step";
      await expect(h.run()).rejects.toThrow("checkpoint_lost");
      const failureEvidence = (await state()).evidence.filter(
        (event) => (event.payload as { source?: string })?.source === "failure"
      );
      await h.run();
      const recovered = await state();
      expect(recovered.run?.status).toBe("awaiting");
      expect(
        recovered.evidence.filter(
          (event) =>
            (event.payload as { source?: string })?.source === "failure"
        )
      ).toEqual(failureEvidence);
      expect(
        failureEvidence.some(
          (event) => (event.payload as { failed?: boolean }).failed
        )
      ).toBe(true);
      expect(
        recovered.evidence.some((event) => event.event === "run.empty")
      ).toBe(false);
      expect(failed).toHaveBeenCalledTimes(1);
    }
  );

  it.each(["generic", "exception"])(
    "keeps zero-material %s failure failed after loss",
    async (kind) => {
      const check = vi.fn(() => {
        if (kind === "exception") throw new Error("down");
        return [{ entities: [], failed: true, fetched: { errors: ["down"] } }];
      });
      const h = harness({ original: check });
      h.checkpoints.lose = "run-daily-step";
      await expect(h.run()).rejects.toThrow("checkpoint_lost");
      await h.run();
      expect((await state()).run?.status).toBe("failed");
      expect(
        (await state()).evidence.some((event) => event.event === "run.empty")
      ).toBe(false);
      expect(check).toHaveBeenCalledTimes(1);
      expect(h.provider.complete).not.toHaveBeenCalled();
    }
  );

  it("retains uncertain accounting and never blindly repeats the paid effect", async () => {
    const h = harness({ original: () => [{ entities: [entity] }] });
    h.provider.complete.mockResolvedValueOnce({
      text: "{}",
      inputTokens: 1,
      outputTokens: 1,
      reportedCostUsd: 1
    });
    await expect(h.run()).rejects.toMatchObject({
      code: "accounting_uncertain"
    });
    const uncertain = await state();
    expect(uncertain.run?.status).toBe("running");
    expect(uncertain.run?.uncertainCents).toBeGreaterThan(0);
    expect(uncertain.drafts[0]?.evalSummary).toBeNull();
    await expect(h.run()).rejects.toMatchObject({
      code: "accounting_uncertain"
    });
    expect(h.provider.complete).toHaveBeenCalledTimes(1);
    expect(await state()).toEqual(uncertain);
  });

  it("records true empty once without paid work, including nonfailure skips", async () => {
    await configure([source, { ...source, name: "not-wired" }]);
    const h = harness({ original: () => [] });
    h.checkpoints.lose = "run-daily-step";
    await expect(h.run()).rejects.toThrow("checkpoint_lost");
    await h.run();
    expect((await state()).run?.status).toBe("empty");
    expect(
      (await state()).evidence.filter((event) => event.event === "run.empty")
    ).toHaveLength(1);
    expect(h.provider.complete).not.toHaveBeenCalled();
  });

  it.each([0, 1])(
    "pins actual inputs at version %s across attach, package and replay edits",
    async (version) => {
      if (version === 0)
        await db.prepare("DELETE FROM pipeline_config_versions").run();
      const before = await configRepo.getEffectivePollSources(db);
      const checks = Object.fromEntries(
        before.sources.map((s) => [
          s.name,
          vi.fn(() => [{ entities: [entity] }])
        ])
      );
      const h = harness(checks);
      h.checkpoints.lose = "attach-run";
      await expect(h.run()).rejects.toThrow("checkpoint_lost");
      await configure([
        { name: "changed", url: "https://example.test/changed", tier: "tier1" }
      ]);
      h.checkpoints.lose = "run-daily-step";
      await expect(h.run()).rejects.toThrow("checkpoint_lost");
      const latestSources = [
        {
          name: "newest",
          url: "https://example.test/newest",
          tier: "tier2" as const
        }
      ];
      await configRepo.appendVersion(db, {
        newValue: latestSources,
        actor: "Test",
        createdAt: new Date().toISOString()
      });
      await h.run();
      expect(await packagesRepo.requireSnapshot(db, runId)).toEqual(before);
      for (const s of before.sources) {
        expect(checks[s.name]).toHaveBeenCalledExactlyOnceWith(
          s,
          expect.objectContaining({
            beforeRequest: expect.any(Function),
            signal: expect.any(AbortSignal)
          })
        );
        expect(
          (await state()).evidence.find(
            (event) =>
              event.event === "source.fetched" &&
              (event.payload as { source: string }).source === s.name
          )?.payload
        ).toMatchObject({
          source: s.name,
          url: s.url,
          tier: s.tier,
          pollSourcesVersion: before.version
        });
      }
      const nextDate = new Date(
        Date.parse(`${date}T00:00:00Z`) + 366 * 86400000
      )
        .toISOString()
        .slice(0, 10);
      const next = await ensureRun(db, "manual", nextDate);
      const latest = await configRepo.getEffectivePollSources(db);
      expect(await packagesRepo.requireSnapshot(db, next)).toEqual(latest);
      const newest = vi.fn(() => [{ entities: [entity] }]);
      await harness({ newest }).run({
        origin: "manual",
        scheduledFor: nextDate,
        runId: next
      });
      expect(newest).toHaveBeenCalledExactlyOnceWith(
        latest.sources[0],
        expect.objectContaining({
          beforeRequest: expect.any(Function),
          signal: expect.any(AbortSignal)
        })
      );
      expect(
        (await evidenceRepo.listByRun(db, next)).find(
          (event) => event.event === "source.fetched"
        )?.payload
      ).toMatchObject({
        source: "newest",
        url: latest.sources[0]!.url,
        tier: "tier2",
        pollSourcesVersion: latest.version
      });
    }
  );

  it("isolates same-date same-origin Runs and refuses missing or corrupt attach identities", async () => {
    const other = runId.replace("0000", "abcd");
    await runsRepo.insertRun(db, {
      id: other,
      origin: "scheduled",
      mode: "hitl",
      status: "empty",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      spendCents: 0,
      spendCurrency: "USD",
      budgetCents: 500,
      scheduledFor: date
    });
    await draftsRepo.insertDraft(db, {
      id: "other-draft",
      runId: other,
      targetEntityType: entity.type,
      targetEntityId: entity.id,
      diff: entity.diff,
      body: entity.body,
      tier2Only: false,
      confidence: null,
      evalSummary: null,
      createdAt: new Date().toISOString()
    });
    // Explicitly insert the current operator-attached identity; never use date lookup.
    await runsRepo.insertRun(db, {
      id: runId,
      origin: "scheduled",
      mode: "hitl",
      status: "running",
      startedAt: new Date().toISOString(),
      completedAt: null,
      spendCents: 0,
      spendCurrency: "USD",
      budgetCents: 500,
      scheduledFor: date
    });
    const h = harness({ original: () => [] });
    await h.run({ origin: "scheduled", scheduledFor: date, runId });
    expect((await state()).run?.status).toBe("empty");
    expect(
      (await draftsRepo.getById(db, "other-draft"))?.evalSummary
    ).toBeNull();
    const bad = harness({});
    bad.checkpoints.values.set("attach-run", { id: other });
    await expect(bad.run()).rejects.toThrow("invalid_attached_run_identity");
    bad.checkpoints.values.set("attach-run", runId.replace("0000", "dead"));
    await expect(bad.run()).rejects.toThrow("attached_run_identity_mismatch");
    bad.checkpoints.values.clear();
    await expect(
      bad.run({
        origin: "scheduled",
        scheduledFor: date,
        runId: runId.replace("0000", "dead")
      })
    ).rejects.toThrow("attached_run_missing");
    expect(bad.provider.complete).not.toHaveBeenCalled();
  });

  it("never appends a completion receipt after a declined transition", async () => {
    await ensureRun(db, "scheduled", date);
    await finishAwaiting(db, runId, 1);
    await finishEmpty(db, runId);
    expect(
      (await state()).evidence.some((event) => event.event === "run.empty")
    ).toBe(false);
    await db
      .prepare("UPDATE runs SET status = 'published' WHERE id = ?")
      .bind(runId)
      .run();
    const before = (await state()).evidence;
    await finishAwaiting(db, runId, 3);
    expect((await state()).evidence).toEqual(before);
  });
});

describe("source snapshot validation and legacy refusal", () => {
  it("rereads the winning snapshot after first-write races", async () => {
    expect(
      await Promise.all([
        ensureRun(db, "scheduled", date),
        ensureRun(db, "scheduled", date)
      ])
    ).toEqual([runId, runId]);
    expect(
      (await state()).evidence.filter((event) => event.event === "run.started")
    ).toHaveLength(1);
    const winner = await packagesRepo.requireSnapshot(db, runId);
    await Promise.all([
      packagesRepo.snapshotStmt(db, runId, { version: 50, sources: [] }).run(),
      packagesRepo
        .snapshotStmt(db, runId, {
          version: 51,
          sources: [{ ...source, name: "loser" }]
        })
        .run()
    ]);
    expect(await packagesRepo.attachSnapshot(db, runId)).toEqual(winner);
    await expect(
      db
        .prepare(
          "UPDATE run_source_snapshots SET version = 50 WHERE run_id = ?"
        )
        .bind(runId)
        .run()
    ).rejects.toThrow("immutable");
  });

  it.each([0, 1])(
    "refuses legacy source work even with recorded version %s",
    async (version) => {
      await ensureRun(db, "scheduled", date);
      await db
        .prepare("DELETE FROM run_source_snapshots WHERE run_id = ?")
        .bind(runId)
        .run();
      await db
        .prepare(
          "UPDATE evidence_events SET payload_json = ? WHERE run_id = ? AND event = 'run.started'"
        )
        .bind(JSON.stringify({ pollSourcesVersion: version }), runId)
        .run();
      await append(db, {
        id: `legacy-fetched-${runId}`,
        runId,
        event: "source.fetched",
        payload: { source: source.name },
        createdAt: new Date().toISOString()
      });
      await expect(ensureRun(db, "scheduled", date)).rejects.toThrow(
        "historical_source_configuration_unprovable"
      );
      expect(await packagesRepo.readSnapshot(db, runId)).toBeNull();
    }
  );

  it("recovers immutable nonzero historical intent only before any source work", async () => {
    await ensureRun(db, "scheduled", date);
    const original = await packagesRepo.requireSnapshot(db, runId);
    await db
      .prepare("DELETE FROM run_source_snapshots WHERE run_id = ?")
      .bind(runId)
      .run();
    await configure([{ ...source, name: "newer" }]);
    await ensureRun(db, "scheduled", date);
    expect(await packagesRepo.requireSnapshot(db, runId)).toEqual(original);
  });

  it("refuses version zero legacy intent and invalid durable snapshots", async () => {
    await db.prepare("DELETE FROM pipeline_config_versions").run();
    await ensureRun(db, "scheduled", date);
    await db
      .prepare("DELETE FROM run_source_snapshots WHERE run_id = ?")
      .bind(runId)
      .run();
    await expect(ensureRun(db, "scheduled", date)).rejects.toThrow(
      "historical_source_configuration_unprovable"
    );
    await db
      .prepare("INSERT INTO run_source_snapshots VALUES (?, 0, ?)")
      .bind(runId, '[{"name":"invalid"}]')
      .run();
    await expect(ensureRun(db, "scheduled", date)).rejects.toThrow();
    expect((await state()).run?.status).toBe("running");
  });
});

function courtListenerHttp() {
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    expect(url.origin).toBe("https://www.courtlistener.com");
    return Response.json({
      results:
        url.searchParams.get("docket") === "73133459"
          ? [
              {
                id: 930000 + sequence,
                entry_number: 120,
                date_filed: "2026-10-01",
                description: "MINUTE ENTRY: status conference held."
              }
            ]
          : []
    });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
async function configureCourtListener() {
  await configure([
    {
      name: "CourtListener",
      url: "https://www.courtlistener.com/",
      tier: "tier1"
    }
  ]);
}

describe("3.32 review regressions", () => {
  it.each([
    "FROM sources s",
    "SELECT MAX(occurred_at)",
    "SELECT target_entity_id AS id FROM drafts",
    "FROM case_entities ce",
    "SELECT published_at FROM sources"
  ])(
    "retries actual CourtListener after internal D1 read interruption: %s",
    async (query) => {
      await configureCourtListener();
      courtListenerHttp();
      let interrupted = false;
      const h = harness(
        undefined,
        interruptDb((sql, phase) => {
          if (!interrupted && phase === "before" && sql.includes(query)) {
            interrupted = true;
            throw new Error("D1 read unavailable");
          }
        })
      );
      await expect(h.run()).rejects.toThrow("source_persistence_interrupted");
      expect(interrupted).toBe(true);
      expect((await state()).run?.status).toBe("running");
      expect((await state()).evidence.map((event) => event.event)).toEqual([
        "run.dispatch",
        "run.started"
      ]);
      expect(
        (
          await db
            .prepare("SELECT * FROM run_source_packages WHERE run_id = ?")
            .bind(runId)
            .all()
        ).results
      ).toHaveLength(0);
      await h.run();
      expect((await state()).run?.status).toBe("awaiting");
      expect((await state()).drafts).toHaveLength(1);
      expect((await state()).drafts[0]?.targetEntityType).toBe("docket_events");
      expect(
        (await state()).evidence.some((event) => event.event === "run.failed")
      ).toBe(false);
    }
  );

  it("uses real CourtListener global dedup while recovering only its original Run's Draft", async () => {
    await configureCourtListener();
    const fetcher = courtListenerHttp();
    const h = harness(undefined);
    h.checkpoints.lose = "run-daily-step";
    await expect(h.run()).rejects.toThrow("checkpoint_lost");
    const originalId = (await state()).drafts[0]!.id;
    const callsAtCheckpoint = fetcher.mock.calls.length;
    await h.run();
    expect(fetcher).toHaveBeenCalledTimes(callsAtCheckpoint);
    expect((await state()).drafts.map((draft) => draft.id)).toEqual([
      originalId
    ]);
    expect((await state()).run?.status).toBe("awaiting");
    const original = await state();
    const other = harness(undefined);
    const otherDate = new Date(Date.parse(`${date}T00:00:00Z`) + 366 * 86400000)
      .toISOString()
      .slice(0, 10);
    await other.run({ origin: "manual", scheduledFor: otherDate });
    const otherId = runIdFor(otherDate, "manual");
    expect((await runsRepo.getRunById(db, otherId))?.status).toBe("empty");
    expect(await draftsRepo.listByRun(db, otherId)).toEqual([]);
    expect(other.provider.complete).not.toHaveBeenCalled();
    expect(await state()).toEqual(original);
    expect(fetcher.mock.calls.length).toBeGreaterThan(callsAtCheckpoint);
  });

  it("recovers from one CourtListener 429 before review and pays for the Draft once", async () => {
    await configureCourtListener();
    let hits = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const docket = new URL(String(input)).searchParams.get("docket");
        if (hits++ === 0) {
          return new Response("Rate limit exceeded: 5/min.", {
            status: 429,
            headers: { "retry-after": "45" }
          });
        }
        return Response.json({
          results:
            docket === "73133459"
              ? [
                  {
                    id: 940000 + sequence,
                    entry_number: 121,
                    date_filed: "2026-10-02",
                    description: "ORDER granting the unopposed motion."
                  }
                ]
              : []
        });
      })
    );
    const h = harness(undefined);
    await h.run();
    expect((await state()).drafts).toHaveLength(1);
    expect((await state()).run?.status).toBe("awaiting");
    expect(h.provider.complete).toHaveBeenCalledTimes(2);
  });

  it("fails a zero-draft Run when CourtListener 429 retries are exhausted", async () => {
    await configureCourtListener();
    const token = "local-test-token";
    const fetcher = vi.fn(
      async () =>
        new Response(`Rate limit exceeded: 5/min. ${token}`, { status: 429 })
    );
    vi.stubGlobal("fetch", fetcher);
    const h = harness(undefined);
    await h.run();
    expect((await state()).drafts).toHaveLength(0);
    expect((await state()).run?.status).toBe("failed");
    expect(h.provider.complete).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(COURTLISTENER_MAX_ATTEMPTS);
    const skipped = (await state()).evidence.find(
      (event) => event.event === "source.skipped"
    );
    expect(skipped?.payload).toMatchObject({
      reason: "http_429",
      status: 429,
      attempts: COURTLISTENER_MAX_ATTEMPTS,
      detail: "Rate limit exceeded: 5/min. [redacted]"
    });
    expect(JSON.stringify((await state()).evidence)).not.toContain(token);
  });

  it("rejects duplicate names at shared validation and before configuration history writes", async () => {
    const duplicated = [
      source,
      { ...source, url: "https://example.test/other", tier: "tier2" as const }
    ];
    const before = await configRepo.listHistory(db);
    expect(PollSourcesSchema.safeParse(duplicated).success).toBe(false);
    await expect(
      configRepo.appendVersion(db, {
        newValue: duplicated,
        actor: "Test",
        createdAt: new Date().toISOString()
      })
    ).rejects.toThrow("Source names must be unique");
    expect(await configRepo.listHistory(db)).toEqual(before);
    expect(await configRepo.getEffectivePollSources(db)).toEqual({
      sources: [source],
      version: 1
    });
  });

  it.each(["readiness", "later-readiness", "guardrails", "later-guardrails"])(
    "recovers multiple stopped Drafts after interruption before %s persistence",
    async (boundary) => {
      await db
        .prepare(
          "UPDATE gateway_config SET default_budget_cents = 0 WHERE id = 'current'"
        )
        .run();
      let blocking = true;
      let interrupted = false;
      const h = harness(
        {
          original: () => [{ entities: [entity, { ...entity, id: "st-ca" }] }]
        },
        interruptDb((sql, phase, values) => {
          if (
            blocking &&
            phase === "before" &&
            (boundary.includes("readiness")
              ? sql.includes("UPDATE drafts") &&
                sql.includes("eval_summary_json")
              : values.includes("guardrails.passed")) &&
            (!boundary.startsWith("later-") ||
              values.some(
                (value) =>
                  typeof value === "string" && value.endsWith(":states:st-nv")
              ))
          ) {
            interrupted = true;
            throw new Error("stopped_persistence_interrupted");
          }
        })
      );
      await expect(h.run()).rejects.toThrow();
      expect(interrupted).toBe(true);
      const stopped = await state();
      expect(stopped.run?.status).toBe("stopped");
      expect(stopped.drafts).toHaveLength(2);
      expect(
        stopped.drafts.some((draft) => draft.readiness === "unavailable")
      ).toBe(true);
      expect(h.provider.complete).not.toHaveBeenCalled();
      let sealed;
      if (boundary === "later-guardrails") {
        const ready = stopped.drafts.find(
          (draft) => draft.readiness === "ready"
        )!;
        expect(
          await decide(db, {
            draftId: ready.id,
            action: "reject",
            operator: { displayName: "Test operator" },
            now: new Date().toISOString(),
            rejectReason: "Keep existing record",
            rejectReasonPrivate: null
          })
        ).toMatchObject({ status: "decided" });
        sealed = await draftsRepo.getById(db, ready.id);
      }
      blocking = false;
      // Recover both with and without the packaging checkpoint.
      if (boundary === "readiness")
        h.checkpoints.values.delete("run-daily-step");
      await h.run();
      const recovered = await state();
      expect(recovered.run?.status).toBe("stopped");
      if (sealed)
        expect(await draftsRepo.getById(db, sealed.id)).toEqual(sealed);
      expect(
        recovered.drafts.every(
          (draft) =>
            draft.evalSummary?.status === "evals_not_run" &&
            draft.readiness === "ready"
        )
      ).toBe(true);
      expect(
        recovered.evidence.filter((event) => event.event === "draft.evaluated")
      ).toHaveLength(2);
      expect(
        recovered.evidence.filter(
          (event) => event.event === "guardrails.passed"
        )
      ).toHaveLength(2);
      expect(
        recovered.evidence.some(
          (event) =>
            event.event === "run.empty" ||
            event.event === "gate.awaiting_approval"
        )
      ).toBe(false);
      expect(h.provider.complete).not.toHaveBeenCalled();
      h.checkpoints.values.clear();
      await h.run();
      expect(await state()).toEqual(recovered);
    }
  );

  it("uses the different winning snapshot when a losing attach resumes before its insert", async () => {
    await runsRepo.insertRun(db, {
      id: runId,
      origin: "scheduled",
      mode: "hitl",
      status: "running",
      startedAt: new Date().toISOString(),
      completedAt: null,
      spendCents: 0,
      spendCurrency: "USD",
      budgetCents: 500,
      scheduledFor: date
    });
    let entered!: () => void;
    const paused = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let resume!: () => void;
    const resumed = new Promise<void>((resolve) => {
      resume = resolve;
    });
    let candidate: unknown[] = [];
    const losing = ensureRun(
      interruptDb(async (sql, phase, values) => {
        if (
          phase === "before" &&
          sql.includes("INSERT OR IGNORE INTO run_source_snapshots")
        ) {
          candidate = values;
          entered();
          await resumed;
        }
      }),
      "scheduled",
      date,
      runId
    );
    await paused;
    expect(candidate).toEqual([runId, 1, JSON.stringify([source])]);
    let winner;
    try {
      await configure([
        { ...source, name: "winner", url: "https://example.test/winner" }
      ]);
      winner = await packagesRepo.attachSnapshot(db, runId);
      expect(winner.version).toBe(2);
    } finally {
      resume();
    }
    expect(await losing).toBe(runId);
    expect(await packagesRepo.requireSnapshot(db, runId)).toEqual(winner);
    expect(
      (await state()).evidence.find((event) => event.event === "run.started")
        ?.payload
    ).toMatchObject({
      pollSourcesVersion: winner!.version,
      pollSources: winner!.sources
    });
  });

  it.each([
    ["observation", "before"],
    ["observation", "after"],
    ["completion", "before"],
    ["completion", "after"]
  ] as const)(
    "replays %s %s-commit interruption without losing entities or generic failure",
    async (boundary, failurePhase) => {
      let interrupted = false;
      const check = vi.fn(() => [
        {
          entities: [entity, { ...entity, id: "st-ca" }],
          failed: true,
          fetched: { errors: ["partial source failure"] }
        }
      ]);
      const h = harness(
        { original: check },
        interruptDb((sql, phase) => {
          if (
            !interrupted &&
            phase === failurePhase &&
            sql.includes(
              boundary === "observation"
                ? "INSERT OR IGNORE INTO run_source_packages"
                : "UPDATE run_source_packages SET completed = 1"
            )
          ) {
            interrupted = true;
            throw new Error("package_commit_interrupted");
          }
        })
      );
      await expect(h.run()).rejects.toThrow("package_commit_interrupted");
      expect(interrupted).toBe(true);
      expect((await state()).run?.status).toBe("running");
      await h.run();
      const recovered = await state();
      expect(recovered.run?.status).toBe("awaiting");
      expect(recovered.drafts).toHaveLength(2);
      expect(
        recovered.evidence.filter((event) => event.event === "draft.created")
      ).toHaveLength(2);
      expect(
        recovered.evidence.filter((event) => event.event === "source.fetched")
      ).toHaveLength(1);
      expect(
        recovered.evidence.filter((event) => event.event === "run.failed")
      ).toHaveLength(1);
      expect(
        recovered.evidence.find((event) => event.event === "source.fetched")
          ?.payload
      ).toMatchObject({ failed: true, errors: ["partial source failure"] });
      expect(await packagesRepo.hasFailure(db, runId)).toBe(true);
      expect(
        (
          await db
            .prepare(
              "SELECT completed FROM run_source_packages WHERE run_id = ?"
            )
            .bind(runId)
            .all()
        ).results
      ).toEqual([{ completed: 1 }]);
      expect(check).toHaveBeenCalledTimes(
        boundary === "observation" && failurePhase === "before" ? 2 : 1
      );
      expect(h.provider.complete).toHaveBeenCalledTimes(4);
      h.checkpoints.values.clear();
      await h.run();
      expect(await state()).toEqual(recovered);
      expect(h.provider.complete).toHaveBeenCalledTimes(4);
    }
  );

  it("rolls back the Run transition when the receipt INSERT fails inside the D1 batch", async () => {
    await db
      .prepare(`CREATE TRIGGER fail_empty_receipt BEFORE INSERT ON evidence_events
      WHEN NEW.event = 'run.empty' BEGIN SELECT RAISE(ABORT, 'receipt_insert_interrupted'); END`)
      .run();
    const h = harness({ original: () => [] });
    try {
      await expect(h.run()).rejects.toThrow("receipt_insert_interrupted");
      expect((await state()).run?.status).toBe("running");
      expect((await state()).run?.completedAt).toBeNull();
      expect(
        (await state()).evidence.some((event) => event.event === "run.empty")
      ).toBe(false);
    } finally {
      await db.prepare("DROP TRIGGER fail_empty_receipt").run();
    }
    await h.run();
    expect((await state()).run?.status).toBe("empty");
    expect(
      (await state()).evidence.filter((event) => event.event === "run.empty")
    ).toHaveLength(1);
    h.checkpoints.values.clear();
    await h.run();
    expect(
      (await state()).evidence.filter((event) => event.event === "run.empty")
    ).toHaveLength(1);
  });
});

describe("atomic source ownership at write (3.33)", () => {
  it.each([
    "journal",
    "source-receipt",
    "draft",
    "draft-receipt",
    "completion"
  ])(
    "rolls back a stale %s write when ownership transfers at the D1 boundary",
    async (boundary) => {
      await ensureRun(db, "scheduled", date);
      let transferred = false;
      let before: unknown;
      const snapshot = async () => ({
        journals: (
          await db
            .prepare("SELECT * FROM run_source_packages WHERE run_id=?")
            .bind(runId)
            .all()
        ).results,
        drafts: await draftsRepo.listByRun(db, runId),
        evidence: await evidenceRepo.listByRun(db, runId)
      });
      const interrupted = interruptDb(async (sql, phase, values) => {
        if (transferred || phase !== "before") return;
        const matched =
          boundary === "journal"
            ? sql.includes("INSERT OR IGNORE INTO run_source_packages")
            : boundary === "draft"
              ? sql.includes("INSERT OR IGNORE INTO drafts")
              : boundary === "completion"
                ? sql.includes("UPDATE run_source_packages SET completed")
                : sql.includes("INSERT OR IGNORE INTO evidence_events") &&
                  values.includes(
                    boundary === "source-receipt"
                      ? "source.fetched"
                      : "draft.created"
                  );
        if (!matched) return;
        transferred = true;
        // A concurrent replay finishes as this callback reaches a write.
        // Complete transfer before submitting that write's transaction.
        await runsRepo.completeRun(
          db,
          runId,
          "failed",
          new Date().toISOString()
        );
        await admission.finish(db, runId);
        const successor = await startOperatorRun(db, undefined, {
          origin: "manual",
          scheduledFor: date,
          requestId: crypto.randomUUID(),
          now: new Date()
        });
        expect(successor.status).toBe("workflow_unavailable");
        expect((await admission.get(db, runId))?.released).toBe(1);
        before = await snapshot();
      });
      const check = vi.fn(async () => [{ entities: [entity], failed: true }]);
      await expect(
        runConnector(interrupted, runId, source, check)
      ).rejects.toThrow();
      expect(transferred).toBe(true);
      expect(check).toHaveBeenCalledTimes(1);
      expect(await snapshot()).toEqual(before);
      // Completion cannot commit either its marker or companion failure receipt.
      expect(
        (await evidenceRepo.listByRun(db, runId)).some(
          (e) => e.event === "run.failed"
        )
      ).toBe(false);
    }
  );
});
