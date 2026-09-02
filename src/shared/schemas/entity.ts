import { z } from "zod";

import { IsoUtcSchema } from "./common";
import {
  CaseEntityRoleSchema,
  CaseLifecycleSchema,
  ForumSchema,
  OperationalStatusSchema,
  PostureSchema,
  ProvenanceKindSchema
} from "./vocabulary";

export const EntitySchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  role: z.string().nullable(),
  provenanceKind: ProvenanceKindSchema,
  publishedAt: IsoUtcSchema,
  updatedAt: IsoUtcSchema
});

export type Entity = z.infer<typeof EntitySchema>;

export const EntityMatterSchema = z.object({
  caseId: z.string().min(1),
  caption: z.string().min(1),
  court: z.string().min(1),
  docketNumber: z.string().nullable(),
  forum: ForumSchema,
  lifecycle: CaseLifecycleSchema,
  posture: PostureSchema,
  role: CaseEntityRoleSchema
});

export type EntityMatter = z.infer<typeof EntityMatterSchema>;

export const EntityFootprintSchema = z.object({
  stateCode: z.string().length(2),
  stateName: z.string().min(1),
  operationalStatus: OperationalStatusSchema,
  note: z.string().nullable()
});

export type EntityFootprint = z.infer<typeof EntityFootprintSchema>;

export const EntityListItemSchema = EntitySchema.extend({
  matters: z.array(EntityMatterSchema),
  footprint: z.array(EntityFootprintSchema)
});

export type EntityListItem = z.infer<typeof EntityListItemSchema>;
