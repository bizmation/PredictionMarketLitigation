import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as draftsRepo from "../../shared/db/repos/draftsRepo";
import * as evidenceRepo from "../../shared/db/repos/evidenceRepo";
import * as modeRepo from "../../shared/db/repos/modeRepo";
import * as runsRepo from "../../shared/db/repos/runsRepo";
import type { DraftRecord, EvalSummary } from "../../shared/schemas/run";
import { autoApproveRun, eligible, reasonsFor } from "./yoloPolicy";

const testEnv = env as Env;
const NOW = "2026-09-01T16:00:00.000Z";

let runSeq = 0xd00;
function newRunId(): string {
  runSeq += 1;
  return `run-20260901-${runSeq.toString(16).padStart(4, "0")}`;
}

const OK_EVAL: EvalSummary = {
  status: "ok",
  basis: "Tier-1 citation holds.",
  citationCompleteness: 90,
  disagreement: { flagged: false, description: null },
  ineligible: []
};

function draft(overrides: Partial<DraftRecord> = {}): DraftRecord {
  return {
    id: "d-eligible",
    runId: "run-20260901-0000",
    targetEntityType: "states",
    targetEntityId: "st-nv",
    diff: { operationalStatus: { from: "go", to: "restricted" } },
    body: "Eligible operationalStatus update.",
    tier2Only: false,
    confidence: 80,
    evalSummary: OK_EVAL,
    outcome: null,
    decidedAt: null,
    decidedBy: null,
    editedBody: null,
    rejectReason: null,
    parentDraftId: null,
    revisionIndex: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides
  };
}

async function restoreNv() {
  await testEnv.DB.prepare(
    `UPDATE states
        SET operational_status = 'banned', provenance_kind = 'human',
            published_at = '2026-08-09T16:00:00.000Z',
            updated_at = '2026-08-09T16:00:00.000Z'
      WHERE id = 'st-nv'`
  ).run();
}

async function restoreMode() {
  await testEnv.DB.prepare(
    `UPDATE approval_mode
        SET mode = 'hitl', threshold = 70, version = 1,
            updated_at = '2026-09-13T00:00:00.000Z'
      WHERE id = 'current'`
  ).run();
  await testEnv.DB.prepare("DELETE FROM mode_audit").run();
  await restoreNv();
}

beforeEach(async () => {
  await restoreMode();
});
afterEach(async () => {
  await restoreMode();
});

describe("yoloPolicy statePatch blockers (story 3.21)", () => {
  const record = {
    caseId: "case-ri-furcolo",
    occurredAt: "2026-09-15",
    description: "ORDER granting Motion for Preliminary Injunction.",
    sourceUrl: "https://www.courtlistener.com/docket/73375343/x/?entry=12",
    entryNumber: 12
  };
  const docket = (statePatch: unknown) =>
    draft({
      targetEntityType: "docket_events",
      targetEntityId: "de-case-ri-furcolo-501",
      diff: {
        ...record,
        inference: {
          kind: "pi-granted",
          favors: "platform",
          confidence: 0.9,
          basis: "granting"
        },
        statePatch
      }
    });

  it("escalates a derived posture change as posture_flip", () => {
    const flip = docket({ posture: { from: "pending", to: "platform" } });
    expect(eligible(flip, 70)).toBe(false);
    expect(reasonsFor(flip, 70)).toEqual(["posture_flip"]);
  });

  it("escalates a derived lifecycle change as lifecycle_change", () => {
    const resolves = docket({
      lifecycle: { from: "active", to: "resolved" },
      decidedAt: { from: null, to: "2026-09-15" }
    });
    expect(eligible(resolves, 70)).toBe(false);
    expect(reasonsFor(resolves, 70)).toEqual(["lifecycle_change"]);
    const both = docket({
      lifecycle: { from: "active", to: "resolved" },
      posture: { from: "pending", to: "state" }
    });
    expect(reasonsFor(both, 70)).toEqual(["posture_flip", "lifecycle_change"]);
  });

  it("escalates a decidedAt-only patch as lifecycle_change", () => {
    const dated = docket({ decidedAt: { from: null, to: "2026-09-15" } });
    expect(eligible(dated, 70)).toBe(false);
    expect(reasonsFor(dated, 70)).toEqual(["lifecycle_change"]);
  });

  it("admits a record-only docket Draft under the existing rules", () => {
    expect(eligible(docket({}), 70)).toBe(true);
    expect(eligible(docket(undefined), 70)).toBe(true);
    expect(eligible({ ...docket({}), confidence: 60 }, 70)).toBe(false);
    expect(
      eligible(
        {
          ...docket({}),
          evalSummary: { ...OK_EVAL, ineligible: ["lifecycle_change"] }
        },
        70
      )
    ).toBe(false);
  });
});

describe("yoloPolicy eligible (story 3.13)", () => {
  it("admits a low-risk Draft at or above the live threshold", () => {
    expect(eligible(draft(), 70)).toBe(true);
    expect(eligible(draft({ confidence: 70 }), 70)).toBe(true);
    expect(reasonsFor(draft(), 70)).toEqual([]);
  });

  it("escalates posture flips, party characterizations, and baked FR-17 fails", () => {
    expect(
      eligible(
        draft({
          diff: { posture: { from: "untracked", to: "pending" } }
        }),
        70
      )
    ).toBe(false);
    expect(
      reasonsFor(
        draft({
          diff: { posture: { from: "untracked", to: "pending" } }
        }),
        70
      )
    ).toContain("posture_flip");
    expect(
      eligible(
        draft({ targetEntityType: "entities", targetEntityId: "kalshi" }),
        70
      )
    ).toBe(false);
    expect(
      reasonsFor(
        draft({ targetEntityType: "entities", targetEntityId: "kalshi" }),
        70
      )
    ).toContain("party_characterization");
    expect(eligible(draft({ tier2Only: true }), 70)).toBe(false);
    expect(eligible(draft({ confidence: 69 }), 70)).toBe(false);
    expect(
      eligible(
        draft({
          evalSummary: {
            ...OK_EVAL,
            status: "eval_fail",
            ineligible: ["eval_fail"]
          }
        }),
        70
      )
    ).toBe(false);
    expect(eligible(draft({ evalSummary: null, confidence: 80 }), 70)).toBe(
      false
    );
    expect(
      eligible(
        draft({
          evalSummary: {
            ...OK_EVAL,
            ineligible: ["guardrail_fail"]
          }
        }),
        70
      )
    ).toBe(false);
  });
});

describe("autoApproveRun (story 3.13)", () => {
  async function seedYoloRun() {
    const id = newRunId();
    await runsRepo.insertRun(testEnv.DB, {
      id,
      origin: "scheduled",
      mode: "yolo",
      status: "awaiting",
      startedAt: NOW,
      completedAt: NOW,
      spendCents: 0,
      spendCurrency: "USD",
      budgetCents: null,
      scheduledFor: "2026-09-01"
    });
    return id;
  }

  async function seedDraft(
    runId: string,
    id: string,
    overrides: Partial<DraftRecord> = {}
  ) {
    const row = draft({ id, runId, ...overrides });
    await draftsRepo.insertDraft(testEnv.DB, {
      id: row.id,
      runId,
      targetEntityType: row.targetEntityType,
      targetEntityId: row.targetEntityId,
      diff: row.diff,
      body: row.body,
      tier2Only: row.tier2Only,
      confidence: row.confidence,
      evalSummary: row.evalSummary,
      createdAt: row.createdAt
    });
  }

  it("auto-approves an eligible Draft as agent and writes yolo.validated plus gate.decided", async () => {
    const runId = await seedYoloRun();
    const draftId = `d:${runId}:auto-ok`;
    await seedDraft(runId, draftId);
    const pending = await draftsRepo.listByRun(testEnv.DB, runId);
    expect(pending).toHaveLength(1);
    expect(eligible(pending[0]!, 70)).toBe(true);
    await autoApproveRun(testEnv.DB, runId);

    const row = await draftsRepo.getById(testEnv.DB, draftId);
    expect(row?.outcome).toBe("approved");
    expect(row?.decidedBy).toBe("approval-agent");
    const nv = await testEnv.DB.prepare(
      "SELECT provenance_kind FROM states WHERE id = 'st-nv'"
    ).first<{ provenance_kind: string }>();
    expect(nv?.provenance_kind).toBe("agent");

    const events = await evidenceRepo.listByRun(testEnv.DB, runId);
    const validated = events.find((e) => e.event === "yolo.validated");
    expect(validated?.payload).toMatchObject({
      verdict: "approve",
      draftId,
      confidence: 80,
      threshold: 70,
      reasons: []
    });
    expect(events.some((e) => e.event === "gate.decided")).toBe(true);
    expect((await runsRepo.getRunById(testEnv.DB, runId))?.status).toBe(
      "published"
    );
  });

  it("leaves a posture-flip Draft pending with an escalate validation", async () => {
    const runId = await seedYoloRun();
    await seedDraft(runId, "d-auto-flip", {
      diff: { posture: { from: "untracked", to: "pending" } }
    });
    await autoApproveRun(testEnv.DB, runId);

    const row = await draftsRepo.getById(testEnv.DB, "d-auto-flip");
    expect(row?.outcome).toBeNull();
    const validated = (await evidenceRepo.listByRun(testEnv.DB, runId)).find(
      (e) => e.event === "yolo.validated"
    );
    expect(validated?.payload).toMatchObject({
      verdict: "escalate",
      draftId: "d-auto-flip",
      reasons: ["posture_flip"]
    });
    expect((await runsRepo.getRunById(testEnv.DB, runId))?.status).toBe(
      "awaiting"
    );
  });

  it("leaves an entities-target Draft pending as party_characterization", async () => {
    const runId = await seedYoloRun();
    await seedDraft(runId, "d-auto-party", {
      targetEntityType: "entities",
      targetEntityId: "kalshi",
      diff: { role: { from: "exchange", to: "defendant" } }
    });
    await autoApproveRun(testEnv.DB, runId);

    expect(
      (await draftsRepo.getById(testEnv.DB, "d-auto-party"))?.outcome
    ).toBeNull();
    const validated = (await evidenceRepo.listByRun(testEnv.DB, runId)).find(
      (e) => e.event === "yolo.validated"
    );
    expect(validated?.payload).toMatchObject({
      verdict: "escalate",
      draftId: "d-auto-party",
      reasons: ["party_characterization"]
    });
  });

  it("auto-approves the eligible sibling and leaves the escalate in queue", async () => {
    const runId = await seedYoloRun();
    await seedDraft(runId, "d-mix-ok", {
      createdAt: "2026-09-01T16:00:00.000Z"
    });
    await seedDraft(runId, "d-mix-flip", {
      diff: { posture: { from: "untracked", to: "pending" } },
      createdAt: "2026-09-01T16:01:00.000Z"
    });
    await autoApproveRun(testEnv.DB, runId);

    expect((await draftsRepo.getById(testEnv.DB, "d-mix-ok"))?.outcome).toBe(
      "approved"
    );
    expect(
      (await draftsRepo.getById(testEnv.DB, "d-mix-flip"))?.outcome
    ).toBeNull();
    expect((await runsRepo.getRunById(testEnv.DB, runId))?.status).toBe(
      "awaiting"
    );
  });

  it("leaves a Draft below the live threshold pending with below_threshold", async () => {
    await modeRepo.set(testEnv.DB, {
      threshold: 90,
      actor: "Patrick",
      now: NOW
    });
    const runId = await seedYoloRun();
    await seedDraft(runId, "d-below-live", { confidence: 80 });
    await autoApproveRun(testEnv.DB, runId);

    expect(
      (await draftsRepo.getById(testEnv.DB, "d-below-live"))?.outcome
    ).toBeNull();
    const validated = (await evidenceRepo.listByRun(testEnv.DB, runId)).find(
      (e) => e.event === "yolo.validated"
    );
    expect(validated?.payload).toMatchObject({
      verdict: "escalate",
      draftId: "d-below-live",
      confidence: 80,
      threshold: 90
    });
    expect(
      (validated?.payload as { reasons?: string[] } | undefined)?.reasons
    ).toContain("below_threshold");
  });

  it("backfills yolo.validated when decide is already_decided for an agent approval", async () => {
    const runId = await seedYoloRun();
    const draftId = `d:${runId}:retry-ok`;
    await seedDraft(runId, draftId);
    await autoApproveRun(testEnv.DB, runId);
    await testEnv.DB.prepare(
      "DELETE FROM evidence_events WHERE run_id = ? AND event = 'yolo.validated'"
    )
      .bind(runId)
      .run();

    await autoApproveRun(testEnv.DB, runId);

    const validated = (await evidenceRepo.listByRun(testEnv.DB, runId)).find(
      (e) =>
        e.event === "yolo.validated" &&
        (e.payload as { draftId?: string } | null)?.draftId === draftId
    );
    expect(validated?.payload).toMatchObject({
      verdict: "approve",
      draftId,
      confidence: 80,
      threshold: 70,
      reasons: []
    });
  });

  it("never auto-approves a HITL Run even when the Draft would pass", async () => {
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
      budgetCents: null,
      scheduledFor: "2026-09-01"
    });
    await seedDraft(id, "d-hitl-ok");
    await autoApproveRun(testEnv.DB, id);
    expect(
      (await draftsRepo.getById(testEnv.DB, "d-hitl-ok"))?.outcome
    ).toBeNull();
    expect(
      (await evidenceRepo.listByRun(testEnv.DB, id)).some(
        (e) => e.event === "yolo.validated"
      )
    ).toBe(false);
  });
});

describe("autoApproveRun docket_events (story 3.21)", () => {
  const CASE_ID = "case-ri-furcolo";
  let entrySeq = 7000;

  async function seedYoloRun() {
    const id = newRunId();
    await runsRepo.insertRun(testEnv.DB, {
      id,
      origin: "scheduled",
      mode: "yolo",
      status: "awaiting",
      startedAt: NOW,
      completedAt: NOW,
      spendCents: 0,
      spendCurrency: "USD",
      budgetCents: null,
      scheduledFor: "2026-09-01"
    });
    return id;
  }

  async function seedDocketDraft(
    runId: string,
    inferenceConfidence: number,
    reviewerDisagrees = false
  ) {
    const entryId = entrySeq++;
    const targetEntityId = `de-${CASE_ID}-${entryId}`;
    const id = `d:${runId}:CourtListener:docket_events:${targetEntityId}`;
    await draftsRepo.insertDraft(testEnv.DB, {
      id,
      runId,
      targetEntityType: "docket_events",
      targetEntityId,
      diff: {
        caseId: CASE_ID,
        occurredAt: "2026-09-15",
        description: `NOTICE of Appearance (${entryId}).`,
        sourceUrl: `https://www.courtlistener.com/docket/73375343/x/?entry=${entryId}`,
        entryNumber: entryId,
        entryId,
        docketId: "73375343",
        context: { caption: "KalshiEX LLC v. Furcolo" },
        inference: {
          kind: "appearance",
          favors: "none",
          confidence: inferenceConfidence,
          basis: "NOTICE of Appearance"
        },
        statePatch: {}
      },
      body: `Record body ${entryId}.`,
      tier2Only: false,
      confidence: 90,
      evalSummary: {
        ...OK_EVAL,
        disagreement: reviewerDisagrees
          ? { flagged: true, description: "Reviewer reads this as a brief." }
          : { flagged: false, description: null }
      },
      createdAt: NOW
    });
    return { id, targetEntityId };
  }

  async function eventRow(id: string) {
    return testEnv.DB.prepare(
      "SELECT kind, favors, provenance_kind FROM docket_events WHERE id = ?"
    )
      .bind(id)
      .first<{
        kind: string | null;
        favors: string | null;
        provenance_kind: string;
      }>();
  }

  it("auto-approves a confident record-only docket Draft with the inference accepted, as agent", async () => {
    const runId = await seedYoloRun();
    const { id, targetEntityId } = await seedDocketDraft(runId, 0.9);
    await autoApproveRun(testEnv.DB, runId);

    expect((await draftsRepo.getById(testEnv.DB, id))?.outcome).toBe(
      "approved"
    );
    expect(await eventRow(targetEntityId)).toEqual({
      kind: "appearance",
      favors: "none",
      provenance_kind: "agent"
    });
    const events = await evidenceRepo.listByRun(testEnv.DB, runId);
    expect(
      events.find((e) => e.event === "yolo.validated")?.payload
    ).toMatchObject({ verdict: "approve", draftId: id });
    expect(
      events.find((e) => e.event === "gate.decided")?.payload
    ).toMatchObject({
      outcome: "approved",
      acceptedFields: ["kind", "favors"],
      strippedFields: []
    });
  });

  it.each([
    ["drafter confidence below the threshold", 0.6, false],
    ["reviewer disagreement", 0.9, true]
  ])(
    "publishes the record alone on %s",
    async (_name, confidence, disagrees) => {
      const runId = await seedYoloRun();
      const { id, targetEntityId } = await seedDocketDraft(
        runId,
        confidence,
        disagrees
      );
      await autoApproveRun(testEnv.DB, runId);
      expect((await draftsRepo.getById(testEnv.DB, id))?.outcome).toBe(
        "approved"
      );
      expect(await eventRow(targetEntityId)).toEqual({
        kind: null,
        favors: null,
        provenance_kind: "agent"
      });
      expect(
        (await evidenceRepo.listByRun(testEnv.DB, runId)).find(
          (e) => e.event === "gate.decided"
        )?.payload
      ).toMatchObject({
        acceptedFields: [],
        strippedFields: ["kind", "favors"]
      });
    }
  );
});
