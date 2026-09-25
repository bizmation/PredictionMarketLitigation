import { insertReviewedDraft } from "../../test/reviewedDraft";
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";

import * as draftsRepo from "../../shared/db/repos/draftsRepo";
import * as evidenceRepo from "../../shared/db/repos/evidenceRepo";
import * as runsRepo from "../../shared/db/repos/runsRepo";
import type { EvalSummary } from "../../shared/schemas/run";
import { decide } from "./approval";
import { applyF1Stmts, UnpublishableError } from "./f1Apply";

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
  await insertReviewedDraft(testEnv.DB, {
    id,
    runId,
    targetEntityType: "states",
    targetEntityId: "st-nv",
    diff: { posture: { from: "banned", to: "pending" } },
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
    expect(result.status).toBe("not_ready");
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
    expect(result.status).toBe("not_ready");
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

/**
 * Story 3.21 — the `docket_events` insert target: sources → docket_events →
 * cases in one batch, per-field accept/strip, retry guard.
 */
describe("decide docket_events insert target (story 3.21)", () => {
  const CASE_ID = "case-ri-furcolo";
  const INFERENCE = {
    kind: "pi-granted",
    favors: "platform",
    confidence: 0.9,
    basis: "ORDER granting Motion for Preliminary Injunction"
  };
  let entrySeq = 900;

  function record(entryId: number, extra: Record<string, unknown> = {}) {
    return {
      caseId: CASE_ID,
      occurredAt: "2026-09-15",
      description: `ORDER granting Motion for Preliminary Injunction (${entryId}).`,
      sourceUrl: `https://www.courtlistener.com/docket/73375343/kalshiex-llc-v-mark-furcolo/?entry=${entryId}`,
      entryNumber: entryId,
      entryId,
      docketId: "73375343",
      context: { caption: "KalshiEX LLC v. Furcolo" },
      ...extra
    };
  }

  async function insertDocketDraft(
    runId: string,
    diff: Record<string, unknown>,
    evalSummary: EvalSummary = EVAL_OK
  ) {
    const targetEntityId = `de-${CASE_ID}-${diff.entryId as number}`;
    const id = `d:${runId}:CourtListener:docket_events:${targetEntityId}`;
    await insertReviewedDraft(testEnv.DB, {
      id,
      runId,
      targetEntityType: "docket_events",
      targetEntityId,
      diff,
      body: `Record body for ${targetEntityId}.`,
      tier2Only: false,
      confidence: 80,
      evalSummary,
      createdAt: NOW
    });
    return { id, targetEntityId };
  }

  async function caseRow() {
    return (await testEnv.DB.prepare(
      `SELECT lifecycle, posture, decided_at, provenance_kind, published_at, updated_at
         FROM cases WHERE id = ?`
    )
      .bind(CASE_ID)
      .first<{
        lifecycle: string;
        posture: string;
        decided_at: string | null;
        provenance_kind: string;
        published_at: string;
        updated_at: string;
      }>())!;
  }

  async function eventRow(id: string) {
    return testEnv.DB.prepare(
      `SELECT case_id, occurred_at, description, source_id, kind, favors,
              provenance_kind, published_at, updated_at
         FROM docket_events WHERE id = ?`
    )
      .bind(id)
      .first<Record<string, unknown>>();
  }

  async function sourceRow(id: string) {
    return testEnv.DB.prepare(
      `SELECT owning_table, owning_id, url, title, tier, published_at
         FROM sources WHERE id = ?`
    )
      .bind(id)
      .first<Record<string, unknown>>();
  }

  afterEach(async () => {
    await testEnv.DB.prepare(
      `UPDATE cases
          SET lifecycle = 'active', posture = 'pending', decided_at = NULL,
              provenance_kind = 'human',
              published_at = '2026-08-09T16:00:00.000Z',
              updated_at = '2026-08-09T16:00:00.000Z'
        WHERE id = ?`
    )
      .bind(CASE_ID)
      .run();
  });

  it("publishes a record-only Draft: Tier-1 source then event, kind/favors null, case fields untouched, updated_at bumped", async () => {
    const runId = await insertRun();
    const entryId = entrySeq++;
    const { id, targetEntityId } = await insertDocketDraft(
      runId,
      record(entryId)
    );
    const before = await caseRow();

    const result = await decide(testEnv.DB, {
      draftId: id,
      action: "approve",
      operator: { displayName: ACTOR },
      now: NOW
    });
    expect(result.status).toBe("decided");

    expect(await sourceRow(`src-${targetEntityId}`)).toEqual({
      owning_table: "cases",
      owning_id: CASE_ID,
      url: `https://www.courtlistener.com/docket/73375343/kalshiex-llc-v-mark-furcolo/?entry=${entryId}`,
      title: `RECAP docket entry ${entryId} — KalshiEX LLC v. Furcolo`,
      tier: "tier1",
      published_at: "2026-09-15"
    });
    expect(await eventRow(targetEntityId)).toEqual({
      case_id: CASE_ID,
      occurred_at: "2026-09-15",
      description: `ORDER granting Motion for Preliminary Injunction (${entryId}).`,
      source_id: `src-${targetEntityId}`,
      kind: null,
      favors: null,
      provenance_kind: "human",
      published_at: NOW,
      updated_at: NOW
    });
    const after = await caseRow();
    expect(after).toEqual({ ...before, updated_at: NOW });

    const decided = (await evidenceRepo.listByRun(testEnv.DB, runId)).find(
      (event) => event.event === "gate.decided"
    );
    expect(decided?.payload).toMatchObject({
      draftId: id,
      outcome: "approved",
      acceptedFields: [],
      strippedFields: []
    });
    expect((await runsRepo.getRunById(testEnv.DB, runId))?.status).toBe(
      "published"
    );
  });

  it("applies every accepted field by default: kind/favors on the row and the derived posture on the case", async () => {
    const runId = await insertRun();
    const entryId = entrySeq++;
    const { id, targetEntityId } = await insertDocketDraft(
      runId,
      record(entryId, {
        inference: INFERENCE,
        statePatch: { posture: { from: "pending", to: "platform" } }
      })
    );
    const result = await decide(testEnv.DB, {
      draftId: id,
      action: "approve",
      operator: { displayName: ACTOR },
      now: NOW
    });
    expect(result.status).toBe("decided");
    expect(await eventRow(targetEntityId)).toMatchObject({
      kind: "pi-granted",
      favors: "platform"
    });
    expect(await caseRow()).toMatchObject({
      lifecycle: "active",
      posture: "platform",
      decided_at: null,
      provenance_kind: "human",
      published_at: NOW,
      updated_at: NOW
    });
    const decided = (await evidenceRepo.listByRun(testEnv.DB, runId)).find(
      (event) => event.event === "gate.decided"
    );
    expect(decided?.payload).toMatchObject({
      acceptedFields: ["kind", "favors", "posture"],
      strippedFields: []
    });
  });

  it("strips posture on request: the row keeps kind/favors, the case posture is unchanged, gate.decided lists the strip", async () => {
    const runId = await insertRun();
    const entryId = entrySeq++;
    const { id, targetEntityId } = await insertDocketDraft(
      runId,
      record(entryId, {
        inference: INFERENCE,
        statePatch: { posture: { from: "pending", to: "platform" } }
      })
    );
    const before = await caseRow();
    const result = await decide(testEnv.DB, {
      draftId: id,
      action: "approve",
      operator: { displayName: ACTOR },
      now: NOW,
      acceptedFields: ["kind", "favors"]
    });
    expect(result.status).toBe("decided");
    expect(await eventRow(targetEntityId)).toMatchObject({
      kind: "pi-granted",
      favors: "platform"
    });
    expect(await caseRow()).toEqual({ ...before, updated_at: NOW });
    const decided = (await evidenceRepo.listByRun(testEnv.DB, runId)).find(
      (event) => event.event === "gate.decided"
    );
    expect(decided?.payload).toMatchObject({
      acceptedFields: ["kind", "favors"],
      strippedFields: ["posture"]
    });
  });

  it("applies a dispositive patch in full and lets edit-then-approve carry acceptedFields too", async () => {
    const runId = await insertRun();
    const entryId = entrySeq++;
    const { id, targetEntityId } = await insertDocketDraft(
      runId,
      record(entryId, {
        inference: { ...INFERENCE, kind: "judgment" },
        statePatch: {
          lifecycle: { from: "active", to: "resolved" },
          posture: { from: "pending", to: "platform" },
          decidedAt: { from: null, to: "2026-09-15" }
        }
      })
    );
    const result = await decide(testEnv.DB, {
      draftId: id,
      action: "edit",
      editedBody: "Operator-edited summary.",
      operator: { displayName: ACTOR },
      now: NOW,
      acceptedFields: ["kind", "favors", "lifecycle", "decidedAt"]
    });
    expect(result.status).toBe("decided");
    expect(await eventRow(targetEntityId)).toMatchObject({
      kind: "judgment",
      favors: "platform"
    });
    expect(await caseRow()).toMatchObject({
      lifecycle: "resolved",
      posture: "pending",
      decided_at: "2026-09-15",
      provenance_kind: "human"
    });
    const decided = (await evidenceRepo.listByRun(testEnv.DB, runId)).find(
      (event) => event.event === "gate.decided"
    );
    expect(decided?.payload).toMatchObject({
      outcome: "edited",
      acceptedFields: ["kind", "favors", "lifecycle", "decidedAt"],
      strippedFields: ["posture"]
    });
  });

  it("publishes the record alone on acceptedFields: [] — kind/favors null, case untouched, every field listed as stripped", async () => {
    const runId = await insertRun();
    const entryId = entrySeq++;
    const { id, targetEntityId } = await insertDocketDraft(
      runId,
      record(entryId, {
        inference: INFERENCE,
        statePatch: { posture: { from: "pending", to: "platform" } }
      })
    );
    const before = await caseRow();
    const result = await decide(testEnv.DB, {
      draftId: id,
      action: "approve",
      operator: { displayName: ACTOR },
      now: NOW,
      acceptedFields: []
    });
    expect(result.status).toBe("decided");
    expect(await eventRow(targetEntityId)).toMatchObject({
      kind: null,
      favors: null
    });
    expect(await caseRow()).toEqual({ ...before, updated_at: NOW });
    const decided = (await evidenceRepo.listByRun(testEnv.DB, runId)).find(
      (event) => event.event === "gate.decided"
    );
    expect(decided?.payload).toMatchObject({
      acceptedFields: [],
      strippedFields: ["kind", "favors", "posture"]
    });
  });

  it("refuses a coupled half alone: favors without kind, decidedAt without lifecycle", async () => {
    const runId = await insertRun();
    const entryId = entrySeq++;
    const { id, targetEntityId } = await insertDocketDraft(
      runId,
      record(entryId, {
        inference: { ...INFERENCE, kind: "judgment" },
        statePatch: {
          lifecycle: { from: "active", to: "resolved" },
          posture: { from: "pending", to: "platform" },
          decidedAt: { from: null, to: "2026-09-15" }
        }
      })
    );
    const before = await f1Snapshot();
    for (const acceptedFields of [
      ["favors"],
      ["kind"],
      ["kind", "favors", "decidedAt"],
      ["lifecycle"]
    ]) {
      expect(
        (
          await decide(testEnv.DB, {
            draftId: id,
            action: "approve",
            operator: { displayName: ACTOR },
            now: NOW,
            acceptedFields
          })
        ).status
      ).toBe("invalid");
    }
    expect(await f1Snapshot()).toEqual(before);
    expect(await eventRow(targetEntityId)).toBeNull();
    expect((await draftsRepo.getById(testEnv.DB, id))?.outcome).toBeNull();
  });

  it("refuses a stale statePatch whose from no longer matches the live row", async () => {
    const runId = await insertRun();
    const entryId = entrySeq++;
    const { id, targetEntityId } = await insertDocketDraft(
      runId,
      record(entryId, {
        inference: INFERENCE,
        statePatch: { posture: { from: "pending", to: "platform" } }
      })
    );
    // A sibling publish moved the case since this Draft was reviewed.
    await testEnv.DB.prepare("UPDATE cases SET posture = 'state' WHERE id = ?")
      .bind(CASE_ID)
      .run();
    const before = await f1Snapshot();
    expect(
      (
        await decide(testEnv.DB, {
          draftId: id,
          action: "approve",
          operator: { displayName: ACTOR },
          now: NOW
        })
      ).status
    ).toBe("conflict");
    expect(await f1Snapshot()).toEqual(before);
    expect(await eventRow(targetEntityId)).toBeNull();
    // Stripping the stale field publishes the record without it.
    expect(
      (
        await decide(testEnv.DB, {
          draftId: id,
          action: "approve",
          operator: { displayName: ACTOR },
          now: NOW,
          acceptedFields: ["kind", "favors"]
        })
      ).status
    ).toBe("decided");
    expect(await eventRow(targetEntityId)).toMatchObject({
      kind: "pi-granted"
    });
    expect((await caseRow()).posture).toBe("state");
  });

  it("refuses acceptedFields on an update target instead of ignoring it", async () => {
    const runId = await insertRun();
    const id = `d:${runId}:nv-accepted`;
    await insertDraft(runId, id);
    const before = await f1Snapshot();
    expect(
      (
        await decide(testEnv.DB, {
          draftId: id,
          action: "approve",
          operator: { displayName: ACTOR },
          now: NOW,
          acceptedFields: ["posture"]
        })
      ).status
    ).toBe("invalid");
    expect(
      (
        await decide(testEnv.DB, {
          draftId: id,
          action: "approve",
          operator: { displayName: ACTOR },
          now: NOW,
          acceptedFields: []
        })
      ).status
    ).toBe("invalid");
    expect(await f1Snapshot()).toEqual(before);
    expect((await draftsRepo.getById(testEnv.DB, id))?.outcome).toBeNull();
    await expect(
      applyF1Stmts(testEnv.DB, {
        draftId: id,
        targetEntityType: "states",
        targetEntityId: "st-nv",
        diff: { posture: { from: "banned", to: "pending" } },
        provenanceKind: "human",
        now: NOW,
        approver: ACTOR,
        acceptedFields: []
      })
    ).rejects.toBeInstanceOf(UnpublishableError);
  });

  it("rejects an unknown accepted field, a malformed record, and a missing case without writing", async () => {
    const runId = await insertRun();
    const entryId = entrySeq++;
    const { id, targetEntityId } = await insertDocketDraft(
      runId,
      record(entryId, {
        inference: INFERENCE,
        statePatch: { posture: { from: "pending", to: "platform" } }
      })
    );
    const before = await f1Snapshot();
    expect(
      (
        await decide(testEnv.DB, {
          draftId: id,
          action: "approve",
          operator: { displayName: ACTOR },
          now: NOW,
          acceptedFields: ["caption"]
        })
      ).status
    ).toBe("invalid");
    expect(
      (
        await decide(testEnv.DB, {
          draftId: id,
          action: "approve",
          operator: { displayName: ACTOR },
          now: NOW,
          acceptedFields: ["lifecycle"]
        })
      ).status
    ).toBe("invalid");
    expect(await f1Snapshot()).toEqual(before);
    expect(await eventRow(targetEntityId)).toBeNull();
    expect((await draftsRepo.getById(testEnv.DB, id))?.outcome).toBeNull();

    const missing = await insertDocketDraft(runId, {
      ...record(entrySeq++),
      caseId: "case-does-not-exist"
    });
    expect(
      (
        await decide(testEnv.DB, {
          draftId: missing.id,
          action: "approve",
          operator: { displayName: ACTOR },
          now: NOW
        })
      ).status
    ).toBe("conflict");
    const malformed = await insertDocketDraft(runId, {
      ...record(entrySeq++),
      sourceUrl: "http://insecure.example/"
    });
    await expect(
      applyF1Stmts(testEnv.DB, {
        draftId: malformed.id,
        targetEntityType: "docket_events",
        targetEntityId: malformed.targetEntityId,
        diff:
          malformed.id &&
          (await draftsRepo.getById(testEnv.DB, malformed.id))!.diff,
        provenanceKind: "human",
        now: NOW,
        approver: ACTOR
      })
    ).rejects.toBeInstanceOf(UnpublishableError);
  });

  it("guards every insert on the Draft still being pending, so a replayed batch writes nothing", async () => {
    const runId = await insertRun();
    const entryId = entrySeq++;
    const { id, targetEntityId } = await insertDocketDraft(
      runId,
      record(entryId, {
        inference: INFERENCE,
        statePatch: { posture: { from: "pending", to: "platform" } }
      })
    );
    const applied = await applyF1Stmts(testEnv.DB, {
      draftId: id,
      targetEntityType: "docket_events",
      targetEntityId,
      diff: (await draftsRepo.getById(testEnv.DB, id))!.diff,
      provenanceKind: "human",
      now: NOW,
      approver: ACTOR
    });
    expect(applied.statements.length).toBe(5);
    // First decision lands; the second call is already_decided before any
    // statement runs. Replaying the prepared batch itself must also no-op.
    expect(
      (
        await decide(testEnv.DB, {
          draftId: id,
          action: "reject",
          operator: { displayName: ACTOR },
          now: NOW,
          rejectReason: "not today",
          rejectReasonPrivate: null
        })
      ).status
    ).toBe("decided");
    const before = await caseRow();
    const results = await testEnv.DB.batch(applied.statements);
    expect(results.map((r) => r.meta.changes)).toEqual([0, 0, 0, 0, 0]);
    expect(await eventRow(targetEntityId)).toBeNull();
    expect(await sourceRow(`src-${targetEntityId}`)).toBeNull();
    expect(await caseRow()).toEqual(before);
    expect(
      (
        await decide(testEnv.DB, {
          draftId: id,
          action: "approve",
          operator: { displayName: ACTOR },
          now: NOW
        })
      ).status
    ).toBe("already_decided");
  });
});
