import { asBool, type Db } from "../client";
import { DraftRecordSchema, type DraftRecord } from "../../schemas/run";

/**
 * Story 3.1 — `drafts` repo. Read-only public projection of pending and
 * decided Drafts; the gate (3.10/3.11) owns every future write. Snake_case
 * rows in (via `?` binds only), camelCase Zod-mapped domain objects out.
 * `diff_json` / `eval_summary_json` are parsed to JSON values here, exactly
 * like `certSignalRepo` parses `factors_json`.
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
      `SELECT id, run_id, target_entity_type, target_entity_id, diff_json,
              body, tier2_only, confidence, eval_summary_json, outcome,
              decided_at, decided_by, edited_body, created_at, updated_at
         FROM drafts WHERE run_id = ?
        ORDER BY created_at ASC, id ASC`
    )
    .bind(runId)
    .all<DraftRow>();
  return (results ?? []).map(mapDraft);
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
    evalSummary: unknown;
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
      `INSERT INTO drafts (id, run_id, target_entity_type, target_entity_id,
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
