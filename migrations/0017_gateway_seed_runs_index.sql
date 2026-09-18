-- Story 3.19 — Epic 3 hardening: seed the gateway role→model config and
-- index `runs(started_at)`.
--
-- ── WHY A SEED ──────────────────────────────────────────────────────────────
-- `gateway_config` (0007) has been empty on every environment since 3.2, so
-- `gateway.complete()` has failed closed (`role_not_configured` /
-- `gateway_not_configured`) on every real Run. The sprint change proposal of
-- 2026-09-17 (§4.1) pins the initial role→model map to Workers AI for all five
-- roles — `orchestrator`, `drafter`, `reviewer`, `yolo`, `steward` — with a
-- 500-cent default budget ceiling. OpenRouter via AI Gateway is story 3.20 and
-- changes this row through `roleModelsRepo.setRoleModel` (audited version
-- bump), not through another migration.
--
-- `ON CONFLICT(id) DO NOTHING` keeps the seed idempotent and never clobbers a
-- row an operator has already steered (`id` is the PRIMARY KEY, which is the
-- conflict target; the singleton CHECK only pins its one admitted value).
-- `version` starts at 1 so the first audited change reads as version 2.
-- `CREATE INDEX IF NOT EXISTS` keeps the whole file re-runnable: a
-- pre-existing index must not fail the batch and roll the seed back with it.
--
-- The provider string `workersai` is `createWorkersAiProvider().name`
-- (src/pipeline/ai/gateway.ts); the model id is a current Workers AI
-- text-generation model that accepts a `prompt` and returns `response` +
-- `usage.{prompt_tokens,completion_tokens}`, which is the shape that provider
-- reads. Workers AI is metered per token on the paid tier; the gateway still
-- records `cost_cents = 0` for this provider until 3.20 lands real pricing.
--
-- ── WHY AN INDEX ────────────────────────────────────────────────────────────
-- `runs` was rebuilt in 0009 with only `idx_runs_status`; every "latest Run"
-- and run-log read orders by `started_at DESC`. Same `idx_<table>_<cols>`
-- naming as 0001/0006.
--
-- No `evidence_events` rebuild: timeouts (3.19) map onto vocabulary that
-- already exists (`source.skipped` reason, `provider_error` → evals_not_run).
--
-- NOTE ON TRANSACTIONS: no explicit BEGIN/PRAGMA. Wrangler pre-splits this
-- file into single statements and runs them through one `db.batch()`.

INSERT INTO gateway_config (id, version, roles_json, default_budget_cents, updated_at)
VALUES (
  'current',
  1,
  '{"orchestrator":{"provider":"workersai","model":"@cf/meta/llama-3.3-70b-instruct-fp8-fast"},"drafter":{"provider":"workersai","model":"@cf/meta/llama-3.3-70b-instruct-fp8-fast"},"reviewer":{"provider":"workersai","model":"@cf/meta/llama-3.3-70b-instruct-fp8-fast"},"yolo":{"provider":"workersai","model":"@cf/meta/llama-3.3-70b-instruct-fp8-fast"},"steward":{"provider":"workersai","model":"@cf/meta/llama-3.3-70b-instruct-fp8-fast"}}',
  500,
  '2026-09-17T00:00:00.000Z'
)
ON CONFLICT(id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at);
