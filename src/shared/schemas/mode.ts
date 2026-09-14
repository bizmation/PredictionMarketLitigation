import { z } from "zod";

import { IsoUtcSchema } from "./common";
import { RunModeSchema } from "./vocabulary";

/**
 * Approval-gate mode wire contracts (Story 3.13).
 *
 * Public `GET /api/mode` and the operator `POST /api/admin/mode` body.
 * Threshold is an integer 0–100 on the same scale as Draft `confidence`
 * (3.5), never a 0–1 float. Audit rows carry `displayName` only — never
 * email.
 */

/** Launch default (HITL) and fail-closed floor when the singleton is missing. */
export const AUTO_APPROVE_CONFIDENCE_THRESHOLD = 70;

export const MODE_AUDIT_KIND_VALUES = ["mode", "threshold"] as const;

export const ModeAuditKindSchema = z.enum(MODE_AUDIT_KIND_VALUES);
export type ModeAuditKind = z.infer<typeof ModeAuditKindSchema>;

const ModeValueAuditSchema = z
  .object({
    id: z.string().min(1),
    createdAt: IsoUtcSchema,
    actorDisplayName: z.string().min(1),
    kind: z.literal("mode"),
    prior: z.object({ mode: RunModeSchema }).strict(),
    next: z.object({ mode: RunModeSchema }).strict()
  })
  .strict();

const ThresholdValueAuditSchema = z
  .object({
    id: z.string().min(1),
    createdAt: IsoUtcSchema,
    actorDisplayName: z.string().min(1),
    kind: z.literal("threshold"),
    prior: z.object({ threshold: z.number().int().min(0).max(100) }).strict(),
    next: z.object({ threshold: z.number().int().min(0).max(100) }).strict()
  })
  .strict();

export const ModeAuditSchema = z.discriminatedUnion("kind", [
  ModeValueAuditSchema,
  ThresholdValueAuditSchema
]);

export type ModeAudit = z.infer<typeof ModeAuditSchema>;

export const ApprovalModeSchema = z
  .object({
    mode: RunModeSchema,
    threshold: z.number().int().min(0).max(100),
    version: z.number().int().positive(),
    updatedAt: IsoUtcSchema,
    audit: z.array(ModeAuditSchema)
  })
  .strict();

export type ApprovalMode = z.infer<typeof ApprovalModeSchema>;

export const ModePostBodySchema = z
  .object({
    mode: RunModeSchema.optional(),
    threshold: z.number().int().min(0).max(100).optional()
  })
  .strict();

export type ModePostBody = z.infer<typeof ModePostBodySchema>;

/** Fail-closed public projection when the singleton row is missing. */
export const DEFAULT_APPROVAL_MODE: ApprovalMode = {
  mode: "hitl",
  threshold: AUTO_APPROVE_CONFIDENCE_THRESHOLD,
  version: 1,
  updatedAt: "2026-09-13T00:00:00.000Z",
  audit: []
};
