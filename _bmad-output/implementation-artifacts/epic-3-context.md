# Epic 3 Context: Governed Daily Loop (Pipeline → Gate → Live)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Close the draft → gate → publish → evidence loop: a daily harness produces Runs and Drafts; anyone can inspect Runs, Evidence, and pending Drafts on `ops.`; HITL (default) or bounded Autonomous mode approves/edits/rejects; only the Approval Gate updates live F1, with frozen provenance and public diffs. This epic is the product’s trust thesis made operational—silence, failure, and spend must be visible, and agents must never mutate published tracker truth directly.

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

## Requirements & Constraints

- **Cadence:** One scheduled Run every calendar day (noon ET target); missing attempts are visible gaps, not silent deletes. Origins include `scheduled`, `catch-up`, and `manual`. Empty (no-change) Runs still complete with Evidence of zero drafts.
- **Drafts never mutate live F1.** Only Approval Gate publish writes published tracker state. Pending Draft bodies are fully public on `ops.`, conspicuously not-live.
- **HITL is launch default.** Operator can approve, edit-then-approve, or reject. Reject reasons are public by default (optional private mark). Edit-then-approve preserves original Draft text for a full public before/after diff.
- **Autonomous (“YOLO”) is optional and bounded.** Only the operator identity can enable/disable; mode changes and the auto-approve threshold are public. Auto-approve only when policy checks pass; escalate party characterization, posture flips, Tier-2-only, below-threshold/eval-fail, and evals-not-run.
- **Provenance:** Published items are labeled human-approved or agent-approved, frozen at publish. Readers can walk claim → sources → Run → approval on `ops.`
- **Governance spine (enforceable at launch):** All LLM traffic through a gateway with a per-Run budget ceiling (exceed → Run `stopped` / public chip “budget-stopped”); I/O guardrails; action policy (no agent publish tool); durable orchestration with same-Run-ID resume after approval wait; scoped agent identity/context; public Evidence (steps, models, spend, evals or explicit not-run, disagreement flags); thin exportable Evidence bundle.
- **Transparency:** Every Run kind (including failed, empty, budget-stopped, awaiting, published) is inspectable without login. Secrets/credentials never appear in public projections or prompts.
- **Sources:** Tier-1 primary vs Tier-2 secondary; Tier-2-alone drafts are ineligible for agent auto-approve. Total connector outage must not be classified as empty.
- **Operator loop:** Manual trigger, live status, safe supersede (no silent double-publish); routine operation without redeploy. Steering channel is Access-gated; turns publish at turn completion (no as-you-type public streaming); governance controls (mode, budget, YOLO threshold, guardrails, allowlist) are not mutable via chat.
- **Staging closure:** Public ops shell on `ops-build.` for the build worker; production `ops.` hostname stays on the brochure worker until cutover. New Runs stamp the in-force budget ceiling onto the row.

## Technical Decisions

- **Stack:** Cloudflare Workers + Agents SDK + Workflows + AI Gateway + D1; Zod contracts for Run/Draft/Evidence.
- **Orchestration:** `DailyRunWorkflow` → connectors → drafter → reviewer → package → `waitForApproval` (HITL) or YOLO agent → `approvalGate.publish`. Roles: `orchestrator`, `drafter`, `reviewer`, `yolo`, plus `steward` for steering. Agents call `gateway.complete({ role, … })` only; versioned role→model config; OpenRouter is the required primary multi-model router (Workers AI is the initial seed pin until OpenRouter lands).
- **Sole write paths:** Only the Approval Gate module publishes live F1; only the gateway module calls LLMs; Evidence projector owns public projection writes. Surfaces must not import pipeline internals (admin calls APIs).
- **Schedule:** Noon ET across DST—dual-UTC-cron with ET-hour guard, or a documented fixed-UTC rule; whichever is chosen is what the public display shows.
- **Timeouts (locked):** ~15 s client GET, ~30 s admin POST, ~60 s connector + provider.
- **Event naming:** Dot-case Evidence steps (e.g. `run.started`, `gate.awaiting_approval`, `run.budget_stopped`). Status vocabulary for public chips includes published, awaiting, empty, failed, stopped (budget-stopped), catch-up, manual.
- **Idempotency:** Gate approve/reject and publish retries must not double-publish the same Draft; late human review resumes under the same Run ID without a conflicting duplicate Draft set.
- **Envs:** Separate D1s per environment; staging deploy via build worker/domain only—do not treat production deploy as the staging path for ops-shell work.

## UX & Interaction Patterns

- **Surface split:** Apex = litigation tracker; `ops.` = run log, Evidence, pending Drafts, mode/threshold transparency; `/admin` = Access-gated approve/edit/reject, mode, manual triggers, steering.
- **Draft ≠ live:** Mandatory NotLiveDraftBanner / `.draft` treatment; never confusable with canonical F1. Empty, failed, budget-stopped, and evals-not-run are designed first-class states—not omissions that look healthy.
- **Public run log:** Status chip, origin flag, mode, spend, step summary, approval outcome, schedule timezone + next-run; each row → Evidence detail.
- **Evidence detail:** Steps/tools, model/prompt versions, spend, evals, full Draft text, lineage, disagreement flag + short description when present; scrubbed of secrets.
- **Admin queue:** Keyboard-first navigation and actions (J/K; A approve / E edit / R reject). Provenance labels (`human-approved` / `agent-approved`) and confidence/eval badges (including explicit “evals not run”) are load-bearing trust UI.
- **Mode transparency:** Current mode, auto-approve threshold, and recent mode-change audit visible on `ops.` without login.

## Cross-Story Dependencies

- Builds on Epic 1 dual-site/Access/admin shell and Epic 2 F1 schema/seed; Epic 4 assumes a real public ops host and Evidence/mode APIs from this epic.
- Pipeline chain: 3.1 → 3.2 → 3.3 → 3.4 → 3.5 → 3.6 before public ops UI (3.7–3.9) and gate (3.10–3.11); 3.12–3.13 close operator/autonomy controls.
- Steering suite (3.14–3.18) depends on gateway, enforcement, admin queue, Evidence, and publish machinery; 3.19 hardens timeouts/seed; 3.20 OpenRouter and 3.21 live connector follow; 3.23–3.25 before 3.22 deploy so the first public staging ops page is truthful.
- Stories 3.14–3.21 live in the 2026-08-09 / 2026-09-17 sprint change proposals (insertion into `epics.md` is an open bookkeeping item); 3.22–3.25 are in epics + the 2026-09-23 proposal.
