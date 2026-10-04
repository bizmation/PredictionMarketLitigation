import { fenceSql } from "./runAdmissionRepo";
import type { Db } from "../client";
import { assertStmt } from "./gateAssertions";
import { recordCallStmt } from "./llmCallsRepo";
import type { LlmCallRecord, ReconciliationInput } from "../../schemas/gateway";

export type Operation = {
  id: string;
  run_id: string;
  logical_key: string;
  fingerprint: string;
  role: string;
  state:
    | "reserved"
    | "dispatched"
    | "uncertain"
    | "settled"
    | "reconciled"
    | "released";
  version: number;
  owner: string;
  bound_cents: number;
  liability_cents: number;
  policy_json: string;
  created_at: string;
  dispatched_at: string | null;
  provider_request_id: string | null;
  issue: string | null;
  result_json: string | null;
  settlement_json: string | null;
  response_evidence_json: string | null;
};
export class AccountingConflict extends Error {}
export class AccountingRefused extends Error {}
export async function fingerprint(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value))
  );
  return Array.from(new Uint8Array(bytes), (x) =>
    x.toString(16).padStart(2, "0")
  ).join("");
}
export async function getOperation(
  db: Db,
  runId: string,
  key: string
): Promise<Operation | null> {
  return db
    .prepare("SELECT * FROM llm_operations WHERE run_id=? AND logical_key=?")
    .bind(runId, key)
    .first<Operation>();
}
export async function getOperationById(
  db: Db,
  id: string
): Promise<Operation | null> {
  return db
    .prepare("SELECT * FROM llm_operations WHERE id=?")
    .bind(id)
    .first<Operation>();
}
function syncRun(db: Db, runId: string) {
  return db
    .prepare(
      "UPDATE runs SET spend_cents=(SELECT total_cents FROM llm_run_accounting WHERE run_id=?) WHERE id=?"
    )
    .bind(runId, runId);
}
export async function reserve(
  db: Db,
  input: {
    id: string;
    runId: string;
    role: string;
    key: string;
    fingerprint: string;
    owner: string;
    bound: number;
    budget: number;
    policy: unknown;
    now: string;
    awaiting: boolean;
  }
): Promise<Operation> {
  const existing = await getOperation(db, input.runId, input.key);
  if (existing) {
    if (existing.fingerprint !== input.fingerprint)
      throw new AccountingConflict("Logical call payload changed.");
    return existing;
  }
  try {
    await db.batch([
      assertStmt(
        db,
        "llm_run_admission",
        `EXISTS(SELECT 1 FROM runs r JOIN llm_run_accounting a ON a.run_id=r.id WHERE r.id=? AND ${fenceSql("r")} AND (r.status='running' OR (?=1 AND r.status='awaiting')) AND a.total_cents + ? <= MIN(?,COALESCE(r.budget_cents,(SELECT default_budget_cents FROM gateway_config WHERE id='current'),-1)) AND a.issue_count=0)`,
        [input.runId, Number(input.awaiting), input.bound, input.budget]
      ),
      assertStmt(
        db,
        "llm_period_admission",
        `NOT EXISTS(SELECT 1 FROM llm_periods p JOIN llm_period_accounting a ON a.period_id=p.id WHERE p.starts_at<=? AND p.ends_at>? AND (a.total_cents+?>p.cap_cents OR EXISTS(SELECT 1 FROM llm_operations o WHERE o.issue IS NOT NULL AND (EXISTS(SELECT 1 FROM llm_operation_periods op WHERE op.operation_id=o.id AND op.period_id=p.id) OR (o.created_at>=p.starts_at AND o.created_at<p.ends_at))) OR EXISTS(SELECT 1 FROM llm_calls c WHERE c.accounting_issue IS NOT NULL AND c.created_at>=p.starts_at AND c.created_at<p.ends_at AND NOT EXISTS(SELECT 1 FROM llm_operations o WHERE o.id=c.id))))`,
        [input.now, input.now, input.bound]
      ),
      db
        .prepare(
          `INSERT INTO llm_operations (id,run_id,logical_key,fingerprint,role,state,owner,bound_cents,liability_cents,policy_json,created_at) VALUES (?,?,?,?,?,'reserved',?,?,?,?,?)`
        )
        .bind(
          input.id,
          input.runId,
          input.key,
          input.fingerprint,
          input.role,
          input.owner,
          input.bound,
          input.bound,
          JSON.stringify(input.policy),
          input.now
        ),
      db
        .prepare(
          "INSERT INTO llm_operation_periods SELECT ?,id FROM llm_periods WHERE starts_at<=? AND ends_at>?"
        )
        .bind(input.id, input.now, input.now),
      syncRun(db, input.runId)
    ]);
  } catch (error) {
    const raced = await getOperation(db, input.runId, input.key);
    if (raced && raced.owner !== input.owner) {
      if (raced.fingerprint !== input.fingerprint)
        throw new AccountingConflict("Logical call payload changed.");
      return raced;
    }
    if (String(error).includes("CHECK constraint"))
      throw new AccountingRefused(
        "Run or shared period budget refuses this reservation."
      );
    throw error;
  }
  return (await getOperationById(db, input.id))!;
}
// The caller must have received its own successful reservation response. An ambiguous
// reservation or dispatch response never grants a second owner permission to dispatch.
export async function claimDispatch(
  db: Db,
  op: Operation,
  owner: string,
  now: string
): Promise<void> {
  await db.batch([
    assertStmt(
      db,
      "llm_dispatch_owner",
      "EXISTS(SELECT 1 FROM llm_operations WHERE id=? AND state='reserved' AND owner=? AND version=?)",
      [op.id, owner, op.version]
    ),
    // The existing reservation is already included in these totals. Recheck
    // numeric ceilings without adding its bound again: reconciliation or new
    // period provisioning may have exhausted capacity since reservation.
    assertStmt(
      db,
      "llm_dispatch_run_ceiling",
      `EXISTS(SELECT 1 FROM runs r JOIN llm_run_accounting a ON a.run_id=r.id
        WHERE r.id=? AND ${fenceSql("r")} AND a.total_cents<=COALESCE(r.budget_cents,
        (SELECT default_budget_cents FROM gateway_config WHERE id='current'),-1))`,
      [op.run_id]
    ),
    assertStmt(
      db,
      "llm_dispatch_period_ceilings",
      `NOT EXISTS(SELECT 1 FROM llm_periods p JOIN llm_period_accounting a ON a.period_id=p.id
        WHERE (EXISTS(SELECT 1 FROM llm_operation_periods attributed
          WHERE attributed.operation_id=? AND attributed.period_id=p.id)
          OR (? >= p.starts_at AND ? < p.ends_at)) AND a.total_cents>p.cap_cents)`,
      [op.id, op.created_at, op.created_at]
    ),
    assertStmt(
      db,
      "llm_dispatch_run_issues",
      "NOT EXISTS(SELECT 1 FROM llm_run_accounting WHERE run_id=? AND issue_count>0)",
      [op.run_id]
    ),
    assertStmt(
      db,
      "llm_dispatch_period_issues",
      `NOT EXISTS(SELECT 1 FROM llm_periods p WHERE (EXISTS(SELECT 1 FROM llm_operation_periods a WHERE a.operation_id=? AND a.period_id=p.id) OR (? >= p.starts_at AND ? < p.ends_at)) AND (
      EXISTS(SELECT 1 FROM llm_operations other WHERE other.issue IS NOT NULL AND (EXISTS(SELECT 1 FROM llm_operation_periods a WHERE a.operation_id=other.id AND a.period_id=p.id) OR (other.created_at>=p.starts_at AND other.created_at<p.ends_at))) OR
      EXISTS(SELECT 1 FROM llm_calls c WHERE c.accounting_issue IS NOT NULL AND c.created_at>=p.starts_at AND c.created_at<p.ends_at AND NOT EXISTS(SELECT 1 FROM llm_operations other WHERE other.id=c.id))))`,
      [op.id, op.created_at, op.created_at]
    ),
    db
      .prepare(
        "UPDATE llm_operations SET state='dispatched',version=version+1,dispatched_at=? WHERE id=?"
      )
      .bind(now, op.id)
  ]);
}
export async function markUncertain(
  db: Db,
  id: string,
  owner: string,
  issue: string
): Promise<void> {
  await db
    .prepare(
      "UPDATE llm_operations SET state='uncertain',issue=?,version=version+1 WHERE id=? AND owner=? AND state='dispatched'"
    )
    .bind(issue, id, owner)
    .run();
}
/** Best-effort caller recovery still cannot persist when D1 itself is unavailable. */
export async function retainResponseEvidence(
  db: Db,
  op: Operation,
  evidence: unknown,
  observedCents: number,
  providerRequestId: string | null,
  issue: string
): Promise<void> {
  await db.batch([
    db
      .prepare(`UPDATE llm_operations SET state='uncertain',version=version+1,
      liability_cents=MAX(liability_cents,bound_cents,?),provider_request_id=COALESCE(?,provider_request_id),
      response_evidence_json=?,issue=? WHERE id=? AND owner=? AND state IN ('dispatched','uncertain')`)
      .bind(
        observedCents,
        providerRequestId,
        JSON.stringify(evidence),
        issue,
        op.id,
        op.owner
      ),
    syncRun(db, op.run_id)
  ]);
}
/** Only a locally proven refusal before the adapter's paid invocation may release. */
export async function releaseBeforePaidInvocation(
  db: Db,
  op: Operation
): Promise<void> {
  await db.batch([
    db
      .prepare(
        "UPDATE llm_operations SET state='released',version=version+1,liability_cents=0,issue=NULL,response_evidence_json=? WHERE id=? AND owner=? AND state='dispatched' AND version=?"
      )
      .bind(
        JSON.stringify({
          reason: "local_policy_refusal_before_paid_invocation"
        }),
        op.id,
        op.owner,
        op.version + 1
      ),
    syncRun(db, op.run_id)
  ]);
}
export async function settle(
  db: Db,
  op: Operation,
  call: LlmCallRecord,
  result: unknown,
  providerRequestId: string | null
): Promise<void> {
  const settlement = JSON.stringify({ call, result, providerRequestId });
  const current = await getOperationById(db, op.id);
  if (current?.state === "settled" && current.settlement_json === settlement)
    return;
  if (current?.state !== "dispatched" || current.owner !== op.owner)
    throw new AccountingConflict(
      "Operation is no longer owned by this attempt."
    );
  try {
    await db.batch([
      assertStmt(
        db,
        "llm_settlement_owner",
        "EXISTS(SELECT 1 FROM llm_operations WHERE id=? AND state='dispatched' AND owner=? AND version=?)",
        [op.id, op.owner, current.version]
      ),
      recordCallStmt(db, call),
      db
        .prepare(
          "UPDATE llm_operations SET state='settled',version=version+1,liability_cents=0,result_json=?,settlement_json=?,provider_request_id=?,issue=? WHERE id=?"
        )
        .bind(
          call.accountingIssue ? null : JSON.stringify(result),
          settlement,
          providerRequestId,
          call.accountingIssue,
          op.id
        ),
      syncRun(db, op.run_id)
    ]);
  } catch (error) {
    let durable: Operation | null = null;
    try {
      durable = await getOperationById(db, op.id);
    } catch {
      /* Still attempt guarded evidence retention below. */
    }
    if (durable?.state === "settled" && durable.settlement_json === settlement)
      return;
    try {
      await retainResponseEvidence(
        db,
        op,
        { call, result },
        Math.max(op.bound_cents, call.costCents),
        providerRequestId,
        call.accountingIssue
          ? `settlement_failed; ${call.accountingIssue}`
          : "settlement_failed"
      );
    } catch {
      /* An unavailable database cannot guarantee a recovery evidence write. */
    }
    throw error;
  }
}
export async function accountingForRun(db: Db, runId: string) {
  return db
    .prepare(
      "SELECT total_cents AS totalCents,reserved_cents AS reservedCents,uncertain_cents AS uncertainCents,legacy_adjustment_cents AS legacyAdjustmentCents,issue_count AS issueCount FROM llm_run_accounting WHERE run_id=?"
    )
    .bind(runId)
    .first<{
      totalCents: number;
      reservedCents: number;
      uncertainCents: number;
      legacyAdjustmentCents: number;
      issueCount: number;
    }>();
}
function operatorUsdCents(value: string): number {
  const [whole, fraction = ""] = value.split(".");
  const scale = 10n ** BigInt(fraction.length);
  const amount = (BigInt(whole!) * scale + BigInt(fraction || "0")) * 100n;
  const rounded = (amount + scale - 1n) / scale;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER))
    throw new AccountingConflict("Amount exceeds representable cents.");
  return Number(rounded);
}
export async function reconcile(
  db: Db,
  id: string,
  input: ReconciliationInput,
  actor: string,
  now: string
) {
  if (!actor.trim())
    throw new AccountingConflict("An authenticated operator is required.");
  const hash = await fingerprint({ id, input, actor });
  const previous = await db
    .prepare(
      "SELECT fingerprint,after_json FROM llm_reconciliations WHERE request_id=?"
    )
    .bind(input.requestId)
    .first<{ fingerprint: string; after_json: string }>();
  if (previous) {
    if (previous.fingerprint !== hash)
      throw new AccountingConflict("Reconciliation request ID conflicts.");
    return JSON.parse(previous.after_json);
  }
  const op = await getOperationById(db, id);
  if (!op || op.version !== input.expectedVersion || op.state === "reconciled")
    throw new AccountingConflict("Missing, terminal, or stale operation.");
  const amount =
    input.decision === "confirmed_charge"
      ? operatorUsdCents(input.originalUsd!)
      : 0;
  if (amount == null)
    throw new AccountingConflict("Invalid original USD amount.");
  const after = {
    id,
    state: "reconciled",
    version: op.version + 1,
    costCents: amount,
    decision: input.decision
  };
  const policy = JSON.parse(op.policy_json) as {
    provider: string;
    model: string;
  };
  try {
    await db.batch([
      assertStmt(
        db,
        "llm_reconcile_version",
        "EXISTS(SELECT 1 FROM llm_operations WHERE id=? AND version=?)",
        [id, input.expectedVersion]
      ),
      db
        .prepare(`INSERT INTO llm_reconciliations (request_id,operation_id,fingerprint,actor,evidence_reference,note,before_json,after_json,created_at)
      SELECT ?,?,?,?,?,?,json_object(
       'state',o.state,'version',o.version,'liabilityCents',o.liability_cents,'ledgerCostCents',COALESCE(c.cost_cents,0),'totalCents',a.total_cents,
       'ledger',CASE WHEN c.id IS NULL THEN NULL ELSE json_object('id',c.id,'runId',c.run_id,'role',c.role,'provider',c.provider,'model',c.model,'tokens',json(c.tokens_json),'costCents',c.cost_cents,'currency',c.currency,'createdAt',c.created_at,'costBasis',c.cost_basis,'admissionBoundCents',c.admission_bound_cents,'estimatedCostCents',c.estimated_cost_cents,'reportedCostCents',c.reported_cost_cents,'reportedCostUsd',c.reported_cost_usd,'reportedCostSource',c.reported_cost_source,'policy',json(c.policy_json),'accountingIssue',c.accounting_issue) END,
       'periods',(SELECT json_group_array(json_object('periodId',p.id,'totalCents',pa.total_cents,'capCents',p.cap_cents)) FROM llm_periods p JOIN llm_period_accounting pa ON pa.period_id=p.id WHERE EXISTS(SELECT 1 FROM llm_operation_periods ap WHERE ap.operation_id=o.id AND ap.period_id=p.id) OR (o.created_at>=p.starts_at AND o.created_at<p.ends_at))),
      json_set(json(?),'$.totalCents',a.total_cents-o.liability_cents-COALESCE(c.cost_cents,0)+?,'$.periods',
       (SELECT json_group_array(json_object('periodId',p.id,'totalCents',pa.total_cents-o.liability_cents-COALESCE(c.cost_cents,0)+?,'capCents',p.cap_cents)) FROM llm_periods p JOIN llm_period_accounting pa ON pa.period_id=p.id WHERE EXISTS(SELECT 1 FROM llm_operation_periods ap WHERE ap.operation_id=o.id AND ap.period_id=p.id) OR (o.created_at>=p.starts_at AND o.created_at<p.ends_at))),?
      FROM llm_operations o JOIN llm_run_accounting a ON a.run_id=o.run_id LEFT JOIN llm_calls c ON c.id=o.id WHERE o.id=?`)
        .bind(
          input.requestId,
          id,
          hash,
          actor,
          input.evidenceReference,
          input.note,
          JSON.stringify(after),
          amount,
          amount,
          now,
          id
        ),
      db
        .prepare(
          `INSERT INTO llm_calls (id,run_id,role,provider,model,tokens_json,cost_cents,currency,created_at,cost_basis,admission_bound_cents,reported_cost_cents,reported_cost_usd,reported_cost_source,policy_json) VALUES (?,?,?,?,?,NULL,?,'USD',?,'provider_reported',?,?,?,'operator_attestation',?) ON CONFLICT(id) DO UPDATE SET cost_cents=excluded.cost_cents,reported_cost_cents=excluded.reported_cost_cents,reported_cost_usd=excluded.reported_cost_usd,reported_cost_source='operator_attestation',cost_basis='provider_reported',accounting_issue=NULL`
        )
        .bind(
          id,
          op.run_id,
          op.role,
          policy.provider,
          policy.model,
          amount,
          op.created_at,
          op.bound_cents,
          amount,
          input.decision === "confirmed_charge" ? input.originalUsd : "0",
          op.policy_json
        ),
      db
        .prepare(
          "UPDATE llm_operations SET state='reconciled',version=version+1,liability_cents=0,issue=NULL WHERE id=?"
        )
        .bind(id),
      syncRun(db, op.run_id)
    ]);
  } catch (error) {
    const raced = await db
      .prepare(
        "SELECT fingerprint,after_json FROM llm_reconciliations WHERE request_id=?"
      )
      .bind(input.requestId)
      .first<{ fingerprint: string; after_json: string }>();
    if (raced?.fingerprint === hash) return JSON.parse(raced.after_json);
    throw error;
  }
  const receipt = await db
    .prepare("SELECT after_json FROM llm_reconciliations WHERE request_id=?")
    .bind(input.requestId)
    .first<{ after_json: string }>();
  return JSON.parse(receipt!.after_json);
}
