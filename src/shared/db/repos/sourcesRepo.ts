import { SourceSchema, type Source } from "../../schemas/source";
import type { OwningTable } from "../../schemas/vocabulary";
import type { Db } from "../client";

type SourceRow = {
  id: string;
  owning_table: string;
  owning_id: string;
  url: string;
  title: string;
  tier: string;
  published_at: string | null;
};

export function mapSource(row: SourceRow): Source {
  return SourceSchema.parse({
    id: row.id,
    owningTable: row.owning_table,
    owningId: row.owning_id,
    url: row.url,
    title: row.title,
    tier: row.tier,
    publishedAt: row.published_at
  });
}

export async function listSourcesForOwner(
  db: Db,
  owningTable: OwningTable,
  owningId: string
): Promise<Source[]> {
  const { results } = await db
    .prepare(
      `SELECT id, owning_table, owning_id, url, title, tier, published_at
         FROM sources
        WHERE owning_table = ? AND owning_id = ?
     ORDER BY tier ASC, published_at DESC, id ASC`
    )
    .bind(owningTable, owningId)
    .all<SourceRow>();
  return (results ?? []).map(mapSource);
}
