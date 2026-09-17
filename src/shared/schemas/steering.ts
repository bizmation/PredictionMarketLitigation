import { z } from "zod";

import { IsoUtcSchema } from "./common";

/**
 * Steering channel contracts (Stories 3.14–3.15).
 *
 * Admin POST body is `{ content, private, draftId?, intent? }`. `intent`
 * is `"ask"` (default) or `"revise"` — the operator control sets it; the
 * server never classifies from the text. `private` is stored at insert
 * and is never updated. The public-safe turn payload keeps
 * actor/time/draftId/`private` and nulls `content` and `reply` when the
 * turn was marked private at submit. `reply` is also null when steward is
 * unconfigured or `complete()` failed. `revisedDraftId` is the new Draft
 * id after a successful revise; always null on ask or an unrelated failure.
 */

export const SteeringPostBodySchema = z
  .object({
    content: z.string().trim().min(1),
    private: z.boolean(),
    draftId: z.string().min(1).optional(),
    intent: z.enum(["ask", "revise"]).default("ask")
  })
  .strict();

export type SteeringPostBody = z.infer<typeof SteeringPostBodySchema>;

export const SteeringTurnRecordSchema = z
  .object({
    id: z.string().min(1),
    runId: z.string().min(1),
    draftId: z.string().min(1).nullable(),
    actorDisplayName: z.string().min(1),
    role: z.literal("steward"),
    content: z.string().min(1),
    private: z.boolean(),
    createdAt: IsoUtcSchema
  })
  .strict();

export type SteeringTurnRecord = z.infer<typeof SteeringTurnRecordSchema>;

export const PublicSteeringTurnSchema = z
  .object({
    id: z.string().min(1),
    runId: z.string().min(1),
    draftId: z.string().min(1).nullable(),
    actor: z.string().min(1),
    role: z.literal("steward"),
    content: z.string().min(1).nullable(),
    reply: z.string().min(1).nullable(),
    private: z.boolean(),
    revisedDraftId: z.string().min(1).nullable(),
    createdAt: IsoUtcSchema
  })
  .strict();

export type PublicSteeringTurn = z.infer<typeof PublicSteeringTurnSchema>;

export function toPublicSteeringTurn(
  turn: SteeringTurnRecord,
  reply: string | null = null,
  revisedDraftId: string | null = null
): PublicSteeringTurn {
  const publicReply =
    turn.private || reply == null || reply.trim().length === 0 ? null : reply;
  return PublicSteeringTurnSchema.parse({
    id: turn.id,
    runId: turn.runId,
    draftId: turn.draftId,
    actor: turn.actorDisplayName,
    role: "steward",
    content: turn.private ? null : turn.content,
    reply: publicReply,
    private: turn.private,
    revisedDraftId,
    createdAt: turn.createdAt
  });
}
