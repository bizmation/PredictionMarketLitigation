import { z } from "zod";

import { IsoDateSchema } from "./common";
import { OwningTableSchema, SourceTierSchema } from "./vocabulary";

export const SourceSchema = z.object({
  id: z.string().min(1),
  owningTable: OwningTableSchema,
  owningId: z.string().min(1),
  url: z
    .string()
    .url()
    .refine((value) => new URL(value).protocol === "https:", "Expected HTTPS"),
  title: z.string().min(1),
  tier: SourceTierSchema,
  publishedAt: IsoDateSchema.nullable()
});

export type Source = z.infer<typeof SourceSchema>;

export const TierOneSourceSchema = SourceSchema.extend({
  tier: z.literal("tier1")
});

export type TierOneSource = z.infer<typeof TierOneSourceSchema>;
