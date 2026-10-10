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


### User-approved course change — 2026-10-04

Patrick replaced the proposed USD 5 with **USD 1 total**, selected **DeepInfra instead of OpenRouter**, and selected exact model **zai-org/GLM-5.3-Flash**. These explicit instructions supersede the earlier OpenRouter requirement and unresolved budget question in this historical record. Canonical Story 3.36 is updated accordingly. The provider implementation is tracked in `spec-deepinfra-provider-option.md`; Patrick has provisioned the Secrets Store credential; operational acceptance still needs reviewed deployment and a real successful Run.

Remote preparation: created Cloudflare custom provider `deepinfra`, id `27c64ad9-669d-4549-9ecf-e951e19e2800`, fixed HTTPS base `https://api.deepinfra.com`. No credential is stored in that custom provider. Staging `llm_periods` now enforces 100 cents cumulatively from 2026-10-04T19:10:00Z through policy expiry 2026-10-11T19:10:00Z, period `acceptance-3-36-deepinfra-20261004`. Default Run ceiling reduced to 100 cents (config version 2). Prior total/reserved/uncertain balances were all zero. HITL mode remains enabled. No paid call or approval occurred. Future policy renewal beyond this window requires renewed authorization/cap; no silent budget reset is authorized.

### Credential and authentication update — 2026-10-04

Patrick supplied Secrets Store name `PML_DEEPINFRA_AI`, store `74197b544ea642c086a7d02133350a91`, secret metadata id `9f36204942d647bca41962fed5f7397d`. Workers scope was verified without reading the credential value. `env.build.secrets_store_secrets` binds it as `DEEPINFRA_API_KEY`; runtime deployment is pending review. Secrets Store is the project default for new credentials.

Read-only Access inspection found the existing PML application covers production apex admin paths only; neither staging host has an Access application. The staging browser shows Not signed in, and Worker-side authenticated APIs reject requests. A proposed separate staging app uses the same existing operator-only identity policy and 24-hour Cloudflare login, covering `/admin`, `/admin/*`, `/api/admin/*` on both staging hosts. Automatic approval review rejected creation because explicit authorization for this persistent access-control change was missing. The exact change has been submitted to Patrick for approval; no Access mutation occurred. Never bypass JWT verification or use direct Workflow creation to avoid this prerequisite.

Additional live-source prerequisite found during inspection: the historical Run `run-20261004-0000` records CourtListener HTTP 400 for every docket, with `unknown_params: [limit]`. Current `courtListener.ts:entriesUrl` still emits `limit=20`; this is a pre-existing connector incompatibility, not evidence about DeepInfra. Before claiming material acceptance, verify the documented v4 pagination parameter and correct this query with a connector regression check, then use a genuinely new governed Run. Source reference: https://wiki.free.law/c/courtlistener/help/api/rest/v4/query-refinement . No live provider request has occurred.

### Approved continuation — 2026-10-04

Patrick approved the previously rejected staging-only Access setup. The separate `PML staging admin` application was created successfully (`82e36406-471d-4762-8790-43e10a628fa8`) with the exact approved destinations, existing operator allowlist/identity provider and 24-hour session; staging `POLICY_AUD` was updated. Production Access was untouched. A browser visit now reaches Cloudflare sign-in. The user has been asked to sign in; no credentials were requested in chat and no authentication bypass was attempted.

PR #55 is merged as `ba287b318b3d5de32e063753b2191a779d2edae1`, with required CI passing. DeepInfra deployment `c3923450-afab-456c-8f25-b35d7dcb0b7d` passed 1,477 tests and had no pending migrations. Staging config version 3 selects `deepinfra / zai-org/GLM-5.3-Flash` for all five roles with default 100 cents; the shared 100-cent acceptance period remains intact with no paid call recorded at activation. Deployment and binding evidence is also recorded in https://github.com/bizmation/PredictionMarketLitigation/pull/55 .

CourtListener's historical live HTTP 400 identified `limit` as unsupported. The request now omits that obsolete parameter and follows documented v4 pagination links, retaining the existing five-page cap. A regression fixture reproduces the actual 400 response: it failed before the fix (zero drafts, failed collection) and must pass after correction with real D1 Draft and source Evidence persistence. Official reference: https://wiki.free.law/c/courtlistener/help/api/rest/v4/query-refinement . This fixture proves the correction path, not new live acceptance.

### Authenticated live attempt — 2026-10-04

Patrick signed in successfully. The verified operator used Run now once after PR #56 deployment (`3a6bd96c-8157-4a8b-af35-5e1f83e3445b`). Governed admission created `run-20261004-0002` at 21:26:34Z with the 100-cent Run limit. It failed at 21:26:42Z when CourtListener returned HTTP 429: `Rate limit exceeded: 5/min. Expected available in 59 seconds.` Public evidence: https://ops-build.predictionmarketlitigation.com/runs/run-20261004-0002 . No Drafts, LLM calls, or accounting operations were produced; spent, reserved, and uncertain balances were zero. Authentication is resolved; Story 3.36 remains incomplete pending source rate-limit handling and an actual successful governed DeepInfra call. No legal content was approved.

Live acceptance is blocked on 3.38 (CourtListener 429 pacing) merge and deploy. Do not start another paid staging Run until that code is on `pml-build`.

Patrick also requested an admin usability correction. The admin now presents separate draft-review, Run, and automation views, retaining the existing serif heading text/style and unsaved forms. Hidden queue shortcuts are disabled so keys on other views cannot approve a Draft. The latest Run links directly to its public evidence; the empty queue does not imply source success.

### Scope rulings (2026-10-10)

Patrick ruled on 2026-10-10, relayed by PML Eng Manager, so the Epic 3 retro has the scope.

**3.36.** A successful operator revise of an existing `run-20261010-0003` draft, made after the #63 deploy (DeepInfra preflight diagnostics and first-fetch window) to staging `pml-build`, counts as 3.36's live acceptance: a post-deployment Run with authenticated DeepInfra gateway success on `zai-org/GLM-5.3-Flash`. `run-20261010-0003` started after the 3.38 deploy (`5ee23f6`). Its original evaluation failed preflight with `cost_policy_invalid`. The 12:07 AM ET Oct 11 run is expected to draft nothing new, because 0003's drafts already mark those docket entries as seen.

**3.37.** That same revised `run-20261010-0003` draft may close 3.37 with the same Run. `epics.md` Story 3.37 already allows one Run to satisfy both 3.36 and 3.37 when it meets both sets of criteria. Patrick will read the draft text himself before it is approved, and the approval still needs his named go-ahead on that specific draft.

**Known gap.** Once the revised draft is approved, #64's batch reject refuses the Run (`reject_run_unpublished`), so closing 0003 needs a follow-up that rejects the remaining undecided heads. That follow-up is being built separately.
