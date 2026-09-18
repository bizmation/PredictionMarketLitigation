import { z } from "zod";

import type { Db } from "../../shared/db/client";
import { IsoDateSchema } from "../../shared/schemas/common";
import {
  acceptableFields,
  InferenceSchema,
  isCoherentAcceptance,
  STATE_PATCH_FIELDS,
  StatePatchSchema
} from "../../shared/schemas/docketInference";

/**
 * Story 3.11 — the only F1 writer. Parses a Draft `diff` as
 * `Record<field, {from, to}>`, maps allowlisted type + camelCase field onto
 * one UPDATE, and stamps provenance/timestamps (plus `cert_signals.approver`).
 * Identity and provenance columns are never taken from the diff. Imported
 * only from `approval.ts`.
 *
 * Story 3.21 adds the one insert target, `docket_events`: a verbatim record
 * from the CourtListener connector becomes `INSERT sources` (Tier-1, owned
 * by the case) → `INSERT docket_events` → `UPDATE cases` for the
 * `statePatch` fields the operator accepted, in one batch. The inference
 * (`kind`, `favors`) lands on the row only when accepted. Every statement
 * carries the `outcome IS NULL` retry guard so a replayed batch writes
 * nothing twice.
 */

export class UnpublishableError extends Error {
  constructor(reason = "unpublishable") {
    super(reason);
    this.name = "UnpublishableError";
  }
}

const ChangeSchema = z
  .object({
    from: z.unknown(),
    to: z.unknown()
  })
  .strict();

const DiffSchema = z.record(z.string(), ChangeSchema);

type FieldMap = Record<string, string>;

type TargetSpec = {
  table: string;
  fields: FieldMap;
  stampApprover?: boolean;
};

const TARGETS: Record<string, TargetSpec> = {
  states: {
    table: "states",
    fields: {
      name: "name",
      circuitId: "circuit_id",
      operationalStatus: "operational_status",
      operationalStatusBasis: "operational_status_basis",
      posture: "posture",
      controllingCaseId: "controlling_case_id",
      whyNote: "why_note"
    }
  },
  cases: {
    table: "cases",
    fields: {
      caption: "caption",
      court: "court",
      docketNumber: "docket_number",
      forum: "forum",
      lifecycle: "lifecycle",
      posture: "posture",
      circuitId: "circuit_id",
      filedAt: "filed_at",
      decidedAt: "decided_at"
    }
  },
  circuits: {
    table: "circuits",
    fields: {
      number: "number",
      name: "name",
      posture: "posture",
      hasSplit: "has_split",
      summary: "summary"
    }
  },
  entities: {
    table: "entities",
    fields: {
      name: "name",
      role: "role"
    }
  },
  cert_signals: {
    table: "cert_signals",
    fields: {
      reading: "reading",
      factors: "factors_json",
      methodNote: "method_note",
      reviewedAt: "reviewed_at"
    },
    stampApprover: true
  }
};

function unpublishable(reason?: string): never {
  throw new UnpublishableError(reason);
}

function bindValue(column: string, value: unknown): unknown {
  if (value === undefined) unpublishable();
  if (column === "has_split") {
    if (value === true || value === 1) return 1;
    if (value === false || value === 0) return 0;
    unpublishable();
  }
  if (column === "factors_json") {
    if (typeof value === "string") {
      try {
        JSON.parse(value);
      } catch {
        unpublishable();
      }
      return value;
    }
    if (value == null || typeof value !== "object") unpublishable();
    return JSON.stringify(value);
  }
  if (value !== null && typeof value === "object") unpublishable();
  return value;
}

export type F1ApplyInput = {
  draftId: string;
  targetEntityType: string | null;
  targetEntityId: string | null;
  diff: unknown;
  provenanceKind: "human" | "agent";
  now: string;
  approver: string;
  /**
   * Story 3.21 — the inference / `statePatch` fields the operator accepted
   * on a `docket_events` Draft. Omitted → every acceptable field is
   * accepted. Ignored for the update targets.
   */
  acceptedFields?: readonly string[];
};

export type F1ApplyResult = {
  statements: D1PreparedStatement[];
  acceptedFields: string[];
  strippedFields: string[];
};

export const DOCKET_EVENTS_TARGET = "docket_events";

const DRAFT_PENDING_GUARD =
  "EXISTS (SELECT 1 FROM drafts WHERE id = ? AND outcome IS NULL)";

const HTTPS_URL = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === "https:", "Expected HTTPS");

/** The connector-authored record part; everything the LLM may not touch. */
const DocketRecordSchema = z
  .object({
    caseId: z.string().min(1),
    occurredAt: IsoDateSchema,
    description: z.string().trim().min(1),
    sourceUrl: HTTPS_URL,
    entryNumber: z.number().int().nullable(),
    inference: InferenceSchema.optional(),
    statePatch: StatePatchSchema.optional()
  })
  .passthrough();

const CASE_STATE_COLUMNS: Record<(typeof STATE_PATCH_FIELDS)[number], string> =
  {
    lifecycle: "lifecycle",
    posture: "posture",
    decidedAt: "decided_at"
  };

/**
 * Story 3.21 — the `docket_events` insert batch. Order matters: the Tier-1
 * trigger on `docket_events` requires the case-owned `sources` row to exist
 * first. `cases.updated_at` is bumped even for a record-only publish (a new
 * development is a change to the case); provenance/published_at are stamped
 * on the case only when an accepted `statePatch` field actually changes it.
 */
async function applyDocketEventStmts(
  db: Db,
  input: F1ApplyInput,
  targetEntityId: string
): Promise<F1ApplyResult> {
  const parsed = DocketRecordSchema.safeParse(input.diff);
  if (!parsed.success) unpublishable();
  const record = parsed.data;

  const existing = await db
    .prepare(
      "SELECT id, caption, lifecycle, posture, decided_at FROM cases WHERE id = ?"
    )
    .bind(record.caseId)
    .first<{
      id: string;
      caption: string;
      lifecycle: string;
      posture: string;
      decided_at: string | null;
    }>();
  if (!existing) unpublishable();

  const acceptable = acceptableFields(record);
  const requested =
    input.acceptedFields == null ? acceptable : [...input.acceptedFields];
  for (const field of requested) {
    if (!acceptable.includes(field)) unpublishable();
  }
  const accepted = acceptable.filter((field) => requested.includes(field));
  const stripped = acceptable.filter((field) => !requested.includes(field));
  // `favors` rides with `kind`, `decidedAt` with `lifecycle`; a half alone
  // would publish a side with no ruling or a decision date on an open case.
  if (!isCoherentAcceptance(acceptable, accepted)) {
    unpublishable("incoherent acceptance");
  }
  // The derived patch was computed against the row as it stood at review;
  // a sibling Draft published since makes it stale. Fail closed — the
  // operator sees `invalid` and the card re-derives on reload.
  if (record.statePatch != null) {
    const live: Record<string, unknown> = {
      lifecycle: existing.lifecycle,
      posture: existing.posture,
      decidedAt: existing.decided_at
    };
    for (const field of STATE_PATCH_FIELDS) {
      const change = record.statePatch[field];
      if (change == null || !accepted.includes(field)) continue;
      if (change.from !== live[field]) {
        unpublishable(`stale state patch: ${field}`);
      }
    }
  }

  const sourceId = `src-${targetEntityId}`;
  const title =
    record.entryNumber == null
      ? `RECAP docket entry — ${existing.caption}`
      : `RECAP docket entry ${record.entryNumber} — ${existing.caption}`;
  const kind =
    record.inference != null && accepted.includes("kind")
      ? record.inference.kind
      : null;
  const favors =
    record.inference != null && accepted.includes("favors")
      ? record.inference.favors
      : null;

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO sources (id, owning_table, owning_id, url, title, tier, published_at)
         SELECT ?, 'cases', ?, ?, ?, 'tier1', ?
          WHERE ${DRAFT_PENDING_GUARD}`
      )
      .bind(
        sourceId,
        record.caseId,
        record.sourceUrl,
        title,
        record.occurredAt,
        input.draftId
      ),
    db
      .prepare(
        `INSERT INTO docket_events
           (id, case_id, occurred_at, description, source_id, kind, favors,
            provenance_kind, published_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE ${DRAFT_PENDING_GUARD}`
      )
      .bind(
        targetEntityId,
        record.caseId,
        record.occurredAt,
        record.description,
        sourceId,
        kind,
        favors,
        input.provenanceKind,
        input.now,
        input.now,
        input.draftId
      )
  ];

  const setClauses: string[] = [];
  const binds: unknown[] = [];
  if (record.statePatch != null) {
    for (const field of STATE_PATCH_FIELDS) {
      const change = record.statePatch[field];
      if (change == null || !accepted.includes(field)) continue;
      setClauses.push(`${CASE_STATE_COLUMNS[field]} = ?`);
      binds.push(change.to);
    }
  }
  if (setClauses.length > 0) {
    setClauses.push("provenance_kind = ?", "published_at = ?");
    binds.push(input.provenanceKind, input.now);
  }
  setClauses.push("updated_at = ?");
  binds.push(input.now);
  statements.push(
    db
      .prepare(
        `UPDATE cases
            SET ${setClauses.join(", ")}
          WHERE id = ?
            AND ${DRAFT_PENDING_GUARD}`
      )
      .bind(...binds, record.caseId, input.draftId)
  );

  return { statements, acceptedFields: accepted, strippedFields: stripped };
}

/**
 * Validate-then-statement: unknown type/field, null target, missing row, or
 * malformed diff throws `UnpublishableError` before any write. Update
 * targets return one statement; `docket_events` returns the insert batch.
 */
export async function applyF1Stmts(
  db: Db,
  input: F1ApplyInput
): Promise<F1ApplyResult> {
  const { targetEntityType, targetEntityId } = input;
  if (targetEntityType == null || targetEntityId == null) unpublishable();
  if (targetEntityType === DOCKET_EVENTS_TARGET) {
    return applyDocketEventStmts(db, input, targetEntityId);
  }
  // Update targets have nothing to accept or strip; a supplied list is a
  // caller bug, not a no-op.
  if (input.acceptedFields != null) unpublishable("acceptedFields");
  return {
    statements: [await applyF1Stmt(db, input)],
    acceptedFields: [],
    strippedFields: []
  };
}

export async function applyF1Stmt(
  db: Db,
  input: F1ApplyInput
): Promise<D1PreparedStatement> {
  const { targetEntityType, targetEntityId } = input;
  if (targetEntityType == null || targetEntityId == null) unpublishable();

  const spec = TARGETS[targetEntityType];
  if (!spec) unpublishable();

  const parsed = DiffSchema.safeParse(input.diff);
  if (!parsed.success) unpublishable();

  const setClauses = [
    "provenance_kind = ?",
    "published_at = ?",
    "updated_at = ?"
  ];
  const binds: unknown[] = [input.provenanceKind, input.now, input.now];

  for (const [field, change] of Object.entries(parsed.data)) {
    const column = spec.fields[field];
    if (!column) unpublishable();
    setClauses.push(`${column} = ?`);
    binds.push(bindValue(column, change.to));
  }

  if (spec.stampApprover) {
    setClauses.push("approver = ?");
    binds.push(input.approver);
  }

  const existing = await db
    .prepare(`SELECT id FROM ${spec.table} WHERE id = ?`)
    .bind(targetEntityId)
    .first<{ id: string }>();
  if (!existing) unpublishable();

  binds.push(targetEntityId, input.draftId);

  return db
    .prepare(
      `UPDATE ${spec.table}
          SET ${setClauses.join(", ")}
        WHERE id = ?
          AND EXISTS (SELECT 1 FROM drafts WHERE id = ? AND outcome IS NULL)`
    )
    .bind(...binds);
}
