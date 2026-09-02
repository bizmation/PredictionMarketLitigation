import { z } from "zod";

import { IsoDateSchema, IsoUtcSchema } from "./common";
import { EntitySchema } from "./entity";
import { TierOneSourceSchema, SourceSchema } from "./source";
import { StateSchema } from "./state";
import {
  CaseEntityRoleSchema,
  CaseLifecycleSchema,
  ForumSchema,
  PostureSchema,
  ProvenanceKindSchema
} from "./vocabulary";

export const CaseSchema = z.object({
  id: z.string().min(1),
  caption: z.string().min(1),
  court: z.string().min(1),
  docketNumber: z.string().nullable(),
  forum: ForumSchema,
  lifecycle: CaseLifecycleSchema,
  posture: PostureSchema,
  circuitId: z.string().nullable(),
  filedAt: IsoDateSchema.nullable(),
  decidedAt: IsoDateSchema.nullable(),
  provenanceKind: ProvenanceKindSchema,
  publishedAt: IsoUtcSchema,
  updatedAt: IsoUtcSchema
});

export type Case = z.infer<typeof CaseSchema>;

/** Slim tag projection for client-side FR40 filters — not the detail `issueTags`. */
export const ListIssueTagSchema = z.object({
  slug: z.string().min(1),
  label: z.string().min(1),
  isControlling: z.boolean()
});

export const CaseListItemSchema = CaseSchema.extend({
  listIssueTags: z.array(ListIssueTagSchema),
  affectedStateCodes: z.array(z.string().length(2)),
  entityRoles: z.array(CaseEntityRoleSchema)
});

export type CaseListItem = z.infer<typeof CaseListItemSchema>;

export const DocketEventSchema = z.object({
  id: z.string().min(1),
  caseId: z.string().min(1),
  occurredAt: IsoDateSchema,
  description: z.string().min(1),
  sourceId: z.string().min(1),
  provenanceKind: ProvenanceKindSchema,
  publishedAt: IsoUtcSchema,
  updatedAt: IsoUtcSchema
});

export type DocketEvent = z.infer<typeof DocketEventSchema>;

export const DocketEventDetailSchema = DocketEventSchema.extend({
  source: TierOneSourceSchema
});

export const IssueTagSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  label: z.string().min(1),
  provenanceKind: ProvenanceKindSchema,
  publishedAt: IsoUtcSchema,
  updatedAt: IsoUtcSchema
});

export const CaseIssueTagSchema = z.object({
  tag: IssueTagSchema,
  isControlling: z.boolean(),
  provenanceKind: ProvenanceKindSchema,
  publishedAt: IsoUtcSchema,
  updatedAt: IsoUtcSchema
});

export const CaseStateSchema = z.object({
  state: StateSchema,
  provenanceKind: ProvenanceKindSchema,
  publishedAt: IsoUtcSchema,
  updatedAt: IsoUtcSchema
});

export const CaseEntitySchema = z.object({
  entity: EntitySchema,
  role: CaseEntityRoleSchema,
  provenanceKind: ProvenanceKindSchema,
  publishedAt: IsoUtcSchema,
  updatedAt: IsoUtcSchema
});

export const CaseDetailSchema = CaseSchema.extend({
  sources: z
    .array(SourceSchema)
    .min(1)
    .refine(
      (sources) => sources.some((source) => source.tier === "tier1"),
      "Case detail requires at least one Tier-1 source"
    ),
  docketEvents: z.array(DocketEventDetailSchema),
  issueTags: z.array(CaseIssueTagSchema),
  states: z.array(CaseStateSchema),
  entities: z.array(CaseEntitySchema)
});

export type CaseDetail = z.infer<typeof CaseDetailSchema>;
