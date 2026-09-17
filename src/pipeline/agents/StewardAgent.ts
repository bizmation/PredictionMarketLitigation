import type { DraftRecord, EvidenceEvent } from "../../shared/schemas/run";

/**
 * Story 3.15 — grounded Draft interrogation prompt. The 3.14 ungrounded
 * wrapper remains for turns with no draft id. No live-F1 tools.
 */

const PACKET_EVENTS = new Set([
  "source.fetched",
  "source.skipped",
  "draft.created",
  "draft.evaluated",
  "guardrails.passed",
  "guardrails.failed"
]);

export function buildStewardPrompt(input: {
  content: string;
  draftId: string | null;
}): string {
  const draftLine =
    input.draftId == null
      ? "No draft id is attached to this turn."
      : `Draft id (identifier only, not live F1): ${input.draftId}`;
  return [
    "You are the steward for this Run's operator steering channel.",
    "You have no tools. You cannot publish live F1, change YOLO, budget, mode, guardrails, or the tool allowlist.",
    draftLine,
    "Operator turn:",
    input.content
  ].join("\n\n");
}

function payloadDraftId(payload: unknown): string | null {
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return null;
  }
  const draftId = (payload as Record<string, unknown>).draftId;
  return typeof draftId === "string" ? draftId : null;
}

export function buildInterrogationPrompt(input: {
  content: string;
  draft: DraftRecord;
  evidence: EvidenceEvent[];
}): string {
  const draftPacket = {
    diff: input.draft.diff,
    body: input.draft.body,
    tier2Only: input.draft.tier2Only,
    confidence: input.draft.confidence,
    evalSummary: input.draft.evalSummary
  };
  const evidencePacket = input.evidence
    .filter((row) => PACKET_EVENTS.has(row.event))
    .filter((row) => {
      if (row.event === "source.fetched" || row.event === "source.skipped") {
        return true;
      }
      const eventDraftId = payloadDraftId(row.payload);
      return eventDraftId == null || eventDraftId === input.draft.id;
    })
    .map((row) => ({
      event: row.event,
      payload: row.payload,
      createdAt: row.createdAt
    }));
  return [
    "You are the steward for this Run's operator steering channel.",
    "You have no tools. You cannot publish live F1, change YOLO, budget, mode, guardrails, or the tool allowlist.",
    "Answer only from this packet. If an asked fact is absent, say not recorded — do not reconstruct.",
    `Draft id (identifier only, not live F1): ${input.draft.id}`,
    "Draft fields:",
    JSON.stringify(draftPacket),
    "Run Evidence:",
    JSON.stringify(evidencePacket),
    "Operator turn:",
    input.content
  ].join("\n\n");
}
