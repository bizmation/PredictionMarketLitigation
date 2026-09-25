import type { DraftRecord } from "../schemas/run";

export type DraftReadiness = "pending" | "unavailable" | "ready";

/** Completion is derived only from persisted facts; missing legacy facts fail closed. */
export function deriveDraftReadiness(facts: {
  summary: DraftRecord["evalSummary"];
  revisionIndex: number;
  runStatus: string | null;
  evaluated: boolean;
  guardrails: boolean;
  revised: boolean;
}): DraftReadiness {
  if (facts.runStatus === "running") return "pending";
  if (
    facts.runStatus != null &&
    facts.summary != null &&
    (facts.summary.status !== "evals_not_run" ||
      facts.summary.basis.trim().length > 0) &&
    facts.evaluated &&
    facts.guardrails &&
    (facts.revisionIndex === 0 || facts.revised)
  )
    return "ready";
  return "unavailable";
}

export function isDraftReady(
  draft: Pick<DraftRecord, "readiness" | "evalSummary">
): boolean {
  return (
    draft.readiness === "ready" &&
    draft.evalSummary != null &&
    (draft.evalSummary.status !== "evals_not_run" ||
      draft.evalSummary.basis.trim().length > 0)
  );
}

export function draftReadinessLabel(
  draft: Pick<DraftRecord, "readiness" | "evalSummary">
): string {
  return isDraftReady(draft)
    ? "Awaiting review"
    : draft.readiness === "pending"
      ? "Evaluation in progress"
      : "Evaluation unavailable";
}
