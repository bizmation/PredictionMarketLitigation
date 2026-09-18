import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as runsRepo from "../../shared/db/repos/runsRepo";
import * as draftsRepo from "../../shared/db/repos/draftsRepo";
import * as evidenceRepo from "../../shared/db/repos/evidenceRepo";
import * as pipelineConfigRepo from "../../shared/db/repos/pipelineConfigRepo";
import { CONNECTOR_TIMEOUT_MS } from "../../shared/lib/timeouts";
import { POLL_SOURCES } from "./sources";
import {
  completeDailyStep,
  monitorAndPackage
} from "../workflow/dailyRunSteps";
import { SourceUnavailableError, type SourceCheck } from "./connector";

const testEnv = env as Env;
const NOW = "2026-09-20T16:00:00.000Z";
let seq = 0xa00;

async function newRun(): Promise<string> {
  const id = `run-20260920-${(seq++).toString(16).padStart(4, "0")}`;
  await runsRepo.insertRun(testEnv.DB, {
    id,
    origin: "scheduled",
    mode: "hitl",
    status: "running",
    startedAt: NOW,
    completedAt: null,
    spendCents: 0,
    spendCurrency: "USD",
    budgetCents: null,
    scheduledFor: "2026-09-20"
  });
  return id;
}

const skipAll: Record<string, SourceCheck> = {};
const oneThrows: Record<string, SourceCheck> = {
  CourtListener: () => {
    throw new Error("boom");
  }
};
const oneMaterial: Record<string, SourceCheck> = {
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
const oneTier2: Record<string, SourceCheck> = {
  "Legal news leads": () => [
    {
      entities: [
        {
          type: "cases",
          id: "case-x",
          diff: { posture: { from: "state", to: "banned" } },
          body: "News lead.",
          confidence: 60
        }
      ]
    }
  ]
};
const wiredEmpty: Record<string, SourceCheck> = {
  CourtListener: () => [],
  "CFTC press": () => [],
  "SCOTUS docket": () => [],
  "Legal news leads": () => []
};

describe("source monitoring & draft packaging (story 3.4)", () => {
  beforeEach(async () => {
    await testEnv.DB.prepare("DELETE FROM pipeline_config_versions").run();
  });

  it("records source.skipped per connector and returns zero drafts when all are stubs", async () => {
    const runId = await newRun();
    const result = await monitorAndPackage(testEnv.DB, runId, skipAll);
    expect(result.draftCount).toBe(0);
    expect(result.anyFailure).toBe(false);

    const evidence = await evidenceRepo.listByRun(testEnv.DB, runId);
    const skipped = evidence.filter((e) => e.event === "source.skipped");
    expect(skipped).toHaveLength(POLL_SOURCES.length);
    expect(skipped[0]?.payload).toMatchObject({ reason: "not wired" });
    const drafts = await draftsRepo.listByRun(testEnv.DB, runId);
    expect(drafts).toHaveLength(0);
  });

  it("turns a material change into a Draft with draft.created evidence (tier1)", async () => {
    const runId = await newRun();
    const result = await monitorAndPackage(testEnv.DB, runId, oneMaterial);
    expect(result.draftCount).toBe(1);
    expect(result.anyFailure).toBe(false);

    const drafts = await draftsRepo.listByRun(testEnv.DB, runId);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      targetEntityType: "states",
      targetEntityId: "st-nv",
      tier2Only: false,
      confidence: 80,
      outcome: null
    });
    expect(drafts[0]?.diff).toEqual({
      operationalStatus: { from: "go", to: "restricted" }
    });

    const evidence = await evidenceRepo.listByRun(testEnv.DB, runId);
    expect(evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "source.fetched",
          payload: expect.objectContaining({
            source: "CFTC press",
            itemCount: 1
          })
        }),
        expect.objectContaining({
          event: "draft.created",
          payload: expect.objectContaining({
            entityType: "states",
            entityId: "st-nv"
          })
        })
      ])
    );
  });

  it("marks a Tier-2 change tier2Only", async () => {
    const runId = await newRun();
    await monitorAndPackage(testEnv.DB, runId, oneTier2);
    const drafts = await draftsRepo.listByRun(testEnv.DB, runId);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.tier2Only).toBe(true);
  });

  it("records run.failed naming the failed connector and never masks the failure", async () => {
    const runId = await newRun();
    const result = await monitorAndPackage(testEnv.DB, runId, oneThrows);
    expect(result.anyFailure).toBe(true);

    const evidence = await evidenceRepo.listByRun(testEnv.DB, runId);
    const failed = evidence.find((e) => e.event === "run.failed");
    expect(failed?.payload).toEqual({
      connector: "CourtListener",
      tier: "tier1",
      reason: "error"
    });
  });

  it("records a wired empty poll as no material change, not not-wired", async () => {
    const runId = await newRun();
    await monitorAndPackage(testEnv.DB, runId, wiredEmpty);
    const skipped = (await evidenceRepo.listByRun(testEnv.DB, runId)).filter(
      (e) => e.event === "source.skipped"
    );
    expect(skipped.length).toBe(POLL_SOURCES.length);
    expect(
      skipped.every(
        (e) => (e.payload as { reason: string }).reason === "no material change"
      )
    ).toBe(true);
  });

  it("does not duplicate drafts when packaging is run twice (step retry)", async () => {
    const runId = await newRun();
    await monitorAndPackage(testEnv.DB, runId, oneMaterial);
    await monitorAndPackage(testEnv.DB, runId, oneMaterial);
    const drafts = await draftsRepo.listByRun(testEnv.DB, runId);
    expect(drafts).toHaveLength(1);
    const created = (await evidenceRepo.listByRun(testEnv.DB, runId)).filter(
      (e) => e.event === "draft.created"
    );
    expect(created).toHaveLength(1);
  });

  it("iterates the steered poll_sources list on the next package", async () => {
    const extra = {
      name: "ND Cal docket",
      url: "https://www.courtlistener.com/docket/ndcal-example/",
      tier: "tier1" as const
    };
    const steered = [
      ...POLL_SOURCES.map((source) => ({
        name: source.name,
        url: source.url,
        tier: source.tier
      })),
      extra
    ];
    await pipelineConfigRepo.appendVersion(testEnv.DB, {
      newValue: steered,
      actor: "Distinctive Queue Operator",
      createdAt: NOW
    });
    const runId = await newRun();
    const result = await monitorAndPackage(testEnv.DB, runId, skipAll);
    expect(result.draftCount).toBe(0);
    const skipped = (await evidenceRepo.listByRun(testEnv.DB, runId)).filter(
      (e) => e.event === "source.skipped"
    );
    expect(skipped).toHaveLength(steered.length);
    expect(
      skipped.some(
        (e) => (e.payload as { source?: string }).source === "ND Cal docket"
      )
    ).toBe(true);
  });
});

describe("typed source skips (story 3.21)", () => {
  beforeEach(async () => {
    await testEnv.DB.prepare("DELETE FROM pipeline_config_versions").run();
  });

  it("records SourceUnavailableError as source.skipped { reason } with failed: true, siblings unaffected", async () => {
    const runId = await newRun();
    const checks: Record<string, SourceCheck> = {
      CourtListener: () => {
        throw new SourceUnavailableError("http_429", {
          status: 429,
          reason: "impostor",
          tier: "tier2"
        });
      },
      ...oneMaterial
    };
    const result = await monitorAndPackage(testEnv.DB, runId, checks);
    expect(result).toEqual({ draftCount: 1, anyFailure: true });
    const evidence = await evidenceRepo.listByRun(testEnv.DB, runId);
    expect(
      evidence.find(
        (e) =>
          e.event === "source.skipped" &&
          (e.payload as { source?: string }).source === "CourtListener"
      )?.payload
    ).toEqual({
      source: "CourtListener",
      tier: "tier1",
      reason: "http_429",
      status: 429
    });
    expect(evidence.some((e) => e.event === "run.failed")).toBe(false);
    expect(
      evidence.filter(
        (e) =>
          e.event === "source.skipped" &&
          (e.payload as { reason?: string }).reason === "not wired"
      )
    ).toHaveLength(POLL_SOURCES.length - 2);
  });

  it("marks the Run failed, never empty, when the only wired source is unconfigured", async () => {
    const runId = await newRun();
    const checks: Record<string, SourceCheck> = {
      CourtListener: () => {
        throw new SourceUnavailableError("unconfigured");
      }
    };
    const result = await monitorAndPackage(testEnv.DB, runId, checks);
    expect(result).toEqual({ draftCount: 0, anyFailure: true });
    const skipped = (await evidenceRepo.listByRun(testEnv.DB, runId)).filter(
      (e) => e.event === "source.skipped"
    );
    expect(
      skipped.find(
        (e) => (e.payload as { source?: string }).source === "CourtListener"
      )?.payload
    ).toMatchObject({ reason: "unconfigured" });
  });

  it("spreads a connector's fetched summary into source.fetched, even with zero entities", async () => {
    const runId = await newRun();
    const checks: Record<string, SourceCheck> = {
      CourtListener: () => [
        {
          entities: [],
          fetched: {
            docketIds: ["73375343"],
            fetchedAt: NOW,
            dockets: [{ docketId: "73375343", latestEntryDate: "2026-09-15" }],
            // Reserved keys always win over connector-authored ones.
            source: "impostor",
            itemCount: 99
          }
        }
      ]
    };
    const result = await monitorAndPackage(testEnv.DB, runId, checks);
    expect(result).toEqual({ draftCount: 0, anyFailure: false });
    const evidence = await evidenceRepo.listByRun(testEnv.DB, runId);
    expect(evidence.find((e) => e.event === "source.fetched")?.payload).toEqual(
      {
        source: "CourtListener",
        tier: "tier1",
        itemCount: 1,
        docketIds: ["73375343"],
        fetchedAt: NOW,
        dockets: [{ docketId: "73375343", latestEntryDate: "2026-09-15" }]
      }
    );
    expect(
      evidence.some(
        (e) =>
          e.event === "source.skipped" &&
          (e.payload as { source?: string }).source === "CourtListener"
      )
    ).toBe(false);
  });
});

describe("connector timeouts (story 3.19)", () => {
  beforeEach(async () => {
    await testEnv.DB.prepare("DELETE FROM pipeline_config_versions").run();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * A Run whose `started_at` is safely in the past so `completeDailyStep`
   * (real clock) satisfies `completed_at >= started_at`.
   */
  async function pastRun(): Promise<string> {
    const id = `run-20260910-${(seq++).toString(16).padStart(4, "0")}`;
    await runsRepo.insertRun(testEnv.DB, {
      id,
      origin: "scheduled",
      mode: "hitl",
      status: "running",
      startedAt: "2026-09-10T16:00:00.000Z",
      completedAt: null,
      spendCents: 0,
      spendCurrency: "USD",
      budgetCents: null,
      scheduledFor: "2026-09-10"
    });
    return id;
  }

  /** A check that never resolves; each call pushes a `called` promise. */
  function hungCheck(): SourceCheck & { calls: Promise<void>[] } {
    const calls: Promise<void>[] = [];
    const fires: Array<() => void> = [];
    const pending = () => {
      let fire: () => void = () => {};
      calls.push(
        new Promise<void>((resolve) => {
          fire = resolve;
        })
      );
      fires.push(fire);
    };
    // Pre-create enough entries for every source; a call fires the next.
    for (let i = 0; i < POLL_SOURCES.length; i++) pending();
    let index = 0;
    const check: SourceCheck = () => {
      fires[index]?.();
      index += 1;
      return new Promise<never>(() => {});
    };
    return Object.assign(check, { calls });
  }

  it("skips a hung source with reason timeout, marks it failed, and still polls the siblings", async () => {
    const runId = await pastRun();
    const hung = hungCheck();
    const checks: Record<string, SourceCheck> = {
      CourtListener: hung,
      ...oneMaterial
    };
    vi.useFakeTimers();
    const pending = monitorAndPackage(testEnv.DB, runId, checks);
    await hung.calls[0];
    await vi.advanceTimersByTimeAsync(CONNECTOR_TIMEOUT_MS);
    const result = await pending;
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();

    expect(result).toEqual({ draftCount: 1, anyFailure: true });
    const evidence = await evidenceRepo.listByRun(testEnv.DB, runId);
    const skipped = evidence.filter((e) => e.event === "source.skipped");
    expect(
      skipped.find(
        (e) => (e.payload as { source?: string }).source === "CourtListener"
      )?.payload
    ).toEqual({
      source: "CourtListener",
      tier: "tier1",
      reason: "timeout",
      timeoutMs: CONNECTOR_TIMEOUT_MS
    });
    expect(evidence.some((e) => e.event === "run.failed")).toBe(false);
    expect(
      evidence.some(
        (e) =>
          e.event === "source.fetched" &&
          (e.payload as { source?: string }).source === "CFTC press"
      )
    ).toBe(true);
    // Sibling Drafts still reach the gate: drafts → awaiting under 3.4.
    await completeDailyStep(testEnv.DB, runId, result);
    expect((await runsRepo.getRunById(testEnv.DB, runId))?.status).toBe(
      "awaiting"
    );
  });

  it("marks the Run failed, never empty, when every source times out with zero drafts", async () => {
    const runId = await pastRun();
    const hung = hungCheck();
    const checks: Record<string, SourceCheck> = {};
    for (const source of POLL_SOURCES) checks[source.name] = hung;
    vi.useFakeTimers();
    const pending = monitorAndPackage(testEnv.DB, runId, checks);
    for (let i = 0; i < POLL_SOURCES.length; i++) {
      await hung.calls[i];
      await vi.advanceTimersByTimeAsync(CONNECTOR_TIMEOUT_MS);
    }
    const result = await pending;
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();

    expect(result).toEqual({ draftCount: 0, anyFailure: true });
    const evidence = await evidenceRepo.listByRun(testEnv.DB, runId);
    const skipped = evidence.filter((e) => e.event === "source.skipped");
    expect(skipped).toHaveLength(POLL_SOURCES.length);
    expect(
      skipped.every(
        (e) => (e.payload as { reason?: string }).reason === "timeout"
      )
    ).toBe(true);
    await completeDailyStep(testEnv.DB, runId, result);
    expect((await runsRepo.getRunById(testEnv.DB, runId))?.status).toBe(
      "failed"
    );
    expect(evidence.some((e) => e.event === "run.empty")).toBe(false);
  });

  it("does not fire the deadline for a check that answers in time", async () => {
    const runId = await newRun();
    vi.useFakeTimers();
    const result = await monitorAndPackage(testEnv.DB, runId, wiredEmpty);
    expect(result).toEqual({ draftCount: 0, anyFailure: false });
    expect(vi.getTimerCount()).toBe(0);
  });
});
