import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import * as drafts from "./draftsRepo";
import * as runs from "./runsRepo";
import * as evidence from "./evidenceRepo";
import { appendStmt } from "../../../pipeline/projector/evidence";
import { enforceDraftGuardrails } from "../../../pipeline/ai/actionPolicy";
import { invokeTool } from "../../../pipeline/ai/gateway";
import { decide } from "../../../pipeline/gate/approval";
import { eligible } from "../../../pipeline/gate/yoloPolicy";
import { recordReviewCompletion } from "../../../test/reviewedDraft";
import type { EvalSummary } from "../../schemas/run";

const db = (env as Env).DB;
const now = "2026-09-24T12:00:00.000Z";
const summary: EvalSummary = {
  status: "ok",
  basis: "Verified",
  citationCompleteness: 100,
  disagreement: { flagged: false, description: null },
  ineligible: []
};
let seq = 0;
async function fixture(
  status: "running" | "awaiting" | "stopped" = "awaiting",
  evaluation: EvalSummary | null = summary
) {
  const runId = `run-20260924-${(++seq + 0xe000).toString(16)}`;
  await runs.insertRun(db, {
    id: runId,
    origin: "manual",
    mode: "hitl",
    status,
    startedAt: now,
    completedAt: status === "running" ? null : now,
    spendCents: 0,
    spendCurrency: "USD",
    budgetCents: 200,
    scheduledFor: null
  });
  const id = `${runId}:root`;
  await drafts.insertDraft(db, {
    id,
    runId,
    targetEntityType: "states",
    targetEntityId: "st-nv",
    diff: {
      posture: {
        from: (await db
          .prepare("SELECT posture FROM states WHERE id = 'st-nv'")
          .first<{ posture: string }>())!.posture,
        to: "pending"
      }
    },
    body: "Original",
    tier2Only: false,
    confidence: 90,
    evalSummary: evaluation,
    createdAt: now
  });
  return { id, runId };
}
async function reviewStatement(id: string, body = "Late replacement") {
  return drafts.applyDraftReviewStmt(db, {
    id,
    body,
    diff: {},
    confidence: 1,
    evalSummary: summary,
    updatedAt: now
  });
}
async function sealed(id: string) {
  return db.prepare("SELECT * FROM drafts WHERE id = ?").bind(id).first();
}

describe("persisted evaluation readiness and sealed drafts (3.28)", () => {
  it("requires summary, evaluation and guardrail receipts and a non-running Run", async () => {
    const { id, runId } = await fixture("running");
    await recordReviewCompletion(db, id);
    expect((await drafts.getById(db, id))?.readiness).toBe("pending");
    for (const action of ["approve", "edit", "reject"] as const) {
      expect(
        (
          await decide(db, {
            draftId: id,
            action,
            operator: { displayName: "Test" },
            now,
            ...(action === "edit"
              ? { editedBody: "Edited" }
              : action === "reject"
                ? { rejectReason: "No", rejectReasonPrivate: null }
                : {})
          })
        ).status
      ).toBe("not_ready");
    }
    expect((await sealed(id))?.outcome).toBeNull();
    expect(
      (await evidence.listByRun(db, runId)).some(
        (e) => e.event === "gate.decided"
      )
    ).toBe(false);
    await runs.completeRun(db, runId, "awaiting", now);
    expect((await drafts.getById(db, id))?.readiness).toBe("ready");
    await db
      .prepare(
        "DELETE FROM evidence_events WHERE run_id = ? AND event = 'guardrails.passed'"
      )
      .bind(runId)
      .run();
    expect((await drafts.getById(db, id))?.readiness).toBe("unavailable");
  });

  it("leaves legacy null and summary-only drafts unavailable without manufacturing evidence", async () => {
    for (const evaluation of [null, summary]) {
      const { id, runId } = await fixture("awaiting", evaluation);
      expect((await drafts.getById(db, id))?.readiness).toBe("unavailable");
      expect((await drafts.listPending(db)).some((d) => d.id === id)).toBe(
        true
      );
      expect(
        (
          await decide(db, {
            draftId: id,
            action: "reject",
            rejectReasonPrivate: null,
            rejectReason: "No",
            operator: { displayName: "Test" },
            now
          })
        ).status
      ).toBe("not_ready");
      await enforceDraftGuardrails(db, runId, { db, now: () => now });
      expect(await evidence.listByRun(db, runId)).toEqual([]);
    }
  });

  it("allows completed explicit not-run on a stopped Run for humans but excludes YOLO", async () => {
    const { id } = await fixture("stopped", {
      ...summary,
      status: "evals_not_run",
      basis: "Provider unavailable",
      ineligible: ["evals_not_run"]
    });
    await recordReviewCompletion(db, id);
    const draft = (await drafts.getById(db, id))!;
    expect(draft.readiness).toBe("ready");
    expect(eligible(draft, 70)).toBe(false);
    expect(
      (
        await decide(db, {
          draftId: id,
          action: "reject",
          rejectReasonPrivate: null,
          rejectReason: "Review complete",
          operator: { displayName: "Test" },
          now
        })
      ).status
    ).toBe("decided");
    const blank = await fixture("stopped", {
      ...summary,
      status: "evals_not_run",
      basis: "  "
    });
    await recordReviewCompletion(db, blank.id);
    expect((await drafts.getById(db, blank.id))?.readiness).toBe("unavailable");
  });

  it("shows the incomplete revision head and never offers its ready ancestor", async () => {
    const { id, runId } = await fixture();
    await recordReviewCompletion(db, id);
    const childId = `${id}:r1`;
    await drafts.insertDraft(db, {
      id: childId,
      runId,
      parentDraftId: id,
      revisionIndex: 1,
      targetEntityType: "states",
      targetEntityId: "st-nv",
      diff: {},
      body: "Child",
      tier2Only: false,
      confidence: 90,
      evalSummary: summary,
      createdAt: now
    });
    await recordReviewCompletion(db, childId);
    await db
      .prepare(
        "DELETE FROM evidence_events WHERE run_id = ? AND event = 'draft.revised'"
      )
      .bind(runId)
      .run();
    const children = (await drafts.listPending(db)).filter(
      (d) => d.runId === runId
    );
    expect(children.map((d) => d.id)).toEqual([childId]);
    expect(children[0]?.readiness).toBe("unavailable");
    expect(
      (await drafts.listPublicDrafts(db))
        .filter((d) => d.runId === runId)
        .map((d) => d.id)
    ).toEqual([childId]);
    for (const draftId of [id, childId])
      expect(
        (
          await decide(db, {
            draftId,
            action: "reject",
            rejectReasonPrivate: null,
            rejectReason: "No",
            operator: { displayName: "Test" },
            now
          })
        ).status
      ).toBe("not_ready");
  });

  it("prebuilt evaluator and guardrail statements cannot change decided rows or add completion evidence", async () => {
    const { id, runId } = await fixture("awaiting", null);
    const late = await reviewStatement(id);
    const receipt = appendStmt(
      db,
      {
        id: `${id}:late`,
        runId,
        event: "draft.evaluated",
        payload: { draftId: id, attempt: "late" },
        createdAt: now
      },
      { draftId: id, state: "unevaluated" }
    );
    await drafts.applyDraftReview(db, {
      id,
      body: "Winning text",
      diff: {},
      confidence: 90,
      evalSummary: summary,
      updatedAt: now
    });
    await recordReviewCompletion(db, id);
    const stamp = await drafts.applyGuardrailIneligibleStmt(db, {
      id,
      updatedAt: now
    });
    expect(
      (
        await decide(db, {
          draftId: id,
          action: "reject",
          rejectReasonPrivate: null,
          rejectReason: "Keep history",
          operator: { displayName: "Test" },
          now
        })
      ).status
    ).toBe("decided");
    const before = await sealed(id);
    const beforeEvidence = await evidence.listByRun(db, runId);
    await db.batch([receipt, late, stamp]);
    await enforceDraftGuardrails(db, runId, { db, now: () => now });
    await invokeTool(
      { db, now: () => now },
      { role: "reviewer", runId, draftId: id, tool: "publish_f1" }
    );
    expect(await sealed(id)).toEqual(before);
    expect(await evidence.listByRun(db, runId)).toEqual(beforeEvidence);
  });

  it("duplicate prepared evaluation results cannot replace a winner even before a decision", async () => {
    const { id, runId } = await fixture("awaiting", null);
    const loser = await reviewStatement(id);
    const receipt = appendStmt(
      db,
      {
        id: `${id}:loser`,
        runId,
        event: "draft.evaluated",
        payload: { draftId: id },
        createdAt: now
      },
      { draftId: id, state: "unevaluated" }
    );
    await drafts.applyDraftReview(db, {
      id,
      body: "Winner",
      diff: {},
      confidence: 90,
      evalSummary: summary,
      updatedAt: now
    });
    const before = await sealed(id);
    await db.batch([receipt, loser]);
    expect(await sealed(id)).toEqual(before);
    expect(await evidence.listByRun(db, runId)).toEqual([]);
  });
});

describe("readiness review regressions", () => {
  it("stamps guardrail failure against the original formatted summary string", async () => {
    const { id } = await fixture();
    const raw = JSON.stringify(
      {
        ineligible: [],
        disagreement: { description: null, flagged: false },
        citationCompleteness: 100,
        basis: "Verified",
        status: "ok"
      },
      null,
      2
    );
    await db
      .prepare("UPDATE drafts SET eval_summary_json = ? WHERE id = ?")
      .bind(raw, id)
      .run();
    const stamp = await drafts.applyGuardrailIneligibleStmt(db, {
      id,
      updatedAt: now
    });
    const result = await stamp.run();
    expect(result.meta.changes).toBe(1);
    expect((await drafts.getById(db, id))?.evalSummary).toEqual({
      ...summary,
      ineligible: ["guardrail_fail"]
    });
  });

  it("blocks every decision and persisted effect when only the evaluated receipt is missing", async () => {
    const { id, runId } = await fixture();
    await recordReviewCompletion(db, id);
    await db
      .prepare(
        "DELETE FROM evidence_events WHERE run_id = ? AND event = 'draft.evaluated'"
      )
      .bind(runId)
      .run();
    const snapshot = async () => ({
      draft: await sealed(id),
      run: await runs.getRunById(db, runId),
      receipts: await evidence.listByRun(db, runId),
      state: await db.prepare("SELECT * FROM states WHERE id = 'st-nv'").first()
    });
    const before = await snapshot();
    expect(before.receipts.map((e) => e.event)).toEqual(["guardrails.passed"]);
    for (const action of ["approve", "edit", "reject"] as const) {
      expect(
        (
          await decide(db, {
            draftId: id,
            action,
            operator: { displayName: "Test" },
            now,
            ...(action === "edit"
              ? { editedBody: "Do not publish" }
              : action === "reject"
                ? { rejectReason: "No", rejectReasonPrivate: null }
                : {})
          })
        ).status
      ).toBe("not_ready");
    }
    expect(await snapshot()).toEqual(before);
  });

  it.each(["approve", "edit"] as const)(
    "publishes completed not-run through %s on a stopped Run and freezes text and receipts",
    async (action) => {
      const { id, runId } = await fixture("stopped", {
        ...summary,
        status: "evals_not_run",
        basis: "Provider unavailable",
        ineligible: ["evals_not_run"]
      });
      await recordReviewCompletion(db, id);
      const beforeReceipts = await evidence.listByRun(db, runId);
      expect(
        (
          await decide(db, {
            draftId: id,
            action,
            operator: { displayName: "Human" },
            now,
            ...(action === "edit" ? { editedBody: "Human edited text" } : {})
          })
        ).status
      ).toBe("decided");
      expect((await runs.getRunById(db, runId))?.status).toBe("stopped");
      expect(
        await db
          .prepare("SELECT posture FROM states WHERE id = 'st-nv'")
          .first()
      ).toMatchObject({ posture: "pending" });
      const record = (await drafts.getById(db, id))!;
      expect(record.body).toBe("Original");
      expect(record.editedBody).toBe(
        action === "edit" ? "Human edited text" : null
      );
      const receipts = await evidence.listByRun(db, runId);
      expect(receipts.slice(0, beforeReceipts.length)).toEqual(beforeReceipts);
      expect(
        receipts.find((e) => e.event === "gate.decided")?.payload
      ).toMatchObject({
        approvedText: action === "edit" ? "Human edited text" : "Original",
        decidedBy: "Human"
      });
      await (await reviewStatement(id)).run();
      await invokeTool(
        { db, now: () => now },
        { role: "reviewer", runId, draftId: id, tool: "publish_f1" }
      );
      expect(await drafts.getById(db, id)).toEqual(record);
      expect(await evidence.listByRun(db, runId)).toEqual(receipts);
    }
  );
});
