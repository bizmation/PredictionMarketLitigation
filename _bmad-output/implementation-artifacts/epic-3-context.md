# Epic 3 Context: Governed Daily Loop (Pipeline → Gate → Live)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Close the daily source → Draft → Approval Gate → canonical tracker → public Evidence loop. Patrick operates it in human-in-the-loop mode by default, with optional bounded autonomy; anyone can inspect Runs, Evidence, and pending Drafts on `ops.`. Sprint status on this checkout records stories 3.1–3.36 and 3.38 done. Story 3.37 is the remaining acceptance: one real material docket event on staging, Patrick’s named approval of that live draft, exactly one F1 publication, then a fresh Epic 3 retrospective. Epic 4 stays gated until that acceptance succeeds. Every role uses `deepseek-ai/DeepSeek-V4-Flash` (Patrick, 2026-10-10, 8:05 PM ET). `run-20261010-0003` was rejected; those drafts never received a model call and are not 3.37 evidence.

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
- Story 3.38: Pace CourtListener requests and recover from HTTP 429

## Requirements & Constraints

- Canonical F1 changes only through the Approval Gate. Agents, including the steward, never receive a direct publish tool. Human edits preserve the original and the public diff; approval identity and provenance freeze at publication. Planning approval is not approval of unknown legal content.
- Attempt a daily noon-ET Run with an explicit DST rule. Preserve manual and catch-up history, empty days, partial failures, total-source failure, and budget stops. Empty means no material work, not failed collection. Sequential Runs per date remain allowed; competing origins share atomic active-date admission.
- Evaluation readiness distinguishes processing, a completed evaluation, and an explicit completed not-run with a reason. Null or uncertain outcomes cannot imply completion. Autonomous approval excludes not-run, Tier-2-only evidence, failed or low confidence, party characterization, and posture changes. A decision seals the Draft.
- Publication atomically checks eligibility, the latest revision, and expected prior field values. Conflicts abort the whole write. Concurrent sibling decisions finalize the Run; retries cannot publish twice.
- Model calls use the central gateway. Preserve the configured seed ceiling and each Run’s frozen ceiling. Paid admission requires a conservative bound and an atomic reservation against Run and period limits. Settle idempotently. Unknown outcomes retain liability until reconciliation. Estimated or reserved amounts are not actual charges.
- Steering may interrogate, revise, change versioned pipeline configuration, and record capped guidance. Budgets, mode, thresholds, guardrails, and tool policy stay outside chat mutation. Influential turns leave public causation.
- Published claims need primary-source support or an explicit pending-primary label. Tier-2-only evidence cannot authorize autonomous publication.
- Public Evidence links sources, models, tools, revisions, evaluations, spend, and decisions without credentials. Credentials attach only to validated HTTPS API-origin requests, including pagination and redirects.

## Technical Decisions

- Cloudflare Workers, Agents, Workflows, D1, and AI Gateway stay. D1 is canonical structured truth. Durable orchestration keeps Run identity across interruption and approval waits.
- Replay recovers this Run’s persisted package, avoids duplicate paid work, and consumes the pinned source configuration. Dispatch errors are distinct from confirmed duplicate instances.
- Status tokens are `awaiting`, `stopped`, and `run.stopped`. The stopped chip reads budget-stopped. Money is integer cents.
- Timeouts: GET 15 seconds, general admin POST 30 seconds, connector and provider 60 seconds. The steering composer uses `2 × provider + 10s` (130 seconds).
- Staging is `pml-build` on `build.predictionmarketlitigation.com` and `ops-build.predictionmarketlitigation.com`. Production stays `pml`. Staging deploys use the documented build process, not `npm run deploy`.
- CourtListener HTTP 429 is in-connector serial pacing: space starts, honor a bounded `Retry-After`, and fail the source with scrubbed `http_429` evidence only after the retry budget is exhausted. A 401, 403, 5xx, network error, or timeout still fails that request on the first response. `run-daily-step` stays one packaging checkpoint. Cloudflare Queues stay deferred.

## UX & Interaction Patterns

- The Run log, Evidence, full pending Drafts, and steering receipts are public. Pending content is conspicuously not live. Authenticated actions stay separate. Empty, failed, stopped, and missing-record states stay honest.
- Keyboard review, accessible feedback, and original-versus-edited comparison stay. Processing disables decisions. Stale conflicts explain refresh and keep unsent edits. The pending count and the pending band share one data contract and never assert a false zero.
- The steering composer is private. Completed turns publish immediately. Private turns keep causal placeholders. No intervention is a normal empty state.

## Cross-Story Dependencies

- Epic 2 supplies canonical F1. Stories 3.14–3.21 are in the canonical epic list. Epic 4’s seven stories wait for story 3.37 and accepted Epic 3 retrospective evidence.
- Corrective order 3.26–3.35 is done, as are 3.36 (staging gateway verification) and 3.38 (CourtListener pacing). Story 3.37 reuses a qualifying material Run rather than starting duplicate paid work, then reruns the retrospective. An empty Run cannot close 3.37.
- Delayed-arrival policy and failed-revision recovery stay deferred. Close retrospective actions only with linked evidence. If acceptance fails, keep the blockers visible and leave Epic 3 unfinished.
