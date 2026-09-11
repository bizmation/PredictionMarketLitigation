import type { Db } from "../client";
import { LlmCallRecordSchema, type LlmCallRecord } from "../../schemas/gateway";

/**
 * Story 3.2 — `llm_calls` repo. Spend accounting for the gateway: every
 * completed call records one row (role/provider/model/tokens/spend for
 * Evidence), and `totalSpendForRun` is the budget-enforcement read. Snake_case
 * rows in, camelCase Zod-mapped objects out.
 */

export async function recordCall(
  db: Db,
  input: {
    id: string;
    runId: string;
    role: string;
    provider: string;
    model: string;
    tokens: { input: number; output: number } | null;
    costCents: number;
    currency: string;
    createdAt: string;
  }
): Promise<LlmCallRecord> {
  const record = LlmCallRecordSchema.parse(input);
  await db
    .prepare(
      `INSERT INTO llm_calls
         (id, run_id, role, provider, model, tokens_json, cost_cents, currency, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      record.id,
      record.runId,
      record.role,
      record.provider,
      record.model,
      record.tokens == null ? null : JSON.stringify(record.tokens),
      record.costCents,
      record.currency,
      record.createdAt
    )
    .run();
  return record;
}

type LlmCallRow = {
  id: string;
  run_id: string;
  role: string;
  provider: string;
  model: string;
  tokens_json: string | null;
  cost_cents: number;
  currency: string;
  created_at: string;
};

function mapLlmCall(row: LlmCallRow): LlmCallRecord {
  return LlmCallRecordSchema.parse({
    id: row.id,
    runId: row.run_id,
    role: row.role,
    provider: row.provider,
    model: row.model,
    tokens: row.tokens_json == null ? null : JSON.parse(row.tokens_json),
    costCents: row.cost_cents,
    currency: row.currency,
    createdAt: row.created_at
  });
}

/**
 * Calls for one Run, oldest first — the Evidence detail's model/token list.
 */
export async function listByRun(
  db: Db,
  runId: string
): Promise<LlmCallRecord[]> {
  const { results } = await db
    .prepare(
      `SELECT id, run_id, role, provider, model, tokens_json, cost_cents, currency, created_at
         FROM llm_calls WHERE run_id = ?
        ORDER BY created_at ASC, id ASC`
    )
    .bind(runId)
    .all<LlmCallRow>();
  return (results ?? []).map(mapLlmCall);
}

/**
 * Sum of recorded spend for a run, in cents. The gateway reads this against the
 * run's ceiling before every call.
 */
export async function totalSpendForRun(db: Db, runId: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(cost_cents), 0) AS total FROM llm_calls WHERE run_id = ?`
    )
    .bind(runId)
    .first<{ total: number }>();
  return row?.total ?? 0;
}
