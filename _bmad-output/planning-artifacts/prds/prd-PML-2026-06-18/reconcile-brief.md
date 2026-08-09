# Brief ↔ PRD Reconcile — PML

**Date:** 2026-08-09  
**Inputs:** `briefs/brief-PML-2026-06-17/brief.md` (final) · `addendum.md` (skim) · `prds/prd-PML-2026-06-18/prd.md` (draft) · `.decision-log.md`  
**Purpose:** Flag qualitative brief ideas the PRD silently drops or contradicts. Not a full feature audit.

---

## Compact summary

### 1. Input name
**Product Brief: PML (PredictionMarketLitigation)** — `brief-PML-2026-06-17` (status: final)

### 2–3. Top gaps (max 5) + classification

| # | Gap | Classification |
|---|-----|----------------|
| 1 | **Absolute human approval → YOLO/Autonomous mode.** Brief repeatedly asserts nothing publishes until a *human* (attorney founder) approves; accuracy/UPL/defamation lean on HITL as a genuine control. PRD Vision + F3 ship HITL default **and** optional Autonomous (“YOLO”) approval agent in v1, with bounds, labels, and public audit. | **intentional override (note)** — decision log 2026-06-18 (YOLO resolved); PRD §13 risk row “Brief divergence on human always approves” |
| 2 | **Build journal (+ governance explainer) “canonical on-site” → `ops.` only.** Brief: journal “lives canonically on-site”; addendum invents 9-layer diagram as *site* signature visual. PRD IA: apex = litigation/F1 only; F6 explainer + F7 journal canonical on `ops.` subdomain. | **intentional override (note)** — decision log F6/F7 locks (2026-08-09); F7 explicitly records “Brief delta” |
| 3 | **Success: first-page SEO ranking softened away.** Brief Reach criterion: first-page ranking for core prediction-market-litigation queries within months. PRD Success Metrics: “discoverability trend (directional)” only; deep programmatic SEO is Non-Goal / phase-in. No decision-log entry for dropping the first-page bar. | **ok in addendum/decision-log** — record intentional soften (passion-project calibration); restore wording in §12 only if Patrick still wants the harder bar |
| 4 | **Success: “complete nine-layer journal series” → “progresses / missing OK at launch.”** Brief: journal ships its *complete* nine-layer series as a Reach success signal. PRD F7 + §11/§12: series structure exists; missing layer posts allowed at launch; metrics say series *progresses*. Partially implied by F7 lock, not called out as brief success-metric delta. | **ok in addendum/decision-log** — note launch≠complete-series; keep §12 directional unless Patrick wants “complete series” as an explicit success target |
| 5 | **Primary-source-only daily pipeline → Tier-1 + Tier-2 (news) monitoring.** Brief v1: agents pull primary legal sources (CourtListener, Federal Register, etc.). PRD F2 FR-9 adds Tier-2 news/trade press for leads, with Tier-2-only barred from agent auto-approve. | **intentional override (note)** — decision log F2 drafting (2026-06-18); protects EEAT while expanding lead intake |

---

## Verdict

**OK to finalize** — no capability blockers. The two hard brief contradictions (human-always-approves; journal/explainer on apex) are already intentional overrides with decision-log coverage. Before/at Finalize, add short decision-log notes for gaps **#3** and **#4** (success-metric softens) so they are not silent.

---

## Alignment check (non-gaps — brief ideas carried)

- Dual thesis (litigation source of record + trustworthy autonomous AI demo) — PRD §1  
- State map, circuit heat map, qualitative cert signal; market-derived cert out of v1 — F1 FR-1–4 / Non-Goals  
- Daily noon-ET-ish cadence, HITL default, governance spine not full 9-layer maturity — F2–F4 / §11  
- Public `ops.` receipts (trace, lineage, evals, spend); disagreement *explorer* phase-in — F5 (v1 flag)  
- Open source, corrections, disclaimers, Bizmation, donations; ads out of v1 — F8  
- Kalshi/Robinhood ToS gate, UPL, neutrality vs ads, solo budget — §13  
- Hire/partner primary audience; domain audiences secondary — §3  
- Domain-agnostic reusable engine — §1 Vision  

## Addendum items correctly left out of PRD (or deferred)

- Tech/stack/cloud picks (§5) — PRD capabilities-only; harness *criterion* locked, vendor pick → architecture  
- Litigation fact dump / competitive named trackers — content/research, not FRs  
- Media-liability insurance suggestion — risk hygiene, not product FR  
- Runtime `project-context.md` mechanism — capability in F4 L6/L8; mechanism → architecture  

---

## Recommended Finalize hygiene (non-blocking)

1. Decision-log: “Brief success metrics: first-page SEO + complete L1–L9 series intentionally softened to directional / build-in-public.”  
2. Optional one-liner in PRD §12 if Patrick wants the harder bars retained as stretch goals.  
3. No FR rewrites required for brief fidelity on gaps #1, #2, #5.
