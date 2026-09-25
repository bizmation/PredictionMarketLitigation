import type { Db } from "../client";
import { EvidenceEventSchema, type EvidenceEvent } from "../../schemas/run";
import { type EvidenceEventType } from "../../schemas/vocabulary";

/**
 * Story 3.1 — `evidence_events` repo. D1 mapping only; the Evidence projector
 * (Story 3.8) owns every pipeline write and scrubs payloads before bind.
 * Snake_case rows in (via `?` binds only), camelCase Zod-mapped domain
 * objects out.
 */

type EvidenceRow = {
  id: string;
  run_id: string;
  seq: number;
  event: string;
  payload_json: string | null;
  created_at: string;
};

function mapEvidenceEvent(row: EvidenceRow): EvidenceEvent {
  return EvidenceEventSchema.parse({
    id: row.id,
    runId: row.run_id,
    seq: row.seq,
    event: row.event,
    payload: row.payload_json == null ? null : JSON.parse(row.payload_json),
    createdAt: row.created_at
  });
}

/**
 * (run_id, seq) is UNIQUE and is the render order for Evidence detail (3.8).
 */
export async function listByRun(
  db: Db,
  runId: string
): Promise<EvidenceEvent[]> {
  const { results } = await db
    .prepare(
      `SELECT id, run_id, seq, event, payload_json, created_at
         FROM evidence_events WHERE run_id = ?
        ORDER BY seq ASC, id ASC`
    )
    .bind(runId)
    .all<EvidenceRow>();
  return (results ?? []).map(mapEvidenceEvent);
}

type AppendEventInput = {
  id: string;
  runId: string;
  event: EvidenceEventType;
  payload: unknown;
  createdAt: string;
};

function parsedAppendEvent(input: AppendEventInput): EvidenceEvent {
  return EvidenceEventSchema.parse({
    id: input.id,
    runId: input.runId,
    seq: 0,
    event: input.event,
    payload: input.payload,
    createdAt: input.createdAt
  });
}

/**
 * Statement form so callers can `db.batch` this insert with another write
 * (story 3.5 persist: evidence + Draft UPDATE in one D1 transaction).
 */
export function appendEventStmt(
  db: Db,
  input: AppendEventInput,
  guard?: { draftId: string; state: "unevaluated" | "evaluated" | "undecided" }
): D1PreparedStatement {
  const row = parsedAppendEvent(input);
  // Evaluator receipts precede their conditional UPDATE in the same batch.
  // Final guardrails require a real evaluation receipt, never a legacy guess.
  const statePredicate =
    guard?.state === "unevaluated"
      ? "AND eval_summary_json IS NULL"
      : guard?.state === "evaluated"
        ? `AND eval_summary_json IS NOT NULL AND EXISTS (
          SELECT 1 FROM evidence_events e WHERE e.run_id = drafts.run_id
            AND e.event = 'draft.evaluated'
            AND json_extract(e.payload_json, '$.draftId') = drafts.id)`
        : "";
  const condition = guard
    ? `WHERE EXISTS (SELECT 1 FROM drafts WHERE id = ? AND outcome IS NULL ${statePredicate})`
    : "";
  return db
    .prepare(
      `INSERT OR IGNORE INTO evidence_events (id, run_id, seq, event, payload_json, created_at)
       SELECT ?, ?, (
         SELECT COALESCE(MAX(seq), -1) + 1 FROM evidence_events WHERE run_id = ?
       ), ?, ?, ? ${condition}`
    )
    .bind(
      row.id,
      row.runId,
      row.runId,
      row.event,
      row.payload == null ? null : JSON.stringify(row.payload),
      row.createdAt,
      ...(guard ? [guard.draftId] : [])
    );
}

/**
 * Story 3.3 — the harness's evidence write path (3.1 left this repo read-only).
 * Appends one event with the next per-run `seq` in a single statement.
 * `INSERT OR IGNORE` makes Workflow `step.do` retries idempotent when the
 * caller uses a deterministic `id`; the `UNIQUE(run_id, seq)` index still
 * drops a colliding seq rather than duplicating it.
 */
export async function appendEvent(
  db: Db,
  input: AppendEventInput
): Promise<EvidenceEvent> {
  const row = parsedAppendEvent(input);
  await appendEventStmt(db, input).run();
  const written = await db
    .prepare(`SELECT seq FROM evidence_events WHERE id = ? AND run_id = ?`)
    .bind(row.id, row.runId)
    .first<{ seq: number }>();
  return { ...row, seq: written?.seq ?? row.seq };
}
