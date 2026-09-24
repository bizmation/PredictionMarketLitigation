---
stepsCompleted: [1, 2, 3, 4]
status: complete
completedAt: '2026-08-09'
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-PML-2026-06-18/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-brief-pack.md
  - _bmad-output/planning-artifacts/ux-designs/design_handoff_pml/README.md
  - _bmad-output/planning-artifacts/ux-designs/design_handoff_pml/PML Design System.html
  - _bmad-output/planning-artifacts/ux-designs/design_handoff_pml/PML Tracker.html
  - _bmad-output/planning-artifacts/ux-designs/design_handoff_pml/PML Ops.html
  - _bmad-output/planning-artifacts/ux-designs/design_handoff_pml/PML Admin.html
  - _bmad-output/planning-artifacts/ux-designs/design_handoff_pml/pml.css
scopeAmendments:
  - '2026-08-09: UX handoff promotes to v1 — reader poll, issue map, entity ledger, apex chrome (KPI/credibility/brief), rich case filters (elevates FR-3 phase-in)'
  - '2026-08-09: Correction/feedback form is moderated — submissions queue for operator approval before a GitHub issue is created'
  - '2026-08-09: Readiness punch list applied (implementation-readiness-report-2026-08-09) — added Story 1.5 (CI/CD, envs, domains) and Story 3.6 (guardrails/action-policy/scoped-context enforcement, split from 3.5; old 3.6–3.12 renumbered 3.7–3.13); Vitest test ACs (1.1, 3.3, 3.11); governance-consequence ACs for FR20/FR21/FR22/FR37; state deep-link AC (2.4); named migrations for poll tally (2.9) and submissions (4.5); journal storage decided D1 (4.3); noon-ET DST AC (3.3); 2.10 scope made definite'
---

# PML - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for PML, decomposing the requirements from the PRD, UX Design handoff, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Circuit-split heat map — interactive U.S. circuits/states map color-coded by posture (controlled set); legend; hover tooltip; click → region detail with case + Tier-1 links; untracked regions distinct from unsettled; last-updated; keyboard-accessible; selection syncs with status board; drafts never mutate live map. `[v1]`

FR2: State-by-state status board — per-state operational status {go, restricted, banned}, cases, posture, last-updated as synced map + sortable/filterable table; state detail answers per-platform legality; ≥1 primary source per claim; cross-highlight with heat map; recent-change "updated" badge. `[v1]`

FR3: Case records & case tracker — browse cases (caption, court, legal track, posture, last docket event); detail with reverse-chron docket events source-linked; bidirectional links to states/circuits; single source of truth for posture. `[v1 store + list/detail; rich filtering elevated by UX — see FR40]`

FR4: Cert-likelihood signal — qualitative (no %), named factors, last-review + approver; no Kalshi/Robinhood market data in v1; reserve UI for future market-derived value + methodology + reflexivity caveat. `[v1]`

FR5: Litigation timeline / "what's next" calendar. `[phase-in — not in UX v1 layouts]`

FR6: Player / party map. `[phase-in as standalone FR; UX entity ledger FR41 covers v1 platform footprint]`

FR7: Regulatory tracker. `[phase-in — not in UX v1 layouts]`

FR8: Daily cadence (365) — scheduled Run every calendar day (noon ET target); gaps visible; catch-up supplements with flagged Runs; multiple Runs per date allowed with origin flags. `[v1]`

FR9: Two-tier source monitoring — Tier-1 citation of record vs Tier-2 leads; published claims need Tier-1 or pending-primary label; Tier-2-only drafts ineligible for agent auto-approve; skipped sources recorded publicly. `[v1]`

FR10: Change detection → draft generation — material changes produce Drafts with entity diffs + sources + confidence/eval inputs; empty (no-change) days still produce Run + Evidence; Drafts cannot mutate live F1. `[v1]`

FR11: Run packaging for Approval Gate — structured Drafts (0..N) + Evidence stub + mode inputs; partial failure explicit; durable for late human review. `[v1]`

FR12: Operator loop controls — manual trigger (`manual` origin), inspect status, safe replay/supersede with confirmation; statuses mirrored publicly. `[v1]`

FR13: Public harness-run transparency — every Run publicly inspectable end-to-end (obligation; F5 is surface). `[v1]`

FR14: HITL mode (default) — every Draft needs human approve/edit/reject before live F1; full before/after diff on edit; reject reason public by default with optional private mark. `[v1]`

FR15: Public pending drafts + operator action queue — full draft body public on `ops.` labeled not-live; confidence/eval badge; authenticated approve/edit/reject; keyboard-accessible admin queue. `[v1]`

FR16: Autonomous mode enablement — off by default; Patrick-only enable/disable; audited event visible on `ops.`. `[v1]`

FR17: Approval agent + action-policy bounds — auto-approve only within policy + threshold; escalate party characterization, posture flips, low-confidence/eval-fail, Tier-2-only, evals-not-run; decisions + threshold public. `[v1]`

FR18: Provenance labels on publish — every published item labeled human-approved or agent-approved; frozen at publish time. `[v1]`

FR19: Gateway + budget envelope — all model/tool calls through front door; spend attributable; budget-stopped first-class Run status. `[v1]`

FR20: Guardrails on I/O — failures recorded publicly; hard fails block agent auto-approve. `[v1]`

FR21: Action policy on tools — publish only via Approval Gate; disallowed tools denied + logged. `[v1]`

FR22: Orchestration with durable Run state — HITL resume same Run ID; idempotent retries; public step-level status. `[v1]`

FR23: Scoped identity & authorized context — agents only use authorized context; attributable in lineage. `[v1]`

FR24: Observability & evals — full Evidence projection on `ops.` (not vendor console as SoR); evals or explicit "evals not run". `[v1]`

FR25: Lineage / provenance — walk published claim → sources → Run → approval. `[v1]`

FR26: GRC evidence packaging — thin exportable Evidence bundle per Run. `[v1 thin]`

FR27: Public run log on `ops.` — no login; status/time/origin/mode/spend/steps/approval; all Run kinds visible; schedule + next-run public; link to Evidence. `[v1]`

FR28: Evidence detail — full projected story: steps, tools, models/prompts, spend, evals, full Draft, lineage, approver, mode, validation log, edit diffs, reject reasons, empty states for zero/not-run. `[v1]`

FR29: Disagreement signal — v1 boolean/summary flag + short description. `[v1 flag]`

FR30: Mode & enablement transparency — current mode + mode-change audit on `ops.`. `[v1]`

FR31: Interactive 9-layer governance explainer on `ops.` — Core/Mantle/Crust; keyboard-accessible; plain-language + implementation status + links to Evidence/journal. `[v1]`

FR32: Live status hooks from explainer — at least gateway/budget, Approval Gate mode, latest Run health. `[v1 light]`

FR33: Milestone-triggered build journal on `ops.` — Patrick byline; ~1k words soft; canonical on `ops.`. `[v1]`

FR34: Evidence-linked journal posts — post ↔ Evidence navigation on `ops.`. `[v1]`

FR35: Layer series spine — navigable L1→L9 + fault-line + bookend; missing posts OK at launch. `[v1]`

FR36: Trust furniture — not-legal-advice, AI/governed disclosure, last-updated, Powered by Bizmation on F1; complementary disclosure on `ops.`. `[v1]`

FR37: Correction / feedback path — from apex and `ops.`; durable queued submission + tracking ID on submit; resolve updates last-updated/lineage when content changes. `[v1 — see FR45 for moderated GitHub publish]`

FR38: Open source accessibility — public repo linked from apex and `ops.`; license/contribution findable. `[v1]`

FR39: Sustainability affordances — donations at launch; ads phase-in. `[v1 donations]`

#### UX-promoted functional requirements (scoped into v1 — 2026-08-09)

FR40: Rich case filtering on apex — free-text search plus filters by posture, issue tag, state, and circuit; Clear resets; list/detail stay in sync with active filters. `[v1 — elevates former FR-3 phase-in]`

FR41: Entity ledger — per-platform footprint (Kalshi, Polymarket US, Robinhood, etc.): role, matter list, and links into case records. `[v1 — UX promotion of FR-6 spirit]`

FR42: Issue map — interactive taxonomy visualizations (issue × posture matrix, emergence timeline, frequency strip, sunburst) that set an active issue, list matching matters, and filter the case record in sync. `[v1 — new from UX]`

FR43: Apex orientation chrome — credibility strip (numbered claims + founder card + repo), masthead with CTAs/meta/"Latest developments", KPI row (matters tracked, states, appeals pending, changed in 30 days), and executive summary plain-language brief. `[v1 — new from UX]`

FR44: Reader cert poll — thumbs up/down on cert plus OT term picker; results only after vote; labelled percentage bars; unscientific/not-evidence/not-market disclaimer verbatim; one vote per browser; durable tally endpoint (not localStorage-only in production). `[v1 — new from UX]`

FR45: Moderated feedback → GitHub issue — reader correction/feedback forms create a durable **pending submission** (not a public GitHub issue yet); operator reviews in admin and **approves or rejects** creating the GitHub issue; on approve, system opens the issue in the public repo and links the issue URL + number back to the submission/tracking ID; on reject, submission is closed without a GitHub issue (optional public/operator reason); spam/abuse can be rejected without filing. `[v1 — amends UX handoff direct-open behavior]`

#### Operator steering functional requirements (added 2026-08-09 — sprint change proposal)

FR46: Draft interrogation — conversational, grounded, read-only questioning of a pending Draft's basis; cites Run Evidence; "not recorded" over reconstruction. `[v1]`

FR47: Conversational Draft revision — natural-language revision instructions regenerate the Draft under the same Run ID; original + all revisions preserved and publicly diffable; revised Drafts re-run guardrails and eval; writes Drafts only. `[v1]`

FR48: Conversational pipeline steering — versioned, audited, revertible source/pipeline config changes by instruction; YOLO threshold, budget ceiling, mode, guardrails, and action-policy allowlist explicitly NOT chat-reachable. `[v1]`

FR49: Standing corrections / durable guidance — promote corrections to versioned, revocable, publicly readable standing guidance; authorized context under FR23; advisory to drafting only; capped and reviewable. `[v1]`

FR50: Steering transparency & containment — turns public by default, published at turn completion immediately (no as-you-type streaming, no publish step, no curation gap); redaction decided at submit; private-marking hides content but never causation; scoped steward identity with no publish tool; injection-resistant; operator-only; spend attributed to Run budget. `[v1]`

### NonFunctional Requirements

NFR1: Reliability / cadence — scheduled Run every calendar day; empty Runs required; catch-up supplements; gaps visible.

NFR2: Observability / public harness transparency — every Run emits Evidence on public `ops.` sufficient for any visitor; private vendor logs are not the only truth.

NFR3: Accuracy / trust — published factual claims require Tier-1 citation or explicit pending-primary label; HITL default; Autonomous mode bounded.

NFR4: Performance (reader) — interactive F1 maps/tables usable on desktop and mobile; two-column layouts collapse ~940px per UX.

NFR5: Accessibility — keyboard-accessible F1, F3 queue, F5, F6; v1 best-effort WCAG 2.2 AA (fix blockers); focus ring `outline: 2px solid accent; outline-offset: 2px`.

NFR6: Security — approve/edit/reject and mode controls operator-authenticated (Cloudflare Access); secrets never published; Draft bodies public while pending and labeled not-live.

NFR7: Cost control — per-Run budget ceiling enforceable; spend visible on `ops.`; budget-stopped first-class.

NFR8: Loop harnessability — schedule, manually trigger, inspect steps, approve/reject, view evidence without redeploy for routine daily operation.

NFR9: Legal / safety — general legal information only; no advice to identifiable persons; UPL/defamation drive HITL + citations.

NFR10: Data ToS — no Kalshi/Robinhood market data ingestion for AI features in v1.

NFR11: Privacy — no reader accounts in v1; correction form allows anonymous filing; name/contact optional with public-GitHub warning.

### Additional Requirements

- **Starter template (Epic 1 Story 1):** `npm create cloudflare@latest -- pml --template cloudflare/agents-starter` — TypeScript, React/Vite, Agents SDK, Durable Objects.
- **Platform lock:** Cloudflare Workers + Agents + Workflows + AI Gateway; dual domains apex + `ops.`; Access-gated `/admin`.
- **Data:** D1 canonical store + DO for in-flight Runs; Wrangler D1 migrations day 1; Zod shared contracts.
- **Multi-agent + model routing:** Orchestrator Workflow → connectors → drafter → reviewer → HITL/YOLO; `gateway.complete({ role })` only; OpenRouter via AI Gateway; versioned role→model config visible/audited on `ops.`.
- **Maps:** SVG/TopoJSON (us-atlas states-10m); d3 + topojson with pinned SRI; never freehand US geometry; map failure falls back to circuit index + board.
- **Charts:** ECharts for issue map (vendor if SRI required).
- **Evidence projector:** Full public projection from app store; scrub secrets; vendor consoles private-only.
- **CI/CD:** Workers Builds + Wrangler envs (dev/staging/prod, separate D1s).
- **Seed content:** Case-law surveys (June + Aug 2026) as initial F1 corpus.
- **Corrections channel:** GitHub issues remain the public filing target, but **creation is operator-gated** (FR45): form → pending submission + tracking ID → admin approve/reject → on approve, GitHub Issues API creates the issue and stores the link. Requires a GitHub App or PAT with `issues:write` scoped to the public repo (secret in Worker bindings; never exposed publicly).
- **Poll tally:** Production needs a tally endpoint (replace localStorage).
- **Design handoff is reference, not shippable code** — recreate in React/Workers patterns; do not deploy HTML prototypes as-is.
- **Testing:** Vitest (+ Cloudflare Workers/Workflows vitest patterns) configured in Epic 1; tests co-located `*.test.ts(x)`; gate write-path, publish idempotency, and Run lifecycle must carry test coverage (readiness M1).
- **Implementation sequence (architecture):** scaffold → domains/Access → schema/seed → AI Gateway/roles → DailyRunWorkflow → Approval Gate → F1 views → `ops.` Evidence → explainer/journal.

### UX Design Requirements

UX-DR1: Implement Classical + PML design tokens (Cormorant Garamond / Lora; bg `#f3f2f2`, accent `#b68235`; stroke-not-fill cards/buttons; hairline rules; no pill-heavy chrome / heavy shadows / emoji / aggressive gradients).

UX-DR2: Posture ramp component (5 steps, darker = worse for platforms) always paired with label; untracked = near-white + dashed hairline.

UX-DR3: Operational status badges — outlined muted semantics: `go` / `restricted` (hatch) / `banned` (solid deep); never traffic-light toy UI.

UX-DR4: ProvenanceLabel component — `human-approved` (solid accent dot) vs `agent-approved` (dashed border + hollow dot).

UX-DR5: NotLiveDraftBanner + `.draft` ticket-edge treatment — mandatory on all pending Draft surfaces; impossible to confuse with live F1.

UX-DR6: RunStatusChip + OriginFlag for published / awaiting / empty / failed / budget-stopped / rejected / catch-up / manual / scheduled.

UX-DR7: TrustBar + TopBar chrome on apex/`ops.`/admin — positioning line, last-updated, provenance, not-legal-advice warn, discoverability links across surfaces.

UX-DR8: Apex long-scroll section order matching handoff: trust → credibility → masthead → KPI → poll → brief → circuits → states → issues → cases → entities → cert → trust/correction → ops handoff → footer.

UX-DR9: Circuit heat map layout — map 1.5fr + circuit index 1fr; real TopoJSON geometry; circuit boundary overlays; synced selection with status board; legend before map; keyboard `role=button` + aria-labels.

UX-DR10: State status board — sortable columns + filter chips All/Go/Restricted/Banned; sticky detail panel with per-platform breakdown table, why-note, primary sources, jump to case / report error.

UX-DR11: Case record — list + detail; italic captions; party role + lifecycle weight; issue tags (first = controlling in accent); reverse-chron hairline docket timeline.

UX-DR12: Cert signal — 5-segment qualitative scale (Remote→Near-certain); factors list; dashed reserved block for future market-derived %.

UX-DR13: Reader poll UI + disclaimer copy verbatim; results reveal post-vote with voter's choice in accent.

UX-DR14: Issue map four views (matrix, emergence, frequency, sunburst) with active-issue panel + synced case filter; custom ECharts theme from tokens.

UX-DR15: Entity ledger — platform cards/rows with matter lists linking to cases.

UX-DR16: Correction/feedback form — type/where/detail/source + optional name/contact; copy clarifies submission is **queued for review** (not instantly a public GitHub issue); submit → tracking ID acknowledgment (`PML-C-…`); after operator approve, UI/ops can show linked GitHub issue URL.

UX-DR25: Admin feedback-moderation queue — list pending correction/feedback submissions; approve (creates GitHub issue via API, stores issue URL/number) or reject (no issue); keyboard-accessible; outcome visible to operator (and optionally on `ops.` / acknowledgment follow-up).

UX-DR17: `ops.` run log + Evidence detail layouts — step timeline, spend/eval empty states, full draft, lineage, before/after diff, disagreement flag, mode transparency + threshold display.

UX-DR18: Nine-layer explainer — Earth Core/Mantle/Crust interaction; layer detail panel; live hooks for budget, gate mode, latest run health.

UX-DR19: Build journal list/post — series nav (layer / fault-line / bookend); Evidence attach links; founder first-person presentation.

UX-DR20: Admin approval queue — J/K navigate, A approve, E edit, R reject; edit buffer; reject reason + private-portion control; mode toggle + threshold slider; audit trail panel.

UX-DR21: EmptyState component — dashed frame, reason, what it means for the reader (never apology-only).

UX-DR22: Responsive collapse — two-column grids → one at 940px; sticky panels become static when stacked; map remains usable.

UX-DR23: Founder portrait matted in `.plate` wrapper; Lucide icons; tabular nums via `.num` for figures/tables/dates.

UX-DR24: Recreate handoff pixel-accurately in app codebase — HTML prototypes are design reference only.

### FR Coverage Map

FR1: Epic 2 — Circuit-split heat map  
FR2: Epic 2 — State-by-state status board  
FR3: Epic 2 — Case records list/detail  
FR4: Epic 2 — Qualitative cert signal  
FR5: Deferred post-v1 — Litigation timeline  
FR6: Deferred post-v1 as standalone (v1 via FR41 entity ledger in Epic 2)  
FR7: Deferred post-v1 — Regulatory tracker  
FR8: Epic 3 — Daily cadence (365)  
FR9: Epic 3 — Two-tier source monitoring  
FR10: Epic 3 — Change detection → drafts  
FR11: Epic 3 — Run packaging for gate  
FR12: Epic 3 — Operator loop controls  
FR13: Epic 3 — Public harness-run transparency  
FR14: Epic 3 — HITL mode default  
FR15: Epic 3 — Public pending drafts + admin queue  
FR16: Epic 3 — Autonomous mode enablement  
FR17: Epic 3 — Approval agent + policy bounds  
FR18: Epic 2 (seed labels) + Epic 3 (publish-time freeze) — Provenance labels  
FR19: Epic 3 — Gateway + budget envelope  
FR20: Epic 3 — Guardrails on I/O  
FR21: Epic 3 — Action policy on tools  
FR22: Epic 3 — Durable Run orchestration  
FR23: Epic 3 — Scoped identity & context  
FR24: Epic 3 — Observability & evals projection  
FR25: Epic 3 — Lineage / provenance  
FR26: Epic 3 — Thin GRC Evidence bundle  
FR27: Epic 3 — Public run log  
FR28: Epic 3 — Evidence detail  
FR29: Epic 3 — Disagreement signal (flag)  
FR30: Epic 3 — Mode & enablement transparency  
FR31: Epic 4 — Interactive 9-layer explainer  
FR32: Epic 4 — Live status hooks on explainer  
FR33: Epic 4 — Build journal publishing  
FR34: Epic 4 — Evidence-linked journal posts  
FR35: Epic 4 — Layer series spine navigation  
FR36: Epic 1 (chrome) + Epic 2 (F1 surfaces) — Trust furniture  
FR37: Epic 4 — Correction/feedback path (queued submission)  
FR38: Epic 1 (links) + Epic 2 (apex placement) — Open source accessibility  
FR39: Epic 2 (placement) + Epic 4 (polish) — Donations at launch  
FR40: Epic 2 — Rich case filtering  
FR41: Epic 2 — Entity ledger  
FR42: Epic 2 — Issue map  
FR43: Epic 2 — Apex orientation chrome  
FR44: Epic 2 — Reader cert poll  
FR45: Epic 4 — Moderated feedback → GitHub issue  

FR46: Epic 3 → Story 3.15 — Draft interrogation
FR47: Epic 3 → Story 3.16 — Conversational revision
FR48: Epic 3 → Story 3.17 — Pipeline steering
FR49: Epic 3 → Story 3.18 — Standing guidance
FR50: Epic 3 → Stories 3.14 and 3.8 — Steering transparency and containment

## Epic List

### Epic 1: Dual-Site Platform & Design System
Visitors (and the operator) can use branded apex, `ops.`, and Access-gated admin shells with Classical/PML tokens, trust chrome, empty states, and dual-domain routing — a production-shaped foundation ready for real content and the governed loop.
**FRs covered:** Foundation for all epics; FR36/FR38 chrome starters; UX-DR1–7, UX-DR21–24  
**Implementation note:** Story 1 initializes `cloudflare/agents-starter` per Architecture.

### Epic 2: Litigation Intelligence Tracker (Apex)
Readers can answer “where does this stand?” and “is [platform] legal in [state]?” on the apex long-scroll: heat map, status board, cases (rich filters), cert signal, issue map, entity ledger, reader poll, KPI/credibility/brief, and trust furniture — initially on seed data with provenance and last-updated.
**FRs covered:** FR1, FR2, FR3, FR4, FR18 (seed), FR36, FR38, FR39 (placement), FR40, FR41, FR42, FR43, FR44  
**UX-DRs:** UX-DR8–15, UX-DR22–23

### Epic 3: Governed Daily Loop (Pipeline → Gate → Live)
Patrick can run the daily harness; anyone can inspect Runs, Evidence, and pending Drafts on `ops.`; HITL (default) or bounded Autonomous mode approves/edits/rejects; approved Drafts update live F1 with frozen provenance and public diffs — closing draft → gate → publish → evidence.
**FRs covered:** FR8–FR30, FR46–FR50
**UX-DRs:** UX-DR5–7, UX-DR17, UX-DR20 (queue/mode)

### Epic 4: Governance Narrative & Invited Check
Readers explore the nine-layer explainer and build journal on `ops.`; anyone can submit corrections/feedback that queue for operator approval before a public GitHub issue is created; donations and repo affordances complete the trust loop.
**FRs covered:** FR31–FR35, FR37, FR45 (and polish FR36/FR38/FR39 as needed)  
**UX-DRs:** UX-DR16, UX-DR18–19, UX-DR25

**Deferred post-v1:** FR5 (timeline), FR7 (regulatory tracker), residual FR6 beyond FR41 entity ledger.

## Epic 1: Dual-Site Platform & Design System

Visitors (and the operator) can use branded apex, `ops.`, and Access-gated admin shells with Classical/PML tokens, trust chrome, empty states, and dual-domain routing — a production-shaped foundation ready for real content and the governed loop.

### Story 1.1: Scaffold Cloudflare Agents Starter

As a developer (Patrick),
I want the repo initialized from the Cloudflare Agents Starter,
So that we have a TypeScript + React/Vite + Agents/DO foundation to build PML on.

**Acceptance Criteria:**

**Given** a clean workspace for PML
**When** the project is scaffolded with `npm create cloudflare@latest -- pml --template cloudflare/agents-starter` (or equivalent in-repo init)
**Then** the app runs locally via the starter’s `npm run dev` / Wrangler flow
**And** TypeScript, Vite, `@cloudflare/vite-plugin`, and Agents SDK wiring are present
**And** the starter’s default UI is replaceable (not treated as brand lock)
**And** Wrangler config is ready for later D1 / Access / multi-domain bindings (stubs OK)
**And** Vitest is configured (with Cloudflare Workers/Workflows test patterns per architecture) and at least one sample test passes via `npm test` (readiness M1)

### Story 1.2: Design Tokens & Core Trust Components

**Approved steering amendment (August 9 §4.5):** Preserve the scaffold `ChatAgent` class and chat transport as the foundation for 3.14; remove starter branding, demo tools and template copy. Keep the chat surface unreachable by unauthenticated users pending 1.4 authentication.

As a reader (and future implementers),
I want Classical + PML design tokens and trust components available in the app,
So that every surface shares the editorial look and load-bearing trust UI (provenance, not-live drafts, status).

**Acceptance Criteria:**

**Given** the scaffolded React/Vite app (Story 1.1)
**When** Classical token sheet + PML component layer are integrated (from the UX handoff reference)
**Then** tokens for color, type (Cormorant Garamond / Lora), spacing, radius, and shadows are usable as CSS variables
**And** components/classes exist for: posture swatches (5-step ramp + untracked dashed), operational status badges (`go` / `restricted` / `banned`), ProvenanceLabel (human- vs agent-approved), NotLiveDraftBanner / `.draft` ticket edge, RunStatusChip + OriginFlag, EmptyState (dashed frame + reason), LastUpdated, Warn chip
**And** accent is stroke-oriented (outlined cards/buttons; no solid pill-heavy chrome)
**And** focus ring uses accent outline with 2px offset (UX-DR / NFR5)
**And** HTML prototypes are not shipped as production pages — tokens/components are recreated in the app (UX-DR24)

### Story 1.3: Dual-Site Shells & Trust Chrome

As a visitor,
I want distinct apex, `ops.`, and admin shells with shared trust chrome and cross-links,
So that the litigation product and governance receipts are clearly separated but discoverable.

**Acceptance Criteria:**

**Given** design tokens and trust components (Story 1.2)
**When** I open the apex surface (`predictionmarketlitigation.com` or local apex route)
**Then** I see TopBar + TrustBar with brand, positioning line (*Built by AI, governed and approved by a human; corrections welcome.*), not-legal-advice warn affordance, last-updated placeholder, and links to `ops.` and the public repo
**And** when I open the `ops.` surface I see ops.-branded chrome, link back to apex, and empty-state placeholders for run log / explainer / journal bands
**And** when I open `/admin` I see admin-branded chrome (Access may still be stubbed until 1.4) with links to apex and `ops.`
**And** section bands use EmptyState where content is not yet wired
**And** layouts collapse sensibly under ~940px (UX-DR22)
**And** IA split is preserved: apex does not host the 9-layer explainer or canonical journal

### Story 1.4: Admin Access Protection

As the operator (Patrick),
I want `/admin` and mutating gate APIs protected by Cloudflare Access,
So that only my operator identity can approve drafts, change mode, or moderate feedback.

**Acceptance Criteria:**

**Given** the admin shell from Story 1.3
**When** an unauthenticated visitor requests `/admin` or a mutating admin/gate API
**Then** they are challenged / denied by Cloudflare Access (or local Access-dev equivalent)
**And** when authenticated as the configured operator identity, admin loads with session chrome (operator display name / session indicator per UX admin bar)
**And** public apex and `ops.` routes remain reachable without login
**And** Worker secrets / Access config are not exposed in client bundles or public Evidence
**And** documentation notes how to bind Access for staging vs production, and records the chosen Access IdP when configured

### Story 1.5: Deploy Pipeline & Environments

As the operator (Patrick),
I want CI/CD, three environments, and the real custom domains wired,
So that every later story ships somewhere real instead of accumulating an undeployed local build.

**Acceptance Criteria:**

**Given** the scaffolded app (Story 1.1) and Wrangler config
**When** Workers Builds (GitHub) is connected to the repo
**Then** a push to the production branch builds and deploys automatically
**And** Wrangler environments exist for dev / staging / production with **separate D1 databases** bound per environment
**And** custom domains are bound in production: apex (`predictionmarketlitigation.com`) and `ops.` subdomain (staging equivalents documented)
**And** secrets are configured per environment via Wrangler/Secrets Store and never committed
**And** a deploy is verified end-to-end (shell pages from 1.3 reachable on both production domains)
**And** README documents the deploy flow and environment matrix (readiness M2)

## Epic 2: Litigation Intelligence Tracker (Apex)

Readers can answer “where does this stand?” and “is [platform] legal in [state]?” on the apex long-scroll: heat map, status board, cases (rich filters), cert signal, issue map, entity ledger, reader poll, KPI/credibility/brief, and trust furniture — initially on seed data with provenance and last-updated.

### Story 2.1: F1 Data Model, APIs & Case-Law Seed

As a reader (via the tracker),
I want approved litigation entities loaded from a real store with seed content,
So that apex views can show trustworthy, structured data instead of hard-coded HTML mocks.

**Acceptance Criteria:**

**Given** the Cloudflare app from Epic 1
**When** D1 migrations and Zod schemas are added for circuits, states (incl. operational status, posture, per-platform breakdown, sources, updated_at), cases (docket events, issue tags, party role, lifecycle), entities/platforms, and cert signal
**Then** a seed script/migration loads illustrative data from the case-law surveys (realistic captions/states; not claiming production freshness until pipeline exists)
**And** read-only public REST endpoints return these entities as JSON validated by Zod
**And** every seeded published claim carries provenance label + publish/last-updated timestamps (FR18 seed)
**And** no Draft/Run tables are required yet (those come in Epic 3)
**And** untracked vs tracked-unsettled states are representable in the schema

### Story 2.2: Apex Orientation Chrome

As a visitor new to the litigation,
I want credibility, masthead, KPI, and executive-brief sections at the top of the apex page,
So that I understand what PML is and the scale of the docket before diving into maps.

**Acceptance Criteria:**

**Given** seeded F1 data and the apex shell (Stories 1.3, 2.1)
**When** I open the apex tracker
**Then** I see section order starting with trust chrome → credibility strip (numbered claims + founder card/plate portrait + repo link) → masthead (H1, bottom line, CTAs, meta, “Latest developments” feed) → KPI row (matters tracked, states, appeals pending, changed in 30 days) → executive summary brief
**And** KPI figures use tabular numerals and derive from seed/API counts (not hard-coded forever)
**And** CTAs link to key in-page anchors (e.g. `#circuits`, `#states`, `#cert`) and/or `ops.`
**And** copy remains information-not-advice and matches editorial tone (UX-DR8, FR43)

### Story 2.3: Circuit-Split Heat Map

As a reader,
I want an interactive circuit-split heat map with a circuit index,
So that I can see regional posture at a glance and drill to controlling cases.

**Acceptance Criteria:**

**Given** seeded circuits/states/cases (Story 2.1)
**When** I view the `#circuits` band
**Then** a real US state TopoJSON map (us-atlas states-10m via d3/topojson, pinned SRI) renders postures with the five-step ramp; untracked states use near-white + dashed hairline
**And** a visible legend maps color → posture before/near the map
**And** hover shows tooltip (posture, controlling case(s), last-updated); click selects the state; keyboard focus/activation works with aria-labels
**And** circuit boundaries overlay member states; selecting a circuit emphasizes members and dims others
**And** layout is map (~1.5fr) + circuit index (~1fr), collapsing under ~940px
**And** if topology fetch fails, map hides with a message and circuit index + status board still carry postures
**And** live map reflects only approved/seeded published data (no draft mutation)
**And** selection state is shareable with the status board (Story 2.4 can complete the sync)

### Story 2.4: State Status Board (Synced with Map)

As a compliance reader,
I want a filterable/sortable state board with a detail panel synced to the heat map,
So that I can answer “is [platform] legal in [state]?” with sources.

**Acceptance Criteria:**

**Given** the heat map selection model (Story 2.3) and seeded states
**When** I view the `#states` band
**Then** a table shows state, circuit, status badge, posture, controlling case + citation, updated (+ “updated” badge when within the configured recent window)
**And** I can sort by state, status, posture, updated (header click toggles direction)
**And** filter chips All / Go / Restricted / Banned filter the table and keep the map in sync
**And** selecting a row or map state opens/updates a sticky detail panel with status, posture, circuit, controlling case, provenance, per-platform breakdown table, why-note, primary-source links, and actions to jump to case record or report an error
**And** map ↔ table ↔ panel share one selected state/circuit
**And** the selected state is deep-linkable via URL param (e.g. `?state=NJ`) restoring selection + panel on load — preserving FR2's standalone-state-surface consequence while the SEO page program stays phase-in (readiness m5)
**And** every status/posture claim links to ≥1 primary source (FR2)

### Story 2.5: Case List, Detail & Rich Filters

As a litigator or journalist,
I want to browse and filter case records with docket detail,
So that I can verify posture from the single source of truth.

**Acceptance Criteria:**

**Given** seeded cases with docket events and issue tags (Story 2.1)
**When** I view the `#cases` band
**Then** a list + detail layout shows caption (italic), posture, forum, party role, lifecycle (active/resolved visual weight)
**And** filters include free-text search, posture chips, issue-tag dropdown, state dropdown, circuit dropdown, and Clear (FR40)
**And** detail shows issue tags (first/controlling in accent), court + docket number, provenance, links to affected states/circuit, and reverse-chron hairline docket timeline with dated Tier-1 links
**And** selecting a case from state/circuit views (or deep link) opens the same detail
**And** the same case cannot show conflicting posture vs map/board (single source of truth)

### Story 2.6: Issue Map Synced to Cases

As a reader exploring doctrine,
I want interactive issue-taxonomy visualizations that filter the case record,
So that I can see how issues cluster by posture and jump to matters.

**Acceptance Criteria:**

**Given** cases with issue tags (Stories 2.1, 2.5)
**When** I view the `#issues` band
**Then** four token-themed ECharts views render: issue × posture matrix, emergence timeline, frequency strip, sunburst (FR42, UX-DR14)
**And** empty outcome columns are omitted in the matrix; sunburst leaf labels stay off with hover naming the case
**And** clicking a cell/mark/bar/segment sets an active issue, shows matching matters with jump buttons, and filters the case record with its issue dropdown synced
**And** Clear resets active issue and case filters
**And** chart bundle is vendored or SRI-addressed if deployment requires it

### Story 2.7: Entity Ledger

As a reader tracking platforms,
I want a per-platform footprint ledger,
So that I can see each player’s matters and jump into case records.

**Acceptance Criteria:**

**Given** seeded entities/platforms linked to cases (Story 2.1)
**When** I view the `#entities` band
**Then** each tracked platform (e.g. Kalshi, Polymarket US, Robinhood Derivatives, NADEX/Crypto.com, Coinbase) shows role and matter list (FR41)
**And** selecting a matter opens/filters the case record (Story 2.5)
**And** empty platforms use EmptyState rather than looking like “no legal risk”

### Story 2.8: Qualitative Cert Signal

As a reader watching SCOTUS timing,
I want a clearly labeled qualitative cert-likelihood signal with named factors,
So that I understand the reading without mistaking it for a market price or probability.

**Acceptance Criteria:**

**Given** a seeded cert signal record with factors, last-review, and approver (Story 2.1)
**When** I view the `#cert` band
**Then** I see a qualitative reading on a 5-segment scale (Remote · Low · Elevated · Likely · Near-certain) with explicit “not a probability / not market-derived” caveat (FR4, UX-DR12)
**And** numbered factors list bold leads + explanations; method states no weighting/model/score
**And** provenance label + reviewed date are visible (FR18)
**And** a dashed reserved block holds space for a future market-derived value + methodology + reflexivity caveat (not shipped)
**And** no Kalshi/Robinhood market data is fetched or displayed

### Story 2.9: Reader Cert Poll & Tally API

As a visitor,
I want to cast an unscientific cert poll (thumbs + OT term) and see results after voting,
So that engagement is possible without undermining the qualitative cert signal.

**Acceptance Criteria:**

**Given** the apex page with the poll panel (UX-DR13, FR44)
**When** I vote thumbs up/down and pick a term (OT 2026 / 2027 / 2028 / Later or never)
**Then** my vote is recorded via a durable tally API backed by a D1 `poll_votes` (or equivalent) table added by migration in this story (not localStorage-only in production)
**And** results reveal only after voting as labelled percentage bars with my choice in accent
**And** disclaimer copy states unscientific, not evidence, not a forecast, not connected to any market, one vote per browser — kept verbatim from the handoff
**And** the poll is visually subordinate to the cert signal and cannot be read as an official PML forecast
**And** abuse basics exist (one vote per browser fingerprint/cookie; no reader accounts)

### Story 2.10: Trust Furniture, Donations & ops. Handoff

As a reader,
I want persistent trust, correction entry, donations, and a clear path to `ops.`,
So that I know this is information-not-advice, can start a correction, and can inspect receipts.

**Acceptance Criteria:**

**Given** the completed apex sections (Stories 2.2–2.9)
**When** I view trust/correction and footer regions
**Then** F1 surfaces show not-legal-advice disclaimer, AI-built/governed disclosure, visible last-updated, Powered by Bizmation (or equivalent), and provenance where published (FR36)
**And** a correction/feedback entry point exists on apex that navigates to the correction band/form shell; the shell states submissions open in Story 4.5 (no fake submit) — queued-submission wiring and moderation land in Stories 4.5/4.6 (definite scope per readiness m1)
**And** donations link (“Buy me a coffee” or equivalent) is present (FR39)
**And** public repo is linked (FR38)
**And** an ops. handoff block explains transparency/governance lives on `ops.` with clear CTA links
**And** section order matches the handoff long-scroll through footer (UX-DR8)

## Epic 3: Governed Daily Loop (Pipeline → Gate → Live)

Patrick can run the daily harness; anyone can inspect Runs, Evidence, and pending Drafts on `ops.`; HITL (default) or bounded Autonomous mode approves/edits/rejects; approved Drafts update live F1 with frozen provenance and public diffs — closing draft → gate → publish → evidence.

### Story 3.1: Run, Draft & Evidence Data Model

**Approved steering amendment (August 9 §4.5):** Migrations also provide `steering_turns`, `standing_guidance`, and `pipeline_config_versions`; Draft records support parent/revision lineage per FR47 (delivered across steering stories 3.14–3.18).

As the operator (and public auditors via later UI),
I want durable Run, Draft, and Evidence records in D1 with Zod contracts,
So that the daily loop has a single source of truth before agents or UIs are wired.

**Acceptance Criteria:**

**Given** the F1 schema from Story 2.1
**When** migrations add `runs`, `drafts`, `evidence_events` (and related lineage/step tables as needed)
**Then** a Run has id, timestamps, origin (`scheduled` | `catch-up` | `manual`), status (including empty, failed, stopped, awaiting, published), mode, spend fields. The public chip for `stopped` reads budget-stopped
**And** a Draft references a Run, proposed F1 entity diffs, full body text, flags (e.g. Tier-2-only), confidence/eval summary, and approval outcome fields
**And** Evidence events/steps can represent fetching → drafting → guardrails → awaiting → published/rejected/`run.stopped`
**And** public read APIs can list Runs and fetch Run detail stubs (UI may still be empty)
**And** secrets are never stored in public-projected fields

### Story 3.2: AI Gateway, Budget Envelope & Role→Model Config

**Approved steering amendment (August 9 §4.5):** Role→model configuration includes `steward`; steering spend is attributed to its Run and counts against its ceiling (FR19/FR50).

As the operator,
I want all LLM calls to go through AI Gateway with per-role models and a budget ceiling,
So that spend is controlled, attributable, and visible for Evidence.

**Acceptance Criteria:**

**Given** Worker bindings for AI Gateway / OpenRouter credentials
**When** agents call `gateway.complete({ role, … })` only (no ad-hoc provider SDKs)
**Then** versioned role→model config exists for orchestrator/drafter/reviewer/yolo (OpenRouter supported)
**And** exceeding the per-Run budget stops further paid calls and marks the Run `stopped` with reason `budget_stopped` (FR19). The public chip still reads budget-stopped
**And** each LLM call records role, provider, model, tokens/spend for Evidence projection (FR24)
**And** changing role→model is an audited ops event
**And** keys/credentials never appear in prompts or public artifacts

### Story 3.3: Daily Run Workflow & Empty Runs

As a visitor on `ops.` (once UI exists) and as the operator,
I want a scheduled daily Workflow that always produces a Run record—even on no-change days,
So that silence is never mistaken for “the harness didn’t look.”

**Acceptance Criteria:**

**Given** Run schema (3.1) and gateway (3.2)
**When** the noon-ET schedule fires (Cron/Workflow schedule) or a test trigger runs
**Then** a `DailyRunWorkflow` creates a Run with origin `scheduled` and durable step status (FR8, FR22)
**And** a no-material-change day still completes an empty Run with Evidence stating zero drafts (FR10)
**And** missing/failed scheduled attempts are representable as gaps (not silent delete)
**And** catch-up Runs can be recorded with origin `catch-up` without erasing the day’s prior attempt (FR8)
**And** a Run interrupted awaiting approval resumes under the **same Run ID** when the operator acts hours/days later, without generating a conflicting duplicate Draft set for the same change (FR22, PRD A10 — readiness M4/G3)
**And** the schedule fires at noon ET across DST transitions — dual-UTC-cron with an ET-hour guard, or a documented fixed-UTC choice; whichever rule is chosen is the one displayed publicly (FR8/FR27 — readiness m4)
**And** schedule timezone and next-run time are stored for public display (FR27)
**And** Vitest coverage exists for Run creation, empty-Run completion, and same-Run-ID resume (readiness M1)

### Story 3.4: Source Monitoring & Draft Packaging

As the pipeline,
I want Tier-1/Tier-2 source checks that produce Draft packages for the Approval Gate,
So that material litigation changes become reviewable proposed updates without mutating live F1.

**Acceptance Criteria:**

**Given** a running DailyRunWorkflow (3.3)
**When** connectors consult configured Tier-1 and Tier-2 sources (stubs acceptable if they record skip reasons)
**Then** each ingested/skipped item is labeled Tier-1 or Tier-2 with reasons on Evidence (FR9)
**And** material changes produce one or more Drafts naming F1 entities, field diffs, source links, and confidence/eval inputs (FR10)
**And** Drafts never write live F1 tables
**And** the Run package handed to the gate includes Drafts (0..N) + Evidence stub + mode inputs (FR11)
**And** partial connector failure is explicit on the Run (not marked fully successful)

### Story 3.5: Drafter, Reviewer & Disagreement Flag

As the operator,
I want multi-agent draft + review with eval signals and a disagreement flag,
So that quality and dissent are first-class Evidence before approval.

**Acceptance Criteria:**

**Given** role→model routing (3.2) and Draft packaging (3.4)
**When** a Run needs draft generation
**Then** drafter agent(s) produce Draft body/diffs under the drafter model
**And** reviewer/eval agent scores confidence/citation completeness under the reviewer model (may differ)
**And** Drafts expose a public confidence/eval badge band, including explicit `evals not run` (FR15, FR24)
**And** if drafter and reviewer materially disagree, Evidence sets disagreement flag + short description (FR29)
**And** Tier-2-only / below-threshold / eval-fail drafts are flagged ineligible for agent auto-approve (FR17 inputs)
**And** the eval/confidence scoring method implemented here is documented on the story when it lands (readiness m7)

### Story 3.6: Guardrails, Action Policy & Scoped Context (Enforcement Layer)

**Approved steering amendment (August 9 §4.5):** The steward identity has no live-F1 publish permission and cannot mutate governance controls; code-level action policy and adversarial tests enforce these boundaries (FR50).

As the operator (and public auditors),
I want I/O guardrails, tool action policy, and scoped agent identity enforced around the generation agents,
So that untrusted source content or a misbehaving agent cannot expand permissions, corrupt the loop, or slip past the gate.

*(Split from Story 3.5 per readiness M3 — FR20/FR21/FR23 enforcement threads.)*

**Acceptance Criteria:**

**Given** drafter/reviewer agents producing Drafts (Story 3.5)
**When** guardrail checks run on agent inputs and outputs before Drafts are offered to the gate
**Then** guardrail failures are recorded on the public Evidence record with rule identity, and hard-fail Drafts are blocked or escalated to human — never agent-auto-approvable (FR20)
**And** prompt-injection attempts embedded in Tier-2/source content cannot expand tool permissions — demonstrated by an adversarial fixture test showing the tool allowlist holds (FR20 — readiness M4/G1)
**And** disallowed tool calls are denied **and the denial is logged on public Evidence**, even when a model requests them (FR21 — readiness M4/G2)
**And** agents run under scoped identities and may use only authorized context; private/non-authorized materials are unavailable to runtime publish agents; authorized context used is attributable in lineage (FR23)
**And** no agent holds a direct live-F1 publish tool; publish remains exclusively the Approval Gate path (FR21, enforced end-to-end in Story 3.11)

### Story 3.7: Public ops. Run Log

As any visitor,
I want a no-login run log on `ops.`,
So that I can see every harness attempt—including boring and failed ones.

**Acceptance Criteria:**

**Given** Runs in D1 (3.1–3.6)
**When** I open the `ops.` run log
**Then** I see recent Runs with id, status chip, timestamp, origin flag, mode, spend, step summary, approval outcome (FR27, UX-DR17)
**And** statuses include published, awaiting, empty, failed, stopped, catch-up, manual (the chip for `stopped` reads budget-stopped; designed chips from UX-DR6)
**And** schedule timezone + next-run time are visible
**And** each row links to Evidence detail
**And** no authentication is required
**And** together with Evidence detail and pending drafts, this fulfills public harness-run transparency for every Run kind (FR13)

### Story 3.8: Evidence Detail Projection

**Approved steering amendment (August 9 §4.5):** Evidence projects steering turns, revision instructions/chains, config changes and guidance in force. Private turn content is redacted while actor, timestamp and effect remain visible (FR50).

As any visitor,
I want full Evidence detail for a Run on `ops.`,
So that I can audit the loop without a vendor console.

**Acceptance Criteria:**

**Given** a Run with steps, drafts, spend, and evals
**When** I open its Evidence detail
**Then** I see steps/tools, model/prompt versions, spend, evals (or explicit empty/not-run), full Draft text, lineage/provenance (claim → sources → Run → approval) (FR25, FR28)
**And** budget and eval fields render even when zero/not-run
**And** secrets/credentials are scrubbed
**And** step-level status is visible live and historically (FR22, FR24)
**And** disagreement flag + short description render when present (FR29)
**And** vendor consoles are not required to trust the Run
**And** Evidence for a Run is exportable as a single thin reviewable bundle (JSON or equivalent) for GRC packaging (FR26)

### Story 3.9: Public Pending Drafts (Not Live)

As any visitor,
I want to read full pending Draft bodies on `ops.` clearly labeled not-live,
So that transparency does not confuse drafts with canonical F1 content.

**Acceptance Criteria:**

**Given** Drafts in `awaiting` (or equivalent)
**When** I view pending Drafts on `ops.`
**Then** full draft body, proposed F1 diffs, flags, confidence/eval badge, and Evidence links are visible without login (FR15)
**And** NotLiveDraftBanner / `.draft` treatment is mandatory and conspicuous (UX-DR5)
**And** live apex F1 data remains unchanged while drafts are pending
**And** rejected drafts can remain archived on `ops.` with outcome (FR18 consequence)

### Story 3.10: Admin HITL Approval Queue

**Approved steering amendment (August 9 §4.5):** The selected Draft exposes inline steering with queue keyboard context preserved; conversational revision and manual edits coexist.

As the operator (Patrick),
I want an Access-protected queue to approve, edit-then-approve, or reject drafts,
So that humans remain the default gate for live publishes.

**Acceptance Criteria:**

**Given** Access-protected admin (Story 1.4) and pending Drafts (3.9)
**When** I open the admin approval queue
**Then** I can navigate drafts (keyboard J/K) and take A approve / E edit / R reject actions (UX-DR20, FR14–15)
**And** edit mode shows an editor buffer; approve-after-edit preserves original Draft text for public diff
**And** reject captures a reason that is public by default, with a control to mark reason (or portion) private (FR14)
**And** unauthenticated users cannot perform actions
**And** HITL remains the launch default mode (FR14, FR16)

### Story 3.11: Publish to Live F1 with Provenance & Diffs

As a reader,
I want approved Drafts to update live F1 with frozen provenance and a public before/after diff on `ops.`,
So that canonical tracker truth only moves through the gate—and the change is auditable.

**Acceptance Criteria:**

**Given** an operator approve or edit-then-approve action (3.10)
**When** the Approval Gate publish path runs
**Then** live F1 entities update only via this path (agents have no direct publish tool) (FR21)
**And** published items are labeled human-approved or agent-approved frozen at publish time (FR18)
**And** human edits show full before/after diff on `ops.` Evidence (FR14, FR28)
**And** retries are idempotent (no double-publish of the same Draft) (FR22)
**And** apex views reflect the new approved state after publish
**And** Vitest coverage exists for the gate write-path: approve / edit-then-approve / reject transitions and idempotent publish under retry (readiness M1)

### Story 3.12: Operator Loop Controls

As the operator,
I want to manually trigger, inspect, and safely supersede Runs,
So that I can exercise the harness without waiting solely on the noon schedule.

**Acceptance Criteria:**

**Given** DailyRunWorkflow (3.3) and admin Access
**When** I trigger a manual Run
**Then** it appears publicly with origin `manual` (FR12)
**And** I can view live/last Run status (queued / running / awaiting / published / failed / stopped) mirrored on the public log. The chip for `stopped` reads budget-stopped
**And** destructive replay that would duplicate publishes is blocked or requires explicit “supersede prior publish” confirmation
**And** supersede events are themselves public Evidence
**And** routine loop operation does not require redeploy (NFR8)

### Story 3.13: Autonomous Mode, YOLO Bounds & Mode Transparency

As the operator (and public readers on `ops.`),
I want optional Autonomous mode with visible bounds and audit trail,
So that agent auto-approve is possible without abandoning HITL defaults or public accountability.

**Acceptance Criteria:**

**Given** HITL default and approval-agent role config (3.2, 3.5–3.6, 3.10)
**When** only the operator identity enables Autonomous (“YOLO”) mode
**Then** enable/disable writes an audited event visible on `ops.` (FR16, FR30)
**And** auto-approve occurs only when all policy checks pass (low-risk, Tier-1 citations, guardrails pass, confidence ≥ versioned threshold, not an escalate category) (FR17)
**And** must escalate: party characterization, posture flips, below-threshold/eval-fail, Tier-2-only, evals-not-run
**And** current mode, auto-approve threshold, and recent mode-change audit are public on `ops.` (FR30, UX-DR17)
**And** agent-approved publishes include validation log on Evidence (FR28)
**And** non-operator identities cannot change mode

### Story 3.14: Steering Channel Foundation, Action Policy & Evidence

**Source / reconciliation note:** Canonical source: [approved August 9 proposal §4.4](sprint-change-proposal-2026-08-09.md#44-epics--five-new-epic-3-stories). Original criteria retained. Completed specs 3.14–3.18 define explicit operator-selected intents; no permission is granted by prompt text. [3.15 frozen boundaries](../implementation-artifacts/spec-3-15-draft-interrogation-read-only.md) preserve J/K/A/E/R with the panel inline and explicitly add no steering hotkey; the older additional-binding wording is not evidence of an implemented binding.

As the operator (and public auditors),
I want an Access-gated conversational channel to the agent fleet that is bounded by action policy and projected as Evidence,
So that steering exists without opening an ungoverned back door into the loop.

**Depends on:** 3.2 (role→model), 3.6 (action policy, scoped identity), 3.10 (admin surface)

**Acceptance Criteria:**

**Given** Access-protected admin (1.4) and the enforcement layer (3.6)
**When** the operator opens the steering channel on a Run or Draft
**Then** a `steward` agent role exists in the versioned role→model config with its own model binding (FR-48, extends 3.2)
**And** the steward agent holds **no live-F1 publish tool**, verified by an explicit test asserting the tool is absent from its resolved allowlist (FR-50 R1, FR-21)
**And** governance controls — YOLO threshold, budget ceiling, Autonomous mode, guardrail rules, action-policy allowlist — are **not** mutable through the channel, enforced by a code-level allowlist rather than prompt instruction, verified by test (FR-50 R3, FR-48)
**And** every steering turn writes a `steering_turns` row and emits Evidence events (`steering.turn`, `steering.applied`) bound to Run and Draft IDs (FR-50 R2)
**And** turns publish to `ops.` at **turn completion, immediately on submit** — no operator publish step and no review queue; the public projection endpoint never exposes partial or in-composition turn content, asserted by test (FR-50 publication timing)
**And** the private/redact decision is captured **at submit**, before publication; a turn cannot be retroactively privatized once published (the UI states this plainly rather than offering a control that cannot deliver)
**And** an adversarial fixture test demonstrates that prompt-injected content inside a Draft or source under discussion cannot expand steward tool permissions (FR-50, parity with 3.6/G1)
**And** unauthenticated identities cannot open or post to the channel; the public reads projections only
**And** steering LLM spend is attributed to the Run and counts against the budget envelope (FR-19)
**And** Vitest coverage exists for: publish-tool absence, governance-control immutability, injection containment, and Evidence emission

### Story 3.15: Draft Interrogation (Read-Only)

As the operator,
I want to ask a pending Draft why it says what it says,
So that I can evaluate it against its actual basis instead of my assumptions.

**Depends on:** 3.14, 3.8 (Evidence detail), 3.9 (pending Drafts)

**Acceptance Criteria:**

**Given** a Draft awaiting approval and the steering channel (3.14)
**When** the operator asks about the Draft's basis
**Then** the steward answers grounded in that Run's Evidence: proposed diffs, sources consulted and skipped with reasons, tier labels, guardrail outcomes, confidence/eval derivation, drafter-vs-reviewer disagreement when present (FR-46)
**And** where Evidence does not record an answer, the steward says so explicitly rather than reconstructing plausible reasoning post hoc
**And** interrogation performs zero writes to Drafts, config, standing guidance, or live F1 — asserted by test
**And** interrogation turns appear in the public projection attached to the Draft (FR-50)
**And** the operator can interrogate from the approval queue without losing queue position or keyboard context (UX-DR20 parity)

### Story 3.16: Conversational Draft Revision

As the operator,
I want to correct a Draft by telling the agent what is wrong,
So that I stop retyping fixes the agent could make itself.

**Depends on:** 3.15, 3.11 (diff + publish machinery), 3.5 (drafter/reviewer)

**Acceptance Criteria:**

**Given** a pending Draft under interrogation (3.15)
**When** the operator issues a revision instruction
**Then** the drafter regenerates the Draft under the **same Run ID**, producing a new Draft version without creating a conflicting duplicate Draft set (FR-47, FR-22)
**And** the original agent Draft and every intermediate revision are preserved and rendered as a public revision chain on `ops.` (FR-47, extends FR-14 to N versions)
**And** the revised Draft re-enters guardrails and reviewer evaluation before becoming approvable; a hard guardrail failure cannot be bypassed by revising (FR-20)
**And** the confidence/eval badge is recomputed for the revised Draft, never inherited from the prior version
**And** revision writes only to Drafts; live F1 remains unchanged until an Approval Gate publish (FR-21)
**And** approval after revision records the full lineage: original → revisions → instruction that caused each → approved text (FR-25)
**And** Vitest coverage exists for: same-Run-ID revision, revision-chain preservation, guardrail re-entry, and badge recomputation

### Story 3.17: Conversational Pipeline Steering

**Source / reconciliation note:** Implementation decision: [3.17 frozen boundaries and Design Notes](../implementation-artifacts/spec-3-17-conversational-pipeline-steering.md) define `poll_sources` as the sole chat-writable key. “Adjust an escalation category” means changing a source tier; FR17 reason codes remain code-controlled. Configuration consumption/version consistency is still a corrective obligation in 3.32 (retro R9).

As the operator,
I want to change what the pipeline watches and escalates by instruction,
So that routine tuning does not require a redeploy (NFR8).

**Depends on:** 3.14, 3.4 (source monitoring), 3.12 (loop controls)

**Acceptance Criteria:**

**Given** the steering channel (3.14) and source config (3.4)
**When** the operator instructs a config change — add a docket to Tier-1, adjust an escalation category, change monitoring scope
**Then** the change writes a new version row in `pipeline_config_versions` with actor, timestamp, prior value, new value (FR-48)
**And** the operator can list versions and revert to any prior version
**And** each change emits an audited ops event publicly visible on `ops.` (parity with FR-16 mode audit)
**And** attempts to change YOLO threshold, budget ceiling, Autonomous mode, guardrail rules, or the action-policy allowlist through the channel are **refused and the refusal is logged on public Evidence** (FR-50 R3)
**And** config changes take effect on the next Run and are attributable in that Run's lineage (FR-25)
**And** routine steering requires no redeploy (NFR8)

### Story 3.18: Standing Corrections & Durable Guidance

**Source / reconciliation note:** Implementation decision: [3.18 frozen boundaries](../implementation-artifacts/spec-3-18-standing-corrections-durable-guidance.md) set the cap to 12 active items and 600 characters per item, with list/edit/revoke review affordances and drafter-only advisory context. Automatic expiry/review-cadence timers are excluded. Revisions append history; guidance cannot grant tools or approval privileges.

As the operator,
I want my corrections to persist so the agent stops repeating the same mistake,
So that the loop improves rather than merely being supervised.

**Depends on:** 3.16, 3.17, 3.6 (FR-23 authorized context)

**Acceptance Criteria:**

**Given** revision (3.16) and steering (3.17) in place
**When** the operator promotes a correction to standing guidance
**Then** the item is stored versioned and attributed in `standing_guidance`, and can be listed, edited, and revoked (FR-49)
**And** standing guidance is treated as **authorized context under FR-23** and is publicly readable on `ops.`
**And** each Run's Evidence states which guidance items were in force, and which influenced a given Draft (FR-25)
**And** guidance is advisory to drafting only: it cannot grant tool permissions, alter action policy, or change approval bounds — asserted by test (FR-49, FR-50 R3)
**And** total guidance is capped with a defined limit and a review affordance, so it cannot grow into an unbounded unauditable prompt
**And** a regression fixture demonstrates the documented case: a correction recorded on Run N changes drafter behavior on Run N+1
**And** revoking guidance removes its influence on the next Run and is itself an audited public event

### Story 3.19: Epic 3 Hardening — Timeouts, Gateway Seed & Deferred Closure

**Source / reconciliation note:** Canonical source: [approved September 17 proposal §4.3](sprint-change-proposal-2026-09-17.md#43-new-stories). Original criteria retained. [3.19 approved implementation boundaries](../implementation-artifacts/spec-3-19-epic-3-hardening-timeouts-gateway-seed.md) refine “one shared helper” into two shared helpers: client `fetchWithTimeout` and server `withDeadline`; call sites do not hand-roll deadlines. Patrick’s September 18 decision in [3.19 frozen boundaries](../implementation-artifacts/spec-3-19-epic-3-hardening-timeouts-gateway-seed.md) overrides the generic 30-second admin timeout for the steering composer only: `2 × PROVIDER_TIMEOUT_MS + 10_000` (130 seconds). The seed is Workers AI at 500 cents; OpenRouter remains required in 3.20. [Accepted September 17 dispositions](../implementation-artifacts/deferred-work.md#dispositions-sprint-change-proposal-2026-09-17-epic-3-clean-up-approved-2026-09-17) retain prompt-only gateway inputs, USD currency, config-version auditing instead of `gateway.config_changed` Evidence, and successful calls in `llm_calls`. They do not waive the later cost/accounting findings. The September 24 proposal supersedes the older early-epic-closure sequencing.

As the operator,
I want the governed loop to fail loudly on hung I/O and to have a working model config out of the box,
So that the first real Run can happen on staging without a manual database edit or a silent hang.

**Depends on:** 3.2, 3.4, 3.8, 3.9, 3.12, 3.16–3.18

**Acceptance Criteria:**

**Given** the decisions in sprint-change-proposal-2026-09-17 §4.1
**When** any connector fetch, provider call, public GET, or admin POST exceeds its deadline
**Then** it fails with the existing typed outcome (`source.skipped` reason, `provider_error`, or a designed client error state) and never leaves a Run `running` or a page chrome-only
**And** one shared helper implements the client/server timeouts; no call site hand-rolls an AbortController deadline
**And** migration 0017 seeds `gateway_config` version 1 with Workers AI ids for all five roles and `default_budget_cents = 500`, and adds an index on `runs(started_at)`
**And** a manual Run on staging with a fake connector reaches `awaiting` with a drafted, reviewed Draft (proves the seed)
**And** the two best-effort Evidence catches (3.17 config, 3.18 guidance) log a warning and each has a failing-batch test proving HTTP stays `ok` when the row landed
**And** a second revise (r2) on the same Draft chain is covered end to end
**And** `epic-3-context.md` uses the locked identifiers `awaiting` / `stopped` / `run.stopped`
**And** the donations CTAs render a visible "Donations open soon" state instead of a dead anchor, with the real URL still a single constant
**And** `deferred-work.md` records the disposition of every Epic 3 entry per §4.2

### Story 3.20: OpenRouter Provider via AI Gateway

**Source / reconciliation note:** Acceptance clarification: these original criteria are obligations, not proof of measured charging or a safe cap. The retrospective rejected the input-only heuristic and non-atomic accounting; stories 3.30–3.31 own the fixes. Authenticated post-deploy gateway success remains 3.36. See [retro R5–R7/R18](../implementation-artifacts/epic-3-retro-2026-09-22.md).

As the operator,
I want paid, per-role OpenRouter models routed through AI Gateway,
So that the drafter/reviewer quality matches the architecture's locked routing decision.

**Depends on:** 3.19

**Acceptance Criteria:**

**Given** the Workers AI seed from 3.19
**When** I change role→model config to `provider: "openrouter"` ids
**Then** the gateway resolves the configured provider (not the default binding) and refuses a mismatch as `gateway_not_configured`
**And** the budget check refuses a call whose estimated cost would push the Run over the ceiling, not only one after it is already over
**And** the AI Gateway / OpenRouter credentials are Worker secrets, never in D1 or prompts
**And** `llm_calls` records real token counts and cents; `ops.` spend fields render non-zero

### Story 3.21: First Live Connector

**Source / reconciliation note:** Acceptance clarification: [story 3.23](#story-323-fail-a-total-courtlistener-outage) supersedes the general fetch-failure completion wording when every docket fails: the Run must finish failed, with scrubbed reasons. Partial failure stays explicit. Live material approval-to-F1 acceptance remains 3.37; completed implementation does not establish that operational demonstration. Pagination, replay and admission findings remain in 3.27/3.32/3.33.

As the operator,
I want one Tier-1 source polled for real,
So that the daily Run produces material Drafts and the Approval Gate is exercised with actual content.

**Depends on:** 3.19

**Acceptance Criteria:**

**Given** the steered `poll_sources` list (3.17)
**When** the daily Run polls the chosen Tier-1 source (CourtListener docket feed recommended)
**Then** new docket events become Drafts with entity diffs, sources, and Tier-1 citations (3.4 contract) under the 60 s deadline
**And** a fetch failure is `source.skipped` with reason, and the Run still completes
**And** a real material Run reaches the admin queue on `build.*` and can be approved to live F1 on staging with provenance
**And** the remaining sources stay stubs with explicit `source.skipped` reasons

### Story 3.22: Staging ops host (`ops-build`)

As any visitor on staging,
I want the ops shell on `ops-build.predictionmarketlitigation.com`,
So that Runs, Evidence, and pending Drafts are readable on a one-level subdomain without taking down the production brochure.

**Acceptance Criteria:**

**Given** worker `pml-build` and D1 `pml-build`
**When** `npm run deploy:build` runs
**Then** `ops-build.predictionmarketlitigation.com` is a custom domain on `pml-build` only
**And** `ops.predictionmarketlitigation.com` remains on worker `pml`
**And** `https://ops-build.predictionmarketlitigation.com/runs/:id` renders the ops shell (run log and Evidence), not the apex tracker
**And** on `build.predictionmarketlitigation.com` and `ops-build.predictionmarketlitigation.com`, ops links use `https://ops-build.predictionmarketlitigation.com`
**And** on `predictionmarketlitigation.com`, ops links stay `https://ops.predictionmarketlitigation.com`
**And** `npm run deploy` is not run

### Story 3.23: Fail a total CourtListener outage

As a reader on the ops shell,
I want a day when every docket fetch fails to be a failed Run,
So that “empty” means the connector looked and found nothing new.

**Acceptance Criteria:**

**Given** a CourtListener poll of one or more dockets
**When** every docket returns an error
**Then** the source is `failed: true` and a zero-draft Run finishes `failed`, not `empty`
**And** Evidence records each docket’s status and a scrubbed response reason, and never the API token
**And** `itemCount` is the number of new entries, not the number of summary objects
**And** one docket error beside a docket that returned entries stays non-fatal for the source
**And** 401, 403, 429, 5xx, network, and timeout still fail the source on the first such response

### Story 3.24: Retire “pipeline is not live” copy

As a reader on the apex tracker,
I want the page to describe the pipeline that is actually running,
So that a scheduled Run is not described as a future feature.

**Acceptance Criteria:**

**Given** the apex shell on `build.` or production
**When** the pending-draft count is zero
**Then** the masthead says there are no pending drafts and links to the ops shell, and it does not say the pipeline is not live
**And** the trust paragraphs say published claims are the seeded record and that proposed changes are on the ops shell, labelled not live
**And** the ops band says the run log is public now, and that drafts appear there labelled not live
**And** no apex string contains “not live yet” or “once the pipeline ships”

### Story 3.25: Stamp the budget ceiling onto each new Run

As a reader of the run log,
I want each Run to show the budget ceiling that was in force when it started,
So that a null budget is not mistaken for “no ceiling.”

**Acceptance Criteria:**

**Given** a gateway config default of 500¢
**When** a scheduled, catch-up, or manual Run is inserted
**Then** `runs.budget_cents` is that default
**And** the public Run list and Run detail show that number
**And** a later change to the config default does not rewrite Runs that already started
**And** the gateway still refuses a call when recorded spend reaches the Run’s own ceiling

Existing rows on `pml-build` stay null.
### Corrective backlog — approved 2026-09-24

Source: [approved change proposal](sprint-change-proposal-2026-09-24.md). Stories 3.1–3.25 remain complete. Stories 3.26–3.37 were added as backlog; current lifecycle states are tracked in `sprint-status.yaml`. The epic is in progress and operational acceptance remains rejected pending corrective evidence. Each implementation story requires targeted regression evidence, review, required CI, and a merged PR.

### Story 3.26: Reconcile canonical Epic 3 planning

As a maintainer, I can find all approved Epic 3 requirements in canonical planning documents.

Effort: Low. Dependencies: none. Covers R17.

- Replace the 3.14–3.21 placeholder in epics.md with eight full story entries, preserving the approved criteria from the August 9 and September 17 proposals and their implementation specs. Resolve differences through explicit accepted decisions, not inferred implementation behavior.
- Reconcile the approved F9/FR46–50 steering amendment into the PRD and its traceability, and link its existing UX additions. Preserve approved scope.
- Add the corrective stories and the architecture/UX amendments below; keep authoritative status tokens `awaiting`, `stopped`, and `run.stopped` consistent.
- Verify every 3.1–3.37 ID appears once in canonical epic planning and sprint tracking after approved backlog application. Record source references and any unresolved document discrepancy.

### Story 3.27: Constrain connector pagination credentials

As an operator, connector pagination cannot forward credentials to an unintended destination.

Effort: Low. Dependencies: 3.26 for planning. Covers R12.

- Validate the initial and every next-page URL against the configured exact HTTPS API origin before attaching authorization. Resolve permitted relative links safely.
- Prevent automatic redirects from forwarding authorization to foreign origins; validate redirect destinations if redirects are supported.
- Reject foreign, downgraded, malformed, and deceptive URLs with scrubbed evidence. Never include tokens in errors or public receipts.
- Tests cover valid same-origin pagination, relative next links, hostile next links, and cross-origin redirects, asserting the unauthorized destination receives no credential-bearing request.

### Story 3.28: Enforce evaluation readiness and sealed Drafts

As a reviewer, I can act only on a completed, eligible Draft and my decided artifact remains immutable.

Effort: Medium. Dependencies: 3.26. Covers R1.

- Persist/derive an unambiguous evaluation lifecycle. A null summary during processing cannot mean ready. Safely classify legacy rows without fabricating completed evaluations.
- Gate routes enforce readiness server-side. Completed explicit `evals_not_run` with its reason remains human-reviewable under FR24; YOLO eligibility remains stricter.
- Evaluator writes conditionally target eligible undecided Drafts. Evaluation and decision races cannot mutate a sealed artifact.
- Pause evaluation in an integration test, attempt approval, then release evaluation. Assert no early F1 write and no post-decision mutation. Test explicit not-run and legacy states.
- Queue/pending views display evaluation in progress and unavailable actions accessibly.

### Story 3.29: Make publication and Run finalization atomic

As a reviewer, concurrent decisions cannot publish stale or superseded content or strand a completed Run.

Effort: High. Dependencies: 3.28. Covers R2–R4.

- Validate current pending outcome, readiness, and latest eligible revision tip at the same atomic boundary as decision and publication. Revision insertion and approval share a consistent concurrency rule.
- Compare expected prior values for every changed field, for both docket and generic updates. One mismatch aborts the entire publication, including decision, F1 writes, and publication receipts.
- Derive final Run state from current committed sibling outcomes, including simultaneous final decisions. Repeating a decision cannot duplicate publication.
- Deterministic tests overlap sibling decisions, parent approval/child insertion, and competing field updates; verify all-or-nothing state and receipts.
- Conflicts return actionable refresh guidance; the UI preserves unsent reviewer edits. Validate the transactional mechanism using the actual database interface rather than relying only on a mocked batch.

### Story 3.30: Define and enforce bounded provider cost

As an operator, each admitted paid request has a conservative, explainable cost bound.

Effort: Medium. Dependencies: 3.26. Covers R6; contract prerequisite for 3.31.

- Replace the input-only heuristic as the admission authority. Document supported provider/model pricing inputs, units, version/effective provenance, input bound, output limit, and conservative integer-cent rounding.
- Set a provider-enforced output limit. Include all supported billable dimensions in the bound; fail closed for unsupported pricing or a request whose maximum liability cannot be bounded.
- Distinguish estimated/reserved amounts from measured provider cost in internal records and public projections. Do not label a heuristic as an actual charge.
- Preserve the existing configured ceiling, including the 500-cent seed; do not increase budgets to make tests pass. Patrick reviews the concrete cost policy as part of this story's spec.
- Deterministic tests cover maximum output, rounding, insufficient remaining budget, stale/unknown pricing, and provider usage discrepancies. Verify current provider capabilities from primary documentation during implementation.

### Story 3.31: Reserve and settle paid calls atomically

As an operator, concurrent calls and retries cannot spend the same available budget twice or understate Run spend.

Effort: High. Dependencies: 3.30. Covers R5, R7.

- Atomically reserve the bounded liability before dispatch against every configured Run/period ceiling. Available balance accounts for outstanding reservations.
- Use stable logical-call identities and persist attempt/outcome evidence. Retries after checkpoint or response loss cannot blindly issue another paid call; use provider idempotency where supported or explicitly reconcile an uncertain outcome.
- Settle ledger, reservation, and Run display totals atomically, or derive display totals from one authoritative accounting source. Repeated settlement is idempotent.
- A failed/unknown provider outcome cannot blindly release reserved funds when a charge may have occurred. Define reconciliation and explicit over-bound anomaly behavior; stop further paid dispatch on an unresolved cap breach.
- Test two calls competing for the last budget, overlapping Runs sharing a period limit, interruption at every accounting boundary, duplicate settlement, and uncertain provider completion. Assert public totals agree with the enforcement authority.

### Story 3.32: Recover durable packages and pin consumed configuration

As an operator, Workflow replay preserves material work and truthful source provenance.

Effort: Medium. Dependencies: 3.28, 3.31. Covers R8–R9.

- On replay, recover this Run's persisted Drafts and evidence before deciding material/empty status. Drafts from another Run cannot be mistaken for this Run's package.
- Inject interruption after Draft insertion and before the Workflow checkpoint; replay must review the persisted Draft, retain its identity, and avoid duplicate paid work/publication.
- Pin the source configuration consumed by packaging, including its recorded version. Changes after attach apply to a later Run; receipts must identify the actual consumed configuration.
- Test configuration changes between attach and packaging and during replay. Preserve partial/all-source failure evidence; no failed package is silently relabeled empty.

### Story 3.33: Make Run admission and dispatch failures explicit

As an operator, competing triggers cannot start duplicate active work or silently lose a dispatch.

Effort: Medium. Dependencies: 3.26. Covers R10–R11.

- Establish atomic active-date admission shared by scheduled, manual, and catch-up paths. At most one admitted active Run per date proceeds; sequential Runs on the same date remain allowed by FR8.
- Define claim lifecycle and recovery after failed dispatch or interruption. Do not leave an unexplained permanent lock or start a second active provider workload.
- Recognize only confirmed duplicate-instance errors as duplicates. Other creation errors produce durable, scrubbed failure evidence and an actionable result/retry path.
- Concurrent-origin and injected-create-failure tests prove one admitted active instance, visible failures, safe retries, and later same-date admission after terminal completion.

### Story 3.34: Test the executing DailyRunWorkflow

As a maintainer, regression tests fail when real orchestration stops forwarding sources or dispatching review.

Effort: Medium. Dependencies: 3.27–3.33. Covers R15.

- Invoke `DailyRunWorkflow.run` through a test-compatible Workflow binding/runtime with real internal helpers and database persistence, replacing only external provider/source effects with deterministic fixtures.
- Cover material, empty, all-source failure, partial failure, budget stop, and replay paths. Assert persisted evaluated awaiting Drafts and public Evidence, not just helper return values.
- Exercise the concurrency failure schedules from the safety stories without replacing the actual admission/accounting/gate implementation with stubs.
- Demonstrate that removing registry forwarding or draft-review dispatch makes the relevant test fail; restore code after the check. Add this suite to required CI.

### Story 3.35: Drive apex pending copy from public Draft data

As a reader, the masthead reflects the pending Drafts I can inspect.

Effort: Low. Dependencies: 3.28. Covers R16 / existing action 13 remainder.

- Derive count and definition of pending from the same public data/eligibility contract as the pending band. Avoid independent inconsistent counts.
- Render loading, zero, positive, error, and stale states honestly; a failed fetch cannot display an asserted zero.
- After approval/rejection/revision, refresh or invalidate both surfaces consistently. Test transitions, singular/plural copy, and accessible status announcements.
- Preserve the copy cleanup already delivered by 3.24; close action 13 only when the live count is verified.

### Story 3.36: Verify the corrected staging Run and gateway

As an operator, I have deployment-specific evidence that the corrected runtime and paid gateway work.

Effort: Medium, operational. Dependencies: 3.26–3.35 merged and required CI green. Covers existing action 17 remainder / R18.

- Deploy the merged corrective commit through the staging process; record commit, Worker version, migrations, target hosts, and time. Verify production behavior remains unchanged.
- Record a new post-deployment Run, frozen budget/source config, public Evidence, and authenticated OpenRouter gateway success. Document the actual successful route and status without tokens or credential-bearing headers.
- Before a paid call, establish the authorized staging budget and cost policy. Planning approval alone is not an instruction to incur unspecified charges.
- A pre-deploy Run, empty static screen, or fabricated fixture is insufficient. If credentials, provider availability, or budget block execution, record the precise blocker and leave this story/action incomplete.

### Story 3.37: Prove the live governed loop and reassess Epic 3

As Patrick, I can trace a real docket change from source through named approval to published staging F1.

Effort: Medium, operational. Dependencies: 3.36. Covers live acceptance action / R18.

- Use a real material docket event through the corrected staging connector and gateway. Capture Run, source, Draft/revision, evaluation outcome, and public Evidence identifiers.
- Present the actual candidate for the named reviewer's decision. Record authenticated approval of that candidate, exactly one F1 publication, final Run state, and matching public lineage. Approval of this plan is not approval of unknown legal content.
- Assert canonical F1 is unchanged before approval and matches the approved artifact afterward. Verify relevant tracker/ops views and accounting consistency.
- Reuse the same Run for 3.36 and 3.37 when it satisfies both sets of criteria; do not duplicate paid work for reporting. An empty Run cannot satisfy this material acceptance story.
- Run a fresh/resumed Epic 3 retrospective against the final merged and deployed state. Close the nine actions only with linked evidence. Mark Epic 3 done and release Epic 4's entry gate only if acceptance succeeds; retain any new blockers visibly otherwise.


## Epic 4: Governance Narrative & Invited Check

**Entry dependency (approved 2026-09-24):** Epic 4 implementation waits for story 3.37 and accepted Epic 3 retrospective evidence. All seven Epic 4 stories retain their scope.


Readers explore the nine-layer explainer and build journal on `ops.`; anyone can submit corrections/feedback that queue for operator approval before a public GitHub issue is created; donations and repo affordances complete the trust loop.

### Story 4.1: Interactive Nine-Layer Explainer

As a governance-curious visitor,
I want an interactive Core/Mantle/Crust nine-layer diagram on `ops.`,
So that I can understand PML’s governance spine without reading a whitepaper.

**Acceptance Criteria:**

**Given** the `ops.` shell and live Run/mode data from Epic 3
**When** I open the explainer surface (e.g. `/layers` or home module on `ops.`)
**Then** all nine layers are explorable via keyboard-accessible interaction (FR31, UX-DR18)
**And** selecting a layer shows plain-language explanation + PML implementation status (shipped spine vs phase-in)
**And** layers link to relevant Evidence concepts and/or journal posts when they exist
**And** the explainer is not a primary apex nav destination; apex may only link to it
**And** Earth-layer visual identity (Core / Mantle / Crust) is evident

### Story 4.2: Explainer Live Status Hooks

As a visitor on the explainer,
I want live hooks into gateway/budget, Approval Gate mode, and latest Run health,
So that the diagram connects to real receipts—not just static copy.

**Acceptance Criteria:**

**Given** Story 4.1 and public Evidence/mode APIs from Epic 3
**When** I use the explainer’s status affordances
**Then** at least gateway/budget, Approval Gate mode, and latest Run health are reachable (FR32)
**And** hooks deep-link into `ops.` Evidence / mode transparency surfaces
**And** missing/zero states use EmptyState patterns (never look like “all green” by omission)

### Story 4.3: Build Journal List & Posts on ops.

As a reader following the build-in-public story,
I want a milestone journal on `ops.` in Patrick’s voice with series navigation,
So that the governance narrative has a canonical home next to the receipts.

**Acceptance Criteria:**

**Given** journal content stored in D1 (post metadata + markdown body, rendered by the app — decision per readiness m2; no separate build-time markdown pipeline in v1) and `ops.` routing
**When** I browse the journal
**Then** posts list by series type: layer (L1→L9) / fault-line / bookend (FR35, UX-DR19)
**And** canonical URLs live on `ops.`; apex may link but does not host the canonical journal (FR33)
**And** posts are human-authored/approved under Patrick’s byline (agent-drafted raw material allowed)
**And** soft length discipline ~1,000 words is documented (not necessarily hard-blocked)
**And** missing layer posts are allowed at launch; series structure still renders

### Story 4.4: Evidence-Linked Journal Posts

As a reader of a fault-line or milestone post,
I want posts to attach or link the Run Evidence that motivated them,
So that narrative and receipts stay on the same `ops.` surface.

**Acceptance Criteria:**

**Given** journal posts (4.3) and Evidence detail (3.8)
**When** a post has an attached Run
**Then** I can navigate post ↔ Evidence without leaving `ops.` (FR34)
**And** fault-line posts can reference a specific failed guardrail, rejection, budget stop, or disagreement flag
**And** posts without attachments still render cleanly

### Story 4.5: Correction & Feedback Form (Queued)

As a reader on apex or `ops.`,
I want to submit a correction or feedback and receive a tracking ID,
So that I can report issues without creating a public GitHub issue myself.

**Acceptance Criteria:**

**Given** trust/correction entry points from Story 2.10 and `ops.` chrome
**When** I submit the form (type, where, detail, optional primary source, optional name/contact)
**Then** a durable **pending submission** is stored in a D1 `submissions` (or equivalent) table added by migration in this story (not a GitHub issue yet) (FR37, FR45)
**And** I receive an acknowledgment with tracking ID (`PML-C-…`)
**And** copy states the submission is **queued for review** (not instantly public on GitHub) (UX-DR16)
**And** name/contact may be left blank; if provided, copy warns they become public **if** an issue is later approved
**And** forms are available from both apex and `ops.`
**And** no reader account is required

### Story 4.6: Admin Feedback Moderation → GitHub Issue

As the operator,
I want to approve or reject queued feedback before any GitHub issue is created,
So that spam/abuse stays out of the public repo while good reports still become issues.

**Acceptance Criteria:**

**Given** pending submissions (4.5) and Access-protected admin (1.4)
**When** I open the admin feedback-moderation queue
**Then** I can approve or reject each submission (keyboard-accessible) (UX-DR25, FR45)
**And** approve creates a GitHub issue via API (App or scoped PAT in Worker secrets) in the public repo and stores issue URL/number on the submission
**And** reject closes the submission with no GitHub issue (optional reason)
**And** GitHub credentials never appear in client bundles or public Evidence
**And** outcome is visible to the operator; tracking ID remains the reporter’s reference
**And** the operator can mark a correction **resolved**; when the resolution changed published content (via the Approval Gate), the affected F1 surface’s last-updated and lineage reflect the fix, and the submission records the linked change (FR37 — readiness M4/G4)
**And** unauthenticated users cannot moderate

### Story 4.7: Trust Closure — Donations, Repo & Cross-Links

As a visitor finishing either surface,
I want donations, repo, and consistent trust/cross-links polished across apex and `ops.`,
So that sustainability and open-source invitations are obvious without undermining neutrality.

**Acceptance Criteria:**

**Given** prior trust chrome (Stories 1.3, 2.10) and `ops.` narrative surfaces (4.1–4.4)
**When** I visit apex and `ops.` footers/trust regions
**Then** donations link is present at launch (FR39)
**And** public repo + license/contribution expectations are findable without login (FR38)
**And** correction entry points remain on both surfaces and reflect moderated-queue copy (FR37/FR45)
**And** apex ↔ `ops.` discoverability links are clear; IA split remains (no second full dashboard on apex)
**And** “Powered by Bizmation” (or equivalent) and not-legal-advice / AI-governed disclosures remain visible on F1 (FR36)
