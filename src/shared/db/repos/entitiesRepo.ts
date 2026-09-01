import { EntitySchema, type Entity } from "../../schemas/entity";
import type { Db } from "../client";

export type EntityRow = {
  id: string;
  slug: string;
  name: string;
  role: string | null;
  provenance_kind: string;
  published_at: string;
  updated_at: string;
};

export function mapEntity(row: EntityRow): Entity {
  return EntitySchema.parse({
    id: row.id,
    slug: row.slug,
    name: row.name,
    role: row.role,
    provenanceKind: row.provenance_kind,
    publishedAt: row.published_at,
    updatedAt: row.updated_at
  });
}

export async function listEntities(db: Db): Promise<Entity[]> {
  const { results } = await db
    .prepare(
      `SELECT id, slug, name, role, provenance_kind, published_at, updated_at
         FROM entities
     ORDER BY name ASC`
    )
    .all<EntityRow>();
  return (results ?? []).map(mapEntity);
}

export async function getEntityBySlug(
  db: Db,
  slug: string
): Promise<Entity | null> {
  const row = await db
    .prepare(
      `SELECT id, slug, name, role, provenance_kind, published_at, updated_at
         FROM entities WHERE slug = ? COLLATE NOCASE`
    )
    .bind(slug)
    .first<EntityRow>();
  return row ? mapEntity(row) : null;
}
