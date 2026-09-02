import {
  EntityListItemSchema,
  EntitySchema,
  type Entity,
  type EntityFootprint,
  type EntityListItem,
  type EntityMatter
} from "../../schemas/entity";
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

type MatterJoinRow = {
  entity_id: string;
  case_role: string;
  case_id: string;
  caption: string;
  court: string;
  docket_number: string | null;
  forum: string;
  lifecycle: string;
  posture: string;
};

type FootprintJoinRow = {
  entity_id: string;
  operational_status: string;
  note: string | null;
  state_code: string;
  state_name: string;
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

export async function listEntities(db: Db): Promise<EntityListItem[]> {
  const { results } = await db
    .prepare(
      `SELECT id, slug, name, role, provenance_kind, published_at, updated_at
         FROM entities
     ORDER BY name ASC`
    )
    .all<EntityRow>();
  const entities = results ?? [];

  const [matterResult, footprintResult] = await Promise.all([
    db
      .prepare(
        `SELECT ce.entity_id, ce.role AS case_role,
                c.id AS case_id, c.caption, c.court, c.docket_number,
                c.forum, c.lifecycle, c.posture
           FROM case_entities ce
           JOIN cases c ON c.id = ce.case_id
       ORDER BY c.caption ASC`
      )
      .all<MatterJoinRow>(),
    db
      .prepare(
        `SELECT sps.entity_id, sps.operational_status, sps.note,
                s.code AS state_code, s.name AS state_name
           FROM state_platform_statuses sps
           JOIN states s ON s.id = sps.state_id
       ORDER BY s.name ASC`
      )
      .all<FootprintJoinRow>()
  ]);

  const mattersByEntity = new Map<string, EntityMatter[]>();
  for (const row of matterResult.results ?? []) {
    const list = mattersByEntity.get(row.entity_id) ?? [];
    list.push({
      caseId: row.case_id,
      caption: row.caption,
      court: row.court,
      docketNumber: row.docket_number,
      forum: row.forum as EntityMatter["forum"],
      lifecycle: row.lifecycle as EntityMatter["lifecycle"],
      posture: row.posture as EntityMatter["posture"],
      role: row.case_role as EntityMatter["role"]
    });
    mattersByEntity.set(row.entity_id, list);
  }

  const footprintByEntity = new Map<string, EntityFootprint[]>();
  for (const row of footprintResult.results ?? []) {
    const list = footprintByEntity.get(row.entity_id) ?? [];
    list.push({
      stateCode: row.state_code,
      stateName: row.state_name,
      operationalStatus:
        row.operational_status as EntityFootprint["operationalStatus"],
      note: row.note
    });
    footprintByEntity.set(row.entity_id, list);
  }

  return entities.map((row) =>
    EntityListItemSchema.parse({
      ...mapEntity(row),
      matters: mattersByEntity.get(row.id) ?? [],
      footprint: footprintByEntity.get(row.id) ?? []
    })
  );
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
