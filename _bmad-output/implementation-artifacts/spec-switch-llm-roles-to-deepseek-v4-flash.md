---
title: 'Switch every LLM role to DeepSeek-V4-Flash'
type: 'feature'
created: '2026-10-11'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Staging revises fail because `zai-org/GLM-5.3-Flash` has no `can-disable-reasoning` tag, so reasoning-off is ignored and `parseJson` cannot read the JSON after the thinking text. Patrick ruled at 8:05 PM ET on 2026-10-10 that every role uses `deepseek-ai/DeepSeek-V4-Flash`.

**Approach:** Add a reviewed DeepInfra policy from the live catalog, point preflight and `gateway_config` at that model, and parse DeepInfra replies by dropping complete `<think>` blocks and taking the last JSON object.

## Boundaries & Constraints

**Always:** Leave the GLM policy row in place. `inputTokens` is the live catalog `max_tokens`. Each rate is the highest of the listed price and the cache-read/write prices on that side. `verifiedAt`/`validUntil` are a fresh seven-day window, and `sources` includes the catalog URL. Preflight checks the catalog row against the policy for the configured model and fails closed when a compared price is above the policy or `max_tokens` is below `inputTokens`. Null or absent `pricing.discount`, and non-null priority, flex, or cache fields, are allowed. Migration `0024` only updates `gateway_config.roles_json` so all five roles are DeepInfra `deepseek-ai/DeepSeek-V4-Flash`. Tolerant parsing is DeepInfra-only. `provider_call_degraded` still fires when `finish_reason` is not `stop`. Append the 2026-10-10 note; do not change 3.37's acceptance bullets or older migrations.

**Never:** Deploy, call a paid provider, or retarget Workers AI or OpenRouter parsing. Do not reserve priority or flex multipliers. Do not accept JSON that appears only inside `<think>`. Do not edit the DeepInfra 429 path PR #72 is changing in `gateway.ts`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Live row | Recorded V4-Flash catalog object and the new policy | Preflight accepts it | N/A |
| Price above policy | Input or output token price above the policy rate | No reservation or inference | `cost_policy_invalid` |
| Context too small | `max_tokens` below `inputTokens` | No reservation or inference | `cost_policy_invalid` |
| Prose then JSON | DeepInfra text with prose before one object | That object is parsed | N/A |
| JSON inside think | The only object is inside `<think>…</think>` | That object is not parsed | Parse fails |
| Decoy then real | Object inside `<think>`, then a later object | The later object is parsed | N/A |
| Other provider | Non-DeepInfra prose before JSON | Strict `JSON.parse` | Parse fails |
| Degraded stop | Chat body whose `finish_reason` is not `stop` | `provider_call_degraded` is logged | Rest of completion handling stays |

</frozen-after-approval>

## Code Map

- `https://api.deepinfra.com/models/list` at `2026-10-11T00:10:57Z`: one `deepseek-ai/DeepSeek-V4-Flash` row, `text-generation`, `private` 0, `deprecated`/`replaced_by` null, `max_tokens` 1048576, tags include `openai`, `reasoning`, `json`, `can-disable-reasoning`.
- Prices: input `9e-06` ($0.09/M), output `1.8e-05` ($0.18/M), `discount` null, cache-read `0.2` ($0.018/M), cache-write null, explicit cache-write `{5m: 1.25, 1h: 2.0}` ($0.1125/M, $0.18/M), priority `1.5`, flex `0.8`. Input rate `$0.18/M` (highest cache-write). Output rate `$0.18/M`. Priority and flex are not reserved.
- Bound `ceil(100 * (1048576 * 0.18 + 2048 * 0.18) / 1000000) = 19` cents. Policy: `inputTokens` 1048576, rates `0.18`/`0.18`, `verifiedAt` `2026-10-11T00:10:57.000Z`, `validUntil` `2026-10-18T00:10:57.000Z`, catalog URL in `sources`. GLM row and its `2026-10-11T19:10:00.000Z` expiry stay. Prior bounds stay 2, 124, 16.
- `src/pipeline/ai/gateway.ts` `deepInfraCatalogField` (~973–1052, GLM check at 985) — match `policy.model`; cent limits come from the policy; cache multiplier compares as `multiplier * cents_per_input_token`; unknown keys fail. Leave `complete`, `chatOutputDegraded`, and the 429 path.
- `src/pipeline/agents/draftAndReview.ts` `parseJson` (106–112) — DeepInfra: strip complete `<think>…</think>`, then the last brace-balanced `JSON.parse` object. Else trimmed `JSON.parse`. `parseToolRequest` stays first. `GatewayResult.provider` is already returned.
- `migrations/0024_deepseek_v4_flash_roles.sql` — `UPDATE` `id='current'`: `version+1`, five roles `deepinfra` / `deepseek-ai/DeepSeek-V4-Flash`, `updated_at` `2026-10-11T00:10:57.000Z`, budget unchanged. `gatewaySeed.test.ts` then expects version 2, budget 500, fake name `deepinfra`.
- Fixture `src/pipeline/ai/fixtures/deepseek-v4-flash-catalog-row.json` (that one object). Tests: `costPolicy.test.ts`, `deepinfra.test.ts`, `deepinfraRequest.test.ts`, `providerCallFailed.test.ts`, `gateway.test.ts`, `draftAndReview.test.ts`.
- Append one 2026-10-10 note to `spec-3-36-verify-the-corrected-staging-run-and-gateway.md` scope rulings and to Story 3.37 in `epics.md`: Patrick's 8:05 PM ET ruling sets `deepseek-ai/DeepSeek-V4-Flash` for every role; `run-20261010-0003` is `rejected` (335 rejected, 0 undecided, nothing published); those drafts had no model call, so they are not 3.37 live-draft evidence and were rejected under Patrick's earlier approval; 3.37 uses the first V4-Flash run (expected `run-20261010-0004`). Point `docs/deepinfra-runbook.md` and the GLM sentence in `epic-3-context.md` at the new model, 19-cent bound, and window. Leave 2026-10-04 GLM history specs.
- PR #72 also touches `gateway.ts`, `deepinfra.test.ts`, and `docs/deepinfra-runbook.md`.

## Tasks & Acceptance

**Execution:**
- [ ] `src/pipeline/ai/costPolicy.ts` — append the Code Map policy.
- [ ] `src/pipeline/ai/fixtures/deepseek-v4-flash-catalog-row.json` — commit the live row.
- [ ] `src/pipeline/ai/gateway.ts` — policy-relative `deepInfraCatalogField` for the configured model.
- [ ] `migrations/0024_deepseek_v4_flash_roles.sql` — set all five roles.
- [ ] `src/pipeline/agents/draftAndReview.ts` — DeepInfra think-strip and last-object parse.
- [ ] `src/pipeline/ai/*.test.ts`, `src/pipeline/workflow/gatewaySeed.test.ts`, `src/pipeline/agents/draftAndReview.test.ts` — matrix, 19-cent bound, seeded roles.
- [ ] `docs/deepinfra-runbook.md`, `epic-3-context.md`, `epics.md`, `spec-3-36-verify-the-corrected-staging-run-and-gateway.md` — ruling and 335-draft note.

**Acceptance Criteria:**
- Given the new policy, when `tokenCostCents` runs at `inputTokens` and 2048, then the result is 19 cents and the GLM bounds stay 2, 124, and 16.
- Given migrations applied, when `gateway_config` is read, then every role is DeepInfra `deepseek-ai/DeepSeek-V4-Flash`, version is incremented, and `default_budget_cents` is unchanged.
- Given the records, when 3.37 and the 3.36 scope rulings are read, then the 2026-10-10 note includes the V4-Flash ruling, `rejected` / 335 / 0 / nothing published, and expected `run-20261010-0004`, and 3.37's bullets are unchanged.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

Explicit cache write is opt-in, and our chat body still omits it, but `dimensions` says cache replacement rates are included and that 2.0× write is the highest listed cache-write price. Reserving `$0.18/M` input covers it. A null cache-write is skipped. `discount` null is allowed; a numeric discount above 1 still fails.

## Verification

**Commands:**
- `npm run check` — expected: exit 0
- `npm test` — expected: exit 0
