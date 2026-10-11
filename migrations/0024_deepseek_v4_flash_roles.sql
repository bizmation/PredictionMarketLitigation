-- Switch every gateway role to DeepSeek-V4-Flash.
--
-- Patrick ruled at 8:05 PM ET on 2026-10-10 that every role uses
-- deepinfra / deepseek-ai/DeepSeek-V4-Flash. This is a new migration:
-- D1 applies files in migrations/ in order and records them in
-- d1_migrations, so 0017's Workers AI seed stays untouched.
-- https://developers.cloudflare.com/d1/reference/migrations/
--
-- default_budget_cents is left as the operator set it. version increments
-- so the change is visible on the singleton row. updated_at is the catalog
-- verification instant and matches the 24-character timestamp CHECK.

UPDATE gateway_config
SET
  version = version + 1,
  roles_json = '{"orchestrator":{"provider":"deepinfra","model":"deepseek-ai/DeepSeek-V4-Flash"},"drafter":{"provider":"deepinfra","model":"deepseek-ai/DeepSeek-V4-Flash"},"reviewer":{"provider":"deepinfra","model":"deepseek-ai/DeepSeek-V4-Flash"},"yolo":{"provider":"deepinfra","model":"deepseek-ai/DeepSeek-V4-Flash"},"steward":{"provider":"deepinfra","model":"deepseek-ai/DeepSeek-V4-Flash"}}',
  updated_at = '2026-10-11T00:10:57.000Z'
WHERE id = 'current';
