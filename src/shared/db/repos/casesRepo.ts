import {
  CaseDetailSchema,
  CaseEntitySchema,
  CaseIssueTagSchema,
  CaseSchema,
  CaseStateSchema,
  DocketEventDetailSchema,
  type Case,
  type CaseDetail
} from "../../schemas/caseSchema";
import { DevelopmentSchema, type Development } from "../../schemas/development";
import { asBool, type Db } from "../client";
import { mapEntity, type EntityRow } from "./entitiesRepo";
import { listSourcesForOwner } from "./sourcesRepo";
import { mapState, type StateRow } from "./statesRepo";

type CaseRow = {
  id: string;
  caption: string;
  court: string;
  docket_number: string | null;
  forum: string;
  lifecycle: string;
  posture: string;
  circuit_id: string | null;
  filed_at: string | null;
  decided_at: string | null;
  provenance_kind: string;
  published_at: string;
  updated_at: string;
};

type DocketEventRow = {
  id: string;
  case_id: string;
  occurred_at: string;
  description: string;
  source_id: string;
  provenance_kind: string;
  published_at: string;
  updated_at: string;
};

type IssueTagRow = {
  id: string;
  slug: string;
  label: string;
  tag_provenance_kind: string;
  tag_published_at: string;
  tag_updated_at: string;
  is_controlling: number;
  link_provenance_kind: string;
  link_published_at: string;
  link_updated_at: string;
};

type CaseStateRow = StateRow & {
  link_provenance_kind: string;
  link_published_at: string;
  link_updated_at: string;
};

type CaseEntityRow = EntityRow & {
  case_role: string;
  link_provenance_kind: string;
  link_published_at: string;
  link_updated_at: string;
};

function mapCase(row: CaseRow): Case {
  return CaseSchema.parse({
    id: row.id,
    caption: row.caption,
    court: row.court,
    docketNumber: row.docket_number,
    forum: row.forum,
    lifecycle: row.lifecycle,
    posture: row.posture,
    circuitId: row.circuit_id,
    filedAt: row.filed_at,
    decidedAt: row.decided_at,
    provenanceKind: row.provenance_kind,
    publishedAt: row.published_at,
    updatedAt: row.updated_at
  });
}

export async function listCases(db: Db): Promise<Case[]> {
  const { results } = await db
    .prepare(
      `SELECT id, caption, court, docket_number, forum,
              lifecycle, posture, circuit_id, filed_at, decided_at,
              provenance_kind, published_at, updated_at
         FROM cases
     ORDER BY updated_at DESC, id ASC`
    )
    .all<CaseRow>();
  return (results ?? []).map(mapCase);
}

type DevelopmentRow = {
  id: string;
  occurred_at: string;
  description: string;
  case_id: string;
  caption: string;
  court: string;
};

/**
 * Latest docket events for the apex "Latest developments" feed.
 * JOIN rather than N+1 case-detail fetches — list cases have no docket rows.
 */
export async function listRecentDevelopments(
  db: Db,
  limit = 7
): Promise<Development[]> {
  const { results } = await db
    .prepare(
      `SELECT e.id, e.occurred_at, e.description, e.case_id,
              c.caption, c.court
         FROM docket_events e
         JOIN cases c ON c.id = e.case_id
     ORDER BY e.occurred_at DESC, e.id ASC
        LIMIT ?`
    )
    .bind(limit)
    .all<DevelopmentRow>();
  return (results ?? []).map((row) =>
    DevelopmentSchema.parse({
      id: row.id,
      occurredAt: row.occurred_at,
      description: row.description,
      caseId: row.case_id,
      caption: row.caption,
      court: row.court
    })
  );
}

export async function getCaseById(
  db: Db,
  id: string
): Promise<CaseDetail | null> {
  const row = await db
    .prepare(
      `SELECT id, caption, court, docket_number, forum,
              lifecycle, posture, circuit_id, filed_at, decided_at,
              provenance_kind, published_at, updated_at
         FROM cases WHERE id = ?`
    )
    .bind(id)
    .first<CaseRow>();
  if (!row) return null;

  const caseRecord = mapCase(row);
  const [sources, docketResult, issueResult, stateResult, entityResult] =
    await Promise.all([
      listSourcesForOwner(db, "cases", id),
      db
        .prepare(
          `SELECT id, case_id, occurred_at, description, source_id,
                  provenance_kind, published_at, updated_at
             FROM docket_events
            WHERE case_id = ?
         ORDER BY occurred_at DESC, id ASC`
        )
        .bind(id)
        .all<DocketEventRow>(),
      db
        .prepare(
          `SELECT
             t.id,
             t.slug,
             t.label,
             t.provenance_kind AS tag_provenance_kind,
             t.published_at AS tag_published_at,
             t.updated_at AS tag_updated_at,
             cit.is_controlling,
             cit.provenance_kind AS link_provenance_kind,
             cit.published_at AS link_published_at,
             cit.updated_at AS link_updated_at
           FROM case_issue_tags cit
           JOIN issue_tags t ON t.id = cit.issue_tag_id
          WHERE cit.case_id = ?
       ORDER BY cit.is_controlling DESC, t.label ASC`
        )
        .bind(id)
        .all<IssueTagRow>(),
      db
        .prepare(
          `SELECT
             s.id,
             s.code,
             s.name,
             s.circuit_id,
             s.operational_status,
             s.operational_status_basis,
             s.posture,
             s.controlling_case_id,
             s.why_note,
             s.provenance_kind,
             s.published_at,
             s.updated_at,
             cs.provenance_kind AS link_provenance_kind,
             cs.published_at AS link_published_at,
             cs.updated_at AS link_updated_at
           FROM case_states cs
           JOIN states s ON s.id = cs.state_id
          WHERE cs.case_id = ?
       ORDER BY s.name ASC`
        )
        .bind(id)
        .all<CaseStateRow>(),
      db
        .prepare(
          `SELECT
             e.id,
             e.slug,
             e.name,
             e.role,
             e.provenance_kind,
             e.published_at,
             e.updated_at,
             ce.role AS case_role,
             ce.provenance_kind AS link_provenance_kind,
             ce.published_at AS link_published_at,
             ce.updated_at AS link_updated_at
           FROM case_entities ce
           JOIN entities e ON e.id = ce.entity_id
          WHERE ce.case_id = ?
       ORDER BY e.name ASC`
        )
        .bind(id)
        .all<CaseEntityRow>()
    ]);

  const docketEvents = (docketResult.results ?? []).map((event) => {
    const source = sources.find(
      (candidate) => candidate.id === event.source_id
    );
    if (!source) {
      throw new Error(`Missing case-owned source '${event.source_id}'.`);
    }
    return DocketEventDetailSchema.parse({
      id: event.id,
      caseId: event.case_id,
      occurredAt: event.occurred_at,
      description: event.description,
      sourceId: event.source_id,
      provenanceKind: event.provenance_kind,
      publishedAt: event.published_at,
      updatedAt: event.updated_at,
      source
    });
  });

  const issueTags = (issueResult.results ?? []).map((assignment) =>
    CaseIssueTagSchema.parse({
      tag: {
        id: assignment.id,
        slug: assignment.slug,
        label: assignment.label,
        provenanceKind: assignment.tag_provenance_kind,
        publishedAt: assignment.tag_published_at,
        updatedAt: assignment.tag_updated_at
      },
      isControlling: asBool(assignment.is_controlling),
      provenanceKind: assignment.link_provenance_kind,
      publishedAt: assignment.link_published_at,
      updatedAt: assignment.link_updated_at
    })
  );

  const states = (stateResult.results ?? []).map((state) =>
    CaseStateSchema.parse({
      state: mapState(state),
      provenanceKind: state.link_provenance_kind,
      publishedAt: state.link_published_at,
      updatedAt: state.link_updated_at
    })
  );

  const entities = (entityResult.results ?? []).map((entity) =>
    CaseEntitySchema.parse({
      entity: mapEntity(entity),
      role: entity.case_role,
      provenanceKind: entity.link_provenance_kind,
      publishedAt: entity.link_published_at,
      updatedAt: entity.link_updated_at
    })
  );

  return CaseDetailSchema.parse({
    ...caseRecord,
    sources,
    docketEvents,
    issueTags,
    states,
    entities
  });
}
