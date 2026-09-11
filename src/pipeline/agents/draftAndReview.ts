import { z } from "zod";

import type { Db } from "../../shared/db/client";
import * as draftsRepo from "../../shared/db/repos/draftsRepo";
import * as evidenceRepo from "../../shared/db/repos/evidenceRepo";
import type {
  DraftRecord,
  EvalSummary,
  IneligibleReason
} from "../../shared/schemas/run";
import {
  GUARDRAIL_RULE_ID,
  parseToolRequest,
  pickAuthorizedContext,
  type AuthorizedDraftContext
} from "../ai/actionPolicy";
import {
  complete,
  GatewayError,
  invokeTool,
  type GatewayDeps
} from "../ai/gateway";
import { evidenceId } from "../connectors/connector";

/**
 * Story 3.5 — drafter then reviewer per Draft. Story 3.6 scopes prompts to
 * authorized Draft fields and short-circuits remaining LLM when model text
 * is a tool request (`invokeTool` + `guardrail_fail`).
 *
 * Agents call `gateway.complete({ role })` only. Prompts live here, not in
 * the workflow. YOLO does not run. Workflow retries skip a Draft whose
 * `evalSummary` is already set or that already has `guardrails.failed`.
 */

/** Versioned auto-approve floor until 3.13 makes it operator-configurable. */
export const AUTO_APPROVE_CONFIDENCE_THRESHOLD = 70;

const DrafterOutputSchema = z
  .object({
    body: z.string().min(1),
    diff: z.record(z.string(), z.object({ from: z.unknown(), to: z.unknown() }))
  })
  .passthrough();

const ReviewerOutputSchema = z
  .object({
    confidence: z.number().int().min(0).max(100),
    citationCompleteness: z.number().int().min(0).max(100),
    notes: z.string(),
    disagrees: z.boolean().optional(),
    disagreement: z.string().optional()
  })
  .passthrough();

const PER_DRAFT_GATEWAY_CODES = new Set([
  "provider_error",
  "gateway_not_configured",
  "role_not_configured",
  "run_not_found",
  "unknown_role"
]);

export interface DraftAndReviewResult {
  budgetStopped: boolean;
}

function nowIso(deps: GatewayDeps): string {
  return deps.now?.() ?? new Date().toISOString();
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text.trim());
  } catch {
    return undefined;
  }
}

function parseDrafter(text: string): {
  body: string;
  diff: Record<string, { from: unknown; to: unknown }>;
} | null {
  const parsed = DrafterOutputSchema.safeParse(parseJson(text));
  if (!parsed.success) return null;
  if (parsed.data.body.trim().length === 0) return null;
  return { body: parsed.data.body, diff: parsed.data.diff };
}

function ineligibleFor(
  draft: DraftRecord,
  status: EvalSummary["status"],
  confidence: number | null
): IneligibleReason[] {
  const reasons: IneligibleReason[] = [];
  if (draft.tier2Only) reasons.push("tier2_only");
  if (confidence != null && confidence < AUTO_APPROVE_CONFIDENCE_THRESHOLD) {
    reasons.push("below_threshold");
  }
  if (status === "eval_fail") reasons.push("eval_fail");
  if (status === "evals_not_run") reasons.push("evals_not_run");
  return reasons;
}

function evalsNotRunSummary(
  draft: DraftRecord,
  extra: IneligibleReason[] = []
): EvalSummary {
  const ineligible = ineligibleFor(draft, "evals_not_run", null);
  for (const reason of extra) {
    if (!ineligible.includes(reason)) ineligible.push(reason);
  }
  return {
    status: "evals_not_run",
    basis: "evals not run",
    citationCompleteness: null,
    disagreement: { flagged: false, description: null },
    ineligible
  };
}

function evalFailSummary(
  draft: DraftRecord,
  args: {
    basis: string;
    citationCompleteness: number | null;
    confidence: number | null;
  }
): EvalSummary {
  return {
    status: "eval_fail",
    basis: args.basis,
    citationCompleteness: args.citationCompleteness,
    disagreement: { flagged: false, description: null },
    ineligible: ineligibleFor(draft, "eval_fail", args.confidence)
  };
}

/**
 * Interpolates only authorized Draft fields. Extra keys on the source
 * (operator notes, secrets, career notes, decidedBy, …) are dropped and
 * never concatenated into the prompt.
 */
export function buildScopedPrompt(
  role: "drafter" | "reviewer",
  source: AuthorizedDraftContext
): string {
  const ctx = pickAuthorizedContext(source);
  if (role === "drafter") {
    return [
      "You are the drafter for a litigation-tracker Draft.",
      "Return ONLY JSON with this shape (no markdown):",
      '{"body": string, "diff": {"<field>": {"from": unknown, "to": unknown}}}',
      "",
      `Target entity: ${ctx.targetEntityType ?? "null"} / ${ctx.targetEntityId ?? "null"}`,
      `Tier-2 only: ${ctx.tier2Only ? "true" : "false"}`,
      "Packaging shell body:",
      ctx.body,
      "Packaging shell diff:",
      JSON.stringify(ctx.diff)
    ].join("\n");
  }
  return [
    "You are the reviewer for a litigation-tracker Draft.",
    "Return ONLY JSON with this shape (no markdown):",
    '{"confidence":0-100,"citationCompleteness":0-100,"notes":string,"disagrees":boolean,"disagreement":string}',
    "confidence and citationCompleteness are integers 0-100.",
    "notes is the public basis for the score.",
    "Set disagrees true only when you materially disagree with the drafter; then disagreement is a short description.",
    'If you agree, disagrees is false and disagreement is "".',
    "",
    `Target entity: ${ctx.targetEntityType ?? "null"} / ${ctx.targetEntityId ?? "null"}`,
    `Tier-2 only: ${ctx.tier2Only ? "true" : "false"}`,
    "Draft body:",
    ctx.body,
    "Proposed diff:",
    JSON.stringify(ctx.diff)
  ].join("\n");
}

function isBudgetStopped(err: unknown): boolean {
  return err instanceof GatewayError && err.code === "budget_stopped";
}

function isPerDraftGatewayError(err: unknown): boolean {
  return err instanceof GatewayError && PER_DRAFT_GATEWAY_CODES.has(err.code);
}

async function persist(
  db: Db,
  draft: DraftRecord,
  args: {
    body: string;
    diff: unknown;
    confidence: number | null;
    evalSummary: EvalSummary;
    createdAt: string;
  }
): Promise<void> {
  // Load/validate the Draft UPDATE first so a missing row throws before any
  // write. Then batch the evidence insert with the UPDATE so a Workflow retry
  // sees both rows or neither — INSERT OR IGNORE must not freeze a stale
  // FR29 payload while evalSummary is still null.
  const reviewStmt = await draftsRepo.applyDraftReviewStmt(db, {
    id: draft.id,
    body: args.body,
    diff: args.diff,
    confidence: args.confidence,
    evalSummary: args.evalSummary,
    updatedAt: args.createdAt
  });
  await db.batch([
    evidenceRepo.appendEventStmt(db, {
      id: evidenceId(draft.runId, "draft.evaluated", draft.id),
      runId: draft.runId,
      event: "draft.evaluated",
      payload: {
        draftId: draft.id,
        disagreement: args.evalSummary.disagreement
      },
      createdAt: args.createdAt
    }),
    reviewStmt
  ]);
}

async function persistEvalsNotRun(
  db: Db,
  draft: DraftRecord,
  body: string,
  diff: unknown,
  createdAt: string
): Promise<void> {
  await persist(db, draft, {
    body,
    diff,
    confidence: null,
    evalSummary: evalsNotRunSummary(draft),
    createdAt
  });
}

async function persistToolDeny(
  db: Db,
  gatewayDeps: GatewayDeps,
  draft: DraftRecord,
  args: {
    body: string;
    diff: unknown;
    role: "drafter" | "reviewer";
    tool: string;
  }
): Promise<void> {
  const createdAt = nowIso(gatewayDeps);
  const evalSummary = evalsNotRunSummary(draft, ["guardrail_fail"]);
  const reviewStmt = await draftsRepo.applyDraftReviewStmt(db, {
    id: draft.id,
    body: args.body,
    diff: args.diff,
    confidence: null,
    evalSummary,
    updatedAt: createdAt
  });
  const extra = [
    evidenceRepo.appendEventStmt(db, {
      id: evidenceId(draft.runId, "draft.evaluated", draft.id),
      runId: draft.runId,
      event: "draft.evaluated",
      payload: {
        draftId: draft.id,
        disagreement: evalSummary.disagreement
      },
      createdAt
    }),
    reviewStmt
  ];
  try {
    await invokeTool(gatewayDeps, {
      role: args.role,
      runId: draft.runId,
      draftId: draft.id,
      tool: args.tool,
      extraStatements: extra
    });
  } catch {
    await db.batch([
      evidenceRepo.appendEventStmt(db, {
        id: evidenceId(draft.runId, "guardrails.failed", draft.id),
        runId: draft.runId,
        event: "guardrails.failed",
        payload: {
          draftId: draft.id,
          ruleId: GUARDRAIL_RULE_ID,
          tool: args.tool
        },
        createdAt
      }),
      ...extra
    ]);
  }
}

function scoreReviewer(
  draft: DraftRecord,
  text: string
): {
  confidence: number | null;
  evalSummary: EvalSummary;
} {
  const parsed = ReviewerOutputSchema.safeParse(parseJson(text));
  if (!parsed.success) {
    return {
      confidence: null,
      evalSummary: evalFailSummary(draft, {
        basis: "eval-fail",
        citationCompleteness: null,
        confidence: null
      })
    };
  }
  const disagrees = parsed.data.disagrees === true;
  const disagreement = (parsed.data.disagreement ?? "").trim();
  if (disagrees && disagreement.length === 0) {
    return {
      confidence: parsed.data.confidence,
      evalSummary: evalFailSummary(draft, {
        basis: parsed.data.notes || "eval-fail",
        citationCompleteness: parsed.data.citationCompleteness,
        confidence: parsed.data.confidence
      })
    };
  }
  const flagged = disagrees;
  return {
    confidence: parsed.data.confidence,
    evalSummary: {
      status: "ok",
      basis: parsed.data.notes,
      citationCompleteness: parsed.data.citationCompleteness,
      disagreement: {
        flagged,
        description: flagged ? disagreement : null
      },
      ineligible: ineligibleFor(draft, "ok", parsed.data.confidence)
    }
  };
}

/**
 * Per Draft: skip if `evalSummary` is already set or `guardrails.failed`
 * already exists; drafter then reviewer; apply review; write
 * `draft.evaluated`. Tool-shaped model text goes through `invokeTool` in
 * one batch with `evals_not_run` + `guardrail_fail`, skipping remaining
 * LLM for that Draft. Per-Draft gateway errors mark that Draft
 * `evals_not_run` and continue. `budget_stopped` stops further calls
 * and marks remaining Drafts `evals_not_run`.
 */
export async function draftAndReview(
  db: Db,
  runId: string,
  gatewayDeps: GatewayDeps
): Promise<DraftAndReviewResult> {
  const failedIds = new Set<string>();
  for (const event of await evidenceRepo.listByRun(db, runId)) {
    if (event.event !== "guardrails.failed") continue;
    const id =
      event.payload != null && typeof event.payload === "object"
        ? (event.payload as { draftId?: unknown }).draftId
        : undefined;
    if (typeof id === "string") failedIds.add(id);
  }
  const drafts = (await draftsRepo.listByRun(db, runId)).filter(
    (draft) => draft.evalSummary == null && !failedIds.has(draft.id)
  );
  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i]!;
    let body = draft.body;
    let diff: unknown = draft.diff;
    let pendingTool: { role: "drafter" | "reviewer"; tool: string } | null =
      null;
    try {
      const drafter = await complete(gatewayDeps, {
        role: "drafter",
        runId,
        prompt: buildScopedPrompt("drafter", draft)
      });
      const drafterTool = parseToolRequest(drafter.text);
      if (drafterTool) {
        pendingTool = { role: "drafter", tool: drafterTool.tool };
        await persistToolDeny(db, gatewayDeps, draft, {
          body,
          diff,
          role: "drafter",
          tool: drafterTool.tool
        });
        continue;
      }
      const overwritten = parseDrafter(drafter.text);
      if (overwritten) {
        body = overwritten.body;
        diff = overwritten.diff;
      }
      const reviewer = await complete(gatewayDeps, {
        role: "reviewer",
        runId,
        prompt: buildScopedPrompt("reviewer", {
          targetEntityType: draft.targetEntityType,
          targetEntityId: draft.targetEntityId,
          body,
          diff,
          tier2Only: draft.tier2Only
        })
      });
      const reviewerTool = parseToolRequest(reviewer.text);
      if (reviewerTool) {
        pendingTool = { role: "reviewer", tool: reviewerTool.tool };
        await persistToolDeny(db, gatewayDeps, draft, {
          body,
          diff,
          role: "reviewer",
          tool: reviewerTool.tool
        });
        continue;
      }
      const scored = scoreReviewer(draft, reviewer.text);
      await persist(db, draft, {
        body,
        diff,
        confidence: scored.confidence,
        evalSummary: scored.evalSummary,
        createdAt: nowIso(gatewayDeps)
      });
    } catch (err) {
      const timestamp = nowIso(gatewayDeps);
      let persistFailed = false;
      try {
        if (pendingTool) {
          await persistToolDeny(db, gatewayDeps, draft, {
            body,
            diff,
            role: pendingTool.role,
            tool: pendingTool.tool
          });
          continue;
        }
        await persistEvalsNotRun(db, draft, body, diff, timestamp);
      } catch {
        persistFailed = true;
      }
      const stopFurther =
        persistFailed || isBudgetStopped(err) || !isPerDraftGatewayError(err);
      if (stopFurther) {
        for (let j = i + 1; j < drafts.length; j++) {
          const remaining = drafts[j]!;
          try {
            await persistEvalsNotRun(
              db,
              remaining,
              remaining.body,
              remaining.diff,
              timestamp
            );
          } catch {
            // Stamp as many remaining Drafts as the DB will take.
          }
        }
        if (isBudgetStopped(err) && !persistFailed) {
          return { budgetStopped: true };
        }
        throw err;
      }
    }
  }
  return { budgetStopped: false };
}
