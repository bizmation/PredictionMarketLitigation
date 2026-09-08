# Epic 3 Context: Governed Daily Loop (Pipeline → Gate → Live)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 3 builds the governed daily loop that makes the project's core thesis real: an agent fleet runs a scheduled harness every calendar day, detects material litigation changes, and packages them as Drafts — but canonical tracker truth only moves through a visible Approval Gate. Anyone can inspect every Run, its Evidence, and pending Drafts on `ops.` without logging in; the operator (HITL, the default) or a bounded, audited approval agent (Autonomous mode) approves/edits/rejects; approved Drafts update live apex F1 with frozen provenance and public before/after diffs. Empty, failed, and budget-stopped Runs are first-class public records — silence must never be mistaken for "the harness didn't look."

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

## Requirements & Constraints

**Cadence & reliability.** A Run is attempted every calendar day (noon ET target, no weekend/holiday skip). No-material-change days still complete an empty Run whose Evidence states zero drafts. Missing/failed scheduled attempts are visible as gaps, never silently deleted. Catch-up Runs supplement (never replace) the day's record; multiple Runs may share a date, each with a distinct origin (`scheduled` | `catch-up` | `manual`). The noon-ET schedule must hold across DST transitions via a chosen, publicly displayed rule (dual UTC crons with an ET-hour guard, or a documented fixed-UTC choice); schedule timezone and next-run time are stored for public display.

**Two-tier sources.** Every ingested or skipped source item is labeled Tier-1 (citation of record) or Tier-2 (leads/corroboration) with reasons on public Evidence. Published factual claims require a Tier-1 citation or an explicit pending-primary label. Tier-2-only Drafts are ineligible for agent auto-approve. Connector stubs are acceptable if they record skip reasons; partial connector failure must be explicit on the Run, never masked as full success.

**Drafts & gate.** Material changes produce Drafts naming the affected F1 entities, proposed field diffs, source links, and confidence/eval inputs. Drafts never write live F1 tables. Each Run hands the gate a durable package: Drafts (0..N) + Evidence stub + mode inputs — durable enough that late human review sees the same Draft set. HITL is the launch default: every Draft needs human approve/edit/reject; edit-then-approve preserves the original Draft for a full public before/after diff; reject reasons are public by default with an operator control to mark a reason (or portion) private. Rejected Drafts may remain publicly archived with outcome.

**Autonomous mode bounds.** Off by default; only the operator identity can enable/disable, and every change writes an audited event visible on `ops.`. Auto-approve requires ALL policy checks to pass: low-risk update, Tier-1 citations, guardrails pass, confidence at/above a versioned publicly-visible threshold. Must escalate to human: party characterizations, posture flips, below-threshold/eval-fail, Tier-2-only, evals-not-run.

**Governance spine (enforcement, not prompt-level).** All LLM/tool calls go through one gateway front door with a hard per-Run budget ceiling — exceeding it stops paid calls and marks the Run `budget-stopped` as a first-class status. Guardrail failures are recorded publicly with rule identity; hard fails block auto-approve. Prompt-injection embedded in source content cannot expand tool permissions (enforced via adversarial tests). Disallowed tool calls are denied and the denial logged publicly, even when a model requests them. No agent holds a direct live-F1 publish tool — publish exists only via the Approval Gate. Agents run under scoped identities with authorized-context-only access, attributable in lineage.

**Transparency.** The public run log and Evidence detail require no login and cover every Run kind. Evidence is a full projection (steps, tools, model/prompt versions, spend, evals or explicit "evals not run", full Draft text, lineage from claim → sources → Run → approval, approver, mode, agent validation log, edit diffs, reject reasons) with designed empty states for zero/not-run values; secrets are scrubbed. Drafter/reviewer material disagreement sets a public flag + short description. A thin exportable Evidence bundle per Run is required.

**Testing mandates (Vitest, co-located).** Required coverage: Run creation, empty-Run completion, and same-Run-ID resume after HITL interrupt; prompt-injection/tool-allowlist enforcement fixtures; gate write-path transitions (approve / edit-then-approve / reject) and idempotent publish under retry. The implemented eval/confidence scoring method must be documented when it lands.

## Technical Decisions

- **Storage:** D1 is canonical for `runs`, `drafts`, `evidence_events` (+ lineage/step tables); Durable Objects hold in-flight Run state and HITL wait coordination, projected out to D1 for `ops.` Zod schemas in `src/shared/schemas` are the canonical contracts for API payloads, Draft diffs, and Evidence events. Wrangler D1 migrations.
- **Orchestration:** `DailyRunWorkflow` (Agents SDK + Workflows) orchestrates durable steps — connectors → drafter agent(s) → reviewer/eval agent → package → `waitForApproval` (HITL) or YOLO agent → gate publish. A Run interrupted awaiting approval resumes under the same Run ID without regenerating a conflicting Draft set; retries are idempotent for publish.
- **Model routing (locked):** single code path — agents call `gateway.complete({ role })` only; no ad-hoc provider SDKs or hardcoded model IDs. OpenRouter via AI Gateway. Versioned role→model config (orchestrator / drafter / reviewer / yolo) stored in D1/ops config, visible on `ops.`; changing it is an audited event. Every LLM call records role, provider, model, tokens/spend for Evidence. Reviewer model is configured separately from drafter (may differ).
- **Write-path rules (mandatory):** only the Approval Gate module persists published F1 mutations; agents/connectors write Drafts + Evidence stubs only; supersede/replay requires an explicit flag, confirmation, and its own Evidence event.
- **Evidence projector:** one module writes the public Evidence projection (append-oriented rows, not raw vendor logs) using dot.case event names (`run.started`, `source.fetched`, `draft.created`, `gate.awaiting_approval`, `run.budget_stopped`, …) validated by Zod; scrubs secrets/credentials. Vendor consoles are never the public system of record.
- **Spend/money:** integer cents + currency code; never float dollars in API.
- **Structure & conventions:** pipeline code lives in `src/pipeline/` (workflows, agents, gate, connectors, projector, ai, config); `surfaces/*` never import `pipeline/*` internals; DB snake_case / JSON camelCase boundary; PRD glossary terms verbatim (`Run`, `Draft`, `Evidence`, `ApprovalGate`, `posture`, `operationalStatus`).
- **Auth:** Cloudflare Access in front of `/admin` and `/api/admin/*`; no reader accounts; secrets only in Worker bindings — never in prompts or public artifacts.
- **External sources:** CourtListener, Federal Register, Tier-2 news via `pipeline/connectors` (mostly non-LLM).

## UX & Interaction Patterns

- **Run log (`ops.`):** recent Runs with id, status chip, timestamp, origin flag, mode, spend, step summary, approval outcome; schedule timezone + next-run visible; rows link to Evidence detail; no auth. Status chips cover published / awaiting-approval / empty / failed / budget-stopped; origin flags cover scheduled / catch-up / manual.
- **Evidence detail:** step timeline with live + historical step-level status; explicit designed empty states for zero-spend and evals-not-run (never blank); full Draft text; lineage/provenance; before/after diff for human edits; disagreement flag + description when present; current mode + auto-approve threshold display.
- **Pending Drafts (`ops.`):** full body, proposed diffs, flags, confidence/eval badge — always under the NotLiveDraftBanner / `.draft` ticket-edge treatment so drafts are impossible to confuse with live F1.
- **Admin approval queue (Access-gated):** keyboard-first — J/K navigate, A approve, E edit, R reject; edit buffer preserving the original Draft; reject-reason capture with public/private-portion control; mode toggle + threshold slider; audit trail panel.
- Reuse Epic 1 trust components: RunStatusChip, OriginFlag, ProvenanceLabel (human- vs agent-approved), NotLiveDraftBanner, EmptyState.

## Cross-Story Dependencies

- Story 3.1's schema builds on Epic 2's F1 schema/seed and is the foundation for everything else in this epic.
- 3.2 (gateway + role→model config) is a prerequisite for the workflow (3.3), source monitoring/drafting (3.4), drafter/reviewer (3.5), and autonomous mode (3.13).
- 3.3's workflow feeds 3.4's connectors; 3.5's agents consume 3.4's packaging; 3.6's enforcement wraps 3.5's generation agents before Drafts reach the gate.
- Public surfaces (3.7–3.9) depend on the data model + pipeline stories; the admin queue (3.10) depends on Epic 1's Access protection and on 3.9's pending Drafts.
- 3.11's publish path depends on 3.10 and enforces 3.6's no-agent-publish rule end-to-end.
- 3.12's operator controls depend on the 3.3 workflow; 3.13 depends on the policy groundwork from 3.2/3.5/3.6/3.10.
- Upstream: Epic 1 (scaffold, design tokens, Access, deploy pipeline) and Epic 2 (apex views that published Drafts must update; seed provenance labels). Downstream: Epic 4's explainer live hooks and Evidence-linked journal posts consume this epic's Run/Evidence data.
- Provenance labels are seeded in Epic 2 but frozen at publish time here (mode changes cannot relabel already-published items).
