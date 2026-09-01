import { z } from "zod";

import { IsoUtcSchema } from "./common";
import { EntitySchema } from "./entity";
import { SourceSchema } from "./source";
import {
  OperationalStatusBasisSchema,
  OperationalStatusSchema,
  PostureSchema,
  ProvenanceKindSchema
} from "./vocabulary";

export const StateSchema = z.object({
  id: z.string().min(1),
  code: z.string().length(2),
  name: z.string().min(1),
  circuitId: z.string().nullable(),
  operationalStatus: OperationalStatusSchema,
  operationalStatusBasis: OperationalStatusBasisSchema,
  posture: PostureSchema,
  controllingCaseId: z.string().nullable(),
  whyNote: z.string().nullable(),
  provenanceKind: ProvenanceKindSchema,
  publishedAt: IsoUtcSchema,
  updatedAt: IsoUtcSchema
});

export type State = z.infer<typeof StateSchema>;

export const StatePlatformStatusSchema = z.object({
  id: z.string().min(1),
  stateId: z.string().min(1),
  entityId: z.string().min(1),
  operationalStatus: OperationalStatusSchema,
  operationalStatusBasis: OperationalStatusBasisSchema,
  note: z.string().nullable(),
  provenanceKind: ProvenanceKindSchema,
  publishedAt: IsoUtcSchema,
  updatedAt: IsoUtcSchema
});

export type StatePlatformStatus = z.infer<typeof StatePlatformStatusSchema>;

export const StatePlatformStatusDetailSchema = StatePlatformStatusSchema.extend(
  {
    entity: EntitySchema,
    sources: z
      .array(SourceSchema)
      .min(1)
      .refine(
        (sources) => sources.some((source) => source.tier === "tier1"),
        "Platform-status detail requires at least one Tier-1 source"
      )
  }
);

export const StateDetailSchema = StateSchema.extend({
  platformStatuses: z.array(StatePlatformStatusDetailSchema),
  sources: z.array(SourceSchema)
}).superRefine((state, ctx) => {
  if (
    state.posture !== "untracked" &&
    !state.sources.some((source) => source.tier === "tier1")
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["sources"],
      message: "Tracked state detail requires at least one Tier-1 source"
    });
  }
});

export type StateDetail = z.infer<typeof StateDetailSchema>;
