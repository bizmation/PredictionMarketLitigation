import { CircuitSchema, type Circuit } from "../../schemas/circuit";
import { asBool, type Db } from "../client";

type CircuitRow = {
  id: string;
  number: number | null;
  name: string;
  posture: string;
  has_split: number;
  summary: string | null;
  provenance_kind: string;
  published_at: string;
  updated_at: string;
};

function mapCircuit(row: CircuitRow): Circuit {
  return CircuitSchema.parse({
    id: row.id,
    number: row.number,
    name: row.name,
    posture: row.posture,
    hasSplit: asBool(row.has_split),
    summary: row.summary,
    provenanceKind: row.provenance_kind,
    publishedAt: row.published_at,
    updatedAt: row.updated_at
  });
}

export async function listCircuits(db: Db): Promise<Circuit[]> {
  const { results } = await db
    .prepare(
      `SELECT id, number, name, posture, has_split, summary,
              provenance_kind, published_at, updated_at
         FROM circuits
     ORDER BY CASE WHEN number IS NULL THEN 1 ELSE 0 END, number ASC`
    )
    .all<CircuitRow>();
  return (results ?? []).map(mapCircuit);
}

export async function getCircuitById(
  db: Db,
  id: string
): Promise<Circuit | null> {
  const row = await db
    .prepare(
      `SELECT id, number, name, posture, has_split, summary,
              provenance_kind, published_at, updated_at
         FROM circuits WHERE id = ?`
    )
    .bind(id)
    .first<CircuitRow>();
  return row ? mapCircuit(row) : null;
}
