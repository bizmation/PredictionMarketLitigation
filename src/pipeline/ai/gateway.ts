import type { Db } from "../../shared/db/client";
import * as draftsRepo from "../../shared/db/repos/draftsRepo";
import * as evidenceRepo from "../../shared/db/repos/evidenceRepo";
import * as llmCallsRepo from "../../shared/db/repos/llmCallsRepo";
import * as runsRepo from "../../shared/db/repos/runsRepo";
import type { GatewayErrorCode } from "../../shared/schemas/gateway";
import {
  GATEWAY_ROLE_VALUES,
  type GatewayRole
} from "../../shared/schemas/vocabulary";
import { defaultBudgetCents, resolveRoleModel } from "../config/modelRoles";
import { evidenceId } from "../connectors/connector";
import { GUARDRAIL_RULE_ID, isToolAllowed } from "./actionPolicy";

/**
 * Story 3.2 — the single locked AI gateway.
 *
 * Agents call `gateway.complete({ role, ... })` ONLY for LLM completions
 * (architecture #Service Boundaries: `pipeline/ai/gateway.ts` is "only
 * module that calls LLMs"). Tool requests go through `invokeTool` in this
 * same module — never through `complete()`, and never by importing F1 write
 * repos. No ad-hoc provider SDKs or hardcoded model ids live outside this
 * directory.
 *
 * The flow, in order (mirrors the I/O matrix):
 *   1. validate the role vocabulary (`unknown_role`)
 *   2. fail closed if no provider is configured (`gateway_not_configured`)
 *   3. load the Run, resolve the role→model from D1 config (`role_not_configured`)
 *   4. resolve + enforce the budget ceiling BEFORE the provider call
 *      (`budget_stopped` — marks the Run stopped + `run.stopped` evidence)
 *   5. delegate to the provider; on error, surface a typed `provider_error`
 *      with no spend row written
 *   6. record the call + bump spend; return the result
 */

export class GatewayError extends Error {
  readonly code: GatewayErrorCode;

  constructor(code: GatewayErrorCode, message: string) {
    super(message);
    this.name = "GatewayError";
    this.code = code;
  }
}

/**
 * The provider contract the gateway delegates to. The default is the existing
 * Workers AI binding; the seam exists so tests can inject a fake and a later
 * paid provider (OpenRouter via AI Gateway) slots in without touching the
 * budget/enforcement logic. `costCents` is real integer cents.
 */
export interface LlmProvider {
  readonly name: string;
  complete(args: { model: string; prompt: string }): Promise<{
    text: string;
    inputTokens: number | null;
    outputTokens: number | null;
    costCents: number;
  }>;
}

export interface GatewayDeps {
  db: Db;
  provider: LlmProvider;
  /** Supplies `now()` output; injectable for deterministic evidence timestamps. */
  now?: () => string;
  /** Random id supplier; injectable for deterministic call/evidence ids. */
  newId?: () => string;
}

export interface GatewayInput {
  role: GatewayRole;
  runId: string;
  prompt: string;
}

export interface GatewayResult {
  text: string;
  role: GatewayRole;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  costCents: number;
  currency: string;
}

export interface InvokeToolInput {
  role: GatewayRole;
  runId: string;
  draftId: string;
  tool: string;
  /** Batched in the same deny write (INSERT OR IGNORE on the event). */
  extraStatements?: D1PreparedStatement[];
}

export interface InvokeToolResult {
  denied: true;
  ruleId: typeof GUARDRAIL_RULE_ID;
  tool: string;
}

const CURRENCY = "USD";

export async function complete(
  deps: GatewayDeps,
  input: GatewayInput
): Promise<GatewayResult> {
  const { db, provider } = deps;
  const now = deps.now ?? (() => new Date().toISOString());
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const { role, runId, prompt } = input;

  // 1. Role vocabulary — reject before any provider or storage touch.
  if (
    !GATEWAY_ROLE_VALUES.includes(role as (typeof GATEWAY_ROLE_VALUES)[number])
  ) {
    throw new GatewayError(
      "unknown_role",
      `Unknown gateway role: ${String(role)}`
    );
  }

  // 2. Provider must be configured (fail closed).
  if (!provider) {
    throw new GatewayError(
      "gateway_not_configured",
      "No AI provider configured for the gateway."
    );
  }

  // 3. Run + role→model resolution.
  const run = await runsRepo.getRunById(db, runId);
  if (!run) {
    throw new GatewayError("run_not_found", `Run ${runId} not found.`);
  }
  const mapping = await resolveRoleModel(db, role);
  if (!mapping) {
    throw new GatewayError(
      "role_not_configured",
      `No model configured for role '${role}'.`
    );
  }

  // 4. Budget ceiling, enforced BEFORE the provider call (integer cents).
  //    The design leans on the recorded ledger for spend, but the ceiling is
  //    authoritative from the Run row (fall back to the config default).
  const budget = run.budgetCents ?? (await defaultBudgetCents(db));
  if (budget == null) {
    throw new GatewayError(
      "gateway_not_configured",
      "No budget ceiling configured (run and config default are both null)."
    );
  }
  const spend = await llmCallsRepo.totalSpendForRun(db, runId);
  if (spend >= budget) {
    // Budget-stop: mark the Run stopped + write run.stopped evidence ONLY when
    // it is still `running` — a terminal Run (stopped/published/failed/rejected)
    // must still throw but must not be re-marked or re-evidenced (idempotent).
    if (run.status === "running") {
      const timestamp = now();
      await db.batch([
        runsRepo.markStoppedStmt(db, runId, timestamp),
        db
          .prepare(
            `INSERT OR IGNORE INTO evidence_events
               (id, run_id, seq, event, payload_json, created_at)
             VALUES (?, ?, (SELECT COALESCE(MAX(seq), -1) + 1
                              FROM evidence_events WHERE run_id = ?),
                     'run.stopped', ?, ?)`
          )
          .bind(
            `ev-budget-stop-${runId}`,
            runId,
            runId,
            JSON.stringify({ reason: "budget_stopped" }),
            timestamp
          )
      ]);
    }
    throw new GatewayError(
      "budget_stopped",
      `Spend ${spend} reached the ceiling ${budget}; call refused.`
    );
  }
  if (run.status !== "running") {
    throw new GatewayError(
      "budget_stopped",
      `Run is not running (${run.status}); call refused.`
    );
  }

  // 5. Delegate to the provider.
  let completion: Awaited<ReturnType<LlmProvider["complete"]>>;
  try {
    completion = await provider.complete({ model: mapping.model, prompt });
  } catch (cause) {
    throw new GatewayError(
      "provider_error",
      `Provider '${mapping.provider}' failed: ${String(cause)}`
    );
  }

  // 6. Record the call (Evidence) + bump Run spend.
  const timestamp = now();
  const tokens =
    completion.inputTokens == null && completion.outputTokens == null
      ? null
      : {
          input: completion.inputTokens ?? 0,
          output: completion.outputTokens ?? 0
        };
  await llmCallsRepo.recordCall(db, {
    id: newId(),
    runId,
    role,
    provider: mapping.provider,
    model: mapping.model,
    tokens,
    costCents: completion.costCents,
    currency: CURRENCY,
    createdAt: timestamp
  });
  if (completion.costCents > 0) {
    await runsRepo.bumpSpend(db, runId, completion.costCents);
  }

  return {
    text: completion.text,
    role,
    provider: mapping.provider,
    model: mapping.model,
    inputTokens: completion.inputTokens,
    outputTokens: completion.outputTokens,
    costCents: completion.costCents,
    currency: CURRENCY
  };
}

/**
 * Story 3.6 — the only tool front door. Consults the frozen empty per-role
 * allowlist and writes `guardrails.failed`. Never executes a tool body
 * (`publish_f1` included). Deny is a result, not `provider_error`.
 */
export async function invokeTool(
  deps: GatewayDeps,
  input: InvokeToolInput
): Promise<InvokeToolResult> {
  const { db } = deps;
  const now = deps.now ?? (() => new Date().toISOString());
  const { role, runId, draftId, tool } = input;

  const run = await runsRepo.getRunById(db, runId);
  if (!run) {
    throw new GatewayError("run_not_found", `Run ${runId} not found.`);
  }

  // Allowlists are frozen empty. Consult them; never execute a tool body.
  if (!isToolAllowed(role, tool)) {
    const createdAt = now();
    const payload = {
      draftId,
      ruleId: GUARDRAIL_RULE_ID,
      tool
    };
    const statements: D1PreparedStatement[] = [
      evidenceRepo.appendEventStmt(db, {
        id: evidenceId(runId, "guardrails.failed", draftId),
        runId,
        event: "guardrails.failed",
        payload,
        createdAt
      })
    ];
    const draft = await draftsRepo.getById(db, draftId);
    if (draft?.evalSummary != null) {
      statements.push(
        await draftsRepo.applyGuardrailIneligibleStmt(db, {
          id: draftId,
          updatedAt: createdAt
        })
      );
    }
    statements.push(...(input.extraStatements ?? []));
    await db.batch(statements);
  }

  return { denied: true, ruleId: GUARDRAIL_RULE_ID, tool };
}

/**
 * Build the default Workers AI provider from `env.AI`. Fails closed with a
 * typed `gateway_not_configured` when the binding is absent (local dev without
 * a token, or the test config which deliberately omits `ai`).
 */
export function createWorkersAiProvider(env: Env): LlmProvider | null {
  if (!env.AI) return null;
  return {
    name: "workersai",
    async complete({ model, prompt }) {
      // Workers AI zero-dollar path: cost is 0 until a paid provider lands; the
      // gateway still records the call so budget accounting is real.
      const result = (await env.AI.run(model, {
        prompt
      })) as {
        response?: unknown;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      if (typeof result.response !== "string") {
        throw new Error("non-text model output");
      }
      return {
        text: result.response,
        inputTokens: result.usage?.prompt_tokens ?? null,
        outputTokens: result.usage?.completion_tokens ?? null,
        costCents: 0
      };
    }
  };
}
