import {
  RunSummarySchema,
  type RunMode,
  type RunOrigin,
  type RunStatus,
  type RunSummary
} from "../../schemas/run";
import type { Db } from "../client";

/**
 * Story 3.1 — `runs` repo. Snake_case rows in (via `?` binds only),
 * camelCase Zod-mapped domain objects out. `insertRun` exists for test
 * fixtures and the future pipeline write path (3.3); the public API is
 * read-only — no repo function mutates a Run once inserted.
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

function mapRun(row: RunRow): RunSummary {
  return RunSummarySchema.parse({
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
  // CHECKs are stricter in shape, but only Zod owns the full wire contract
  // (e.g. it also rejects a currency like 'usd').
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
 */
export async function listRuns(db: Db): Promise<RunSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT ${RUN_COLUMNS} FROM runs ORDER BY started_at DESC, id DESC`
    )
    .all<RunRow>();
  return (results ?? []).map(mapRun);
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
