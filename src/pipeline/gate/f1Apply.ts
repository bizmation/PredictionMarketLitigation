import { z } from "zod";

import type { Db } from "../../shared/db/client";

/**
 * Story 3.11 — the only F1 writer. Parses a Draft `diff` as
 * `Record<field, {from, to}>`, maps allowlisted type + camelCase field onto
 * one UPDATE, and stamps provenance/timestamps (plus `cert_signals.approver`).
 * Identity and provenance columns are never taken from the diff. Imported
 * only from `approval.ts`.
 */

export class UnpublishableError extends Error {
  constructor() {
    super("unpublishable");
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

function unpublishable(): never {
  throw new UnpublishableError();
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
};

/**
 * Validate-then-statement: unknown type/field, null target, missing row, or
 * malformed diff throws `UnpublishableError` before any write.
 */
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
