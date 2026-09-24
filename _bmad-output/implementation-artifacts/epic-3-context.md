# Epic 3 Context: Governed Daily Loop (Pipeline → Gate → Live)

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Close the daily source-monitoring → Draft → Approval Gate → live tracker → Evidence loop. Patrick can operate and steer the harness without routine redeploys; readers can inspect every attempt, pending proposal, approval, cost, and failure on public `ops.`. Human approval remains the default, with a separately enabled, bounded Autonomous path and durable provenance for every publish.

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
- Story 3.22: Staging ops host (`ops-build`)
- Story 3.23: Fail a total CourtListener outage
- Story 3.24: Retire “pipeline is not live” copy
- Story 3.25: Stamp the budget ceiling onto each new Run

## Requirements & Constraints

- Attempt a Run every calendar day, targeting noon ET with an explicit DST rule. Publish the timezone and next-run time. Preserve gaps, failures, and original attempts; catch-up and manual Runs supplement history. An empty Run proves a successful no-change check, not unavailable sources. Total CourtListener failure must finish failed; partial failures remain visible.
- Tier-1 sources provide primary citations; Tier-2 provides leads. Label tiers, skipped sources, and reasons. Published claims need primary support or explicit pending-primary attribution. Draft packages contain proposed entity diffs, sources, confidence/evals, and Evidence without modifying live tracker data.
- Only the Approval Gate writes published F1. Preserve original and edited text, public before/after diffs, and provenance frozen at publication. Reject reasons default public with field-level private redaction. Resume interrupted reviews under the same Run ID; retries must not duplicate Draft sets or publishes. Destructive replay needs explicit supersede confirmation and Evidence.
- Autonomous approval requires low risk, Tier-1 citations, passed guardrails, and a publicly visible versioned confidence threshold. Party characterization, posture flips, Tier-2-only support, missing/failed evals, and insufficient confidence escalate to humans. Only the operator changes mode; changes and validation outcomes are public.
- Record spend and enforce a per-Run ceiling across all model roles, including steering. Snapshot the configured default ceiling when each scheduled, catch-up, or manual Run begins; the default is 500 cents. Public Run list and detail expose the stored ceiling. Later defaults cannot rewrite historical ceilings; existing staging nulls remain null. Reaching the Run's ceiling prevents further paid calls.
- Public Evidence includes steps/tools, model and prompt versions, tokens/spend, budget outcome, full Draft text, evals or explicit not-run state, disagreement, and claim → source → Run → approval lineage. Export a thin reviewable bundle. Scrub credentials and private fields; vendor consoles cannot substitute for public records.
- Steering cannot publish or alter governance controls: budget, approval threshold, mode, guardrail rules, and tool allowlists remain separately audited admin actions. Enforce boundaries in code. Publish completed steering turns immediately on submission with redaction decided before publication; never expose composition or permit retroactive privatization. Revisions preserve all versions and re-enter guardrails/evaluation. Versioned monitoring config applies to the next Run; bounded, revocable guidance is attributable advisory context.

## Technical Decisions

- Cloudflare Agents SDK and Workflows provide orchestration, durable steps, and approval waits; D1 stores canonical entities, Runs, Drafts, Evidence, and configuration. Durable Objects coordinate in-flight state. Cloudflare OS is not the control plane.
- Role specialists use one AI Gateway wrapper and versioned operator-controlled model routing. Roles include orchestrator, drafter, reviewer, approval agent, and steward. OpenRouter is the required primary router; the hardening amendment permits an initial Workers AI seed before provider integration. Audit configuration changes and record role/provider/model per call.
- Shared Zod contracts validate REST JSON and Draft/Evidence boundaries. Use integer cents, UTC ISO timestamps, explicit nulls, direct resource responses, cursor-based list envelopes, and structured errors. Public Evidence is an append-oriented projection rather than raw infrastructure logs.
- Access protects admin and mutations; agents use scoped identities and authorized context. Tool denials and guardrail failures are public Evidence. Required verification covers same-Run resume, gate transitions and idempotency, injection/allowlist containment, steering boundaries, and revision lineage.
- Timeouts: public GET 15 seconds, admin POST 30 seconds, connector/provider calls 60 seconds. Provider timeouts are provider errors, not budget stops. Preserve source failure evidence; the later CourtListener outage rule governs failure classification.
- Environments have separate D1 stores. Staging apex and ops use `build.` and `ops-build.` on `pml-build`; production apex and `ops.` remain on `pml`. Staging work must preserve production routing.

## UX & Interaction Patterns

Public `ops.` requires no login and makes failed, empty, awaiting, and budget-stopped states as inspectable as published Runs. Distinguish origin from status; stored `stopped` displays as budget-stopped. Full pending Drafts need conspicuous not-live treatment, confidence/eval badges, and Evidence links. Show zero spend and missing evals explicitly. Apex copy distinguishes seeded published claims from pending proposals and links to the correct environment's public run log.

The protected queue supports J/K navigation and A/E/R actions, preserves context during interrogation, and disables in-flight submissions. Use existing trust components, accessible focus and keyboard behavior, responsive layouts, and designed loading/error/empty states.

## Cross-Story Dependencies

Epic 1 supplies deployment, Access, shells, and trust components; Epic 2 supplies canonical F1 schemas and views. The Run model and gateway underpin workflow, sourcing, review, and enforcement. Their records feed public Evidence and the queue; the gate connects approval to F1. Steering depends on gateway, enforcement, and admin foundations; revision builds on review and publish lineage. Later provider, connector, staging, outage, copy, and budget work completes operational reliability. Epic 4 consumes these public receipts for governance explanations and journal links.
