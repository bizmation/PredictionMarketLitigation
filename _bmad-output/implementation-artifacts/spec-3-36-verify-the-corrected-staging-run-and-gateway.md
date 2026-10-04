---
title: '3.36 — Verify the corrected staging Run and gateway'
type: 'chore'
created: '2026-10-04'
status: 'blocked'
baseline_revision: 'bd388d2d7d0159891983404ec307689b1830feeb'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Merged corrective stories have local/native regression evidence, but no new deployment-specific Run and successful authenticated OpenRouter inference establishes operational acceptance.

**Approach:** Deploy the merged corrective revision to staging, verify deployment and production isolation, then execute one explicitly bounded, authenticated staging Run through real source collection and central gateway accounting. Record actual public Evidence and successful provider route/status; reuse a qualifying material Run for 3.37.

## Boundaries & Constraints

**Always:** Preserve the production brochure and deploy only with `npm run deploy:build`. Record the actual merged revision, Worker version, migrations, hosts and UTC time. Establish explicit spending authorization and a valid reviewed cost policy before paid inference. Use real admission, source configuration, reservation and settlement. Keep stable request identity on retry. Report missing credentials, policy incompatibility and unavailable providers as incomplete acceptance.

**Never:** Fabricate a Run or Draft, use a pre-deployment Run as acceptance, bypass authentication/admission/accounting, silently renew expired policy, weaken pricing checks, expose credentials or approve unknown legal content. No production deploy or 3.37 approval is implied.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Deployment | Merged corrective revision and passing CI | Staging version/migrations/hosts/time recorded; production unchanged | Retry transient platform error once; preserve exact blocker otherwise |
| Paid preflight | Authorized total cap, valid policy, configured provider | Bounded real gateway call eligible | No inference with missing authorization, credentials or rejected pricing |
| New Run | Authenticated stable manual request after deployment | Run freezes budget/config and real source receipts appear publicly | Preserve conflicts and uncertainty; no direct Workflow bypass |
| Gateway success | Material work routes to OpenRouter | Actual route/status, call identity, settled accounting and public Evidence | Unknown outcomes retain liability; no blind retry |
| No material result | Empty or failed collection | Truthful outcome, acceptance incomplete if gateway unexercised | Do not synthesize content to satisfy acceptance |

</intent-contract>

## Code Map

- `src/server.ts:417` — authenticated POST `/api/admin/runs`; stable origin/date/requestId dispatch through `startOperatorRun`. `src/shared/lib/access.ts` validates operator JWT; no staging bypass.
- `src/pipeline/workflow/dailyRun.ts:200` — admission and frozen Run configuration; do not create Workflow instances directly.
- `src/pipeline/ai/gateway.ts:665` — actual OpenRouter gateway route `/openrouter/chat/completions`, provider key, metadata preflight, provider pinning and central accounting. Current endpoint tiers fail the intentional nonempty-overrides guard.
- `src/pipeline/ai/costPolicy.ts` — policies expired 2026-10-03T14:01:49Z. Existing approved seven-day policy uses 2,048 output tokens, exact models and 500-cent default Run ceiling; renewal cannot silently authorize spending or unsupported price tiers.
- `src/shared/db/repos/roleModelsRepo.ts` — versioned roles in D1; no public config mutation endpoint. All live roles currently use Workers AI; OpenRouter must be deliberately selected before that provider can be exercised.
- `src/shared/db/repos/llmAccountingRepo.ts` — real reservation, period limits, settlement and uncertain liability; no staging period cap exists yet.
- `docs/deploy-runbook.md`, `wrangler.jsonc`, `package.json` — build/test/migrate/deploy staging process and isolated production domains.

## Tasks & Acceptance

**Execution:**
- `docs/deploy-runbook.md` and this spec — record actual deployment/preflight evidence and explicit blockers.
- `src/pipeline/ai/costPolicy.ts`, `src/pipeline/ai/gateway.ts` and relevant tests — after policy scope is authorized, prepare a supported bounded policy/provider compatibility change, verify it, merge with required CI, and deploy before use. Activating refreshed policy can re-enable cron inference and must be included in the approved cap.
- Staging Worker bindings and `gateway_config` / `llm_periods` — after authorization and secure key provisioning, apply explicit versioned provider selection and a cumulative acceptance cap before inference.
- Authenticated staging Run and public Evidence — record the actual successful route/status and settled accounting. Leave action 17 open until every canonical acceptance criterion is verified.

**Acceptance Criteria:**
- Given merged corrective code, when deployed by the staging process, then its exact revision/version/migrations/hosts are recorded and both production brochure hashes remain unchanged.
- Given an authorized bounded policy and configured credentials, when a new authenticated Run invokes OpenRouter through the central gateway, then real public Run/Evidence and settled accounting establish success with actual route/status evidence.
- Given a missing prerequisite or failed provider check, when acceptance is assessed, then this story and action 17 remain incomplete with precise remediation recorded.

## Spec Change Log

## Review Triage Log

## Verification

- `npm run deploy:build` — build, all tests, staging migrations and staging deploy succeed.
- Cloudflare deployment/settings/D1 read-only queries — verify version, bindings, migrations and frozen configuration without secret values.
- Public HTTP reads — verify staging APIs, anonymous admin denial and unchanged production hashes.
- Authorized live Run/gateway evidence — mandatory for completion, currently unavailable.


## Auto Run Result

Status: blocked. Blocking condition: paid-operation scope and credentials are unresolved; expired policy and live endpoint pricing are incompatible with the current provider guard. The spec cannot pass the ready-for-development gate for complete operational acceptance. No implementation/review completion or new successful Run is claimed.

### Completed evidence — 2026-10-04

- Merged revision `bd388d2d7d0159891983404ec307689b1830feeb`, required main CI [37223566338](https://github.com/bizmation/PredictionMarketLitigation/actions/runs/37223566338) passed.
- `npm run deploy:build` built and passed 1,419 tests/62 files. Initial migration query returned Cloudflare 7403 despite valid Wrangler OAuth; a retry succeeded with no pending migrations, then the full deployment process succeeded.
- Worker `pml-build` version `026234cd-6468-404f-a069-9517f31b16fe`, deployed 2026-10-04T19:01:40.282684Z, 100% traffic. Both `build.predictionmarketlitigation.com` and `ops-build.predictionmarketlitigation.com` remain attached. D1 has migrations 0001–0023; no new migration applied.
- Staging roots, public Runs and pipeline-config returned 200; anonymous `/api/admin/loop` returned 403.
- Production remains version `d894f294-d530-4f17-bb73-6b6d2db60845` with September 8 deployment. Both production roots return 200 and match before/after SHA-256 `bffcd5c604008e866cc2d71a0b9aa74478ba024167898f45fc910f3f0d41b270`.
- Latest observed Run `run-20261004-0000` began 16:02:06Z, status failed, budget 500 cents, spend zero. It predates this deployment and is not acceptance evidence. No new Run was triggered. Admission table was empty during preflight.

### Exact remaining blockers

1. No explicit spending authorization for this acceptance campaign. Live default Run ceiling is 500 cents, but no cumulative period cap exists. Proposed bounded scope for approval: at most USD 5 total across this acceptance exercise, enforced by a staging period cap, HITL mode, one real Run reused for 3.37 if material, no editorial approval. Define period and provider role before activation so cron inference is also bounded.
2. Staging Worker secret names omit `OPENROUTER_API_KEY`, `AI_GATEWAY_ID` and `CLOUDFLARE_ACCOUNT_ID`; the checked local `.env` and `.dev.vars` also contain none of those names. Account and gateway identifiers are known: `86e17509826e809459ca9f0725363c16`, gateway `default` (logs enabled, gateway-level authentication false). Provider key must be provisioned securely; no secret values were read or recorded.
3. All live role mappings use Workers AI. An explicitly versioned OpenRouter role selection is needed to exercise OpenRouter through the real gateway.
4. Both cost policies expired 2026-10-03T14:01:49Z. Current [OpenRouter endpoint metadata](https://openrouter.ai/api/v1/models/anthropic/claude-sonnet-4/endpoints) contains nonempty pricing overrides, which the current preflight intentionally rejects. A timestamp-only refresh will not resolve this. A reviewed bounded tier-aware policy/provider change is needed before activation; no guard was weakened.
5. Successful route/status remains unverified. [Cloudflare's provider documentation](https://developers.cloudflare.com/ai-gateway/usage/providers/openrouter/) still describes `/openrouter/chat/completions` but shows an inconsistent `/openrouter/v1/chat/completions` cURL example. The implemented route needs actual authenticated success through the central accounting path. No direct unaccounted provider probe was made.

Action 17 and Story 3.36 remain incomplete. Story 3.37 has not started. User budget/policy authorization and secure provider key provisioning are required to resume; no need to repeat completed deployment/isolation checks unless code/configuration changes.
