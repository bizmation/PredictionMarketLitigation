import { z } from "zod";

import { IsoDateSchema, IsoUtcSchema } from "./common";
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
/** Human-readable run id: UTC date + 4 hex (decided format). */
const RUN_ID = /^run-\d{8}-[0-9a-f]{4}$/;

const cents = z.number().int().nonnegative();

/**
 * One Run in the public log. `completedAt` stays null while the Run is
 * `running`; `budgetCents` null means "no recorded ceiling" (a designed empty
 * state, not an unlimited budget); `scheduledFor` null on manual Runs.
 */
export const RunSummarySchema = z
  .object({
    id: z.string().regex(RUN_ID),
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
 * A Draft record as the public sees it (pending Drafts are public on `ops.`
 * while never live F1). `diff` and `evalSummary` are JSON values stored in
 * `diff_json`/`eval_summary_json`; their internal shape is owned by stories
 * 3.4/3.11 and deliberately not pinned here yet. `body` is the original
 * agent text and is never mutated — an operator edit lands in `editedBody`,
 * preserving the public before/after diff.
 */
export const DraftRecordSchema = z
  .object({
    id: z.string().min(1),
    runId: z.string().regex(RUN_ID),
    targetEntityType: z.string().min(1).nullable(),
    targetEntityId: z.string().min(1).nullable(),
    diff: z.unknown(),
    body: z.string().min(1),
    tier2Only: z.boolean(),
    confidence: z.number().int().min(0).max(100).nullable(),
    evalSummary: z.unknown().nullable(),
    outcome: DraftOutcomeSchema.nullable(),
    decidedAt: IsoUtcSchema.nullable(),
    decidedBy: z.string().min(1).nullable(),
    editedBody: z.string().nullable(),
    createdAt: IsoUtcSchema,
    updatedAt: IsoUtcSchema
  })
  .strict();

export type DraftRecord = z.infer<typeof DraftRecordSchema>;

/**
 * One public Evidence projection row. `payload` is the scrubbed JSON stored
 * in `payload_json`; `seq` is the writer-supplied per-run monotonic integer
 * the Evidence detail renders in (runId, seq) order.
 */
export const EvidenceEventSchema = z
  .object({
    id: z.string().min(1),
    runId: z.string().regex(RUN_ID),
    seq: z.number().int().nonnegative(),
    event: EvidenceEventTypeSchema,
    payload: z.unknown().nullable(),
    createdAt: IsoUtcSchema
  })
  .strict();

export type EvidenceEvent = z.infer<typeof EvidenceEventSchema>;

/**
 * Run detail = the run plus everything the loop recorded under it. Both
 * arrays may be empty — an empty Run's Evidence states zero drafts, and
 * "may be empty" is a designed state, never a missing key.
 */
export const RunDetailSchema = z
  .object({
    ...RunSummarySchema.shape,
    drafts: z.array(DraftRecordSchema),
    evidence: z.array(EvidenceEventSchema)
  })
  .strict();

export type RunDetail = z.infer<typeof RunDetailSchema>;
