# Epic 3 Context: Governed Daily Loop (Pipeline → Gate → Live)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Close the daily source → Draft → Approval Gate → canonical tracker → public Evidence loop. Patrick operates it with HITL by default and bounded optional autonomy; anyone can inspect its work. Stories 3.1–3.33 are complete, including canonical planning reconciliation, connector credential boundaries, evaluation readiness/sealing, atomic publication, bounded provider cost, atomic paid-call accounting and durable package/config recovery, but operational acceptance remains rejected. The corrective backlog reopens the epic until safety regressions and a real governed staging publication demonstrate acceptance.

## Stories

- Story 3.1: Run, Draft & Evidence Data Model
- Story 3.2: AI Gateway, Budget Envelope & Role→Model Config
- Story 3.3: Daily Run Workflow & Empty Runs
- Story 3.4: Source Monitoring & Draft Packaging
- Story 3.5: Drafter, Reviewer & Disagreement Flag
- Story 3.6: Guardrails, Action Policy & Scoped Context (Enforcement Layer)
- Story 3.7: Public ops. Run Log
- Story 3.8: Evidence Detail Projection
- Story 3.9: Public Pending Drafts (Not Live)
- Story 3.10: Admin HITL Approval Queue
- Story 3.11: Publish to Live F1 with Provenance & Diffs
- Story 3.12: Operator Loop Controls
- Story 3.13: Autonomous Mode, YOLO Bounds & Mode Transparency
- Story 3.14: Steering Channel Foundation, Action Policy & Evidence
- Story 3.15: Draft Interrogation (Read-Only)
- Story 3.16: Conversational Draft Revision
- Story 3.17: Conversational Pipeline Steering
- Story 3.18: Standing Corrections & Durable Guidance
- Story 3.19: Epic 3 Hardening — Timeouts, Gateway Seed & Deferred Closure
- Story 3.20: OpenRouter Provider via AI Gateway
- Story 3.21: First Live Connector
- Story 3.22: Staging ops host (`ops-build`)
- Story 3.23: Fail a total CourtListener outage
- Story 3.24: Retire “pipeline is not live” copy
- Story 3.25: Stamp the budget ceiling onto each new Run
- Story 3.26: Reconcile canonical Epic 3 planning
- Story 3.27: Constrain connector pagination credentials
- Story 3.28: Enforce evaluation readiness and sealed Drafts
- Story 3.29: Make publication and Run finalization atomic
- Story 3.30: Define and enforce bounded provider cost
- Story 3.31: Reserve and settle paid calls atomically
- Story 3.32: Recover durable packages and pin consumed configuration
- Story 3.33: Make Run admission and dispatch failures explicit
- Story 3.34: Test the executing DailyRunWorkflow
- Story 3.35: Drive apex pending copy from public Draft data
- Story 3.36: Verify the corrected staging Run and gateway
- Story 3.37: Prove the live governed loop and reassess Epic 3

## Requirements & Constraints

- Canonical F1 changes only through the Approval Gate. Agents, including the steward, never receive a direct publish tool. Human edits preserve the original and public diff; approval identity and provenance freeze at publication.
- Attempt a daily noon-ET Run with an explicit DST rule. Preserve manual/catch-up history, empty days, partial failures, total-source failure, and budget stops. Empty means no material work, not failed collection. Sequential Runs per date remain allowed; competing origins share atomic active-date admission.
- Server-side evaluation readiness must distinguish processing, completed evaluation, and explicit completed `evals_not_run` with a reason. Null or uncertain outcomes cannot imply completion; classify legacy rows from existing evidence without inventing evaluations. Completed explicit not-run remains human-reviewable; autonomous approval excludes it, Tier-2-only evidence, failed/low confidence, party characterization, and posture changes. Evaluator writes target only eligible undecided Drafts; a decision seals the artifact against later mutation.
- Publication atomically checks eligibility, latest revision, and expected prior field values. Conflicts abort the entire write and receipt set. Concurrent sibling decisions finalize the Run; retries cannot duplicate publication.
- All model calls use the central gateway. Preserve the configured 500-cent seed and each Run's frozen ceiling. Paid admission requires a conservative provider-enforced bound and atomic reservation against Run/period limits. Settle idempotently against authoritative accounting; unknown outcomes retain liability until reconciliation. Estimated/reserved amounts are not actual charges.
- Steering supports interrogation, revision, versioned pipeline configuration, and capped/revocable guidance. Budgets, mode, thresholds, guardrails, and tool policy remain outside chat mutation. Influential turns leave public causation; private content never hides actor, time, or effect. Guidance is advisory authorized context, never a policy override.
- Published claims require primary-source support or explicit pending-primary attribution. Tier-2-only evidence cannot authorize autonomous publication.
- Public Evidence supports a thin exportable review bundle (FR26); private provider logs cannot replace that public record.
- Public evidence links sources, models/configuration, tools, revisions, evaluations, spend, and decisions without credentials. Source credentials accompany only validated HTTPS API-origin requests, including pagination and redirects.
- Acceptance requires targeted regressions, review, required CI, merged changes, and staging lineage from a real material source through named approval to F1. Planning approval does not authorize unspecified paid calls or approval of unknown content.

## Technical Decisions

- Retain Cloudflare Workers, Agents, Workflows, D1, and AI Gateway with configurable role→model routing and OpenRouter support. D1 owns canonical structured truth; durable orchestration preserves Run identity across interruption and approval waits.
- Replay recovers this Run's persisted package before deciding empty/material status, avoids duplicate paid work, and consumes pinned source configuration matching receipts. Distinguish dispatch errors from confirmed duplicate instances and record failures durably.
- Validate concrete transaction/schema mechanisms against actual platform capabilities. Test the real Workflow entrypoint and database persistence with deterministic external effects, including checkpoint loss and concurrency; helper-only coverage is insufficient.
- Recorded steering decisions: `poll_sources` is the sole chat-writable config key; source-tier changes do not alter FR17 reason codes. Guidance is capped at 12 active items / 600 characters each, injected into the drafter only. J/K/A/E/R are preserved with the inline panel; no new hotkey is implied.
- Timeout policy: GET 15 seconds, general admin POST 30 seconds, connector/provider 60 seconds. Patrick’s approved 3.19 exception gives the steering composer `2 × provider + 10s` (130 seconds).
- Authoritative tokens are `awaiting`, `stopped`, and `run.stopped`; the stopped chip reads budget-stopped. Use integer cents and explicit missing/not-run states.
- Staging uses `pml-build` with its D1 on `build.predictionmarketlitigation.com` and `ops-build.predictionmarketlitigation.com`. Production apex/ops stay on `pml` with brochure behavior preserved. Only the staging deployment process applies; do not run `npm run deploy`.

## UX & Interaction Patterns

- Run log, Evidence, full pending Drafts, and steering receipts are public. Pending content has conspicuous not-live treatment; authenticated actions remain separate. Show empty, failed, stopped, and missing-record states honestly.
- Preserve keyboard review, accessible feedback, and original-versus-edited review. Processing disables decisions; stale/superseded conflicts explain refresh and preserve unsent edits. Pending count and band share a data contract with loading/error/stale states that never assert false zero.
- The steering composer is private; completed turns publish immediately without another publishing step or token streaming. Choose privacy/redaction at submit and explain this beside the action. Private turns retain causal placeholders. No intervention is a normal empty state.

## Cross-Story Dependencies

- Epic 2 supplies canonical F1 entities. Foundation, gateway, orchestration, evaluation, and gate underpin public/operator surfaces. Approved steering and hardening stories 3.14–3.21 now have canonical entries in epics.md; F9/FR46–50 and UX B8/C4 are reconciled by 3.26.
- Historical staging sequence was 3.23–3.25 before the 3.22 deployment; all are complete. The September 24 corrective plan controls the next staging deployment. R13 delayed-arrival policy and R14 failed-revision recovery remain deferred.
- Corrective order: 3.26 planning is complete; 3.27 connector boundary is complete; 3.28 readiness and 3.29 atomic publication are complete; 3.30 bounded cost is complete (PR #46); 3.31 reservation/accounting is complete (PR #47); 3.32 replay/config and 3.33 admission/dispatch are complete; 3.34 native executing-Workflow coverage and 3.35 live pending count are complete (PR #54 and PR #53). Next is 3.36 staging gateway verification, followed by 3.37 live acceptance.
- All 3.26–3.35 must merge with required CI before 3.36 staging gateway verification. Then 3.37 proves material publication and reruns the retrospective. Reuse one qualifying Run rather than duplicate paid work. Epic 4 waits for 3.37 and accepted Epic 3 evidence; planning completion closes no runtime acceptance gap.


## Story 3.30 handoff — 2026-09-26

Patrick approved bounded-text-v1: 2,048 output tokens, seven-day pricing validity, exact-model support, conservative 2-cent Workers AI / 124-cent Sonnet admission bounds, and unchanged 500-cent seed. PR #46 implements per-request bounds and explicit estimated/reported/unknown accounting. The current Sonnet endpoint tier metadata is refused rather than exceeding the approved policy; policy expires 2026-10-03T14:01:49.000Z and requires reviewed refresh. Required implementation CI 36248114402 passed. No deployment or paid inference occurred. The shared paid-budget corrective action remains open for 3.31's concurrent reservations, uncertain attempts, retry identity and atomic settlement.


## Story 3.31 handoff — 2026-10-02

PR #47 implements atomic bounded reservations and dispatch checks against Run/all configured period caps, stable Draft/steering retry identity, private result recovery, uncertain/late liability, idempotent settlement and authenticated evidence-backed reconciliation. Migration 0021 preserves legacy balances/provenance and seeds no period. Public/operator totals share one authority. Implementation 6d9e8bf3e299efc1fa56de3cca954ad19380205e passed CI 37024712148; local verification passed 1,267 tests in 55 files plus checks. The shared 3.30/3.31 paid-budget corrective action is closed on implementation evidence. No deployment or paid inference occurred. Late evidence capture depends on a living worker and available D1; retained liabilities never permit blind replay. The spec defers one unverified query-scalability concern for representative-history measurement. Existing pricing expires 2026-10-03T14:01:49.000Z and was not refreshed. Next corrective implementation is 3.32; Epic 3 operational acceptance remains rejected until 3.37.


## Story 3.32 handoff — 2026-10-03

PR #48 (implementation b899dba64908f84c74afd51881995c3209a4aeb2, successful CI 37132587255) adds durable exact-Run source journals and immutable actual source snapshots that preserve material Drafts, failures and truthful configuration versions across interrupted packaging/review. Migration 0022 is additive. CourtListener database interruptions remain replayable; stopped Runs recover unfinished readiness without new paid calls or mutation of sealed decisions. The production Workflow entrypoint has 38 focused local-D1 recovery tests, including actual CourtListener dedup, checkpoint loss, atomic receipt rollback and competing snapshots. Full verification passes 1,305 tests in 56 files plus formatting/lint/types. No deployment, remote migration, pricing refresh or paid inference occurred. Legacy inputs that cannot be proven are refused explicitly. Native Workflow-service acceptance remains 3.34; shared replay/admission corrective action remains open for 3.33. Epic 3 operational acceptance still requires 3.37.


## Story 3.33 handoff — 2026-10-04

Atomic cross-origin date admission, stable keyed dispatch/recovery, explicit uncertainty, immutable dispatch Evidence and stale source/paid-work fencing are implemented. Reload-safe tab-local operator identity preserves the original ET date and uncertain supersede request. Populated migration preserves conflicting historical Runs; such pre-existing conflicts require verified platform/accounting reconciliation and remain a documented deferral. Local verification passes 1,373 tests in 58 files, 206 focused matrix tests and formatting/lint/types. Two four-layer review passes and one execution-spec repair are complete. [PR #49](https://github.com/bizmation/PredictionMarketLitigation/pull/49), implementation c69eb9c95f6af3c8154f44f4d654d4860bedc05e, passed [CI 37212176029](https://github.com/bizmation/PredictionMarketLitigation/actions/runs/37212176029). Together with PR #48 / CI 37132587255, this closes the shared 3.32/3.33 replay/admission corrective action on implementation evidence. Next is 3.34; no deployment, remote migration, paid inference or pricing refresh occurred. Epic 3 operational acceptance remains rejected through 3.37 and Epic 4 remains blocked.


## Staging handoff — 2026-10-04

At Patrick’s explicit request, main through 3.33 (`2276a828344b59a853d7b6a68dba40477dbba470`) is now deployed on `pml-build` as `6c2756d2-4d0b-43c3-9887-db355cbab2dc`, with migrations 0001–0023 applied. Build/check and 1,373 tests passed; tracker, ops Run/Evidence, public API and anonymous admin-denial smoke checks passed. Production version and brochure hashes are unchanged. See `docs/deploy-runbook.md`. This later deployment supersedes the individual stories’ historical “no deployment occurred” handoff statements. No manual/paid Run or editorial approval was performed; policy remains expired. 3.34/3.35 implementation and the remaining 3.36/3.37 acceptance work remain pending.


## Story 3.35 handoff — 2026-10-04

At Patrick's request 3.35 ran before independent 3.34 (its dependency 3.28 was complete). PR #53, implementation `a2006c674c7b3b9bbbcc5bdfa5edafbed85efdd2`, passed CI 37220744011 and 1,410 tests/61 files. The tracker pending count and ops cards share public membership, freshness/error handling and 30-second/focus refresh, with accessible status and stale/retry behavior. Four review layers completed; five repairs are covered by 31 rendered matrix cases. Staging `pml-build` version `c063fe36-59b8-42af-b6ec-88b8695d1cf9` shows matching API/masthead/ops zero pending and correct #drafts navigation. Positive/failure/revision states use deterministic automated fixtures, not fabricated staging content. Action 13 is closed; a low pre-existing validator completeness issue remains deferred in the story. No paid calls or approvals. Next at Patrick's explicit request: 3.34, then 3.36/3.37 acceptance; Epic 3 remains in progress.


## Story 3.34 handoff — 2026-10-04

PR #54, implementation `8661e0a10204abea0e1812f6fc3913004834e0db`, passed required [CI 37223061737](https://github.com/bizmation/PredictionMarketLitigation/actions/runs/37223061737). Nine native Workflow tests execute inherited production orchestration with real D1 and deterministic external effects; cover material/empty/failure/budget outcomes, replay identity, admission/shared-budget concurrency and signed production approval routing. Both removed-source-forwarding and removed-review-dispatch mutations fail the intended persisted assertions and restore green; required full CI runs after restoration. Local and CI verification pass 1,419 tests/62 files plus checks. Four review layers and four repair groups completed; CI terminal-color portability was corrected and verified with forced color. R15 is closed on linked implementation evidence. No production runtime change or new deployment is needed for this test-only story; 3.35 remains live on staging version `c063fe36-59b8-42af-b6ec-88b8695d1cf9`. No paid calls, pricing refresh or real approval occurred. Native completed restart is distinct from retained synthetic checkpoint-loss coverage. Next: 3.36, then 3.37; Epic 3 operational acceptance and Epic 4 remain blocked on that evidence.
