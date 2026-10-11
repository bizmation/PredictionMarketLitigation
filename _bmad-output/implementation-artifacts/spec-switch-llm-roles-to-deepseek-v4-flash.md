---
title: 'Switch every LLM role to DeepSeek-V4-Flash'
type: 'feature'
created: '2026-10-11'
status: 'in-review'
route: 'dispatch'
baseline_commit: '16c3dfd77f83fc4143da224339902e7201fa91b8'
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

**Always:** Leave the GLM policy row in place. `inputTokens` is the live catalog `max_tokens`. Each rate is the highest of the listed price and the cache-read/write prices on that side. `verifiedAt`/`validUntil` are a fresh seven-day window, and `sources` includes the catalog URL. Preflight checks the catalog row against the policy for the configured model and fails closed when a compared price is above the policy or `max_tokens` is below `inputTokens`. Null or absent `pricing.discount`, and non-null priority, flex, or cache fields, are allowed. Migration `0024` updates `gateway_config` only when `roles_json` already contains `zai-org/GLM-5.3-Flash`, so production's 0017 Workers AI seed no-ops. Tolerant parsing is DeepInfra-only. `provider_call_degraded` still fires when `finish_reason` is not `stop`. Append the 2026-10-10 note; do not change 3.37's acceptance bullets or older migrations.

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
- Prices are cents per token. Input `9e-06` cents/token is `9e-06 * 10000 = $0.09` per million tokens. Output `1.8e-05` cents/token is `$0.18/M`. `discount` is null. Cache-read `0.2`, cache-write null, and explicit cache-write `{5m: 1.25, 1h: 2.0}` are multipliers on the input cents, not dollar prices. `1h × 2.0 × 9e-06 = 1.8e-05` cents/token = `$0.18/M`, which is the highest input-side price, so the input rate is `$0.18/M`. Cache-read `0.2×` is `$0.018/M`. Output has no cache multiplier above `$0.18/M`. Priority `1.5` and flex `0.8` are not reserved.
- Bound `ceil(100 * (1048576 * 0.18 + 2048 * 0.18) / 1000000) = 19` cents. Policy: `inputTokens` 1048576, rates `0.18`/`0.18`, `verifiedAt` `2026-10-11T00:10:57.000Z`, `validUntil` `2026-10-18T00:10:57.000Z`, catalog URL in `sources`. GLM row and its `2026-10-11T19:10:00.000Z` expiry stay. Prior bounds stay 2, 124, 16.
- `src/pipeline/ai/gateway.ts` `deepInfraCatalogField` (~973–1052, GLM check at 985) — match `policy.model`; cent limits come from the policy; cache multiplier compares as `multiplier * cents_per_input_token`; unknown keys fail. Leave `complete`, `chatOutputDegraded`, and the 429 path.
- `src/pipeline/agents/draftAndReview.ts` `parseJson` (106–112) — DeepInfra: strip complete `<think>…</think>`, then the last brace-balanced `JSON.parse` object. Else trimmed `JSON.parse`. `parseToolRequest` stays first. `GatewayResult.provider` is already returned.
- `migrations/0024_deepseek_v4_flash_roles.sql` — `UPDATE` only when `roles_json` contains `zai-org/GLM-5.3-Flash`: `version+1`, five roles `deepinfra` / `deepseek-ai/DeepSeek-V4-Flash`, `updated_at = MAX(updated_at, '2026-10-11T00:10:57.000Z')`, budget unchanged. `gatewaySeed.test.ts` still asserts the 0017 Workers AI seed (version 1, budget 500).
- Fixture `src/pipeline/ai/fixtures/deepseek-v4-flash-catalog-row.json` (that one object). Tests: `costPolicy.test.ts`, `deepinfra.test.ts`, `deepinfraRequest.test.ts`, `providerCallFailed.test.ts`, `gateway.test.ts`, `draftAndReview.test.ts`.
- Append one 2026-10-10 note to `spec-3-36-verify-the-corrected-staging-run-and-gateway.md` scope rulings and to Story 3.37 in `epics.md`: Patrick's 8:05 PM ET ruling sets `deepseek-ai/DeepSeek-V4-Flash` for every role; `run-20261010-0003` is `rejected` (335 rejected, 0 undecided, nothing published); those drafts had no model call, so they are not 3.37 live-draft evidence and were rejected under Patrick's earlier approval; 3.37 uses the first V4-Flash run (expected `run-20261010-0004`). Point `docs/deepinfra-runbook.md` and the GLM sentence in `epic-3-context.md` at the new model, 19-cent bound, and window. Leave 2026-10-04 GLM history specs.
- PR #72 also touches `gateway.ts`, `deepinfra.test.ts`, and `docs/deepinfra-runbook.md`.

## Tasks & Acceptance

**Execution:**
- [x] `src/pipeline/ai/costPolicy.ts` — append the Code Map policy.
- [x] `src/pipeline/ai/fixtures/deepseek-v4-flash-catalog-row.json` — commit the live row.
- [x] `src/pipeline/ai/gateway.ts` — policy-relative `deepInfraCatalogField` for the configured model.
- [x] `migrations/0024_deepseek_v4_flash_roles.sql` — set all five roles.
- [x] `src/pipeline/agents/draftAndReview.ts` — DeepInfra think-strip and last-object parse.
- [x] `src/pipeline/ai/*.test.ts`, `src/pipeline/workflow/gatewaySeed.test.ts`, `src/pipeline/agents/draftAndReview.test.ts` — matrix, 19-cent bound, seeded roles.
- [x] `docs/deepinfra-runbook.md`, `epic-3-context.md`, `epics.md`, `spec-3-36-verify-the-corrected-staging-run-and-gateway.md` — ruling and 335-draft note.

**Acceptance Criteria:**
- Given the recorded catalog row, when the cost-policy test derives the input rate from `cents_per_input_token ×` the 1h cache-write multiplier and runs `tokenCostCents` at `inputTokens` and 2048, then the result is 19 cents and the GLM bounds stay 2, 124, and 16.
- Given a GLM `gateway_config` row, when migration 0024 runs, then every role is DeepInfra `deepseek-ai/DeepSeek-V4-Flash`, version increments, `default_budget_cents` is unchanged, and `updated_at` is the later of the previous value and `2026-10-11T00:10:57.000Z`. A 0017 Workers AI row stays version 1.
- Given the records, when 3.37 and the 3.36 scope rulings are read, then the 2026-10-10 note includes the V4-Flash ruling, `rejected` / 335 / 0 / nothing published, and expected `run-20261010-0004`, and 3.37's bullets are unchanged.

## Implementation Notes

Catalog prices are cents per token. Cache-write values are multipliers on input, so the recorded 1h × 2.0 on `9e-06` cents/token is `$0.18/M`. That sentence is in the `costPolicy.ts` comment and the cost-policy test derives the 19-cent bound from the committed catalog row (`cents_per_input_token ×` the 1h multiplier, then `tokenCostCents` at `inputTokens` and 2048).

`lastJsonObject` skips a successful object's interior. A nested `{from,to}` diff is not treated as a later reply.

The V4 accept test settles a call. `llm_period_accounting` counts any call whose `created_at` falls inside a later period, and the campaign period ends at the GLM `validUntil` (`2026-10-11T19:10:00.000Z`). `NOW_V4` is `2026-10-12T00:00:00.000Z`, inside the V4 window and outside that campaign window.

PR #72 merged as `aa58d2d` while this branch was still unpushed. The branch merges that commit. `complete()` still passes `mapping.model` into the overload retry, `revalidateBeforeInference` still rechecks that call's policy, and a persistent 429 still releases that reservation. The DeepInfra tests pin `deepseek-ai/DeepSeek-V4-Flash` on each retry body, on the policy re-check, and on the released operation.

D1 migrations docs (https://developers.cloudflare.com/d1/reference/migrations/): a new sequential `.sql` file in `migrations/` is applied in order and recorded in `d1_migrations`. `0024` follows that. No library API changed, so Context7 was not required.

`llmAccountingUpgrade.test.ts` set the fake drafter role before later migrations. `0024` then replaced that role, so the gateway exercise now sets the fake role after those migrations apply. The budget assertion is unchanged.

This session cannot launch review subagents. Code Review's separate `bmad-code-review` stands in for those review layers. Status is `in-review` for that pass.

## Spec Change Log

- 2026-10-11 review of `c61da72`: the frozen migration sentence and the gateway-config acceptance criterion now limit `0024` to a row that already names `zai-org/GLM-5.3-Flash`. Production's 0017 Workers AI seed must no-op. `updated_at` uses `MAX` so a later operator timestamp is kept.

## Review Triage Log

Review of `c61da72`. Verdicts below. Patches 1–7 and docs 12–13 are in the fix commit. 8–11 and the two added notes are deferred.

- 1. `patch` — `0024` would rewrite production's Workers AI seed on `npm run deploy`. Fixed: `WHERE` requires `zai-org/GLM-5.3-Flash`, `updated_at` is `MAX`, and tests cover a GLM switch, an untouched 0017 row, and the 0017 seed itself.
- 2. `patch` — `stripThinkBlocks` kept JSON inside a truncated `<think>` or before an orphan `</think>`. Fixed: drop from an unmatched open tag, keep only text after the last close, case-insensitive, attributes allowed.
- 3. `patch` — V4 preflight did not require `can-disable-reasoning`. Fixed for that model, with a fail-closed test. GLM rows still pass without the tag.
- 4. `patch` — reviewer and docket paths were not covered by a tolerant DeepInfra reply. Tests now require the `provider` argument at `parseInference` and `scoreReviewer`.
- 5. `patch` — cache multipliers above the policy were untested. Fail-closed cases cover `1h: 2.5`, an array, and cache-read above 2, with no reservation.
- 6. `patch` — `usdPerMillionToCentsPerToken("10000")` returned `"1."`. The empty fraction is omitted. Unit tests cover that helper and `decimalProductAtMost`.
- 7. `patch` — no V4 request-body assertion. The chat body test requires `reasoning_effort: "none"`, `reasoning: { enabled: false }`, and no `service_tier`.
- 8. `defer` — `max_tokens` above `inputTokens`, a fractional `1048576.5`, and priority/flex as a string or object.
- 9. `defer` — `lastJsonObject` still scans a span that fails to parse, and does not try candidates last to first against the role schema.
- 10. `defer` — the budget test still starts from the default seed budget and version. The ceiling fixture's provider and model match the 0017 seed again because that seed assertion was restored.
- 11. `defer` — the 19-cent test still calls `tokenCostCents` with the stored policy rate rather than the fixture-derived rate string.
- 12. `patch` — docs. The GLM sentence in `epic-3-context.md` is marked superseded. The 3.36 note records the ruling and does not say it supersedes the acceptance-criteria name. V4 `sources` include the model page and the reasoning docs.
- 13. `patch` — runbook now documents the `<think>` fallback and the multiplier price check. It was a short docs edit, so it landed with 12.
- Steward `parseConfigProposal` and `parseToolRequest` still parse strictly. `defer`. A DeepInfra reply with prose or `<think>` is plain text and records no tool denial.
- USD 1 coverage after the acceptance period. `defer`. Release evidence and the docs do not say whether the USD 1 authorization and period `acceptance-3-36-deepinfra-20261004` (ends 2026-10-11T19:10:00Z) cover V4-Flash calls after that time.
- `false` — "the migration reports success with no current row." An `UPDATE` that matches nothing still applies cleanly, and that is the production no-op. Dismissed.

## Design Notes

Catalog `cents_per_input_token` and `cents_per_output_token` are cents per token. USD per million tokens is `cents_per_token × 10_000`. Cache-read, cache-write, and explicit cache-write values are multipliers on the input cents-per-token price. The recorded 1h multiplier is 2.0, so `2.0 × 9e-06 = 1.8e-05` cents/token = `$0.18/M`, and that sets `inputUsdPerMillion`. A null cache-write is skipped. `discount` null is allowed; a numeric discount above 1 still fails. The cost-policy test must compute that 19-cent bound from the committed catalog row, not from a hand-copied rate.

Approved 2026-10-11: keep the full spec (2199 tokens) and continue. PR #72 may merge first; rebase onto it and keep both the 429 release in `complete()` and this catalog check. This session cannot launch review subagents. Code Review's separate `bmad-code-review` stands in for those review layers.

## Verification

**Commands:**
- `npm run check` — expected: exit 0
- `npm test` — expected: exit 0
