---
title: 'Story 3.20: OpenRouter Provider via AI Gateway'
type: 'feature'
created: '2026-09-22'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
baseline_commit: 9f99b9c9a6a43b00ce52ff8daa3e2491432f1b57
baseline_revision: 9f99b9c9a6a43b00ce52ff8daa3e2491432f1b57
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
warnings:
  - oversized
deferred: []
---

<intent-contract>

## Intent

**Problem:** Role→model config can name `provider: "openrouter"`, but `complete()` always calls the injected Workers AI binding, never checks that the binding matches the config, and only refuses when spend is already at the ceiling — so a paid call can cross it.

**Approach:** Resolve the provider whose name equals the role's config. OpenRouter is a separate provider that calls the AI Gateway OpenRouter endpoint with Worker secrets. A missing provider or a name mismatch is `gateway_not_configured`. Before the call, refuse when spend is already at the ceiling or when this call's estimate would push over it. Record real tokens and integer cents so ops. spend renders non-zero.

## Boundaries & Constraints

**Always:**
- Agents still call `complete()` only. `provider.name` must equal `mapping.provider`. Production registers `workersai` (`createWorkersAiProvider`) and `openrouter` (present only when `OPENROUTER_API_KEY`, `AI_GATEWAY_ID`, and `CLOUDFLARE_ACCOUNT_ID` are all set). Tests that pass one `provider` keep working when its `name` matches the config (`"fake"`).
- OpenRouter calls `https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/openrouter/chat/completions` with `Authorization: Bearer` the API key and `{ model, messages: [{ role: "user", content: prompt }] }`. It does not call `env.AI.run`. Workers AI stays on `env.AI.run` with `costCents: 0`.
- Secrets are optional `Env` fields (same pattern as `COURTLISTENER_API_TOKEN` in `src/access-env.d.ts`). Never `wrangler.jsonc` `vars`, never D1, never a prompt, never an Evidence payload.
- Budget, before `complete`: keep `spend >= budget` → `budget_stopped` with no provider call. Also refuse when `spend + estimateCents > budget`. `estimateCents` is optional on `LlmProvider`; missing means 0. OpenRouter's estimate is `max(1, ceil(promptChars / 4 / 1000))` cents. After a successful OpenRouter response, `costCents` is `max(1, ceil((inputTokens + outputTokens) / 1000))` when usage is present, else 1. Integer cents, USD.
- `withDeadline` aborts an `AbortSignal` passed into `provider.complete({ model, prompt, signal })`. OpenRouter passes it to `fetch`. Workers AI receives it and cannot cancel `env.AI.run` (the binding's third argument is gateway options only — Cloudflare docs, worker-binding-methods, 2026-09-17).
- `llm_calls` stores the config's provider and model, token counts from the response (`usage.prompt_tokens` / `usage.completion_tokens`), and that `costCents`. `runs.spend_cents` bumps when `costCents > 0`. Ops. already renders `spendCents` via `formatUsdCents` and sums `llmCalls` tokens; no new page.

**Never:**
- No new admin UI, no chat-mutable budget/mode/allowlist, no change to the 0017 Workers AI seed, no OpenRouter key in the drafter prompt, no `surfaces/*` → `pipeline/*` import, no connector AbortSignal (3.21), no float dollars, no second gateway module.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| OpenRouter under budget | Config `provider: "openrouter"`, secrets set, spend 0, budget 500, estimate 1 | Fetch hits the OpenRouter gateway URL; `llm_calls` has that provider, model, tokens, `costCents >= 1`; run spend bumps | N/A |
| Workers AI unchanged | Config `workersai`, `env.AI` set | `env.AI.run` only; `costCents` 0; no OpenRouter fetch | N/A |
| Provider mismatch | Config `openrouter`, only a `workersai` provider registered | No fetch, no `llm_calls` | `gateway_not_configured` |
| Secrets missing | Config `openrouter`, any of the three secrets absent | OpenRouter provider not registered; no fetch | `gateway_not_configured` |
| Already at ceiling | spend >= budget | No provider call; running Run → `stopped` + `run.stopped` | `budget_stopped` |
| Estimate would push over | spend 490, budget 500, estimate 20 | No provider call; same stop | `budget_stopped` |
| Estimate fits | spend 490, budget 500, estimate 10 | Call proceeds | N/A |
| Zero estimate at ceiling | spend == budget, estimate 0 | Still refused (existing `>=`) | `budget_stopped` |
| Ops. render | Run detail `spendCents` 12, one call tokens 11/7 | Spend text `$0.12`; token sum 18 | N/A |
| Secret leakage | Any OpenRouter call | Prompt, Evidence, and D1 rows do not contain the API key | Fail closed |

</intent-contract>

## Code Map

- `src/pipeline/ai/gateway.ts:55-63` — `LlmProvider`. Add optional `estimateCents?({ model, prompt })` and `signal?: AbortSignal` on `complete`. `name` is the match key (`"workersai"` at `:303`, tests use `"fake"` at `gateway.test.ts:62`).
- `src/pipeline/ai/gateway.ts:127-206` — `complete`. After resolving `mapping` (`:140`), select the provider: `deps.providers` (new, optional) by `name === mapping.provider`, else the single `deps.provider` when its `name` matches. Otherwise `gateway_not_configured` (`:128-132` stays for a null single provider). Budget block `:158-180` gains the estimate check before the `withDeadline` call at `:196`. Pass an `AbortController` signal into `complete`; abort it when the deadline wins.
- `src/pipeline/ai/gateway.ts:300-323` — `createWorkersAiProvider` unchanged aside from accepting `signal` and ignoring it. New `createOpenRouterProvider(env)` in this file: returns `null` unless all three secrets are non-empty strings; `name: "openrouter"`.
- `src/shared/lib/timeouts.ts:157-171` — `withDeadline` only races. Add an overload or a sibling that owns an `AbortController`, aborts on timeout, and still rejects with `DeadlineError`. Callers of the old function stay valid.
- `src/server.ts:474` and `src/pipeline/workflow/dailyRun.ts:80-86` — stop passing only `createWorkersAiProvider`. Pass `providers: [workers, openrouter].filter(Boolean)` plus a single `provider` only when tests do. Production `complete` must see both.
- `src/access-env.d.ts:40-47` — add optional `OPENROUTER_API_KEY`, `AI_GATEWAY_ID`, `CLOUDFLARE_ACCOUNT_ID`. Do not put them in `wrangler.jsonc` (comment at `:265`). `src/shared/lib/wranglerConfig.test.tsx:39-47` pins no `vars` block.
- `src/shared/db/repos/roleModelsRepo.ts:66` — `setRoleModel` is the operator write. No new route. Tests call it.
- `src/shared/db/repos/llmCallsRepo.ts:28,98` — `recordCall` / `totalSpendForRun`. `runsRepo.bumpSpend` already runs when `costCents > 0` (`gateway.ts:228`).
- `src/surfaces/ops/EvidenceDetail.tsx:693-700,348-354` — spend header and `tokenSum`. `RunLog.tsx:123` `formatUsdCents`. `evidenceDetail.test.tsx` fixtures use `spendCents: 47` and `costCents: 0` on the sample call (`:42-43,89`). Add one assertion that non-zero `costCents` on the call is not required for the header (the header is `spendCents`) and that a non-zero `spendCents` renders `$0.12` for 12 cents. Do not add a new ops page.
- `src/pipeline/ai/gateway.test.ts` — extend. Seed pattern `:96`. Budget tests around `:159` and the ceiling case near `:485`. New cases: mismatch, missing secrets (provider factory), estimate over, estimate under, OpenRouter fetch URL/headers via a stubbed `fetch`, key absent from the prompt argument, tokens and `costCents >= 1` recorded.
- `src/pipeline/workflow/gatewaySeed.test.ts` — Workers AI seed path must still resolve `workersai` and must not require the three secrets.
- `_bmad-output/implementation-artifacts/sprint-status.yaml:92` — `3-20-openrouter-provider-via-ai-gateway` backlog → in-progress → done.
- `_bmad-output/implementation-artifacts/deferred-work.md:159-160` — do not edit the ledger lines. The two `→ 3.20` items are this story's scope. The `withDeadline` signal defer (`:166`) is the provider half only.

## Tasks & Acceptance

**Execution:**
- [x] `src/pipeline/ai/gateway.ts` — provider select, estimate gate, OpenRouter fetch provider, signal
- [x] `src/shared/lib/timeouts.ts` — deadline aborts a signal
- [x] `src/access-env.d.ts` — three optional secrets
- [x] `src/server.ts` + `src/pipeline/workflow/dailyRun.ts` — register both providers
- [x] `src/pipeline/ai/gateway.test.ts` + `src/surfaces/ops/evidenceDetail.test.tsx` — matrix and non-zero spend render
- [x] `sprint-status.yaml` — status transitions

**Acceptance Criteria:**
- Given the 0017 Workers AI seed, when `complete` runs for drafter, then the call is `env.AI.run` and `llm_calls.cost_cents` is 0
- Given `setRoleModel` to `provider: "openrouter"` and the three secrets, when `complete` runs under budget, then the request URL is the AI Gateway OpenRouter chat path, `llm_calls` has tokens and `cost_cents >= 1`, and ops. formats that spend as dollars
- Given config `openrouter` and a Workers AI-only registry, when `complete` runs, then it throws `gateway_not_configured` and performs no fetch
- Given remaining budget below the provider estimate, when `complete` runs, then it throws `budget_stopped` before `provider.complete`
- Given any secret value, when the call is recorded, then that value is not in the prompt, the `llm_calls` row, or Evidence

## Spec Change Log

## Review Triage Log

### 2026-09-22 — Review pass
- verdicts: 25 findings — high 0, medium 3, low 11, false 11, maybe-false 0
- findings:
  - `[low]` `[reject]` Spec `in-review` disagreed with sprint `done` — review sets the spec to done at finalize; the sprint row is the story ledger
  - `[false]` `[reject]` Always names `withDeadline` but abort lives on `withAbortableDeadline` — the Code Map allowed a sibling so old callers keep racing; the gateway aborts through the sibling
  - `[low]` `[patch]` Estimate refusal said spend had already reached the ceiling — the message now says spend plus the estimate would pass the ceiling
  - `[low]` `[reject]` Input-only estimate can still record spend over the ceiling — Design Notes chose that formula; an output reserve would add a number the spec does not set
  - `[low]` `[reject]` HTTP, non-text, and JSON failures have no dedicated tests — those throws already become `provider_error` in the existing catch
  - `[low]` `[reject]` No hung-fetch gateway test — `withAbortableDeadline` aborts in its unit test, and the OpenRouter call asserts `init.signal`
  - `[false]` `[reject]` `wranglerConfig` and `gatewaySeed` were not edited — both suites still pass and still pin no `vars` and the Workers AI seed
  - `[low]` `[reject]` No runbook for the three secrets — the spec's manual check is none; secrets are set at deploy, like the CourtListener token
  - `[medium]` `[patch]` Provider list copied in `server.ts` and `dailyRun.ts` with no test if one copy drops OpenRouter — both call `llmProvidersFromEnv`; the test requires `openrouter` only when all three secrets are set
  - `[low]` `[reject]` `$0.00` absence is a brittle assertion — `$0.12` and token sum 18 are the matrix pins
  - `[false]` `[reject]` Change log and triage were empty — they stay empty until this pass
  - `[false]` `[reject]` Code Map line numbers are stale — refreshing them edits the spec
  - `[low]` `[reject]` A NaN or negative estimate could skip the gate — OpenRouter's estimate is finite and at least 1
  - `[low]` `[reject]` `estimateCents` throwing would escape untyped — the OpenRouter estimate does not throw
  - `[low]` `[reject]` Non-number usage tokens could corrupt cents — response usage is numeric JSON; a type guard is an extra branch
  - `[false]` `[reject]` Account or gateway ids with slashes would break the URL — those ids are single path segments
  - `[low]` `[reject]` Two concurrent `complete` calls can both pass the estimate — one operator; a lock is extra
  - `[false]` `[reject]` `withDeadline` itself does not abort — same sibling split as the Always-line row
  - `[medium]` `[patch]` Production registry never exercised — grouped with the shared `llmProvidersFromEnv` patch
  - `[medium]` `[patch]` OpenRouter `estimateCents` formula unpinned — a short prompt asserts 1 and an 8000-character prompt asserts 2
  - `[false]` `[reject]` Secrets-missing is only a factory test — factory null plus the mismatch `complete` cover that matrix row
  - `[false]` `[reject]` Ops spend is a fixture, not an OpenRouter round-trip — the Code Map asked for the existing header assertion, not a new page
  - `[false]` `[reject]` Deadline abort is a sibling of `withDeadline` — same as the sibling row
  - `[false]` `[reject]` Ceiling and zero-estimate rows are not in the 3.20 block — the existing budget-stop test still refuses when spend equals the ceiling and estimate is absent
  - `[false]` `[reject]` Admin seeds changed from `fake` to `workersai` — name matching requires the config provider to be the registered provider

## Design Notes

Cloudflare's 2026 AI binding can call third-party models through `env.AI.run` with Unified Billing and no provider key (docs: `ai-gateway/usage/worker-binding-methods`, updated 2026-09-17). This story does not use that path. The acceptance line "not the default binding" plus architecture.md's `…/openrouter/…` endpoint mean a distinct provider and a `fetch` the deadline can abort. The gateway id and account id are secrets so they are not committed in `wrangler.jsonc`.

Estimate is input-side only (`promptChars / 4` tokens, 1 cent per 1,000, minimum 1). Recorded cents use actual usage the same way, minimum 1, so ops. cannot show `$0.00` for a successful OpenRouter call. A response `usage` object is the token source; missing usage still records cost 1 and null tokens.

## Verification

**Commands:**
- `npm test` -- expected: pass, including the OpenRouter matrix and the Workers AI seed test
- `npm run check` -- expected: exit 0

**Manual checks (if no CLI):**
- None. Secrets are not present in CI; the fetch is stubbed.

## Auto Run Result

Status: done

Summary: `complete()` selects the provider whose name matches role→model config. OpenRouter is a separate fetch to the AI Gateway OpenRouter chat URL, registered only when `OPENROUTER_API_KEY`, `AI_GATEWAY_ID`, and `CLOUDFLARE_ACCOUNT_ID` are set. A mismatch or a missing provider is `gateway_not_configured`. Calls are refused when spend is already at the ceiling or when the estimate would push over it. Successful OpenRouter calls record tokens and at least 1 cent so ops. spend is non-zero. Workers AI stays on `env.AI.run` at 0 cents.

Files changed:
- `src/pipeline/ai/gateway.ts` — provider select, estimate gate, OpenRouter fetch, `llmProvidersFromEnv`
- `src/shared/lib/timeouts.ts` — `withAbortableDeadline` aborts the provider signal
- `src/access-env.d.ts` — three optional secrets
- `src/server.ts` and `src/pipeline/workflow/dailyRun.ts` — shared provider registry
- `src/pipeline/ai/gateway.test.ts`, `src/surfaces/ops/evidenceDetail.test.tsx`, `src/shared/api/adminApi.test.ts`, `src/shared/lib/timeouts.test.ts` — matrix and registry tests
- `sprint-status.yaml` — story 3.20 done
- this spec

Review: 4 layers, 25 findings — 0 high, 3 medium, 11 low, 11 false. Patches: estimate-over message; shared `llmProvidersFromEnv` plus registry test; pinned OpenRouter estimate (1 and 2 cents). Rejected sibling-vs-`withDeadline` wording, input-only post-call overrun, extra HTTP/JSON fixtures, hung-fetch integration, unchanged wrangler/seed pins, secret runbook, brittle `$0.00` assertion, empty logs, stale Code Map, NaN/throwing/non-number usage, slashy ids, concurrent completes, factory-vs-complete secrets, ops fixture vs round-trip, inherited ceiling tests, and the admin `workersai` seed string.

Follow-up review recommended: true. Two medium entries were patched (registry wiring, estimate formula). Unverified risk: the estimate counts input characters only, so a call that passes the pre-check can still record spend above the ceiling after usage comes back. Workers AI still cannot cancel `env.AI.run`.

Patch counts by verdict: high 0, medium 2, low 1.

Verification: `npm test` — 1008 passed. `npm run check` — oxfmt/oxlint/tsc exit 0.

Residual risk: live OpenRouter needs the three Worker secrets and a `setRoleModel` to `openrouter`. CI stubs `fetch`.

