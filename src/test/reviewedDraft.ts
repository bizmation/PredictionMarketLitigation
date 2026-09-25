import type { Db } from "../shared/db/client";
import * as draftsRepo from "../shared/db/repos/draftsRepo";
import { append } from "../pipeline/projector/evidence";
import { evidenceId } from "../pipeline/connectors/connector";

/** Explicit fixture evidence for a completed review, never used by production. */
export async function recordReviewCompletion(
  db: Db,
  id: string
): Promise<void> {
  const draft = await draftsRepo.getById(db, id);
  if (draft?.evalSummary == null) return;
  const events = [
    "draft.evaluated",
    "guardrails.passed",
    ...(draft.revisionIndex > 0 ? ["draft.revised"] : [])
  ] as const;
  for (const event of events) {
    await append(db, {
      id: evidenceId(draft.runId, event, id),
      runId: draft.runId,
      event: event as "draft.evaluated" | "guardrails.passed" | "draft.revised",
      payload: { draftId: id },
      createdAt: draft.updatedAt
    });
  }
}

export async function insertReviewedDraft(
  db: Db,
  input: Parameters<typeof draftsRepo.insertDraft>[1]
) {
  await draftsRepo.insertDraft(db, input);
  await recordReviewCompletion(db, input.id);
  return draftsRepo.getById(db, input.id);
}
