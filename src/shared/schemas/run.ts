import { z } from "zod";

import { IsoDateSchema, IsoUtcSchema } from "./common";
import { LlmCallRecordSchema } from "./gateway";
import {
  EvidenceEventTypeSchema,
  RunModeSchema,
  RunOriginSchema,
  RunStatusSchema
} from "./vocabulary";

export {
  EvidenceEventTypeSchema,
  RunModeSchema,
  RunOriginSchema,
  RunStatusSchema
} from "./vocabulary";
export type {
  EvidenceEventType,
  RunMode,
  RunOrigin,
  RunStatus
} from "./vocabulary";

/**
 * Run, Draft & Evidence wire contracts (Story 3.1).
 *
 * Canonical API contracts for the public run log and Run detail (stories
 * 3.7/3.8 consume these later). All objects are `.strict()`: a stray field is
 * a contract bug, not noise to ignore. DB snake_case maps to camelCase here —
 * the mapping lives ONLY in the repo layer, and these schemas are what makes
 * a mapped row wire-safe.
 *
 * Money is integer cents + ISO currency code, never float dollars
 * (architecture #Spend). Timestamps keep the same 24-char ISO-UTC shape the
 * D1 CHECKs enforce, and 10-char real-world dates stay dates — nothing is
 * re-serialized through Date.
 */

const CURRENCY_CODE = /^[A-Z]{3}$/;
/** Human-readable run id: real UTC date + 4 hex (decided format). */
const RUN_ID = /^run-\d{8}-[0-9a-f]{4}$/;

const RunIdSchema = z
  .string()
  .regex(RUN_ID)
  .refine((id) => {
    const ymd = `${id.slice(4, 8)}-${id.slice(8, 10)}-${id.slice(10, 12)}`;
    return IsoDateSchema.safeParse(ymd).success;
  }, "Expected run-YYYYMMDD-xxxx with a real UTC calendar date");

const cents = z.number().int().nonnegative();

/**
 * One Run in the public log. `completedAt` stays null while the Run is
 * `running`; `budgetCents` null means "no recorded ceiling" (a designed empty
 * state, not an unlimited budget); `scheduledFor` null on manual Runs.
 */
export const RunSummarySchema = z
  .object({
    id: RunIdSchema,
    origin: RunOriginSchema,
    mode: RunModeSchema,
    status: RunStatusSchema,
    startedAt: IsoUtcSchema,
    completedAt: IsoUtcSchema.nullable(),
    spendCents: cents,
    spendCurrency: z.string().regex(CURRENCY_CODE),
    budgetCents: cents.nullable(),
    scheduledFor: IsoDateSchema.nullable()
  })
  .strict();

export type RunSummary = z.infer<typeof RunSummarySchema>;

/**
 * The gate decision on a Draft. Lives here rather than vocabulary.ts because
 * it is a Draft-state vocabulary, not a chip the UI renders today; the SQL
 * CHECK in 0006 carries the same three strings.
 */
export const DRAFT_OUTCOME_VALUES = ["approved", "edited", "rejected"] as const;

const DraftOutcomeSchema = z.enum(DRAFT_OUTCOME_VALUES);

/**
 * One row in the public run log (Story 3.7). `eventCount` is Evidence rows
 * for this Run (not a fake n-of-m step total). `approvalOutcome` is a Draft
 * `outcome` when 3.10 has written one; null is the designed "—" empty.
 * Insert and Run detail keep `RunSummarySchema`.
 */
export const RunLogItemSchema = z
  .object({
    ...RunSummarySchema.shape,
    eventCount: z.number().int().nonnegative(),
    approvalOutcome: DraftOutcomeSchema.nullable()
  })
  .strict();

export type RunLogItem = z.infer<typeof RunLogItemSchema>;

/**
 * FR17 ineligibility reasons persisted on a Draft for later auto-approve
 * policy (3.13). Closed set — 3.5 records the inputs; 3.6 adds
 * `guardrail_fail` so a hard fail is never agent-auto-approvable. This
 * story does not enforce the gate.
 */
export const INELIGIBLE_REASON_VALUES = [
  "tier2_only",
  "below_threshold",
  "eval_fail",
  "evals_not_run",
  "guardrail_fail"
] as const;

export const IneligibleReasonSchema = z.enum(INELIGIBLE_REASON_VALUES);
export type IneligibleReason = z.infer<typeof IneligibleReasonSchema>;

export const EVAL_STATUS_VALUES = ["ok", "eval_fail", "evals_not_run"] as const;

export const EvalStatusSchema = z.enum(EVAL_STATUS_VALUES);
export type EvalStatus = z.infer<typeof EvalStatusSchema>;

/**
 * Reviewer eval payload (Story 3.5). `status` is always explicit after
 * draft-and-review (`ok` | `eval_fail` | `evals_not_run`); `null` on the
 * Draft is only the pre-review packaging shell. `basis` is the public
 * reviewer notes (or an explicit "evals not run" / "eval-fail" string).
 * `disagreement.flagged` is true only when the reviewer declared dissent
 * with a non-empty description.
 */
export const EvalSummarySchema = z
  .object({
    status: EvalStatusSchema,
    basis: z.string(),
    citationCompleteness: z.number().int().min(0).max(100).nullable(),
    disagreement: z
      .object({
        flagged: z.boolean(),
        description: z.string().min(1).nullable()
      })
      .strict(),
    ineligible: z.array(IneligibleReasonSchema)
  })
  .strict();

export type EvalSummary = z.infer<typeof EvalSummarySchema>;

/**
 * A Draft record as the public sees it (pending Drafts are public on `ops.`
 * while never live F1). `diff` is the proposed field diff (shape owned by
 * 3.4/3.11). After 3.5, `body` is the drafter's original agent text — the
 * connector packaging shell is overwritten; operator edits still land in
 * `editedBody`, preserving the public before/after diff. `evalSummary` is
 * null only before draft-and-review.
 */
export const DraftRecordSchema = z
  .object({
    id: z.string().min(1),
    runId: RunIdSchema,
    targetEntityType: z.string().min(1).nullable(),
    targetEntityId: z.string().min(1).nullable(),
    diff: z.unknown(),
    body: z.string().min(1),
    tier2Only: z.boolean(),
    confidence: z.number().int().min(0).max(100).nullable(),
    evalSummary: EvalSummarySchema.nullable(),
    outcome: DraftOutcomeSchema.nullable(),
    decidedAt: IsoUtcSchema.nullable(),
    decidedBy: z.string().min(1).nullable(),
    editedBody: z.string().min(1).nullable(),
    createdAt: IsoUtcSchema,
    updatedAt: IsoUtcSchema
  })
  .strict()
  .refine(
    (draft) =>
      draft.outcome !== "edited" ||
      (draft.editedBody != null && draft.editedBody.trim().length > 0),
    {
      path: ["editedBody"],
      message: "edited outcome requires a non-empty editedBody"
    }
  );

export type DraftRecord = z.infer<typeof DraftRecordSchema>;

/**
 * One public Evidence projection row. `payload` is the scrubbed JSON stored
 * in `payload_json`; `seq` is the writer-supplied per-run monotonic integer
 * the Evidence detail renders in (runId, seq) order.
 */
export const EvidenceEventSchema = z
  .object({
    id: z.string().min(1),
    runId: RunIdSchema,
    seq: z.number().int().nonnegative(),
    event: EvidenceEventTypeSchema,
    payload: z.unknown().nullable(),
    createdAt: IsoUtcSchema
  })
  .strict();

export type EvidenceEvent = z.infer<typeof EvidenceEventSchema>;

/**
 * Run detail = the run plus everything the loop recorded under it. Arrays
 * may be empty — an empty Run's Evidence states zero drafts, and an unused
 * gateway leaves `llmCalls` empty. "May be empty" is a designed state, never
 * a missing key.
 */
export const RunDetailSchema = z
  .object({
    ...RunSummarySchema.shape,
    drafts: z.array(DraftRecordSchema),
    evidence: z.array(EvidenceEventSchema),
    llmCalls: z.array(LlmCallRecordSchema)
  })
  .strict();

export type RunDetail = z.infer<typeof RunDetailSchema>;
