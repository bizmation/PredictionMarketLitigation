import { z } from "zod";

import { IsoUtcSchema } from "./common";
import { PostureSchema, ProvenanceKindSchema } from "./vocabulary";

export const CircuitSchema = z.object({
  id: z.string().min(1),
  number: z.number().int().nullable(),
  name: z.string().min(1),
  posture: PostureSchema,
  hasSplit: z.boolean(),
  summary: z.string().nullable(),
  provenanceKind: ProvenanceKindSchema,
  publishedAt: IsoUtcSchema,
  updatedAt: IsoUtcSchema
});

export type Circuit = z.infer<typeof CircuitSchema>;
