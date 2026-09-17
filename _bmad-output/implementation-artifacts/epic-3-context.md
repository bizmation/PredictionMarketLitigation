# Epic 3 Context: Governed Daily Loop (Pipeline → Gate → Live)

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

This epic makes the daily harness real: agents monitor sources, package Drafts, and wait at an Approval Gate, while anyone can inspect every Run, Evidence record, pending Draft, and operator steering turn on `ops.` without login. HITL is the launch default; bounded Autonomous mode may auto-approve within policy. Live F1 changes only through the gate, with provenance frozen at publish. Operator steering (interrogate, revise by instruction, tune pipeline config, record standing guidance) is a drafting-side channel that never bypasses the gate and never conceals causation.

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
- Story 3.14: Steering Channel Foundation
- Story 3.15: Draft Interrogation
- Story 3.16: Conversational Draft Revision
- Story 3.17: Conversational Pipeline Steering
- Story 3.18: Standing Corrections

## Requirements & Constraints

**Cadence.** Attempt a Run every calendar day (noon ET, weekends/holidays included). No-change days still complete an empty Run whose Evidence states zero drafts. Gaps are visible, never silently deleted. Catch-up supplements the day's record; multiple Runs may share a date with distinct origins (`scheduled` | `catch-up` | `manual`). The noon-ET rule must survive DST (dual UTC crons with an ET-hour guard, or a documented fixed-UTC choice); that rule and next-run time are public.

**Sources, drafts, gate.** Ingested and skipped items are labeled Tier-1 or Tier-2 with reasons. Published claims need a Tier-1 citation or an explicit pending-primary label. Tier-2-only Drafts cannot be agent-auto-approved. Material changes produce Drafts with entity diffs, sources, and confidence/eval inputs. Partial connector failure is explicit. No Kalshi/Robinhood market data for AI features. HITL is default: every Draft needs approve, edit-then-approve, or reject before live F1 changes. Edits preserve the original for a public diff. Reject reasons are public by default, with a private-portion mark. Provenance (`human-approved` | `agent-approved`) freezes at publish. Publish is exclusive to the Approval Gate; retries are idempotent; destructive replay requires explicit supersede confirmation, itself public Evidence. Drafts never write live F1.

**Autonomous mode.** Off by default; only the operator identity can toggle it; every change is a public audit event. Auto-approve only when all hold: low-risk, Tier-1 citations, guardrails pass, confidence at/above a versioned public threshold, not an escalate category. Must escalate: party characterization, posture flips, below-threshold/eval-fail, Tier-2-only, evals-not-run.

**Spine & transparency.** All model/tool calls go through one gateway with a hard per-Run budget; exceeding it stops paid calls and marks the Run `budget-stopped`. Guardrail failures are public with rule identity; hard fails block auto-approve. Disallowed tools are denied and logged even when requested. Agents use only authorized context, attributable in lineage. Prompt-injection in source or Draft content cannot expand tool permissions. Secrets never appear in prompts or public artifacts. HITL interrupts resume under the same Run ID without a duplicate Draft set. No-login run log and Evidence cover every Run kind as a full projection — steps, tools, models/prompts, spend, evals or explicit not-run, full Draft, lineage (claim→sources→Run→approval), approver, mode, validation log, diffs, reject reasons — with designed empty states. Drafter/reviewer disagreement is a public flag + short description. Thin exportable Evidence bundle per Run. Vendor consoles are not the public system of record. Schedule, trigger, inspect, approve, and steer without redeploy.

**Operator steering.** Authenticated conversation with a `steward` agent. Interrogation is read-only and cites that Run's Evidence, saying "not recorded" rather than reconstructing. Revision regenerates a new Draft version under the same Run ID, preserves the full chain, re-runs guardrails and eval, and recomputes the confidence badge. Pipeline config changes (sources, escalation categories, monitoring scope) are versioned, attributed, revertible, take effect next Run, and are public. Standing guidance is versioned, revocable, public authorized context, advisory to drafting only, capped and reviewable, and listed as in-force/influential on each Run. Reader correction submissions never reach runtime agents.

The steward has no live-F1 publish tool. Every influencing turn emits Evidence; a Draft must never change shape without a visible cause. YOLO threshold, per-Run budget, Autonomous mode, guardrail rules, and the action-policy allowlist are not chat-mutable (code allowlist, not prompt). Turns publish at turn completion immediately on submit — no public as-you-type streaming, no publish queue. Redaction is decided at submit; private marking hides content but never existence, timestamp, or effect. Public observes; only the operator steers. Steering spend counts against the Run budget.

## Technical Decisions

- D1 is canonical for `runs`, `drafts`, `evidence_events`, plus `steering_turns`, `standing_guidance`, `pipeline_config_versions`. Drafts support a parent/revision-index chain. Durable Objects hold in-flight Run/HITL wait state. Zod contracts at the API/Draft/Evidence boundary.
- `DailyRunWorkflow` (Agents SDK + Workflows): connectors → drafter → reviewer → package → HITL wait or YOLO agent → Approval Gate publish. Steward sits beside the wait, writing Drafts/config/guidance/turns/Evidence, never live F1.
- Versioned roles `orchestrator` / `drafter` / `reviewer` / `yolo` / `steward` via `gateway.complete({ role })` only; OpenRouter through AI Gateway; role→model changes audited. Steward has its own model binding and a tighter tool allowlist.
- Only the Approval Gate persists published F1. Connectors/agents write Drafts + Evidence stubs. Steward may write Drafts, pipeline config, and standing guidance. Governance-control mutation is admin-form-only. A steering write without a projected Evidence event is a defect.
- Evidence is an append-oriented projection (`run.started`, `source.fetched`, `draft.created`, `gate.awaiting_approval`, `run.budget_stopped`, plus `steering.turn` / `steering.applied` / `steering.denied`, `draft.revised`, `config.steered`, `guidance.recorded` / `guidance.revoked`). Spend as integer cents.
- Cloudflare Access on `/admin` and mutating gate/steering APIs. Preserve the scaffold chat transport as the steering foundation; it stays unreachable to unauthenticated users.
- Unresolved in planning (do not invent): numeric YOLO threshold; standing-guidance cap and review cadence; steward model pin; whether to cap revision-chain depth; exact UTC cron for noon ET.

## UX & Interaction Patterns

- `ops.` is receipts, not a second litigation dashboard. Pending Drafts always carry NotLiveDraftBanner / ticket-edge treatment. Run log uses status chips (published, awaiting-approval, empty, failed, budget-stopped) and origin flags (scheduled, catch-up, manual); next-run is public; rows link to Evidence.
- Evidence shows live+historical steps; empty states for zero spend, evals-not-run, and no steering (healthy "nobody intervened"); full Draft; lineage; edit diffs; disagreement flag; mode + threshold; steering turns attached to Run/Draft with the instruction that caused each revision; redacted turns still show timestamp, actor, and effect.
- Admin queue: J/K navigate, A approve, E edit, R reject, plus a binding to open steering inline without losing queue context. Conversational revision and the manual edit buffer coexist. Mode toggle and threshold are form controls, not chat. Governance-control refusals are calm explanations, not errors.
- Steering composer: submit is publication. Make public-by-default unmistakable at the typing moment. Private/redact control sits adjacent to submit, not in a post-hoc menu. Public projection is turn-granular (may poll); never token-streamed.

## Cross-Story Dependencies

- 3.1 (schema, including steering tables and revision chain) and 3.2 (gateway + `steward` role) underpin the rest. 3.3 → 3.4 → 3.5 → 3.6 wraps generation before the gate. Public surfaces 3.7–3.9 depend on pipeline data; 3.8 must also project steering once 3.14 lands. 3.10 needs Access (Epic 1) and pending Drafts (3.9); 3.11 is the sole live-F1 write path. 3.12 depends on 3.3; 3.13 depends on 3.2 / 3.5–3.6 / 3.10.
- Steering sequence: 3.14 (channel + policy) → 3.15 (interrogate) → 3.16 (revise) → 3.17 (config) → 3.18 (standing guidance). 3.16 also needs 3.11's publish/diff machinery and 3.5's drafter/reviewer. 3.17 needs 3.4 and 3.12. 3.18 needs 3.6 authorized-context.
- Upstream: Epic 1 shells, Access, and preserved chat primitive; Epic 2 F1 schema and live views that 3.11 updates. Downstream: Epic 4 explainer hooks and journal consume Run/Evidence; reader correction queue must not be wired into the steward.
