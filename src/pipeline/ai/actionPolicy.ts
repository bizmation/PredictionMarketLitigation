import type { Db } from "../../shared/db/client";
import * as draftsRepo from "../../shared/db/repos/draftsRepo";
import * as evidenceRepo from "../../shared/db/repos/evidenceRepo";
import type { GatewayRole } from "../../shared/schemas/vocabulary";
import { evidenceId } from "../connectors/connector";
import type { GatewayDeps } from "./gateway";

/**
 * Story 3.6 — code-level action policy. Empty per-role tool allowlists,
 * tool-request parse, authorized context keys, and post-review pass/fail
 * evaluation. Prompt or source text cannot change these constants.
 */

export const GUARDRAIL_RULE_ID = "tool.allowlist" as const;

export const AUTHORIZED_CONTEXT_KEYS = [
  "targetEntityType",
  "targetEntityId",
  "body",
  "diff",
  "tier2Only"
] as const;

export type AuthorizedContextKey = (typeof AUTHORIZED_CONTEXT_KEYS)[number];

export type AuthorizedDraftContext = {
  targetEntityType: string | null;
  targetEntityId: string | null;
  body: string;
  diff: unknown;
  tier2Only: boolean;
};

const NONE: readonly string[] = Object.freeze([]);

export const ALLOWED_TOOLS: Record<GatewayRole, readonly string[]> =
  Object.freeze({
    orchestrator: NONE,
    drafter: NONE,
    reviewer: NONE,
    yolo: NONE
  });

export function isToolAllowed(role: GatewayRole, tool: string): boolean {
  return (ALLOWED_TOOLS[role] ?? NONE).includes(tool);
}

/**
 * Tool-shaped model text: `{"tool":"<name>"}` (optional other keys ignored).
 * Unparseable JSON returns null so the 3.5 parse path still runs.
 */
export function parseToolRequest(text: string): { tool: string } | null {
  try {
    const parsed: unknown = JSON.parse(text.trim());
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const tool = (parsed as { tool?: unknown }).tool;
    if (typeof tool !== "string" || tool.length === 0) return null;
    return { tool };
  } catch {
    return null;
  }
}

export function pickAuthorizedContext(
  source: AuthorizedDraftContext
): AuthorizedDraftContext {
  return {
    targetEntityType: source.targetEntityType,
    targetEntityId: source.targetEntityId,
    body: source.body,
    diff: source.diff,
    tier2Only: source.tier2Only
  };
}

export type GuardrailVerdict =
  | { decision: "skip" }
  | {
      decision: "pass";
      payload: {
        draftId: string;
        ruleIds: readonly [typeof GUARDRAIL_RULE_ID];
        context: typeof AUTHORIZED_CONTEXT_KEYS;
      };
    }
  | {
      decision: "fail";
      payload: {
        draftId: string;
        ruleId: typeof GUARDRAIL_RULE_ID;
        tool: string;
      };
    };

/**
 * v1 rule catalog is `tool.allowlist` only. A recorded event skips; a
 * requested tool fails; otherwise the Draft passes with authorized context
 * keys attributed on Evidence (not a second fail rule).
 */
export function evaluateDraftGuardrails(input: {
  draftId: string;
  alreadyRecorded: boolean;
  requestedTool: string | null;
}): GuardrailVerdict {
  if (input.alreadyRecorded) return { decision: "skip" };
  if (input.requestedTool != null) {
    return {
      decision: "fail",
      payload: {
        draftId: input.draftId,
        ruleId: GUARDRAIL_RULE_ID,
        tool: input.requestedTool
      }
    };
  }
  return {
    decision: "pass",
    payload: {
      draftId: input.draftId,
      ruleIds: [GUARDRAIL_RULE_ID],
      context: AUTHORIZED_CONTEXT_KEYS
    }
  };
}

/**
 * After 3.5 persist and before the gate: every remaining Draft gets
 * `guardrails.passed` (or is skipped when a pass/fail event already exists).
 * Generation-time denies are already on Evidence via `invokeTool`.
 * Empty packaging never reaches this function.
 */
export async function enforceDraftGuardrails(
  db: Db,
  runId: string,
  gatewayDeps: GatewayDeps
): Promise<void> {
  const drafts = await draftsRepo.listByRun(db, runId);
  if (drafts.length === 0) return;
  const evidence = await evidenceRepo.listByRun(db, runId);
  const recorded = new Set(
    evidence
      .filter(
        (event) =>
          event.event === "guardrails.passed" ||
          event.event === "guardrails.failed"
      )
      .map((event) =>
        event.payload != null && typeof event.payload === "object"
          ? (event.payload as { draftId?: unknown }).draftId
          : undefined
      )
      .filter((id): id is string => typeof id === "string")
  );
  const createdAt = gatewayDeps.now?.() ?? new Date().toISOString();
  for (const draft of drafts) {
    const verdict = evaluateDraftGuardrails({
      draftId: draft.id,
      alreadyRecorded: recorded.has(draft.id),
      requestedTool: null
    });
    if (verdict.decision !== "pass") continue;
    await evidenceRepo.appendEvent(db, {
      id: evidenceId(runId, "guardrails.passed", draft.id),
      runId,
      event: "guardrails.passed",
      payload: verdict.payload,
      createdAt
    });
    recorded.add(draft.id);
  }
}
