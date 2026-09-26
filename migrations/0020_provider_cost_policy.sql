-- Existing cost_cents are historical accounting estimates, never measured charges.
ALTER TABLE llm_calls ADD COLUMN cost_basis TEXT NOT NULL DEFAULT 'legacy_estimate';
ALTER TABLE llm_calls ADD COLUMN admission_bound_cents INTEGER;
ALTER TABLE llm_calls ADD COLUMN estimated_cost_cents INTEGER;
ALTER TABLE llm_calls ADD COLUMN reported_cost_cents INTEGER;
ALTER TABLE llm_calls ADD COLUMN reported_cost_usd TEXT;
ALTER TABLE llm_calls ADD COLUMN reported_cost_source TEXT;
ALTER TABLE llm_calls ADD COLUMN policy_json TEXT;
ALTER TABLE llm_calls ADD COLUMN accounting_issue TEXT;
UPDATE llm_calls SET estimated_cost_cents = cost_cents;
