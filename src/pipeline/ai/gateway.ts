import {
  decimalAtMost,
  decimalProductAtMost,
  resolveCostPolicy,
  tokenCostCents,
  reportedUsdCents,
  usdPerMillionToCentsPerToken,
  validatePolicy,
  type CostPolicy
} from "./costPolicy";
import type { Db } from "../../shared/db/client";
import * as draftsRepo from "../../shared/db/repos/draftsRepo";
import * as accounting from "../../shared/db/repos/llmAccountingRepo";
import * as runsRepo from "../../shared/db/repos/runsRepo";
import { appendStmt } from "../projector/evidence";
import type { GatewayErrorCode } from "../../shared/schemas/gateway";
import {
  GATEWAY_ROLE_VALUES,
  type GatewayRole
} from "../../shared/schemas/vocabulary";
import {
  DEEPINFRA_CHAT_TIMEOUT_MS,
  isAbortError,
  isTimeoutError,
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
 *   6. delegate to the provider under its chat deadline (story 3.19).
 *      DeepInfra chat uses `DEEPINFRA_CHAT_TIMEOUT_MS`; every other
 *      provider, and DeepInfra catalog/prepare, stay on `PROVIDER_TIMEOUT_MS`.
 *      with an abortable deadline signal (story 3.20); on error or deadline,
 *      surface a typed `provider_error` with no spend row written — a hung
 *      model is a per-Draft `evals_not_run`, never a budget stop and never a
 *      Run failure by itself
 *   7. record the call + bump spend; return the result
 */

export const DEEPINFRA_CATALOG_USER_AGENT =
  "PredictionMarketLitigation/0.1.0 (+https://predictionmarketlitigation.com)";

/** Catalog GET init. Workerd accepts only `follow` or `manual`. */
export function deepInfraCatalogRequestInit(signal: AbortSignal): RequestInit {
  return {
    signal,
    redirect: "manual",
    headers: {
      Accept: "application/json",
      "User-Agent": DEEPINFRA_CATALOG_USER_AGENT
    }
  };
}

/** Chat POST init, including the JSON body. Same redirect mode as the catalog. */
export function deepInfraChatRequestInit(
  headers: Headers,
  signal: AbortSignal | undefined,
  body: string
): RequestInit {
  return {
    method: "POST",
    redirect: "manual",
    signal,
    headers,
    body
  };
}

const DIAGNOSTIC_TEXT_MAX = 180;

export type CostPolicyDetail = {
  stage: string;
  errorName?: string;
  errorMessage?: string;
  status?: number;
  bodyPrefix?: string;
  field?: string;
};

export class GatewayError extends Error {
  readonly code: GatewayErrorCode;
  readonly detail?: CostPolicyDetail;

  constructor(
    code: GatewayErrorCode,
    message: string,
    detail?: CostPolicyDetail
  ) {
    super(message);
    this.name = "GatewayError";
    this.code = code;
    this.detail = detail;
  }
}

function diagnosticText(value: string): string {
  const collapsed = value
    .replace(/bearer\s+\S+/gi, "bearer [redacted]")
    .replace(/\s+/g, " ")
    .trim();
  return collapsed.length > DIAGNOSTIC_TEXT_MAX
    ? collapsed.slice(0, DIAGNOSTIC_TEXT_MAX)
    : collapsed;
}

function errorFacts(
  error: unknown
): Pick<CostPolicyDetail, "errorName" | "errorMessage"> {
  if (error instanceof Error) {
    return {
      errorName: error.name || "Error",
      errorMessage: diagnosticText(error.message)
    };
  }
  return { errorName: "Error", errorMessage: diagnosticText(String(error)) };
}

function costPolicyMessage(stage: string, status?: number): string {
  return status == null
    ? `cost_policy_invalid: ${stage}`
    : `cost_policy_invalid: ${stage} (http ${status})`;
}

function logCostPolicy(detail: CostPolicyDetail): void {
  console.warn({
    event: "cost_policy_invalid",
    stage: detail.stage,
    ...(detail.errorName ? { errorName: detail.errorName } : {}),
    ...(detail.errorMessage ? { errorMessage: detail.errorMessage } : {}),
    ...(detail.status == null ? {} : { status: detail.status }),
    ...(detail.bodyPrefix ? { bodyPrefix: detail.bodyPrefix } : {}),
    ...(detail.field ? { field: detail.field } : {})
  });
}

function throwCostPolicy(
  stage: string,
  extra: Omit<CostPolicyDetail, "stage"> = {},
  ctor: typeof GatewayError = GatewayError
): never {
  const detail: CostPolicyDetail = { stage, ...extra };
  logCostPolicy(detail);
  throw new ctor(
    "cost_policy_invalid",
    costPolicyMessage(stage, extra.status),
    detail
  );
}

class ProvenPreDispatchRefusal extends GatewayError {}

/**
 * The provider contract the gateway delegates to. Production registers
 * Workers AI and (when configured) OpenRouter/DeepInfra; tests inject a fake
 * whose `name` matches the seeded config. Provider costs are optional reported USD;
 * budget accounting is derived centrally from validated policy and usage.
 */
export interface LlmProvider {
  readonly name: string;
  /** Free, bounded, request-scoped credential resolution before reservation. */
  prepare?(signal: AbortSignal): Promise<LlmProvider["complete"]>;
  preflight?(args: {
    model: string;
    policy: CostPolicy;
    now: () => string;
  }): Promise<void>;

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
    providerRequestId?: string;
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
  operationKey: string;
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
  if (!input.operationKey?.trim())
    throw new GatewayError(
      "operation_conflict",
      "A stable business operation key is required."
    );
  const requestFingerprint = await accounting.fingerprint({
    role,
    runId,
    prompt
  });
  const existing = await accounting.getOperation(db, runId, input.operationKey);
  const replay = (op: accounting.Operation): GatewayResult => {
    if (op.fingerprint !== requestFingerprint)
      throw new GatewayError(
        "operation_conflict",
        "Logical call payload changed."
      );
    if (op.result_json) return JSON.parse(op.result_json) as GatewayResult;
    if (op.state === "reconciled" || op.state === "released")
      throw new GatewayError(
        "result_unavailable",
        "Reconciled operation has no replayable result."
      );
    throw new GatewayError(
      op.issue ? "accounting_uncertain" : "operation_pending",
      "Existing operation cannot be dispatched again."
    );
  };
  if (existing) return replay(existing);

  const refuseAfterIdentityCheck = async (
    message: string
  ): Promise<GatewayResult> => {
    const duplicate = await accounting.getOperation(
      db,
      runId,
      input.operationKey
    );
    if (duplicate) return replay(duplicate);
    return refuseBudget(deps, run!, runId, message);
  };
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
  const currentAccounting = await accounting.accountingForRun(db, runId);
  if (currentAccounting?.issueCount)
    throw new GatewayError(
      "accounting_uncertain",
      "Run accounting requires reconciliation before inference."
    );
  if ((currentAccounting?.totalCents ?? 0) >= budget)
    return refuseAfterIdentityCheck("Budget ceiling reached.");
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
  } catch (error) {
    throwCostPolicy("policy_lookup", errorFacts(error));
  }
  if (policy.provider !== mapping.provider || policy.model !== mapping.model)
    throwCostPolicy("policy_model_mismatch");
  const admissionBoundCents = tokenCostCents(
    policy,
    policy.inputTokens,
    policy.outputTokens
  );
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

  if ((currentAccounting?.totalCents ?? 0) + admissionBoundCents > budget)
    return refuseAfterIdentityCheck(
      "Available balance is below the required bound."
    );
  // Definitively free validation runs before reservation/dispatch ownership.
  if (provider.preflight)
    await provider.preflight({ model: mapping.model, policy, now });
  let invoke = provider.complete.bind(provider);
  if (provider.prepare) {
    try {
      invoke = await withAbortableDeadline(
        (signal) => provider.prepare!(signal),
        PROVIDER_TIMEOUT_MS,
        "provider preparation"
      );
    } catch {
      throw new GatewayError(
        "gateway_not_configured",
        "Provider credentials unavailable."
      );
    }
  }
  revalidateBeforeInference(policy, now());
  const owner = crypto.randomUUID();
  let operation: accounting.Operation;
  try {
    operation = await accounting.reserve(db, {
      id: newId(),
      runId,
      role,
      key: input.operationKey,
      fingerprint: requestFingerprint,
      owner,
      bound: admissionBoundCents,
      budget,
      policy,
      now: now(),
      awaiting: awaitingRoles
    });
  } catch (error) {
    if (error instanceof accounting.AccountingConflict)
      throw new GatewayError("operation_conflict", error.message);
    if (error instanceof accounting.AccountingRefused)
      return refuseAfterIdentityCheck(error.message);
    throw error;
  }
  if (operation.owner !== owner) return replay(operation);
  await accounting.claimDispatch(db, operation, owner, now());

  const retainCompletion = async (
    value: Awaited<ReturnType<LlmProvider["complete"]>>,
    issue: string
  ) => {
    let observed = admissionBoundCents;
    try {
      observed = Math.max(
        observed,
        reportedUsdCents(value.reportedCostUsd) ?? 0
      );
    } catch {
      /* Preserve raw unrepresentable report. */
    }
    try {
      observed = Math.max(
        observed,
        tokenCostCents(policy, value.inputTokens!, value.outputTokens!)
      );
    } catch {
      /* Invalid usage remains evidence. */
    }
    await accounting.retainResponseEvidence(
      db,
      operation,
      value,
      observed,
      value.providerRequestId ?? null,
      issue +
        (observed > admissionBoundCents ? "; observed_cost_exceeds_bound" : "")
    );
  };
  // 6. Delegate to the provider. The abortable deadline wraps the provider
  //    seam so OpenRouter's fetch can cancel; Workers AI ignores the signal.
  //    DeepInfra chat is the only caller of the longer deadline.
  const chatTimeout =
    mapping.provider === "deepinfra"
      ? DEEPINFRA_CHAT_TIMEOUT_MS
      : PROVIDER_TIMEOUT_MS;
  let completion: Awaited<ReturnType<LlmProvider["complete"]>>;
  try {
    completion = await withAbortableDeadline(
      (signal) =>
        invoke({
          model: mapping.model,
          prompt,
          signal,
          policy,
          now
        }).then(async (value) => {
          if (signal.aborted) {
            try {
              await retainCompletion(value, "late_provider_response");
            } catch {
              /* The worker/database may no longer be available after timeout. */
            }
          }
          return value;
        }),
      chatTimeout,
      mapping.provider
    );
  } catch (cause) {
    if (cause instanceof ProvenPreDispatchRefusal) {
      await accounting.releaseBeforePaidInvocation(db, operation);
      throw cause;
    }
    await accounting.markUncertain(
      db,
      operation.id,
      owner,
      "provider_outcome_unknown"
    );
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
  if (typeof completion.text !== "string") issues.push("non_text_output");
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
  const result: GatewayResult = {
    text: completion.text,
    role,
    provider: mapping.provider,
    model: mapping.model,
    inputTokens: completion.inputTokens,
    outputTokens: completion.outputTokens,
    costCents,
    currency: CURRENCY
  };
  await accounting.settle(
    db,
    operation,
    {
      id: operation.id,
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
    },
    result,
    completion.providerRequestId ?? null
  );
  if (accountingIssue)
    throw new GatewayError(
      "accounting_uncertain",
      "Provider usage is incomplete or exceeds the reviewed bound; further inference is blocked."
    );

  return result;
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
  } catch (error) {
    throwCostPolicy(
      "revalidate_before_inference",
      errorFacts(error),
      ProvenPreDispatchRefusal
    );
  }
}

function nonEmptySecret(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Production provider registry: Workers AI when `env.AI` is bound, OpenRouter
 * when all required bindings are set, plus DeepInfra via its custom route.
 * Shared by the Workflow and the steering POST.
 */
export function llmProvidersFromEnv(env: Env): LlmProvider[] {
  return [
    createWorkersAiProvider(env),
    createOpenRouterProvider(env),
    createDeepInfraProvider(env)
  ].filter((p): p is LlmProvider => p != null);
}

/**
 * Story 3.20 — OpenRouter through the AI Gateway provider endpoint. Present
 * only when `OPENROUTER_API_KEY`, `AI_GATEWAY_ID`, and `CLOUDFLARE_ACCOUNT_ID`
 * are all non-empty. Does not call `env.AI.run`.
 */
function openRouterEndpointField(
  endpoint: {
    context_length?: number;
    supported_parameters?: string[];
    pricing?: Record<string, unknown>;
  },
  inputTokens: number
): string | null {
  if (endpoint.context_length !== inputTokens) return "context_length";
  if (!endpoint.supported_parameters?.includes("max_tokens"))
    return "supported_parameters";
  const pricing = endpoint.pricing;
  if (!pricing || pricing.prompt == null) return "pricing.prompt";
  if (pricing.completion == null) return "pricing.completion";
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
  for (const [key, value] of Object.entries(pricing)) {
    if (key === "web_search") continue;
    if (key === "overrides") {
      if (!(Array.isArray(value) && value.length === 0))
        return "pricing.overrides";
      continue;
    }
    if (!(key in limits) || !decimalAtMost(value, limits[key]!))
      return `pricing.${key}`;
  }
  return null;
}

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
    async preflight({ model, policy, now }) {
      // Verify the exact bounded route before paid inference. No model/provider fallback.
      try {
        const metadata = await fetch(
          `https://openrouter.ai/api/v1/models/${model}/endpoints`,
          { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) }
        );
        if (!metadata.ok) {
          let bodyPrefix = "";
          try {
            bodyPrefix = diagnosticText(await metadata.text());
          } catch {
            bodyPrefix = "";
          }
          throwCostPolicy("openrouter_preflight", {
            ...errorFacts(new Error(`HTTP ${metadata.status}`)),
            status: metadata.status,
            ...(bodyPrefix ? { bodyPrefix } : {})
          });
        }
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
        const field =
          eligible.length === 0
            ? "endpoints"
            : (eligible
                .map((endpoint) =>
                  openRouterEndpointField(endpoint, policy.inputTokens)
                )
                .find((issue) => issue != null) ?? null);
        if (field)
          throwCostPolicy("openrouter_preflight", {
            field,
            ...errorFacts(new Error(field))
          });
      } catch (error) {
        if (error instanceof GatewayError) throw error;
        throwCostPolicy("openrouter_preflight", errorFacts(error));
      }
      revalidateBeforeInference(policy, now());
    },
    async complete({
      model,
      prompt,
      signal,
      policy,
      now = () => new Date().toISOString()
    }) {
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
        id?: string;
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
        providerRequestId: typeof body.id === "string" ? body.id : undefined,
        reportedCostUsd: body.usage?.cost
      };
    }
  };
}

/** Expand finite nonnegative catalog decimals, including JSON scientific notation. */
function catalogDecimal(value: unknown): string | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(
    String(value)
  );
  if (!match) return undefined;
  const exponent = Number(match[3] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100)
    return undefined;
  const digits = match[1]! + (match[2] ?? "");
  const point = match[1]!.length + exponent;
  const expanded =
    point <= 0
      ? "0." + "0".repeat(-point) + digits
      : point >= digits.length
        ? digits + "0".repeat(point - digits.length)
        : digits.slice(0, point) + "." + digits.slice(point);
  return expanded.replace(/^0+(?=\d)/, "");
}

function deepInfraCatalogField(
  catalog: unknown,
  model: string,
  policy: CostPolicy
): string | null {
  if (!Array.isArray(catalog)) return "catalog";
  const matches = catalog.filter(
    (entry) =>
      entry != null &&
      typeof entry === "object" &&
      (entry as { model_name?: unknown }).model_name === model
  );
  if (matches.length !== 1 || model !== policy.model) return "model_name";
  const row = matches[0] as Record<string, unknown>;
  if (row.type !== "text-generation") return "type";
  if (row.reported_type !== "text-generation") return "reported_type";
  if (row.private !== 0) return "private";
  if (row.deprecated !== null) return "deprecated";
  if (row.replaced_by !== null) return "replaced_by";
  if (
    typeof row.max_tokens !== "number" ||
    !Number.isInteger(row.max_tokens) ||
    row.max_tokens < policy.inputTokens
  )
    return "max_tokens";
  if (!Array.isArray(row.tags)) return "tags";
  for (const tag of ["openai", "reasoning", "json"]) {
    if (!row.tags.includes(tag)) return `tags.${tag}`;
  }
  const pricing = row.pricing;
  if (
    pricing == null ||
    typeof pricing !== "object" ||
    (pricing as { type?: unknown }).type !== "tokens"
  )
    return "pricing.type";
  return deepInfraPriceField(pricing as Record<string, unknown>, policy);
}

/**
 * Compare billable token and cache-replacement prices to this model's policy.
 * Priority, flex, and cache-granularity may be non-null. A null or absent
 * discount is allowed. Unknown keys fail closed.
 */
function deepInfraPriceField(
  prices: Record<string, unknown>,
  policy: CostPolicy
): string | null {
  const inputLimit = usdPerMillionToCentsPerToken(policy.inputUsdPerMillion);
  const outputLimit = usdPerMillionToCentsPerToken(policy.outputUsdPerMillion);
  const inputCents = catalogDecimal(prices.cents_per_input_token);
  const outputCents = catalogDecimal(prices.cents_per_output_token);
  if (!inputCents || !decimalAtMost(inputCents, inputLimit))
    return "pricing.cents_per_input_token";
  if (!outputCents || !decimalAtMost(outputCents, outputLimit))
    return "pricing.cents_per_output_token";
  const multiplierOk = (value: unknown): boolean => {
    const factor = catalogDecimal(value);
    return (
      factor != null && decimalProductAtMost(factor, inputCents, inputLimit)
    );
  };
  for (const [key, value] of Object.entries(prices)) {
    if (key === "type") {
      if (value !== "tokens") return "pricing.type";
      continue;
    }
    if (key === "cents_per_input_token" || key === "cents_per_output_token")
      continue;
    if (key === "discount") {
      if (value === null) continue;
      const discount = catalogDecimal(value);
      if (!discount || !decimalAtMost(discount, "1")) return "pricing.discount";
      continue;
    }
    if (key === "discount_ends_at") {
      if (
        !(
          value === null ||
          (typeof value === "string" && Number.isFinite(Date.parse(value)))
        )
      )
        return "pricing.discount_ends_at";
      continue;
    }
    if (key === "short" || key === "full" || key === "table") {
      if (value !== null) return `pricing.${key}`;
      continue;
    }
    if (
      key === "rate_per_input_token_cached" ||
      key === "rate_per_input_token_cache_write"
    ) {
      if (value === null) continue;
      if (!multiplierOk(value)) return `pricing.${key}`;
      continue;
    }
    if (key === "rate_per_explicit_cache_write_token") {
      if (value === null) continue;
      if (typeof value !== "object" || Array.isArray(value))
        return "pricing.rate_per_explicit_cache_write_token";
      for (const [ttl, multiplier] of Object.entries(
        value as Record<string, unknown>
      )) {
        if (!multiplierOk(multiplier))
          return `pricing.rate_per_explicit_cache_write_token.${ttl}`;
      }
      continue;
    }
    if (
      key === "rate_per_service_tier_priority" ||
      key === "rate_per_service_tier_flex" ||
      key === "explicit_cache_granularity_tokens"
    ) {
      if (value === null || catalogDecimal(value) != null) continue;
      return `pricing.${key}`;
    }
    return `pricing.${key}`;
  }
  return null;
}

/**
 * Workerd rejects redirect mode "error" before send. "manual" returns a 3xx
 * as-is, and an opaque redirect is status 0. Both are non-OK.
 */
function deepInfraRedirectRefused(response: Response): boolean {
  return (
    !response.ok ||
    response.type === "opaqueredirect" ||
    response.status === 0 ||
    (response.status >= 300 && response.status < 400)
  );
}

/** 3xx, status 0, and opaque redirects. Other non-OK responses stay `http`. */
function chatRedirectRefused(response: Response): boolean {
  return (
    response.type === "opaqueredirect" ||
    response.status === 0 ||
    (response.status >= 300 && response.status < 400)
  );
}

function headerValue(response: Response, name: string): string | undefined {
  try {
    const value = response.headers?.get(name);
    return typeof value === "string" && value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

function scrubLoggedText(
  value: string,
  secrets: readonly string[],
  accountId: string
): string {
  let raw = value;
  for (const secret of secrets) {
    if (secret.length > 0) raw = raw.split(secret).join("[redacted]");
  }
  if (accountId.length > 0) {
    const mask = `****${accountId.slice(-4)}`;
    raw = raw.split(accountId).join(mask);
    const encoded = encodeURIComponent(accountId);
    if (encoded !== accountId) raw = raw.split(encoded).join(mask);
  }
  return diagnosticText(raw);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function parsedUsageFacts(parsed: unknown): {
  finishReason?: string;
  completionTokens?: number;
  reasoningTokens?: number;
} {
  if (parsed == null || typeof parsed !== "object") return {};
  const body = parsed as {
    choices?: Array<{ finish_reason?: unknown }>;
    usage?: {
      completion_tokens?: unknown;
      completion_tokens_details?: { reasoning_tokens?: unknown };
    };
  };
  const finish = body.choices?.[0]?.finish_reason;
  const completionTokens = finiteNumber(body.usage?.completion_tokens);
  const reasoningTokens = finiteNumber(
    body.usage?.completion_tokens_details?.reasoning_tokens
  );
  return {
    ...(typeof finish === "string" ? { finishReason: finish } : {}),
    ...(completionTokens == null ? {} : { completionTokens }),
    ...(reasoningTokens == null ? {} : { reasoningTokens })
  };
}

function apiErrorRecord(
  value: unknown
): { type?: unknown; code?: unknown; message?: unknown } | undefined {
  return value != null && typeof value === "object"
    ? (value as { type?: unknown; code?: unknown; message?: unknown })
    : undefined;
}

function apiErrorScalar(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

/** `error.*`, otherwise `errors[0].*`. Chat message content is not read. */
function jsonApiError(parsed: unknown): {
  errorType?: string;
  errorCode?: string;
  errorMessage?: string;
} {
  if (parsed == null || typeof parsed !== "object") return {};
  const record = parsed as { error?: unknown; errors?: unknown };
  const primary = apiErrorRecord(record.error);
  const listed = Array.isArray(record.errors)
    ? apiErrorRecord(record.errors[0])
    : undefined;
  const pick = (key: "type" | "code" | "message") =>
    apiErrorScalar(primary?.[key]) ?? apiErrorScalar(listed?.[key]);
  const errorType = pick("type");
  const errorCode = pick("code");
  const errorMessage = pick("message");
  return {
    ...(errorType ? { errorType } : {}),
    ...(errorCode ? { errorCode } : {}),
    ...(errorMessage ? { errorMessage } : {})
  };
}

function deepInfraFailureStage(
  error: unknown,
  response: Response | undefined
): string {
  if (isAbortError(error) || isTimeoutError(error)) return "timeout";
  if (response && chatRedirectRefused(response)) return "redirect_refused";
  if (response && !response.ok) return "http";
  if (response && error instanceof SyntaxError) return "invalid_body";
  if (!response) return "network";
  return "unknown";
}

function chatOutputDegraded(parsed: unknown): boolean {
  const choice =
    parsed != null && typeof parsed === "object"
      ? (
          parsed as {
            choices?: Array<{
              finish_reason?: unknown;
              message?: { content?: unknown };
            }>;
          }
        ).choices?.[0]
      : undefined;
  const content = choice?.message?.content;
  return (
    choice?.finish_reason !== "stop" ||
    typeof content !== "string" ||
    content.length === 0
  );
}

function maskedChatPath(url: string, accountId: string): string {
  const path = new URL(url).pathname;
  const mask = `****${accountId.slice(-4)}`;
  return path.replace(`/${encodeURIComponent(accountId)}/`, `/${mask}/`);
}

function logDeepInfraChatFailure(input: {
  error: unknown;
  response?: Response;
  bodyText?: string;
  parsed?: unknown;
  started: number;
  dispatchedAt: string;
  model: string;
  gatewayId: string;
  accountId: string;
  url: string;
  hasAuthorization: boolean;
  hasGatewayAuth: boolean;
  secrets: readonly string[];
}): void {
  const response = input.response;
  const stage = deepInfraFailureStage(input.error, response);
  const facts = errorFacts(input.error);
  const scrub = (value: string) =>
    scrubLoggedText(value, input.secrets, input.accountId);
  const rawMessage =
    input.error instanceof Error ? input.error.message : String(input.error);
  const apiError = jsonApiError(input.parsed);
  const errorMessage =
    input.error instanceof SyntaxError
      ? ""
      : scrub(apiError.errorMessage ?? rawMessage);
  const parsedJson = input.parsed != null && typeof input.parsed === "object";
  const usage = parsedJson ? parsedUsageFacts(input.parsed) : {};
  const bodyPrefix =
    !parsedJson &&
    stage !== "redirect_refused" &&
    stage !== "timeout" &&
    stage !== "network" &&
    input.bodyText
      ? scrub(input.bodyText)
      : "";
  const aigLogId = response
    ? headerValue(response, "cf-aig-log-id")
    : undefined;
  console.warn({
    event: "provider_call_failed",
    provider: "deepinfra",
    stage,
    elapsedMs: Math.max(0, Date.now() - input.started),
    model: scrub(input.model),
    gatewayId: scrub(input.gatewayId),
    accountIdLast4: input.accountId.slice(-4),
    urlHost: new URL(input.url).host,
    urlPath: maskedChatPath(input.url, input.accountId),
    hasAuthorization: input.hasAuthorization,
    hasGatewayAuth: input.hasGatewayAuth,
    dispatchedAt: input.dispatchedAt,
    headersReceived: response != null,
    ...(response
      ? { status: response.status, responseType: response.type }
      : {}),
    ...(bodyPrefix ? { bodyPrefix } : {}),
    ...(facts.errorName ? { errorName: facts.errorName } : {}),
    ...(errorMessage ? { errorMessage } : {}),
    ...(apiError.errorType ? { errorType: scrub(apiError.errorType) } : {}),
    ...(apiError.errorCode ? { errorCode: scrub(apiError.errorCode) } : {}),
    ...(aigLogId ? { aigLogId: scrub(aigLogId) } : {}),
    ...(usage.finishReason ? { finishReason: scrub(usage.finishReason) } : {}),
    ...(usage.completionTokens == null
      ? {}
      : { completionTokens: usage.completionTokens }),
    ...(usage.reasoningTokens == null
      ? {}
      : { reasoningTokens: usage.reasoningTokens })
  });
}

function logDeepInfraChatDegraded(input: {
  parsed: unknown;
  response: Response;
  started: number;
  dispatchedAt: string;
  model: string;
  gatewayId: string;
  accountId: string;
  url: string;
  hasAuthorization: boolean;
  hasGatewayAuth: boolean;
  secrets: readonly string[];
}): void {
  const scrub = (value: string) =>
    scrubLoggedText(value, input.secrets, input.accountId);
  const usage = parsedUsageFacts(input.parsed);
  const aigLogId = headerValue(input.response, "cf-aig-log-id");
  console.warn({
    event: "provider_call_degraded",
    provider: "deepinfra",
    model: scrub(input.model),
    elapsedMs: Math.max(0, Date.now() - input.started),
    gatewayId: scrub(input.gatewayId),
    accountIdLast4: input.accountId.slice(-4),
    urlHost: new URL(input.url).host,
    urlPath: maskedChatPath(input.url, input.accountId),
    hasAuthorization: input.hasAuthorization,
    hasGatewayAuth: input.hasGatewayAuth,
    dispatchedAt: input.dispatchedAt,
    headersReceived: true,
    ...(usage.finishReason ? { finishReason: scrub(usage.finishReason) } : {}),
    ...(usage.completionTokens == null
      ? {}
      : { completionTokens: usage.completionTokens }),
    ...(usage.reasoningTokens == null
      ? {}
      : { reasoningTokens: usage.reasoningTokens }),
    ...(aigLogId ? { aigLogId: scrub(aigLogId) } : {})
  });
}

/** Fixed custom provider route. Credentials are captured only in a per-call closure. */
export function createDeepInfraProvider(env: Env): LlmProvider | null {
  const configured = (value: unknown): boolean =>
    typeof value === "string"
      ? value.trim().length > 0
      : value != null && typeof (value as { get?: unknown }).get === "function";
  if (
    !configured(env.DEEPINFRA_API_KEY) ||
    !env.AI_GATEWAY_ID?.trim() ||
    !env.CLOUDFLARE_ACCOUNT_ID?.trim() ||
    (env.AI_GATEWAY_TOKEN !== undefined && !configured(env.AI_GATEWAY_TOKEN))
  )
    return null;
  const url = `https://gateway.ai.cloudflare.com/v1/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}/${encodeURIComponent(env.AI_GATEWAY_ID)}/custom-deepinfra/v1/openai/chat/completions`;
  const resolve = async (value: Env["DEEPINFRA_API_KEY"]): Promise<string> => {
    const secret = typeof value === "string" ? value : await value?.get();
    if (typeof secret !== "string" || !secret.trim())
      throw new Error("Credential unavailable");
    return secret.trim();
  };
  return {
    name: "deepinfra",
    async preflight({ model, policy, now }) {
      try {
        await withAbortableDeadline(
          async (signal) => {
            const response = await fetch(
              "https://api.deepinfra.com/models/list",
              deepInfraCatalogRequestInit(signal)
            );
            if (deepInfraRedirectRefused(response)) {
              let bodyPrefix = "";
              try {
                bodyPrefix = diagnosticText(await response.text());
              } catch {
                bodyPrefix = "";
              }
              const error = new Error(`HTTP ${response.status}`);
              throw Object.assign(error, {
                status: response.status,
                ...(bodyPrefix ? { bodyPrefix } : {})
              });
            }
            const catalog: unknown = await response.json();
            const field = deepInfraCatalogField(catalog, model, policy);
            if (field) {
              const error = new Error(field);
              throw Object.assign(error, { field });
            }
          },
          PROVIDER_TIMEOUT_MS,
          "DeepInfra catalog"
        );
      } catch (error) {
        if (error instanceof GatewayError) throw error;
        const status =
          typeof (error as { status?: unknown }).status === "number"
            ? (error as { status: number }).status
            : undefined;
        const bodyPrefix =
          typeof (error as { bodyPrefix?: unknown }).bodyPrefix === "string"
            ? (error as { bodyPrefix: string }).bodyPrefix
            : undefined;
        const field =
          typeof (error as { field?: unknown }).field === "string"
            ? (error as { field: string }).field
            : undefined;
        throwCostPolicy("deepinfra_preflight", {
          ...errorFacts(error),
          ...(status == null ? {} : { status }),
          ...(bodyPrefix ? { bodyPrefix } : {}),
          ...(field ? { field } : {})
        });
      }
      revalidateBeforeInference(policy, now());
    },
    async prepare(signal) {
      try {
        const [key, token] = await Promise.all([
          resolve(env.DEEPINFRA_API_KEY),
          env.AI_GATEWAY_TOKEN === undefined
            ? undefined
            : resolve(env.AI_GATEWAY_TOKEN)
        ]);
        if (signal.aborted) throw new Error();
        // Workerd can log non-ASCII header values; reject them before construction.
        if (
          [key, token].some(
            (value) => value !== undefined && /[^\x20-\x7e]/.test(value)
          )
        )
          throw new Error();
        // Validate header values while refusal is still definitively free.
        const headers = new Headers({
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "cf-aig-max-attempts": "1",
          "cf-aig-skip-cache": "true",
          ...(token ? { "cf-aig-authorization": `Bearer ${token}` } : {})
        });
        return async ({
          model,
          prompt,
          policy,
          signal,
          now = () => new Date().toISOString()
        }) => {
          revalidateBeforeInference(policy, now());
          if (signal?.aborted)
            throw new ProvenPreDispatchRefusal(
              "provider_error",
              "Inference cancelled before dispatch."
            );
          const started = Date.now();
          const dispatchedAt = now();
          let response: Response | undefined;
          let bodyText: string | undefined;
          let parsed: unknown;
          try {
            response = await fetch(
              url,
              deepInfraChatRequestInit(
                headers,
                signal,
                JSON.stringify({
                  model,
                  messages: [{ role: "user", content: prompt }],
                  max_tokens: policy.outputTokens,
                  stream: false,
                  n: 1,
                  reasoning_effort: "none",
                  reasoning: { enabled: false }
                })
              )
            );
            if (chatRedirectRefused(response)) throw new Error();
            if (!response.ok) {
              try {
                bodyText = await response.text();
              } catch (readError) {
                if (isAbortError(readError) || isTimeoutError(readError))
                  throw readError;
                bodyText = undefined;
              }
              if (bodyText != null) {
                try {
                  parsed = JSON.parse(bodyText);
                } catch {
                  parsed = undefined;
                }
              }
              throw new Error(`HTTP ${response.status}`);
            }
            bodyText = await response.text();
            parsed = JSON.parse(bodyText);
            const body = parsed as {
              id?: unknown;
              model?: unknown;
              choices?: Array<{ message?: { content?: unknown } }>;
              usage?: { prompt_tokens?: number; completion_tokens?: number };
            };
            const content = body.choices?.[0]?.message?.content;
            const mismatch = body.model !== undefined && body.model !== model;
            const completion = {
              text: !mismatch && typeof content === "string" ? content : "",
              inputTokens: body.usage?.prompt_tokens ?? null,
              outputTokens: body.usage?.completion_tokens ?? null,
              accountingIssue: mismatch
                ? "returned_model_mismatch"
                : typeof content !== "string"
                  ? "non_text_output"
                  : undefined,
              providerRequestId:
                typeof body.id === "string" &&
                /^[a-zA-Z0-9_.:-]{1,200}$/.test(body.id)
                  ? body.id
                  : undefined
            };
            if (response.status === 200 && chatOutputDegraded(parsed)) {
              try {
                logDeepInfraChatDegraded({
                  parsed,
                  response,
                  started,
                  dispatchedAt,
                  model,
                  gatewayId: env.AI_GATEWAY_ID ?? "",
                  accountId: env.CLOUDFLARE_ACCOUNT_ID ?? "",
                  url,
                  hasAuthorization: headers.has("authorization"),
                  hasGatewayAuth: headers.has("cf-aig-authorization"),
                  secrets: [key, token].filter(
                    (secret): secret is string => secret !== undefined
                  )
                });
              } catch {
                /* A diagnostic failure must not change the completion. */
              }
            }
            return completion;
          } catch (error) {
            try {
              logDeepInfraChatFailure({
                error,
                response,
                bodyText,
                parsed,
                started,
                dispatchedAt,
                model,
                gatewayId: env.AI_GATEWAY_ID ?? "",
                accountId: env.CLOUDFLARE_ACCOUNT_ID ?? "",
                url,
                hasAuthorization: headers.has("authorization"),
                hasGatewayAuth: headers.has("cf-aig-authorization"),
                secrets: [key, token].filter(
                  (secret): secret is string => secret !== undefined
                )
              });
            } catch {
              /* A diagnostic failure must not replace the provider error. */
            }
            throw new GatewayError(
              "provider_error",
              "DeepInfra gateway request failed."
            );
          }
        };
      } catch {
        throw new GatewayError(
          "gateway_not_configured",
          "Provider credentials unavailable."
        );
      }
    },
    async complete() {
      throw new ProvenPreDispatchRefusal(
        "gateway_not_configured",
        "Request-scoped provider preparation required."
      );
    }
  };
}
