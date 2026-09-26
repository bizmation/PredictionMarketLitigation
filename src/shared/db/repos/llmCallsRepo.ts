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
  input: Omit<import("zod").input<typeof LlmCallRecordSchema>, "role"> & {
    role: string;
  }
): Promise<LlmCallRecord> {
  const record = LlmCallRecordSchema.parse(input);
  await db
    .prepare(
      `INSERT INTO llm_calls
         (id, run_id, role, provider, model, tokens_json, cost_cents, currency, created_at, cost_basis, admission_bound_cents, estimated_cost_cents, reported_cost_cents, reported_cost_source, policy_json, accounting_issue, reported_cost_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      record.createdAt,
      record.costBasis,
      record.admissionBoundCents,
      record.estimatedCostCents,
      record.reportedCostCents,
      record.reportedCostSource,
      record.policy == null ? null : JSON.stringify(record.policy),
      record.accountingIssue,
      record.reportedCostUsd ?? null
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
  cost_basis: string;
  admission_bound_cents: number | null;
  estimated_cost_cents: number | null;
  reported_cost_cents: number | null;
  reported_cost_source: string | null;
  reported_cost_usd: string | null;
  policy_json: string | null;
  accounting_issue: string | null;
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
    costBasis: row.cost_basis,
    admissionBoundCents: row.admission_bound_cents,
    estimatedCostCents:
      row.estimated_cost_cents ??
      (row.cost_basis === "legacy_estimate" ? row.cost_cents : null),
    reportedCostUsd: row.reported_cost_usd,
    reportedCostCents: row.reported_cost_cents,
    reportedCostSource: row.reported_cost_source,
    policy: row.policy_json == null ? null : JSON.parse(row.policy_json),
    accountingIssue: row.accounting_issue,
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
      `SELECT *
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

export async function hasAccountingIssue(
  db: Db,
  runId: string
): Promise<boolean> {
  return (
    (await db
      .prepare(
        "SELECT 1 AS found FROM llm_calls WHERE run_id = ? AND accounting_issue IS NOT NULL LIMIT 1"
      )
      .bind(runId)
      .first()) != null
  );
}
