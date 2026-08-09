---
stepsCompleted: [step-01-document-discovery, step-02-prd-analysis, step-03-epic-coverage-validation, step-04-ux-alignment, step-05-epic-quality-review, step-06-final-assessment]
status: complete
overallReadiness: READY — punch list applied 2026-08-09
punchListApplied: [M1, M2, M3, M4, m1, m2, m3, m4, m5, W1, W2, W3, W4]
documentsIncluded:
  prd:
    - prds/prd-PML-2026-06-18/prd.md
    - prds/prd-PML-2026-06-18/addendum.md
  architecture:
    - architecture.md
  epics:
    - epics.md
  ux:
    - ux-brief-pack.md
    - ux-designs/design_handoff_pml/README.md
---

# Implementation Readiness Assessment Report

**Date:** 2026-08-09
**Project:** PML

## Document Inventory

### PRD

- **Folder:** `prds/prd-PML-2026-06-18/`
  - `prd.md` (51 KB, modified 2026-08-09 10:24) — main document
  - `addendum.md` (9.4 KB, modified 2026-08-09 10:02)
  - `reconcile-brief.md` (4.8 KB, modified 2026-08-09 10:23) — reconciliation notes
  - `.decision-log.md` (20 KB) — process log, not assessed

### Architecture

- `architecture.md` (36.6 KB, modified 2026-08-09 10:56) — whole document

### Epics & Stories

- `epics.md` (52.4 KB, modified 2026-08-09 13:31) — whole document

### UX Design

- `ux-brief-pack.md` (20.5 KB, modified 2026-08-09 11:01) — UX spec
- `ux-designs/design_handoff_pml/` — design handoff package (README.md + 4 HTML mockups: Tracker, Ops, Admin, Design System + pml.css) — supporting design detail

### Supporting Context (not directly assessed)

- `briefs/brief-PML-2026-06-17/` — product brief + addendum (Phase 1 artifact)

### Issues

- **Duplicates:** None — no whole+sharded conflicts for any document type
- **Missing documents:** None — all four required types present (PRD, Architecture, Epics, UX)

## PRD Analysis

**Source:** `prds/prd-PML-2026-06-18/prd.md` (status: final, updated 2026-08-09) + `addendum.md` + `reconcile-brief.md`. All features F1–F8 marked **LOCKED (2026-08-09)**.

### Functional Requirements

#### F1 — Litigation Intelligence Tracker

- **FR-1: Circuit-split heat map `[v1]`** — A reader can view an interactive map of the U.S. federal circuits and relevant states, color-coded by each region's current posture toward platforms (decided-for-platform · expected/decided-for-state · pending-skeptical · banned). *Consequences:* one posture per region from controlled set + legend; hover tooltip (posture, controlling cases, last-updated); click → region detail linking case records (FR-3) + primary source; posture only from approved case records; no-activity regions visually distinct from unsettled; reflects latest approved state within one publish cycle + "last updated" timestamp; region selection cross-highlights status board (FR-2), keyboard-accessible.
- **FR-2: State-by-state status board `[v1]`** — A reader can view, per tracked state, its operational status (go / restricted / banned), active case(s), posture, and last-updated — as both a synced interactive map and a sortable/filterable table. *Consequences:* exactly one status per state + last-updated; table sorts (state/status/last-updated) and filters (status/posture) with map↔table sync; state detail fully answers "is [platform] legal in [state]?" incl. per-platform breakdown (programmatic-SEO target); every claim links ≥1 primary source; state selection lists cases (FR-3) + cross-highlights heat map (FR-1); "updated" badge for changes within last N days.
- **FR-3: Case records & case tracker `[v1 minimal store + list/detail; rich filtering phases in]`** — A reader can browse tracked cases — caption, court, legal track, posture, last docket event — and (phase-in) filter by circuit/state/track. *Consequences:* each record carries caption, court/circuit, legal track, posture, last docket event + date, ≥1 primary-source citation; FR-1/FR-2 derive posture/status from these records (single source of truth, no conflicting posture across views); case detail lists docket events reverse-chronological, dated + source-linked; bidirectional links to states (FR-2) and circuit (FR-1); v1 = list + detail, phase-in = filter/full-text search.
- **FR-4: Cert-likelihood signal `[v1 qualitative; market-derived later]`** — A reader can view a clearly-labeled signal of SCOTUS certiorari likelihood, with its basis disclosed. *Consequences:* v1 explicitly qualitative (no numeric %) naming factors; **no** Kalshi/Robinhood market data in v1 (ToS gate); later market-derived value must display methodology + reflexivity caveat; shows last-review date + approver. *Out of scope v1:* market-derived percentage.
- **FR-5: Litigation timeline / "what's next" calendar `[phase-in]`** — Upcoming high-signal events (rulings, deadlines, arguments, ban effective dates) on a timeline/calendar; each event dated, described, case-linked, primary-sourced; filter by event type and circuit/state; past events archive into browsable record.
- **FR-6: Player / party map `[phase-in]`** — Key players with role (litigant/regulator/amicus/platform) + posture, linked to their matters; selecting a player filters the case tracker (FR-3).
- **FR-7: Regulatory tracker `[phase-in]`** — Non-litigation regulatory activity (CFTC NPRMs + comment deadlines, state legislation/bans, enforcement); each item shows status, key dates, primary source; deadlines feed timeline (FR-5).
- **F1 feature-wide:** every view shows visible "last updated" + links to primary sources.

#### F2 — Autonomous Daily Update Pipeline (LOCKED)

- **FR-8: Daily cadence (365) `[v1]`** — Pipeline executes once per calendar day on a fixed schedule (default target noon ET), including weekends/holidays. *Consequences:* missed attempts visible as gaps on `ops.`; catch-up **supplements** (never replaces) the day's record, flagged `catch-up`; multiple Runs may share a date, each with distinct Run ID + origin flag (`scheduled` | `catch-up` | `manual`); schedule timezone + next-run time publicly visible on `ops.`.
- **FR-9: Two-tier source monitoring `[v1]`** — Monitors Tier-1 primary sources (citation of record) and Tier-2 secondary sources (leads/corroboration). *Consequences:* each ingested item labeled Tier-1/Tier-2 in evidence/lineage; published factual claims need Tier-1 citation **or** explicit "reported by [source], pending primary confirmation" label; Tier-2-only drafts flagged low-confidence and ineligible for agent auto-approval; blocked sources recorded as skipped-with-reason in public Evidence (ToS respected at capability level).
- **FR-10: Change detection → draft generation `[v1]`** — Material changes produce Drafts proposing F1 updates. *Consequences:* "no material change" day still produces a Run + Evidence record stating zero drafts (empty Run mandatory); each Draft names target F1 entities, field diffs, source links; Drafts carry confidence/eval inputs for F3; draft generation cannot mutate live F1 — only Approval Gate publish can.
- **FR-11: Run packaging for the Approval Gate `[v1]`** — Every Run hands F3 a structured package: Drafts (0..N) + Evidence stub + mode recommendation inputs. *Consequences:* operator/agent sees all Drafts for the day in one queue package; partial failure represented explicitly (not falsely fully-successful); package durable enough for late human review.
- **FR-12: Operator loop controls `[v1]`** — Patrick can trigger, inspect, and (when safe) re-run the loop as a harness. *Consequences:* manual trigger → Run with `manual` origin flag publicly visible; operator sees live/last Run status (queued/running/awaiting-approval/published/failed), mirrored publicly; destructive replay that would double-publish is blocked or requires explicit "supersede prior publish" confirmation; supersede events are public Evidence.
- **FR-13: Public harness-run transparency `[v1]`** — Anyone can inspect harness Runs end-to-end without login. *Consequences:* every Run (scheduled/empty/catch-up/manual/failed/budget-stopped/awaiting-approval/published) appears in the public run log; public Evidence includes at minimum Run ID, timestamps, origin flag, status, sources consulted/skipped + reasons, **full pending Draft text**, guardrail/eval summary, spend/budget outcome, approval mode + approver outcome, lineage links, disagreement flags; failures/empty days/escalations/YOLO decisions are first-class public records; secrets non-public, everything else defaults public.

#### F3 — Approval Gate (LOCKED)

- **FR-14: HITL mode (default) `[v1]`** — Every Draft requires Patrick's approve/edit/reject before becoming live F1 content. *Consequences:* live F1 never changes without recorded human approver action; approval promotes public pending Draft to canonical; edit-then-approve preserves original Draft + edited version in public lineage with **full before/after diff**; reject leaves F1 unchanged, reject reason public by default with operator control to mark private.
- **FR-15: Public pending drafts + operator action queue `[v1]`** — Pending Drafts incl. full body text publicly readable; authenticated operator surface for actions. *Consequences:* any visitor reads full Draft text, proposed diffs, flags, Evidence links — no login; every pending Draft shows a **public confidence/eval badge** ("evals not run" is an explicit state, never blank); pending Drafts clearly labeled not-live/awaiting-approval; actions require operator auth; keyboard-accessible admin queue.
- **FR-16: Autonomous mode enablement `[v1]`** — YOLO off by default; only Patrick's operator identity can enable/disable; enablement is an audited event. *Consequences:* mode changes write audit events (who/when/prior/new) visible on `ops.`; non-operator identities cannot change mode; launch default HITL.
- **FR-17: Approval agent + action-policy bounds `[v1]`** — In Autonomous mode the approval agent auto-approves only within policy, escalating the rest. *Consequences:* auto-approve only if ALL hold — low-risk, Tier-1 citations, guardrails pass, badge ≥ explicit configured threshold, not in escalate category; threshold is a configured versioned rule with current value **visible on `ops.`**; must-escalate: named-party characterizations, posture flips, below-threshold/eval-fail, Tier-2-only, "evals not run"; every agent decision records verdict/reasoning/evidence/confidence-vs-threshold/policy rules on public Evidence; escalated items stay public + enter operator queue.
- **FR-18: Provenance labels on publish `[v1]`** — Every published item labeled human-approved or agent-approved. *Consequences:* label visible on published surface + `ops.`; mode change cannot relabel already-published items; correction flow (F8) can flag either class; rejected Drafts publicly archived with outcome + reason (unless marked private).

#### F4 — Governed Execution: 9-layer spine (LOCKED)

- **FR-19: Gateway + budget envelope (L2) `[v1]`** — All model/tool calls go through a single front door with identity, logging, spend controls. *Consequences:* per-Run spend attributable + visible on `ops.`; exceeding budget ceiling stops paid calls and marks Run **budget-stopped** as first-class public status; keys never in prompts or public artifacts.
- **FR-20: Guardrails on I/O (L3) `[v1]`** — I/O passes configured safety/validation checks before Drafts reach approval. *Consequences:* failures recorded publicly with rule identity; hard-guardrail-fail Drafts cannot be auto-approved (blocked or escalated with failure attached); prompt-injection/untrusted Tier-2 content cannot expand tool permissions.
- **FR-21: Action policy on tools (L4) `[v1]`** — What an agent may *do* is policy-bounded separately from what it may *say*. *Consequences:* publish is never an agent-direct action (Approval Gate only); disallowed tool calls denied + publicly logged; FR-17 auto-approve bounds enforced as action policy, not prompt-only.
- **FR-22: Orchestration with durable Run state (L5) `[v1]`** — Multi-step Runs maintain durable state across steps, retries, human interrupts. *Consequences:* HITL-interrupted Run resumes under same Run ID without conflicting second Draft set; retries idempotent w.r.t. publish (no double-publish); **step-level status public** on `ops.` (fetching → drafting → guardrails → awaiting-approval → published/rejected/budget-stopped).
- **FR-23: Scoped identity & authorized context (L6) `[v1]`** — Each agent acts under scoped identity using only authorized information. *Consequences:* private career/strategy materials unavailable to runtime publish agents; authorized context attributable in lineage (FR-25); mechanism architectural.
- **FR-24: Observability & evals (L7) `[v1]`** — Every Run emits traces + eval signals; public system of record is a **full projection** onto `ops.`, not a vendor-console link. *Consequences:* `ops.` shows steps/tools, model/prompt versions, spend, eval scores (or explicit "evals not run"), guardrail outcomes, drafts, approval — auditable without CF/AWS login; secrets scrubbed; eval scores (or not-run reasons) on Evidence before approval completes.
- **FR-25: Lineage / provenance (L8) `[v1]`** — Published outputs expose provenance sources/context → Draft → approval → publish. *Consequences:* reader can walk from published F1 claim to Tier-1 sources and producing Run on `ops.`; approval decision is a lineage node; lineage graph (or equivalent structured provenance) available on `ops.`.
- **FR-26: GRC evidence packaging (L9) `[v1 thin; deepen phase-in]`** — Run evidence packagable into a reviewable compliance bundle. *Consequences:* v1 = Evidence fields exportable as single bundle per Run; phase-in = richer GRC mapping without changing F1 publish semantics.

#### F5 — Public `ops.` Transparency Dashboard (LOCKED)

- **FR-27: Public run log `[v1]`** — Anyone can browse recent Runs (status, timestamp, origin flag, mode, spend, step summary, approval outcome) on `ops.`, no login. *Consequences:* failed/empty/catch-up/manual/budget-stopped/awaiting-approval Runs all visible; each Run links to Evidence detail; main site carries ≥1 clear link into `ops.`.
- **FR-28: Evidence detail `[v1]`** — Run detail = full projected Evidence story: steps, tools, model/prompt versions, spend, evals, full Draft text, lineage, approver (human or agent id+version), mode. *Consequences:* agent-approved publishes show the validation log; human edits show public diff; reject reasons per FR-14; step status visible live + historically; budget/eval fields render explicit empty states; secrets scrubbed; no vendor console needed.
- **FR-29: Disagreement signal `[v1 flag; rich UI phase-in]`** — Agent disagreement flagged on Evidence. v1 = boolean/summary flag + short description; phase-in = interactive explorer.
- **FR-30: Mode & enablement transparency `[v1]`** — Current gate mode + recent mode-change audit events visible on `ops.` (timestamp + public-safe operator identity).

#### F6 — Interactive 9-Layer Governance Explainer (LOCKED)

- **FR-31: Interactive layer diagram on `ops.` `[v1]`** — Explore all nine layers via interactive, keyboard-accessible diagram on `ops.`. *Consequences:* layer selection shows plain-language explanation + implementation status (shipped spine vs phase-in); layers link to Run Evidence concepts and/or journal posts; first-class `ops.` surface (e.g. `/layers`), not on main site; main site may link to it.
- **FR-32: Live status hooks `[v1 light; deepen phase-in]`** — Live-enforced layers expose status affordances into recent Runs/evidence. v1 = at least gateway/budget, gate mode, latest Run health reachable from explainer; phase-in = per-layer deep status.

#### F7 — Build Journal (LOCKED)

- **FR-33: Milestone-triggered publishing on `ops.` `[v1]`** — Posts publish on milestones (layer shipped, fault line, bookends), canonical URLs on `ops.`. *Consequences:* human-authored/approved under Patrick's byline (agent-drafted raw material allowed); soft ~1,000-word target; syndication copies allowed without becoming source of truth; main site links only.
- **FR-34: Evidence-linked posts `[v1]`** — A post can attach/link the Run Evidence that motivated it; post ↔ Evidence navigation without leaving `ops.`; fault-line posts can reference specific failed guardrail/rejection/budget stop/disagreement.
- **FR-35: Layer series spine `[v1 content commitment; UI list]`** — Navigable L1→L9 series + fault-line + bookend post types; list by series type; missing layer posts allowed at launch.

#### F8 — Trust, Correction & Open Source (LOCKED)

- **FR-36: Trust furniture `[v1]`** — Main-site F1 surfaces carry persistent "not legal advice," AI-built/governed disclosure, visible last-updated; `ops.` carries complementary AI/gate disclosure. *Consequences:* disclaimer present, no attorney-client claim; AI involvement + gate provenance disclosed (ties FR-18); "Powered by Bizmation" affordance present (chrome UX-deferred).
- **FR-37: Correction / feedback path `[v1]`** — Readers report discrepancies from **both** main site and `ops.`; reports create durable reviewable items (GitHub issues/discussions acceptable v1). *Consequences:* entry points on both surfaces (shared backend fine); submissions acknowledged with tracking ID; operator can mark resolved; fixes reflect in last-updated + lineage; both provenance classes correctable.
- **FR-38: Open source accessibility `[v1]`** — Public repo discoverable from main site and `ops.`; license + contribution/correction expectations findable without login.
- **FR-39: Sustainability affordances `[v1 donations; ads phase-in]`** — Donations link at launch (placement UX-deferred); ads only after explicit neutrality decision.

**Total FRs: 39** (v1: FR-1–4, FR-8–39 with internal phase-in components; pure phase-in: FR-5, FR-6, FR-7)

### Non-Functional Requirements

Extracted from PRD §6 Cross-Cutting NFRs (unnumbered in source; numbered here for traceability):

- **NFR-1 Reliability / cadence:** Scheduled Run every calendar day; empty Runs required; catch-up supplements with flagged Runs; gaps visible (FR-8, FR-10, FR-12).
- **NFR-2 Observability / public harness transparency:** Every Run emits Evidence on public `ops.` sufficient for any visitor to inspect the loop (FR-13, FR-24–FR-28); private debugging may add operator-only detail but must not be the only place truth lives.
- **NFR-3 Accuracy / trust:** Published factual claims require Tier-1 citation or explicit pending-primary label; HITL default; Autonomous mode bounded (FR-9, FR-14, FR-17).
- **NFR-4 Performance (reader):** Interactive F1 maps/tables usable on desktop and mobile; exact budgets deferred to UX/architecture `[ASSUMPTION A8: no hard p95 yet — set in architecture]`.
- **NFR-5 Accessibility:** Keyboard-accessible interactive views for F1, F3 queue, F5, F6. v1 target: best-effort WCAG 2.2 AA (fix blockers on core journeys); strict AA phases in.
- **NFR-6 Security:** Approve/edit/reject and mode controls operator-authenticated; secrets/credentials never published; Draft bodies public while pending, labeled not-live (FR-14–FR-16).
- **NFR-7 Cost control:** Per-Run budget ceiling enforceable (FR-19); spend visible on `ops.`.
- **NFR-8 Loop harnessability:** Operator can schedule, manually trigger, inspect step status, approve/reject, and view evidence without redeploying for routine daily operation (F2–F5).

**Total NFRs: 8**

### Additional Requirements & Constraints

- **Constraints (§7):** general legal info only (UPL/defamation drive HITL default + citation rules); YOLO off-by-default, Patrick-only enablement, mandatory escalation categories; no Kalshi/Robinhood market data in v1; hard per-Run/per-period spend caps with budget-stop as first-class outcome; no reader accounts in v1, operator auth for admin only; capabilities-not-implementation.
- **Harness selection criterion (LOCKED, §7):** prefer a showcase-native managed agent harness; shortlist Cloudflare Agents (+Workflows±Think) vs Amazon Bedrock AgentCore Harness; framework-only stacks secondary; final pick belongs to architecture.
- **Information Architecture (§9, normative):** apex = F1 litigation surfaces + trust/corrections + repo link; `ops.` = F5 Evidence + F6 explainer + F7 journal + mode transparency + full pending Drafts; admin private (F3 actions, mode, triggers); repo public.
- **Non-Goals (§10):** legal advice; real-time trading/odds; v1 market-derived cert %; v1 ads; v1 full 9-layer maturity; v1 rich disagreement explorer; v1 deep programmatic SEO program; vendor pick in PRD.
- **Assumptions Index (§15):** A1–A17 (A1 catch-up supplements; A2 full public Draft text; A3 reject reasons public-by-default; A4 soft journal length; A5 GitHub corrections channel; A7 no reader accounts; A8 perf budgets → architecture; A9 best-effort AA; A10 same-Run-ID resume; A12 both approval paths exercisable in v1; A13 harness criterion; A14 spine not maturity; A15 full trace projection; A16 public step status; A17 YOLO threshold configured in architecture, visible on `ops.`).

### PRD Completeness Assessment

**Strong.** Status `final`; all eight features LOCKED with dates; FRs globally numbered with stable IDs and per-FR testable consequences; MVP cut explicit per-FR (§11); glossary-anchored vocabulary; assumptions tagged and indexed; risks with mitigations; brief↔PRD reconciliation done with intentional-override notes. Deliberate deferrals (named user journeys → UX; performance p95, YOLO threshold value, vendor pick → architecture) are documented, not silent. No missing requirement areas detected for coverage validation purposes.

## Epic Coverage Validation

**Source:** `epics.md` (status: complete, 2026-08-09; frontmatter lists PRD + architecture + UX handoff as inputs, plus 2 scope amendments). The epics document contains its own Requirements Inventory (FR1–FR45, NFR1–NFR11) and an explicit FR Coverage Map. Note: epics renumber PRD `FR-N` as `FRN` — mapping is 1:1 for FR-1…FR-39; FR40–FR45 are epics-only additions promoted from the UX handoff.

### Coverage Matrix

| FR | PRD Requirement (short) | Epic Coverage (claimed → verified in stories) | Status |
|---|---|---|---|
| FR-1 | Circuit-split heat map [v1] | Epic 2 → Story 2.3 (map, ramp, legend, tooltip, keyboard, circuit overlay, fallback) | ✓ Covered |
| FR-2 | State status board [v1] | Epic 2 → Story 2.4 (synced table/map/panel, per-platform, sources) | ✓ Covered |
| FR-3 | Case records [v1 store+list/detail] | Epic 2 → Stories 2.1 (store), 2.5 (list/detail/docket) | ✓ Covered |
| FR-4 | Qualitative cert signal [v1] | Epic 2 → Story 2.8 (5-segment scale, factors, no market data, reserved block) | ✓ Covered |
| FR-5 | Timeline/calendar [phase-in] | Deferred post-v1 (matches PRD phase-in) | ✓ Consistent deferral |
| FR-6 | Player/party map [phase-in] | Deferred as standalone; v1 spirit via FR41 entity ledger → Story 2.7 | ✓ Consistent (partially elevated) |
| FR-7 | Regulatory tracker [phase-in] | Deferred post-v1 (matches PRD phase-in) | ✓ Consistent deferral |
| FR-8 | Daily cadence 365 [v1] | Epic 3 → Story 3.3 (schedule, empty runs, gaps, catch-up, origin flags) | ✓ Covered |
| FR-9 | Two-tier sources [v1] | Epic 3 → Story 3.4 (tier labels, skip reasons, Tier-2-only flags) | ✓ Covered |
| FR-10 | Change detection → drafts [v1] | Epic 3 → Stories 3.3 (empty run), 3.4 (drafts, diffs, no live mutation) | ✓ Covered |
| FR-11 | Run packaging [v1] | Epic 3 → Stories 3.1 (durable model), 3.4 (package, partial failure) | ✓ Covered |
| FR-12 | Operator loop controls [v1] | Epic 3 → Story 3.11 (manual trigger, status, supersede confirm) | ✓ Covered |
| FR-13 | Public harness transparency [v1] | Epic 3 → Stories 3.6+3.7+3.8 jointly (explicit AC in 3.6) | ✓ Covered |
| FR-14 | HITL default [v1] | Epic 3 → Stories 3.9 (approve/edit/reject, reject-reason privacy), 3.10 (diffs) | ✓ Covered |
| FR-15 | Public pending drafts + queue [v1] | Epic 3 → Stories 3.8 (public, badge, not-live), 3.9 (auth actions, keyboard) | ✓ Covered |
| FR-16 | Autonomous enablement [v1] | Epic 3 → Story 3.12 (operator-only, audited, HITL launch default) | ✓ Covered |
| FR-17 | Approval agent + bounds [v1] | Epic 3 → Stories 3.5 (eligibility flags), 3.12 (policy checks, escalations, threshold) | ✓ Covered |
| FR-18 | Provenance labels [v1] | Epic 2 (Story 2.1 seed labels) + Epic 3 (Story 3.10 publish-time freeze; 3.8 rejected archive) | ✓ Covered |
| FR-19 | Gateway + budget [v1] | Epic 3 → Story 3.2 (single front door, budget-stopped, no keys in prompts) | ✓ Covered |
| FR-20 | Guardrails I/O [v1] | Epic 3 → Story 3.5 (rule identity recorded, blocks auto-approve) | ✓ Covered (see note G1) |
| FR-21 | Action policy on tools [v1] | Epic 3 → Story 3.10 (publish only via gate) | ✓ Covered (see note G2) |
| FR-22 | Durable Run state [v1] | Epic 3 → Stories 3.3 (durable steps), 3.7 (public step status), 3.10 (idempotent) | ✓ Covered (see note G3) |
| FR-23 | Scoped identity/context [v1] | Epic 3 → Story 3.5 (scoped identity, authorized context, lineage attribution) | ✓ Covered |
| FR-24 | Observability & evals [v1] | Epic 3 → Stories 3.2 (call records), 3.5 (badges/evals-not-run), 3.7 (full projection) | ✓ Covered |
| FR-25 | Lineage/provenance [v1] | Epic 3 → Story 3.7 (claim → sources → Run → approval walk) | ✓ Covered |
| FR-26 | GRC bundle [v1 thin] | Epic 3 → Story 3.7 (single exportable bundle AC) | ✓ Covered |
| FR-27 | Public run log [v1] | Epic 3 → Story 3.6 (no login, all Run kinds, schedule/next-run) | ✓ Covered |
| FR-28 | Evidence detail [v1] | Epic 3 → Stories 3.7 (full story, empty states), 3.10 (diffs), 3.12 (validation log) | ✓ Covered |
| FR-29 | Disagreement flag [v1] | Epic 3 → Stories 3.5 (set flag), 3.7 (render flag) | ✓ Covered |
| FR-30 | Mode transparency [v1] | Epic 3 → Story 3.12 (mode + threshold + audit public) | ✓ Covered |
| FR-31 | 9-layer explainer [v1] | Epic 4 → Story 4.1 (keyboard, status, links, ops.-only) | ✓ Covered |
| FR-32 | Live status hooks [v1 light] | Epic 4 → Story 4.2 (budget/mode/run-health hooks) | ✓ Covered |
| FR-33 | Journal on ops. [v1] | Epic 4 → Story 4.3 (milestones, byline, canonical URLs, soft length) | ✓ Covered |
| FR-34 | Evidence-linked posts [v1] | Epic 4 → Story 4.4 (post ↔ Evidence, fault-line refs) | ✓ Covered |
| FR-35 | Layer series spine [v1] | Epic 4 → Story 4.3 (series nav, missing-posts-OK) | ✓ Covered |
| FR-36 | Trust furniture [v1] | Epic 1 (Stories 1.2/1.3 chrome) + Epic 2 (Story 2.10) + Epic 4 (4.7 polish) | ✓ Covered |
| FR-37 | Correction path [v1] | Epic 4 → Stories 4.5 (queued submission + tracking ID), 4.6 (moderation) | ✓ Covered (see note G4) |
| FR-38 | Open source access [v1] | Epic 1 (1.3 links) + Epic 2 (2.10) + Epic 4 (4.7 license/contribution) | ✓ Covered |
| FR-39 | Donations [v1] | Epic 2 (2.10 placement) + Epic 4 (4.7 polish) | ✓ Covered |

**Epics-only FRs (not in PRD — additive scope amendments dated 2026-08-09):**

| FR | Source | Epic Coverage | Status |
|---|---|---|---|
| FR40 | UX promotion (elevates FR-3 phase-in filtering) | Epic 2 → Story 2.5 | ✓ Traced to UX handoff |
| FR41 | UX promotion (FR-6 spirit, v1 footprint) | Epic 2 → Story 2.7 | ✓ Traced |
| FR42 | UX new (issue map) | Epic 2 → Story 2.6 | ✓ Traced |
| FR43 | UX new (apex orientation chrome) | Epic 2 → Story 2.2 | ✓ Traced |
| FR44 | UX new (reader cert poll) | Epic 2 → Story 2.9 | ✓ Traced |
| FR45 | Scope amendment (moderated feedback → GitHub issue; amends FR-37 channel behavior) | Epic 4 → Stories 4.5/4.6 | ✓ Traced |

### Missing Requirements

**Critical missing FRs: NONE.** Every PRD v1 FR maps to at least one story with matching acceptance criteria; every PRD phase-in FR (FR-5/6/7) is explicitly deferred, consistent with PRD §11.

**Consequence-level partial-coverage notes (carried to story-quality review, not missing FRs):**

- **G1 (FR-20):** PRD consequence "prompt-injection / untrusted Tier-2 content cannot expand tool permissions" has no explicit story AC (Story 3.5 covers guardrail recording/blocking; 3.10 covers no-direct-publish). Containment is implied by architecture (action policy) but untested by any AC.
- **G2 (FR-21):** PRD consequence "disallowed tool calls are denied **and logged on public Evidence**" — Story 3.10 covers publish-only-via-gate; the deny+log behavior for non-publish tools appears only in the epics inventory line, not in any story AC.
- **G3 (FR-22):** PRD consequence "HITL-interrupted Run resumes under the **same Run ID** without generating a conflicting second Draft set" is in the epics inventory but not an explicit story AC (3.3 covers durable step status generally).
- **G4 (FR-37):** PRD consequence "operator can mark a correction **resolved**, and when content changes, F1 last-updated + lineage reflect the fix" — Stories 4.5/4.6 cover intake and issue-creation moderation; resolution closure is implied (GitHub issue close + normal gate publish) but no story AC asserts the resolved-state + lineage linkage.
- **G5 (FR-2):** PRD consequence "each state detail is a standalone surface (programmatic-SEO target)" — Story 2.4 implements state detail as a sticky panel on the long-scroll apex; no deep-linkable standalone state URL AC. PRD §10 calibrates the SEO *program* as phase-in, so this is a conscious-looking but undocumented soften.

### Coverage Statistics

- Total PRD FRs: **39** (36 with v1 scope; 3 pure phase-in)
- PRD v1 FRs covered in epics: **36 / 36 (100%)**
- PRD phase-in FRs explicitly deferred: **3 / 3** (FR-5, FR-6, FR-7 — all documented with rationale)
- Epics-only FRs: **6** (FR40–FR45), all traced to UX handoff / scope amendments with frontmatter provenance
- FRs in epics but untraceable to PRD or UX: **0**

## UX Alignment Assessment

### UX Document Status

**Found — two complementary artifacts:**
1. `ux-brief-pack.md` (2026-08-09, status: `draft-for-design-handoff`) — PRD-derived design input; declares "if this pack conflicts with the PRD, the PRD wins."
2. `ux-designs/design_handoff_pml/` (2026-08-09) — high-fidelity HTML design reference (4 surfaces + design system + tokens + component vocabulary), explicitly marked "recreate in the app codebase; do not ship as-is."

Timeline note (matters below): architecture.md completed 10:56 → design handoff 13:07 → epics.md 13:31 (same day). **Epics is the most current document and consumed all others.**

### UX ↔ PRD Alignment

- **Screen inventory maps cleanly to FRs.** Brief pack A1–A6 ↔ FR-1/2/3/4/36/37; B1–B7 ↔ FR-27/28/15/30/16-17/31-32/33-35/36-39; C1–C3 ↔ FR-14-15/16/18. IA split (apex vs `ops.` vs admin), glossary vocabulary, posture/status controlled sets, draft≠live rule, empty-state-first principle — all verbatim-consistent with the PRD.
- **Design handoff exceeded the UX brief's own non-goals** (§8 said: do not design rich case filters, player map, poll…). The handoff added: reader poll, issue map, entity ledger, apex orientation chrome, rich case filters. **Resolution exists:** epics frontmatter records a dated scope amendment promoting these to v1 as FR40–FR45. This is a conscious, documented scope expansion — not silent drift — but the **PRD itself was not amended** (FR40–45 exist only in epics).
- **Correction-flow divergence (resolved in epics, stale in handoff):** handoff A6 designs a direct "Open a GitHub issue" button; epics FR45/UX-DR16/UX-DR25 amend this to a **moderated queue** (submission → operator approve → API creates issue). Implementers must follow epics, not the handoff copy, for this flow. The epics doc says so explicitly; the handoff README still shows the old behavior.
- **Reader poll (FR44) has no PRD anchor** but respects PRD constraints: no reader accounts (A7), no market data (§7), disclaimer keeps it subordinate to the qualitative cert signal (FR-4 integrity). Consistent in spirit; carried only by epics.

### UX ↔ Architecture Alignment

**Supported cleanly:** single React+Vite app with host-aware routing (apex/`ops.`/admin) ✓; Cloudflare Access on admin ✓; D1 + Zod contracts for all handoff data needs (states/circuits/cases/entities/runs/drafts/audit/journal) ✓; SVG/TopoJSON d3 maps with pinned SRI ✓; URL-param-driven synced selection matches handoff's shared `sel {state, circuit}` model ✓; keyboard/focus/responsive rules are CSS-level ✓.

**Gaps — architecture.md predates the UX promotions and does not cover:**
1. **Poll tally endpoint (FR44/Story 2.9):** no architecture component for durable vote tally + one-vote-per-browser abuse basics. Trivially implementable (Worker route + D1 table) but currently undocumented — no table naming, no API path, no abuse-control decision.
2. **ECharts for issue map (FR42/Story 2.6):** architecture specifies d3/TopoJSON for maps only; ECharts appears in epics Additional Requirements, not in architecture.md. Vendoring/SRI decision noted only in the handoff caveat.
3. **GitHub Issues API integration (FR45/Story 4.6):** architecture.md explicitly says corrections = "GitHub issues link… **no deep integration v1**." Epics FR45 requires an authenticated GitHub App/PAT with `issues:write`, secret storage, and issue-creation flow. **Direct contradiction, resolved chronologically by the epics amendment — architecture.md was never updated.**
4. **Apex page shape:** architecture's directory tree sketches `StateDetailPage.tsx` / `CaseDetailPage.tsx` as separate pages; UX handoff + epics implement a single long-scroll apex with sticky panels. Reconcilable via URL-param deep links (architecture's own state model), but this is also where PRD FR-2's "state detail as standalone surface (programmatic-SEO target)" quietly weakened (see coverage note G5).

### Warnings

- **W1:** Architecture.md is one amendment behind epics. The epics "Additional Requirements" section functions as the de-facto architecture delta (ECharts, tally endpoint, GitHub App/PAT + moderated queue, seed sources). Recommend either a dated amendment block in architecture.md or explicit acceptance of epics §Additional Requirements as the delta record — before implementation agents treat architecture.md as complete truth.
- **W2:** PRD not amended with FR40–FR45. Downstream traceability currently requires reading epics frontmatter to learn v1 scope grew by six FRs. Recommend a PRD addendum note (one paragraph) to keep the PRD's "canonical capabilities" claim true.
- **W3:** Handoff A6 correction-form copy/behavior is stale vs FR45 moderated flow — flagged in epics; carry into Story 4.5/4.6 so no one implements the handoff button literally.
- **W4:** `ux-brief-pack.md` status remains `draft-for-design-handoff` though it has been consumed downstream — hygiene only.
- **No blockers:** nothing in UX requires a capability the architecture platform cannot provide; all gaps are documentation-sync or small undecided implementation details.

## Epic Quality Review

Standard applied: create-epics-and-stories best practices — user-value epics, epic N independent of epic N+1, no forward story dependencies, just-in-time schema creation, BDD acceptance criteria, starter-template-first for greenfield.

### Epic Structure Validation

| Epic | User value framing | Independence | Verdict |
|---|---|---|---|
| E1 Dual-Site Platform & Design System | Borderline-foundation, but framed as visible outcome (branded apex/`ops.`/admin shells with trust chrome a visitor can load) | Stands alone | ✓ Pass (greenfield foundation with visible output, starter mandated by architecture) |
| E2 Litigation Intelligence Tracker | Strong reader value on seed data — "where does this stand?" answerable without the pipeline | Uses E1 only; explicitly seed-driven; FR18 seed labels avoid needing E3 | ✓ Pass |
| E3 Governed Daily Loop | Strong — operator + public auditor value; closes draft→gate→publish→evidence | Uses E1 (Access, shells) + E2 (F1 schema to publish into); no E4 references | ✓ Pass |
| E4 Governance Narrative & Invited Check | Reader/reporter value (explainer, journal, moderated corrections) | Uses E1–E3 outputs only | ✓ Pass |

**Sequencing is value-sound:** apex ships readable litigation content (E2) before the autonomous loop (E3) — an intentional and defensible order; the governed loop then makes the content live rather than seed.

**Special checks:** Story 1.1 = exact starter-template story required by architecture (`cloudflare/agents-starter` init) ✓. Greenfield indicators: project setup ✓, dev environment ✓ — CI/CD ⚠ (see M2).

### Dependency Analysis

- **Within-epic:** all stories consume only prior-story outputs (1.1→1.2→1.3→1.4; 2.1 feeds 2.2–2.10; 3.1/3.2 feed 3.3–3.12; 4.1→4.2, 4.5→4.6). **No hard forward dependencies found.**
- Three *soft* forward references are properly scoped as partial delivery, not blockers: 1.3 ("Access may still be stubbed until 1.4"), 2.3 ("Story 2.4 can complete the sync"), 2.10 ("form wiring may queue-only until Epic 4 FR45"). Each story remains completable alone. ✓
- **Schema timing:** F1 tables created in 2.1 (first needed), Run/Draft/Evidence tables in 3.1 (first needed) — no create-everything-upfront violation. ✓ Poll-tally and feedback-submission storage are implied by 2.9/4.5 but never named as migrations (see m3).

### Acceptance Criteria Quality

Given/When/Then used consistently; FR/UX-DR traceability tags inline in nearly every AC (excellent); error/empty paths designed into ACs (map-topology fallback 2.3, partial connector failure 3.4, budget-stop 3.2, gaps/catch-up 3.3, unauthenticated denial 1.4/3.9/4.6). This is well above typical AC hygiene.

### Findings

#### 🔴 Critical Violations

**None.** No technical-milestone epics, no forward dependencies, no epic-sized unfinishable stories.

#### 🟠 Major Issues

- **M1 — No test-framework story/AC.** Architecture mandates "add Vitest (+ Workflows vitest patterns) in early stories" (v4.1.10 verified), but no story in any epic sets up or requires tests. Risk: implementation agents ship all 33 stories untested. *Remediation:* add Vitest setup to Story 1.1/1.2 ACs and a "tests exist for gate write-path + workflow idempotency" AC to 3.3/3.10 (the two highest-risk stories).
- **M2 — No CI/CD / environments / domain-binding story.** Architecture specifies Workers Builds, dev/staging/prod Wrangler envs with separate D1s, and custom domains apex + `ops.`; epics list it under Additional Requirements but no story delivers it (1.1 leaves "stubs OK"; 1.4 only documents Access binding for staging/prod). *Remediation:* add Story 1.5 "Deploy pipeline & environments" (Workers Builds, three envs, separate D1s, custom-domain binding) so E2+ stories have somewhere real to ship.
- **M3 — Story 3.5 is overloaded.** It carries five FR threads (drafter/reviewer + eval badges FR15/FR24, disagreement FR29, auto-approve ineligibility inputs FR17, guardrails FR20, scoped identity/context FR23). Each AC is testable, but this is 2–3 stories of work behind one story ID. *Remediation:* split guardrails + scoped identity/context (FR20/FR23) into their own story, or consciously accept the density and size the sprint accordingly.
- **M4 — Governance consequences without AC homes (G1–G4 from coverage step).** Four PRD-testable consequences have no story AC: prompt-injection cannot expand tool permissions (FR-20); disallowed tool calls denied **and publicly logged** (FR-21); HITL resume continues the **same Run ID** without a duplicate draft set (FR-22/A10); correction marked **resolved** with fix reflected in last-updated/lineage (FR-37). *Remediation:* one AC each — FR-20/21 into 3.5 or 3.2, FR-22 into 3.3 or 3.10, FR-37 into 4.6.

#### 🟡 Minor Concerns

- **m1 — 2.10 soft wording:** "form wiring **may** queue-only until Epic 4" — replace "may" with a definite v-scope ("submits to queue endpoint stub; moderation arrives in 4.6") so the story's done-state is unambiguous.
- **m2 — 4.3 undecided storage:** "journal content storage (D1 **and/or** markdown pipeline)" leaves a decision inside a story; architecture only covers journal *metadata* in D1. Pick one before implementation.
- **m3 — Unnamed migrations:** poll tally (2.9) and pending submissions (4.5) require durable storage but no AC names the table/migration; fine under create-when-needed, but say so explicitly to keep D1 migration discipline.
- **m4 — DST unaddressed:** 3.3 schedules "noon ET" but no AC covers the noon-ET-across-DST decision (architecture open gap #4). Add one line (fixed UTC vs DST-following, and which).
- **m5 — State-detail deep link (G5):** long-scroll panel design quietly drops PRD's "standalone state surface (SEO target)" consequence; a `?state=` URL-param deep-link AC on 2.4 would preserve the capability cheaply.
- **m6 — Performance budgets exist nowhere** (PRD A8 deferred → architecture deferred again). Accepted by both documents; note that no story will catch a regressing map render until someone sets even a smoke threshold.
- **m7 — Architecture's five "important gaps" have implicit story homes but no pinned values:** YOLO threshold (→3.12), eval scoring details (→3.5), Access IdP (→1.4), noon-ET cron expression (→3.3), launch role→model pins (→3.2). Each story should record the concrete value when it lands.

## Summary and Recommendations

### Overall Readiness Status

**READY — with a short pre-sprint punch list.**

No critical violations anywhere in the chain. PRD (final, locked) → Architecture (complete, platform locked) → UX (brief + high-fi handoff) → Epics (complete, 4 epics / 33 stories) trace cleanly: **100% of PRD v1 FRs are covered by stories with matching, testable, FR-tagged acceptance criteria**, phase-in FRs are correctly deferred, and the six scope additions (FR40–45) all carry documented UX/amendment provenance. The four major findings are document-level fixes (roughly an hour of epics/architecture edits), not planning rework.

### Critical Issues Requiring Immediate Action

None at critical severity. The four **major** items to fold in before sprint planning:

1. **M1 — Testing is unstoried.** Add Vitest setup to Epic 1 and test ACs to Stories 3.3/3.10 (gate write-path, idempotent publish) — otherwise 33 stories can complete "done" untested against a governance thesis that runs on receipts.
2. **M2 — CI/CD, environments & domains unstoried.** Add Story 1.5 (Workers Builds, dev/staging/prod envs with separate D1s, apex + `ops.` custom domains).
3. **M3 — Split or consciously size Story 3.5** (currently carries FR15/17/20/23/24/29 threads).
4. **M4 — Four PRD consequences lack AC homes:** FR-20 injection containment, FR-21 deny+public-log, FR-22 same-Run-ID resume, FR-37 resolution→lineage. One AC each closes them.

### Recommended Next Steps

1. **Amend `epics.md`** with M1–M4 (add Story 1.5, split/size 3.5, add ~6 ACs) and the minor wording fixes m1/m2/m4 (2.10 definite scope, journal storage decision, DST decision).
2. **Sync `architecture.md`** with a dated amendment block covering the epics-era deltas: ECharts, poll tally endpoint, GitHub App/PAT moderated-issue flow (replacing "no deep integration"), and optionally the long-scroll apex vs detail-pages routing note with `?state=` deep links (m5/W1).
3. **Add a one-paragraph PRD addendum note** recording FR40–FR45 promotion so the PRD's "canonical capabilities" claim stays true (W2); flip `ux-brief-pack.md` status from draft (W4).
4. **Then proceed to sprint planning** (`bmad-sprint-planning`) — with the punch list applied, the artifact chain is implementation-ready; Story 1.1's scaffold command is unambiguous and first-day executable.
5. During implementation, record the five deferred concrete values in their host stories as they land: YOLO threshold (3.12), eval method (3.5), Access IdP (1.4), noon-ET cron/DST expression (3.3), launch model pins (3.2) (m7).

### Final Note

This assessment identified **15 distinct issues across 4 categories** (0 critical, 4 major, 7 minor, 4 documentation-sync warnings) against 39 PRD FRs, 8+3 NFRs, 25 UX-DRs, 4 epics, and 33 stories. Coverage and traceability are exceptional — the FR-tagged AC discipline in `epics.md` is exactly what downstream implementation agents need. The gaps cluster in delivery scaffolding (tests, CI/CD) and a handful of governance consequences that exist in the PRD but not yet as testable ACs. Address the majors before sprint planning; the minors can ride along in their host stories. Proceeding as-is is viable but would ship the M1/M2 risk into the first sprint.

---

**Assessment date:** 2026-08-09
**Assessor:** BMAD Implementation Readiness workflow (facilitated by Claude, reviewed with Patrick)
**Documents assessed:** `prds/prd-PML-2026-06-18/` (prd + addendum + reconcile) · `architecture.md` · `ux-brief-pack.md` + `design_handoff_pml/` · `epics.md`

---

## Punch List Applied (2026-08-09, same session)

All majors, actionable minors, and doc-sync warnings were applied immediately after the assessment:

| Item | Resolution |
|---|---|
| M1 | Vitest ACs added: Story 1.1 (setup + sample test), 3.3 (Run lifecycle coverage), 3.6 (adversarial fixture test), 3.11 (gate write-path + idempotent publish); testing line added to epics Additional Requirements |
| M2 | New Story 1.5 "Deploy Pipeline & Environments" (Workers Builds, dev/staging/prod envs with separate D1s, custom domains apex + `ops.`, per-env secrets, verified deploy) |
| M3 | Story 3.5 split — new Story 3.6 "Guardrails, Action Policy & Scoped Context (Enforcement Layer)" carries FR20/FR21/FR23; old 3.6–3.12 renumbered 3.7–3.13 with all cross-references updated |
| M4 | G1 (injection containment) + G2 (deny+public-log) → Story 3.6 ACs; G3 (same-Run-ID resume) → Story 3.3 AC; G4 (correction resolved → lineage) → Story 4.6 AC |
| m1 | Story 2.10 correction-entry scope made definite (shell only; no fake submit; wiring in 4.5/4.6) |
| m2 | Journal storage decided: D1 (metadata + markdown body, app-rendered) — Story 4.3 + architecture amendment |
| m3 | Migrations named: `poll_votes` (Story 2.9), `submissions` (Story 4.5) |
| m4 | Noon-ET DST AC added to Story 3.3 (dual-UTC-cron + ET-hour guard, or documented fixed-UTC; public display matches) |
| m5 | `?state=` deep-link AC added to Story 2.4 |
| W1 | architecture.md: frontmatter amendment + "Post-Epics Amendments (2026-08-09)" section (ECharts, poll tally, moderated GitHub-issue flow superseding "no deep integration", long-scroll apex routing clarification, journal D1, testing mandate) |
| W2 | PRD addendum §4 scope-amendment record for FR40–FR45 |
| W3 | Covered by W1/W2 records + existing epics amendment note (handoff A6 copy flagged as superseded) |
| W4 | ux-brief-pack.md status flipped to final/consumed |

**Not applied (accepted deferrals):** m6 (performance budgets — PRD A8 stands), m7 (concrete config values recorded in host stories as they land: Access IdP → 1.4, model pins → 3.2, cron expression → 3.3, eval method → 3.5, YOLO threshold → 3.13).

**Story count is now 35 (was 33).** Overall status: **READY — proceed to `bmad-sprint-planning`.**
