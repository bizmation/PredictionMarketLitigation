---
title: 'Renew the staging DeepInfra LLM budget period'
type: 'feature'
created: '2026-10-11'
status: 'in-review'
route: 'dispatch'
baseline_commit: 'f531e4e9a59ff828292dc8c6d29b62724d411a57'
review_loop_iteration: 0
context:
  - '{project-root}/docs/llm-accounting.md'
  - '{project-root}/src/pipeline/ai/costPolicy.ts'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Staging period `acceptance-3-36-deepinfra-20261004` ends at `2026-10-11T19:10:00.000Z`. After that, `pml-build` has no reviewed DeepInfra budget. Patrick ruled at 10:07 AM ET on 2026-10-11, verbatim: "Accept Epic 3 with open items, mark 3.37 and Epic 3 done, apply the recommended action-item changes, and renew the staging DeepInfra budget at $1 for 7 days on V4-Flash."

**Approach:** One append-only migration inserts `staging-deepinfra-v4flash-20261011` at 100 cents for `deepseek-ai/DeepSeek-V4-Flash`. Start `2026-10-11T19:10:00.000Z` (old end, not earlier). End `2026-10-18T00:10:57.000Z`, `min(start + 7 days, validUntil)` in `COST_POLICIES` (`src/pipeline/ai/costPolicy.ts`). That is 18h 59m 3s (about 19 hours) short of 7 days. After `validUntil`, runs fail with `cost_policy_invalid` until a reviewed V4-Flash refresh.

## Boundaries & Constraints

**Always:** Insert only. Leave the old period unchanged. Bounds are 24-character UTC (`YYYY-MM-DDTHH:mm:ss.sssZ`); start inclusive, end exclusive, so `19:10:00.000Z` belongs only to the new row. Insert only when `gateway_config.id = 'current'` already names `deepseek-ai/DeepSeek-V4-Flash` (staging does; a production catch-up stays on the Workers AI seed and this insert no-ops). Replay is a no-op (`NOT EXISTS` on the new id). Ruling quote and 10:07 AM ET timestamp go in the migration comment and here. Log the refresh in `deferred-work.md` before 2026-10-17.

**Never:** Hand-edit remote D1. Do not update, close, or delete the old period. Do not change `reserve()`, sprint-status, the Epic 3 retro, or any 4.x story. Do not refresh the cost policy here. Do not migrate production `pml`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Before handoff | Both periods. `reserve` at `2026-10-11T19:09:59.000Z` | Only `acceptance-3-36-deepinfra-20261004` | N/A |
| At handoff | Both periods. `reserve` at `2026-10-11T19:10:00.000Z` | Only `staging-deepinfra-v4flash-20261011` | N/A |
| Replay | V4-Flash gateway. Run the `0025` statements twice | One new row, `cap_cents = 100`, same bounds. Old row unchanged | N/A |
| Workers AI seed | `0017` seed. Apply `0025` | No new period | N/A |

</frozen-after-approval>

## Code Map

- `src/pipeline/ai/costPolicy.ts` -- V4-Flash `validUntil` `2026-10-18T00:10:57.000Z` (lines 80–94). Do not edit.
- `migrations/0021_atomic_llm_accounting.sql` -- `llm_periods` checks 24-character timestamps, `cap_cents`, and `provenance`. Update/delete abort. Accounting is a view.
- `migrations/0024_deepseek_v4_flash_roles.sql` -- no-ops on the Workers AI seed. Staging already applied it; roles name V4-Flash.
- `src/shared/db/repos/llmAccountingRepo.ts` -- `reserve` attributes `starts_at <= now < ends_at` (period insert near line 124). Reuse it.
- `src/shared/db/repos/llmAccountingUpgrade.test.ts` -- `UPGRADE_DB` and `applyD1Migrations`. That helper applies only un-applied files.
- `docs/llm-accounting.md` -- reviewed migration; example SQL is not a decision. Overlaps all apply.
- `docs/deepinfra-runbook.md` -- the acceptance row was an operator insert. Live `pml-build`: that id, `2026-10-04T19:10:00.000Z`–`2026-10-11T19:10:00.000Z`, cap 100. Tests seed it. The migration must not.
- `package.json` -- Eng Manager runs `npm run migrate:build` (`pml-build` only). `deploy` and `migrate:remote` target production `pml`.

## Tasks & Acceptance

**Execution:**
- [x] `migrations/0025_staging_deepinfra_v4flash_period.sql` -- idempotent insert of the new period, V4-Flash role guard, ruling quote, timestamp, and the ~19-hour shortfall -- reviewed provisioning
- [x] `src/shared/db/repos/stagingLlmPeriod.test.ts` -- workers-pool D1 tests for the matrix (handoff, replay, Workers AI no-op, old row, 100-cent cap)
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- append the V4-Flash cost-policy refresh, due before 2026-10-17

**Acceptance Criteria:**
- Given the V4-Flash `COST_POLICIES` entry, when `0025` inserts the row, then `ends_at` is `2026-10-18T00:10:57.000Z` and `starts_at` is `2026-10-11T19:10:00.000Z`.
- Given the migration comment and this spec, when either is read, then both contain the 10:07 AM ET ruling quote and the about-19-hour shortfall, after which `cost_policy_invalid` blocks runs until a reviewed refresh.
- Given `deferred-work.md`, when this lands, then it says to refresh the V4-Flash cost policy before 2026-10-17.

## Implementation Notes

- `migrations/0025_staging_deepinfra_v4flash_period.sql` inserts the row only when `gateway_config` already names `deepseek-ai/DeepSeek-V4-Flash`. `NOT EXISTS` keeps a second execution to one row. Tests seed `acceptance-3-36-deepinfra-20261004` on `UPGRADE_DB`; the migration does not write that row.
- `npm run check` passed. `npm test` passed: 1645 tests, 6 skipped.

## Spec Change Log

## Review Triage Log

## Design Notes

The role guard matches `0024`. Staging already names V4-Flash, so `migrate:build` inserts the row. Production is on `0004`; a later catch-up leaves the Workers AI seed, so this file does not add a 100-cent cap for every provider. `NOT EXISTS` covers a replay of the SQL. D1 applies `migrations/*.sql` in order and records each name in `d1_migrations` (Cloudflare D1 migrations).

## Verification

**Commands:**
- `npm run check` -- expected: exit 0
- `npm test` -- expected: exit 0, including the new period tests

**Manual checks (if no CLI):**
- Eng Manager applies `npm run migrate:build` on `pml-build` only. Do not run `npm run deploy` or `npm run migrate:remote`.
