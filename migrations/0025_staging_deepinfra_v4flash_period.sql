-- Renew the staging DeepInfra LLM budget.
--
-- Patrick ruled at 10:07 AM ET on 2026-10-11, verbatim:
-- "Accept Epic 3 with open items, mark 3.37 and Epic 3 done, apply the
-- recommended action-item changes, and renew the staging DeepInfra budget
-- at $1 for 7 days on V4-Flash."
--
-- One append-only llm_periods row. This does not update or delete
-- acceptance-3-36-deepinfra-20261004, which ends at
-- 2026-10-11T19:10:00.000Z. The new period starts at that instant
-- (inclusive) and ends at the DeepSeek-V4-Flash cost-policy validUntil
-- 2026-10-18T00:10:57.000Z in src/pipeline/ai/costPolicy.ts. That is
-- min(start + 7 days, validUntil). Start + 7 days would be
-- 2026-10-18T19:10:00.000Z, so this window is 18 hours 59 minutes 3 seconds
-- (about 19 hours) short of 7 days. After validUntil, runs fail with
-- cost_policy_invalid whatever the budget says, until a reviewed
-- V4-Flash cost-policy refresh.
--
-- The insert runs only when gateway_config id 'current' already names
-- deepseek-ai/DeepSeek-V4-Flash. Staging pml-build does. A production
-- catch-up is still the Workers AI seed after 0024, so this file no-ops
-- there. NOT EXISTS makes a replay of this statement a no-op. D1 records
-- the file once in d1_migrations.
-- https://developers.cloudflare.com/d1/reference/migrations/

INSERT INTO llm_periods (id, starts_at, ends_at, cap_cents, provenance)
SELECT
  'staging-deepinfra-v4flash-20261011',
  '2026-10-11T19:10:00.000Z',
  '2026-10-18T00:10:57.000Z',
  100,
  'Patrick 2026-10-11 10:07 AM ET: "Accept Epic 3 with open items, mark 3.37 and Epic 3 done, apply the recommended action-item changes, and renew the staging DeepInfra budget at $1 for 7 days on V4-Flash."'
WHERE EXISTS (
  SELECT 1 FROM gateway_config
  WHERE id = 'current'
    AND instr(roles_json, 'deepseek-ai/DeepSeek-V4-Flash') > 0
)
AND NOT EXISTS (
  SELECT 1 FROM llm_periods WHERE id = 'staging-deepinfra-v4flash-20261011'
);
