import { z } from "zod";

import type { Db } from "../../shared/db/client";
import * as draftsRepo from "../../shared/db/repos/draftsRepo";
import * as evidenceRepo from "../../shared/db/repos/evidenceRepo";
import * as runsRepo from "../../shared/db/repos/runsRepo";
import { IsoUtcSchema } from "../../shared/schemas/common";
import { type DraftRecord, type EvidenceEvent } from "../../shared/schemas/run";
import { ProvenanceKindSchema } from "../../shared/schemas/vocabulary";
import { appendStmt } from "../projector/evidence";
import { applyF1Stmts, DOCKET_EVENTS_TARGET } from "./f1Apply";

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
 *
 * Story 3.21 — approve/edit carry optional `acceptedFields` for a
 * `docket_events` Draft (the inference and derived `statePatch` fields the
 * operator kept; default all). `gate.decided` records `acceptedFields` /
 * `strippedFields` so the override is public.
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
        provenanceKind: ProvenanceKindSchema.optional(),
        acceptedFields: z.array(z.string().min(1)).optional()
      })
      .strict(),
    z
      .object({
        draftId: z.string().min(1),
        operator: OperatorSchema,
        now: IsoUtcSchema,
        action: z.literal("edit"),
        editedBody: z.string().trim().min(1),
        acceptedFields: z.array(z.string().min(1)).optional()
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
  /** Approve/edit only (3.21). Omitted → every acceptable field is accepted. */
  acceptedFields?: string[];
};

export type DecideResult =
  | { status: "not_found" }
  | { status: "already_decided" }
  | { status: "not_ready" }
  | { status: "invalid" }
  | { status: "decided"; record: DraftRecord };

function turnIdForRevision(
  draftId: string,
  revisionIndex: number,
  events: EvidenceEvent[]
): string | null {
  if (revisionIndex === 0) return null;
  for (const event of events) {
    if (event.event !== "steering.applied" && event.event !== "draft.revised") {
      continue;
    }
    if (
      event.payload == null ||
      typeof event.payload !== "object" ||
      Array.isArray(event.payload)
    ) {
      continue;
    }
    const payload = event.payload as {
      effect?: unknown;
      draftId?: unknown;
      turnId?: unknown;
    };
    if (payload.draftId !== draftId || typeof payload.turnId !== "string") {
      continue;
    }
    if (event.event === "draft.revised" || payload.effect === "revised") {
      return payload.turnId;
    }
  }
  return null;
}

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

  const siblings = await draftsRepo.listByRun(db, existing.runId);
  if (!draftsRepo.isPendingReadyTip(existing, siblings)) {
    return { status: "not_ready" };
  }

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
  let acceptedFields: string[] = [];
  let strippedFields: string[] = [];

  if (action !== "reject") {
    try {
      const applied = await applyF1Stmts(db, {
        draftId,
        targetEntityType: existing.targetEntityType,
        targetEntityId: existing.targetEntityId,
        diff: existing.diff,
        provenanceKind,
        now,
        approver: operator.displayName,
        acceptedFields: parsed.data.acceptedFields
      });
      statements.push(...applied.statements);
      acceptedFields = applied.acceptedFields;
      strippedFields = applied.strippedFields;
    } catch {
      return { status: "invalid" };
    }
  }
  // The Draft UPDATE follows every F1 statement; its `meta.changes` is the
  // retry guard (`already_decided` when a replay finds the row decided).
  const draftStmtIndex = statements.length;

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

  const events = await evidenceRepo.listByRun(db, existing.runId);
  const lineage = draftsRepo.lineageFromRoot(existing, siblings).map((row) => ({
    draftId: row.id,
    revisionIndex: row.revisionIndex,
    turnId: turnIdForRevision(row.id, row.revisionIndex, events)
  }));
  const approvedText =
    action === "edit" ? (editedBody ?? existing.body) : existing.body;

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
        reason: publicReason,
        lineage,
        approvedText,
        // 3.21 — the per-field override is public only where one exists;
        // 3.10's update-target payloads keep their pinned shape.
        ...(existing.targetEntityType === DOCKET_EVENTS_TARGET
          ? { acceptedFields, strippedFields }
          : {})
      },
      createdAt: now
    })
  );

  const otherPending = draftsRepo
    .pendingTips(siblings)
    .some((draft) => draft.id !== draftId);
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
