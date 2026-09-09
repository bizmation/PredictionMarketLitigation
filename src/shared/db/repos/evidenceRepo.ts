import type { Db } from "../client";
import { EvidenceEventSchema, type EvidenceEvent } from "../../schemas/run";
import { type EvidenceEventType } from "../../schemas/vocabulary";

/**
 * Story 3.1 — `evidence_events` repo. Read-only public projection rows; the
 * Evidence projector (later Epic 3 stories) owns every write and scrubs
 * payloads before insert. Snake_case rows in (via `?` binds only), camelCase
 * Zod-mapped domain objects out.
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
 * (run_id, seq) is the render order for Evidence detail (3.8); `id` is only
 * a deterministic tie-break for the unspecified duplicate-seq case.
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

/**
 * Story 3.3 — the harness's evidence write path (3.1 left this repo read-only).
 * Appends one event with the next per-run `seq` in a single statement; the
 * `UNIQUE(run_id, seq)` index from 0006 guards the ordering under concurrent
 * writers by failing the INSERT rather than silently duplicating a seq.
 */
export async function appendEvent(
  db: Db,
  input: {
    id: string;
    runId: string;
    event: EvidenceEventType;
    payload: unknown;
    createdAt: string;
  }
): Promise<EvidenceEvent> {
  const row = EvidenceEventSchema.parse({
    id: input.id,
    runId: input.runId,
    seq: 0,
    event: input.event,
    payload: input.payload,
    createdAt: input.createdAt
  });
  await db
    .prepare(
      `INSERT INTO evidence_events (id, run_id, seq, event, payload_json, created_at)
       VALUES (?, ?, (
         SELECT COALESCE(MAX(seq), -1) + 1 FROM evidence_events WHERE run_id = ?
       ), ?, ?, ?)`
    )
    .bind(
      row.id,
      row.runId,
      row.runId,
      row.event,
      row.payload == null ? null : JSON.stringify(row.payload),
      row.createdAt
    )
    .run();
  const written = await db
    .prepare(`SELECT seq FROM evidence_events WHERE id = ? AND run_id = ?`)
    .bind(row.id, row.runId)
    .first<{ seq: number }>();
  return { ...row, seq: written?.seq ?? row.seq };
}
