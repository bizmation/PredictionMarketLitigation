import { z } from "zod";

import { IsoUtcSchema } from "./common";
import { ProvenanceKindSchema } from "./vocabulary";

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
