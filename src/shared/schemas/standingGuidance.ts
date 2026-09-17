import { z } from "zod";

import { IsoUtcSchema } from "./common";

/**
 * Standing guidance contracts (Story 3.18).
 *
 * Guidance is operator text recorded through the steering POST with
 * `intent: "guidance"`. Every write (record, edit, revoke) is a new
 * version row for one `itemId`; nothing is updated or deleted in place.
 * In-force = latest version per item with `status: "active"`. It is public
 * authorized context, advisory to the *drafter* prompt only — never the
 * reviewer, steward, or YOLO prompts, and never a tool or allowlist entry.
 *
 * Cap and per-item length are code constants (decided 2026-09-17) and are
 * exposed on the public GET so the composer and readers see the same
 * numbers. Edits and revokes are always allowed; only a new item is
 * subject to the cap.
 */

export const STANDING_GUIDANCE_CAP = 12 as const;
export const STANDING_GUIDANCE_MAX_CHARS = 600 as const;

export const STANDING_GUIDANCE_STATUS_VALUES = ["active", "revoked"] as const;
export const StandingGuidanceStatusSchema = z.enum(
  STANDING_GUIDANCE_STATUS_VALUES
);
export type StandingGuidanceStatus = z.infer<
  typeof StandingGuidanceStatusSchema
>;

export const StandingGuidanceVersionSchema = z
  .object({
    id: z.string().min(1),
    itemId: z.string().min(1),
    version: z.number().int().positive(),
    content: z.string().trim().min(1).max(STANDING_GUIDANCE_MAX_CHARS),
    status: StandingGuidanceStatusSchema,
    actor: z.string().min(1),
    sourceTurnId: z.string().min(1).nullable(),
    createdAt: IsoUtcSchema,
    revokedAt: IsoUtcSchema.nullable()
  })
  .strict()
  .refine((row) => (row.status === "revoked") === (row.revokedAt != null), {
    message: "revokedAt is set exactly when status is revoked"
  });

export type StandingGuidanceVersion = z.infer<
  typeof StandingGuidanceVersionSchema
>;

/** Public projection of one version row (no `steering_turns` fields). */
export const PublicStandingGuidanceItemSchema = z
  .object({
    itemId: z.string().min(1),
    version: z.number().int().positive(),
    status: StandingGuidanceStatusSchema,
    content: z.string().min(1),
    actor: z.string().min(1),
    createdAt: IsoUtcSchema,
    revokedAt: IsoUtcSchema.nullable(),
    sourceTurnId: z.string().min(1).nullable()
  })
  .strict();

export type PublicStandingGuidanceItem = z.infer<
  typeof PublicStandingGuidanceItemSchema
>;

export const PublicStandingGuidanceSchema = z
  .object({
    cap: z.literal(STANDING_GUIDANCE_CAP),
    maxChars: z.literal(STANDING_GUIDANCE_MAX_CHARS),
    inForce: z.array(PublicStandingGuidanceItemSchema),
    history: z.array(PublicStandingGuidanceItemSchema)
  })
  .strict();

export type PublicStandingGuidance = z.infer<
  typeof PublicStandingGuidanceSchema
>;

/** `{ itemId, version }` reference used in `run.started` / `draft.evaluated`. */
export const GuidanceRefSchema = z
  .object({
    itemId: z.string().min(1),
    version: z.number().int().positive()
  })
  .strict();

export type GuidanceRef = z.infer<typeof GuidanceRefSchema>;

export function toGuidanceRef(
  row: Pick<StandingGuidanceVersion, "itemId" | "version">
): GuidanceRef {
  return { itemId: row.itemId, version: row.version };
}
