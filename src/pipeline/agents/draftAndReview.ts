import { z } from "zod";

import type { Db } from "../../shared/db/client";
import * as draftsRepo from "../../shared/db/repos/draftsRepo";
import * as evidenceRepo from "../../shared/db/repos/evidenceRepo";
import * as modeRepo from "../../shared/db/repos/modeRepo";
import * as standingGuidanceRepo from "../../shared/db/repos/standingGuidanceRepo";
import {
  deriveStatePatch,
  DOCKET_EVENT_KIND_VALUES,
  FAVORS_VALUES,
  INFERENCE_BASIS_MAX_CHARS,
  InferenceSchema,
  type Inference,
  type StatePatch
} from "../../shared/schemas/docketInference";
import type {
  DraftRecord,
  EvalSummary,
  IneligibleReason
} from "../../shared/schemas/run";
import {
  CaseLifecycleSchema,
  PostureSchema
} from "../../shared/schemas/vocabulary";
import {
  toGuidanceRef,
  type GuidanceRef
} from "../../shared/schemas/standingGuidance";
import {
  isLifecycleChange,
  isPartyCharacterization,
  isPostureFlip
} from "../gate/yoloPolicy";
import {
  GUARDRAIL_RULE_ID,
  parseToolRequest,
  pickAuthorizedContext,
  type AuthorizedDraftContext
} from "../ai/actionPolicy";
import { complete, GatewayError, type GatewayDeps } from "../ai/gateway";
import { evidenceId } from "../connectors/connector";
import { appendStmt } from "../projector/evidence";

/**
 * Story 3.5 — drafter then reviewer per Draft. Story 3.6 scopes prompts to
 * authorized Draft fields and short-circuits remaining LLM when model text
 * is a tool request (`invokeTool` + `guardrail_fail`). Story 3.18 loads
 * in-force standing guidance once per call and injects it into the
 * *drafter* prompt only; each `draft.evaluated` names the `{ itemId,
 * version }` refs that were present in that Draft's drafter prompt.
 *
 * Agents call `gateway.complete({ role })` only. Prompts live here, not in
 * the workflow. YOLO does not run. Workflow retries skip a Draft whose
 * `evalSummary` is already set or that already has `guardrails.failed`.
 * `ineligibleFor` uses the live threshold and stamps posture/party reasons
 * for 3.13 auto-approve. Guidance never reaches the reviewer prompt, the
 * tool allowlist, or `pickAuthorizedContext`.
 *
 * Story 3.21 — `docket_events` Drafts branch: the drafter returns only the
 * inference JSON (`kind`, `favors`, `confidence`, `basis`) and never
 * rewrites the connector's record; code derives `statePatch` from the
 * frozen transition table; an out-of-vocabulary answer drops the inference
 * and records `guardrails.failed { ruleId: "inference.vocabulary" }` in the
 * same batch as `draft.evaluated`. The reviewer sees record + inference.
 */

export { AUTO_APPROVE_CONFIDENCE_THRESHOLD } from "../../shared/schemas/mode";

export const DOCKET_EVENTS_TARGET = "docket_events";
export const INFERENCE_VOCABULARY_RULE_ID = "inference.vocabulary" as const;

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

function isDocketEventDraft(
  draft: Pick<DraftRecord, "targetEntityType">
): boolean {
  return draft.targetEntityType === DOCKET_EVENTS_TARGET;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/** The connector's record part: `diff` minus any prior inference. */
function stripInference(diff: unknown): Record<string, unknown> {
  const row = asRecord(diff) ?? {};
  const { inference: _inference, statePatch: _patch, ...record } = row;
  return record;
}

function parseInference(text: string): Inference | null {
  const parsed = InferenceSchema.safeParse(parseJson(text));
  return parsed.success ? parsed.data : null;
}

/**
 * Current `cases` row for the transition table. Reads live so `from` is
 * what the row says now, not what the connector saw at packaging.
 */
async function currentCaseState(
  db: Db,
  record: Record<string, unknown>
): Promise<{
  lifecycle: "active" | "resolved";
  posture: "untracked" | "platform" | "pending" | "state" | "banned";
  decidedAt: string | null;
} | null> {
  const caseId = record.caseId;
  if (typeof caseId !== "string" || caseId.length === 0) return null;
  const row = await db
    .prepare("SELECT lifecycle, posture, decided_at FROM cases WHERE id = ?")
    .bind(caseId)
    .first<{ lifecycle: string; posture: string; decided_at: string | null }>();
  if (!row) return null;
  const lifecycle = CaseLifecycleSchema.safeParse(row.lifecycle);
  const posture = PostureSchema.safeParse(row.posture);
  if (!lifecycle.success || !posture.success) return null;
  return {
    lifecycle: lifecycle.data,
    posture: posture.data,
    decidedAt: row.decided_at
  };
}

async function derivePatch(
  db: Db,
  record: Record<string, unknown>,
  inference: Inference
): Promise<StatePatch> {
  const current = await currentCaseState(db, record);
  const occurredAt = record.occurredAt;
  if (current == null || typeof occurredAt !== "string") return {};
  return deriveStatePatch(
    inference.kind,
    inference.favors,
    current,
    occurredAt
  );
}

export function ineligibleFor(
  draft: Pick<DraftRecord, "tier2Only" | "targetEntityType">,
  status: EvalSummary["status"],
  confidence: number | null,
  threshold: number,
  diff: unknown
): IneligibleReason[] {
  const reasons: IneligibleReason[] = [];
  if (draft.tier2Only) reasons.push("tier2_only");
  if (confidence != null && confidence < threshold) {
    reasons.push("below_threshold");
  }
  if (status === "eval_fail") reasons.push("eval_fail");
  if (status === "evals_not_run") reasons.push("evals_not_run");
  if (isPostureFlip(diff)) reasons.push("posture_flip");
  if (isLifecycleChange(diff)) reasons.push("lifecycle_change");
  if (isPartyCharacterization(draft.targetEntityType)) {
    reasons.push("party_characterization");
  }
  return reasons;
}

function evalsNotRunSummary(
  draft: DraftRecord,
  threshold: number,
  diff: unknown,
  extra: IneligibleReason[] = [],
  basis = "Evaluation could not run because its provider was unavailable."
): EvalSummary {
  const ineligible = ineligibleFor(
    draft,
    "evals_not_run",
    null,
    threshold,
    diff
  );
  for (const reason of extra) {
    if (!ineligible.includes(reason)) ineligible.push(reason);
  }
  return {
    status: "evals_not_run",
    basis,
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
    threshold: number;
    diff: unknown;
  }
): EvalSummary {
  return {
    status: "eval_fail",
    basis: args.basis,
    citationCompleteness: args.citationCompleteness,
    disagreement: { flagged: false, description: null },
    ineligible: ineligibleFor(
      draft,
      "eval_fail",
      args.confidence,
      args.threshold,
      args.diff
    )
  };
}

/**
 * Interpolates only authorized Draft fields. Extra keys on the source
 * (operator notes, secrets, career notes, decidedBy, …) are dropped and
 * never concatenated into the prompt. `guidance` (3.18) is the in-force
 * standing guidance text list; it is rendered as a labeled "Standing
 * guidance:" block after the revision instruction and only for the
 * drafter — the reviewer branch ignores it.
 */
export function buildScopedPrompt(
  role: "drafter" | "reviewer",
  source: AuthorizedDraftContext,
  revisionInstruction?: string,
  guidance?: readonly string[]
): string {
  const ctx = pickAuthorizedContext(source);
  if (ctx.targetEntityType === DOCKET_EVENTS_TARGET) {
    return buildDocketPrompt(role, ctx, revisionInstruction, guidance);
  }
  if (role === "drafter") {
    const lines = [
      "You are the drafter for a litigation-tracker Draft.",
      "Return ONLY JSON with this shape (no markdown):",
      '{"body": string, "diff": {"<field>": {"from": unknown, "to": unknown}}}'
    ];
    if (revisionInstruction != null && revisionInstruction.trim().length > 0) {
      lines.push(
        "",
        "Operator revision instruction:",
        revisionInstruction.trim()
      );
    }
    const standing = (guidance ?? [])
      .map((text) => text.replace(/\s+/g, " ").trim())
      .filter((text) => text.length > 0);
    if (standing.length > 0) {
      lines.push(
        "",
        "Standing guidance:",
        ...standing.map((text, index) => `${index + 1}. ${text}`)
      );
    }
    lines.push(
      "",
      `Target entity: ${ctx.targetEntityType ?? "null"} / ${ctx.targetEntityId ?? "null"}`,
      `Tier-2 only: ${ctx.tier2Only ? "true" : "false"}`,
      "Packaging shell body:",
      ctx.body,
      "Packaging shell diff:",
      JSON.stringify(ctx.diff)
    );
    return lines.join("\n");
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

function stringField(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : "null";
}

function partiesLines(context: Record<string, unknown> | null): string[] {
  const parties = context?.parties;
  if (!Array.isArray(parties) || parties.length === 0) {
    return ["(no party roles recorded)"];
  }
  return parties.map((party) => {
    const row = asRecord(party) ?? {};
    const entityRole =
      typeof row.entityRole === "string" ? ` (${row.entityRole})` : "";
    return `- ${stringField(row, "name")}${entityRole} — ${stringField(row, "role")}`;
  });
}

/**
 * Story 3.21 — docket-entry prompts. The drafter classifies the verbatim
 * entry into the closed vocabulary and returns only the inference JSON;
 * the record is quoted, never handed over for rewriting. The reviewer gets
 * the same record plus the drafter's inference (or a note that it was
 * dropped) and answers in the 3.5 shape. Only authorized context is
 * interpolated; `guidance` reaches the drafter alone.
 */
function buildDocketPrompt(
  role: "drafter" | "reviewer",
  ctx: AuthorizedDraftContext,
  revisionInstruction?: string,
  guidance?: readonly string[]
): string {
  const diff = asRecord(ctx.diff) ?? {};
  const context = asRecord(diff.context);
  const entryNumber =
    typeof diff.entryNumber === "number" ? String(diff.entryNumber) : "—";
  const recordLines = [
    `Case: ${context ? stringField(context, "caption") : "null"}`,
    `Court: ${context ? stringField(context, "court") : "null"}`,
    `Current lifecycle: ${context ? stringField(context, "lifecycle") : "null"}`,
    `Current posture: ${context ? stringField(context, "posture") : "null"}`,
    "Party roles:",
    ...partiesLines(context),
    `Docket entry ${entryNumber}, filed ${stringField(diff, "occurredAt")}:`,
    stringField(diff, "description")
  ];
  if (role === "drafter") {
    const lines = [
      "You are the drafter for a litigation-tracker docket-entry Draft.",
      "The docket entry below is the record; it is fixed and you may not rewrite it.",
      "Classify it. Return ONLY JSON with this shape (no markdown):",
      `{"kind": string, "favors": "platform"|"state"|"none", "confidence": 0-1, "basis": string}`,
      `kind must be exactly one of: ${DOCKET_EVENT_KIND_VALUES.join(", ")}`,
      `favors must be exactly one of: ${FAVORS_VALUES.join(", ")}`,
      "favors names the side the ruling HELPS, never the movant: a denied platform preliminary injunction favors state; an order enjoining a state favors platform; a procedural entry favors none.",
      "confidence is your probability (0-1) that kind and favors are both right.",
      `basis is at most ${INFERENCE_BASIS_MAX_CHARS} characters and quotes the words of the entry that decide the classification.`
    ];
    if (revisionInstruction != null && revisionInstruction.trim().length > 0) {
      lines.push(
        "",
        "Operator revision instruction:",
        revisionInstruction.trim()
      );
    }
    const standing = (guidance ?? [])
      .map((text) => text.replace(/\s+/g, " ").trim())
      .filter((text) => text.length > 0);
    if (standing.length > 0) {
      lines.push(
        "",
        "Standing guidance:",
        ...standing.map((text, index) => `${index + 1}. ${text}`)
      );
    }
    lines.push(
      "",
      `Target entity: ${ctx.targetEntityType ?? "null"} / ${ctx.targetEntityId ?? "null"}`,
      ...recordLines
    );
    return lines.join("\n");
  }
  const inference = asRecord(diff.inference);
  const statePatch = asRecord(diff.statePatch);
  return [
    "You are the reviewer for a litigation-tracker docket-entry Draft.",
    "The docket entry is a fixed record; the drafter classified it. Score the classification.",
    "Return ONLY JSON with this shape (no markdown):",
    '{"confidence":0-100,"citationCompleteness":0-100,"notes":string,"disagrees":boolean,"disagreement":string}',
    "confidence and citationCompleteness are integers 0-100.",
    "notes is the public basis for the score.",
    "Check favors hardest: it names the side the ruling helps, never the movant.",
    "Set disagrees true only when you materially disagree with the drafter's kind or favors; then disagreement is a short description.",
    'If you agree, disagrees is false and disagreement is "".',
    "",
    `Target entity: ${ctx.targetEntityType ?? "null"} / ${ctx.targetEntityId ?? "null"}`,
    ...recordLines,
    "Drafter inference:",
    inference
      ? JSON.stringify(inference)
      : "(none — the drafter's answer was outside the vocabulary and was dropped)",
    "Derived case state patch:",
    JSON.stringify(statePatch ?? {})
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
    guidance: readonly GuidanceRef[];
    /** Story 3.21 — inference / statePatch / reviewer verdict on Evidence. */
    extraPayload?: Record<string, unknown>;
    /** Story 3.21 — `guardrails.failed` rides the same batch. */
    extraStatements?: D1PreparedStatement[];
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
    appendStmt(
      db,
      {
        id: evidenceId(draft.runId, "draft.evaluated", draft.id),
        runId: draft.runId,
        event: "draft.evaluated",
        payload: {
          draftId: draft.id,
          disagreement: args.evalSummary.disagreement,
          guidance: [...args.guidance],
          ...(args.extraPayload ?? {})
        },
        createdAt: args.createdAt
      },
      { draftId: draft.id, state: "unevaluated" }
    ),
    ...(args.extraStatements ?? []),
    reviewStmt
  ]);
}

async function persistEvalsNotRun(
  db: Db,
  draft: DraftRecord,
  body: string,
  diff: unknown,
  createdAt: string,
  threshold: number,
  guidance: readonly GuidanceRef[],
  reason: string
): Promise<void> {
  await persist(db, draft, {
    body,
    diff,
    confidence: null,
    evalSummary: evalsNotRunSummary(draft, threshold, diff, [], reason),
    createdAt,
    guidance
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
    threshold: number;
    guidance: readonly GuidanceRef[];
  }
): Promise<void> {
  const createdAt = nowIso(gatewayDeps);
  const evalSummary = evalsNotRunSummary(
    draft,
    args.threshold,
    args.diff,
    ["guardrail_fail"],
    "Evaluation stopped because the model requested a disallowed tool."
  );
  await persist(db, draft, {
    body: args.body,
    diff: args.diff,
    confidence: null,
    evalSummary,
    createdAt,
    guidance: args.guidance,
    extraStatements: [
      appendStmt(
        db,
        {
          id: evidenceId(draft.runId, "guardrails.failed", draft.id),
          runId: draft.runId,
          event: "guardrails.failed",
          payload: {
            draftId: draft.id,
            ruleId: GUARDRAIL_RULE_ID,
            tool: args.tool
          },
          createdAt
        },
        { draftId: draft.id, state: "unevaluated" }
      )
    ]
  });
}

function scoreReviewer(
  draft: DraftRecord,
  text: string,
  threshold: number,
  diff: unknown
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
        confidence: null,
        threshold,
        diff
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
        confidence: parsed.data.confidence,
        threshold,
        diff
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
      ineligible: ineligibleFor(
        draft,
        "ok",
        parsed.data.confidence,
        threshold,
        diff
      )
    }
  };
}

/**
 * Per Draft: skip if `evalSummary` is already set or `guardrails.failed`
 * already exists; drafter then reviewer; apply review; write
 * `draft.evaluated`. Tool-shaped model text records the allowlist denial in
 * one conditional batch with `evals_not_run` + `guardrail_fail`, skipping remaining
 * LLM for that Draft. Per-Draft gateway errors mark that Draft
 * `evals_not_run` and continue. `budget_stopped` stops further calls
 * and marks remaining Drafts `evals_not_run` — those never had a drafter
 * prompt, so their `draft.evaluated.guidance` is empty.
 */
export async function draftAndReview(
  db: Db,
  runId: string,
  gatewayDeps: GatewayDeps,
  options?: { revisionInstruction?: string }
): Promise<DraftAndReviewResult> {
  const threshold = (await modeRepo.get(db)).threshold;
  const inForce = await standingGuidanceRepo.listInForce(db);
  const guidanceTexts = inForce.map((row) => row.content);
  const guidanceRefs: GuidanceRef[] = inForce.map(toGuidanceRef);
  const NO_GUIDANCE: readonly GuidanceRef[] = [];
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
    (draft) =>
      draft.outcome == null &&
      draft.evalSummary == null &&
      !failedIds.has(draft.id)
  );
  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i]!;
    const docket = isDocketEventDraft(draft);
    let body = draft.body;
    // A docket-event revision re-classifies from the record: any inference
    // the parent carried is stripped before the drafter answers again.
    let diff: unknown = docket ? stripInference(draft.diff) : draft.diff;
    let pendingTool: { role: "drafter" | "reviewer"; tool: string } | null =
      null;
    try {
      const drafter = await complete(gatewayDeps, {
        role: "drafter",
        runId,
        prompt: buildScopedPrompt(
          "drafter",
          draft,
          draft.revisionIndex > 0 ? options?.revisionInstruction : undefined,
          guidanceTexts
        )
      });
      const drafterTool = parseToolRequest(drafter.text);
      if (drafterTool) {
        pendingTool = { role: "drafter", tool: drafterTool.tool };
        await persistToolDeny(db, gatewayDeps, draft, {
          body,
          diff,
          role: "drafter",
          tool: drafterTool.tool,
          threshold,
          guidance: guidanceRefs
        });
        continue;
      }
      let inference: Inference | null = null;
      let statePatch: StatePatch | null = null;
      let vocabularyFailed = false;
      if (docket) {
        const record = diff as Record<string, unknown>;
        inference = parseInference(drafter.text);
        if (inference) {
          statePatch = await derivePatch(db, record, inference);
          diff = { ...record, inference, statePatch };
        } else {
          vocabularyFailed = true;
        }
      } else {
        const overwritten = parseDrafter(drafter.text);
        if (overwritten) {
          body = overwritten.body;
          diff = overwritten.diff;
        }
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
          tool: reviewerTool.tool,
          threshold,
          guidance: guidanceRefs
        });
        continue;
      }
      const scored = scoreReviewer(draft, reviewer.text, threshold, diff);
      const createdAt = nowIso(gatewayDeps);
      if (!docket) {
        await persist(db, draft, {
          body,
          diff,
          confidence: scored.confidence,
          evalSummary: scored.evalSummary,
          createdAt,
          guidance: guidanceRefs
        });
        continue;
      }
      // Out-of-vocabulary → the inference is dropped and the Draft is
      // record-only; the failure is public with rule identity and blocks
      // auto-approve (hard fails always do), written in the same batch as
      // `draft.evaluated` so a retry never sees one without the other.
      const evalSummary = vocabularyFailed
        ? {
            ...scored.evalSummary,
            ineligible: scored.evalSummary.ineligible.includes("guardrail_fail")
              ? scored.evalSummary.ineligible
              : [...scored.evalSummary.ineligible, "guardrail_fail" as const]
          }
        : scored.evalSummary;
      await persist(db, draft, {
        body,
        diff,
        confidence: scored.confidence,
        evalSummary,
        createdAt,
        guidance: guidanceRefs,
        extraPayload: {
          inference,
          statePatch: statePatch ?? {},
          reviewer: {
            confidence: scored.confidence,
            disagrees: scored.evalSummary.disagreement.flagged,
            disagreement: scored.evalSummary.disagreement.description
          }
        },
        extraStatements: vocabularyFailed
          ? [
              appendStmt(
                db,
                {
                  id: evidenceId(draft.runId, "guardrails.failed", draft.id),
                  runId: draft.runId,
                  event: "guardrails.failed",
                  payload: {
                    draftId: draft.id,
                    ruleId: INFERENCE_VOCABULARY_RULE_ID
                  },
                  createdAt
                },
                { draftId: draft.id, state: "unevaluated" }
              )
            ]
          : []
      });
    } catch (err) {
      if (draft.revisionIndex > 0) {
        return { budgetStopped: isBudgetStopped(err) };
      }
      const timestamp = nowIso(gatewayDeps);
      let persistFailed = false;
      try {
        if (pendingTool) {
          await persistToolDeny(db, gatewayDeps, draft, {
            body,
            diff,
            role: pendingTool.role,
            tool: pendingTool.tool,
            threshold,
            guidance: guidanceRefs
          });
          continue;
        }
        await persistEvalsNotRun(
          db,
          draft,
          body,
          diff,
          timestamp,
          threshold,
          guidanceRefs,
          err instanceof GatewayError
            ? `Evaluation did not complete: ${err.code}.`
            : "Evaluation stopped after an unexpected error."
        );
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
              timestamp,
              threshold,
              NO_GUIDANCE,
              "Evaluation was skipped after a preceding evaluation stopped the run."
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
