import {
  decimalAtMost,
  resolveCostPolicy,
  tokenCostCents,
  reportedUsdCents,
  validatePolicy,
  type CostPolicy
} from "./costPolicy";
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
 *      also refuse when `spend + admissionBoundCents > budget`
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
 * whose `name` matches the seeded config. Provider costs are optional reported USD;
 * budget accounting is derived centrally from validated policy and usage.
 */
export interface LlmProvider {
  readonly name: string;

  complete(args: {
    model: string;
    prompt: string;
    signal?: AbortSignal;
    policy: CostPolicy;
    now?: () => string;
  }): Promise<{
    text: string;
    inputTokens: number | null;
    outputTokens: number | null;
    reportedCostUsd?: unknown;
    accountingIssue?: string;
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
  /** Explicit policy seam for deterministic tests; production uses reviewed allowlist. */
  costPolicy?: typeof resolveCostPolicy;
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
  if (await llmCallsRepo.hasAccountingIssue(db, runId)) {
    throw new GatewayError(
      "accounting_uncertain",
      "Run accounting requires reconciliation before further inference."
    );
  }
  let policy: CostPolicy;
  try {
    policy = validatePolicy(
      (deps.costPolicy ?? resolveCostPolicy)(
        mapping.provider,
        mapping.model,
        now()
      ),
      now()
    );
  } catch {
    throw new GatewayError(
      "cost_policy_invalid",
      "Missing, expired, unsupported, or invalid provider cost policy."
    );
  }
  if (policy.provider !== mapping.provider || policy.model !== mapping.model)
    throw new GatewayError(
      "cost_policy_invalid",
      "Cost policy does not match the configured model."
    );
  const admissionBoundCents = tokenCostCents(
    policy,
    policy.inputTokens,
    policy.outputTokens
  );
  if (spend + admissionBoundCents > budget) {
    await refuseBudget(
      deps,
      run,
      runId,
      `Accounting ${spend} plus bound ${admissionBoundCents} exceeds ceiling ${budget}; call refused.`
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
      (signal) =>
        provider.complete({
          model: mapping.model,
          prompt,
          signal,
          policy,
          now
        }),
      PROVIDER_TIMEOUT_MS,
      mapping.provider
    );
  } catch (cause) {
    if (cause instanceof GatewayError) throw cause;
    throw new GatewayError(
      "provider_error",
      `Provider '${mapping.provider}' failed: ${String(cause)}`
    );
  }

  // 7. Record the call (Evidence) + bump Run spend.
  const timestamp = now();
  const validToken = (n: unknown): n is number =>
    typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  const tokens =
    validToken(completion.inputTokens) && validToken(completion.outputTokens)
      ? { input: completion.inputTokens, output: completion.outputTokens }
      : null;
  const estimatedCostCents = tokens
    ? tokenCostCents(policy, tokens.input, tokens.output)
    : null;
  let reportedCostCents: number | null = null;
  try {
    reportedCostCents = reportedUsdCents(completion.reportedCostUsd);
  } catch {
    /* Preserve an unrepresentable amount below and block this Run. */
  }
  const reportedCostUsd =
    typeof completion.reportedCostUsd === "number" &&
    Number.isFinite(completion.reportedCostUsd) &&
    completion.reportedCostUsd >= 0
      ? String(completion.reportedCostUsd)
      : null;
  const issues: string[] = [];
  if (!tokens) issues.push("missing_or_invalid_token_usage");
  if (
    tokens &&
    (tokens.input > policy.inputTokens || tokens.output > policy.outputTokens)
  )
    issues.push("token_limit_exceeded");
  if (
    (mapping.provider === "openrouter" || reportedCostUsd != null) &&
    reportedCostCents == null
  )
    issues.push("missing_or_invalid_reported_cost");
  if (reportedCostCents != null && reportedCostCents > admissionBoundCents)
    issues.push("reported_cost_exceeds_bound");
  if (completion.accountingIssue) issues.push(completion.accountingIssue);
  const accountingIssue = issues.length ? issues.join("; ") : null;
  const costCents = accountingIssue
    ? Math.max(
        admissionBoundCents,
        estimatedCostCents ?? 0,
        reportedCostCents ?? 0
      )
    : (reportedCostCents ?? estimatedCostCents ?? admissionBoundCents);
  const costBasis = accountingIssue
    ? "conservative_bound"
    : reportedCostCents != null
      ? "provider_reported"
      : "token_estimate";
  await llmCallsRepo.recordCall(db, {
    id: newId(),
    runId,
    role,
    provider: mapping.provider,
    model: mapping.model,
    tokens,
    costCents,
    currency: CURRENCY,
    createdAt: timestamp,
    costBasis,
    admissionBoundCents,
    estimatedCostCents,
    reportedCostCents,
    reportedCostUsd,
    reportedCostSource:
      reportedCostUsd == null ? null : `${mapping.provider}.usage.cost`,
    policy,
    accountingIssue
  });
  if (costCents > 0) await runsRepo.bumpSpend(db, runId, costCents);
  if (accountingIssue)
    throw new GatewayError(
      "accounting_uncertain",
      "Provider usage is incomplete or exceeds the reviewed bound; further inference is blocked."
    );

  return {
    text: completion.text,
    role,
    provider: mapping.provider,
    model: mapping.model,
    inputTokens: completion.inputTokens,
    outputTokens: completion.outputTokens,
    costCents,
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
    async complete({
      model,
      prompt,
      policy,
      now = () => new Date().toISOString(),
      signal: _signal
    }) {
      revalidateBeforeInference(policy, now());
      const result = (await env.AI.run(model, {
        prompt,
        max_tokens: policy.outputTokens
      })) as {
        response?: unknown;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          cost?: unknown;
        };
      };
      return {
        text: typeof result.response === "string" ? result.response : "",
        accountingIssue:
          typeof result.response === "string" ? undefined : "non_text_output",
        inputTokens: result.usage?.prompt_tokens ?? null,
        outputTokens: result.usage?.completion_tokens ?? null,
        reportedCostUsd: null
      };
    }
  };
}

function revalidateBeforeInference(policy: CostPolicy, now: string): void {
  try {
    validatePolicy(policy, now);
  } catch {
    throw new GatewayError(
      "cost_policy_invalid",
      "Cost policy expired or became invalid before inference."
    );
  }
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
    async complete({
      model,
      prompt,
      signal,
      policy,
      now = () => new Date().toISOString()
    }) {
      // Verify the exact bounded route before paid inference. No model/provider fallback.
      try {
        const metadata = await fetch(
          `https://openrouter.ai/api/v1/models/${model}/endpoints`,
          { signal }
        );
        if (!metadata.ok)
          throw new GatewayError(
            "cost_policy_invalid",
            "Endpoint pricing unavailable."
          );
        const endpoints = (await metadata.json()) as {
          data?: {
            endpoints?: Array<{
              tag?: string;
              context_length?: number;
              supported_parameters?: string[];
              pricing?: Record<string, unknown>;
            }>;
          };
        };
        // A base slug includes regional variants: validate every eligible endpoint.
        const eligible =
          endpoints.data?.endpoints?.filter(
            (e) =>
              e.tag === "amazon-bedrock" || e.tag?.startsWith("amazon-bedrock/")
          ) ?? [];
        const limits: Record<string, string> = {
          prompt: "0.000003",
          completion: "0.000015",
          input_cache_read: "0.000006",
          input_cache_write: "0.000006",
          input_cache_write_1h: "0.000006",
          request: "0",
          image: "0",
          discount: "0"
        };
        const supported =
          eligible.length > 0 &&
          eligible.every((endpoint) => {
            const pricing = endpoint.pricing;
            // Search is not requested; cache replacement rates are covered by the input ceiling.
            const validPrices =
              pricing &&
              Object.entries(pricing).every(([key, value]) => {
                if (key === "web_search") return true;
                if (key === "overrides")
                  return Array.isArray(value) && value.length === 0;
                return key in limits && decimalAtMost(value, limits[key]!);
              });
            return (
              endpoint.context_length === policy.inputTokens &&
              endpoint.supported_parameters?.includes("max_tokens") &&
              validPrices &&
              pricing?.prompt != null &&
              pricing.completion != null
            );
          });
        if (!supported)
          throw new GatewayError(
            "cost_policy_invalid",
            "Endpoint pricing, context, or billing tiers cannot enforce the reviewed bound."
          );
      } catch (error) {
        if (error instanceof GatewayError) throw error;
        throw new GatewayError(
          "cost_policy_invalid",
          "Endpoint pricing could not be validated."
        );
      }
      revalidateBeforeInference(policy, now());
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "cf-aig-max-attempts": "1",
          "cf-aig-skip-cache": "true"
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: policy.outputTokens,
          stream: false,
          transforms: [],
          provider: {
            only: ["amazon-bedrock"],
            allow_fallbacks: false,
            require_parameters: true,
            max_price: { prompt: 3, completion: 15, request: 0, image: 0 }
          }
        }),
        signal
      });
      if (!response.ok) {
        throw new Error(`OpenRouter gateway HTTP ${response.status}`);
      }
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          cost?: unknown;
        };
      };
      const text = body.choices?.[0]?.message?.content;
      return {
        text: typeof text === "string" ? text : "",
        accountingIssue:
          typeof text === "string" ? undefined : "non_text_output",
        inputTokens: body.usage?.prompt_tokens ?? null,
        outputTokens: body.usage?.completion_tokens ?? null,
        reportedCostUsd: body.usage?.cost
      };
    }
  };
}
