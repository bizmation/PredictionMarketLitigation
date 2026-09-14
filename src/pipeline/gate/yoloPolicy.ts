import type { Db } from "../../shared/db/client";
import * as draftsRepo from "../../shared/db/repos/draftsRepo";
import * as evidenceRepo from "../../shared/db/repos/evidenceRepo";
import * as modeRepo from "../../shared/db/repos/modeRepo";
import * as runsRepo from "../../shared/db/repos/runsRepo";
import type { DraftRecord, IneligibleReason } from "../../shared/schemas/run";
import { evidenceId } from "../connectors/connector";
import { append } from "../projector/evidence";
import { decide } from "./approval";

/**
 * Story 3.13 — code-level YOLO bounds. No gateway call, no yolo tool, no
 * `complete({ role: "yolo" })`. Eligible pending Drafts on a yolo-stamped
 * Run go through `decide({ action: "approve" })` with agent provenance.
 * Approve `yolo.validated` is written only after `decide` succeeds so
 * Evidence cannot claim approve while the Draft stays pending. Escalate
 * rows are written when the draft is not eligible.
 */

const YOLO_AGENT = "approval-agent";

const BAKED_BLOCKERS: readonly IneligibleReason[] = [
  "tier2_only",
  "eval_fail",
  "evals_not_run",
  "guardrail_fail",
  "posture_flip",
  "party_characterization"
];

export function isPostureFlip(diff: unknown): boolean {
  if (diff == null || typeof diff !== "object" || Array.isArray(diff)) {
    return false;
  }
  const posture = (diff as Record<string, unknown>).posture;
  if (
    posture == null ||
    typeof posture !== "object" ||
    Array.isArray(posture)
  ) {
    return false;
  }
  const change = posture as { from?: unknown; to?: unknown };
  return "from" in change && "to" in change && change.from !== change.to;
}

export function isPartyCharacterization(
  targetEntityType: string | null
): boolean {
  return targetEntityType === "entities";
}

export function reasonsFor(
  draft: DraftRecord,
  threshold: number
): IneligibleReason[] {
  const reasons: IneligibleReason[] = [];
  const add = (reason: IneligibleReason) => {
    if (!reasons.includes(reason)) reasons.push(reason);
  };

  if (draft.tier2Only) add("tier2_only");
  if (
    draft.evalSummary == null ||
    draft.evalSummary.status === "evals_not_run"
  ) {
    add("evals_not_run");
  }
  if (draft.evalSummary?.status === "eval_fail") add("eval_fail");
  for (const reason of draft.evalSummary?.ineligible ?? []) {
    if ((BAKED_BLOCKERS as readonly string[]).includes(reason)) add(reason);
  }
  if (isPostureFlip(draft.diff)) add("posture_flip");
  if (isPartyCharacterization(draft.targetEntityType)) {
    add("party_characterization");
  }
  if (draft.confidence == null || draft.confidence < threshold) {
    add("below_threshold");
  }
  return reasons;
}

export function eligible(draft: DraftRecord, threshold: number): boolean {
  if (draft.outcome != null) return false;
  return reasonsFor(draft, threshold).length === 0;
}

async function appendApproveValidation(
  db: Db,
  input: {
    runId: string;
    draftId: string;
    confidence: number | null;
    threshold: number;
    now: string;
  }
): Promise<void> {
  await append(db, {
    id: evidenceId(input.runId, "yolo.validated", input.draftId),
    runId: input.runId,
    event: "yolo.validated",
    payload: {
      verdict: "approve",
      draftId: input.draftId,
      confidence: input.confidence,
      threshold: input.threshold,
      reasons: []
    },
    createdAt: input.now
  });
}

function hasApproveValidation(
  events: Awaited<ReturnType<typeof evidenceRepo.listByRun>>,
  draftId: string
): boolean {
  return events.some(
    (event) =>
      event.event === "yolo.validated" &&
      (event.payload as { draftId?: string; verdict?: string } | null)
        ?.draftId === draftId &&
      (event.payload as { verdict?: string } | null)?.verdict === "approve"
  );
}

export async function autoApproveRun(db: Db, runId: string): Promise<void> {
  const run = await runsRepo.getRunById(db, runId);
  if (!run || run.mode !== "yolo") return;

  const live = await modeRepo.get(db);
  const drafts = await draftsRepo.listByRun(db, runId);
  const pending = drafts.filter((draft) => draft.outcome == null);
  const now = new Date().toISOString();

  for (const draft of pending) {
    const reasons = reasonsFor(draft, live.threshold);
    if (reasons.length > 0) {
      await append(db, {
        id: evidenceId(runId, "yolo.validated", draft.id),
        runId,
        event: "yolo.validated",
        payload: {
          verdict: "escalate",
          draftId: draft.id,
          confidence: draft.confidence,
          threshold: live.threshold,
          reasons
        },
        createdAt: now
      });
      continue;
    }
    const result = await decide(db, {
      draftId: draft.id,
      action: "approve",
      operator: { displayName: YOLO_AGENT },
      now,
      provenanceKind: "agent"
    });
    if (result.status === "decided") {
      await appendApproveValidation(db, {
        runId,
        draftId: draft.id,
        confidence: draft.confidence,
        threshold: live.threshold,
        now
      });
      continue;
    }
    if (result.status === "already_decided") {
      const decided = await draftsRepo.getById(db, draft.id);
      if (decided?.outcome === "approved" && decided.decidedBy === YOLO_AGENT) {
        await appendApproveValidation(db, {
          runId,
          draftId: draft.id,
          confidence: draft.confidence,
          threshold: live.threshold,
          now
        });
      }
    }
  }

  const events = await evidenceRepo.listByRun(db, runId);
  for (const draft of drafts) {
    if (draft.outcome !== "approved" || draft.decidedBy !== YOLO_AGENT) {
      continue;
    }
    if (hasApproveValidation(events, draft.id)) continue;
    await appendApproveValidation(db, {
      runId,
      draftId: draft.id,
      confidence: draft.confidence,
      threshold: live.threshold,
      now
    });
  }
}
