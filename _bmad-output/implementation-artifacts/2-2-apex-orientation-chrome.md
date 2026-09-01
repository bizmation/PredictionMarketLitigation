# Story 2.2: Apex Orientation Chrome

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a visitor new to the litigation,
I want credibility, masthead, KPI, and executive-brief sections at the top of the apex page,
so that I understand what PML is and the scale of the docket before diving into maps.

## ⚠️ Read this before writing any code

**This is the first apex story that renders live F1 data, and the first that deletes LaunchNote.** Four things will bite you; tests catch only some of them:

1. **Do not hard-code KPI figures, docket counts, or "nineteen states / six circuits" into JSX.** That is the exact LaunchNote regression Story 2.1 already paid for. Counts come from aggregate queries. UI tests that snapshot the seed's `25` will pass a hardcoded `25` just as happily — so UI tests must mock the payload, and workers tests must pin the SQL definitions.
2. **Delete `LaunchNote.tsx`. Do not extend it.** The file's own header says so. If it is still on the page when 2.3–2.8 wire real bands, "views are not wired" will sit above live findings. [Source: deferred-work.md; LaunchNote.tsx header]
3. **Present-tense pipeline claims are lies until Epic 3.** Handoff copy says "checked daily" and "every run, draft and approval is public." Neither is true. Rewrite those claims to what is actually live (sourced seed, ops. shell exists, no daily loop). The 2.1 review treated this class of overstatement as HIGH.
4. **Story 2.1 is `done` in sprint-status but may still be uncommitted.** Implement on top of the working tree (schemas, repos, public router, seed). Do not revert those files. Do not treat `HEAD` (`ee5a3b2`, Epic 1 close) as the 2.1 codebase.

## Acceptance Criteria

1. **Given** seeded F1 data and the apex shell (Stories 1.3, 2.1), **when** I open the apex tracker, **then** section order at the top is trust chrome → credibility strip (numbered claims + founder card / `.plate` portrait + repo link) → masthead (H1, bottom line, CTAs, meta, "Latest developments" feed) → KPI row → executive summary brief (`#brief`)
2. **And** KPI figures use tabular numerals and derive from seed/API aggregate counts (not hard-coded forever). The row is the six-cell handoff layout; FR43's four named figures (matters tracked, states, appeals pending, changed in 30 days) are a required subset
3. **And** CTAs link to key in-page anchors (`#states`, `#brief`) and/or `ops.` (`#circuits` / `#cert` remain valid nav targets even while those bands are EmptyState)
4. **And** copy remains information-not-advice and matches editorial tone (UX-DR8, FR43) — no legal advice, no fake pipeline, no unsourced quantitative claims
5. **And** `LaunchNote` is gone; the page still has exactly one `<h1>` (the masthead); remaining unwired bands stay EmptyState
6. **And** TrustBar last-updated is data-derived (max published freshness), not the hardcoded `2026-08-09T16:00:00.000Z` left by 2.1
7. **And** the reader-poll slot between KPI and brief is **not** implemented (Story 2.9 / FR44). Leave a comment, not a fake poll

## Tasks / Subtasks

- [ ] **Task 1: Preflight** (AC: all)
  - [ ] Confirm `npm test` is green on the current tree (2.1 included) and record the count. Zero cloud credentials
  - [ ] Confirm `npm run check` exits 0
  - [ ] Confirm 2.1 public routes respond: `GET /api/cases`, `/api/states`, `/api/circuits` return list envelopes. If they 404, you are not on top of 2.1 — stop
  - [ ] Read the handoff markup, not a memory of it: `_bmad-output/planning-artifacts/ux-designs/design_handoff_pml/PML Tracker.html` lines ~120–143 (`.about` CSS), ~435–484 (masthead/KPI CSS), ~548–750 (markup + brief). Recreate in React; do not ship the HTML file (UX-DR24)
  - [ ] Read `src/surfaces/apex/LaunchNote.tsx` (delete target), `ApexShell.tsx`, `src/surfaces/admin/useAdminSession.ts` (the fetch pattern to copy), `src/shared/api/publicRouter.ts`

- [ ] **Task 2: KPI + developments contracts (server)** (AC: 2, 6)
  - [ ] Add Zod schemas (canonical in `src/shared/schemas/`):
    - `ApexKpisSchema` — camelCase numbers + `freshness` (ISO-UTC-Z) + `changedWindowStart` (ISO date) + `provenanceKind`
    - `DevelopmentSchema` — `id`, `occurredAt`, `description`, `caseId`, `caption`, `court`
  - [ ] Add `src/shared/db/repos/kpisRepo.ts` with **SQL aggregate queries** (architecture: "KPI figures derive from aggregate queries, not hard-coded values"). Do not `SELECT *` and count in JS inside the repo
  - [ ] Add `listRecentDevelopments(db, limit = 7)` on `casesRepo` (JOIN `docket_events` → `cases`, `ORDER BY occurred_at DESC, id ASC`, LIMIT). Do not N+1 `getCaseById` from the client
  - [ ] Wire `GET /api/kpis` as a **single resource** (`jsonOk`, bare JSON) and `GET /api/developments` as a **list** (`jsonList`). Plural path, no trailing slash. GET/HEAD only
  - [ ] Do **not** claim `/api/poll/*`. Do not add tables. Do not add KV. `run_worker_first` already includes `/api` + `/api/*` — do not regress it
  - [ ] **KPI definitions (authoritative — pin in workers tests):**

    | Field | Query |
    |---|---|
    | `statesTracked` | `COUNT(*)` from `states` where `posture != 'untracked'` |
    | `statesTotal` | `COUNT(*)` from `states` (51 incl. DC — subtitle "of fifty" is the handoff gloss; render `statesTracked` as the figure) |
    | `operationalGo` / `operationalRestricted` / `operationalBanned` | counts of `operational_status` **excluding `unknown`**. `unknown` is absence of a judgement (AC6) — it is not a fourth split cell |
    | `mattersTracked` | `COUNT(*)` from `cases` |
    | `circuitsDecided` | `COUNT(*)` from `circuits` where `posture IN ('platform','state','banned')` |
    | `circuitsWithActivity` | `COUNT(*)` from `circuits` where `posture != 'untracked'` |
    | `circuitsTotal` | `COUNT(*)` from `circuits` |
    | `appealsPending` | `COUNT(*)` from `cases` where `forum = 'federal-appellate' AND lifecycle = 'active'` — **not** all appellate rows (`case-flaherty` is `resolved`) |
    | `changedIn30Days` | `COUNT(*)` from `states` where `posture != 'untracked'` AND `updated_at >=` (freshness − 30 days) |
    | `freshness` | `MAX(updated_at)` across published F1 claim tables (`cases`, `states`, `circuits`, `cert_signals`) |

  - [ ] **30-day window is relative to `freshness`, not `Date.now()`.** The seed stamp is `2026-08-09T16:00:00.000Z` (a few rows `2026-08-31T19:07:00.000Z`). Wall-clock "today" would make "changed in 30 days" either light up everything or nothing depending on when the story ships, which is a fake freshness signal. Return `changedWindowStart` so the subtitle can say the actual date

- [ ] **Task 3: Port orientation CSS into `pml.css`** (AC: 1, 2)
  - [ ] Port `.about`, `.goal`, `.founder`, `.gh`, `.masthead`, `.mast-grid`, `.bottomline`, `.cta`, `.mast-meta`, `.latest`, `.feed`, `.kpis`, `.kpi`, `.split`, `.explain`, `.q`, `.blist`, `.tl` from Tracker.html into `src/shared/ui/pml.css`
  - [ ] Use tokens (`var(--color-*)`, `--space-*`, `--font-heading`) — no rogue hexes a token already carries
  - [ ] Collapse at **940px** (UX-DR22): `.about` 1 col; `.mast-grid` 1 col; `.kpis` 2 col
  - [ ] KPI figures: heading font, ~40px, `font-feature-settings: "tnum"` (or `.num`). Focus ring already global
  - [ ] **Reuse** `.plate` from `tokens.css` (already shipped). Do not redeclare a second plate
  - [ ] **Reuse** `.btn` / `.btn-primary` / `.btn-secondary` / `.btn-ghost` from `tokens.css`. Do not invent a new button system
  - [ ] Do **not** add `lucide-react`. The live dot is CSS (`::before` on `.live`). HALT if you think you need a new dependency

- [ ] **Task 4: Apex orientation UI** (AC: 1, 3, 4, 5, 7)
  - [ ] New files under `src/surfaces/apex/orientation/` (surface-local — **not** `src/shared/ui/`, which is leaf primitives only):
    - `CredibilityStrip.tsx`
    - `Masthead.tsx` (kicker, H1, bottom line, CTAs, meta, Latest developments)
    - `KpiRow.tsx`
    - `ExecutiveBrief.tsx`
    - `useOrientation.ts`
  - [ ] **`useOrientation` copies `useAdminSession`:** `useEffect` + `AbortController` + `fetch('/api/kpis')` and `fetch('/api/developments')`. Fail closed to an empty/unavailable state. **Do not** add TanStack Query / SWR. **Do not** use React 19 `use()` — this app has no SSR, no cached promise, and no Suspense/ErrorBoundary tree; `use()` in render with a new Promise loops. `import type` from schemas so zod does not enter the client bundle
  - [ ] Rewrite `ApexShell.tsx`:
    - Keep TopBar + TrustBar + remaining EmptyState bands + SiteFooter
    - Replace `<LaunchNote />` with credibility → masthead → KPI
    - Fill `#brief` with `ExecutiveBrief` (change SectionBand kicker/title/why to the handoff: kicker `The situation`, title `What this fight is about`, why "Written for readers who are not lawyers…")
    - **Delete** `src/surfaces/apex/LaunchNote.tsx` and every import
    - Insert `{/* Story 2.9 inserts #poll here, between KPI and #brief */}` — no poll markup
    - TrustBar: pass `provenance={<ProvenanceLabel kind="human" />}` (seed is human-approved). Pass `LastUpdated` only once `freshness` is known — **no hardcoded fallback date**
  - [ ] **Credibility copy (honest verbs):**
    - Claim 1 title may stay structurally numbered. Body: this is a sourced record of posture, operational status, and a primary source for every tracked state — **not** "checked daily" / "always current" / "live record" in the pipeline sense
    - Claim 2: open-source, mapped to the nine-layer framework, governance record on **ops.** — **not** "every run, draft and approval is public" (Epic 3). Link "The nine layers" to `opsHref + "#layers"` (apex must not *host* `#layers`; linking across hosts is the IA). Do not use the handoff's dummy `https://www.linkedin.com/` for the framework
    - Founder: `Patrick Bland` · `Practising attorney & CTO`. LinkedIn: omit the link unless a real profile URL is in repo docs (handoff URL is a placeholder homepage — do not ship it)
    - Portrait: `<span className="plate">`. If `public/assets/patrick-bland.jpg` exists, use it with `alt="Patrick Bland"`. If not, lettermark `PB` inside the plate — **no stock photo, no broken img**. Creating `public/` is expected (2.3 will add `public/geo/`)
    - Repo CTA: existing `https://github.com/bizmation/PredictionMarketLitigation`
  - [ ] **Masthead copy:**
    - Kicker: `U.S. Federal & State Litigation · Tracker F1`
    - H1: `Where prediction-market litigation actually stands.`
    - Bottom line: qualitative legal sentences from the handoff are OK **only where they match the seed** (Flaherty is the only appellate merits holding; NJ cert deadline extended to 3 September 2026; no petition as of the seed stamp — see `st-nj.why_note` and `de-flaherty-ext`). **Integers** ("six district courts") must be interpolated from orientation data or dropped
    - CTAs: primary `Check a state` → `#states`; secondary `What this fight is about` → `#brief`; ghost `See the receipts` → `opsHref` via `surfaceHref("ops", { dev })`
    - Meta **Headline anchor**: *KalshiEX LLC v. Flaherty*, 172 F.4th 220 (3d Cir. 2026) — this is the seeded controlling appellate case (`case-flaherty`), not an invention. Italic caption
    - Meta **Pending drafts**: honest. There is no drafts table. Copy like "No pending drafts yet — the daily pipeline is not live" linking to ops. **Do not** ship "2 awaiting approval"
    - Meta **Approval gate**: `HITL (human in the loop) · Autonomous mode off` is the documented product default (FR14/FR16), not a live count — allowed as policy chrome until Epic 3 exposes a status endpoint
    - Latest developments: render `items` from `/api/developments`. Each row: date · court / event text / caption. Link to `#cases` (2.5 owns selection; do not invent `?case=` here). Empty feed: EmptyState, not mock rows. "as of {date}" from `freshness` via `formatEtDate` / `formatEtDateTime`
  - [ ] **KPI row (six cells, FR43 four required):**

    | Cell | Figure | Subcopy pattern |
    |---|---|---|
    | States tracked | `statesTracked` | "Of fifty. The rest have no tracked activity." (keep gloss; figure is tracked, not 51) |
    | Operational status | split `go` / `restricted` / `banned` | "Can a platform take the order there today." Reuse the same colour language as `StatusBadge` (`.go` / `.restricted` / `.banned`) — do not invent a second status ramp |
    | Cases on record | `mattersTracked` | "Each with a primary source and docket history." |
    | Circuits decided | `circuitsDecided` of `circuitsTotal` | Subtitle from `circuitsWithActivity`; do not hardcode "only the 3d" if the count is not 1 |
    | Appeals pending | `appealsPending` | Do not hardcode "six courts of appeals" |
    | Changed in 30 days | `changedIn30Days` | "States whose status or posture moved since {changedWindowStart}." |

    While fetch is in flight: structure is visible, figures are an em dash or equivalent — **never a guessed number**
  - [ ] **Executive brief:** port `.explain` + `.tl` from the handoff into `#brief`. Information-not-advice. Any docket statistic inside the prose ("nineteen states", "four of the nineteen", "six circuits") must be interpolated from the KPI payload or rewritten without the number so it cannot contradict the row above
  - [ ] One document `<h1>` (masthead). SectionBand titles stay `<h2>`. Credibility numerals are visual markers, not headings
  - [ ] Accessibility: founder `img` has meaningful alt (or lettermark is text, not an empty box); Latest feed controls are focusable (`:focus-visible` already tokens); KPI row is a list or has an accessible name (`aria-label="Docket snapshot"` or similar); best-effort WCAG 2.2 AA, no new focus-ring invention (NFR5 already global)

- [ ] **Task 5: Tests** (AC: all)
  - [ ] Workers (`publicApi.test.ts` or a sibling `*.test.ts`): `GET /api/kpis` shape, camelCase only, definitions above, `appealsPending` excludes resolved Flaherty, `statesTracked < 51`, `unknown` not in the operational split, `/api/developments` list envelope length ≤ 7, newest `occurredAt` first, `/api/poll/votes` still unmatched
  - [ ] UI (`shells.test.tsx` + `orientation.test.tsx`): LaunchNote gone; exactly one `h1`; credibility + masthead + `.kpis` present; CTA hrefs; `#brief` title is the handoff's; EmptyState count drops (LaunchNote's empty + filled brief — was 10, now 8 remaining bands); IA split still holds (no `#layers` / `#journal` hosted on apex); **no test asserts a hardcoded seed count in ApexShell source**
  - [ ] Mock `fetch` in UI tests if you assert figures — the figure must equal the mock, not `25`
  - [ ] `npm test` green, zero cloud credentials

- [ ] **Task 6: Finalize** (AC: all)
  - [ ] `npm run check` exit 0
  - [ ] Retire the LaunchNote line in `_bmad-output/implementation-artifacts/deferred-work.md`
  - [ ] **Do not live-deploy.** Production landing overwrite is still open in deferred-work. `npx wrangler deploy --dry-run` is enough
  - [ ] File List from `git status` / diff. Single commit only if Patrick asks

## Dev Notes

### Current code state (verified 2026-08-31, 2.1 sitting uncommitted on `main`)

- `src/surfaces/apex/ApexShell.tsx` — TopBar, TrustBar with **hardcoded** `LastUpdated at="2026-08-09T16:00:00.000Z"`, no `provenance` slot, `<LaunchNote />`, then nine `SectionBand`s all EmptyState, SiteFooter. Long-scroll + IA comments are load-bearing — keep them
- `src/surfaces/apex/LaunchNote.tsx` — temporary H1. **Delete**
- `src/surfaces/shells.test.tsx` — LaunchNote describe block; EmptyState `toHaveLength(10)`; one-h1 assertion (keep, retarget to masthead)
- Public API: `GET /api/circuits|states|states/:code|cases|cases/:id|entities|cert-signal`. Envelopes already correct. Cache `public, max-age=60`
- `Forum` enum in `vocabulary.ts` is explicitly "load-bearing for Story 2.2's appeals pending KPI"
- Seed: 13 circuits, 51 states, 25 cases, 5 entities, 1 cert signal. `case-flaherty` is `federal-appellate` + `resolved`. Four other appellate rows are `active`. NJ `why_note` carries the 3 September 2026 cert deadline
- `.plate` and `.btn*` already in `tokens.css`. Orientation CSS is **not** in `pml.css` yet
- First client fetch pattern on a public surface: none. Admin's `useAdminSession` is the template. `renderToStaticMarkup` tests will see the pre-fetch DOM — that is fine
- No `lucide-react`. No `public/` folder yet. No founder jpg in the repo or the handoff bundle

### Reuse, do not reinvent

| Need | Already at | Note |
|---|---|---|
| Fetch-on-mount + abort | `src/surfaces/admin/useAdminSession.ts` | Copy this. Do not add a query library |
| Trust chrome | `TopBar`, `TrustBar`, `WarnChip`, `LastUpdated`, `ProvenanceLabel`, `SiteFooter` | Keep; fill the provenance + freshness slots |
| Band chrome | `SectionBand`, `EmptyState` | Brief uses SectionBand; unwired bands stay EmptyState |
| Dates | `src/shared/lib/dates.ts` | `formatEtDateTime` / `formatEtDate`. Storage stays ISO-Z |
| Cross-site href | `surfaceHref("ops", { dev })` | Never hardcode `PML Ops.html` |
| Repo URL | `ApexShell` `REPO_URL` | Already correct |
| Status colours | `StatusBadge` / `.badge.go` etc. | KPI split cells must stay on this vocabulary |
| Plate / buttons / tokens | `tokens.css` | Port layout CSS only |
| Public router / envelopes | `publicRouter.ts`, `respond.ts` | Add two routes; do not fork a second API dialect |
| Vocabulary | `vocabulary.ts` | Do not invent a new `Forum` or a `pending` operational status |

**Zod is already `^4.4.3`.** React `^19.2.7`, Vite `^8.1.0`, Vitest `~4.1.10`. No new dependencies.

### Architecture compliance (do not violate)

- **No new architectural components** for FR43 — no KV, no new service, no drafts/runs tables. Aggregate queries over existing D1 tables + REST is the whole design [Source: architecture.md#Scope-deltas-from-UX-promotion]
- Apex is **one long-scroll page**. Do not create `HomePage.tsx` / `StateDetailPage.tsx` from the architecture directory sketch — that sketch is superseded [Source: architecture.md#Frontend-routing-clarification]
- `surfaces/apex` must not import `surfaces/ops` internals or `pipeline/*`. Link across hosts
- DB `snake_case` → API `camelCase` in the repo layer only
- Public GET cacheable; admin no-store. Do not apply `ADMIN_CACHE_HEADERS` here
- Order in `server.ts`: agents/admin guards **before** public router (already true)

### Scope boundaries (do NOT do in this story)

- Heat map, status board, case list/filters, issue map, entity ledger, cert gauge (2.3–2.8)
- Reader poll + `poll_votes` (2.9). Do not leave a clickable fake poll
- Full trust furniture / donations / correction form / ops. handoff polish (2.10). Footer disclaimer already exists — leave it
- Pipeline, drafts, live last-updated-from-runs (Epic 3)
- Lucide, ECharts, TopoJSON, TanStack Query, React `use()` + Suspense rewrite
- Live production deploy
- Hosting `#layers` or `#journal` on apex

### UX / section-order nuance

UX-DR8 full order: trust → credibility → masthead → KPI → **poll** → brief → circuits → … → footer.

This story owns everything through brief **except poll**. 2.9 inserts `#poll`. 2.10 asserts the full order. Do not "helpfully" implement a localStorage poll.

FR43 text lists four KPI figures; Tracker.html `renderKPIs()` ships **six cells**. UX-DR24 is high-fidelity recreate of the handoff. Implement six; keep FR43's four among them. All six are cheap given one aggregate query.

### Anti-patterns (the 2.1 review in miniature)

- Hardcoded counts in JSX or in CSS `content:`
- Fallback `{kpis?.mattersTracked ?? 25}`
- Handoff "2 awaiting approval" / "checked daily" / dummy LinkedIn
- Extending LaunchNote instead of deleting it
- Client N+1 of `/api/cases/:id` to build the feed
- Counting all 51 states as "states tracked"
- Counting resolved `case-flaherty` as an appeal pending
- Wall-clock 30-day window against a frozen seed
- New wrapper `{ data, success }`
- Putting orientation components in `src/shared/ui/`

### Previous story intelligence (2.1)

- Public router + Zod + repos + seed are done. Nested detail on state/case. List routes stay summaries — that is why the feed needs its own query
- `import type` from schemas in client (zod must not follow into the bundle)
- Two Vitest projects: `workers` (`*.test.ts`, D1) vs `ui` (`*.test.tsx`, no bindings)
- `.dev.vars` loads into Vitest — rejection tests construct their own env
- `banned` is in two enums (posture vs operational status). KPI operational split is **operational status**, not posture
- `unknown` operational status is absence; do not render it as a split cell
- LaunchNote quantitative claims were a HIGH finding and were stripped. Do not put them back in the masthead
- Hardcoded TrustBar date was explicitly deferred to 2.2
- `npm run deploy` runs `vite build && vitest run && migrate:remote && wrangler deploy`. A failing test blocks deploy. There is no CI
- Do not deploy live until the `/preview/*` landing overwrite is resolved

### Git intelligence

Last five commits are Epic 1 close (`ee5a3b2` … `37a4e17`): Access, deploy pipeline, `/agents/*` auth. **None of 2.1 is in those commits.** Patterns to copy from git: fail closed, pin `run_worker_first` parity, never invent a second auth path, verify claims by running them.

### Latest technical notes (React 19.2 / Vite 8)

- React 19 `use()` unwraps a **stable** cached promise and needs Suspense + Error Boundaries. Creating a promise in render refetches forever. This Vite SPA has neither SSR nor those boundaries. **`useEffect` + abort, matching `useAdminSession`, is the correct pattern.** Do not add TanStack Query "because React 19"
- No new packages. If you think you need one, HALT

### Project structure notes

```
src/surfaces/apex/ApexShell.tsx              UPDATE — compose orientation, delete LaunchNote
src/surfaces/apex/LaunchNote.tsx             DELETE
src/surfaces/apex/orientation/*              NEW
src/shared/ui/pml.css                        UPDATE — port orientation rules
src/shared/api/publicRouter.ts               UPDATE — two GET routes
src/shared/api/publicApi.test.ts             UPDATE
src/shared/db/repos/kpisRepo.ts              NEW
src/shared/db/repos/casesRepo.ts             UPDATE — listRecentDevelopments
src/shared/schemas/kpi.ts                    NEW
src/shared/schemas/development.ts            NEW (or colocate with kpi)
src/surfaces/shells.test.tsx                 UPDATE
public/assets/patrick-bland.jpg              NEW if Patrick supplies it; else lettermark
```

Do not create architecture-sketch `pages/HomePage.tsx`.

### Testing standards summary

- Vitest ~4.1.10, two projects, Miniflare D1, zero cloud credentials
- Workers tests own numeric truth. UI tests own structure, order, honesty of copy, and (if mocked) that figures track the mock
- Keep the IA-split test (apex does not host explainer/journal)
- `npm run check` covers oxfmt + oxlint + tsc, including markdown/JSON

### References

- [Source: epics.md#Story-2.2] lines 394–407 — user story + ACs
- [Source: epics.md] FR43 (L117), UX-DR8 (L180), UX-DR22/23 (L211–212), Epic 2 list (L374–539)
- [Source: architecture.md#Scope-deltas-from-UX-promotion] L709 — no new components; aggregate KPIs
- [Source: architecture.md#Frontend-routing-clarification] L711–713 — long-scroll, not detail routes
- [Source: ux-designs/design_handoff_pml/README.md] Apex section order; KPI table says 4, HTML implements 6
- [Source: ux-designs/design_handoff_pml/PML Tracker.html] ~548–750 markup, ~2134–2169 `renderKPIs`/`renderFeed`, orientation CSS
- [Source: 2-1-f1-data-model-apis-case-law-seed.md] consumer table, LaunchNote delete, forum KPI note, hardcoded LastUpdated
- [Source: deferred-work.md] LaunchNote ordering constraint; do not live-deploy
- [Source: src/surfaces/admin/useAdminSession.ts] fetch pattern
- [Source: migrations/0002_seed_f1.sql] `case-flaherty`, NJ cert deadline 3 Sep 2026

## Open Questions for Patrick (do not block implementation)

1. **Founder portrait.** No `patrick-bland.jpg` exists in the repo or the handoff bundle. Story falls back to a `.plate` lettermark. Drop a photo at `public/assets/patrick-bland.jpg` whenever you want it swapped in.
2. **LinkedIn URL.** Handoff uses `https://www.linkedin.com/` (homepage). Story omits the founder LinkedIn link rather than shipping a dummy. Provide a real profile URL to restore it.
3. **Commit 2.1 first?** 2.1 is marked `done` but was still uncommitted when this story was contexted. A 2.2 `baseline_commit` of current `HEAD` (`ee5a3b2`) would make the review diff include all of 2.1. Committing 2.1 before `dev-story` keeps the diffs honest.

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

Ultimate context engine analysis completed - comprehensive developer guide created.

### File List

## Change Log

- 2026-08-31: Story context created from Epic 2 / FR43 / UX handoff / Story 2.1 implementation (ready-for-dev)
