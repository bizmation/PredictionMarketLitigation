import { z } from "zod";

import { IsoDateSchema, IsoUtcSchema } from "./common";
import { ProvenanceKindSchema } from "./vocabulary";

/**
 * Apex orientation KPI snapshot (Story 2.2 / FR43).
 *
 * Counts come from SQL aggregates over the published F1 tables — never from
 * literals in JSX. `changedWindowStart` is 30 days before `freshness`, not
 * wall-clock "today", so a frozen seed does not invent live movement.
 */
export const ApexKpisSchema = z.object({
  statesTracked: z.number().int().nonnegative(),
  statesTotal: z.number().int().nonnegative(),
  operationalGo: z.number().int().nonnegative(),
  operationalRestricted: z.number().int().nonnegative(),
  operationalBanned: z.number().int().nonnegative(),
  mattersTracked: z.number().int().nonnegative(),
  circuitsDecided: z.number().int().nonnegative(),
  circuitsWithActivity: z.number().int().nonnegative(),
  circuitsTotal: z.number().int().nonnegative(),
  appealsPending: z.number().int().nonnegative(),
  changedIn30Days: z.number().int().nonnegative(),
  changedWindowStart: IsoDateSchema,
  freshness: IsoUtcSchema,
  provenanceKind: ProvenanceKindSchema
});

export type ApexKpis = z.infer<typeof ApexKpisSchema>;
