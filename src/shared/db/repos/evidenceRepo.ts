import type { Db } from "../client";
import { EvidenceEventSchema, type EvidenceEvent } from "../../schemas/run";

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
