import { z } from "zod";

import type { Db } from "../../shared/db/client";
import * as draftsRepo from "../../shared/db/repos/draftsRepo";
import { IsoUtcSchema } from "../../shared/schemas/common";
import { type DraftRecord } from "../../shared/schemas/run";
import { appendStmt } from "../projector/evidence";

/**
 * Story 3.10 — the Approval Gate's decision module. The ONLY writer of gate
 * decisions: one atomic `db.batch` of the Draft UPDATE plus the projector's
 * `gate.decided` Evidence append. Nothing here touches F1 tables, Run status,
 * or `run.completed` — publish is 3.11's extension point on this module.
 *
 * `decidedBy` is the verified operator's public-safe `displayName` (never the
 * email — access.ts types that as never safe to render), because the
 * `gate.decided` payload is public Evidence.
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
        action: z.literal("approve")
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

  await db.batch([
    update,
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
  ]);

  const record = await draftsRepo.getById(db, draftId);
  if (!record) return { status: "not_found" };
  return { status: "decided", record };
}
