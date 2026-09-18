# Sprint Change Proposal — Epic 3 Hardening & Deferred-Work Closure

**Date:** 2026-09-17
**Author:** Developer agent with Patrick
**Mode:** Batch (recommendations pre-accepted 2026-09-17)
**Trigger:** Deferred-work review after stories 3.17 / 3.18 merged (PRs #33, #34) and the first `build.*` deploy at migration `0016`.

---

## Section 1 — Issue Summary

**Problem statement.** Epic 3 has all 18 stories `done` and on staging, but the loop cannot execute a real Run and its review debt has never been triaged:

1. **The pipeline is fail-closed by omission, not by decision.** `gateway_config` is empty on every environment (verified on `pml-build` 2026-09-17), so every `complete()` returns `gateway_not_configured`. Architecture gap #5 ("initial production role→model pin") was deferred by 3.2 to "3.12 operator controls", which shipped Run triggers, not config. Nothing owns the seed.
2. **The hung-fetch family has been deferred six times across two epics** (3.2 provider call, 3.4 connector, 3.8 `/runs/:id`, 3.9 `/api/drafts`, 3.12 trigger POST + ApprovalQueue, Epic 2 retro item 4) because "timeout duration is an unchosen product decision". A real connector will hang on a slow court site and take the daily Run with it.
3. **24 Epic 3 deferred-work entries** sit in `deferred-work.md` with no disposition; a 2026-09-17 re-check against `main` found 5 already resolved by later stories and 6 that are accepted-by-design, leaving 13 that need a home.
4. **Epic 2 retro action items are stale**: items 1 (staging) and 8 (remote migration state) are done in reality; item 9 (`prd.md`) resolves to `prds/prd-PML-2026-06-18/prd.md`; item 10 is a followed norm.

**Evidence.** Staging `pml-build`: Run `run-20260917-0000` `empty` (cron works); `SELECT * FROM gateway_config` → `[]`; `stubCheck` at `src/pipeline/connectors/connector.ts:22` returns `[]`; zero `AbortSignal.timeout` / deadline calls in `src/`; `docs/deploy-runbook.md` live-check table updated to `0016` / `ede146a4`.

**Issue type.** Technical limitation discovered during implementation (deferred decisions accumulating into a blocked first Run). No requirement changed.

---

## Section 2 — Impact Analysis

### Checklist record

| § | Item | Status | Finding |
|---|---|---|---|
| 1.1 | Trigger story | [x] | 3.18 close-out + deferred-work review (all of 3.1–3.18 contribute) |
| 1.2 | Core problem | [x] | Accumulated deferred decisions block a real Run; review debt untriaged |
| 1.3 | Evidence | [x] | See Section 1 |
| 2.1 | Epic 3 completable as planned? | [x] | Yes — stories are done; what's missing is a hardening pass the plan never had a slot for |
| 2.2 | Epic-level changes | [!] | **Add** Story 3.19 (hardening), Story 3.20 (OpenRouter provider, backlog), Story 3.21 (first live connector, backlog) |
| 2.3 | Future epics | [x] | Epic 4 unaffected in scope; 4.1/4.2 explainer hooks benefit from a seeded gateway (live status has something to show) |
| 2.4 | Obsolete / new epics | [N/A] | None obsolete; no new epic — the work is Epic 3 territory (governance spine) |
| 2.5 | Resequence | [x] | 3.19 before `epic-3-retrospective`; 3.20/3.21 after the retro, before Epic 4 starts drafting real content |
| 3.1 | PRD conflicts | [x] | None. FR-19 (budget), FR-39 (donations) unchanged. Timeouts are NFR detail the PRD left to architecture (A8). |
| 3.2 | Architecture conflicts | [!] | Gap #5 resolved by seeding **Workers AI** ids, not OpenRouter — a documented deviation from the example config at `architecture.md:229-238`. Architecture already permits "other AI Gateway providers … as secondary"; OpenRouter remains required via 3.20. Record in architecture amendments. |
| 3.3 | UX conflicts | [x] | Donations CTA interim copy only (UX brief deferred placement; copy is within F8 LOCKED) |
| 3.4 | Other artifacts | [!] | `epic-3-context.md` stale names; `epics.md` never received stories 3.14–3.18 (they exist only in the 2026-08-09 proposal) — retro item; `deferred-work.md` needs dispositions; `sprint-status.yaml` Epic 2 items |
| 4.x | Path forward | [x] | **Option 1 — Direct Adjustment** (see Section 3) |

### Epic impact
- **Epic 3:** +3 stories. 3.19 is required before the retro; 3.20 and 3.21 are backlog and do not block `epic-3` closing as `done`.
- **Epic 4:** none structural.

### Story impact
- New: 3.19, 3.20, 3.21 (definitions in Section 4).
- Existing: none reopened. 3.2's deferred items are re-homed, not re-derived.

### Artifact conflicts
- `architecture.md` — amendment entry: initial pin is Workers AI; OpenRouter deferred to 3.20.
- `epic-3-context.md` — three stale identifiers (`awaiting-approval`→`awaiting`, `budget-stopped`→`stopped`, `run.budget_stopped`→`run.stopped`).
- `epics.md` — stories 3.14–3.18 absent (pre-existing; handed to the retro).
- `deferred-work.md` — 24 dispositions.
- `sprint-status.yaml` — 3 new stories; Epic 2 items 1, 8, 9, 10 → done.

### Technical impact
- One new migration `0017` (seed `gateway_config`, `runs(started_at)` index). Idempotent; applies to `pml-build` on the next `deploy:build`; production unaffected until cutover.
- One shared `fetchWithTimeout` helper + gateway deadline; call-site edits in 6 files.
- One shared failing-batch test helper; `console.warn` in two catches.
- No wrangler / binding / cron changes.

---

## Section 3 — Recommended Approach

**Selected: Option 1 — Direct Adjustment.** Add one hardening story now, two backlog stories, and update artifacts. No rollback (nothing done is wrong), no MVP review (scope unchanged).

**Rationale.**
1. Every open item is small and mechanical once the two decisions (timeout values, seed provider) are made — and they are made in this proposal.
2. Bundling into one story respects the standing "one merged PR per story" agreement while avoiding six one-line PRs.
3. Seeding Workers AI rather than waiting for OpenRouter unblocks the first real Run at zero marginal cost; OpenRouter stays a required provider and gets its own story with the three provider-correctness items attached, so nothing is silently dropped.
4. Closing 11 entries as resolved/accepted is a record-keeping change; leaving them open would make the retro re-litigate work the code already settled.

**Effort:** 3.19 ≈ one build session (12–16 files, mostly tests). 3.20 / 3.21 are normal stories.
**Risk:** Low. The only irreversible is migration `0017`; it is additive (a seed row + an index).
**Timeline:** 3.19 → retro → Epic 3 `done`. 3.21 is the precondition for the first material Run; 3.20 is the precondition for paid models.

---

## Section 4 — Detailed Change Proposals

### 4.1 Decisions (recorded here; downstream specs cite this section)

| Decision | Value | Why |
|---|---|---|
| Client GET timeout | **15 s** | Public reader pages; longer than any healthy D1 read, short enough that a blank page is replaced by a designed error state |
| Admin POST timeout | **30 s** | Steering turns include one steward `complete()`; must exceed the model deadline path's fast-fail |
| Connector fetch deadline | **60 s** | Court/agency sites are slow; one source timing out marks `source.skipped` with reason, never fails the Run |
| `AI.run` / provider deadline | **60 s** | Per call; a deadline is a `provider_error` (typed), not a budget stop |
| Initial role→model pin | **Workers AI** — `orchestrator`/`reviewer`/`yolo`/`steward`: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`; `drafter`: same | Zero-cost, already bound; single model keeps the seed reviewable. Story 3.20 replaces with OpenRouter ids as a versioned config change (audited by `version` bump) |
| Default per-Run budget | **500 cents** | FR-19 requires a ceiling to exist; Workers AI records 0 spend so this only bites once 3.20 lands |
| Timeout observability | Every timeout emits the existing typed error/Evidence (`source.skipped`, `provider_error`) — no new vocabulary | Avoids another `evidence_events` rebuild |

### 4.2 Deferred-work dispositions (24 entries)

**Close — resolved by later stories (5)**
1. 3.3 catch-up/manual trigger → 3.12 `POST /api/admin/runs` (`server.ts:79`)
2. 3.2 `run.stopped` raw INSERT → `gateway.ts:164` uses `appendStmt`
3. 3.3 persist `next_run_at` → 3.7 computes via `nextRunAtUtc` by design
4. 3.16 live-browser round-trip → superseded by "first real Run" walk (3.21)
5. 3.2 `setRoleModel` last-write-wins → single operator; `version` atomic

**Close — accepted by design (6)**
6. 3.2 no `gateway.config_changed` Evidence → `version` bump is the audit; config is global, Evidence is per-Run (3.17 precedent)
7. 3.2 `currency` hardcoded USD
8. 3.2 `GatewayInput` prompt-only
9. 3.2 successful LLM calls in `llm_calls` not `evidence_events`
10. 3.12 LoopControls poll never timer-asserted
11. 3.12 attach-run replay fallback untested → staging cron exercises it

**Story 3.19 — Epic 3 hardening (10)**
12. 3.4 connector hang → 60 s deadline
13. 3.2 provider `complete` / `AI.run` no timeout → 60 s deadline
14. 3.8 `/runs/:id` no client timeout → 15 s
15. 3.9 `/api/drafts` no client timeout → 15 s
16. 3.12 trigger POST + ApprovalQueue no timeout → 30 s
17. 3.2 empty `gateway_config` → migration `0017` seed
18. 3.1 `runs(started_at)` index → migration `0017`
19. 3.1 epic-context stale names → edit `epic-3-context.md`
20. 3.18/3.17 best-effort Evidence untested → `console.warn` + shared failing-batch helper + one test each
21. 3.16 r2 revise untested → add e2e case

**Story 3.20 — OpenRouter provider (3)**
22. 3.2 provider never matched to injected `LlmProvider`
23. 3.2 budget check `spend >= budget` vs would-push-over
24. (carried) provider selection + secrets for AI Gateway

**Product / Epic 2 (1)** — 2.10 `DONATE_URL` dead anchor → interim copy in 3.19; real URL remains Patrick's decision (Epic 2 item 7)

### 4.3 New stories

```
### Story 3.19: Epic 3 Hardening — Timeouts, Gateway Seed & Deferred Closure

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
```

### 4.4 Architecture amendment (append to `architecture.md` amendments list)

> `'2026-09-17: Initial role→model pin is Workers AI (gap #5 resolved by migration 0017); OpenRouter remains the required primary router, delivered by Story 3.20. Timeout policy: 15 s client GET / 30 s admin POST / 60 s connector + provider (sprint-change-proposal-2026-09-17 §4.1).'`

### 4.5 `epic-3-context.md` edits

| Line | OLD | NEW |
|---|---|---|
| 38 | marks the Run `budget-stopped` | marks the Run `stopped` (reason `budget_stopped`) |
| 50 | `run.budget_stopped` | `run.stopped` |
| 56 | status chips (published, awaiting-approval, empty, failed, budget-stopped) | status chips (published, awaiting, empty, failed, stopped) |

### 4.6 `sprint-status.yaml`

- Add under Epic 3, before `epic-3-retrospective`: `3-19-epic-3-hardening-timeouts-gateway-seed: backlog`, `3-20-openrouter-provider-via-ai-gateway: backlog`, `3-21-first-live-connector: backlog`
- Epic 2 action items: 1 → `done` (staging live 2026-09-08, redeployed 2026-09-17); 8 → `done` (runbook records `0016`); 9 → `done` (`prds/prd-PML-2026-06-18/prd.md`); 10 → `done` (norm followed 3.14–3.18; recorded in retro)
- Add Epic 3 action item: "Insert stories 3.14–3.21 into `epics.md` (currently only in change proposals)" — owner agent, for the retro

### 4.7 `deferred-work.md`

Append a dated disposition block listing all 24 entries with `[closed-resolved]`, `[closed-accepted]`, `[→ 3.19]`, `[→ 3.20]`, `[→ Epic 2 item 7]` tags. Existing entries are not edited (ledger is append-only).

---

## Section 5 — Implementation Handoff

**Scope classification: Moderate** — backlog reorganization (three new stories, dispositions) plus direct implementation; no PRD or platform decision reopened.

| Recipient | Responsibility |
|---|---|
| Developer agent (this session) | Apply §4.5–4.7 artifact edits now; append §4.4 to `architecture.md`; then `bmad-build 3-19-…` |
| Patrick | Confirm the two §4.1 values you care most about (timeouts, seed model); decide the donation service (Epic 2 item 7) whenever ready |
| Retro (`bmad-retrospective` epic 3) | Runs after 3.19 merges; owns the `epics.md` back-fill and the `evidence_events` rebuild-cost decision |

**Success criteria.** 3.19 merged with CI green; `npm run deploy:build` applies `0017`; a manual Run on staging reaches `awaiting` with a reviewed Draft; `deferred-work.md` has zero Epic 3 entries without a disposition; `epic-3` can be set `done` at the retro.

**Sequencing.** Artifact edits (today) → 3.19 → retro → 3.21 (first material Run) → 3.20 (paid models) → Epic 4.
