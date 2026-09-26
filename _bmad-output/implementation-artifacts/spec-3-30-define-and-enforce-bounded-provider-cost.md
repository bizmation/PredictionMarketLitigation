---
title: '3.30 — Define and enforce bounded provider cost'
type: feature
created: '2026-09-26'
status: done
baseline_revision: 9bd8a25368446d838567718ef537960b609ca208
review_loop_iteration: 0
followup_review_recommended: false
context:
  - /home/patrick/GitHub/PredictionMarketLitigation/_bmad-output/implementation-artifacts/epic-3-context.md
warnings:
  - oversized
deferred:
  - summary: >-
      Concurrent reservations, timed-out-call liability and atomic settlement remain Story 3.31.
    evidence: |-
      Existing gateway admissions read spend before dispatch and write completed-call ledger and Run totals separately; timeout/error paths do not persist a reservation. The canonical approved story split explicitly assigns these existing issues to 3.31.
    location: >-
      src/pipeline/ai/gateway.ts
    severity: medium
---

<intent-contract>

## Intent

**Problem:** OpenRouter admission currently estimates only input, sends no output limit, and records a heuristic as cost. Workers AI records zero despite metered pricing. Neither provides the conservative, explainable per-request liability required by Story 3.30.

**Approach:** Replace these assumptions with a versioned, expiring provider/model cost policy, provider-enforced output caps, and separate bounded, estimated, and provider-reported amounts. Patrick approved the concrete policy below on 2026-09-26; implement it as the runtime contract.

## Boundaries & Constraints

**Always:** Preserve configured budgets and the 500-cent seed. Use integer cents for admission, exact decimal/rational arithmetic for rate conversion, and round upward once after summing billable dimensions. Fail closed before inference for missing, expired, unsupported, or invalid policy. Preserve configured role/model choices; never silently substitute a model. Mark incomplete provider usage and historical heuristic costs honestly in internal records, API, and UI.

**Never:** Increase a budget, invoke paid inference for testing, deploy, change live configuration, apply remote migrations, or declare the paid-budget corrective action closed. Atomic reservations, retry identity, uncertain-outcome reconciliation, period ceilings, and atomic ledger/Run settlement remain Story 3.31. A per-request bound alone is not a concurrent Run ceiling guarantee.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Supported Workers AI | Fresh seeded-model policy; sufficient remaining budget | Bound includes input and maximum output; send max_tokens=2048; record policy provenance | Typed refusal before inference if unsupported |
| Supported OpenRouter | Fresh exact-model policy; supported bounded route | Send output limit and supported price/routing constraints; no implicit model fallback | No unbounded fallback |
| Insufficient budget | Remaining cents less than conservative bound | No provider call; existing budget-stop behavior | Equality with bound is admissible if existing status rules permit |
| Unknown or stale pricing | Missing exact model, expired validity, unsupported billable dimension, malformed rates | No inference; configuration/policy error distinct from exhausted budget | No zero/one-cent fallback |
| Valid usage | Provider reports finite nonnegative usage/cost | Retain provider-reported amount separately from rate-derived estimate and bound | Integer-cent rounding has deterministic boundary tests |
| Missing/discrepant usage | Missing/invalid usage, tokens exceed policy cap, or reported cost exceeds bound | Preserve accounting uncertainty/anomaly; never report fabricated actual cost or clamp observed cost to bound | Fail closed for further inference on the affected Run; durable anomaly evidence |
| Historical calls | Existing heuristic or zero Workers AI rows | Preserve original values as legacy estimates; measured amount unknown | No historical rewrite into measured charges |
| Public projections | Mixed measured, estimated, and unknown calls | API and rendered Evidence/Run log distinguish all three; totals cannot imply all are actual charges | Missing measured data stays unknown |

</intent-contract>

## Approved Concrete Cost Policy

Approved policy version: `bounded-text-v1`. All five roles receive a **2,048-token output limit**. Requests remain text-only, one completion, no tools, plugins, explicit prompt-cache writes, reasoning mode, multimodal input, alternate models, or automatic provider fallbacks. Unsupported features fail closed. Disable proxy retries where documented controls allow; if one admitted attempt cannot be bounded, refuse it. This policy covers inference charges, excluding account top-up fees, taxes, hosting, and subscription charges.

Initial supported exact models:

| Provider/model | Input liability tokens | Output cap | Conservative USD per million input/output tokens | Per-call admission bound |
|---|---:|---:|---|---:|
| workersai / @cf/meta/llama-3.3-70b-instruct-fp8-fast | 24,000 | 2,048 | 0.293 / 2.253 | 2 cents |
| openrouter / anthropic/claude-sonnet-4 | 200,000 | 2,048 | 6.00 / 15.00 | 124 cents |

These are support entries, not changes to the configured role map. Other exact models, including `openrouter/auto`, are refused until a reviewed policy entry is added. Workers AI's free allowance must not be assumed available. Sonnet's input liability uses the highest documented cache-write rate ($6/M), conservatively covering normal input, cache reads, and cache writes; normal input is currently $3/M. The quoted cache-write rates are per-token replacement rates, not an additional charge on top of normal input; if an endpoint instead bills additive dimensions, the policy must sum them or refuse that endpoint. Use provider price ceilings for normal input/output and require supported parameters. Validate any other billable dimensions against the allowed request shape; reject unknown positive charges. Endpoint pricing/support must be verified before implementing the OpenRouter adapter; inability to enforce the reviewed dimensions must refuse inference, not relax the bound.

Use the documented whole context window as the input liability allowance, including prompt formatting overhead; do not use characters/4 as a token bound. This deliberately over-reserves relative to most prompts. Providers must reject requests exceeding the supported context; do not truncate silently or enable extended-context tiers. Round `100 × (inputBound × inputRate + outputCap × outputRate) / 1,000,000` upward. Workers example: 1.1646144 cents → 2. Sonnet example: 123.072 cents → 124. Thus a Run with 123 cents remaining refuses Sonnet even if its short prompt would probably cost far less.

Each policy entry records source URLs, verification time, supported context/cap, exact rates/units, policy version, and `validUntil = verifiedAt + 7 days`. At or after expiry, fail closed until an explicit reviewed refresh. A future-dated verification time is invalid. Refreshing a timestamp without checking the rates is forbidden. Seven-day freshness is an operational proposal, not a provider price guarantee; OpenRouter request price ceilings additionally constrain routing. No silent automatic price increases or budget increases.

Persist the admission bound and policy snapshot with the call. Provider-reported charge is nullable and carries its source. A token-rate calculation is an **estimate**, even when based on measured tokens; Workers AI cannot be labeled a measured invoice charge from token counts alone. Legacy `costCents` must retain a documented accounting meaning and explicit basis, with separate nullable provider-reported cost. Budget accounting uses a conservative amount when usage is incomplete; never release liability by inventing zero. Story 3.31 will provide durable pre-call reservations and reconcile failed/uncertain attempts atomically.

Approved tradeoffs: 2,048 tokens can truncate long draft JSON; a seven-day expiration can stop Runs pending a pricing refresh; whole-context admission can refuse otherwise inexpensive calls. Alternatives (different output caps, longer price validity, model-specific tokenizer bounds) lead to observably different outcomes and are not selected by prior planning.

## Code Map

- `src/pipeline/ai/gateway.ts` — LlmProvider optional estimate, complete admission, provider factories; Workers AI cost=0 and OpenRouter input-only estimate/usage heuristic must be replaced.
- `src/pipeline/config/modelRoles.ts`, `src/shared/db/repos/roleModelsRepo.ts`, `migrations/0017_gateway_seed_runs_index.sql` — role resolution and immutable-budget continuity. No historical seed edit required.
- `src/shared/schemas/gateway.ts`, `src/shared/db/repos/llmCallsRepo.ts` — strict call schema, inserts, listByRun, SUM(cost_cents); add explicit monetary basis/provenance.
- `src/shared/schemas/run.ts`, `src/shared/db/repos/runsRepo.ts` — Run totals and Evidence contract; don't label mixed accounting totals as measured spend.
- `src/shared/api/publicRouter.ts`, `src/server.ts` — public Run/Evidence projection and operator steering errors.
- `src/surfaces/ops/EvidenceDetail.tsx`, `src/surfaces/ops/RunLog.tsx`, `src/surfaces/admin/LoopControls.tsx` — rendered cost and budget surfaces.
- `src/pipeline/ai/gateway.test.ts` — real D1 tests with injected providers/fetch; update fixtures to require a bound rather than optional estimates.
- `src/shared/api/publicApi.test.ts`, `src/server.test.ts`, `src/surfaces/ops/evidenceDetail.mount.test.tsx`, `src/surfaces/ops/runLog.test.tsx` — outer API and UI assertions.

## Tasks & Acceptance

**Execution:**
1. `src/pipeline/ai/costPolicy.ts` (new), `src/pipeline/ai/costPolicy.test.ts` (new) — implement the reviewed allowlist, decimal arithmetic, bounds, provenance/expiry validation, and deterministic policy tests.
2. `migrations/0020_provider_cost_policy.sql` (new), `src/shared/schemas/gateway.ts`, `src/shared/db/repos/llmCallsRepo.ts` — persist bound, monetary basis, nullable reported cost, and policy snapshot; classify legacy rows without fabricating charges. Keep migration compatible with D1 batch execution.
3. `src/pipeline/ai/gateway.ts` — require validated bounds, enforce remaining-budget admission and provider caps/routing, validate response usage, retain anomaly/unknown states. Remove heuristic admission and zero-dollar assumptions.
4. `src/shared/schemas/run.ts`, `src/shared/db/repos/runsRepo.ts`, `src/shared/api/publicRouter.ts`, `src/server.ts` — expose measured/estimated/unknown accounting consistently and safe typed refusal messages.
5. `src/surfaces/ops/EvidenceDetail.tsx`, `src/surfaces/ops/RunLog.tsx`, `src/surfaces/admin/LoopControls.tsx` — label bound/accounting estimates/provider-reported charges accurately without new pages.
6. `src/pipeline/ai/gateway.test.ts`, `src/shared/api/publicApi.test.ts`, `src/server.test.ts`, relevant existing surface tests — cover every matrix row, provider request payloads, expiry boundaries, maximum output, cent rounding, insufficient budget, and discrepant usage; use deterministic fakes, no paid calls.

**Acceptance Criteria:**
- Given a supported fresh policy, when an eligible Run requests completion, then the actual provider request carries the reviewed cap and admission includes every supported billable dimension.
- Given unsupported or expired pricing or insufficient remaining budget, when inference is requested, then the gateway refuses before any provider invocation and the caller receives the appropriate typed failure.
- Given measured, estimated, legacy, and missing amounts, when public Evidence and Run log are requested and rendered, then their labels and values preserve these distinctions end to end.
- Given usage exceeding the bound, when response handling completes, then the discrepancy remains visible and further inference is refused; no recorded charge is clipped to conceal it.
- Given the existing 500-cent seed, when migrations and tests run, then the ceiling remains 500 and no tests enlarge it merely to admit requests.

## Spec Change Log

## Review Triage Log

### 2026-09-26 — Review pass

- verdicts: 19 findings — high 0, medium 10, low 4, false 4, maybe-false 1
- findings:
  - `[medium]` `[patch]` Blind 1: non-text successful responses lose usage — Both adapters throw before complete records usage; retain usage and mark non-text output as an accounting issue.
  - `[medium]` `[patch]` Blind 2: rounded reported totals imply exact charges — Both aggregate branches sum upward-rounded per-call cents. Explicitly label rounding without inventing invoice precision.
  - `[low]` `[patch]` Blind 3: new monetary fields bypass UI guards — Existing hand-written guards validate old monetary fields only; extend them to the newly rendered optional fields.
  - `[medium]` `[patch]` Blind 4: policy may expire during metadata lookup — The asynchronous GET occurs after validation and before paid POST; revalidate at dispatch using the injected clock.
  - `[maybe-false]` `[reject]` Blind 5: future pricing refresh can diverge from routing ceilings — Current separate ceilings intentionally enforce $3/M normal input while the approved liability uses $6/M cache-write input. No current mismatch exists. A future edited policy with inconsistent controls would establish the claim; hypothetical low-impact maintainability changes do not justify new configuration fields now.
  - `[low]` `[patch]` Blind 6: raw accounting identifiers reach readers — Translate known persisted basis and issue values into readable labels.
  - `[low]` `[patch]` Blind 7: persisted bound provenance is absent from rendered Evidence — Render existing policy version, validity dates, and source URLs for inspection.
  - `[low]` `[patch]` Blind 8: unknown aggregate omits missing-charge count — Render existing unmeasuredCallCount beside unknown totals.
  - `[medium]` `[patch]` Blind 9: migration backfill lacks a pre-migration regression — The current test inserts after migrations; add an upgrade test with pre-existing zero and nonzero rows.
  - `[medium]` `[patch]` Blind 10: new Loop Controls and positive Run Log totals lack fetch coverage — Add fetched known/mixed/invalid-total assertions while updating labels/guards.
  - `[false]` `[reject]` Intent 1: live billing is not established by local tests — True evidentiary limitation, not deviation: approved intent forbids paid tests/deployment; provider docs and deterministic request tests are the authorized verification.
  - `[false]` `[reject]` Intent 2: current Sonnet tier metadata causes refusal — Approved policy explicitly requires refusal when billing dimensions cannot be bounded. Runtime refusal implements that requirement and is disclosed.
  - `[medium]` `[defer]` Intent 3: whole-Run concurrency and uncertain-attempt accounting remain incomplete — Existing separate writes and unrecorded timed-out attempts predate this change; canonical Story 3.31 explicitly owns reservations, retries and atomic reconciliation.
  - `[false]` `[reject]` Intent 4: layer tests do not combine provider-to-browser in one test — Required outer API and UI surfaces are asserted with matching wire contracts and independent persistence tests; no failing handoff was identified. One monolithic test is not required by the approved intent.
  - `[false]` `[reject]` Intent 5: source diff does not prove automation completion — Review occurs before finalization by workflow design; commit/PR/merge evidence is recorded after verification, not fabricated in an in-review diff.
  - `[medium]` `[patch]` Edge 1: non-text output bypasses durable accounting — Same demonstrated adapter exception as Blind 1; shared patch.
  - `[medium]` `[patch]` Edge 2: per-call ceiling inflates an unqualified reported total — Same aggregate semantics as Blind 2; shared label/documentation correction.
  - `[medium]` `[patch]` Gap 1: regional endpoint safety can regress — Singleton fixtures cannot distinguish every from some; add mixed regional/base endpoint regression.
  - `[medium]` `[patch]` Gap 2: fully reported aggregate has no positive assertion — Existing public tests exercise only null totals; add distinct two-call sum assertions for detail and list.

All four layers completed. Edge and verification-gap initial reads failed on the host bubblewrap error; they were rerun successfully using the working execution mode. The verification-gap retry waited for reviewer capacity. No layer was skipped. All patch entries were applied and verified as recorded below.

## Design Notes

Primary documentation checked 2026-09-26 (refresh at implementation; these are observed rates, not a claim about an undisclosed provider effective date):

- [Workers AI seeded model](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/): context, token rates, and max_tokens.
- [Cloudflare pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/): paid metering/free allowance.
- [Sonnet 4](https://openrouter.ai/anthropic/claude-sonnet-4): input/output/cache rates and context.
- [OpenRouter routing](https://openrouter.ai/docs/guides/routing/provider-selection): price ceilings, required parameters, restricted providers/fallbacks.
- [OpenRouter usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting): usage.cost and native token counts.
- [OpenRouter parameters](https://openrouter.ai/docs/api_reference/parameters): request controls.

Baseline: `9bd8a25368446d838567718ef537960b609ca208` (merged Story 3.29). No runtime changes or paid calls made during planning.

## Verification

After implementation: `npm test`, `npm run check`, `git diff --check`. Require passing real-D1 gateway tests plus API and mounted UI cost-label assertions. Verify migration defaults classify historical values as estimates. Inspect provider request fixtures for enforced output limits and routing bounds. A test passing against mocks does not verify live billing or authorize inference.

## Auto Run Result

Status: blocked. Blocking condition: intent gap — concrete cost-policy review is reserved to Patrick and not yet recorded.

Planning completed: gateway/accounting investigation, primary provider documentation, proposed limits and arithmetic, affected surfaces, implementation tasks, and deterministic validation plan. The proposal is reviewable but not ready for development until the reserved policy choice is resolved.

Decision requested: approve `bounded-text-v1` as proposed (2,048 output tokens, seven-day price validity, whole-context liability, exact-model support/fail-closed behavior, unchanged budgets, explicit accounting labels), or specify changes.

Evidence: Story 3.30 in the approved sprint change proposal explicitly says “Patrick reviews the concrete cost policy as part of this story's spec.” The prior retrospective left output/cost policy unresolved. No approved cap, freshness interval, or conservative input method was found. BMAD Build Auto step-02 instruction 5 requires an intent-gap halt when defensible alternatives produce different outcomes; it does not permit the agent to silently select one. No implementation, review completion, tests, commit, or merge is claimed.

### Approved continuation — 2026-09-26

Patrick replied “approve” to the concrete policy. The intent gap is resolved; continue implementation, review, verification, commit, push, PR, and merge under the standing authorization. The earlier blocked result is historical.


### Implementation evidence — 2026-09-26

Implemented `bounded-text-v1` with exact rational conversions, the reviewed 2/124-cent bounds, 2,048-token caps, seven-day validity, and explicit policy snapshots. Migration 0020 adds monetary basis, bounds, estimates, nullable reported cents, original reported USD, provenance, and durable accounting issues. Existing ledger values remain legacy estimates, including zero Workers AI rows. The Run budget seed remains 500 cents.

Endpoint metadata was refreshed from `https://openrouter.ai/api/v1/models/anthropic/claude-sonnet-4/endpoints`. The listed Amazon Bedrock routes advertise a 200,000-token context and higher-price overrides beginning at 200,000 prompt tokens, including $22.50/M output and $12/M one-hour cache writes. The adapter refuses advertised tier overrides because this implementation cannot prove that their activation is prevented by routing controls. It preserves the approved 124-cent bound and configured role/model mapping. A route with the reviewed context, parameters, and prices and no unsupported tier overrides is accepted; deterministic fixtures exercise that path. Every eligible regional variant of the restricted base route is checked. Runtime metadata checks do not refresh the reviewed policy timestamps. This fail-closed behavior can currently make configured Sonnet Runs unavailable pending a reviewed route/policy solution.

The supported OpenRouter request pins Amazon Bedrock, disables provider fallbacks, requires parameter support, enforces normal prompt/completion price ceilings, disables transforms and gateway cache reuse, and sets `cf-aig-max-attempts: 1`. Cloudflare's request-handling documentation confirms that per-request attempts control for provider endpoints. Unknown or incomplete successful-response usage retains at least the admitted liability, records a durable issue, and prevents further inference on the Run. Observed reported charges are never clipped; original USD is retained alongside upward-rounded accounting cents.

Public Evidence, Run log, and Loop Controls label budget accounting separately from estimates and provider-reported amounts. Mixed or missing reported totals stay unknown. Safe policy/accounting refusals reach the operator steering API.

Verification: full `npm test` passed 51 files / 1,179 tests; `npm run check` and `git diff --check` passed. Final focused gateway/policy verification passed 2 files / 70 tests, including the additional provider-factory/non-text regressions; the final `npm run check` and `git diff --check` also passed. Tests use local D1 and deterministic provider/fetch fixtures; no paid inference, deployment, live configuration changes, remote migration, or budget increase was performed. Story 3.31's reservations, retry identity, uncertain-attempt reconciliation, period ceilings, and atomic ledger/Run settlement remain outstanding; this implementation does not close paid-budget operational acceptance.


### Final result — 2026-09-26

Status: done. Approved policy implemented and all four review layers completed. Eleven unique patch groups (seven medium, four low) resolved thirteen reported findings; the two duplicated adapter/rounding reports share their fixes. One pre-existing medium accounting follow-up remains explicitly assigned to 3.31. Five rejected reports and their reasons are recorded individually above. No specific unverified risk remains from the patches, so followup_review_recommended is false.

Parent verification: full `npm test` passed 53 files / 1,210 tests; `npm run check` passed formatting, lint, and TypeScript; `git diff --check` passed. A final direct-adapter test clock was pinned to the verified policy interval so the regression will not depend on wall-clock policy expiration; focused gateway verification and static checks were rerun after that correction.

Matrix audit (all covering tests ran and passed):
- Supported Workers AI / maximum output / equality: gateway “uses the full context and output cap; equality is admitted; no free allowance”.
- Supported OpenRouter: gateway “enforces Sonnet routing, price ceilings, max tokens and one gateway attempt”.
- Insufficient budget: gateway Workers refusal and Sonnet 123-cent refusal tests.
- Unknown/stale/invalid pricing: costPolicy malformed/expiry cases; gateway exact-expiry, expiry-during-metadata, unknown model, unsupported charges, and unsafe regional route cases.
- Valid usage/rounding: costPolicy exact rounding, gateway provider-reported versus estimated values, and API fractional reported-charge aggregation.
- Missing/discrepant usage: gateway missing usage, invalid/excessive charges, token overrun, and both providers' non-text-output tests retain records and block repeat inference.
- Historical calls: real-D1 providerCostMigration test runs migration 0020 over the actual prior table definition with zero/nonzero rows, verifying unchanged values and unknown reported charges.
- Public projections: publicApi mixed and fully reported list/detail assertions; mounted fetched accounting tests for Evidence, Run Log, and Loop Controls, including invalid monetary fields, provenance, rounded labels, and missing-charge counts.

Residual limits: policy expires 2026-10-03T14:01:49.000Z and requires a reviewed price refresh. Current Sonnet endpoint tiers fail closed under the approved 124-cent policy; no live billing success is claimed. Output truncation at 2,048 tokens is an approved tradeoff. Story 3.31 still owns concurrency, uncertain attempts, retries, and atomic settlement. No deployment, paid inference, remote migration, or live configuration change occurred.

Files changed:
- `_bmad-output/implementation-artifacts/spec-3-30-define-and-enforce-bounded-provider-cost.md` — Approved policy, implementation evidence, complete review triage, and verification.
- `migrations/0020_provider_cost_policy.sql` — Add cost provenance and legacy-preserving accounting columns.
- `src/pipeline/agents/draftAndReview.test.ts` — Deterministic regressions and compatible provider/accounting fixtures.
- `src/pipeline/ai/actionPolicy.test.ts` — Deterministic regressions and compatible provider/accounting fixtures.
- `src/pipeline/ai/costPolicy.test.ts` — Deterministic regressions and compatible provider/accounting fixtures.
- `src/pipeline/ai/costPolicy.ts` — Exact arithmetic, reviewed policies, seven-day freshness and rate validation.
- `src/pipeline/ai/gateway.test.ts` — Deterministic regressions and compatible provider/accounting fixtures.
- `src/pipeline/ai/gateway.ts` — Enforce bounds/caps/routes and retain usage anomalies.
- `src/pipeline/projector/evidence.test.ts` — Deterministic regressions and compatible provider/accounting fixtures.
- `src/pipeline/steering/submitTurn.test.ts` — Deterministic regressions and compatible provider/accounting fixtures.
- `src/pipeline/steering/submitTurn.ts` — Propagate public accounting projections or safe typed operator refusals.
- `src/pipeline/workflow/dailyRun.test.ts` — Deterministic regressions and compatible provider/accounting fixtures.
- `src/pipeline/workflow/gatewaySeed.test.ts` — Deterministic regressions and compatible provider/accounting fixtures.
- `src/server.test.ts` — Deterministic regressions and compatible provider/accounting fixtures.
- `src/server.ts` — Propagate public accounting projections or safe typed operator refusals.
- `src/shared/api/adminApi.test.ts` — Deterministic regressions and compatible provider/accounting fixtures.
- `src/shared/api/publicApi.test.ts` — Deterministic regressions and compatible provider/accounting fixtures.
- `src/shared/api/publicRouter.ts` — Propagate public accounting projections or safe typed operator refusals.
- `src/shared/db/repos/llmCallsRepo.ts` — Persist and project call accounting, policy and uncertainty.
- `src/shared/db/repos/providerCostMigration.test.ts` — Deterministic regressions and compatible provider/accounting fixtures.
- `src/shared/db/repos/runsRepo.ts` — Persist and project call accounting, policy and uncertainty.
- `src/shared/schemas/gateway.ts` — Enforce bounds/caps/routes and retain usage anomalies.
- `src/shared/schemas/run.ts` — Explicit accounting basis, reports and failure contracts.
- `src/surfaces/admin/LoopControls.tsx` — Honest accounting labels, provenance, missing-charge counts and response validation.
- `src/surfaces/ops/EvidenceDetail.tsx` — Honest accounting labels, provenance, missing-charge counts and response validation.
- `src/surfaces/ops/RunLog.tsx` — Honest accounting labels, provenance, missing-charge counts and response validation.
- `src/surfaces/ops/accounting.mount.test.tsx` — Deterministic regressions and compatible provider/accounting fixtures.
- `src/surfaces/ops/evidenceDetail.mount.test.tsx` — Deterministic regressions and compatible provider/accounting fixtures.
- `src/surfaces/ops/evidenceDetail.test.tsx` — Deterministic regressions and compatible provider/accounting fixtures.
- `src/surfaces/ops/runLog.test.tsx` — Deterministic regressions and compatible provider/accounting fixtures.
- `src/test/costPolicyFixture.ts` — Explicit synthetic policy for integration-test providers.


### Remote verification

Implementation commit: `b2e45cd2c4f0cf0acdc032b54ad283727627c3f1`.
PR: https://github.com/bizmation/PredictionMarketLitigation/pull/46.
Required CI passed: https://github.com/bizmation/PredictionMarketLitigation/actions/runs/36248114402 (formatting, lint, TypeScript and real Worker/D1 tests). Final documentation records this evidence and updates cached epic context; the PR must also pass its resulting head check before merge.
