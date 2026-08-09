---
title: "PRD: PML (PredictionMarketLitigation)"
status: final
created: 2026-06-18
updated: 2026-08-09
---

# PRD: PML (PredictionMarketLitigation)
*Canonical: [PredictionMarketLitigation.com](https://predictionmarketlitigation.com) — product/display name PredictionMarketLitigation (PML).*

## 0. Document Purpose

This PRD is for Patrick (product owner) and the downstream BMAD workflows — architecture (`bmad-create-architecture`), UX (`bmad-ux`), and epics/stories (`bmad-create-epics-and-stories`). It builds on the finalized **Product Brief** (`_bmad-output/planning-artifacts/briefs/brief-PML-2026-06-17/brief.md`) and its **addendum** (litigation landscape, the 9-layer governance framework, competitive landscape, technology *options*, risks, UI/content inventory) — it does not duplicate them. The brief carries the *why* and positioning; this PRD specifies *what the system must do*.

**Discipline:** this PRD specifies **capabilities, not implementation** — every tool/stack/cloud/architecture choice is deferred to `bmad-create-architecture` (technology options remain parked in the brief addendum §2/§5). Vocabulary is **Glossary-anchored** (§4) and used verbatim; **features are grouped** (§5) with globally-numbered **FRs** nested under them (stable IDs, so downstream artifacts keep their references even if features are reordered); **assumptions** are tagged inline `[ASSUMPTION]` and indexed (§15).

## 1. Vision

PML is two things at once, served by one system: the open, data-driven **source of record** for U.S. prediction-market litigation — Kalshi, Polymarket, Robinhood, the CFTC, and the states — and a public, working **demonstration of trustworthy autonomous AI**. A fleet of AI agents scours primary legal sources daily and drafts case-law and regulatory updates, a state-by-state status map, a circuit-split heat map, and a Supreme-Court certiorari-likelihood signal. Live tracker content does not change until a Draft clears an approval gate — by default a human (the founder, an attorney), and optionally an audited autonomous approval agent the founder may enable. Pending Drafts and harness Evidence are public on `ops.` while awaiting that gate.

Every run passes through a documented nine-layer AI-governance stack (gateway, guardrails, action policy, orchestration, identity, observability, lineage, evals, GRC), and the evidence of each run — trace, lineage, eval scores, dollars spent, approval decision, even where two agents disagreed — is exposed publicly at `ops.`. The litigation is the subject; the governance is the message.

The whole project is open source and narrated in public, in the founder's voice, as a milestone-triggered build journal that walks readers up that same nine-layer model — turning a niche legal tracker into portfolio-grade proof that one person can architect autonomous AI you can actually trust. The engine is the deeper bet: the governed pipeline is domain-agnostic, so PML is the first instance of a reusable pattern, not a one-off site.

## 2. Why Now

Three clocks are running at once, and they make PML timely rather than merely interesting.

**The litigation is crystallizing.** The core question — whether DCM event contracts are CEA "swaps" or state-regulated "wagers" — now spans a decided 3rd Circuit, pending 9th/4th/6th Circuit appeals, an imminent cert petition, aggressive CFTC litigation against states, and fast-moving state bans. The story changes weekly; a daily, primary-sourced tracker is justified by the docket itself, not by product fashion.

**The AI-governance field is loud and receipt-poor.** Frameworks and vendor claims proliferate; concrete, open, end-to-end systems that publish consequential output under real guardrails, human (or audited agent) checkpoints, and public evidence are scarce. PML is built to be that reference implementation — on a hard domain where mistakes matter.

**Regulatory timing amplifies the showcase.** High-stakes AI compliance conversations (including EU AI Act high-risk timelines) make a working, auditable governance stack more valuable as a public demo than as a slide deck. PML ships the receipts while the conversation is hot.

## 3. Target User

### 3.1 Jobs To Be Done
- **"Show me, in one trustworthy place, where this litigation stands right now."** — litigators, compliance teams, traders, journalists reassembling a fast-moving, scattered story.
- **"Tell me whether [platform] is legal in [state] today."** — compliance/legal teams at exchanges and brokerages needing a go/no-go.
- **"Convince me — with receipts — that one person can build autonomous AI worth trusting."** — CTOs, AI-governance leaders, prospective employers/partners.
- **"Give me a citable, neutral, primary-sourced record I can link to."** — journalists, academics, regulators.
- **(The builder's own job)** **"Prove the governance thesis in public, on a real, hard, fast-moving problem."** — Patrick.
- **(Harness / builder job)** **"Exercise and observe automated agent loops end-to-end — draft → gate → publish → evidence — every day."** — Patrick as operator of the governed pipeline.

### 3.2 Audiences (priority order)
- **Primary — people who could hire or partner with the founder:** CTOs, engineering & AI-governance leaders, prospective employers/clients. They come for the governance showcase, the `ops.` receipts, and the build journal.
- **Domain audiences (cited-authority goal):** litigators (gaming/fintech/appellate/preemption); compliance & legal teams at exchanges/brokerages (most monetizable); traders & quants; journalists; academics & regulators.

### 3.3 Non-Users (v1)
- Not a legal-advice service — general legal *information*, no advice to identifiable persons, no attorney-client relationship.
- Not a real-time trading feed or a gambling-odds site.

### 3.4 Key User Journeys
*Skipped in PRD (2026-08-09) — Patrick: knows the product intent; formal named journeys deferred to `bmad-ux` (or omitted if UX stays light). FRs reference audiences/jobs inline (§3.1–3.2).*

## 4. Glossary

*Downstream workflows and readers use these terms exactly. Grows as features (§5) introduce domain nouns.*

**Litigation domain**
- **DCM (Designated Contract Market)** — a CFTC-regulated exchange authorized to list event contracts; its regulatory status is the center of the dispute.
- **Event contract** — a contract whose payoff depends on the outcome of a specified future event; the instrument the platforms list.
- **Swap** — under the Commodity Exchange Act (CEA), a class of derivative within exclusive CFTC jurisdiction. If event contracts are "swaps," federal law preempts state gambling law as applied to DCMs.
- **CEA preemption** — the argument that the CEA's exclusive federal jurisdiction displaces state gambling/wagering law for contracts traded on a DCM.
- **Posture** — a tracked entity's (circuit / state / case) current disposition toward platforms, drawn from a controlled set (e.g., decided-for-platform, expected/decided-for-state, pending-skeptical, banned).
- **Operational status** — a state's go/no-go classification for platform operation; one of {go, restricted, banned}.
- **Legal track** — the doctrinal category of a case (e.g., CEA-preemption, insider-trading, tribal/IGRA, FTC-disclosure, state-tax).
- **Circuit split** — divergence among U.S. Courts of Appeals on the core question; the project's headline thesis and a primary cert driver.
- **Certiorari (cert)** — Supreme Court discretionary review; a "cert petition" asks SCOTUS to hear a case.
- **NPRM** — Notice of Proposed Rulemaking; a regulator's (e.g., CFTC's) formal proposed rule open for public comment.
- **Primary source** — an authoritative original document (court docket/opinion, Federal Register entry, regulatory filing, statute/bill) substantiating a tracked claim.
- **Tier-1 source** — a primary source used as the citation of record for a published factual claim.
- **Tier-2 source** — a secondary source (news / trade press) used for leads and corroboration; not alone sufficient for agent auto-approval.

**System & governance**
- **Run** — one execution of the daily pipeline (F2), uniquely identified, producing drafts and an evidence record.
- **Draft** — a proposed content update produced by an agent during a run; **publicly visible** on `ops.` while pending, but does not alter live F1 tracker content until it clears the Approval Gate.
- **Approval Gate** — the control (F3) every draft passes before publish; operates in **Human-in-the-Loop mode** (default) or **Autonomous mode** ("YOLO").
- **Approver** — the entity that approves/edits/rejects a draft: the human operator (Patrick) or the approval agent.
- **Human-approved / Agent-approved** — the provenance label on a published item indicating which approver cleared it.
- **`ops.` (dashboard)** — the project's public **operations / transparency site** (planned subdomain, e.g. `ops.predictionmarketlitigation.com`): the Crust where anyone can inspect Runs, Evidence, pending Drafts, spend, steps, and approvals (F5). Not the private Cloudflare/AWS vendor console.
- **Evidence record** — the structured bundle attached to a run: trace IDs, lineage edges, eval scores, spend, mode, approver, and any disagreement flags.
- **Governance spine (v1)** — the minimum enforceable subset of the nine layers required at launch: gateway+budget, guardrails, action policy, orchestration with Approval Gate, scoped identity/context, observability+evals, lineage; GRC packaging may be thinner at launch.
- **Loop harness** — the operator's ability to schedule, observe, interrupt, and replay the draft → gate → publish → evidence cycle as a first-class testable system (the build purpose that exercises F2–F5 daily).

## 5. Features

*Each subsection is a coherent feature: behavioral description, then FRs nested under it (globally numbered FR-N). Reference user journeys/personas inline. `[v1]` / `[phase-in]` mark MVP cut; consolidated in §11.*

### 5.1 F1 — Litigation Intelligence Tracker

**Description:** The public-facing data product — a set of always-current, source-linked views that let a reader answer *"where does this stand?"* at a glance and drill to primary documents. Seeded from existing research, kept current by the pipeline (F2), every view cleared by the Approval Gate (F3) and carrying provenance to primary sources. Every view is **interactive** (hover/drill/filter, synced map↔table, keyboard-accessible). Serves the cited-authority goal; domain audiences are litigators, compliance/legal teams, traders, journalists.

**Functional Requirements:**

#### FR-1: Circuit-split heat map `[v1]`
A reader can view an interactive map of the U.S. federal circuits and relevant states, color-coded by each region's current **posture** toward platforms (decided-for-platform · expected/decided-for-state · pending-skeptical · banned).

**Consequences (testable):**
- Each region renders exactly one posture from the controlled set, with a visible legend mapping color → posture.
- Hovering a region surfaces a tooltip (posture, controlling case(s), last-updated date); clicking opens the region detail with links to the case record(s) (FR-3) and the primary-source citation.
- Posture values are sourced only from approved case records; a draft or unapproved change never alters the live map.
- Regions with no tracked activity are visually distinct from tracked-but-unsettled regions (absence ≠ neutral posture).
- The map reflects the latest approved state within one publish cycle and displays a "last updated" timestamp.
- Selecting a region cross-highlights it on the status board (FR-2); region selection is keyboard-accessible.

#### FR-2: State-by-state status board `[v1]`
A reader can view, per tracked state, its **operational status** (go / restricted / banned), active case(s), posture, and last-updated — as both a synced interactive map and a sortable/filterable table.

**Consequences (testable):**
- Every tracked state shows exactly one operational status from {go, restricted, banned} (Glossary-defined) and a last-updated date.
- The table sorts by state, status, and last-updated, and filters by status and posture; map and table stay in sync (a filter applied to one reflects in the other).
- A single state's detail view fully answers "is [platform] legal in [state]?" — with a per-platform breakdown where platforms differ — making each state detail a standalone surface (programmatic-SEO target).
- Every status/posture claim links to ≥1 primary source.
- Selecting a state lists its cases (FR-3) and cross-highlights its region on the heat map (FR-1).
- A status change within the last N days carries a visible "updated" badge.

#### FR-3: Case records & case tracker `[v1 minimal store + list/detail; rich filtering phases in]`
A reader can browse the tracked cases — caption, court, legal track, posture, last docket event — and (phase-in) filter by circuit/state/track.

**Consequences (testable):**
- Each case record carries: caption, court/circuit, legal track, posture, last docket event + date, and ≥1 primary-source citation (e.g., a CourtListener docket).
- FR-1 and FR-2 derive their posture/status from these records — a single source of truth; the same case cannot show conflicting posture across views.
- A case detail lists its docket events in reverse-chronological order, each dated and source-linked.
- Each case links bidirectionally to the state(s) (FR-2) and circuit (FR-1) it affects.
- `[v1]` readable list + detail; `[phase-in]` filter by circuit/state/track and full-text search across captions/issues.

#### FR-4: Cert-likelihood signal `[v1 qualitative; market-derived later]`
A reader can view a clearly-labeled signal of SCOTUS certiorari likelihood, with its basis disclosed.

**Consequences (testable):**
- The v1 signal is explicitly labeled qualitative (no numeric percentage) and names the factors behind it (circuit-split status, pending cert petitions, etc.).
- The signal uses **no** Kalshi/Robinhood market data in v1 (data-ToS gate — see §13 Risks).
- When a market-derived value is introduced later, the view displays its methodology and the reflexivity caveat (the litigants set the prices) adjacent to the number.
- The signal shows its last-review date and approver (human or agent — ties to F3/F5).

**Out of Scope (v1):** market-derived percentage from Kalshi/Robinhood.

#### FR-5: Litigation timeline / "what's next" calendar `[phase-in]`
A reader can view upcoming high-signal events (rulings, filing deadlines, arguments, ban effective dates) on a timeline/calendar.

**Consequences (testable):**
- Each event has a date or date-window, a one-line description, the associated case/regulatory item, and a primary-source link.
- Interactive filter by event type (ruling / deadline / argument / ban) and by circuit/state.
- Past events archive into a preserved, browsable contemporaneous record (supports the "definitive history" vision).

#### FR-6: Player / party map `[phase-in]`
A reader can view the key players — Kalshi, Polymarket, Robinhood, the CFTC, state AGs, tribes, other exchanges — with each party's role and current posture.

**Consequences (testable):**
- Each player shows a role (litigant / regulator / amicus / platform) and current posture, linked to the cases/regulatory items it appears in.
- Selecting a player filters the case tracker (FR-3) to their matters.

#### FR-7: Regulatory tracker `[phase-in]`
A reader can track non-litigation regulatory activity — CFTC rulemakings (NPRMs + comment deadlines), state legislation/bans, and enforcement actions.

**Consequences (testable):**
- Each item shows its status, key dates (e.g., comment deadline, effective date), and a primary-source link.
- Comment deadlines and effective dates feed the timeline (FR-5).

**Feature-wide:** every F1 view shows a visible "last updated" and links to primary sources (EEAT / trust furniture, cross-ref §8 Aesthetic & §13 Risks).

### 5.2 F2 — Autonomous Daily Update Pipeline

**Description:** A scheduled, governed agent fleet that runs **every calendar day** (365 days/year, no weekend/holiday skip), monitors Tier-1 and Tier-2 sources, detects material changes, and produces **drafts** for F1 views (and related content). Drafts never publish themselves — they enter the Approval Gate (F3). Each execution is a uniquely identified **Run** that emits an **Evidence record** for `ops.` (F5). This feature is the primary **loop harness** under test: schedule → observe → draft → hand off → evidence. **Every Run is publicly inspectable** — complete harness transparency for any site visitor who wants it (surface detail in F5; obligation starts here).

**Functional Requirements:**

#### FR-8: Daily cadence (365) `[v1]`
The pipeline executes once per calendar day on a fixed schedule (default target: noon ET), including weekends and holidays.

**Consequences (testable):**
- A scheduled Run is attempted every calendar day once the system is live; missing scheduled attempts are visible as gaps on `ops.` (F5), not silent.
- Catch-up **supplements** (does not replace) the day's record: a missed/failed day may gain an additional Run explicitly flagged `catch-up`, alongside whatever scheduled/failed attempt already exists for that date.
- Multiple Runs may share a calendar date when catch-up or manual triggers occur; each has a distinct Run ID and origin flag (`scheduled` | `catch-up` | `manual`).
- Schedule timezone and next-run time are visible publicly on `ops.` (not only to the operator).

#### FR-9: Two-tier source monitoring `[v1]`
The pipeline monitors **Tier-1** primary sources (citation of record) and **Tier-2** secondary sources (news/trade press for leads and corroboration).

**Consequences (testable):**
- Each ingested item is labeled Tier-1 or Tier-2 in the Run's evidence/lineage.
- A published factual claim must carry a Tier-1 citation **or** be explicitly labeled "reported by [source], pending primary confirmation."
- A draft supported *only* by Tier-2 sources is flagged **low-confidence** and is ineligible for agent auto-approval (F3), even in Autonomous mode.
- Source access respects each source's access/ToS constraints at the capability level (mechanism deferred to architecture); blocked sources are recorded as skipped with reason, not silently omitted — and that skip reason is part of the public Evidence record.

#### FR-10: Change detection → draft generation `[v1]`
When material litigation/regulatory changes are detected, the pipeline produces one or more Drafts proposing updates to F1 surfaces (and related tracker fields).

**Consequences (testable):**
- A "no material change" day **always** still produces a Run + Evidence record stating zero drafts (empty Run) — silence is not allowed; the harness must show it looked.
- Each Draft names the F1 entities it would change (case, state, circuit, cert signal, etc.), the proposed field diffs, and supporting source links.
- Drafts include confidence / eval summary inputs required by F3 (guardrail pass status, citation completeness, eval scores when available).
- Draft generation cannot mutate live F1 views; only an Approval Gate publish can.

#### FR-11: Run packaging for the Approval Gate `[v1]`
Every Run hands a structured package to F3: Drafts (0..N) + Evidence record stub + mode recommendation inputs.

**Consequences (testable):**
- The operator (or approval agent) can open a Run and see all Drafts for that day in one queue package.
- Partial failure (some sources fail, some Drafts succeed) is represented explicitly; the Run is not falsely marked fully successful.
- The package is durable enough that a late human review hours after the Run still sees the same Draft set.

#### FR-12: Operator loop controls `[v1]`
Patrick can trigger, inspect, and (when safe) re-run the daily loop as a harness — not only wait for the schedule.

**Consequences (testable):**
- Manual trigger produces a Run with an explicit `manual` origin flag on `ops.` (publicly visible).
- Operator can view live / last Run status (queued / running / awaiting-approval / published / failed); the same status is mirrored on the public run log (FR-13 / F5).
- Destructive replay that would duplicate publishes is blocked or requires an explicit "supersede prior publish" confirmation; supersede events are themselves public Evidence.

#### FR-13: Public harness-run transparency `[v1]`
Anyone visiting the site can inspect harness Runs end-to-end — not only operators. Completeness of visibility is a product requirement of F2; F5 is the public surface that fulfills it.

**Consequences (testable):**
- Every Run (scheduled, empty, catch-up, manual, failed, budget-stopped, awaiting-approval, published) appears in the public run log without login.
- Public Evidence for a Run includes, at minimum: Run ID, timestamps, origin flag, status, sources consulted / skipped (+ reasons), **full pending Draft text** (FR-15), guardrail/eval summary, spend/budget outcome, approval mode + approver outcome when decided, lineage/provenance links, and disagreement flags when present.
- Failures, empty days, escalations, and YOLO decisions are first-class public records — not omitted for optics.
- Secrets and credentials remain non-public; harness loop artifacts otherwise default to public (draft-body rule locked in F3).

**F2 LOCKED (2026-08-09).**

### 5.3 F3 — Approval Gate (Human-in-the-Loop default; Autonomous/"YOLO" mode optional)

**Description:** The keystone control: **live F1 tracker content** does not change until a Draft clears the Approval Gate — while the Draft itself and the approval process remain **radically public** (full draft text visible pre-approval on `ops.`, per F2 FR-13). Default mode is **Human-in-the-Loop** (Patrick approves). Optional **Autonomous ("YOLO")** mode lets an audited **approval agent** approve within bounded action policy; Patrick alone can enable it. Both modes ship in v1. Transparency is the product; the gate protects *canonical published truth*, not secrecy of the machine's work.

**Functional Requirements:**

#### FR-14: HITL mode (default) `[v1]`
In Human-in-the-Loop mode, every Draft requires Patrick's approve / edit / reject before it becomes live F1 content.

**Consequences (testable):**
- With HITL mode on, live F1 views never change without a human approver action recorded on the Evidence record.
- Full Draft text is already public while pending (FR-15); approval only promotes it to canonical F1 (or rejection leaves F1 unchanged).
- Edit-then-approve preserves both the original agent Draft and the human-edited published version in public lineage with a **full before/after diff** on `ops.` (not summary-only).
- Reject leaves live F1 unchanged; reject **reason is public by default**, with an operator control to mark a specific reason (or portion) **private** before/at submit.

#### FR-15: Public pending drafts + operator action queue `[v1]`
Pending Drafts — including **full draft body text** — are publicly readable on `ops.` / site harness surfaces (including party-naming and posture-flip Drafts). Patrick has an authenticated operator surface to take approve / edit / reject actions.

**Consequences (testable):**
- Any visitor can read the full pending Draft text, proposed F1 diffs, flags (incl. Tier-2-only), and links into Evidence — no login.
- Every pending Draft displays a **public confidence / eval badge** (score or equivalent band + short basis); “evals not run” is an explicit badge state, not a blank.
- Pending Drafts are clearly labeled **not live / awaiting approval** so readers do not confuse them with canonical F1 content.
- Approve / edit / reject **actions** require operator authentication; the public can observe outcomes, not perform them.
- Keyboard-accessible operator actions on the admin queue.

#### FR-16: Autonomous mode enablement `[v1]`
Autonomous ("YOLO") mode is off by default; only Patrick's operator identity can enable or disable it; enablement is an audited event.

**Consequences (testable):**
- Enabling/disabling Autonomous mode writes an audit event (who, when, prior mode, new mode) visible on `ops.` (F5).
- Non-operator identities cannot change mode.
- Launch default remains HITL even though Autonomous mode exists.

#### FR-17: Approval agent + action-policy bounds `[v1]`
In Autonomous mode, an approval agent may auto-approve only within policy; it must escalate the rest to human.

**Consequences (testable):**
- Auto-approvable only if **all** hold: low-risk update; Tier-1 citations; guardrails pass; confidence/eval badge **at or above an explicit auto-approve threshold**; not in an escalate category below.
- The auto-approve threshold is a configured, versioned rule (numeric value set in architecture/ops config); its current value is **visible on `ops.`** next to mode/transparency.
- Must escalate to human (never auto-approve): named-party characterizations, posture flips, below-threshold / eval-fail items, Tier-2-only drafts, or “evals not run.”
- Every agent decision records verdict, reasoning, evidence checked, confidence vs threshold, and policy rule(s) applied on the **public** Evidence record.
- Escalated items remain publicly visible as pending Drafts (with badge) and appear in the operator action queue.

#### FR-18: Provenance labels on publish `[v1]`
Every published item is labeled **human-approved** or **agent-approved**.

**Consequences (testable):**
- The label is visible on the published surface (or an immediately adjacent provenance affordance) and on `ops.`.
- Changing mode mid-day cannot relabel already-published items; label reflects the approver at publish time.
- Correction flow (F8) can flag either label class.
- Rejected Drafts remain publicly archived on `ops.` with outcome + reason (unless the reason was marked private per FR-14).

**F3 LOCKED (2026-08-09).**

### 5.4 F4 — Governed Execution (the 9-layer spine — Mantle / enforcement)

**Description:** Capability requirements for the enforceable **governance spine** that every Run passes through. Maps to Patrick's Core/Mantle/Crust model; tooling is deferred to architecture. v1 ships a working spine (**not** full nine-layer maturity — deepen in public). Runtime *mechanism* for context files is architectural; the PRD requires the *capability*: agents act only on authorized context (L6) and published output exposes provenance (L8). Vendor consoles (CF/AWS) are never the public system of record — Evidence is **fully projected** onto `ops.` (F5).

**Functional Requirements:**

#### FR-19: Gateway + budget envelope (L2) `[v1]`
All model/tool calls for a Run go through a single front door with identity, logging, and spend controls.

**Consequences (testable):**
- Spend for a Run is attributable and visible on `ops.`.
- Exceeding a configured budget ceiling stops further paid calls for that Run and marks the Run **budget-stopped** as a first-class public status (not only a vendor HTTP 429).
- Keys/credentials are not embedded in agent prompts or public artifacts.

#### FR-20: Guardrails on I/O (L3) `[v1]`
Inputs/outputs pass configured safety/validation checks before Drafts can be offered for approval.

**Consequences (testable):**
- Guardrail failures are recorded on the public Evidence record with rule identity.
- A Draft that fails hard guardrails cannot be agent-auto-approved; it is blocked or escalated to human with the failure attached.
- Prompt-injection / untrusted Tier-2 content cannot expand tool permissions (enforced with L4/L6).

#### FR-21: Action policy on tools (L4) `[v1]`
What an agent may *do* (tools/actions) is policy-bounded separately from what it may *say*.

**Consequences (testable):**
- Publish is not an agent-direct action; publish is only via Approval Gate (F3).
- Disallowed tool calls are denied and logged on public Evidence even if the model requests them.
- Approval-agent auto-approve bounds (FR-17) are enforced as action policy, not prompt-only instructions.

#### FR-22: Orchestration with durable Run state (L5) `[v1]`
Multi-step Runs maintain durable state across steps, retries, and human interrupts.

**Consequences (testable):**
- A Run interrupted for HITL can resume without regenerating a conflicting second Draft set for the same change (same Run ID).
- Retries are idempotent with respect to publish (no double-publish of the same Draft).
- **Step-level status is public** on `ops.` (e.g. fetching → drafting → guardrails → awaiting-approval → published/rejected/budget-stopped) — not operator-only.

#### FR-23: Scoped identity & authorized context (L6) `[v1]`
Each agent acts under a scoped identity and may use only information it is authorized to access.

**Consequences (testable):**
- Private career/strategy materials and other non-authorized contexts are not available to runtime publish agents.
- Authorized context used for a Draft is attributable in lineage (FR-25).
- Mechanism (e.g., curated committed `project-context.md` vs build-time docs) is architectural; capability is required here.

#### FR-24: Observability & evals (L7) `[v1]`
Every Run emits traces and quality eval signals; the public system of record is a **full projection** onto `ops.`, not a link to a private vendor console.

**Consequences (testable):**
- `ops.` shows the full projected run story: steps/tools, model/prompt versions, spend, eval scores (or explicit "evals not run"), guardrail outcomes, drafts, approval — enough to audit without CF/AWS login.
- Secrets/credentials are scrubbed from the projection; vendor consoles may hold raw debug spans for the operator but must not be required for public trust.
- Eval scores (or explicit "evals not run" reasons) appear on the Evidence record before approval completes.

#### FR-25: Lineage / provenance (L8) `[v1]`
Published outputs expose provenance from sources/context → Draft → approval → publish.

**Consequences (testable):**
- A reader can walk from a published F1 claim to supporting Tier-1 sources and the Run that produced it on `ops.`.
- Approval decision (human or agent) is a lineage node, not a side note.
- Lineage graph (or equivalent structured provenance) is available on `ops.` (F5).

#### FR-26: GRC evidence packaging (L9) `[v1 thin; deepen phase-in]`
The system can package Run evidence into a reviewable compliance-oriented bundle.

**Consequences (testable):**
- `[v1]` Evidence record fields required by F5 are exportable as a single bundle per Run (thin L9).
- `[phase-in]` Richer GRC mapping (framework crosswalks, formal model cards) without changing F1 publish semantics.

**F4 LOCKED (2026-08-09).** Spine maturity; full projected traces on `ops.`; public step-level status.

### 5.5 F5 — Public `ops.` Transparency Dashboard (Crust / display)

**Description:** The public Crust surface — canonical home is the **`ops.` subdomain** (e.g. `ops.predictionmarketlitigation.com`). Receipts for each Run: full projected traces/steps, lineage, evals, budget, pending/full Drafts, approval decision, mode, and disagreement flags. This is how the governance thesis becomes verifiable. Deep inter-agent disagreement exploration is phase-in; v1 always records whether disagreement occurred. Main site links here for discoverability; it does not host a second full dashboard.

**Functional Requirements:**

#### FR-27: Public run log `[v1]`
Anyone can browse recent Runs with status, timestamp, origin flag, mode, spend, step summary, and approval outcome — on the `ops.` subdomain, no login.

**Consequences (testable):**
- Runs list is public without login on `ops.`.
- Failed, empty (no-change), catch-up, manual, budget-stopped, and awaiting-approval Runs are visible (absence of drama ≠ absence of evidence).
- Each Run links to a detail Evidence view.
- Main site carries at least one clear link into `ops.` (nav/footer or equivalent); `ops.` remains the canonical URL.

#### FR-28: Evidence detail `[v1]`
Run detail is the **full projected** Evidence story (FR-13, FR-24): steps, tools, model/prompt versions, spend, evals, full Draft text, lineage/provenance, approver (human or approval-agent id+version), and mode.

**Consequences (testable):**
- Agent-approved publishes show the agent's validation log (FR-17).
- Human edits show the public diff (original Draft vs edited publish); reject reasons follow FR-14 (public by default, optional private).
- Step-level status is visible live and historically (FR-22).
- Budget and eval fields render even when zero/not-run, with explicit empty states.
- Secrets/credentials are scrubbed; no requirement to open a vendor console to trust the Run.

#### FR-29: Disagreement signal `[v1 flag; rich UI phase-in]`
When two agents disagree during a Run, the Evidence record flags it.

**Consequences (testable):**
- `[v1]` Boolean/summary disagreement flag + short description on Run detail.
- `[phase-in]` Interactive disagreement explorer (side-by-side positions, resolution path).

#### FR-30: Mode & enablement transparency `[v1]`
Current Approval Gate mode and recent mode-change audit events are visible on `ops.`.

**Consequences (testable):**
- Readers can see whether Autonomous mode is currently enabled.
- Mode-change events are listed with timestamp and operator identity (public-safe display name).

**F5 LOCKED (2026-08-09).** Canonical `ops.` subdomain; full Evidence projection; disagreement flag in v1.

### 5.6 F6 — Interactive 9-Layer Governance Explainer

**Description:** The signature education surface for the governance thesis — interactive Earth-layer diagram (Core / Mantle / Crust). **Lives on the `ops.` subdomain** alongside Run Evidence — not on the main site. Main site stays the informative litigation/intelligence product; `ops.` is where visitors who want the governance/harness story go. Clicking a layer reveals what it means, how PML implements it (capability-level), live status into Run Evidence, and journal posts when they exist.

**Functional Requirements:**

#### FR-31: Interactive layer diagram on `ops.` `[v1]`
A reader can explore all nine layers via an interactive diagram on `ops.` (keyboard-accessible).

**Consequences (testable):**
- Selecting a layer shows a plain-language explanation and PML's implementation status (shipped spine vs phase-in).
- Each layer links to relevant Run Evidence concepts and/or journal posts when they exist.
- Diagram is a first-class **`ops.`** surface (e.g. `/layers` or home module) — not buried only in a blog post, and **not** a primary main-site nav destination.
- Main site may link to the explainer on `ops.` for curious readers; it does not host the interactive diagram.

#### FR-32: Live status hooks `[v1 light; deepen phase-in]`
Layers that have live enforcement expose a status affordance into recent Runs / evidence on the same `ops.` site.

**Consequences (testable):**
- `[v1]` At least gateway/budget, Approval Gate mode, and latest Run health are reachable from the explainer.
- `[phase-in]` Per-layer deep status (policy versions, eval dashboards, lineage browser).

**F6 LOCKED (2026-08-09).** Explainer on `ops.`; main site = informative litigation content.

### 5.7 F7 — Build Journal

**Description:** Milestone-triggered journal in Patrick's voice narrating construction of the nine layers and fault-line events. **Canonical home is `ops.`** (with the explainer and Run Evidence) — not the main litigation site. Syndicated outward for reach. Agents may assemble material; Patrick authors, approves, and owns the byline. Each post can attach the real governance Evidence behind it on the same `ops.` surface.

**Functional Requirements:**

#### FR-33: Milestone-triggered publishing on `ops.` `[v1]`
Journal posts publish on milestones (layer shipped, fault line, bookends) — not on a fixed calendar cadence — with canonical URLs on `ops.`.

**Consequences (testable):**
- Posts are human-authored/approved under Patrick's byline (agent-drafted raw material allowed).
- Target length discipline: each post under ~1,000 words (soft limit, not a hard CMS block).
- Canonical URL is on `ops.`; syndication copies (Medium/LinkedIn/Bizmation/etc.) may exist without becoming source of truth.
- Main site may link to the `ops.` journal; it does not host the canonical journal.

#### FR-34: Evidence-linked posts `[v1]`
A journal post can attach or link the Run Evidence that motivated it (same `ops.` site).

**Consequences (testable):**
- When attached, readers can navigate post ↔ Evidence without leaving `ops.`.
- Fault-line posts can reference a specific failed guardrail, rejection, budget stop, or disagreement flag.

#### FR-35: Layer series spine `[v1 content commitment; UI list]`
The journal supports a navigable L1→L9 series plus fault-line and bookend posts.

**Consequences (testable):**
- Readers can list posts by series type (layer / fault-line / bookend).
- Missing layer posts are allowed at launch (build-in-public); the series structure exists even if not all entries are written.

**F7 LOCKED (2026-08-09).** Canonical journal on `ops.`.

### 5.8 F8 — Trust, Correction & Open Source

**Description:** Trust furniture and the invited human check: disclaimers, correction path, open-source transparency, and sustainability affordances without pretending the site is legal advice.

**Functional Requirements:**

#### FR-36: Trust furniture `[v1]`
Main-site F1 surfaces carry persistent "not legal advice," AI-built/governed disclosure, and visible last-updated. `ops.` carries complementary disclosure that Runs/Drafts are AI-produced and gate-controlled.

**Consequences (testable):**
- Legal-information disclaimer is present on F1 surfaces and does not claim attorney-client relationship.
- AI involvement and Approval Gate provenance are disclosed (ties to FR-18).
- "Powered by Bizmation" (or equivalent) branding affordance is present (exact chrome deferred to UX).

#### FR-37: Correction / feedback path `[v1]`
Readers can report discrepancies from **both the main site and `ops.`**; reports create a durable, reviewable item (GitHub issues/discussions acceptable v1 channel).

**Consequences (testable):**
- Correction entry points exist on main site and on `ops.` (same backend queue/channel is fine).
- Correction submissions are acknowledged to the reporter with a public or operator-visible tracking ID.
- Operator can mark a correction resolved and, when content changes, the F1 last-updated and lineage reflect the fix.
- Agent-approved and human-approved items are both correctable.

#### FR-38: Open source accessibility `[v1]`
The project repository is public and discoverable from main site and `ops.`.

**Consequences (testable):**
- Both surfaces link to the public repo.
- License and contribution/correction expectations are findable without a login wall.

#### FR-39: Sustainability affordances `[v1 donations; ads phase-in]`
Donations ship at launch; ads are out of v1 pending neutrality review.

**Consequences (testable):**
- `[v1]` Donations link ("Buy me a coffee" or equivalent) is present at launch (placement UX-deferred; main site and/or `ops.`).
- `[phase-in]` Ads only after an explicit product decision reconciling neutrality optics (§13).

**F8 LOCKED (2026-08-09).** Donations at launch; corrections on main + `ops.`.

## 6. Cross-Cutting NFRs

- **Reliability / cadence:** Scheduled Run every calendar day; empty Runs required; catch-up supplements with flagged Runs; gaps visible (FR-8, FR-10, FR-12).
- **Observability / public harness transparency:** Every Run emits Evidence on public `ops.` sufficient for any visitor to inspect the loop (FR-13, FR-24–FR-28); private debugging may add operator-only detail but must not be the only place truth lives.
- **Accuracy / trust:** Published factual claims require Tier-1 citation or explicit pending-primary label; HITL default; Autonomous mode bounded (FR-9, FR-14, FR-17).
- **Performance (reader):** Interactive F1 maps/tables remain usable on desktop and mobile; exact budgets deferred to UX/architecture `[ASSUMPTION: no hard p95 yet — set in architecture]`.
- **Accessibility:** Keyboard-accessible interactive views for F1, F3 queue, F5, F6. **v1 target: best-effort WCAG 2.2 AA** (fix blockers for core journeys); strict AA conformance phases in.
- **Security:** Approve/edit/reject and mode controls are operator-authenticated; secrets/credentials never published; **Draft bodies are public while pending** and labeled not-live (FR-14–FR-16).
- **Cost control:** Per-Run budget ceiling enforceable (FR-19); spend visible on `ops.`.
- **Loop harnessability:** Operator can schedule, manually trigger, inspect step status, approve/reject, and view evidence without redeploying for routine daily operation (F2–F5).

## 7. Constraints & Guardrails

- **Safety + legal:** General legal information only — no advice to identifiable persons; UPL and defamation risk drive HITL default and citation rules (§13).
- **Autonomous mode bounds:** Off by default; Patrick-only enablement; escalate party characterization, posture flips, low-confidence/eval-fail, Tier-2-only (FR-16–FR-17).
- **Data ToS:** No Kalshi/Robinhood market data ingestion for AI features in v1; market-derived cert KPI gated (FR-4, §13).
- **Cost/budget:** Hard per-Run/per-period spend caps; budget-stop is a first-class Run outcome (FR-19).
- **Privacy:** No requirement to collect reader accounts in v1; operator auth for admin only; reject reasons public by default with optional private mark (FR-14); secrets/credentials never published.
- **Capabilities ≠ implementation:** Concrete vendor/product picks are out of this PRD — **except** the product-level criterion below.
- **Harness selection criterion (LOCKED):** prefer a **showcase-native managed agent harness** — the harness product is part of the public governance story, not invisible plumbing. Architecture shortlist (Aug 2026 research): **Cloudflare Agents (runtime + Think/DIY harness + Workflows HITL)** vs **Amazon Bedrock AgentCore Harness (GA)**. Framework-only stacks (e.g. plain Pydantic AI on a cron VM) are secondary unless the chosen harness cannot meet F2–F5. Final pick deferred to `bmad-create-architecture`.

## 8. Aesthetic & Tone

- **Earth-layer visual identity:** Core / Mantle / Crust metaphor carries across F6 explainer, governance copy, and journal analogies (Caddyshack-gopher / fault-line voice as style reference — not a mascot requirement).
- **Fully interactive interface:** Hover/drill/filter, synced views, live status, keyboard access — principle applies site-wide, not only the 9-layer diagram.
- **Journal voice:** Patrick's first-person, accessible-but-credible, single-strong-analogy posts; agents assist, human owns byline.
- **Trust over chrome:** Provenance, last-updated, and disclaimers are product UI, not footer afterthoughts.
- Visual design system details deferred to `bmad-ux` / WDS.

## 9. Information Architecture

- **Public site (apex):** F1 tracker surfaces, trust/correction entry points, link to repo; **informative litigation content** — not the governance explainer or build journal.
- **`ops.` subdomain (public, canonical Crust):** F5 run log + full Evidence projection; **F6 interactive 9-layer explainer**; **F7 build journal**; mode transparency; **full pending Draft bodies** clearly labeled not-live / awaiting approval.
- **Main site → `ops.`:** discoverability link(s) for transparency/governance curious readers — not a duplicate dashboard or explainer host.
- **Admin (private):** F3 approve/edit/reject actions, mode controls, operator loop triggers.
- **Repo (public):** source, issues/discussions for corrections/contributions.
- Exact navigation IA and URL scheme deferred to UX; capability split above is normative.

## 10. Non-Goals (Explicit)

- Legal advice or attorney-client services.
- Real-time trading / odds product.
- v1 market-derived cert % from Kalshi/Robinhood.
- v1 ads / ad mediation.
- v1 full nine-layer maturity (spine only).
- v1 rich inter-agent disagreement explorer (flag only).
- v1 deep programmatic SEO coverage of every state page as a growth project (state detail may exist; SEO program is phase-in).
- Choosing the final harness vendor/product in this document (criterion locked; pick deferred to architecture).
- Treating June 2026 brief tech grounding as decided — superseded for agent runtime by Aug 2026 harness research (see `addendum.md`).

## 11. MVP Scope

**In for v1 (launch):**
- F1: FR-1 heat map, FR-2 status board, FR-3 minimal case store + list/detail, FR-4 qualitative cert signal.
- F2: daily 365 pipeline, two-tier sources, empty Runs, catch-up supplement, drafts, packaging, operator controls, **public harness-run transparency** (FR-8–FR-13) — LOCKED.
- F3: HITL default + YOLO bounds + public pending full drafts + public-by-default reject reasons (optional private) + provenance labels (FR-14–FR-18) — LOCKED.
- F4: governance spine (not full maturity); full projected traces; public step status; thin L9 (FR-19–FR-26) — LOCKED.
- F5: `ops.` subdomain run log + full Evidence projection + disagreement flag + mode transparency (FR-27–FR-30) — LOCKED.
- F6: interactive 9-layer explainer **on `ops.`** + light live hooks (FR-31–FR-32) — LOCKED.
- F7: build journal **on `ops.`** + evidence-linked posts + series navigation (FR-33–FR-35); not all L1–L9 posts must exist at launch — LOCKED.
- F8: trust furniture, corrections on main+`ops.`, public repo, **donations at launch**, ads phase-in (FR-36–FR-39) — LOCKED.

**Phase-in after v1:**
- F1: FR-3 rich filter/search, FR-5 timeline, FR-6 player map, FR-7 regulatory tracker; market-derived cert later if ToS resolved.
- F5 rich disagreement UI; F6 deep per-layer status; F8 ads after neutrality decision; deeper L9 GRC.

## 12. Success Metrics

Directional, passion/community-calibrated (not investor OKRs). Private career outcomes stay out of public metrics.

**Reach & visibility**
- Site, `ops.`, and repo public from launch.
- Journal series progresses (layer + fault-line posts shipping over time).
- Discoverability trend for core litigation queries (directional).

**Authority & usefulness**
- External citation/reference by journalism, practice, or peer community.
- Community corrections/issues engaged (invited human check working).

**Trustworthiness (thesis)**
- Daily Runs reliable; gaps visible when they occur.
- Human approval default; Autonomous mode rare and fully evidenced when used.
- Low, transparently-handled correction rate.
- Spend visible and bounded.

**Loop harness (builder)**
- Operator can complete draft → gate → publish → evidence cycles without heroic manual glue.
- Both HITL and Autonomous paths exercisable in production configuration.

**Sustainability**
- Donations/ads trend toward covering AI+infra over time (ads not in v1).

**Counter-metrics**
- Do not optimize for publish volume if correction rate or eval-fail rate spikes.
- Do not enable Autonomous mode to "keep the streak" when escalations are warranted.

## 13. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **Kalshi/Robinhood data ToS** blocks market-derived KPIs / AI ingest | v1 qualitative cert only; no Kalshi/Robinhood market ingest; revisit only with license/consent or alternate lawful source |
| **UPL** | Information not advice; disclaimers; no personalized recommendations |
| **Defamation / accuracy** | Tier-1 citations; HITL default; Autonomous escalations for party characterization & posture flips; correction path |
| **Neutrality vs revenue** | Ads out of v1; donations at launch; revisit ads consciously |
| **Solo / budget overrun** | Per-Run budget caps; spine not full maturity; launch thin |
| **Autonomous mode trust regression** | Off by default; audited enablement; public agent-approved labels; policy bounds; `ops.` validation logs |
| **Stale litigation facts** | Daily 365 cadence; last-updated furniture; corrections invited |
| **Brief divergence on "human always approves"** | Reconciled: human default; Autonomous optional, bounded, labeled (decision log 2026-06-18) |
| **Harness lock-in / narrative capture** | Showcase-native harness is intentional; keep F4 layer model + `ops.` evidence as *our* thesis so the story is not "Cloudflare/AWS did governance for us" |
| **Showcase harness vs Python legal tooling friction** | Architecture must prove CourtListener/heavy research path on or beside the harness (e.g. CF TS agent + Workflows calling Python workers, or AgentCore microVM/BYO container) without abandoning criterion A |

## 14. Open Questions

*Resolved at Finalize except architecture pick below.*

1. ~~Product title~~ — PredictionMarketLitigation.com / PML.
2. ~~Named user journeys~~ — skip in PRD; defer to `bmad-ux` if needed.
3. ~~Catch-up Runs~~ — supplement with flagged `catch-up`.
4. ~~Edit diffs~~ — full before/after on `ops.`.
5. ~~WCAG~~ — v1 best-effort 2.2 AA; strict AA phase-in.
6. ~~Donations~~ — at launch (provider UX-deferred).
7. ~~Post-PRD path~~ — architecture next; defer deep UX.
8. **Deferred to architecture:** Cloudflare Agents+Workflows(+Think) vs Amazon Bedrock AgentCore Harness (criterion A locked; see `addendum.md` §3).
9. ~~Pending-draft transparency~~ — A+: full public Drafts + confidence badge; YOLO ≥ explicit threshold.

## 15. Assumptions Index

| ID | Assumption | Location |
|---|---|---|
| A1 | **LOCKED:** catch-up supplements with flagged Run; multiple Runs per date allowed | FR-8 |
| A2 | ~~draft bodies private~~ → **LOCKED:** full pending Draft text is public; live F1 unchanged until approve | FR-13, FR-15 |
| A3 | Reject reasons **public by default**; operator may mark a reason (or portion) private | FR-14 |
| A4 | Soft ~1,000-word journal target, not hard CMS enforcement | FR-33 |
| A5 | GitHub issues/discussions acceptable v1 correction channel; entry on **main + `ops.`** | FR-37 |
| A6 | Exact "Powered by Bizmation" chrome deferred to UX | FR-36 |
| A7 | No reader accounts required in v1 | §7 |
| A8 | Performance budgets deferred to architecture/UX | §6 |
| A9 | v1 accessibility = **best-effort WCAG 2.2 AA**; strict AA phase-in | §6 |
| A10 | Run resume continues same Run ID after HITL interrupt | FR-22 |
| A14 | v1 = governance **spine** not full 9-layer maturity; L9 thin | FR-26 / §11 |
| A15 | Traces are **fully projected** to public `ops.`; vendor consoles are not the public SoR | FR-24 |
| A16 | Step-level Run status is public on `ops.` | FR-22 |
| A17 | YOLO auto-approve threshold is configured in architecture; PRD requires existence + public visibility + enforcement | FR-17 |
| A11 | ~~strawman~~ → **RESOLVED:** F1–F8 and cross-cutting locked at Finalize 2026-08-09 | decision log |
| A12 | v1 must exercise both HITL and Autonomous approval paths for loop-harness testing | §3.1 / §11 |
| A13 | Showcase-native harness criterion A; CF vs AgentCore shortlist; pick in architecture | §7 / §14.8 |
