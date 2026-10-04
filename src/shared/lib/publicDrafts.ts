import type { DraftRecord } from "../schemas/run";

const RUN_ID = /^run-\d{8}-[0-9a-f]{4}$/;
const OUTCOMES = new Set(["approved", "edited", "rejected"]);
const EVAL_STATUSES = new Set(["ok", "eval_fail", "evals_not_run"]);

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isConfidence(value: unknown): value is number {
  return isNonNegativeInt(value) && value <= 100;
}

function isEvalSummary(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (
    typeof row.status !== "string" ||
    !EVAL_STATUSES.has(row.status) ||
    typeof row.basis !== "string"
  ) {
    return false;
  }
  const disagreement = row.disagreement;
  return (
    disagreement !== null &&
    typeof disagreement === "object" &&
    typeof (disagreement as Record<string, unknown>).flagged === "boolean"
  );
}

export function isDraftRecord(value: unknown): value is DraftRecord {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    row.id.length > 0 &&
    typeof row.runId === "string" &&
    RUN_ID.test(row.runId) &&
    (row.targetEntityType === null ||
      typeof row.targetEntityType === "string") &&
    (row.targetEntityId === null || typeof row.targetEntityId === "string") &&
    typeof row.body === "string" &&
    row.body.length > 0 &&
    typeof row.tier2Only === "boolean" &&
    (row.confidence === null || isConfidence(row.confidence)) &&
    (row.evalSummary === null || isEvalSummary(row.evalSummary)) &&
    (row.readiness === undefined ||
      row.readiness === "ready" ||
      row.readiness === "pending" ||
      row.readiness === "unavailable") &&
    (row.outcome === null ||
      (typeof row.outcome === "string" && OUTCOMES.has(row.outcome))) &&
    (row.decidedAt === null || typeof row.decidedAt === "string") &&
    (row.decidedBy === null || typeof row.decidedBy === "string") &&
    (row.editedBody === null || typeof row.editedBody === "string") &&
    (row.rejectReason === null || typeof row.rejectReason === "string") &&
    (row.parentDraftId === null || typeof row.parentDraftId === "string") &&
    isNonNegativeInt(row.revisionIndex) &&
    typeof row.createdAt === "string" &&
    typeof row.updatedAt === "string" &&
    row.diff !== null &&
    typeof row.diff === "object" &&
    !Array.isArray(row.diff)
  );
}

/** The public feed owns revision-chain eligibility; readiness is not membership. */
export function selectPublicDrafts(drafts: DraftRecord[]) {
  return {
    pending: drafts.filter((draft) => draft.outcome === null),
    rejected: drafts.filter((draft) => draft.outcome === "rejected")
  };
}

export function parsePublicDrafts(body: unknown): DraftRecord[] {
  if (body === null || typeof body !== "object" || !("items" in body)) {
    throw new Error("Invalid public Draft feed");
  }
  const items: unknown = body.items;
  if (
    !Array.isArray(items) ||
    !items.every(isDraftRecord) ||
    new Set(items.map((draft) => draft.id)).size !== items.length
  ) {
    throw new Error("Invalid public Draft feed");
  }
  return items;
}
