import {
  RunLogItemSchema,
  RunSummarySchema,
  type RunLogItem,
  type RunMode,
  type RunOrigin,
  type RunStatus,
  type RunSummary
} from "../../schemas/run";
import type { Db } from "../client";

/**
 * Story 3.1 — `runs` repo. Snake_case rows in (via `?` binds only),
 * camelCase Zod-mapped domain objects out. `insertRun` exists for test
 * fixtures and the pipeline write path (3.3); the public API is read-only.
 * Story 3.2 added the two budget-stop mutations: `markStopped` (Run → stopped,
 * no-op unless the row is still `running`) and `bumpSpend` (spend accrual).
 * The gateway batches `markStoppedStmt` with the `run.stopped` evidence insert.
 */

type RunRow = {
  id: string;
  origin: string;
  mode: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  spend_cents: number;
  spend_currency: string;
  budget_cents: number | null;
  scheduled_for: string | null;
};

type RunLogRow = RunRow & {
  event_count: number;
  approval_outcome: string | null;
};

function runFields(row: RunRow) {
  return {
    id: row.id,
    origin: row.origin,
    mode: row.mode,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    spendCents: row.spend_cents,
    spendCurrency: row.spend_currency,
    budgetCents: row.budget_cents,
    scheduledFor: row.scheduled_for
  };
}

function mapRun(row: RunRow): RunSummary {
  return RunSummarySchema.parse(runFields(row));
}

function mapRunLog(row: RunLogRow): RunLogItem {
  return RunLogItemSchema.parse({
    ...runFields(row),
    eventCount: Number(row.event_count),
    approvalOutcome: row.approval_outcome ?? null
  });
}

const RUN_COLUMNS = `id, origin, mode, status, started_at, completed_at,
                      spend_cents, spend_currency, budget_cents, scheduled_for`;

export async function insertRun(
  db: Db,
  input: {
    id: string;
    origin: RunOrigin;
    mode: RunMode;
    status: RunStatus;
    startedAt: string;
    completedAt: string | null;
    spendCents: number;
    spendCurrency: string;
    budgetCents: number | null;
    scheduledFor: string | null;
  }
): Promise<RunSummary> {
  // Validate BEFORE the INSERT: a row the CHECKs accept but the schema
  // rejects would sit in D1 as poison and 500 every later read of it. The
  // CHECKs and Zod agree on shape (run-id calendar date, uppercase currency,
  // integer cents); parse first so a failed contract never hits SQL.
  const run = RunSummarySchema.parse(input);
  await db
    .prepare(
      `INSERT INTO runs (${RUN_COLUMNS})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      run.id,
      run.origin,
      run.mode,
      run.status,
      run.startedAt,
      run.completedAt,
      run.spendCents,
      run.spendCurrency,
      run.budgetCents,
      run.scheduledFor
    )
    .run();
  return run;
}

/**
 * Public run log order: newest-first by `started_at`. `id DESC` is only a
 * deterministic tie-break for same-instant starts (run ids are date-prefixed
 * with a random suffix, so it carries no recency meaning of its own).
 *
 * Story 3.7 — one query, no N+1: Evidence `COUNT(*)` plus one Draft
 * `outcome` if any (else null).
 */
export async function listRuns(db: Db): Promise<RunLogItem[]> {
  const { results } = await db
    .prepare(
      `SELECT ${RUN_COLUMNS},
              (SELECT COUNT(*) FROM evidence_events e
                WHERE e.run_id = runs.id) AS event_count,
              (SELECT d.outcome FROM drafts d
                WHERE d.run_id = runs.id AND d.outcome IS NOT NULL
                ORDER BY d.created_at DESC, d.id DESC
                LIMIT 1) AS approval_outcome
         FROM runs
        ORDER BY started_at DESC, id DESC`
    )
    .all<RunLogRow>();
  return (results ?? []).map(mapRunLog);
}

export async function getRunById(
  db: Db,
  id: string
): Promise<RunSummary | null> {
  const row = await db
    .prepare(`SELECT ${RUN_COLUMNS} FROM runs WHERE id = ?`)
    .bind(id)
    .first<RunRow>();
  return row ? mapRun(row) : null;
}

/**
 * Story 3.2 — budget-stop side effect. Marks the Run `stopped` (the D1 value;
 * "budget-stopped" is a UI label only) and stamps a completion time. The
 * timestamp is supplied by the caller so this stays a pure `?`-bind UPDATE.
 * A second call on an already-terminal Run matches zero rows.
 */
export function markStoppedStmt(
  db: Db,
  runId: string,
  completedAt: string
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE runs SET status = 'stopped', completed_at = ?
        WHERE id = ? AND status = 'running'`
    )
    .bind(completedAt, runId);
}

export async function markStopped(
  db: Db,
  runId: string,
  completedAt: string
): Promise<void> {
  await markStoppedStmt(db, runId, completedAt).run();
}

/**
 * Story 3.2 — spend accrual. Adds recorded cents to the Run's `spend_cents`
 * (money is integer cents; the D1 CHECK guards non-negative integers).
 */
export async function bumpSpend(
  db: Db,
  runId: string,
  cents: number
): Promise<void> {
  await db
    .prepare(`UPDATE runs SET spend_cents = spend_cents + ? WHERE id = ?`)
    .bind(cents, runId)
    .run();
}

/**
 * Story 3.3 — find an existing scheduled Run for a calendar date (same-Run-ID
 * resume). The run id is deterministic `run-YYYYMMDD-xxxx` from the date, but
 * the 4-hex suffix makes a straight suffix-less lookup ambiguous across
 * same-day runs of differing origin — so resume keys on `(scheduled_for,
 * origin)` instead, which is exactly what the workflow knows.
 */
export async function findRunForDate(
  db: Db,
  scheduledFor: string,
  origin: RunOrigin
): Promise<RunSummary | null> {
  const row = await db
    .prepare(
      `SELECT ${RUN_COLUMNS} FROM runs
        WHERE scheduled_for = ? AND origin = ?
        ORDER BY started_at DESC LIMIT 1`
    )
    .bind(scheduledFor, origin)
    .first<RunRow>();
  return row ? mapRun(row) : null;
}

/**
 * Story 3.3 — complete a Run to a terminal status (empty/failed/published),
 * stamping `completed_at`. Idempotent by design: only a `running` Run moves.
 */
export async function completeRun(
  db: Db,
  runId: string,
  status: RunStatus,
  completedAt: string
): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE runs SET status = ?, completed_at = ?
        WHERE id = ? AND status = 'running'`
    )
    .bind(status, completedAt, runId)
    .run();
  return res.meta.changes > 0;
}
