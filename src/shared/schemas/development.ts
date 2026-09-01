import { z } from "zod";

import { IsoDateSchema } from "./common";

/**
 * One row in the apex "Latest developments" feed (Story 2.2).
 *
 * Sourced from `docket_events` joined to `cases` — list case payloads do not
 * carry docket rows, so this avoids N+1 `/api/cases/:id` from the client.
 */
export const DevelopmentSchema = z.object({
  id: z.string().min(1),
  occurredAt: IsoDateSchema,
  description: z.string().min(1),
  caseId: z.string().min(1),
  caption: z.string().min(1),
  court: z.string().min(1)
});

export type Development = z.infer<typeof DevelopmentSchema>;
