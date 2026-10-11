-- Switch a GLM gateway role map to DeepSeek-V4-Flash.
--
-- Patrick ruled at 8:05 PM ET on 2026-10-10 that every role uses
-- deepinfra / deepseek-ai/DeepSeek-V4-Flash. This is a new migration:
-- D1 applies files in migrations/ in order and records them in
-- d1_migrations. npm run deploy applies that directory to production
-- `pml`, which is still on 0017's Workers AI seed and has no DeepInfra
-- key. The WHERE clause matches only a row that already names
-- zai-org/GLM-5.3-Flash, so that production seed no-ops.
-- https://developers.cloudflare.com/d1/reference/migrations/
--
-- default_budget_cents is left as the operator set it. version increments
-- only when the row switches. updated_at becomes the later of the current
-- value and the catalog verification instant, and stays 24 characters.

UPDATE gateway_config
SET
  version = version + 1,
  roles_json = '{"orchestrator":{"provider":"deepinfra","model":"deepseek-ai/DeepSeek-V4-Flash"},"drafter":{"provider":"deepinfra","model":"deepseek-ai/DeepSeek-V4-Flash"},"reviewer":{"provider":"deepinfra","model":"deepseek-ai/DeepSeek-V4-Flash"},"yolo":{"provider":"deepinfra","model":"deepseek-ai/DeepSeek-V4-Flash"},"steward":{"provider":"deepinfra","model":"deepseek-ai/DeepSeek-V4-Flash"}}',
  updated_at = MAX(updated_at, '2026-10-11T00:10:57.000Z')
WHERE id = 'current' AND instr(roles_json, 'zai-org/GLM-5.3-Flash') > 0;
