import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import * as draftsRepo from "../../shared/db/repos/draftsRepo";
import * as evidenceRepo from "../../shared/db/repos/evidenceRepo";
import * as runsRepo from "../../shared/db/repos/runsRepo";
import type { EvalSummary } from "../../shared/schemas/run";
import { decide } from "./approval";

/**
 * Story 3.16 — Approval Gate tip/lineage rules against Miniflare D1.
 */

const testEnv = env as Env;
const NOW = "2026-09-17T16:00:00.000Z";
const ACTOR = "Distinctive Queue Operator";

let runSeq = 0;
function newRunId(): string {
  runSeq += 1;
  return `run-20260917-${runSeq.toString(16).padStart(4, "0")}`;
}

const EVAL_OK: EvalSummary = {
  status: "ok",
  basis: "all claims cited",
  citationCompleteness: 100,
  disagreement: { flagged: false, description: null },
  ineligible: []
};

async function insertRun(): Promise<string> {
  const id = newRunId();
  await runsRepo.insertRun(testEnv.DB, {
    id,
    origin: "scheduled",
    mode: "hitl",
    status: "awaiting",
    startedAt: NOW,
    completedAt: NOW,
    spendCents: 0,
    spendCurrency: "USD",
    budgetCents: 200,
    scheduledFor: "2026-09-17"
  });
  return id;
}

async function insertDraft(
  runId: string,
  id: string,
  extras: {
    parentDraftId?: string | null;
    revisionIndex?: number;
    evalSummary?: EvalSummary | null;
  } = {}
) {
  await draftsRepo.insertDraft(testEnv.DB, {
    id,
    runId,
    targetEntityType: "states",
    targetEntityId: "st-nv",
    diff: { posture: { from: "untracked", to: "pending" } },
    body: `Proposal body for ${id}.`,
    tier2Only: false,
    confidence: extras.evalSummary == null ? null : 80,
    evalSummary:
      extras.evalSummary === undefined ? EVAL_OK : extras.evalSummary,
    parentDraftId: extras.parentDraftId ?? null,
    revisionIndex: extras.revisionIndex ?? 0,
    createdAt: NOW
  });
}

describe("decide revision tips (story 3.16)", () => {
  it("rejects decide on a parent while an in-flight child exists", async () => {
    const runId = await insertRun();
    const parentId = `d:${runId}:nv`;
    await insertDraft(runId, parentId);
    await insertDraft(runId, `${parentId}:r1`, {
      parentDraftId: parentId,
      revisionIndex: 1,
      evalSummary: null
    });
    const result = await decide(testEnv.DB, {
      draftId: parentId,
      action: "approve",
      operator: { displayName: ACTOR },
      now: NOW
    });
    expect(result.status).toBe("invalid");
    expect(
      (await draftsRepo.getById(testEnv.DB, parentId))?.outcome
    ).toBeNull();
  });

  it("does not treat a historical parent as pending when deciding the r1 tip", async () => {
    const runId = await insertRun();
    const parentId = `d:${runId}:nv`;
    const childId = `${parentId}:r1`;
    await insertDraft(runId, parentId);
    await insertDraft(runId, childId, {
      parentDraftId: parentId,
      revisionIndex: 1
    });
    const result = await decide(testEnv.DB, {
      draftId: childId,
      action: "approve",
      operator: { displayName: ACTOR },
      now: NOW
    });
    expect(result.status).toBe("decided");
    expect(
      (await draftsRepo.getById(testEnv.DB, parentId))?.outcome
    ).toBeNull();
    expect((await runsRepo.getRunById(testEnv.DB, runId))?.status).toBe(
      "published"
    );
    const decided = (await evidenceRepo.listByRun(testEnv.DB, runId)).find(
      (event) => event.event === "gate.decided"
    );
    expect(decided?.payload).toMatchObject({
      draftId: childId,
      lineage: [
        { draftId: parentId, revisionIndex: 0, turnId: null },
        { draftId: childId, revisionIndex: 1, turnId: null }
      ],
      approvedText: `Proposal body for ${childId}.`
    });
  });

  it("rejects decide on a superseded parent after r1 is ready", async () => {
    const runId = await insertRun();
    const parentId = `d:${runId}:nv`;
    const childId = `${parentId}:r1`;
    await insertDraft(runId, parentId);
    await insertDraft(runId, childId, {
      parentDraftId: parentId,
      revisionIndex: 1
    });
    const beforeF1 = await f1Snapshot();
    const result = await decide(testEnv.DB, {
      draftId: parentId,
      action: "approve",
      operator: { displayName: ACTOR },
      now: NOW
    });
    expect(result.status).toBe("invalid");
    expect(
      (await draftsRepo.getById(testEnv.DB, parentId))?.outcome
    ).toBeNull();
    expect(await f1Snapshot()).toEqual(beforeF1);
  });
});

async function f1Snapshot() {
  async function rows(table: string) {
    const { results } = await testEnv.DB.prepare(
      `SELECT * FROM ${table} ORDER BY id`
    ).all();
    return results ?? [];
  }
  return {
    states: await rows("states"),
    cases: await rows("cases"),
    entities: await rows("entities"),
    circuits: await rows("circuits"),
    cert_signals: await rows("cert_signals")
  };
}
