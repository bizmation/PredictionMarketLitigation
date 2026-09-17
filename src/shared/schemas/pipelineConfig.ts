import { z } from "zod";

import { IsoUtcSchema } from "./common";
import { SourceTierSchema } from "./vocabulary";

/**
 * Pipeline config contracts (Story 3.17).
 *
 * The only chat-writable document is `poll_sources`. YOLO / budget / mode /
 * guardrails / allowlist / FR-17 ineligible reasons stay code-owned.
 * Public `GET /api/pipeline-config` is a no-store projection of the
 * effective list, current version, and append-only history. Version 0 is
 * the compile-time seed, not a D1 row.
 */

export const PIPELINE_CONFIG_KEY = "poll_sources" as const;

export const FORBIDDEN_PIPELINE_CONFIG_KEYS = [
  "mode",
  "budget",
  "yolo",
  "threshold",
  "yolo_threshold",
  "guardrails",
  "guardrail_rules",
  "allowlist",
  "allowed_tools",
  "tool_allowlist",
  "baked_blockers",
  "ineligible_reasons"
] as const;

export type ForbiddenPipelineConfigKey =
  (typeof FORBIDDEN_PIPELINE_CONFIG_KEYS)[number];

const FORBIDDEN_KEY_SET = new Set<string>(FORBIDDEN_PIPELINE_CONFIG_KEYS);

export function normalizePipelineConfigKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function isForbiddenPipelineConfigKey(key: string): boolean {
  return FORBIDDEN_KEY_SET.has(normalizePipelineConfigKey(key));
}

export const PollSourceSchema = z
  .object({
    name: z.string().min(1),
    url: z.string().min(1),
    tier: SourceTierSchema
  })
  .strict();

export type PollSource = z.infer<typeof PollSourceSchema>;

export const PollSourcesSchema = z.array(PollSourceSchema);
export type PollSources = z.infer<typeof PollSourcesSchema>;

export const PipelineConfigVersionSchema = z
  .object({
    key: z.literal(PIPELINE_CONFIG_KEY),
    version: z.number().int().positive(),
    prior: PollSourcesSchema,
    next: PollSourcesSchema,
    actor: z.string().min(1),
    createdAt: IsoUtcSchema
  })
  .strict();

export type PipelineConfigVersion = z.infer<typeof PipelineConfigVersionSchema>;

export const PipelineConfigHistoryItemSchema = z
  .object({
    version: z.number().int().positive(),
    key: z.literal(PIPELINE_CONFIG_KEY),
    prior: PollSourcesSchema,
    next: PollSourcesSchema,
    actor: z.string().min(1),
    createdAt: IsoUtcSchema
  })
  .strict();

export type PipelineConfigHistoryItem = z.infer<
  typeof PipelineConfigHistoryItemSchema
>;

export const PublicPipelineConfigSchema = z
  .object({
    key: z.literal(PIPELINE_CONFIG_KEY),
    version: z.number().int().nonnegative(),
    sources: PollSourcesSchema,
    history: z.array(PipelineConfigHistoryItemSchema)
  })
  .strict();

export type PublicPipelineConfig = z.infer<typeof PublicPipelineConfigSchema>;

export const ConfigProposalSchema = z
  .object({
    key: z.string().min(1),
    value: z.unknown()
  })
  .passthrough();

export type ConfigProposal = z.infer<typeof ConfigProposalSchema>;
