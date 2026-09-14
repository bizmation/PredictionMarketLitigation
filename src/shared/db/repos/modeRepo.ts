import {
  ApprovalModeSchema,
  DEFAULT_APPROVAL_MODE,
  ModeAuditSchema,
  type ApprovalMode,
  type ModeAudit
} from "../../schemas/mode";
import { RunModeSchema, type RunMode } from "../../schemas/vocabulary";
import type { Db } from "../client";

/**
 * Story 3.13 — `approval_mode` singleton + `mode_audit`. Snake_case rows in,
 * camelCase Zod-mapped objects out. `get()` fail-closes to HITL/70 when the
 * row is missing. `set()` bumps `version` and appends audit rows only when
 * mode or threshold actually changes. Audit actor is a public-safe
 * displayName — never email.
 */

type ModeRow = {
  mode: string;
  threshold: number;
  version: number;
  updated_at: string;
};

type AuditRow = {
  id: string;
  created_at: string;
  actor_display_name: string;
  kind: string;
  prior_json: string;
  next_json: string;
};

function mapAudit(row: AuditRow): ModeAudit | null {
  try {
    const parsed = ModeAuditSchema.safeParse({
      id: row.id,
      createdAt: row.created_at,
      actorDisplayName: row.actor_display_name,
      kind: row.kind,
      prior: JSON.parse(row.prior_json) as unknown,
      next: JSON.parse(row.next_json) as unknown
    });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function listAudit(db: Db): Promise<ModeAudit[]> {
  const { results } = await db
    .prepare(
      `SELECT id, created_at, actor_display_name, kind, prior_json, next_json
         FROM mode_audit
        ORDER BY created_at DESC, id DESC`
    )
    .all<AuditRow>();
  return (results ?? [])
    .map(mapAudit)
    .filter((row): row is ModeAudit => row != null);
}

export async function get(db: Db): Promise<ApprovalMode> {
  try {
    const row = await db
      .prepare(
        `SELECT mode, threshold, version, updated_at
           FROM approval_mode WHERE id = 'current'`
      )
      .first<ModeRow>();
    if (!row) return DEFAULT_APPROVAL_MODE;
    let audit: ModeAudit[] = [];
    try {
      audit = await listAudit(db);
    } catch {
      audit = [];
    }
    return ApprovalModeSchema.parse({
      mode: row.mode,
      threshold: row.threshold,
      version: row.version,
      updatedAt: row.updated_at,
      audit
    });
  } catch {
    return DEFAULT_APPROVAL_MODE;
  }
}

function auditStmt(
  db: Db,
  input: {
    id: string;
    createdAt: string;
    actor: string;
    kind: "mode" | "threshold";
    prior: unknown;
    next: unknown;
  }
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO mode_audit
         (id, created_at, actor_display_name, kind, prior_json, next_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      input.id,
      input.createdAt,
      input.actor,
      input.kind,
      JSON.stringify(input.prior),
      JSON.stringify(input.next)
    );
}

export async function set(
  db: Db,
  input: {
    mode?: RunMode;
    threshold?: number;
    actor: string;
    now: string;
  }
): Promise<ApprovalMode> {
  const current = await get(db);
  const nextMode = input.mode ?? current.mode;
  const nextThreshold = input.threshold ?? current.threshold;
  if (nextMode === current.mode && nextThreshold === current.threshold) {
    return current;
  }

  const actor = input.actor.trim();
  const statements: D1PreparedStatement[] = [];
  const existing = await db
    .prepare(`SELECT id FROM approval_mode WHERE id = 'current'`)
    .first<{ id: string }>();

  if (!existing) {
    statements.push(
      db
        .prepare(
          `INSERT INTO approval_mode (id, mode, threshold, version, updated_at)
           VALUES ('current', ?, ?, 1, ?)`
        )
        .bind(nextMode, nextThreshold, input.now)
    );
  } else {
    statements.push(
      db
        .prepare(
          `UPDATE approval_mode
              SET mode = ?, threshold = ?, version = version + 1, updated_at = ?
            WHERE id = 'current'`
        )
        .bind(nextMode, nextThreshold, input.now)
    );
  }

  if (nextMode !== current.mode) {
    RunModeSchema.parse(nextMode);
    statements.push(
      auditStmt(db, {
        id: crypto.randomUUID(),
        createdAt: input.now,
        actor,
        kind: "mode",
        prior: { mode: current.mode },
        next: { mode: nextMode }
      })
    );
  }
  if (nextThreshold !== current.threshold) {
    statements.push(
      auditStmt(db, {
        id: crypto.randomUUID(),
        createdAt: input.now,
        actor,
        kind: "threshold",
        prior: { threshold: current.threshold },
        next: { threshold: nextThreshold }
      })
    );
  }

  await db.batch(statements);
  return get(db);
}
