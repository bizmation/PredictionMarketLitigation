-- One accounting authority: ledger + held operations + explicit legacy adjustment.
CREATE TABLE llm_legacy_adjustments (run_id TEXT PRIMARY KEY REFERENCES runs(id), amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0));
INSERT INTO llm_legacy_adjustments SELECT id, MAX(0, spend_cents - COALESCE((SELECT SUM(cost_cents) FROM llm_calls WHERE run_id = runs.id),0)) FROM runs;
CREATE TABLE llm_periods (
 id TEXT PRIMARY KEY, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
 cap_cents INTEGER NOT NULL CHECK(typeof(cap_cents) = 'integer' AND cap_cents >= 0 AND cap_cents <= 9007199254740991),
 provenance TEXT NOT NULL CHECK(length(provenance)>0), CHECK(starts_at < ends_at),
 CHECK(length(starts_at)=24 AND length(ends_at)=24 AND strftime('%Y-%m-%dT%H:%M:%fZ', starts_at) IS starts_at AND strftime('%Y-%m-%dT%H:%M:%fZ', ends_at) IS ends_at)
);
CREATE TRIGGER llm_periods_immutable_update BEFORE UPDATE ON llm_periods BEGIN SELECT RAISE(ABORT, 'periods are append-only'); END;
CREATE TRIGGER llm_periods_immutable_delete BEFORE DELETE ON llm_periods BEGIN SELECT RAISE(ABORT, 'periods are append-only'); END;
CREATE TABLE llm_operations (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), logical_key TEXT NOT NULL,
 fingerprint TEXT NOT NULL, role TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('reserved','dispatched','uncertain','settled','reconciled','released')),
 version INTEGER NOT NULL DEFAULT 1, owner TEXT NOT NULL,
 bound_cents INTEGER NOT NULL CHECK(bound_cents >= 0), liability_cents INTEGER NOT NULL CHECK(liability_cents >= 0),
 policy_json TEXT NOT NULL, created_at TEXT NOT NULL, dispatched_at TEXT,
 provider_request_id TEXT, issue TEXT, result_json TEXT, settlement_json TEXT, response_evidence_json TEXT,
 UNIQUE(run_id, logical_key)
);
-- Existing anomalous ledger entries receive a terminal non-replayable operation
-- so the same evidence-backed reconciliation route can resolve them.
INSERT INTO llm_operations (id,run_id,logical_key,fingerprint,role,state,owner,bound_cents,liability_cents,policy_json,created_at,issue,response_evidence_json)
 SELECT id,run_id,'legacy:'||id,'legacy-ledger:'||id,role,'settled','legacy',COALESCE(admission_bound_cents,cost_cents),0,
 COALESCE(policy_json,json_object('provider',provider,'model',model)),created_at,accounting_issue,
 json_object('id',id,'runId',run_id,'role',role,'provider',provider,'model',model,'tokens',json(tokens_json),'costCents',cost_cents,'currency',currency,'createdAt',created_at,'costBasis',cost_basis,'admissionBoundCents',admission_bound_cents,'estimatedCostCents',estimated_cost_cents,'reportedCostCents',reported_cost_cents,'reportedCostUsd',reported_cost_usd,'reportedCostSource',reported_cost_source,'policy',json(policy_json),'accountingIssue',accounting_issue)
 FROM llm_calls WHERE accounting_issue IS NOT NULL;
CREATE TABLE llm_operation_periods (operation_id TEXT NOT NULL REFERENCES llm_operations(id), period_id TEXT NOT NULL REFERENCES llm_periods(id), PRIMARY KEY(operation_id,period_id));
CREATE TABLE llm_reconciliations (
 request_id TEXT PRIMARY KEY, operation_id TEXT NOT NULL REFERENCES llm_operations(id),
 fingerprint TEXT NOT NULL, actor TEXT NOT NULL, evidence_reference TEXT NOT NULL, note TEXT NOT NULL,
 before_json TEXT NOT NULL, after_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE VIEW llm_run_accounting AS SELECT r.id AS run_id,
 COALESCE((SELECT SUM(cost_cents) FROM llm_calls WHERE run_id=r.id),0) +
 COALESCE((SELECT amount_cents FROM llm_legacy_adjustments WHERE run_id=r.id),0) +
 COALESCE((SELECT SUM(liability_cents) FROM llm_operations WHERE run_id=r.id AND state IN ('reserved','dispatched','uncertain')),0) AS total_cents,
 COALESCE((SELECT SUM(liability_cents) FROM llm_operations WHERE run_id=r.id AND state IN ('reserved','dispatched')),0) AS reserved_cents,
 (COALESCE((SELECT SUM(liability_cents) FROM llm_operations WHERE run_id=r.id AND state='uncertain'),0) + COALESCE((SELECT SUM(cost_cents) FROM llm_calls WHERE run_id=r.id AND accounting_issue IS NOT NULL),0)) AS uncertain_cents,
 COALESCE((SELECT amount_cents FROM llm_legacy_adjustments WHERE run_id=r.id),0) AS legacy_adjustment_cents,
 ((SELECT COUNT(*) FROM llm_operations WHERE run_id=r.id AND issue IS NOT NULL) + (SELECT COUNT(*) FROM llm_calls c WHERE c.run_id=r.id AND c.accounting_issue IS NOT NULL AND NOT EXISTS(SELECT 1 FROM llm_operations o WHERE o.id=c.id))) AS issue_count
 FROM runs r;
CREATE VIEW llm_period_accounting AS SELECT p.id AS period_id,
 COALESCE((SELECT SUM(c.cost_cents) FROM llm_calls c WHERE
 EXISTS(SELECT 1 FROM llm_operation_periods a WHERE a.operation_id=c.id AND a.period_id=p.id)
 OR (NOT EXISTS(SELECT 1 FROM llm_operations o WHERE o.id=c.id) AND c.created_at>=p.starts_at AND c.created_at<p.ends_at)
 OR (EXISTS(SELECT 1 FROM llm_operations o WHERE o.id=c.id AND o.created_at>=p.starts_at AND o.created_at<p.ends_at))),0) +
 COALESCE((SELECT SUM(o.liability_cents) FROM llm_operations o WHERE o.state IN ('reserved','dispatched','uncertain') AND
 (EXISTS(SELECT 1 FROM llm_operation_periods a WHERE a.operation_id=o.id AND a.period_id=p.id) OR (o.created_at>=p.starts_at AND o.created_at<p.ends_at))),0) AS total_cents
 FROM llm_periods p;
UPDATE runs SET spend_cents=(SELECT total_cents FROM llm_run_accounting WHERE run_id=runs.id);
CREATE TRIGGER llm_new_run_adjustment AFTER INSERT ON runs BEGIN INSERT INTO llm_legacy_adjustments VALUES (NEW.id,NEW.spend_cents); END;
CREATE TABLE steering_requests (
 request_id TEXT NOT NULL, run_id TEXT NOT NULL REFERENCES runs(id), actor TEXT NOT NULL,
 fingerprint TEXT NOT NULL, turn_id TEXT NOT NULL, result_json TEXT, created_at TEXT NOT NULL,
 PRIMARY KEY(run_id,request_id)
);
CREATE TRIGGER llm_attribution_immutable_update BEFORE UPDATE ON llm_operation_periods BEGIN SELECT RAISE(ABORT, 'attribution is immutable'); END;
CREATE TRIGGER llm_attribution_immutable_delete BEFORE DELETE ON llm_operation_periods BEGIN SELECT RAISE(ABORT, 'attribution is immutable'); END;
CREATE TRIGGER llm_receipt_immutable_update BEFORE UPDATE ON llm_reconciliations BEGIN SELECT RAISE(ABORT, 'receipts are append-only'); END;
CREATE TRIGGER llm_receipt_immutable_delete BEFORE DELETE ON llm_reconciliations BEGIN SELECT RAISE(ABORT, 'receipts are append-only'); END;
