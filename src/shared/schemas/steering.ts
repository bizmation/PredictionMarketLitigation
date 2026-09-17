import { z } from "zod";

import { IsoUtcSchema } from "./common";

/**
 * Steering channel contracts (Stories 3.14–3.18).
 *
 * Admin POST body is `{ content, private, draftId?, intent?, key?,
 * revertToVersion?, guidanceItemId?, revoke? }`. `intent` is `"ask"`
 * (default), `"revise"`, `"config"`, or `"guidance"` — the operator
 * control sets it; the server never classifies from the text. `private`
 * is stored at insert and is never updated. The public-safe turn payload
 * keeps actor/time/draftId/`private` and nulls `content` and `reply` when
 * the turn was marked private at submit. `reply` is also null when steward
 * is unconfigured or `complete()` failed. `revisedDraftId` is the new
 * Draft id after a successful revise; always null on ask/config/guidance
 * or an unrelated failure. `configVersion` is the new `poll_sources`
 * version after a successful steer/revert; null on ask, revise, guidance,
 * or a config refusal. `guidanceItemId` / `guidanceVersion` name the
 * `standing_guidance` version written by a guidance turn (record, edit,
 * or revoke); null on every other intent.
 */

export const SteeringIntentSchema = z.enum([
  "ask",
  "revise",
  "config",
  "guidance"
]);
export type SteeringIntent = z.infer<typeof SteeringIntentSchema>;

export const SteeringPostBodySchema = z
  .object({
    content: z.string().trim().min(1),
    private: z.boolean(),
    draftId: z.string().min(1).optional(),
    intent: SteeringIntentSchema.default("ask"),
    key: z.string().min(1).optional(),
    revertToVersion: z.number().int().nonnegative().optional(),
    guidanceItemId: z.string().min(1).optional(),
    revoke: z.boolean().optional()
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
    configVersion: z.number().int().nonnegative().nullable(),
    guidanceItemId: z.string().min(1).nullable(),
    guidanceVersion: z.number().int().positive().nullable(),
    createdAt: IsoUtcSchema
  })
  .strict();

export type PublicSteeringTurn = z.infer<typeof PublicSteeringTurnSchema>;

export function toPublicSteeringTurn(
  turn: SteeringTurnRecord,
  reply: string | null = null,
  revisedDraftId: string | null = null,
  configVersion: number | null = null,
  guidance: { itemId: string; version: number } | null = null
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
    configVersion,
    guidanceItemId: guidance?.itemId ?? null,
    guidanceVersion: guidance?.version ?? null,
    createdAt: turn.createdAt
  });
}
