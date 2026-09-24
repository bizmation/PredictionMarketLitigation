# Epic 3 Context: Governed Daily Loop (Pipeline → Gate → Live)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Close the daily source → Draft → Approval Gate → canonical tracker → public Evidence loop. Patrick operates it with HITL by default and bounded optional autonomy; anyone can inspect its work. Stories 3.1–3.26 are complete, including canonical planning reconciliation, but operational acceptance remains rejected. The corrective backlog reopens the epic until safety regressions and a real governed staging publication demonstrate acceptance.

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
- Evaluation in progress cannot be approved. Completed explicit `evals_not_run` remains human-reviewable with its reason. Autonomous approval excludes it, Tier-2-only evidence, failed/low confidence, party characterization, and posture changes. Decided Drafts are immutable.
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
- Corrective order: 3.26 planning is complete; next is 3.27 connector boundary; 3.28 readiness → 3.29 atomic publication; 3.30 bounded cost → 3.31 reservation/accounting; 3.28 + 3.31 → 3.32 replay/config; 3.33 admission. These feed 3.34 executing-Workflow coverage; 3.28 also enables 3.35 live pending count.
- All 3.26–3.35 must merge with required CI before 3.36 staging gateway verification. Then 3.37 proves material publication and reruns the retrospective. Reuse one qualifying Run rather than duplicate paid work. Epic 4 waits for 3.37 and accepted Epic 3 evidence; planning completion closes no runtime acceptance gap.
