import type { Db } from "../../shared/db/client";
import * as draftsRepo from "../../shared/db/repos/draftsRepo";
import * as llmCallsRepo from "../../shared/db/repos/llmCallsRepo";
import * as runsRepo from "../../shared/db/repos/runsRepo";
import { appendStmt } from "../projector/evidence";
import type { GatewayErrorCode } from "../../shared/schemas/gateway";
import {
  GATEWAY_ROLE_VALUES,
  type GatewayRole
} from "../../shared/schemas/vocabulary";
import {
  PROVIDER_TIMEOUT_MS,
  withAbortableDeadline
} from "../../shared/lib/timeouts";
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
 *   4. select the provider whose `name` equals the config's provider
 *      (`gateway_not_configured` on mismatch / missing)
 *   5. resolve + enforce the budget ceiling BEFORE the provider call
 *      (`budget_stopped` — marks the Run stopped + `run.stopped` evidence);
 *      also refuse when `spend + estimateCents > budget`
 *   6. delegate to the provider under `PROVIDER_TIMEOUT_MS` (story 3.19)
 *      with an abortable deadline signal (story 3.20); on error or deadline,
 *      surface a typed `provider_error` with no spend row written — a hung
 *      model is a per-Draft `evals_not_run`, never a budget stop and never a
 *      Run failure by itself
 *   7. record the call + bump spend; return the result
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
 * The provider contract the gateway delegates to. Production registers
 * Workers AI and (when secrets are set) OpenRouter; tests inject a fake
 * whose `name` matches the seeded config. `costCents` is real integer cents.
 */
export interface LlmProvider {
  readonly name: string;
  /** Optional pre-call estimate in integer cents; missing means 0. */
  estimateCents?(args: { model: string; prompt: string }): number;
  complete(args: {
    model: string;
    prompt: string;
    signal?: AbortSignal;
  }): Promise<{
    text: string;
    inputTokens: number | null;
    outputTokens: number | null;
    costCents: number;
  }>;
}

export interface GatewayDeps {
  db: Db;
  /**
   * Single injected provider (tests). Used when its `name` matches the
   * role→model config and no matching entry exists in `providers`.
   */
  provider?: LlmProvider | null;
  /** Production registry; selected by `name === mapping.provider`. */
  providers?: LlmProvider[];
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

function selectProvider(
  deps: GatewayDeps,
  providerName: string
): LlmProvider | undefined {
  const fromList = deps.providers?.find((p) => p.name === providerName);
  if (fromList) return fromList;
  if (deps.provider && deps.provider.name === providerName) {
    return deps.provider;
  }
  return undefined;
}

async function refuseBudget(
  deps: GatewayDeps,
  run: NonNullable<Awaited<ReturnType<typeof runsRepo.getRunById>>>,
  runId: string,
  message: string
): Promise<never> {
  const now = deps.now ?? (() => new Date().toISOString());
  // Budget-stop: mark the Run stopped + write run.stopped evidence ONLY when
  // it is still `running` — a terminal Run (stopped/published/failed/rejected)
  // must still throw but must not be re-marked or re-evidenced (idempotent).
  if (run.status === "running") {
    const timestamp = now();
    await deps.db.batch([
      runsRepo.markStoppedStmt(deps.db, runId, timestamp),
      appendStmt(deps.db, {
        id: `ev-budget-stop-${runId}`,
        runId,
        event: "run.stopped",
        payload: { reason: "budget_stopped" },
        createdAt: timestamp
      })
    ]);
  }
  throw new GatewayError("budget_stopped", message);
}

export async function complete(
  deps: GatewayDeps,
  input: GatewayInput
): Promise<GatewayResult> {
  const { db } = deps;
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
  if (
    !deps.provider &&
    !(deps.providers != null && deps.providers.length > 0)
  ) {
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

  // 4. Provider whose name equals the config (mismatch → gateway_not_configured).
  const provider = selectProvider(deps, mapping.provider);
  if (!provider) {
    throw new GatewayError(
      "gateway_not_configured",
      `No AI provider named '${mapping.provider}' is registered.`
    );
  }

  // 5. Budget ceiling, enforced BEFORE the provider call (integer cents).
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
    await refuseBudget(
      deps,
      run,
      runId,
      `Spend ${spend} reached the ceiling ${budget}; call refused.`
    );
  }
  const estimateCents =
    provider.estimateCents?.({ model: mapping.model, prompt }) ?? 0;
  if (spend + estimateCents > budget) {
    await refuseBudget(
      deps,
      run,
      runId,
      `Spend ${spend} plus estimate ${estimateCents} would pass the ceiling ${budget}; call refused.`
    );
  }
  const awaitingRoles =
    role === "steward" || role === "drafter" || role === "reviewer";
  const statusOk =
    run.status === "running" || (awaitingRoles && run.status === "awaiting");
  if (!statusOk) {
    throw new GatewayError(
      "budget_stopped",
      `Run is not running (${run.status}); call refused.`
    );
  }

  // 6. Delegate to the provider. The abortable deadline wraps the provider
  //    seam so OpenRouter's fetch can cancel; Workers AI ignores the signal.
  let completion: Awaited<ReturnType<LlmProvider["complete"]>>;
  try {
    completion = await withAbortableDeadline(
      (signal) => provider.complete({ model: mapping.model, prompt, signal }),
      PROVIDER_TIMEOUT_MS,
      mapping.provider
    );
  } catch (cause) {
    throw new GatewayError(
      "provider_error",
      `Provider '${mapping.provider}' failed: ${String(cause)}`
    );
  }

  // 7. Record the call (Evidence) + bump Run spend.
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
    const draft = await draftsRepo.getById(db, draftId);
    const statements: D1PreparedStatement[] = [
      appendStmt(
        db,
        {
          id: evidenceId(runId, "guardrails.failed", draftId),
          runId,
          event: "guardrails.failed",
          payload,
          createdAt
        },
        draft ? { draftId, state: "undecided" } : undefined
      )
    ];
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
    async complete({ model, prompt, signal: _signal }) {
      // Workers AI zero-dollar path: cost is 0; the gateway still records the
      // call so budget accounting is real. The binding's third argument is
      // gateway options only — the deadline signal cannot cancel `env.AI.run`
      // (Cloudflare docs, worker-binding-methods, 2026-09-17).
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

function nonEmptySecret(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Production provider registry: Workers AI when `env.AI` is bound, OpenRouter
 * when all three secrets are set. Shared by the Workflow and the steering POST.
 */
export function llmProvidersFromEnv(env: Env): LlmProvider[] {
  return [createWorkersAiProvider(env), createOpenRouterProvider(env)].filter(
    (p): p is LlmProvider => p != null
  );
}

/**
 * Story 3.20 — OpenRouter through the AI Gateway provider endpoint. Present
 * only when `OPENROUTER_API_KEY`, `AI_GATEWAY_ID`, and `CLOUDFLARE_ACCOUNT_ID`
 * are all non-empty. Does not call `env.AI.run`.
 */
export function createOpenRouterProvider(env: Env): LlmProvider | null {
  const apiKey = env.OPENROUTER_API_KEY;
  const gatewayId = env.AI_GATEWAY_ID;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  if (
    !nonEmptySecret(apiKey) ||
    !nonEmptySecret(gatewayId) ||
    !nonEmptySecret(accountId)
  ) {
    return null;
  }
  const url = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/openrouter/chat/completions`;
  return {
    name: "openrouter",
    estimateCents({ prompt }) {
      // Input-side only: promptChars/4 tokens, 1 cent per 1,000, minimum 1.
      return Math.max(1, Math.ceil(prompt.length / 4 / 1000));
    },
    async complete({ model, prompt, signal }) {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }]
        }),
        signal
      });
      if (!response.ok) {
        throw new Error(`OpenRouter gateway HTTP ${response.status}`);
      }
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = body.choices?.[0]?.message?.content;
      if (typeof text !== "string") {
        throw new Error("non-text model output");
      }
      const usage = body.usage;
      if (usage == null) {
        return {
          text,
          inputTokens: null,
          outputTokens: null,
          costCents: 1
        };
      }
      const inputTokens = usage.prompt_tokens ?? null;
      const outputTokens = usage.completion_tokens ?? null;
      const totalTokens = (inputTokens ?? 0) + (outputTokens ?? 0);
      return {
        text,
        inputTokens,
        outputTokens,
        costCents: Math.max(1, Math.ceil(totalTokens / 1000))
      };
    }
  };
}
