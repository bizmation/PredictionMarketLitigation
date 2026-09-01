import { CertSignalSchema, type CertSignal } from "../../schemas/certSignal";
import type { Db } from "../client";

type CertSignalRow = {
  id: string;
  reading: string;
  factors_json: string;
  method_note: string;
  reviewed_at: string;
  approver: string;
  provenance_kind: string;
  published_at: string;
  updated_at: string;
};

function mapCertSignal(row: CertSignalRow): CertSignal {
  return CertSignalSchema.parse({
    id: row.id,
    reading: row.reading,
    factors: JSON.parse(row.factors_json),
    methodNote: row.method_note,
    reviewedAt: row.reviewed_at,
    approver: row.approver,
    provenanceKind: row.provenance_kind,
    publishedAt: row.published_at,
    updatedAt: row.updated_at
  });
}

/** Singleton — id is constrained to 'current' in DDL. */
export async function getCertSignal(db: Db): Promise<CertSignal | null> {
  const row = await db
    .prepare(
      `SELECT id, reading, factors_json, method_note, reviewed_at,
              approver, provenance_kind, published_at, updated_at
         FROM cert_signals WHERE id = 'current'`
    )
    .first<CertSignalRow>();
  return row ? mapCertSignal(row) : null;
}
