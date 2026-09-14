import { z } from "zod";

import type { Db } from "../../shared/db/client";
import * as draftsRepo from "../../shared/db/repos/draftsRepo";
import * as runsRepo from "../../shared/db/repos/runsRepo";
import { IsoUtcSchema } from "../../shared/schemas/common";
import { type DraftRecord } from "../../shared/schemas/run";
import { ProvenanceKindSchema } from "../../shared/schemas/vocabulary";
import { appendStmt } from "../projector/evidence";
import { applyF1Stmt } from "./f1Apply";

/**
 * Story 3.10/3.11 — the Approval Gate's decision module. The ONLY writer of
 * gate decisions and of live F1 mutations: one atomic `db.batch` of the Draft
 * UPDATE, the F1 apply (approve/edit only), `gate.decided`, and — when no
 * sibling Draft remains pending — the awaiting→published|rejected Run
 * terminal plus `run.completed`. Retry is `already_decided` / 409 and must
 * not apply F1 a second time.
 *
 * `decidedBy` is the verified operator's public-safe `displayName` (never the
 * email — access.ts types that as never safe to render), because the
 * `gate.decided` payload is public Evidence. Approve provenance is the
 * caller's: admin omits `provenanceKind` (defaults `human`); the YOLO path
 * passes `agent`. Mixed Runs label the caller, not the Run's stamped mode.
 */

export const DECISION_ACTION_VALUES = ["approve", "edit", "reject"] as const;

const DecisionActionSchema = z.enum(DECISION_ACTION_VALUES);
export type DecisionAction = z.infer<typeof DecisionActionSchema>;

const OperatorSchema = z.object({ displayName: z.string().min(1) }).strict();

const DecideInputSchema = z
  .discriminatedUnion("action", [
    z
      .object({
        draftId: z.string().min(1),
        operator: OperatorSchema,
        now: IsoUtcSchema,
        action: z.literal("approve"),
        provenanceKind: ProvenanceKindSchema.optional()
      })
      .strict(),
    z
      .object({
        draftId: z.string().min(1),
        operator: OperatorSchema,
        now: IsoUtcSchema,
        action: z.literal("edit"),
        editedBody: z.string().trim().min(1)
      })
      .strict(),
    z
      .object({
        draftId: z.string().min(1),
        operator: OperatorSchema,
        now: IsoUtcSchema,
        action: z.literal("reject"),
        rejectReason: z.string().trim().min(1).nullable(),
        rejectReasonPrivate: z.string().trim().min(1).nullable()
      })
      .strict()
  ])
  .refine(
    (input) =>
      input.action !== "reject" ||
      input.rejectReason != null ||
      input.rejectReasonPrivate != null,
    { message: "a rejection requires a reason" }
  );

export type DecideInput = {
  draftId: string;
  action: DecisionAction;
  operator: { displayName: string };
  editedBody?: string;
  /** The PUBLIC portion — rides the wire and the `gate.decided` payload. */
  rejectReason?: string | null;
  /** The PRIVATE portion — bound to its column, never mapped back out. */
  rejectReasonPrivate?: string | null;
  now: string;
  /** Approve only. Admin omits it (defaults `human`); YOLO passes `agent`. */
  provenanceKind?: "human" | "agent";
};

export type DecideResult =
  | { status: "not_found" }
  | { status: "already_decided" }
  | { status: "invalid" }
  | { status: "decided"; record: DraftRecord };

export async function decide(
  db: Db,
  input: DecideInput
): Promise<DecideResult> {
  const parsed = DecideInputSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };

  const { draftId, action, operator, now } = parsed.data;
  const existing = await draftsRepo.getById(db, draftId);
  if (!existing) return { status: "not_found" };
  if (existing.outcome != null) return { status: "already_decided" };

  const run = await runsRepo.getRunById(db, existing.runId);
  if (!run) return { status: "invalid" };

  const outcome =
    action === "approve"
      ? "approved"
      : action === "edit"
        ? "edited"
        : "rejected";
  const editedBody =
    action === "edit" ? parsed.data.editedBody : existing.editedBody;
  const publicReason =
    action === "reject" ? (parsed.data.rejectReason ?? null) : null;
  const privateReason =
    action === "reject" ? (parsed.data.rejectReasonPrivate ?? null) : null;
  const provenanceKind =
    action === "approve" ? (parsed.data.provenanceKind ?? "human") : "human";

  const statements: D1PreparedStatement[] = [];
  let draftStmtIndex = 0;

  if (action !== "reject") {
    try {
      statements.push(
        await applyF1Stmt(db, {
          draftId,
          targetEntityType: existing.targetEntityType,
          targetEntityId: existing.targetEntityId,
          diff: existing.diff,
          provenanceKind,
          now,
          approver: operator.displayName
        })
      );
      draftStmtIndex = 1;
    } catch {
      return { status: "invalid" };
    }
  }

  let update: D1PreparedStatement;
  try {
    update = await draftsRepo.applyDecisionStmt(db, {
      id: draftId,
      outcome,
      decidedAt: now,
      decidedBy: operator.displayName,
      editedBody,
      rejectReason: publicReason,
      rejectReasonPrivate: privateReason,
      updatedAt: now
    });
  } catch {
    return { status: "invalid" };
  }

  statements.push(update);
  statements.push(
    appendStmt(db, {
      id: `gate-decided-${draftId}`,
      runId: existing.runId,
      event: "gate.decided",
      payload: {
        draftId,
        outcome,
        decidedBy: operator.displayName,
        reason: publicReason
      },
      createdAt: now
    })
  );

  const siblings = await draftsRepo.listByRun(db, existing.runId);
  const otherPending = siblings.some(
    (draft) => draft.id !== draftId && draft.outcome == null
  );
  if (!otherPending && run.status === "awaiting") {
    const published =
      action !== "reject" ||
      siblings.some(
        (draft) => draft.outcome === "approved" || draft.outcome === "edited"
      );
    const terminal = published ? "published" : "rejected";
    statements.push(
      runsRepo.terminalAwaitingRunStmt(db, existing.runId, terminal, now)
    );
    statements.push(
      appendStmt(db, {
        id: `run-completed-${existing.runId}`,
        runId: existing.runId,
        event: "run.completed",
        payload: { status: terminal },
        createdAt: now
      })
    );
  }

  try {
    const results = await db.batch(statements);
    if (results[draftStmtIndex]?.meta.changes === 0) {
      return { status: "already_decided" };
    }
  } catch {
    return { status: "invalid" };
  }

  const record = await draftsRepo.getById(db, draftId);
  if (!record) return { status: "not_found" };
  return { status: "decided", record };
}
