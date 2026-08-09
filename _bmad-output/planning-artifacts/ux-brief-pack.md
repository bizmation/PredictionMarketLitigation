---
title: "UX Brief Pack: PML (PredictionMarketLitigation)"
status: final — consumed by design handoff (ux-designs/design_handoff_pml) and epics.md, 2026-08-09; correction-form behavior superseded by epics FR45 moderated queue
created: 2026-08-09
sources:
  - _bmad-output/planning-artifacts/prds/prd-PML-2026-06-18/prd.md
  - _bmad-output/planning-artifacts/briefs/brief-PML-2026-06-17/brief.md
  - docs/research/aug926-prediction_markets_case_law_survey.md (mock-data seed only)
purpose: Self-contained handoff for an external UX / design agent. Capabilities and interaction rules only — not implementation, stack, or pipeline internals.
---

# UX Brief Pack — PredictionMarketLitigation (PML)

**Canonical product:** [PredictionMarketLitigation.com](https://predictionmarketlitigation.com)  
**Display name:** PredictionMarketLitigation (PML)  
**Owner / voice:** Patrick (founder; practicing attorney + CTO)

Use this document as the design input. Do **not** invent a second product thesis. Named user journeys were intentionally omitted in the PRD — inventing them is part of the UX work.

---

## 1. One-sentence product

PML is two things at once, served by one system: the open, data-driven **source of record** for U.S. prediction-market litigation, and a public, working **demonstration of trustworthy autonomous AI** — with receipts.

**Tagline / positioning line (from brief):**  
*Built by AI, governed and approved by a human; corrections welcome.*

**Thesis for design:** The litigation is the subject; the governance is the message. Trust furniture (provenance, last-updated, disclaimers, public drafts, evidence) is product UI — not footer chrome.

---

## 2. What you are designing (site split — LOCKED)

| Surface | Role | Hosts |
|---|---|---|
| **Apex site** (`predictionmarketlitigation.com`) | Informative litigation / intelligence product | F1 tracker views, trust/correction entry points, link to repo, discoverability links into `ops.` |
| **`ops.` subdomain** (e.g. `ops.predictionmarketlitigation.com`) | Public Crust — transparency / governance / journal | Run log, Evidence detail, pending Drafts (full text), Approval Gate mode transparency, 9-layer explainer, build journal |
| **Admin (private)** | Operator actions only | Approve / edit / reject, mode enable/disable, manual loop triggers |
| **Repo (public)** | Source + corrections channel | Linked from both apex and `ops.` |

**Normative IA rules:**
- Main site = litigation content. It does **not** host the interactive governance explainer or the canonical build journal.
- `ops.` = receipts + governance story + journal. Full pending Draft bodies live here, clearly labeled **not live / awaiting approval**.
- Main site → `ops.` via clear discoverability link(s); do not duplicate a second full dashboard on apex.
- Exact nav labels and URL scheme are open for UX — the capability split above is not.

---

## 3. Audiences & jobs

### Jobs to be done
1. **"Show me, in one trustworthy place, where this litigation stands right now."** — litigators, compliance, traders, journalists.
2. **"Tell me whether [platform] is legal in [state] today."** — compliance/legal at exchanges/brokerages.
3. **"Convince me — with receipts — that one person can build autonomous AI worth trusting."** — CTOs, AI-governance leaders, prospective employers/partners (**primary career audience**).
4. **"Give me a citable, neutral, primary-sourced record I can link to."** — journalists, academics, regulators.
5. **(Builder)** Exercise and observe the loop: draft → gate → publish → evidence — every day.

### Audience priority
1. **Primary:** people who could hire or partner with the founder (governance showcase, `ops.`, journal).
2. **Domain:** litigators; compliance/legal at platforms; traders/quants; journalists; academics/regulators.

### Non-users (v1)
- Not a legal-advice service (general legal *information* only; no attorney-client relationship).
- Not a real-time trading feed or gambling-odds site.

---

## 4. Glossary (use these terms in UI copy)

### Litigation domain
| Term | Meaning for UI |
|---|---|
| **Posture** | Region/case disposition toward platforms — controlled set: `decided-for-platform` · `expected/decided-for-state` · `pending-skeptical` · `banned` |
| **Operational status** | State go/no-go — controlled set: `go` · `restricted` · `banned` |
| **Legal track** | Doctrinal category (e.g. CEA-preemption, insider-trading, tribal/IGRA, FTC-disclosure, state-tax) |
| **Circuit split** | Divergence among Courts of Appeals — headline thesis |
| **Cert / certiorari** | SCOTUS discretionary review |
| **Primary / Tier-1 source** | Authoritative original (docket, opinion, Federal Register, statute) — citation of record |
| **Tier-2 source** | News/trade press — leads only; not alone sufficient for agent auto-approval |

### System & governance
| Term | Meaning for UI |
|---|---|
| **Run** | One pipeline execution; unique ID; public on `ops.` |
| **Draft** | Proposed content update; **public while pending** on `ops.`; does not change live F1 until Approval Gate clears it |
| **Approval Gate** | Control before publish — **HITL** (default) or **Autonomous / YOLO** (optional) |
| **Human-approved / Agent-approved** | Provenance label on published items |
| **Evidence record** | Trace, lineage, evals, spend, mode, approver, disagreement flags |
| **`ops.`** | Public operations / transparency site (not a vendor console) |
| **Governance spine** | Enforceable subset of nine layers at launch |
| **Earth-layer metaphor** | **Core / Mantle / Crust** — visual identity for F6 explainer and journal analogies |

### Nine layers (for F6 explainer labels)
1. Gateway (+ budget)  
2. Guardrails  
3. Action policy  
4. Orchestration (+ Approval Gate)  
5. Identity / scoped context  
6. Observability  
7. Evals  
8. Lineage / provenance  
9. GRC  

*(PRD also frames gateway/guardrails/action policy/orchestration/identity/observability/lineage/evals/GRC as the stack — keep labels consistent across explainer + journal series.)*

---

## 5. Aesthetic & tone (LOCKED principles; visual system open)

- **Earth-layer visual identity:** Core / Mantle / Crust carries across F6, governance copy, and journal analogies. Caddyshack-gopher / fault-line voice is a *style reference* — not a required mascot.
- **Fully interactive:** Hover / drill / filter, synced views, live status, keyboard access — site-wide principle, not only the 9-layer diagram.
- **Journal voice:** Patrick's first-person, accessible-but-credible, single-strong-analogy posts; human owns byline.
- **Trust over chrome:** Provenance, last-updated, and disclaimers are product UI.
- Visual design system (type, color tokens, components) is yours to propose — avoid looking like a generic AI dashboard or a gambling odds board.

**Accessibility (v1):** Best-effort **WCAG 2.2 AA** — fix blockers for core journeys; strict AA phases in. Keyboard-accessible interactive views for F1, F3 queue, F5, F6.

**Performance intent:** Maps/tables usable on desktop and mobile; no hard p95 yet.

---

## 6. v1 screen inventory (design these)

Phase-in items are listed at the end — do **not** treat them as launch-critical.

### A. Apex — Litigation Intelligence Tracker (F1)

#### A1. Circuit-split heat map `[v1]` — FR-1
Interactive map of U.S. federal circuits (+ relevant states), color-coded by **posture**.

Must support:
- Visible legend: color → posture (controlled set).
- Hover tooltip: posture, controlling case(s), last-updated.
- Click → region detail with links to case record(s) + primary-source citation.
- Regions with **no tracked activity** visually distinct from tracked-but-unsettled (absence ≠ neutral).
- Global "last updated" timestamp.
- Selection cross-highlights the status board (A2); keyboard-accessible selection.
- Live map never reflects unapproved Drafts.

#### A2. State-by-state status board `[v1]` — FR-2
Per tracked state: **operational status** (`go` / `restricted` / `banned`), active case(s), posture, last-updated — as **synced** interactive map + sortable/filterable table.

Must support:
- Sort by state, status, last-updated; filter by status and posture.
- Map ↔ table stay in sync when filtering/selecting.
- State detail answers "is [platform] legal in [state]?" with per-platform breakdown when platforms differ (standalone surface / SEO target).
- Every status/posture claim links to ≥1 primary source.
- Selection lists cases and cross-highlights heat-map region.
- Recent status change (last N days) shows visible "updated" badge.

#### A3. Case list + case detail `[v1 minimal]` — FR-3
Browse cases: caption, court, legal track, posture, last docket event.

Must support:
- Case fields: caption, court/circuit, legal track, posture, last docket event + date, ≥1 primary-source citation (e.g. CourtListener).
- Case detail: docket events reverse-chronological, dated, source-linked.
- Bidirectional links to affected state(s) and circuit(s).
- Single source of truth: same case cannot show conflicting posture across views.
- v1 = readable list + detail (rich filter/search is phase-in).

#### A4. Cert-likelihood signal `[v1 qualitative]` — FR-4
Clearly labeled **qualitative** SCOTUS certiorari likelihood (no numeric % in v1).

Must support:
- Explicit "qualitative" labeling; names factors (circuit-split status, pending cert petitions, etc.).
- Last-review date + approver (human or agent).
- **No** Kalshi/Robinhood market data in v1.
- Leave visual room for a later market-derived number + methodology + reflexivity caveat — but do not ship that as v1.

#### A5. Trust furniture on F1 `[v1]` — FR-36
Persistent on tracker surfaces:
- "Not legal advice" / no attorney-client relationship.
- AI-built / governed disclosure + Approval Gate provenance.
- Visible last-updated.
- "Powered by Bizmation" (or equivalent) affordance — exact chrome open.
- Correction entry point (A6).
- Donations link at launch ("Buy me a coffee" or equivalent) — placement open.
- Link to public repo.
- Clear link(s) into `ops.`

#### A6. Correction / feedback `[v1]` — FR-37
Report discrepancies from **both** apex and `ops.`; create durable reviewable item (GitHub issues/discussions OK for v1). Acknowledge with tracking ID.

---

### B. `ops.` — Transparency / Crust (F5–F7)

#### B1. Public run log `[v1]` — FR-27
No login. Browse recent Runs: status, timestamp, origin flag (`scheduled` | `catch-up` | `manual`), mode, spend, step summary, approval outcome.

Must show failed, empty (no-change), catch-up, manual, budget-stopped, awaiting-approval, published — absence of drama ≠ absence of evidence. Each Run → Evidence detail.

Also surface schedule timezone + next-run time publicly.

#### B2. Evidence detail `[v1]` — FR-28
Full projected Evidence story (not a vendor-console deep link):
- Steps / tools / model/prompt versions / spend / evals
- Full Draft text
- Lineage / provenance
- Approver (human or approval-agent id+version) + mode
- Agent-approved publishes: validation log
- Human edits: full before/after diff (original Draft vs published)
- Reject reasons: public by default (optional private mark)
- Budget and eval fields render even when zero / not-run — explicit empty states
- Secrets/credentials scrubbed
- Disagreement: v1 = boolean/summary flag + short description (rich explorer is phase-in)
- Step-level status live + historical (e.g. fetching → drafting → guardrails → awaiting-approval → published/rejected/budget-stopped)

#### B3. Pending Drafts (public) `[v1]` — FR-15
Any visitor can read **full pending Draft body**, proposed F1 diffs, flags (e.g. Tier-2-only), confidence/eval badge (or explicit "evals not run"), links into Evidence.

**Critical label:** **not live / awaiting approval** — never confusable with canonical F1.

#### B4. Mode & enablement transparency `[v1]` — FR-30, FR-16–17
Show whether Autonomous (YOLO) mode is currently enabled; list mode-change audit events (timestamp + public-safe operator display name). Show current auto-approve threshold next to mode transparency.

#### B5. Interactive 9-layer governance explainer `[v1]` — FR-31–32
Signature education surface on `ops.` (e.g. `/layers` or home module) — Earth-layer diagram (Core / Mantle / Crust), keyboard-accessible.

Selecting a layer shows:
- Plain-language explanation
- PML implementation status (shipped spine vs phase-in)
- Links to relevant Evidence concepts and/or journal posts when they exist

v1 live status hooks (at least): gateway/budget, Approval Gate mode, latest Run health — reachable from the explainer.

**Not** a primary main-site nav destination; apex may link here.

#### B6. Build journal `[v1]` — FR-33–35
Milestone-triggered posts in Patrick's voice; canonical on `ops.`. Soft length discipline ~1,000 words. Series navigation: layer (L1→L9) / fault-line / bookend. Missing layer posts OK at launch. Posts can attach/link Run Evidence on the same site. Syndicated copies elsewhere are not source of truth.

#### B7. `ops.` trust / disclosure `[v1]` — FR-36–39
Complementary disclosure that Runs/Drafts are AI-produced and gate-controlled; correction entry; repo link; donations placement as appropriate.

---

### C. Admin (private) — Approval Gate actions (F3)

#### C1. Operator action queue `[v1]` — FR-14–15
Authenticated surface for **approve / edit / reject** on pending Drafts. Keyboard-accessible actions.

Behaviors that affect public UX:
- Approve promotes Draft → live F1; Evidence records approver.
- Edit-then-approve: preserve original Draft + published version with **full public before/after diff** on `ops.`
- Reject: F1 unchanged; reject **reason public by default**, with control to mark reason (or portion) private.
- Public can observe outcomes; only operator performs actions.

#### C2. Mode controls `[v1]` — FR-16
Only Patrick's operator identity enables/disables Autonomous mode; audited; visible on `ops.` Default remains HITL.

#### C3. Provenance on publish `[v1]` — FR-18
Every published item labeled **human-approved** or **agent-approved** on the published surface (or immediately adjacent) and on `ops.` Label is frozen at publish time.

---

## 7. Interaction principles (apply site-wide)

1. **Interactive by default** — hover, drill, filter; no static poster maps as the primary experience.
2. **Synced views** — heat map ↔ status board; selection cross-highlights.
3. **Keyboard parity** for core interactive views (maps, queues, explainer).
4. **Draft ≠ live** — visual language must make pending Drafts impossible to confuse with published F1.
5. **Empty / failed / boring states are first-class** — empty Runs, budget-stopped, evals-not-run, no-tracked-activity regions all need designed states.
6. **Citations are UI** — every status/posture claim links to ≥1 primary source.
7. **Last-updated is UI** — visible on F1 views; recent changes get "updated" badge.
8. **Two audiences, one system** — apex serves "where does litigation stand?"; `ops.` serves "show me the receipts." Cross-links without merging the jobs.

---

## 8. Explicit non-goals for v1 UX

Do not design these as launch requirements:
- Market-derived cert % from Kalshi/Robinhood
- Ads / ad mediation
- Rich inter-agent disagreement explorer (flag only)
- Full nine-layer maturity UI for every layer's deep status
- Timeline / "what's next" calendar (FR-5)
- Player / party map (FR-6)
- Regulatory tracker (FR-7)
- Rich case filter/search (FR-3 phase-in)
- Deep programmatic SEO program (state detail may exist; SEO program is phase-in)
- Legal advice UX, trading/odds UX, reader accounts

---

## 9. Journeys to invent (PRD left these blank)

Propose named journeys covering at least:

1. **Compliance glance** — "Is Kalshi legal in New Jersey today?" → state detail → primary source → leave with go/restricted/banned answer.
2. **Circuit-split orientation** — land on heat map → understand split → drill to *Flaherty* (3d Cir.) → related states.
3. **Governance skeptic** — arrive via journal or hire-me narrative → `ops.` explainer → open a Run Evidence → see pending Draft labeled not-live → see human-approved publish + spend.
4. **Operator morning loop** — scheduled Run → pending Draft queue → edit/approve or reject → F1 updates → Evidence shows diff.
5. **Correction path** — reader spots error on apex or `ops.` → submits correction → sees acknowledgment ID.

For each journey: entry, happy path, empty/error/pending states, mobile considerations.

---

## 10. Suggested deliverables from the design agent

1. **Site map** — apex + `ops.` + admin (private), with primary nav.
2. **Wireframes / mid-fi** for screens A1–A6, B1–B7, C1–C3 (desktop + key mobile).
3. **Component proposals** — e.g. PostureLegend, StatusBadge, ProvenanceLabel (`human-approved` / `agent-approved`), ConfidenceBadge, NotLiveDraftBanner, LastUpdated, UpdatedBadge, RunStatusChip, EvidenceStepTimeline, LayerDiagram, EmptyRunState, TrustDisclaimer.
4. **Color mapping proposal** for posture + operational status (accessible; legend-first).
5. **Content / empty-state copy** for disclaimers, not-live Drafts, empty Runs, evals-not-run.
6. **Named journeys** (§9) with annotated flows.
7. **Visual direction** — 1–2 directions consistent with §5 (Earth-layer / trust-over-chrome); avoid generic purple-AI dashboard and gambling-board looks.

---

## 11. Realistic mock-data seed (for prototypes)

Use plausible labels; design should survive dense legal captions.

**Platforms:** Kalshi, Polymarket US (QCX), Robinhood Derivatives, Crypto.com / NADEX, Coinbase Financial Markets.

**Headline appellate anchor:** *KalshiEX LLC v. Flaherty*, 172 F.4th 220 (3d Cir. 2026) — decided-for-platform posture in 3d Circuit.

**Example state/operational tension (as of research window ~Aug 2026 — illustrative only):**
| Entity | Example UI posture / status |
|---|---|
| Utah | State-favorable merits disposition (*KalshiEX LLC v. Cox*) — operational pressure / banned or restricted narrative |
| Minnesota | Platform/CFTC-favorable PI track — closer to `go` / restricted nuance |
| New York | Adverse preliminary relief for Kalshi — restricted/banned lean |
| Wisconsin | CFTC PI denied — state-enforcement lean |
| New Jersey | 3d Cir. platform-favorable appellate posture; SCOTUS timing relevant to cert signal |
| Washington / Nevada / Michigan | Active enforcement / PI / stay fights — unsettled / pending-skeptical |

**Cert signal (v1 qualitative example factors):** only appellate merits holding on core question; multi-circuit matters pending; New Jersey SCOTUS timing; expanding CFTC-vs-states docket — labeled qualitative, last-reviewed, human- or agent-approved.

**Example Run states to mock:** `published`, `awaiting-approval`, `empty` (no material change), `failed`, `budget-stopped`, `catch-up`, `manual`.

**Example Draft:** proposed posture flip for a state + Tier-1 CourtListener link + confidence badge — shown on `ops.` with **not live** banner while F1 still shows prior approved value.

---

## 12. Success look-and-feel (design acceptance bar)

A visitor should be able to:
1. Answer "where does this stand?" from the apex in under a minute, with a primary-source click.
2. Answer "is [platform] legal in [state]?" from a state detail without reading a blog post.
3. On `ops.`, verify a Run end-to-end (steps, spend, draft, approval) without logging into a vendor console.
4. Never confuse a pending Draft with live tracker content.
5. Understand AI involvement and approval provenance without hunting in a footer.
6. Move between litigation product (apex) and governance showcase (`ops.`) without the two surfaces collapsing into one undifferentiated dashboard.

---

## 13. Source of truth

| Artifact | Path | Use |
|---|---|---|
| PRD (canonical capabilities) | `_bmad-output/planning-artifacts/prds/prd-PML-2026-06-18/prd.md` | FRs, IA, NFRs, MVP cut |
| Product brief (why / positioning) | `_bmad-output/planning-artifacts/briefs/brief-PML-2026-06-17/brief.md` | Narrative, audiences |
| This UX brief pack | `_bmad-output/planning-artifacts/ux-brief-pack.md` | Design handoff |
| Case-law survey (mock data only) | `docs/research/aug926-prediction_markets_case_law_survey.md` | Realistic captions/states — not a UX spec |

If this pack conflicts with the PRD, **the PRD wins**. Architecture stack choices are out of scope for UX unless they change user-visible surfaces (they should not for v1 IA).
