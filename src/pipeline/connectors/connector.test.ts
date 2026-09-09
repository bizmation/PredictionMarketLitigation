import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import * as runsRepo from "../../shared/db/repos/runsRepo";
import * as draftsRepo from "../../shared/db/repos/draftsRepo";
import * as evidenceRepo from "../../shared/db/repos/evidenceRepo";
import { POLL_SOURCES } from "./sources";
import { monitorAndPackage } from "../workflow/dailyRunSteps";
import type { SourceCheck } from "./connector";

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
});
