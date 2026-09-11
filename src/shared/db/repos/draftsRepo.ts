import { z } from "zod";

import { IsoUtcSchema } from "../../schemas/common";
import {
  DraftRecordSchema,
  EvalSummarySchema,
  type DraftRecord,
  type EvalSummary
} from "../../schemas/run";
import { asBool, type Db } from "../client";

/**
 * Story 3.1 — `drafts` repo. Snake_case rows in (via `?` binds only),
 * camelCase Zod-mapped domain objects out. `insertDraft` uses
 * `INSERT OR IGNORE` so a Workflow `step.do` retry with a deterministic
 * draft id does not throw or duplicate the row. Story 3.5 adds
 * `applyDraftReview` (validate-before-UPDATE) for the drafter overwrite + eval.
 */

type DraftRow = {
  id: string;
  run_id: string;
  target_entity_type: string | null;
  target_entity_id: string | null;
  diff_json: string;
  body: string;
  tier2_only: number;
  confidence: number | null;
  eval_summary_json: string | null;
  outcome: string | null;
  decided_at: string | null;
  decided_by: string | null;
  edited_body: string | null;
  created_at: string;
  updated_at: string;
};

const DRAFT_COLUMNS = `id, run_id, target_entity_type, target_entity_id, diff_json,
              body, tier2_only, confidence, eval_summary_json, outcome,
              decided_at, decided_by, edited_body, created_at, updated_at`;

function mapDraft(row: DraftRow): DraftRecord {
  return DraftRecordSchema.parse({
    id: row.id,
    runId: row.run_id,
    targetEntityType: row.target_entity_type,
    targetEntityId: row.target_entity_id,
    diff: JSON.parse(row.diff_json),
    body: row.body,
    tier2Only: asBool(row.tier2_only),
    confidence: row.confidence,
    evalSummary:
      row.eval_summary_json == null ? null : JSON.parse(row.eval_summary_json),
    outcome: row.outcome,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
    editedBody: row.edited_body,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

export async function listByRun(db: Db, runId: string): Promise<DraftRecord[]> {
  const { results } = await db
    .prepare(
      `SELECT ${DRAFT_COLUMNS} FROM drafts WHERE run_id = ?
        ORDER BY created_at ASC, id ASC`
    )
    .bind(runId)
    .all<DraftRow>();
  return (results ?? []).map(mapDraft);
}

export async function getById(db: Db, id: string): Promise<DraftRecord | null> {
  const row = await db
    .prepare(`SELECT ${DRAFT_COLUMNS} FROM drafts WHERE id = ?`)
    .bind(id)
    .first<DraftRow>();
  return row ? mapDraft(row) : null;
}

export async function insertDraft(
  db: Db,
  input: {
    id: string;
    runId: string;
    targetEntityType: string | null;
    targetEntityId: string | null;
    diff: unknown;
    body: string;
    tier2Only: boolean;
    confidence: number | null;
    evalSummary: EvalSummary | null;
    createdAt: string;
  }
): Promise<DraftRecord> {
  const record = DraftRecordSchema.parse({
    id: input.id,
    runId: input.runId,
    targetEntityType: input.targetEntityType,
    targetEntityId: input.targetEntityId,
    diff: input.diff,
    body: input.body,
    tier2Only: input.tier2Only,
    confidence: input.confidence,
    evalSummary: input.evalSummary,
    outcome: null,
    decidedAt: null,
    decidedBy: null,
    editedBody: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  });
  await db
    .prepare(
      `INSERT OR IGNORE INTO drafts (id, run_id, target_entity_type, target_entity_id,
          diff_json, body, tier2_only, confidence, eval_summary_json,
          outcome, decided_at, decided_by, edited_body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`
    )
    .bind(
      record.id,
      record.runId,
      record.targetEntityType,
      record.targetEntityId,
      JSON.stringify(record.diff),
      record.body,
      record.tier2Only ? 1 : 0,
      record.confidence,
      record.evalSummary == null ? null : JSON.stringify(record.evalSummary),
      record.createdAt,
      record.updatedAt
    )
    .run();
  return record;
}

const DraftReviewPatchSchema = z
  .object({
    id: z.string().min(1),
    body: z.string().min(1),
    diff: z.unknown(),
    confidence: z.number().int().min(0).max(100).nullable(),
    evalSummary: EvalSummarySchema,
    updatedAt: IsoUtcSchema
  })
  .strict();

type DraftReviewInput = {
  id: string;
  body: string;
  diff: unknown;
  confidence: number | null;
  evalSummary: EvalSummary;
  updatedAt: string;
};

/**
 * Statement form so story 3.5 can `db.batch` this UPDATE with `draft.evaluated`.
 * Validates and loads the row before returning the statement (no write yet).
 */
export async function applyDraftReviewStmt(
  db: Db,
  input: DraftReviewInput
): Promise<D1PreparedStatement> {
  const patch = DraftReviewPatchSchema.parse(input);
  const existing = await getById(db, patch.id);
  if (!existing) {
    throw new Error(`Draft ${patch.id} not found.`);
  }
  const record = DraftRecordSchema.parse({
    ...existing,
    body: patch.body,
    diff: patch.diff,
    confidence: patch.confidence,
    evalSummary: patch.evalSummary,
    updatedAt: patch.updatedAt
  });
  return db
    .prepare(
      `UPDATE drafts
          SET body = ?, diff_json = ?, confidence = ?, eval_summary_json = ?,
              updated_at = ?
        WHERE id = ?`
    )
    .bind(
      record.body,
      JSON.stringify(record.diff),
      record.confidence,
      JSON.stringify(record.evalSummary),
      record.updatedAt,
      record.id
    );
}

const GuardrailIneligiblePatchSchema = z
  .object({
    id: z.string().min(1),
    updatedAt: IsoUtcSchema
  })
  .strict();

/**
 * Statement form so story 3.6 can `db.batch` this UPDATE with
 * `guardrails.failed`. ORs `guardrail_fail` into existing ineligible
 * without clobbering the 3.5 eval payload. Validate-before-write.
 * If the reason is already present, returns a no-op statement.
 */
export async function applyGuardrailIneligibleStmt(
  db: Db,
  input: { id: string; updatedAt: string }
): Promise<D1PreparedStatement> {
  const patch = GuardrailIneligiblePatchSchema.parse(input);
  const existing = await getById(db, patch.id);
  if (!existing) {
    throw new Error(`Draft ${patch.id} not found.`);
  }
  if (existing.evalSummary == null) {
    throw new Error(`Draft ${patch.id} has no evalSummary to stamp.`);
  }
  if (existing.evalSummary.ineligible.includes("guardrail_fail")) {
    return db.prepare("SELECT 1 WHERE 0");
  }
  const record = DraftRecordSchema.parse({
    ...existing,
    evalSummary: {
      ...existing.evalSummary,
      ineligible: [...existing.evalSummary.ineligible, "guardrail_fail"]
    },
    updatedAt: patch.updatedAt
  });
  return db
    .prepare(
      `UPDATE drafts
          SET eval_summary_json = ?, updated_at = ?
        WHERE id = ?`
    )
    .bind(JSON.stringify(record.evalSummary), record.updatedAt, record.id);
}

/**
 * Story 3.5 — persist the drafter overwrite + reviewer eval in one UPDATE.
 * Validate-before-write: merge onto the existing row and parse the full
 * DraftRecord so a CHECK-passing but schema-invalid row cannot land.
 */
export async function applyDraftReview(
  db: Db,
  input: DraftReviewInput
): Promise<DraftRecord> {
  await (await applyDraftReviewStmt(db, input)).run();
  const record = await getById(db, input.id);
  if (!record) {
    throw new Error(`Draft ${input.id} not found.`);
  }
  return record;
}
