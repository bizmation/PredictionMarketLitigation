/**
 * Story 3.14 — steward prompt only. 3.15 owns grounded interrogation of
 * Draft text; this wrapper names the turn and optional draft id and states
 * the no-tool / no-governance contract. No live-F1 tools.
 */

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
