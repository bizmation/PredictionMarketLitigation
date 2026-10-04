---
title: 'DeepInfra provider option for 3.36'
type: 'feature'
created: '2026-10-04'
status: 'done'
baseline_revision: '0e67b5a9c19a26fe6bea465ca03385379f9c860a'
review_loop_iteration: 1
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      Steering client deadline does not cover sequential metadata/preparation and inference deadlines.
    evidence: |-
      Existing OpenRouter preflight plus inference already permits two-call turns beyond the 130-second client timeout; DeepInfra free preparation extends that envelope. Stable request identities prevent duplicate paid retries. Review end-to-end timeout UX separately.
    location: >-
      src/shared/lib/timeouts.ts:STEERING_POST_TIMEOUT_MS
    severity: medium
  - summary: >-
      Catalog response size and synchronous decimal parsing have no explicit size bound.
    evidence: |-
      Unverified resource exhaustion requires an oversized response from the fixed trusted public catalog; elapsed deadlines cannot interrupt synchronous parsing. A measured provider response exceeding Worker resource limits would establish harm. All work precedes paid reservation.
    location: >-
      src/pipeline/ai/gateway.ts:catalogDecimal and DeepInfra preflight
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** Patrick now wants DeepInfra instead of OpenRouter for 3.36, specifically `zai-org/GLM-5.3-Flash`, and authorizes only USD 1 total for acceptance. The production provider registry cannot select DeepInfra.

**Approach:** Add DeepInfra as another selectable role provider through Cloudflare AI Gateway, preserving existing Workers AI and OpenRouter options, central reservations/settlement and truthful public cost evidence. Implement and test provider capability now; live acceptance remains incomplete until a DeepInfra key is securely provisioned and actual inference succeeds.

## Boundaries & Constraints

**Always:** Use exact selected model; seven-day reviewed cost validity; 2,048 maximum output tokens; text-only standard service (no paid tools, media, priority, flex or automatic retries). Disable reasoning via documented `reasoning_effort: none` for bounded structured output and never use reasoning text as content. Use undiscounted rates for the conservative bound. Live campaign must be capped at 100 cents across Runs by real D1 period accounting before activation; per-Run default also 100 cents. Preserve existing provider policies unchanged, including their expiry. Missing/invalid response usage retains liability; DeepInfra token-based costs must remain labeled estimates, never claim its `estimated_cost` is an actual charge. Secret-free public evidence and fail-closed registration/preflight.

**Never:** Call DeepInfra directly for inference outside the central gateway, expose keys, bypass admission/gate/accounting, renew OpenRouter/Workers AI policy implicitly, change production, fabricate live acceptance, or approve/publish Draft content.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Registry | Complete DeepInfra bindings or one missing | All existing options preserved; DeepInfra present only when configured | No silent fallback |
| Exact request | Selected GLM model, valid policy/catalog | Cloudflare custom-deepinfra route, bearer key, one attempt, no cache, max_tokens 2048, reasoning none | No direct inference bypass |
| Metadata | Exact active model with reviewed standard prices/context | Eligible before reservation | Reject higher/unknown prices, missing/deprecated model, changed context or paid dimensions before POST |
| Response | Text plus valid usage | Real D1 ledger and public Evidence show deepinfra/model and token estimate | Non-text, missing/invalid usage, over-bound output, failed/aborted request preserve conservative liability |
| Budget | 100-cent shared period near exhaustion, concurrent calls/replay | Reservations cannot overrun aggregate cap; replay no duplicate paid call | Real accounting, no stubbed ledger |
| Policy | Valid then expired or unsupported model | Exact reviewed model only during validity | No paid POST when invalid |

</intent-contract>

## Code Map

- `src/pipeline/ai/gateway.ts` — LlmProvider interface, llmProvidersFromEnv, createOpenRouterProvider, createWorkersAiProvider; preflight precedes actual atomic reservation. Add DeepInfra factory here or a focused module without creating circular imports. Public reportedCostSource currently assumes `.usage.cost`; do not feed provider `estimated_cost` into reportedCostUsd.
- `src/pipeline/ai/costPolicy.ts` — append a new exact-model policy; the current schema max input 200000 must allow the verified 1048576 context for this model. Keep older policy entries/dates intact. Bound full model context at USD 0.15/M input and USD 0.50/M output: ceil(100 * (1048576*0.15 + 2048*0.50)/1000000) = 16 cents. Fresh verifiedAt 2026-10-04T19:10:00.000Z, expires exactly seven days later. Sources below were read on this date; validate actual current clock before accepting date.
- `src/access-env.d.ts` — add optional DEEPINFRA_API_KEY Secrets Store binding (async .get(); local string fixtures allowed) and optional AI_GATEWAY_TOKEN for gateway-level authentication; reuse account/gateway id. Fixed Cloudflare custom slug deepinfra, base origin https://api.deepinfra.com. Do not accept arbitrary provider origins from untrusted input.
- `src/pipeline/ai/gateway.test.ts`, `costPolicy.test.ts`, optional `deepinfra.test.ts` — tests with real migrated D1, deterministic HTTP fixtures, actual provider factory and public API. Existing reservation races are reusable.
- `docs/deepinfra-runbook.md` — setup/route/secret names, exact model/cost sources, 100-cent campaign cap and credential/live-acceptance limitations. Parent owns remote configuration and other story/planning records; implementation must not mutate remote state.

## Provider facts verified by parent

- DeepInfra public `https://api.deepinfra.com/models/list` selected object: model_name `zai-org/GLM-5.3-Flash`, type/reported_type text-generation, max_tokens 1048576, deprecated/replaced_by null, private 0, tags openai/reasoning/json/multimodal. pricing.type tokens; cents_per_input_token 0.000015; cents_per_output_token 0.00005; discount 0.5 (do NOT rely on discount); cached input multiplier 0.2; cache-write/priority/flex/explicit-cache rates null; short/full/table null. A copy is available at /tmp/pml-deepinfra-models.json. Scientific numeric notation in this public JSON is legitimate: normalize carefully before exact price comparison; do not silently treat NaN/negative/unknown structures as valid. Validate all billable dimensions applicable to our text-only standard request; omit optional tools/media/cache-write/tier options. Preflight GET must have bounded full-body deadline and no authorization header; reject redirects for credentialed inference.
- https://deepinfra.com/zai-org/GLM-5.3-Flash lists regular USD 0.15/M input, 0.50/M output, 0.03/M cached input and temporary 50% discount.
- https://docs.deepinfra.com/chat/overview specifies https://api.deepinfra.com/v1/openai/chat/completions, max_tokens, stream, n default1, standard tier when service_tier unset.
- https://docs.deepinfra.com/chat/reasoning specifies reasoning_effort none disables reasoning, and reasoning tokens otherwise count as output billing.
- https://developers.cloudflare.com/ai-gateway/configuration/custom-providers/ specifies fixed account custom slug deepinfra with base_url https://api.deepinfra.com and caller route https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/custom-deepinfra/v1/openai/chat/completions. Optional cf-aig-authorization uses separate gateway token; never replace provider Authorization. Existing gateway default has gateway-level auth disabled.

## Tasks & Acceptance

- Implement provider registration, safe HTTP adapter and conservative metadata preflight in `src/pipeline/ai/gateway.ts` (or focused companion).
- Add exact GLM cost policy and env types; retain other providers and extend meaningful tests for every matrix row.
- Write `docs/deepinfra-runbook.md` with setup and real budget controls; no live success claim.
- Given configured DeepInfra, when real gateway.complete runs against fixtures, then persisted/public evidence and accounting reflect selected GLM and bounded estimated cost.
- Given a 100-cent shared period, when real gateway calls compete near the cap, then only affordable liabilities are dispatched and replay cannot duplicate calls.
- Given missing credentials or invalid policy/catalog, when selected, then no inference is sent.

## Spec Change Log

User change on 2026-10-04 explicitly supersedes the earlier 3.36 OpenRouter requirement and proposed USD 5 limit. This provider implementation is independently verifiable while operational 3.36 remains incomplete.

## Review Triage Log

## Verification

- Targeted provider/gateway/policy tests: all new matrix cases pass without skips.
- `npm test`: full regression suite passes.
- `npm run check` and `git diff --check`: pass.


### User credential-storage decision — 2026-10-04

Patrick requires Cloudflare Secrets Store as the project default. DeepInfra must support its asynchronous binding and fail closed on lookup errors without sending inference or exposing secret text. Prefer account secret with workers scope bound only to staging; preserve existing legacy secrets until migrated. This explicit user change supersedes the earlier per-Worker string-only assumption. Repository AGENTS.md records the default.

### 2026-10-04 — Review pass 1
- verdicts: 16 findings — high 0, medium 6, low 1, false 9, maybe-false 0
- findings:
  - `[medium]` `[bad_spec]` Blind: optional gateway token cannot use Secrets Store — new credential default applies to both credentials; add async resolution with sanitized failures.
  - `[medium]` `[bad_spec]` Blind: slow Store lookup retains false paid liability — central timeout races the adapter after claimDispatch; separate bounded free preparation from paid ownership.
  - `[low]` `[patch]` Blind: provider request ID discarded — receipt has an existing correlation field; preserve a bounded safe provider ID for reconciliation.
  - `[medium]` `[bad_spec]` Blind: returned model mismatch silently accepted — validate returned identity when supplied, keeping liability and no usable completion on mismatch.
  - `[false]` `[reject]` Blind: generic HTTP failure prevents route/status evidence — Cloudflare gateway logs supply operational status independently; adapter deliberately sanitizes error bodies. Live evidence remains required before 3.36 completion.
  - `[false]` `[reject]` Blind: inference-body late usage unverified — the unchanged central deadline wraps the entire provider promise and existing gateway.test.ts late uncancellable response cases assert retained above-bound usage and reconciliation. Adapter reads response.json inside that promise.
  - `[false]` `[reject]` Blind: shared uncertain liability unverified — existing gateway/accounting regression coverage exercises uncertain cross-Run accounting; the provider delegates to the unchanged same ledger and new campaign test covers exact 16-cent policy.
  - `[false]` `[reject]` Blind: temporary catalog source prevents reproduction — committed deterministic catalog fixture records all reviewed pricing fields and cost policy records dated rates/sources. No dependency on temporary file during build/deploy.
  - `[medium]` `[bad_spec]` Edge: Store timeout retains liability — same verified race as blind finding; prepare credentials before paid dispatch ownership.
  - `[medium]` `[bad_spec]` Edge: gateway Store binding throws trim — same new credential default defect; resolve both credentials asynchronously.
  - `[medium]` `[patch]` Gap: expiry during pending Store lookup lacks regression coverage — add real central gateway delayed-get expiry test proving zero liability and no inference.
  - `[false]` `[reject]` Intent: actual use versus availability — accurate pending operational work, not a claimed successful switch; parent must configure role selection and gather live evidence after code review/deploy.
  - `[false]` `[reject]` Intent: live credential versus interface — accurate test limit; deployed lookup verification remains a required parent acceptance step, not replaced by fixtures.
  - `[false]` `[reject]` Intent: real cap versus mechanism — remote D1 writes and read-back already verified 100-cent shared period and default; local tests do not purport to verify remote state. No silent budget reset is allowed.
  - `[false]` `[reject]` Intent: default versus enforcement — local strings and unchanged legacy credentials are compatible with a default; new gateway-token Store defect is separately accepted above.
  - `[false]` `[reject]` Intent: provider success versus fixtures — no live success is claimed; 3.36 stays incomplete until genuine provider acceptance.

### Review repair constraints — 2026-10-04

Trigger: timeout during asynchronous credential lookup can produce false paid liability; new optional gateway token fails with the mandated Store binding; returned model identity is not checked. Amend implementation design, leaving intent unchanged.

- Separate bounded, request-scoped free credential preparation from paid dispatch ownership. Resolve both DEEPINFRA_API_KEY and optional AI_GATEWAY_TOKEN as strings or async Store bindings, once per invocation; no cross-request credential cache or secret evidence. A hung/failed/blank lookup must complete with sanitized refusal and zero paid liability; never dispatch after timeout even if lookup later resolves. Revalidate policy after preparation and before paid inference.
- Use a focused optional provider preparation seam returning a request-scoped prepared provider or completion function; preserve existing providers and avoid sharing a prepared credential across concurrent calls. Do not expose credentials in reservation fingerprints, metadata, results, or thrown messages.
- Validate returned model when present equals requested model. Mismatch retains liability, records safe accounting issue, and gives no usable output. Preserve a bounded safe provider request ID through existing receipt support.
- Add real central gateway tests for hanging/late Store retrieval, both provider and gateway Store bindings and failure, expiry during lookup, concurrent preparation isolation, returned-model mismatch, and correlation ID.
- KEEP: exact GLM model, original policies untouched, 16-cent bound, catalog fail-closed validation and scientific decimal support, full-body deadlines, no retries/cache/reasoning, no direct inference, token-estimate semantics, real D1 shared 100-cent cap tests, all prior meaningful tests and runbook. Preserve parent-owned wrangler/AGENTS/epic/operational records. Change only original implementation-owned files plus a focused adapter module if required. No remote changes by implementation agent.

Parent verification after re-derivation: `npm test` passed 63 files / 1,471 tests; `npm run check` and `git diff --check` passed. Matrix audit: registry, exact request/public evidence, metadata refusal, invalid response/usage, shared-period concurrency/replay, expiry/unsupported policy all have passing cases in deepinfra.test.ts, plus request-scoped Secrets Store repair coverage.

### 2026-10-04 — Review pass 2
- verdicts: 16 findings — high 0, medium 6, low 1, false 8, maybe-false 1
- findings:
  - `[medium]` `[defer]` Blind: steering timeout can expire before sequential provider phases — pre-existing OpenRouter metadata plus inference already exceeds client deadline for two calls; recorded end-to-end timeout debt, with stable request replay preserving accounting.
  - `[medium]` `[patch]` Blind: invalid header characters consume false liability — construct bearer Headers during free preparation; regression must prove zero paid liability for either invalid credential.
  - `[false]` `[reject]` Blind: hardcoded catalog ceiling exceeds policy — current exact model policy is immutable and matches both adapter ceilings; no configured lower policy can reach this provider. Future policy edits require review, not an observed current under-reservation.
  - `[maybe-false]` `[defer]` Blind: unbounded catalog/parser resource consumption — fixed trusted catalog presently works; oversized remote body/decimal could exhaust resource budget but no such live response was demonstrated. Record resource-limit investigation; preflight incurs no paid liability.
  - `[medium]` `[patch]` Blind: non-2xx and invalid JSON branches lack distinct tests — add real gateway failure cases with conservative liability, safe errors and replay denial.
  - `[false]` `[reject]` Blind: compatible catalog changes untested — existing numeric fixture already exercises equivalent scientific decimals; lower rates use the same validated decimal comparison. Removal to unknown null discount is deliberately not accepted as a reviewed pricing structure; no demonstrated regression in supported metadata.
  - `[medium]` `[patch]` Blind: post-claim expiry of prepared completion lacks coverage — add controlled D1 claim boundary expiry, requiring proven refusal, release, and zero inference.
  - `[low]` `[patch]` Blind: runbook provisioning state stale — update to supplied Store key and already applied remote cap; retain clear deployment/live-acceptance pending state.
  - `[false]` `[reject]` Blind: adapter should be extracted — no named caller/invariant breaks from placement; a style preference alone does not establish harm and extraction adds change without user benefit.
  - `[medium]` `[patch]` Edge: invalid credential header retains liability — same proven defect and preparation-time header-validation patch as blind finding.
  - `[medium]` `[patch]` Gap: absent optional token lacks completion coverage — parameterize real completion/public evidence assertion to exercise actual staging configuration, not just registration.
  - `[false]` `[reject]` Intent: live selection not proved by local fixtures — carried; operational activation remains parent work after reviewed deployment, never claimed complete by these tests.
  - `[false]` `[reject]` Intent: live cap differs from fixture cap — carried; actual remote cap read-back separately confirmed 100 cents and zero current total; no live verification claim relies on a fixture.
  - `[false]` `[reject]` Intent: actual Store retrieval not proved — carried; dry deployment validates intended binding, genuine authenticated inference still required before acceptance completion.
  - `[false]` `[reject]` Intent: strings remain supported — carried; default allows local fixture strings and preserves legacy setup. Both newly added credentials now support Store.
  - `[false]` `[reject]` Intent: provider success not established — carried; 3.36 remains incomplete. No billing or live success claim is made.

Patch results: implementation agent applied all pass-2 patch groups: preparation-time header validation (both reviewer reports), actual absent-token settlement, HTTP error/JSON failure cases, post-claim policy expiry release, and current runbook provisioning state. Targeted affected tests passed 130 cases. Final parent full verification is running. No new public API was added by these patches.

## Auto Run Result

Implemented the selectable DeepInfra GLM provider, staging Secrets Store binding, request-scoped free credential preparation, safe header validation, and conservative real ledger/public estimate evidence. Existing Workers AI/OpenRouter policies and production remain unchanged. This provider implementation is done; operational Story 3.36 remains incomplete until deployed credentials and a real governed Run prove success.

Files changed:
- `src/pipeline/ai/gateway.ts`: provider preparation seam, DeepInfra adapter, catalog validation, safe credential/header handling, identity and correlation checks.
- `src/access-env.d.ts`: both new credential bindings support Secrets Store and local strings.
- `src/pipeline/ai/costPolicy.ts`: exact seven-day GLM policy and 16-cent bound.
- `src/pipeline/ai/costPolicy.test.ts`: schema boundary update.
- `src/pipeline/ai/deepinfra.test.ts`: real D1/API adapter matrix, $1 shared cap, replay/concurrency, failure and expiry tests.
- `wrangler.jsonc`: staging-only binding to supplied Store secret.
- `AGENTS.md`: explicit user Secrets Store default.
- `docs/deepinfra-runbook.md`: secure setup, actual preparation state, budget and acceptance limits.
- Planning epic, epic context, sprint status and 3.36 operational spec: user-authorized provider/budget/storage decisions and precise pending acceptance blockers.
- This spec: implementation contract, independent review evidence and disposition of every finding.

Review: four independent layers ran twice. Pass 1 triggered re-derivation with KEEP constraints; all accepted design defects were repaired. Pass 2 applied five patch groups (four medium, one low); every rejected finding and its evidence is recorded above. Two deferred entries remain: pre-existing end-to-end steering timeout envelope and unverified oversized catalog resource exhaustion. The complete deferred YAML list was parsed and validated.

Follow-up review recommendation: false. Although four medium patch groups were applied, their specific paths now have passing targeted/central integration tests; there is no named remaining unverified patch risk. This does not imply successful live-provider acceptance.

Final parent verification: `npm test` passed **1,477 tests / 63 files**; `npm run check` and `git diff --check` passed. Build and staging dry deploy passed before the final small patches; actual staging deploy must use the standard build/test/migrate/deploy script. Matrix audit passed all six rows, including real shared-period race and replay coverage. No test uses actual provider credentials or performs paid inference.

Residual operational work: merge required CI, deploy staging, select DeepInfra role configuration under existing $1 shared cap, complete Access setup only after the pending explicit approval, correct/verify the observed CourtListener query incompatibility, and gather genuine live Run/provider/accounting evidence. No legal content approval/publication is authorized here.
