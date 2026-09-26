import { z } from "zod";

import { IsoUtcSchema } from "./common";
import { GatewayRoleSchema } from "./vocabulary";

export { GatewayRoleSchema } from "./vocabulary";
export type { GatewayRole } from "./vocabulary";

/**
 * AI Gateway contracts (Story 3.2).
 *
 * Canonical shapes for the single LLM front door: the role→model config row,
 * one recorded LLM call, and the typed error codes the gateway throws. Money
 * is integer cents + ISO currency code, never float dollars (architecture
 * #Spend); provider/model ids are strings validated here and stored verbatim in
 * D1 — nothing outside `pipeline/ai` hardcodes an id.
 */

const CURRENCY_CODE = /^[A-Z]{3}$/;

const cents = z.number().int().nonnegative();

/**
 * One role→model mapping inside the config's `roles` object. `provider` names
 * the binding path (e.g. `workersai`); `model` is the provider's model id.
 */
export const RoleModelConfigSchema = z
  .object({
    provider: z.string().min(1),
    model: z.string().min(1)
  })
  .strict();

export type RoleModelConfig = z.infer<typeof RoleModelConfigSchema>;

/**
 * The role→model map inside the config. Roles are a sparse, closed set: any
 * admitted `GatewayRole` key may be present or absent (an absent role is a
 * typed `role_not_configured` at call time), and no key outside the closed
 * set is admitted (`.strict()` rejects it). `.strict()` also rejects
 * inherited prototype keys, so a tampered JSON object cannot smuggle a
 * mapping in. Migration 0017 (story 3.19) seeds all five roles — steward
 * included — to Workers AI with a 500-cent default budget; tests still
 * upsert the exact map they need (including `{}` to assert the
 * unconfigured path) rather than relying on the seed.
 */
export const RoleModelMapSchema = z
  .object({
    orchestrator: RoleModelConfigSchema.optional(),
    drafter: RoleModelConfigSchema.optional(),
    reviewer: RoleModelConfigSchema.optional(),
    yolo: RoleModelConfigSchema.optional(),
    steward: RoleModelConfigSchema.optional()
  })
  .strict();

export type RoleModelMap = z.infer<typeof RoleModelMapSchema>;

/**
 * The versioned role→model configuration. `roles` maps admitted `GatewayRole`s
 * to `{ provider, model }`; `version` is the monotonic counter bumped on every
 * change (the audited-change record); `defaultBudgetCents` is the fallback
 * ceiling when a Run carries no `budget_cents`.
 */
export const GatewayConfigSchema = z
  .object({
    id: z.literal("current"),
    version: z.number().int().nonnegative(),
    roles: RoleModelMapSchema,
    defaultBudgetCents: cents.nullable(),
    updatedAt: IsoUtcSchema
  })
  .strict();

export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;

/**
 * One recorded LLM call — the per-call Evidence row behind spend accounting.
 * `tokens` is the provider usage breakdown when available, else null (Workers
 * AI does not universally expose usage). `costCents` is budget accounting;
 * costBasis distinguishes estimates, provider reports and retained liability.
 */
export const LlmCallRecordSchema = z
  .object({
    id: z.string().min(1),
    runId: z.string().min(1),
    role: GatewayRoleSchema,
    provider: z.string().min(1),
    model: z.string().min(1),
    tokens: z
      .object({
        input: z.number().int().nonnegative(),
        output: z.number().int().nonnegative()
      })
      .nullable(),
    // Budget accounting amount; not necessarily a measured charge.
    costCents: cents,
    costBasis: z
      .enum([
        "legacy_estimate",
        "token_estimate",
        "provider_reported",
        "conservative_bound"
      ])
      .default("legacy_estimate"),
    admissionBoundCents: cents.nullable().default(null),
    estimatedCostCents: cents.nullable().default(null),
    reportedCostCents: cents.nullable().default(null),
    reportedCostUsd: z.string().nullable().optional(),
    reportedCostSource: z.string().nullable().default(null),
    policy: z.record(z.string(), z.unknown()).nullable().default(null),
    accountingIssue: z.string().nullable().default(null),
    currency: z.string().regex(CURRENCY_CODE),
    createdAt: IsoUtcSchema
  })
  .strict();

export type LlmCallRecord = z.infer<typeof LlmCallRecordSchema>;

/**
 * Typed gateway failure codes. The gateway throws a `GatewayError` carrying one
 * of these rather than leaking provider/runtime strings to callers; the code is
 * what workflow-level code matches on.
 */
export const GATEWAY_ERROR_CODES = [
  "unknown_role",
  "role_not_configured",
  "run_not_found",
  "budget_stopped",
  "provider_error",
  "cost_policy_invalid",
  "accounting_uncertain",
  "gateway_not_configured"
] as const;

export const GatewayErrorCodeSchema = z.enum(GATEWAY_ERROR_CODES);
export type GatewayErrorCode = z.infer<typeof GatewayErrorCodeSchema>;
