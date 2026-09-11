import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

import * as draftsRepo from "../../shared/db/repos/draftsRepo";
import * as evidenceRepo from "../../shared/db/repos/evidenceRepo";
import * as runsRepo from "../../shared/db/repos/runsRepo";
import type { GatewayDeps, LlmProvider } from "../ai/gateway";
import { kickDailyRun } from "./dailyRun";
import {
  afterPackaging,
  completeDailyStep,
  ensureRun,
  finishEmpty,
  finishFailed,
  monitorAndPackage,
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
    const packaged = await packageDailyRun(
      testEnv.DB,
      "scheduled",
      date,
      deps(provider)
    );
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
      "scheduled",
      date,
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
