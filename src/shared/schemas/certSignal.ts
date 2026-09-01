import { z } from "zod";

import { IsoDateSchema, IsoUtcSchema } from "./common";
import { CertReadingSchema, ProvenanceKindSchema } from "./vocabulary";

/**
 * Cert signal is qualitative — factors_json holds bold leads + explanations.
 * There is deliberately no numeric score column.
 */
export const CertFactorSchema = z
  .object({
    lead: z.string().min(1),
    explanation: z.string().min(1)
  })
  .strict();

export const CertSignalSchema = z.object({
  id: z.literal("current"),
  reading: CertReadingSchema,
  factors: z.array(CertFactorSchema).min(1),
  methodNote: z.string().min(1),
  reviewedAt: IsoDateSchema,
  approver: z.string().min(1),
  provenanceKind: ProvenanceKindSchema,
  publishedAt: IsoUtcSchema,
  updatedAt: IsoUtcSchema
});

export type CertSignal = z.infer<typeof CertSignalSchema>;
