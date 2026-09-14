import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as draftsRepo from "../../shared/db/repos/draftsRepo";
import * as evidenceRepo from "../../shared/db/repos/evidenceRepo";
import * as modeRepo from "../../shared/db/repos/modeRepo";
import * as runsRepo from "../../shared/db/repos/runsRepo";
import type { GatewayDeps, LlmProvider } from "../ai/gateway";
import { kickDailyRun, startOperatorRun } from "./dailyRun";
import {
  afterPackaging,
  completeDailyStep,
  ensureRun,
  finishEmpty,
  finishFailed,
  monitorAndPackage,
  nextFreeRunId,
  packageDailyRun,
  reviewDailyRun,
  runIdFor
} from "./dailyRunSteps";
import {
  etCalendarDate,
  isRunTime,
  nextRunAtUtc,
  timezoneOffsetMs
} from "./schedule";
import type { SourceCheck } from "../connectors/connector";

const testEnv = env as Env;

describe("schedule (story 3.3)", () => {
  it("derives a UTC offset in the America/New_York zone", () => {
    const jan = new Date("2026-01-15T17:00:00.000Z");
    expect(timezoneOffsetMs(jan)).toBe(-5 * 3_600_000);
    const jul = new Date("2026-07-15T16:00:00.000Z");
    expect(timezoneOffsetMs(jul)).toBe(-4 * 3_600_000);
  });

  it("computes the next noon-ET instant strictly after now, DST-correct", () => {
    const beforeNoonUtc = new Date("2026-01-15T16:00:00.000Z");
    expect(nextRunAtUtc(beforeNoonUtc)).toBe("2026-01-15T17:00:00.000Z");
    const afterNoonUtc = new Date("2026-01-15T18:00:00.000Z");
    expect(nextRunAtUtc(afterNoonUtc)).toBe("2026-01-16T17:00:00.000Z");
  });

  it("snaps next noon to the second even when now has a fractional minute", () => {
    const justBeforeNoon = new Date("2026-01-15T16:59:30.000Z"); // 11:59:30 EST
    expect(nextRunAtUtc(justBeforeNoon)).toBe("2026-01-15T17:00:00.000Z");
  });

  it("drops leftover milliseconds so the public next-run instant is exact noon", () => {
    const withMs = new Date("2026-01-15T16:59:30.769Z");
    expect(nextRunAtUtc(withMs)).toBe("2026-01-15T17:00:00.000Z");
  });

  it("the ET-hour guard fires only at noon ET, including both cron twins", () => {
    expect(isRunTime(new Date("2026-01-15T17:00:00.000Z"))).toBe(true); // noon EST
    expect(isRunTime(new Date("2026-01-15T16:00:00.000Z"))).toBe(false); // 11:00 EST twin
    expect(isRunTime(new Date("2026-01-15T18:00:00.000Z"))).toBe(false); // 1pm EST
    expect(isRunTime(new Date("2026-07-15T16:00:00.000Z"))).toBe(true); // noon EDT
    expect(isRunTime(new Date("2026-07-15T17:00:00.000Z"))).toBe(false); // 1pm EDT twin
  });

  it("names the ET calendar date, not the UTC date, around a UTC midnight", () => {
    // 2026-01-16T03:30Z is still 2026-01-15 22:30 EST.
    expect(etCalendarDate(new Date("2026-01-16T03:30:00.000Z"))).toBe(
      "2026-01-15"
    );
    expect(etCalendarDate(new Date("2026-01-15T17:00:00.000Z"))).toBe(
      "2026-01-15"
    );
  });
});

describe("kickDailyRun (story 3.3)", () => {
  it("does not create an instance on the off-hour twin", async () => {
    const create = vi.fn();
    await kickDailyRun(
      { create },
      new Date("2026-01-15T16:00:00.000Z") // 11:00 EST
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a scheduled instance at noon ET with the ET calendar date", async () => {
    const create = vi.fn().mockResolvedValue({ id: "daily-2026-01-15" });
    await kickDailyRun({ create }, new Date("2026-01-15T17:00:00.000Z"));
    expect(create).toHaveBeenCalledWith({
      params: { origin: "scheduled", scheduledFor: "2026-01-15" },
      id: "daily-2026-01-15"
    });
  });

  it("treats a duplicate instance id as a same-day no-op", async () => {
    const create = vi.fn().mockRejectedValue(new Error("already exists"));
    await kickDailyRun({ create }, new Date("2026-01-15T17:00:00.000Z"));
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("no-ops when the Workflow binding is missing", async () => {
    await kickDailyRun(undefined, new Date("2026-01-15T17:00:00.000Z"));
  });
});

describe("daily run (story 3.3)", () => {
  const date = "2026-09-08";

  it("creates a scheduled Run with run.started evidence, then completes it empty", async () => {
    await ensureRun(testEnv.DB, "scheduled", date);
    const id = runIdFor(date, "scheduled");
    const run = await runsRepo.getRunById(testEnv.DB, id);
    expect(run?.origin).toBe("scheduled");
    expect(run?.status).toBe("running");
    expect(run?.scheduledFor).toBe(date);

    await finishEmpty(testEnv.DB, id);
    const done = await runsRepo.getRunById(testEnv.DB, id);
    expect(done?.status).toBe("empty");

    const evidence = await evidenceRepo.listByRun(testEnv.DB, id);
    expect(evidence.map((e) => e.event)).toEqual(["run.started", "run.empty"]);
    expect(evidence[1]?.payload).toEqual({ drafts: 0 });
  });

  it("is idempotent: a second ensure for the same day returns the existing Run", async () => {
    await ensureRun(testEnv.DB, "scheduled", date);
    await ensureRun(testEnv.DB, "scheduled", date);
    const matches = await testEnv.DB.prepare(
      "SELECT COUNT(*) AS n FROM runs WHERE scheduled_for = ? AND origin = 'scheduled'"
    )
      .bind(date)
      .first<{ n: number }>();
    expect(matches?.n).toBe(1);
  });

  it("records a catch-up (origin) Run alongside, never replacing the day's record", async () => {
    await ensureRun(testEnv.DB, "catch-up", date);
    const matches = await testEnv.DB.prepare(
      "SELECT COUNT(*) AS n FROM runs WHERE scheduled_for = ?"
    )
      .bind(date)
      .first<{ n: number }>();
    expect(matches?.n).toBe(2);
  });

  it("resumes an awaiting Run under the same id (no new Run, no duplicate start)", async () => {
    const id = runIdFor(date, "scheduled");
    await testEnv.DB.prepare(
      "UPDATE runs SET status = 'awaiting', completed_at = NULL WHERE id = ?"
    )
      .bind(id)
      .run();
    await ensureRun(testEnv.DB, "scheduled", date);
    const evidence = await evidenceRepo.listByRun(testEnv.DB, id);
    expect(evidence.filter((e) => e.event === "run.started")).toHaveLength(1);
  });

  it("does not complete a non-running Run (terminal stays terminal)", async () => {
    const id = runIdFor(date, "scheduled");
    await finishEmpty(testEnv.DB, id);
    const evidence = await evidenceRepo.listByRun(testEnv.DB, id);
    const emptyCount = evidence.filter((e) => e.event === "run.empty").length;
    expect(emptyCount).toBe(1);
  });
});

describe("completeDailyStep (story 3.3/3.4)", () => {
  const date = "2026-09-09";
  const material: Record<string, SourceCheck> = {
    "CFTC press": () => [
      {
        entities: [
          {
            type: "states",
            id: "st-nv",
            diff: { operationalStatus: { from: "go", to: "restricted" } },
            body: "Nevada restricted.",
            confidence: 80
          }
        ]
      }
    ]
  };
  const throws: Record<string, SourceCheck> = {
    CourtListener: () => {
      throw new Error("boom");
    }
  };

  it("marks a draft-producing Run awaiting with gate.awaiting_approval", async () => {
    await ensureRun(testEnv.DB, "scheduled", date);
    const id = runIdFor(date, "scheduled");
    const result = await monitorAndPackage(testEnv.DB, id, material);
    await completeDailyStep(testEnv.DB, id, result);
    const run = await runsRepo.getRunById(testEnv.DB, id);
    expect(run?.status).toBe("awaiting");
    const evidence = await evidenceRepo.listByRun(testEnv.DB, id);
    expect(evidence.some((e) => e.event === "gate.awaiting_approval")).toBe(
      true
    );
  });

  it("marks a zero-draft connector failure failed with run.failed", async () => {
    const failDate = "2026-09-10";
    await ensureRun(testEnv.DB, "scheduled", failDate);
    const id = runIdFor(failDate, "scheduled");
    const result = await monitorAndPackage(testEnv.DB, id, throws);
    await completeDailyStep(testEnv.DB, id, result);
    const run = await runsRepo.getRunById(testEnv.DB, id);
    expect(run?.status).toBe("failed");
    const evidence = await evidenceRepo.listByRun(testEnv.DB, id);
    expect(evidence.some((e) => e.event === "run.failed")).toBe(true);
  });

  it("keeps drafts on the gate path when a sibling connector fails", async () => {
    const mixDate = "2026-09-11";
    await ensureRun(testEnv.DB, "scheduled", mixDate);
    const id = runIdFor(mixDate, "scheduled");
    const result = await monitorAndPackage(testEnv.DB, id, {
      ...material,
      ...throws
    });
    await completeDailyStep(testEnv.DB, id, result);
    const run = await runsRepo.getRunById(testEnv.DB, id);
    expect(run?.status).toBe("awaiting");
    expect(result.anyFailure).toBe(true);
    expect(result.draftCount).toBe(1);
  });

  it("finishFailed writes run.failed even when the step threw after attach", async () => {
    const throwDate = "2026-09-12";
    await ensureRun(testEnv.DB, "scheduled", throwDate);
    const id = runIdFor(throwDate, "scheduled");
    await finishFailed(testEnv.DB, id);
    const run = await runsRepo.getRunById(testEnv.DB, id);
    expect(run?.status).toBe("failed");
    const evidence = await evidenceRepo.listByRun(testEnv.DB, id);
    expect(
      evidence.filter((e) => e.event === "run.failed").map((e) => e.payload)
    ).toContainEqual({ reason: "error" });
  });

  it("does not append run.failed when completeRun did not move an awaiting Run", async () => {
    const awaitingDate = "2026-09-14";
    await ensureRun(testEnv.DB, "scheduled", awaitingDate);
    const id = runIdFor(awaitingDate, "scheduled");
    await completeDailyStep(testEnv.DB, id, {
      draftCount: 1,
      anyFailure: false
    });
    expect((await runsRepo.getRunById(testEnv.DB, id))?.status).toBe(
      "awaiting"
    );
    await finishFailed(testEnv.DB, id);
    expect((await runsRepo.getRunById(testEnv.DB, id))?.status).toBe(
      "awaiting"
    );
    expect(
      (await evidenceRepo.listByRun(testEnv.DB, id)).some(
        (e) => e.event === "run.failed"
      )
    ).toBe(false);
  });
});

describe("afterPackaging (story 3.5)", () => {
  const NOW = "2026-09-22T16:00:00.000Z";
  const twoDrafts: Record<string, SourceCheck> = {
    "CFTC press": () => [
      {
        entities: [
          {
            type: "states",
            id: "st-nv",
            diff: { operationalStatus: { from: "go", to: "restricted" } },
            body: "Nevada restricted.",
            confidence: 80
          },
          {
            type: "states",
            id: "st-ca",
            diff: { operationalStatus: { from: "go", to: "restricted" } },
            body: "California restricted.",
            confidence: 80
          }
        ]
      }
    ]
  };
  const oneDraft: Record<string, SourceCheck> = {
    "CFTC press": () => [
      {
        entities: [
          {
            type: "states",
            id: "st-nv",
            diff: { operationalStatus: { from: "go", to: "restricted" } },
            body: "Nevada restricted.",
            confidence: 80
          }
        ]
      }
    ]
  };

  async function seedRoles() {
    await testEnv.DB.prepare(
      `INSERT INTO gateway_config (id, version, roles_json, default_budget_cents, updated_at)
       VALUES ('current', 1, ?, 100, ?)
       ON CONFLICT(id) DO UPDATE SET
         roles_json = excluded.roles_json,
         default_budget_cents = excluded.default_budget_cents,
         updated_at = excluded.updated_at`
    )
      .bind(
        JSON.stringify({
          drafter: { provider: "fake", model: "drafter-v1" },
          reviewer: { provider: "fake", model: "reviewer-v1" }
        }),
        NOW
      )
      .run();
  }

  function fakeProvider(
    script: Array<{ text?: string; costCents?: number }> = []
  ): LlmProvider & { count: () => number } {
    let calls = 0;
    return {
      name: "fake",
      count: () => calls,
      complete: async () => {
        const step = script[calls];
        calls += 1;
        return {
          text:
            step?.text ??
            JSON.stringify({
              body: "Drafter overwrite.",
              diff: { operationalStatus: { from: "go", to: "restricted" } }
            }),
          inputTokens: 1,
          outputTokens: 1,
          costCents: step?.costCents ?? 0
        };
      }
    };
  }

  function deps(provider: LlmProvider): GatewayDeps {
    return { db: testEnv.DB, provider, now: () => NOW };
  }

  it("skips LLM and completes empty when draftCount is 0", async () => {
    const date = "2026-09-22";
    await ensureRun(testEnv.DB, "scheduled", date);
    const id = runIdFor(date, "scheduled");
    await seedRoles();
    const packaged = await monitorAndPackage(testEnv.DB, id);
    const provider = fakeProvider();
    await afterPackaging(testEnv.DB, id, packaged, deps(provider));
    expect(packaged.draftCount).toBe(0);
    expect(provider.count()).toBe(0);
    expect((await runsRepo.getRunById(testEnv.DB, id))?.status).toBe("empty");
    const emptyEvidence = await evidenceRepo.listByRun(testEnv.DB, id);
    expect(
      emptyEvidence.some(
        (e) =>
          e.event === "guardrails.passed" || e.event === "guardrails.failed"
      )
    ).toBe(false);
  });

  it("reviews material Drafts then completes awaiting", async () => {
    const date = "2026-09-23";
    await ensureRun(testEnv.DB, "scheduled", date);
    const id = runIdFor(date, "scheduled");
    await seedRoles();
    const packaged = await monitorAndPackage(testEnv.DB, id, oneDraft);
    const provider = fakeProvider([
      {
        text: JSON.stringify({
          body: "Drafter overwrite.",
          diff: { operationalStatus: { from: "go", to: "restricted" } }
        })
      },
      {
        text: JSON.stringify({
          confidence: 72,
          citationCompleteness: 90,
          notes: "ok",
          disagrees: false,
          disagreement: ""
        })
      }
    ]);
    await afterPackaging(testEnv.DB, id, packaged, deps(provider));
    expect(provider.count()).toBe(2);
    const drafts = await draftsRepo.listByRun(testEnv.DB, id);
    expect(drafts[0]?.body).toBe("Drafter overwrite.");
    expect(drafts[0]?.evalSummary?.status).toBe("ok");
    expect((await runsRepo.getRunById(testEnv.DB, id))?.status).toBe(
      "awaiting"
    );
    const evidence = await evidenceRepo.listByRun(testEnv.DB, id);
    const events = evidence.map((e) => e.event);
    expect(events).toContain("guardrails.passed");
    expect(events.indexOf("guardrails.passed")).toBeLessThan(
      events.indexOf("gate.awaiting_approval")
    );
    expect(events).not.toContain("guardrails.failed");
  });

  it("does not complete awaiting after a budget-stop", async () => {
    const date = "2026-09-24";
    await ensureRun(testEnv.DB, "scheduled", date);
    const id = runIdFor(date, "scheduled");
    await testEnv.DB.prepare("UPDATE runs SET budget_cents = 50 WHERE id = ?")
      .bind(id)
      .run();
    await seedRoles();
    const packaged = await monitorAndPackage(testEnv.DB, id, twoDrafts);
    expect(packaged.draftCount).toBe(2);
    const provider = fakeProvider([
      {
        text: JSON.stringify({
          body: "Drafter overwrite.",
          diff: { operationalStatus: { from: "go", to: "restricted" } }
        }),
        costCents: 50
      }
    ]);
    await afterPackaging(testEnv.DB, id, packaged, deps(provider));
    expect(provider.count()).toBe(1);
    expect((await runsRepo.getRunById(testEnv.DB, id))?.status).toBe("stopped");
    const evidence = await evidenceRepo.listByRun(testEnv.DB, id);
    const drafts = await draftsRepo.listByRun(testEnv.DB, id);
    expect(drafts.every((d) => d.evalSummary?.status === "evals_not_run")).toBe(
      true
    );
    for (const draft of drafts) {
      expect(
        evidence.some(
          (e) =>
            (e.event === "guardrails.passed" ||
              e.event === "guardrails.failed") &&
            (e.payload as { draftId?: string } | null)?.draftId === draft.id
        )
      ).toBe(true);
    }
    expect(evidence.some((e) => e.event === "gate.awaiting_approval")).toBe(
      false
    );
  });

  it("marks a zero-draft connector failure failed, not empty", async () => {
    const date = "2026-09-25";
    await ensureRun(testEnv.DB, "scheduled", date);
    const id = runIdFor(date, "scheduled");
    await seedRoles();
    const packaged = await monitorAndPackage(testEnv.DB, id, {
      CourtListener: () => {
        throw new Error("boom");
      }
    });
    const provider = fakeProvider();
    await afterPackaging(testEnv.DB, id, packaged, deps(provider));
    expect(packaged.draftCount).toBe(0);
    expect(packaged.anyFailure).toBe(true);
    expect(provider.count()).toBe(0);
    expect((await runsRepo.getRunById(testEnv.DB, id))?.status).toBe("failed");
    const evidence = await evidenceRepo.listByRun(testEnv.DB, id);
    expect(evidence.some((e) => e.event === "run.failed")).toBe(true);
  });
});

describe("packageDailyRun / reviewDailyRun (story 3.5)", () => {
  const NOW = "2026-09-26T16:00:00.000Z";
  const oneDraft: Record<string, SourceCheck> = {
    "CFTC press": () => [
      {
        entities: [
          {
            type: "states",
            id: "st-nv",
            diff: { operationalStatus: { from: "go", to: "restricted" } },
            body: "Nevada restricted.",
            confidence: 80
          }
        ]
      }
    ]
  };

  async function seedRoles() {
    await testEnv.DB.prepare(
      `INSERT INTO gateway_config (id, version, roles_json, default_budget_cents, updated_at)
       VALUES ('current', 1, ?, 100, ?)
       ON CONFLICT(id) DO UPDATE SET
         roles_json = excluded.roles_json,
         default_budget_cents = excluded.default_budget_cents,
         updated_at = excluded.updated_at`
    )
      .bind(
        JSON.stringify({
          drafter: { provider: "fake", model: "drafter-v1" },
          reviewer: { provider: "fake", model: "reviewer-v1" }
        }),
        NOW
      )
      .run();
  }

  function fakeProvider(
    script: Array<{ text?: string }> = []
  ): LlmProvider & { count: () => number } {
    let calls = 0;
    return {
      name: "fake",
      count: () => calls,
      complete: async () => {
        const step = script[calls];
        calls += 1;
        return {
          text:
            step?.text ??
            JSON.stringify({
              body: "Drafter overwrite.",
              diff: { operationalStatus: { from: "go", to: "restricted" } }
            }),
          inputTokens: 1,
          outputTokens: 1,
          costCents: 0
        };
      }
    };
  }

  function deps(provider: LlmProvider): GatewayDeps {
    return { db: testEnv.DB, provider, now: () => NOW };
  }

  it("completes an empty poll inside packageDailyRun and never starts reviewDailyRun", async () => {
    const date = "2026-09-26";
    await ensureRun(testEnv.DB, "scheduled", date);
    const id = runIdFor(date, "scheduled");
    await seedRoles();
    const provider = fakeProvider();
    const packaged = await packageDailyRun(testEnv.DB, id, deps(provider));
    expect(packaged).toEqual({
      skip: false,
      runId: id,
      draftCount: 0,
      anyFailure: false
    });
    expect(provider.count()).toBe(0);
    expect((await runsRepo.getRunById(testEnv.DB, id))?.status).toBe("empty");

    await reviewDailyRun(testEnv.DB, packaged, deps(provider));
    expect(provider.count()).toBe(0);
    expect((await runsRepo.getRunById(testEnv.DB, id))?.status).toBe("empty");
    const emptyEvidence = await evidenceRepo.listByRun(testEnv.DB, id);
    expect(
      emptyEvidence.some(
        (e) =>
          e.event === "guardrails.passed" || e.event === "guardrails.failed"
      )
    ).toBe(false);
  });

  it("leaves material drafts unevaluated until reviewDailyRun", async () => {
    const date = "2026-09-27";
    await ensureRun(testEnv.DB, "scheduled", date);
    const id = runIdFor(date, "scheduled");
    await seedRoles();
    const provider = fakeProvider([
      {
        text: JSON.stringify({
          body: "Drafter overwrite.",
          diff: { operationalStatus: { from: "go", to: "restricted" } }
        })
      },
      {
        text: JSON.stringify({
          confidence: 72,
          citationCompleteness: 90,
          notes: "ok",
          disagrees: false,
          disagreement: ""
        })
      }
    ]);
    const packaged = await packageDailyRun(
      testEnv.DB,
      id,
      deps(provider),
      oneDraft
    );
    expect(packaged.skip).toBe(false);
    if (packaged.skip) throw new Error("expected material packaging");
    expect(packaged.draftCount).toBe(1);
    expect(provider.count()).toBe(0);
    expect((await runsRepo.getRunById(testEnv.DB, id))?.status).toBe("running");
    const before = await draftsRepo.listByRun(testEnv.DB, id);
    expect(before.every((d) => d.evalSummary == null)).toBe(true);

    await reviewDailyRun(testEnv.DB, packaged, deps(provider));
    expect(provider.count()).toBe(2);
    expect((await runsRepo.getRunById(testEnv.DB, id))?.status).toBe(
      "awaiting"
    );
    const after = await draftsRepo.listByRun(testEnv.DB, id);
    expect(after[0]?.evalSummary?.status).toBe("ok");
    const reviewEvidence = await evidenceRepo.listByRun(testEnv.DB, id);
    const reviewEvents = reviewEvidence.map((e) => e.event);
    expect(reviewEvents.indexOf("guardrails.passed")).toBeLessThan(
      reviewEvents.indexOf("gate.awaiting_approval")
    );
  });
});

describe("nextFreeRunId / startOperatorRun (story 3.12)", () => {
  const NOW = new Date("2026-01-15T16:00:00.000Z"); // 11:00 EST — off-hour twin

  async function seed(input: {
    id: string;
    origin: "scheduled" | "catch-up" | "manual";
    status: "running" | "published" | "awaiting" | "empty" | "failed";
    scheduledFor: string;
    startedAt: string;
  }) {
    await runsRepo.insertRun(testEnv.DB, {
      id: input.id,
      origin: input.origin,
      mode: "hitl",
      status: input.status,
      startedAt: input.startedAt,
      completedAt: input.status === "running" ? null : input.startedAt,
      spendCents: 0,
      spendCurrency: "USD",
      budgetCents: null,
      scheduledFor: input.scheduledFor
    });
  }

  it("prefers 0002 for manual and allocates the next hex when 0002 is taken", () => {
    expect(nextFreeRunId("2026-11-02", "manual", [])).toBe("run-20261102-0002");
    expect(nextFreeRunId("2026-11-02", "manual", ["run-20261102-0002"])).toBe(
      "run-20261102-0003"
    );
  });

  it("starts an operator Run at an off-hour (skips the noon-ET guard)", async () => {
    const create = vi.fn().mockResolvedValue({ id: "manual-2026-11-01-0002" });
    const result = await startOperatorRun(
      testEnv.DB,
      { create },
      {
        origin: "manual",
        scheduledFor: "2026-11-01",
        now: NOW
      }
    );
    expect(isRunTime(NOW)).toBe(false);
    expect(result.status).toBe("started");
    if (result.status !== "started") return;
    expect(result.run.origin).toBe("manual");
    expect(result.run.status).toBe("running");
    expect(result.run.id).toBe("run-20261101-0002");
    expect(result.run.scheduledFor).toBe("2026-11-01");
    expect(create).toHaveBeenCalledWith({
      params: {
        origin: "manual",
        scheduledFor: "2026-11-01",
        runId: "run-20261101-0002"
      },
      id: "manual-2026-11-01-0002"
    });
  });

  it("allocates suffix 0003 when 0002 is already used that day", async () => {
    await seed({
      id: "run-20261102-0002",
      origin: "manual",
      status: "empty",
      scheduledFor: "2026-11-02",
      startedAt: "2026-11-02T12:00:00.000Z"
    });
    const create = vi.fn().mockResolvedValue({});
    const result = await startOperatorRun(
      testEnv.DB,
      { create },
      {
        origin: "manual",
        scheduledFor: "2026-11-02",
        now: new Date("2026-11-02T18:00:00.000Z")
      }
    );
    expect(result.status).toBe("started");
    if (result.status !== "started") return;
    expect(result.run.id).toBe("run-20261102-0003");
  });

  it("packageDailyRun follows the pinned id, not the newest same-origin row", async () => {
    await seed({
      id: "run-20261103-0002",
      origin: "manual",
      status: "published",
      scheduledFor: "2026-11-03",
      startedAt: "2026-09-12T18:00:00.000Z"
    });
    await seed({
      id: "run-20261103-0003",
      origin: "manual",
      status: "running",
      scheduledFor: "2026-11-03",
      startedAt: "2026-09-12T12:00:00.000Z"
    });
    const pinned = await ensureRun(
      testEnv.DB,
      "manual",
      "2026-11-03",
      "run-20261103-0003"
    );
    expect(pinned).toBe("run-20261103-0003");
    const packaged = await packageDailyRun(testEnv.DB, pinned, {
      db: testEnv.DB,
      provider: {
        name: "fake",
        complete: async () => {
          throw new Error("unused");
        }
      }
    });
    expect(packaged.skip).toBe(false);
    if (packaged.skip) return;
    expect(packaged.runId).toBe("run-20261103-0003");
    expect(
      (await runsRepo.getRunById(testEnv.DB, "run-20261103-0002"))?.status
    ).toBe("published");
  });

  it("marks the inserted Run failed when the workflow binding is missing", async () => {
    const result = await startOperatorRun(testEnv.DB, undefined, {
      origin: "manual",
      scheduledFor: "2026-11-04",
      now: NOW
    });
    expect(result.status).toBe("workflow_unavailable");
    if (result.status !== "workflow_unavailable") return;
    expect(result.run.status).toBe("failed");
    const evidence = await evidenceRepo.listByRun(testEnv.DB, result.run.id);
    expect(evidence.some((event) => event.event === "run.failed")).toBe(true);
  });

  it("marks the inserted Run failed when workflow.create rejects", async () => {
    const create = vi.fn().mockRejectedValue(new Error("already exists"));
    const result = await startOperatorRun(
      testEnv.DB,
      { create },
      {
        origin: "manual",
        scheduledFor: "2026-11-18",
        now: NOW
      }
    );
    expect(result.status).toBe("workflow_unavailable");
    if (result.status !== "workflow_unavailable") return;
    expect(result.run.status).toBe("failed");
    const evidence = await evidenceRepo.listByRun(testEnv.DB, result.run.id);
    expect(evidence.some((event) => event.event === "run.failed")).toBe(true);
  });

  it("still returns workflow_unavailable when finishFailed throws after create rejects", async () => {
    const evidenceMod = await import("../projector/evidence");
    const spy = vi
      .spyOn(evidenceMod, "append")
      .mockRejectedValue(new Error("evidence boom"));
    try {
      const create = vi.fn().mockRejectedValue(new Error("already exists"));
      const result = await startOperatorRun(
        testEnv.DB,
        { create },
        {
          origin: "manual",
          scheduledFor: "2026-11-19",
          now: NOW
        }
      );
      expect(result.status).toBe("workflow_unavailable");
      if (result.status !== "workflow_unavailable") return;
      expect(result.run.status).toBe("failed");
      expect(
        (await runsRepo.getRunById(testEnv.DB, result.run.id))?.status
      ).toBe("failed");
    } finally {
      spy.mockRestore();
    }
  });

  it("returns supersede_required against a published sibling and records it on confirm", async () => {
    await seed({
      id: "run-20261105-0000",
      origin: "scheduled",
      status: "published",
      scheduledFor: "2026-11-05",
      startedAt: "2026-11-05T17:00:00.000Z"
    });
    const blocked = await startOperatorRun(
      testEnv.DB,
      { create: vi.fn() },
      {
        origin: "manual",
        scheduledFor: "2026-11-05",
        now: NOW
      }
    );
    expect(blocked).toEqual({
      status: "supersede_required",
      priorRunId: "run-20261105-0000"
    });

    const create = vi.fn().mockResolvedValue({});
    const confirmed = await startOperatorRun(
      testEnv.DB,
      { create },
      {
        origin: "manual",
        scheduledFor: "2026-11-05",
        supersedePriorPublish: true,
        now: NOW
      }
    );
    expect(confirmed.status).toBe("started");
    if (confirmed.status !== "started") return;
    const evidence = await evidenceRepo.listByRun(testEnv.DB, confirmed.run.id);
    const superseded = evidence.find(
      (event) => event.event === "run.superseded"
    );
    expect(superseded?.payload).toEqual({ priorRunId: "run-20261105-0000" });
    expect(
      (await runsRepo.getRunById(testEnv.DB, "run-20261105-0000"))?.status
    ).toBe("published");
  });
});

describe("mode stamp + YOLO hook (story 3.13)", () => {
  async function restoreMode() {
    await testEnv.DB.prepare(
      `UPDATE approval_mode
          SET mode = 'hitl', threshold = 70, version = 1,
              updated_at = '2026-09-13T00:00:00.000Z'
        WHERE id = 'current'`
    ).run();
    await testEnv.DB.prepare("DELETE FROM mode_audit").run();
    await testEnv.DB.prepare(
      `UPDATE states
          SET operational_status = 'banned', provenance_kind = 'human',
              published_at = '2026-08-09T16:00:00.000Z',
              updated_at = '2026-08-09T16:00:00.000Z'
        WHERE id = 'st-nv'`
    ).run();
  }

  afterEach(async () => {
    await restoreMode();
  });

  const NOW = "2026-12-01T16:00:00.000Z";

  function fakeProvider(): LlmProvider {
    return {
      name: "fake",
      complete: async () => ({
        text: "{}",
        inputTokens: 1,
        outputTokens: 1,
        costCents: 0
      })
    };
  }

  it("stamps scheduled and operator Runs from the live mode", async () => {
    await modeRepo.set(testEnv.DB, {
      mode: "yolo",
      actor: "Patrick",
      now: NOW
    });
    await ensureRun(testEnv.DB, "scheduled", "2026-12-01");
    const scheduled = await runsRepo.getRunById(
      testEnv.DB,
      runIdFor("2026-12-01", "scheduled")
    );
    expect(scheduled?.mode).toBe("yolo");

    const started = await startOperatorRun(
      testEnv.DB,
      { create: vi.fn().mockResolvedValue({}) },
      {
        origin: "manual",
        scheduledFor: "2026-12-02",
        now: new Date(NOW)
      }
    );
    expect(started.status).toBe("started");
    if (started.status !== "started") return;
    expect(started.run.mode).toBe("yolo");
  });

  it("keeps auto-approving a yolo-stamped Run after global mode flips to HITL", async () => {
    const yoloDate = "2026-12-05";
    await modeRepo.set(testEnv.DB, {
      mode: "yolo",
      actor: "Patrick",
      now: NOW
    });
    await ensureRun(testEnv.DB, "scheduled", yoloDate);
    const yoloId = runIdFor(yoloDate, "scheduled");
    await modeRepo.set(testEnv.DB, {
      mode: "hitl",
      actor: "Patrick",
      now: NOW
    });
    expect((await runsRepo.getRunById(testEnv.DB, yoloId))?.mode).toBe("yolo");
    await draftsRepo.insertDraft(testEnv.DB, {
      id: `d:${yoloId}:states:st-nv`,
      runId: yoloId,
      targetEntityType: "states",
      targetEntityId: "st-nv",
      diff: { operationalStatus: { from: "go", to: "restricted" } },
      body: "Frozen yolo Run draft.",
      tier2Only: false,
      confidence: 80,
      evalSummary: {
        status: "ok",
        basis: "ok",
        citationCompleteness: 90,
        disagreement: { flagged: false, description: null },
        ineligible: []
      },
      createdAt: NOW
    });
    await afterPackaging(
      testEnv.DB,
      yoloId,
      { draftCount: 1, anyFailure: false },
      { db: testEnv.DB, provider: fakeProvider(), now: () => NOW }
    );
    expect(
      (await draftsRepo.getById(testEnv.DB, `d:${yoloId}:states:st-nv`))
        ?.outcome
    ).toBe("approved");
    expect(
      (await evidenceRepo.listByRun(testEnv.DB, yoloId)).some(
        (e) => e.event === "yolo.validated"
      )
    ).toBe(true);
  });

  it("auto-approves an eligible YOLO Run after packaging and leaves HITL pending", async () => {
    const yoloDate = "2026-12-03";
    await modeRepo.set(testEnv.DB, {
      mode: "yolo",
      actor: "Patrick",
      now: NOW
    });
    await ensureRun(testEnv.DB, "scheduled", yoloDate);
    const yoloId = runIdFor(yoloDate, "scheduled");
    await draftsRepo.insertDraft(testEnv.DB, {
      id: `d:${yoloId}:states:st-nv`,
      runId: yoloId,
      targetEntityType: "states",
      targetEntityId: "st-nv",
      diff: { operationalStatus: { from: "go", to: "restricted" } },
      body: "Eligible YOLO draft.",
      tier2Only: false,
      confidence: 80,
      evalSummary: {
        status: "ok",
        basis: "ok",
        citationCompleteness: 90,
        disagreement: { flagged: false, description: null },
        ineligible: []
      },
      createdAt: NOW
    });
    await afterPackaging(
      testEnv.DB,
      yoloId,
      { draftCount: 1, anyFailure: false },
      { db: testEnv.DB, provider: fakeProvider(), now: () => NOW }
    );
    const approved = await draftsRepo.getById(
      testEnv.DB,
      `d:${yoloId}:states:st-nv`
    );
    expect(approved?.outcome).toBe("approved");
    expect(approved?.decidedBy).toBe("approval-agent");
    const events = await evidenceRepo.listByRun(testEnv.DB, yoloId);
    expect(events.some((e) => e.event === "yolo.validated")).toBe(true);
    expect(events.some((e) => e.event === "gate.decided")).toBe(true);

    await restoreMode();
    const hitlDate = "2026-12-04";
    await ensureRun(testEnv.DB, "scheduled", hitlDate);
    const hitlId = runIdFor(hitlDate, "scheduled");
    expect((await runsRepo.getRunById(testEnv.DB, hitlId))?.mode).toBe("hitl");
    await draftsRepo.insertDraft(testEnv.DB, {
      id: `d:${hitlId}:states:st-nv`,
      runId: hitlId,
      targetEntityType: "states",
      targetEntityId: "st-nv",
      diff: { operationalStatus: { from: "go", to: "restricted" } },
      body: "Eligible HITL draft.",
      tier2Only: false,
      confidence: 80,
      evalSummary: {
        status: "ok",
        basis: "ok",
        citationCompleteness: 90,
        disagreement: { flagged: false, description: null },
        ineligible: []
      },
      createdAt: NOW
    });
    await afterPackaging(
      testEnv.DB,
      hitlId,
      { draftCount: 1, anyFailure: false },
      { db: testEnv.DB, provider: fakeProvider(), now: () => NOW }
    );
    expect(
      (await draftsRepo.getById(testEnv.DB, `d:${hitlId}:states:st-nv`))
        ?.outcome
    ).toBeNull();
  });
});
