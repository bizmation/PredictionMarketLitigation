# Epic 3 Context: Governed Daily Loop (Pipeline → Gate → Live)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Run a governed daily loop: consult configured sources, package proposed tracker changes as Drafts, and publish to the live tracker only through human approval or a bounded autonomous mode. Anyone can inspect Runs, Evidence, and pending Drafts. An empty day means the configured sources were consulted, or explicitly blocked, and nothing material changed. A source left unwired is not monitoring. Further web and publication sources stay out until each one is named.

## Stories

- Story 3.1: Run, Draft & Evidence Data Model
- Story 3.2: AI Gateway, Budget Envelope & Role→Model Config
- Story 3.3: Daily Run Workflow & Empty Runs
- Story 3.4: Source Monitoring & Draft Packaging
- Story 3.5: Drafter, Reviewer & Disagreement Flag
- Story 3.6: Guardrails, Action Policy & Scoped Context
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
- Story 3.22: Staging ops host
- Story 3.23: Fail a total CourtListener outage
- Story 3.24: Retire pipeline-not-live copy
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
- Story 3.39: Wire seeded CFTC, SCOTUS, and legal-news sources
- Story 3.40: Add further web and publication sources

## Requirements & Constraints

- The daily loop attempts every calendar day, keeps an identifiable Run, and records empty days, failures, budget stops, and approval waits. Silence is not a missing Run.
- Configured Tier-1 and Tier-2 sources are fetched, or skipped with a named access reason on public Evidence. A skip that exists only because no connector is wired does not count as monitoring.
- Drafts propose tracker changes and never write the live tracker themselves. Primary-source support, or an explicit pending-primary label, is required for a published factual claim. Tier-2-only Drafts stay ineligible for autonomous approval.
- Human approval is the default. Autonomous approval is off unless enabled, and it cannot pass party characterizations, posture flips, low-confidence or unevaluated items, or Tier-2-only Drafts.
- Model calls go through the shared gateway under a frozen per-Run budget. Secrets stay out of prompts, Drafts, and public Evidence.
- Partial source failure is visible on the Run and is not reported as full success. A blocked source does not invent entries.
- Additional sources beyond the seeded names are added only after each display name, https URL, and tier is explicitly named.

## Technical Decisions

- Cloudflare Workers, Workflows, D1, and the AI Gateway are the platform. D1 holds canonical tracker rows, Drafts, and public Evidence. Durable workflow steps keep one Run identity across approval waits and replay.
- The Approval Gate is the only live-tracker writer. Connectors and agents do not publish.
- Connector credentials stay on validated https origins. Redirects and foreign pagination targets do not receive them.
- CourtListener pacing and bounded HTTP 429 recovery stay on that connector. Other failure classes there still fail on the first response. Queues stay deferred.
- The seeded connector modules are CourtListener, CFTC press, SCOTUS docket, and legal-news leads. Do not add a module for a source that has not been named.
- Replay must recover this Run's persisted package and the source configuration it actually consumed. Competing triggers share one active Run per date; a non-duplicate dispatch failure stays visible.
- Paid calls need a conservative bound and atomic reservation before dispatch. Unknown provider outcomes keep the liability until reconciliation.
- Staging and production stay separate workers and databases. A story that says it does not deploy must not deploy.

## UX & Interaction Patterns

- The public run log shows status, origin, time, mode, and spend, including empty, failed, stopped, and awaiting days.
- Evidence shows sources consulted and skipped, with reasons, and keeps secrets out.
- Pending Drafts are readable in full, labeled not live, and show a Tier-2-only flag when the support is only secondary.
- No new screen is required for the seeded source names; they appear on the existing run and evidence surfaces.

## Cross-Story Dependencies

- Epic 2 owns the canonical tracker records this loop proposes and publishes.
- Source monitoring, draft packaging, the first live connector, credential checks, and CourtListener pacing are already in force. New source work must not replace those contracts except where a later story explicitly supersedes a stub allowance.
- Story 3.40 waits on names and on story 3.39. Epic 4's narrative and feedback stories are a separate entry and are not reordered by the remaining source stories.
