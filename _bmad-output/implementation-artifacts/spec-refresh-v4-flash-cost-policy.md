---
title: 'Refresh the V4-Flash cost policy and successor period'
type: 'feature'
created: '2026-10-16'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/deepinfra-runbook.md'
  - '{project-root}/docs/llm-accounting.md'
  - '{project-root}/src/pipeline/ai/costPolicy.ts'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `deepseek-ai/DeepSeek-V4-Flash` in `COST_POLICIES` and period `staging-deepinfra-v4flash-20261011` both end at `2026-10-18T00:10:57.000Z`. At that instant staging runs fail with `cost_policy_invalid`. A refreshed policy with no covering `llm_periods` row lets `reserve` admit paid calls under only the per-Run budget.

**Approach:** Re-read the three sources on the V4-Flash policy entry, then refresh that entry and insert one successor period in the same change. The 2026-10-16 read matched `deepseek-v4-flash-catalog-row.json`: input `9e-6` cents/token, output `1.8e-5` cents/token, 1h explicit cache-write multiplier `2.0`, `max_tokens` 1048576. The model page shows `$0.09` in, `$0.18` out, and `$0.18` per million for a 1h cache write. Reviewed rates stay `0.18` / `0.18`. `verifiedAt` is the implementation re-read instant; `validUntil` is that instant plus exactly 7 days. Successor `staging-deepinfra-v4flash-20261018` is 100 cents, starts at the old end, and ends at `min(start + 7 days, validUntil)`.

## Boundaries & Constraints

**Always:** Append-only insert. Leave `staging-deepinfra-v4flash-20261011` unchanged. Use the `0025` quoted-model guard and `NOT EXISTS` replay rule. Bounds are 24-character UTC, start inclusive, end exclusive. Cap is 100 cents. The successor end equals the refreshed `validUntil`, so the new policy has no uncovered tail, and the period is at most 7 days. Re-read the three sources before writing timestamps. Other `COST_POLICIES` rows stay, including GLM. A Workers AI `gateway_config` makes the insert a no-op. Quote Patrick's 2026-10-11 10:07 AM ET ruling in the migration comment and provenance.

**Never:** Hand-edit remote D1. Do not run `migrate:build`, `deploy`, or `deploy:build`. Do not update or delete the old period. Do not change `reserve()`, sprint-status, the Epic 3 retro, or any 4.x story. Do not switch the configured model to `DeepSeek-V4-Flash-0731`. Do not set a cap above 100 cents or a period longer than 7 days. If the re-read no longer supports the 19-cent bound, or `validUntil` is later than start + 7 days, stop without writing a new rate or a longer row. Do not edit `docs/llm-accounting.md`, `0024`, or `0025`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Handoff | Both periods. `reserve` at `2026-10-18T00:10:57.000Z` | Only `staging-deepinfra-v4flash-20261018` | N/A |
| Before handoff | Both periods. `reserve` one millisecond earlier | Only `staging-deepinfra-v4flash-20261011` | N/A |
| Successor end | `reserve` at the successor `ends_at` | No period (`[]`) | N/A |
| Replay | V4-Flash gateway. Run the `0026` statements twice | One row, `cap_cents` 100, same bounds. Old row unchanged | N/A |
| Workers AI seed | `0017` seed. Apply `0026` | No successor row | N/A |
| Longer model id | Role model `deepseek-ai/DeepSeek-V4-Flash-extra` | No successor row | N/A |
| Policy window | Refreshed entry | Valid at `verifiedAt`. Expired at `validUntil` | `cost_policy_invalid` path: `Expired or invalid cost policy validity` |

</frozen-after-approval>

## Code Map

- `src/pipeline/ai/costPolicy.ts` -- V4-Flash entry, lines 80–94. `validatePolicy` requires `validUntil - verifiedAt` of exactly 7 days. Rates stay `0.18` / `0.18` while the catalog row matches. Do not edit the other three entries.
- `src/pipeline/ai/fixtures/deepseek-v4-flash-catalog-row.json` -- recorded row. The 2026-10-16 catalog object matched it, including pricing and tags. Leave it. If the implementation re-read differs, stop without editing it. Sources: `https://api.deepinfra.com/models/list`, `https://deepinfra.com/deepseek-ai/DeepSeek-V4-Flash`, `https://docs.deepinfra.com/chat/reasoning`. The reasoning page states no price and its examples now name `DeepSeek-V4-Flash-0731`.
- `src/pipeline/ai/gateway.ts` -- `deepInfraPriceField` (about line 1071) fails closed when a catalog price or cache multiplier exceeds the policy. `1h` multiplier `2.0` on `9e-6` cents/token is the `0.18` input rate. Reuse it; do not change it.
- `src/pipeline/ai/costPolicy.test.ts` -- pins the 19-cent bound from the fixture and resolves at `policy.verifiedAt`. Keep that pin. The four-entry bound list stays `[2, 124, 16, 19]`.
- `src/pipeline/ai/deepinfra.test.ts` -- `NOW_V4` is `2026-10-12T00:00:00.000Z` (line 23) and `v4Policy` resolves there (line 27). Move `NOW_V4` into `[verifiedAt, validUntil)`. Leave GLM `NOW`.
- `src/pipeline/ai/providerCallFailed.test.ts` -- `NOW` is `2026-10-11T12:00:00.000Z` and resolves the V4 policy there. Move it into the refreshed window.
- `migrations/0025_staging_deepinfra_v4flash_period.sql` -- pattern for the insert, role guard, and ruling quote. Do not edit. Its end stays `2026-10-18T00:10:57.000Z`.
- `src/shared/db/repos/stagingLlmPeriod.test.ts` -- asserts `v4.validUntil` is that old end (lines 86–100). Pin `0025` to the literal end. Do not resolve the refreshed policy at `2026-10-11T19:10:00.000Z`.
- `src/shared/db/repos/llmAccountingRepo.ts` -- `reserve` attributes `starts_at <= now < ends_at` (insert near line 124). A time covered by zero periods is admitted. Reuse `reserve`; do not change it.
- `migrations/0021_atomic_llm_accounting.sql` -- append-only period checks. Do not edit.
- `docs/deepinfra-runbook.md` -- lines 46–54 state the old window and the 19-cent bound. Update the window. Leave the bound while the re-read matches.
- `docs/llm-accounting.md` -- mechanism and hypothetical SQL, not this decision. Do not edit.
- `package.json` -- `migrate:build` and `deploy:build` apply remote D1. Do not run them.

## Tasks & Acceptance

**Execution:**
- [ ] `src/pipeline/ai/costPolicy.ts` -- set V4-Flash `verifiedAt` / `validUntil` from the implementation re-read; keep rates, sources, and the bound comment when the row still matches -- reviewed refresh
- [ ] `migrations/0026_staging_deepinfra_v4flash_successor.sql` -- idempotent successor insert, V4-Flash role guard, ruling quote, 100-cent cap, start at the old end, end at the refreshed `validUntil` -- shared cap for the new window
- [ ] `src/shared/db/repos/stagingLlmPeriod.test.ts` -- keep `0025` on its literal end, and cover the matrix for `0026` -- handoff, replay, seed no-op, cap
- [ ] `src/pipeline/ai/deepinfra.test.ts` -- move `NOW_V4` into the refreshed window -- policy resolution
- [ ] `src/pipeline/ai/providerCallFailed.test.ts` -- move `NOW` into the refreshed window -- policy resolution
- [ ] `docs/deepinfra-runbook.md` -- replace the V4-Flash validity window -- operator runbook

**Acceptance Criteria:**
- Given the implementation re-read still matches the recorded catalog row, when the V4-Flash entry is loaded, then rates are `0.18` / `0.18`, `validUntil - verifiedAt` is exactly 7 days, and `tokenCostCents` at `inputTokens` / `outputTokens` is 19.
- Given `0026` and a V4-Flash gateway, when the successor is read, then `cap_cents` is 100, `starts_at` is `2026-10-18T00:10:57.000Z`, `ends_at` equals the refreshed `validUntil`, and `ends_at - starts_at` is at most 7 days.
- Given the existing `0025` row, when `0026` runs, then that row's id, bounds, cap, and provenance are unchanged.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run check` -- expected: exit 0
- `npm test` -- expected: exit 0
