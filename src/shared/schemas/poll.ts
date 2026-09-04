import { z } from "zod";

import { PollCertSchema, PollTermSchema } from "./vocabulary";

export { PollCertSchema, PollTermSchema } from "./vocabulary";
export type { PollCert, PollTerm } from "./vocabulary";

/**
 * Reader cert poll (Story 2.9) — wire contracts.
 *
 * The body is `.strict()`: the client sends exactly `cert` and an optional
 * `term`, and a stray field is a 400 rather than silently ignored. `cert` is
 * required even on a term-only follow-up — a term has no meaning without a
 * cert vote, and first-write-wins needs the cert present to detect a change.
 */

export const PollVoteBodySchema = z
  .object({
    cert: PollCertSchema,
    term: PollTermSchema.nullable().optional()
  })
  .strict();

export type PollVoteBody = z.infer<typeof PollVoteBodySchema>;

/**
 * The vote row the repo maps to (no `voter_token` — that identity is the
 * HttpOnly cookie's business, never the wire).
 */
export const PollVoteSchema = z
  .object({
    id: z.string().min(1),
    cert: PollCertSchema,
    term: PollTermSchema.nullable()
  })
  .strict();

export type PollVote = z.infer<typeof PollVoteSchema>;

const PollCertCountsSchema = z
  .object({ yes: z.number(), no: z.number() })
  .strict();
const PollTermCountsSchema = z
  .object({
    ot26: z.number(),
    ot27: z.number(),
    ot28: z.number(),
    later: z.number()
  })
  .strict();

/**
 * Results DTO. `cert`/`terms` are null until the reader has actually voted
 * (cert) or picked a term — a null split is the "vote to see it" state, not a
 * zero. `total` is real even when unvoted, so the pre-vote hint can say
 * "{n} readers have called it" honestly.
 */
export const PollResultsSchema = z
  .object({
    voted: z.boolean(),
    mine: z
      .object({
        cert: PollCertSchema.nullable(),
        term: PollTermSchema.nullable()
      })
      .strict(),
    total: z.number().int().nonnegative(),
    cert: PollCertCountsSchema.nullable(),
    terms: PollTermCountsSchema.nullable()
  })
  .strict();

export type PollResults = z.infer<typeof PollResultsSchema>;
