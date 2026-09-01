import {
  StateDetailSchema,
  StatePlatformStatusDetailSchema,
  StateSchema,
  type State,
  type StateDetail
} from "../../schemas/state";
import type { Db } from "../client";
import { mapEntity, type EntityRow } from "./entitiesRepo";
import { listSourcesForOwner } from "./sourcesRepo";

export type StateRow = {
  id: string;
  code: string;
  name: string;
  circuit_id: string | null;
  operational_status: string;
  operational_status_basis: string;
  posture: string;
  controlling_case_id: string | null;
  why_note: string | null;
  provenance_kind: string;
  published_at: string;
  updated_at: string;
};

type StatePlatformRow = EntityRow & {
  status_id: string;
  state_id: string;
  entity_id: string;
  operational_status: string;
  operational_status_basis: string;
  note: string | null;
  status_provenance_kind: string;
  status_published_at: string;
  status_updated_at: string;
};

export function mapState(row: StateRow): State {
  return StateSchema.parse({
    id: row.id,
    code: row.code,
    name: row.name,
    circuitId: row.circuit_id,
    operationalStatus: row.operational_status,
    operationalStatusBasis: row.operational_status_basis,
    posture: row.posture,
    controllingCaseId: row.controlling_case_id,
    whyNote: row.why_note,
    provenanceKind: row.provenance_kind,
    publishedAt: row.published_at,
    updatedAt: row.updated_at
  });
}

export async function listStates(db: Db): Promise<State[]> {
  const { results } = await db
    .prepare(
      `SELECT id, code, name, circuit_id, operational_status,
              operational_status_basis, posture, controlling_case_id,
              why_note, provenance_kind, published_at, updated_at
         FROM states
     ORDER BY name ASC`
    )
    .all<StateRow>();
  return (results ?? []).map(mapState);
}

export async function getStateByCode(
  db: Db,
  code: string
): Promise<StateDetail | null> {
  const row = await db
    .prepare(
      `SELECT id, code, name, circuit_id, operational_status,
              operational_status_basis, posture, controlling_case_id,
              why_note, provenance_kind, published_at, updated_at
         FROM states WHERE code = ? COLLATE NOCASE`
    )
    .bind(code)
    .first<StateRow>();
  if (!row) return null;

  const state = mapState(row);
  const [stateSources, platformRows] = await Promise.all([
    listSourcesForOwner(db, "states", state.id),
    db
      .prepare(
        `SELECT
           sps.id AS status_id,
           sps.state_id,
           sps.entity_id,
           sps.operational_status,
           sps.operational_status_basis,
           sps.note,
           sps.provenance_kind AS status_provenance_kind,
           sps.published_at AS status_published_at,
           sps.updated_at AS status_updated_at,
           e.id,
           e.slug,
           e.name,
           e.role,
           e.provenance_kind,
           e.published_at,
           e.updated_at
         FROM state_platform_statuses sps
         JOIN entities e ON e.id = sps.entity_id
        WHERE sps.state_id = ?
     ORDER BY e.name ASC`
      )
      .bind(state.id)
      .all<StatePlatformRow>()
  ]);

  const platformStatuses = await Promise.all(
    (platformRows.results ?? []).map(async (status) =>
      StatePlatformStatusDetailSchema.parse({
        id: status.status_id,
        stateId: status.state_id,
        entityId: status.entity_id,
        operationalStatus: status.operational_status,
        operationalStatusBasis: status.operational_status_basis,
        note: status.note,
        provenanceKind: status.status_provenance_kind,
        publishedAt: status.status_published_at,
        updatedAt: status.status_updated_at,
        entity: mapEntity(status),
        sources: await listSourcesForOwner(
          db,
          "state_platform_statuses",
          status.status_id
        )
      })
    )
  );

  return StateDetailSchema.parse({
    ...state,
    platformStatuses,
    sources: stateSources
  });
}
