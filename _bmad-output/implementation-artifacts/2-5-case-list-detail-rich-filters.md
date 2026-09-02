---
baseline_commit: 534bb371bb494164ffbe2cc9c1af32585353ec55
baseline_branch: story/2-4-state-status-board-synced-with-map
main_at_creation: 727e2ecc8b6a67364c645a4ac31a731f30725a88
---

# Story 2.5: Case List, Detail & Rich Filters

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a litigator or journalist,
I want to browse and filter case records with docket detail,
so that I can verify posture from the single source of truth.

## ⚠️ Read this before writing any code

**This is the first story that answers “what is the docket?”, and the first that must deep-link a case.** Eight things will bite you; tests catch only some of them:

1. **Do not branch from `main`.** `main` is still `727e2ec` (Story 2.3). Story 2.4’s provider, board, and popstate live on `story/2-4-state-status-board-synced-with-map`. Branch `story/2-5-case-list-detail-rich-filters` from **2.4 after it is committed**. Starting from `main` deletes the board.
2. **One selection hook. Not two.** `useApexSelection` already lives inside `ApexF1Provider`. Instantiating it again in the case band desyncs map, board, and list. Extend `{ state, circuit }` with `case` in place. [Source: ApexF1Context.tsx; architecture.md#Frontend-routing-clarification]
3. **Do not N+1 `/api/cases/:id` to power filters.** List `Case` has no issue tags, no affected states, no entity roles. Enrich `GET /api/cases` with slim filter fields (Task 2). Client-side AND-token search on those 25 rows. **Do not add FTS5.**
4. **Do not invent `partyRole` on the case row.** 2.1 tests `expect(body).not.toHaveProperty("partyRole")`. Roles live on `case_entities`. List enrichment carries `entityRoles: CaseEntityRole[]`; the row helper collapses that to a label. [Source: publicApi.test.ts; vocabulary.ts]
5. **Do not follow architecture’s `pages/CaseDetailPage.tsx` sketch.** Apex is one long-scroll page. Case files go under `src/surfaces/apex/cases/`, same pattern as `states/`. `?case=case-flaherty` is the standalone surface.
6. **Do not default-select Flaherty.** Empty URL → no row selected → empty panel copy. Handoff `selCase = "flaherty"` is the same prototype bug 2.3/2.4 forbade for New Jersey.
7. **Controlling issue is `isControlling`, not array index 0.** The unique partial index from 2.1 guarantees at most one. Prototype used `i === 0`. [Source: migrations/0001_f1_core.sql]
8. **Do not live-deploy.** Production landing overwrite is still open in deferred-work.

## Acceptance Criteria

1. **Given** seeded cases with docket events and issue tags (Story 2.1), **when** I view the `#cases` band, **then** a list + detail layout shows caption (**italic**), posture (`PostureSwatch` + `POSTURE_LABELS`), forum (readable label from `FORUM_VALUES`), party-role label derived from `entityRoles`, and lifecycle (active = full weight; resolved = reduced opacity / quieter meta — `active`/`resolved` raw enum is data, “Active”/“Resolved” is the visible word)
2. **And** filters include free-text search, posture chips (multi-select; empty set = all), issue-tag dropdown, state dropdown, circuit dropdown, and Clear (FR40). Filter/search state is **local React state**, not URL params. Count copy is `{visible} of {total} cases` — interpolate, never a literal
3. **And** detail shows issue tags (`.itag.primary` iff `isControlling`; rest secondary), court + `docketNumber`, `ProvenanceLabel`, posture line with links to affected states and circuit, and a reverse-chron hairline `.docket` timeline — each event dated and Tier-1 source-linked. Closing note (verbatim intent): every event links to a Tier-1 source; trade press is leads only and never the citation of record
4. **And** selecting a case from the state board (“Open case record”) or a masthead development, or loading `?case=case-flaherty`, opens the **same** detail panel. Invalid / unknown ids fail closed (stripped). Do not add `CaseDetailPage` or `/cases/:id`
5. **And** the same case cannot show conflicting posture vs map/board: the case row and the detail both render `case.posture` from the published case record. Do **not** derive case posture from affected states’ postures (they can disagree — that is a data error for `#trust`, not something to paper over)

## Tasks / Subtasks

- [x] **Task 1: Preflight** (AC: all)
  - [x] Confirm Story 2.4 is **committed** on `story/2-4-state-status-board-synced-with-map` (or merged). Record `git log -1 --oneline`. If 2.4 is still uncommitted, **stop** — this story patches 2.4 files
  - [x] Confirm `npm test` is green on that 2.4 SHA. Record the count. Zero cloud credentials
  - [x] Confirm `npm run check` exits 0
  - [x] Confirm `GET /api/cases` is `{ items: Case[] }` length 25 and `GET /api/cases/case-flaherty` is **bare** `CaseDetail` with `docketEvents`, `issueTags`, `states`, `entities`, `sources` (≥1 tier1). If 404, you are not on 2.1
  - [x] Confirm `#cases` is still EmptyState and `#states` is `<StateBoard />` inside `ApexF1Provider`. If `LaunchNote.tsx` exists, stop
  - [x] Read, do not remember: Tracker.html `#cases` (~903–930), case CSS (~326–370), `caseMatches` / `renderCases` (~1665–1775). Recreate in React; do not ship the HTML (UX-DR24)
  - [x] Read `ApexF1Context.tsx`, `selection.ts`, `useApexSelection.ts`, `useCircuitData.ts`, `ApexShell.tsx` `#cases`, `StateDetail.tsx` “Open case record”, `Masthead.tsx` developments, `useStateDetail.ts`, `caseSchema.ts`, `casesRepo.ts`, `publicRouter.ts`, `vocabulary.ts`, `dates.ts`, `states.test.tsx` stub
  - [x] Branch: `story/2-5-case-list-detail-rich-filters` from the **2.4 commit**, not from `727e2ec`

- [x] **Task 2: Enrich `GET /api/cases` so filters do not N+1** (AC: 2)
  - [x] Add `CaseListItemSchema = CaseSchema.extend({ ... })` in `caseSchema.ts`. **Do not** put these fields on `CaseSchema` itself — `CaseDetailSchema` already has a differently shaped `issueTags`:
    - `listIssueTags: { slug, label, isControlling }[]`
    - `affectedStateCodes: string[]` (2-letter codes, from `case_states` → `states.code`)
    - `entityRoles: CaseEntityRole[]` (from `case_entities.role`, may be empty)
  - [x] `listCases` still **one list endpoint**, same `{ items }` envelope, **no query params**. After the cases `SELECT`, run **three** follow-up queries (all rows, not per case) and assemble in JS. Do not `getCaseById` in a loop. Do not add `/api/cases?include=`
  - [x] Keep `GET /api/cases/:id` unchanged (bare `CaseDetail`). Detail still has **no** `partyRole` scalar — do not weaken `publicApi.test.ts`
  - [x] Pin in `publicApi.test.ts`: a list item has the three new arrays; still no `partyRole`; `case-flaherty` list row’s `affectedStateCodes` includes `"NJ"`; `listIssueTags` is non-empty. Do not assert seed `25` in UI tests
  - [x] HALT if you add FTS5, Fuse, MiniSearch, or a second cases endpoint

- [x] **Task 3: Extend selection with `?case=`** (AC: 4)
  - [x] `ApexSelection = { state, circuit, case }` where `case` is the seed id (`case-flaherty`) or `null`
  - [x] Parse: `CASE_RE = /^case-[a-z0-9]+(?:-[a-z0-9]+)*$/i` — fail closed (drop `flaherty`, `Case-Flaherty` with spaces, path-like values). Store lowercase (`case-mi-nessel`)
  - [x] `serializeApexSelection` writes/deletes `case` the same way it does `state` / `circuit`. Preserve unrelated keys
  - [x] `constrainApexSelection(..., caseIds: ReadonlySet<string>)` — same staggered-axis rule as state/circuit: empty set keeps the parsed value for that axis; non-empty set drops unknown ids. Update **every** caller (`nextApexSearch`, `useApexSelection`, `circuits.test.tsx`, `states.test.tsx` stub)
  - [x] `selectionForCase(id, current)` → `{ ...current, case: id }`. Does **not** clear state/circuit. Does **not** invent a state from `affectedStateCodes`
  - [x] `useCircuitData`: add `casesReady`; `listsReady = circuitsReady && statesReady && casesReady`. Today cases load with `settled: () => {}` so `?case=` would be unconstrained forever or stripped — fix that. Tighten `isCase` to require `posture`, `forum`, `lifecycle`, and the three new arrays
  - [x] `useApexSelection(stateCodes, circuitIds, caseIds, listsReady)` — third key `caseKey`. `commit` / `popstate` / mount all pass `caseIds`. Initial state includes `case: null`
  - [x] HALT if you add React Router, `pushState` for clicks, or a second selection store
  - [x] **Do not** change `CircuitMap.paint()` from `selection.case`. Map fills stay posture; opacity stays circuit × posture-legend × statusFilter. Case selection is a list/panel/URL concern

- [x] **Task 4: Pure case helpers** (AC: 1–3, 5)
  - [x] New `src/surfaces/apex/cases/caseView.ts` — **pure, no `window`**:
    - `FORUM_LABELS: Record<Forum, string>` — `federal-district` → “Federal district”; `federal-appellate` → “Federal appellate”; `state` → “State court”; `agency` → “Agency”. **Not** the prototype’s `federal` / `both`
    - `CASE_POSTURE_CHIP: Record<Posture, string>` — short chip copy: For platform / Pending / For state / Banned / Untracked. Detail uses `POSTURE_LABELS`
    - `partyRoleLabel(roles: readonly CaseEntityRole[]): string | null` — if both `plaintiff` and `defendant` → `"Both"`; else if `plaintiff` → `"Plaintiff"`; else if `defendant` → `"Defendant"`; else unique remaining roles title-cased and joined with `" / "` (`appellant` → Appellant, `enforcement-target` → Enforcement target); empty → `null` (omit the meta slot, do not print “Unknown”)
    - `caseMatches(row, filters, haystackExtras?)` AND of: issue slug membership; state code membership; `circuitId`; posture in the selected set (empty set = all); free-text
    - Free-text: `trim`, split on whitespace, **every** token must appear in the haystack (case-insensitive). Haystack = `caption`, `court`, `docketNumber ?? ""`, `listIssueTags` labels+slugs, `affectedStateCodes`, plus state **names** passed in from the already-fetched `/api/states` list. Do **not** search `SUMMARY` — that object is prototype-only and is not in D1
    - `uniqueIssueTags(rows)` / `uniqueAffectedCodes(rows)` for dropdown options. Sort labels `localeCompare`
    - `emptyCaseFilters()` — search `""`, posture `Set`, issue `"all"`, state `"all"`, circuit `"all"`
    - `filtersAreClear(f)` — used for Clear `aria-pressed`
  - [x] Pin these with **mock** rows (`case-flaherty` pending/NJ/cir-3/cea-preemption; `case-other` banned/NV). Do not assert seed counts

- [x] **Task 5: `#cases` UI** (AC: 1–5)
  - [x] New files under `src/surfaces/apex/cases/` (surface-local — **not** `src/shared/ui/`):
    - `CaseBoard.tsx` — filters + `.cases` grid (list | panel); composed inside existing `SectionBand id="cases"`
    - `CaseFilters.tsx` — `.casebar`: `<input type="search" class="srch">`, issue `<select>`, state `<select>`, circuit `<select>`, posture chips + Clear as `<button class="chip" aria-pressed>`
    - `CaseList.tsx` — `.caselist` of `<button type="button" class="caseitem">` with `aria-selected`. **No** `role="button"` on a non-button
    - `CaseDetail.tsx` — sticky aside (reuse `.detail` / `.dhead` / `.dbody` / `.srcline` / `.detail-actions`)
    - `useCaseDetail.ts` — clone `useStateDetail`: fetch `GET /api/cases/${id}` when `selection.case` is set; AbortController; fail closed; `epoch` from context so re-select of the same id retries; `resolveCaseDetailLoad` drops a payload whose `id` ≠ current selection (2.4 review: do not paint Flaherty’s docket under a newly selected caption)
    - `isCaseDetail` must require `docketEvents`/`issueTags`/`states`/`sources` arrays and that each docket event has `source` with `url` + `title` + `tier` — a 200 missing those is `error`, not a throw
  - [x] **Provider span:** wrap `#circuits` through `#cases` in `ApexF1Provider` (the `#issues` EmptyState sits in the middle — that is fine; 2.6 will need the same context). Do **not** create a second provider
  - [x] Rewrite `ApexShell.tsx` `#cases` only: keep SectionBand; replace EmptyState with `<CaseBoard />`. Handoff copy:
    - kicker: `A3 · Case record` (or `Case record` if the numbered kickers on later EmptyStates would clash — numbered `05` is the placeholder; **do not keep `05`**)
    - title: `Cases`
    - why: `One record per case, one posture per case. If a state and a circuit disagree on screen, that is a data error — report it.`
    - Leave `#issues` `#entities` `#cert` `#trust` `#ops` as EmptyState
  - [x] **List row:** italic caption (`.cap`, Cormorant via existing heading stack / `font-style: italic`); `.meta` = forum label · court · docket number; `.ctag` = `PostureSwatch` (label allowed — UX-DR2 fill never travels alone) + `partyRoleLabel` when non-null + lifecycle word. `data-lifecycle={row.lifecycle}` for CSS weight. Select via the `.caseitem` button → `commit(selectionForCase(id, selection))`. Keep the API list order (`updated_at DESC`) after filtering — **no sort headers** on this band (that is the state board’s job)
  - [x] If filters hide the selected row, **keep the panel**. Do not `commit({ case: null })` on filter change. (Same idea as 2.4: a dimmed map state can still be the selection.)
  - [x] **Panel empty** (no selection): `.empty` — “Select a case from the list.” / hint “Absence of a match is not a finding about the litigation.” Do **not** render Flaherty
  - [x] **Panel selected** (list fields immediately; detail as it lands):
    - kicker `Case record`
    - `<h3>` caption — section heading, **not** a second document `h1`
    - forum label + `court` · `docketNumber` (or omit the number when null) + `<ProvenanceLabel kind={row.provenanceKind} />`
    - **No `SUMMARY[...]` paragraph.** D1 has no summary field. Do not invent one
    - Posture line: `<strong>{POSTURE_LABELS[posture]}</strong>` · Affects {state name links} · circuit `<a href="#circuits">` using `circuits.find` **name** (e.g. “Third Circuit”). State links: `commit(selectionForState(code, states))` + `href="#states"`. Circuit link: `commit(selectionForCircuit(id, states, selection))` + `href="#circuits"`. Seed circuit ids are `cir-3`, never `"3"`
    - Issue tags from **detail** (`issueTags`), not list slugs, once loaded; while loading, omit the tag row rather than flashing list slugs in the wrong order
    - Docket: `<ul class="docket">` from `detail.docketEvents` (already `ORDER BY occurred_at DESC`). Date via **date-only** helper (Task 6). Link `event.source.title` → `event.source.url` (`target="_blank" rel="noopener"`). Tracked + still loading → don’t claim “no docket”. Loaded + zero events → EmptyState, do not invent a row
    - Closing note under the list (12px, neutral-600)
    - Actions: `Report an error` → `<a class="btn btn-ghost" href="#trust">`. No CSV/JSON
  - [x] **Open case from the board:** `StateDetail` “Open case record” becomes `onClick` → `commit(selectionForCase(controllingCaseId, selection))` plus `href="#cases"` (hash scroll). Do not drop `?state=` / `?circuit=`
  - [x] **Masthead developments:** `href={`?case=${encodeURIComponent(item.caseId)}#cases`}` is acceptable as an **entry point** (may replace other query keys on full navigation). Prefer commit if you wrap Masthead in the provider; do **not** lift `useOrientation` into F1 context
  - [x] **Unmatched filter:** EmptyState “No case matches” / hint that this is a statement about the filter, with `<a href="#trust">tell us what is missing</a>` — **`#trust`, not `#correct`**
  - [x] **404/network on detail:** honest message in the panel; list stays up
  - [x] One document `<h1>` remains the masthead. Focus ring is the global accent outline (NFR5)
  - [x] At `max-width: 940px`, after selecting a case, `scrollIntoView` the panel (same 2.4 board patch — stacked detail is `static` under the list)

- [x] **Task 6: Dates — do not TZ-shift docket days** (AC: 3)
  - [x] `occurredAt` is `IsoDate` (`YYYY-MM-DD`). `formatEtDate("2024-07-01")` is UTC midnight → previous calendar day in ET. Masthead already works around this with a local `formatIsoDate` that appends `T12:00:00.000Z`
  - [x] **Lift** that helper into `src/shared/lib/dates.ts` as `formatIsoDate` and use it from Masthead + docket items. Do not copy a third private function

- [x] **Task 7: CSS** (AC: 1, 3)
  - [x] Port into `src/shared/ui/pml.css` using tokens: `.casebar`, `.srch`, `.casebar select`, `.casechips`, `.cases`, `.caselist`, `.caseitem` (+ hover / `[aria-selected=true]` / `:focus-visible`), `.caseitem .cap` (**italic**), `.caseitem .meta`, `.ctag`, `.forum`, `.itag` / `.itag.primary`, `.docket` / `.docket li` / `::before` / `.docket .d`, `[data-lifecycle="resolved"]` quieter
  - [x] Desktop `.cases { grid-template-columns: 1fr 1.05fr; gap: var(--space-6); align-items: start; }` — **README A3**, not the prototype’s `1fr 3fr` (same class of bug as 2.3 ignoring broken `.f1`)
  - [x] Reuse `.detail` sticky panel (`top: 78px`, `max-height` already from 2.4). Do **not** restyle `.board` (state table)
  - [x] Add `.cases { grid-template-columns: 1fr; }` to the existing `@media (max-width: 940px)` block that already collapses `.f1` / `.board` (~L1525). Do not invent a new breakpoint
  - [x] Reuse `.chip`, `.empty`, `.btn`, `.kicker`, `.num`, `.prov`. Do **not** add `.export`
  - [x] Do not redeclare posture fills (`.sw.*`) or badge colors

- [x] **Task 8: Tests** (AC: all)
  - [x] `src/surfaces/apex/cases/cases.test.tsx`:
    - Search token AND: `"kalshi flaherty"` matches the Flaherty mock; `"kalshi nevada"` does not
    - Issue dropdown `cea-preemption` hides a mock without that slug
    - State `NJ` hides a mock whose `affectedStateCodes` is `["NV"]`
    - Circuit `cir-3` hides `circuitId: "cir-9"`
    - Posture chip `banned` hides `pending`; empty set shows both
    - Clear resets all of the above
    - Selected `.caseitem` `aria-selected="true"`; panel `<h3>` is the caption
    - Empty panel copy when `case: null`
    - `?case=` hydrate: stub `selection.case = "case-flaherty"` → panel, not empty copy
    - Resolved mock has `data-lifecycle="resolved"`
    - Controlling tag: `isControlling: true` gets `.itag.primary` even if it is not first in the array
    - Posture SSOT: mock case `pending` with an affected state `banned` still renders pending on the row — do not take the state’s posture
    - Sources: detail mock with a tier1 docket link is present; do not hit the network
  - [x] `circuits.test.tsx` selection: every expected `{ state, circuit }` grows `case: null`; add round-trip `?case=case-flaherty`; garbage `?case=flaherty` and `?case=Case%20Flaherty` fail closed; constrain drops unknown `case-nope` when the set has `case-flaherty`; staggered: empty `caseIds` keeps parsed case
  - [x] `states.test.tsx` stub `selection` includes `case: null`; “Open case record” still present when `controllingCaseId` is set (href `#cases`)
  - [x] `shells.test.tsx`: `#cases` no longer contains “Case views not yet wired”; `.cases` / `.caseitem` or `.casebar` present; remaining EmptyState bands are `issues`, `entities`, `cert`, `trust`, `ops` (**5**). IA split still holds. Exactly one `h1`
  - [x] `publicApi.test.ts`: list enrichment pins (Task 2); existing Flaherty detail + 404 + malformed id tests still pass
  - [x] Static markup will not run `useEffect` — first paint without docket events is expected. Do not assert seed `25` in JSX
  - [x] `npm test` green, zero cloud credentials

- [x] **Task 9: Finalize** (AC: all)
  - [x] `npm run check` exit 0
  - [x] Close the deferred-work FTS bullet: record that 2.5 chose client-side AND-token match at 25-row scale; FTS5 is postponed until the corpus makes `GET /api/cases` list-all insufficient
  - [x] **Do not live-deploy.** `npx wrangler deploy --dry-run` is enough
  - [x] File List from `git status` / diff. Single commit only if Patrick asks
  - [x] Browser-verify `#cases`: list paints, search, chips, dropdowns, Clear, row → panel, `?case=case-flaherty` restores panel, `?case=nope` fail-closed, board “Open case record” selects Flaherty and scrolls to `#cases` without losing `?state=`, italic caption, resolved row quieter, 940px stacks and unsticks the panel, docket dates are the calendar day in the seed (not the previous ET day), `#issues` still EmptyState

## Dev Notes

### Current code state (verified 2026-09-01)

- `main` is `727e2ec` — Stories 2.1–2.3 only. **2.4 is the required base** (`ApexF1Provider`, `#states` board, popstate). As of this writing 2.4 is on `story/2-4-state-status-board-synced-with-map` and may still be uncommitted
- `ApexShell.tsx` `#cases` is EmptyState (“Case views not yet wired”). `#states` is `<StateBoard />`. Provider wraps **only** `#circuits` + `#states` — `#cases` cannot see context until the wrap is extended
- `ApexSelection` is `{ state, circuit }` only. `?case=` is ignored. `serialize` never writes it. Stories 2.2–2.4 deferred this on purpose
- `GET /api/cases` → `{ items: Case[] }` ordered `updated_at DESC, id ASC`. Fields: `id`, `caption`, `court`, `docketNumber`, `forum`, `lifecycle`, `posture`, `circuitId`, `filedAt`, `decidedAt`, `provenanceKind`, `publishedAt`, `updatedAt`. **No** `listIssueTags`, **no** `affectedStateCodes`, **no** `entityRoles`, **no** docket rows, **no** `partyRole`, **no** `citation`, **no** `summary`
- `GET /api/cases/:id` → bare `CaseDetail` (`jsonOk`). Adds `sources[]` (min 1, ≥1 tier1), `docketEvents[]` (each embeds Tier-1 `source`), `issueTags[]` (`tag` + `isControlling`), `states[]` (`state: State`), `entities[]` (`entity` + `role`). Unknown id → 404 envelope. Bad percent-encoding → 400 `"Malformed case ID."`
- `useCircuitData` already fetches `/api/cases` (map tooltip join) but `listsReady` is **only** circuits ∧ states. `isCase` is `id` + `caption` only
- Seed: **25** cases. Issue tags include `cea-preemption`, `swap-definition`, `sports-event-contracts`, `state-enforcement`, `cftc-offensive`, `geofencing`, `certiorari-path`, `statutory-ban`. Flaherty is `case-flaherty`, Third Circuit is `cir-3`, NJ is `NJ`
- `UpdatedBadge` / 30-day window is a **board** concern. Case list does not show an updated chip unless you reuse it on the panel from `updatedAt` — not required by AC
- React `^19.2.7`, Vite `^8.1.0`, Vitest `~4.1.10`, Zod `^4.4.3`. **No new npm packages**

### Allowed new dependencies

None. List + panel + fetch + existing `GET /api/cases`. If you think you need Fuse, TanStack Query, a router, or lucide, you are off the story.

### FTS decision (closes 2.1 deferred item)

D1 compiles SQLite FTS5 ([Cloudflare D1 SQL statements](https://developers.cloudflare.com/d1/sql-api/sql-statements/)). It is the right design **when the corpus outgrows one list payload**. Twenty-five rows do not. Implement prototype `caseMatches` in `caseView.ts`. Do not create a virtual table, triggers, or `MATCH` query in this story. Record the postponement in `deferred-work.md` so a later scale story does not re-litigate it from zero.

### Reuse, do not reinvent

| Need | Already at | Note |
|---|---|---|
| Selection URL | `selection.ts` / `useApexSelection.ts` | Extend; do not fork |
| F1 list fetch | `useCircuitData.ts` | Already loads cases; add `casesReady` |
| Shared lists + commit | `ApexF1Context.tsx` | One hook. Extend `ApexSelection` |
| Detail fetch pattern | `states/useStateDetail.ts` | Clone; bare JSON; `epoch`; stale-id guard |
| Board composition | `states/StateBoard.tsx` | Filters + grid + panel |
| Posture label | `PostureSwatch` / `POSTURE_LABELS` | Detail uses full labels; chips use short copy in `caseView.ts` |
| Provenance | `ProvenanceLabel` | `kind` from the row |
| Dates | `dates.ts` | Lift Masthead’s date-only helper |
| State/circuit jump | `selectionForState` / `selectionForCircuit` | Detail links only |
| Band chrome | `SectionBand`, `EmptyState` | Success path is not EmptyState |
| Sticky panel chrome | `.detail` already in `pml.css` | Reuse; don’t fork `.board` |
| List envelopes | `jsonList` `{ items }` | Detail is **not** an envelope |
| Issue-tag uniqueness | D1 unique index `is_controlling = 1` | Render `isControlling`, not index 0 |

### Architecture compliance

- URL params are the shareable source of truth for **selection** (`state`, `circuit`, `case`). Filters stay in component state (FR40 UI; do not add `?issue=` / `?q=` — 2.6 may lift the issue dropdown into context later)
- Architecture’s `?legalTrack=` sketch is REST naming, not a mandate to add query params on `GET /api/cases`
- No Mapbox, no new D1 tables, no KV, no `/api/poll/*`, no writes
- Apex stays one long-scroll page. Do not create `pages/` or per-case routes
- `surfaces/apex` must not import `surfaces/ops` internals
- DB snake_case stays in repos; client sees camelCase only
- `import type` from schemas in client so zod stays out of the bundle
- Do not host `#layers` / `#journal` on apex
- Public GETs remain cacheable as today
- Forum / lifecycle / role **glossary strings** stay lowercase on the wire; UI maps to reader words

### Scope boundaries (do NOT do)

- CSV/JSON export (handoff `.export` — not in ACs)
- Forum filter dropdown (prototype-only; **not** in FR40 / Story 2.5 AC / README A3 filter list)
- `SUMMARY` lead-in prose (not in D1)
- FTS5 / new search packages / new cases query params
- `partyRole` scalar on `Case` / `CaseDetail`
- Correction form / GitHub issue (2.10 / 4.5). Hash `#trust` only
- Issue map / ECharts (2.6). Keep `#issues` EmptyState. Do not lift case filters into context “for 2.6” unless two bands already share them — they don’t
- Entity ledger matter links (2.7)
- Brand `Posture` vs `OperationalStatus` at the type boundary (deferred-work)
- Lucide, TanStack Table/Query, React Router, Redux
- Live production deploy
- `wrangler.jsonc` `run_worker_first` (already `/api` + `/api/*`)
- Admin / ops shells, `#poll`, cert band
- Default `selCase = "flaherty"`
- Fetching `/api/cases/:id` for every list row
- Adding `GET /api/circuits/:id`

### Handoff bugs you must not recreate

| Handoff | Seed / app | Do this |
|---|---|---|
| `selCase = "flaherty"` | URL empty until click | No invented default |
| Circuit ids `"3"` / `"DC"` | `cir-3` / `cir-dc` | Seed ids; `name` in the panel |
| `.cases` `1fr 3fr` | README A3 `1fr 1.05fr` | Follow README (2.3 precedent) |
| Caption not italic; no lifecycle on rows | UX-DR11 / AC1 | Italic + `data-lifecycle` even though HTML omitted them |
| Controlling = `issues[0]` | `isControlling` + unique index | Accent iff `isControlling` |
| `partyRole` on the case | `case_entities.role` | `entityRoles[]` + `partyRoleLabel` |
| `SUMMARY[id]` paragraph | No summary column | Omit |
| Forum filter + `federal`/`both` | `Forum = federal-district \| federal-appellate \| state \| agency` | No forum filter; four labels |
| `#correct` | Section id is `#trust` | `href="#trust"` |
| `.export` CSV/JSON | Not in ACs | Omit |
| Prototype `.tl` | Brief year grid, **not** docket | New `.docket` class |
| Search haystack includes `cite` / `track` | No such fields | caption, court, docket, tags, state codes/names |

### Current files being modified (read before editing)

**`selection.ts` — UPDATE**
- Today: `{ state, circuit }`; parse/serialize/constrain two axes; `nextApexSearch` waits on `listsReady`
- Change: add `case`; `CASE_RE`; third membership set; `selectionForCase`
- Preserve: fail-closed garbage; staggered empty-set keep; unrelated query keys; no `window`

**`useApexSelection.ts` — UPDATE**
- Today: `stateCodes` + `circuitIds`; popstate; `replaceState` on commit
- Change: `caseIds` + `caseKey`; initial `{ case: null }`
- Preserve: do not read `window.location` during render; `listsReady` gate; clicks stay `replaceState` (not `pushState`)

**`useCircuitData.ts` — UPDATE**
- Today: fetches cases but `listsReady` ignores them; `isCase` is thin
- Change: `casesReady`; tighten `isCase` for enrichment fields
- Preserve: fail closed; parallel fetch; `import type`

**`ApexF1Context.tsx` — UPDATE**
- Today: one `useApexSelection(stateCodes, circuitIds, listsReady)`; `statusFilter` local; `cases: Case[]`
- Change: pass `caseIds`; selection type grows `case`; type `cases` as `CaseListItem[]`
- Preserve: single hook; `detailEpoch` bump on commit; `ApexF1Stub` for tests
- `states.test.tsx` `caseRow()` / stub must fill `listIssueTags: []`, `affectedStateCodes: []`, `entityRoles: []` (or Flaherty’s NJ / plaintiff) so the new `isCase` guard does not drop the board’s caption join

**`ApexShell.tsx` — UPDATE**
- Today: provider around circuits+states; `#cases` EmptyState
- Change: provider through `#cases`; `#cases` `<CaseBoard />`; handoff copy
- Preserve: orientation, IA split, remaining EmptyStates, single `h1`, TopBar `#cases` link

**`StateDetail.tsx` — UPDATE**
- Today: `href="#cases"` only
- Change: also `commit(selectionForCase(controllingCaseId, selection))`
- Preserve: `#trust` report link; hide the button when no `controllingCaseId`; join-miss honesty from 2.4 review

**`Masthead.tsx` — UPDATE (small)**
- Today: developments `href="#cases"`
- Change: include `?case={caseId}` (Task 5); switch date helper to lifted `formatIsoDate`
- Preserve: fail-closed empty developments EmptyState; do not fetch case detail here

**`dates.ts` — UPDATE (small)**
- Today: `formatEtDate` / `formatEtDateTime` assume UTC instants
- Change: export `formatIsoDate` for `YYYY-MM-DD`
- Preserve: existing instant formatters

**`caseSchema.ts` / `casesRepo.ts` / `publicRouter.ts` / `publicApi.test.ts` — UPDATE**
- Today: list is the case row only
- Change: `CaseListItem` projection on the list endpoint only
- Preserve: detail envelope, 404/400, no `partyRole`, camelCase, cache headers

**`pml.css` — UPDATE**
- Today: `.board` / `.detail` for the state panel; no `.caseitem`
- Change: port casebar / caselist / caseitem / itag / docket; 940px `.cases`
- Preserve: `.board` columns, posture `.sw.*`, chip/badge tokens, `.detail` max-height

**`shells.test.tsx` — UPDATE**
- Remaining EmptyState ids lose `"cases"` (5 left)

**`circuits.test.tsx` / `states.test.tsx` — UPDATE**
- Every `ApexSelection` literal grows `case`

### Testing standards summary

- Vitest ~4.1.10, two projects, Miniflare D1, zero cloud credentials
- UI tests mock case/state/circuit props; workers tests pin `/api/cases/:id` — do not weaken them
- Keep the IA-split test
- `npm run check` = oxfmt + oxlint + tsc. Prefer real `<button>` / `<input type="search">` / `<select>` / `<ul>` over ARIA role soup
- `renderToStaticMarkup` does not run effects — detail panel’s first paint without `docketEvents` is expected
- jsx-a11y: the list row **is** a `<button class="caseitem">`, not a `<div role="button">`

### Previous story intelligence

**2.1:** List endpoints stay summaries; detail is nested. `banned` in two enums. Party role was **removed** from the case row (Patrick) so CFTC-v-state matters are not a fake plaintiff. Unique controlling-tag index exists because 2.5 would otherwise accent two tags. FTS deferred **to this story** — close it with the client-side decision, do not “also add FTS just in case”.

**2.2:** `useOrientation` is the public-surface fetch template. Developments join docket→cases specifically to avoid N+1 case-detail fetches. Date-only ISO must not go through raw `formatEtDate`. Do not hardcode seed counts in JSX. Remaining bands stay EmptyState until their story.

**2.3:** Selection `{ state: code, circuit: id }` is URL-driven. Geography is vendored us-atlas. Do not dim the choropleth when `cir-fed` is selected. Invalid params fail closed. No default NJ.

**2.4:** Lifted `useCircuitData` + `useApexSelection` into `ApexF1Provider`. Status chips are local, not URL. Detail fetch is bare JSON + AbortController + `epoch` re-select + stale-id guard (`resolveDetailLoad`). Sticky `.detail` already exists. 940px stacks and `scrollIntoView`s the panel. “Open case record” is hash-only until this story. Review patches to keep: don’t paint previous detail under a new heading; don’t claim table cells are source links; `#trust` not `#correct`; no live deploy.

### Git intelligence

HEAD on `main` is `727e2ec` (`story 2.3: circuit-split heat map from published F1 posture`). 2.2 is `6350b88`. 2.1 is `0b8a748`. 2.4 is a working branch, not main. Patterns that worked: fail closed, `import type` for schemas, no second API envelope, no live deploy, surface-local folders (`orientation/`, `circuits/`, `states/`), pin `run_worker_first` parity (do not touch it), README layout over broken prototype CSS.

### Latest technical notes

- **D1 FTS5** is compiled in (Cloudflare SQL statements / FTS5 module) but is unnecessary at 25 rows. Client-side token AND matches the prototype and FR40. Revisit when list-all is no longer the public contract
- **History API:** `popstate` still does not fire on `replaceState`. Keep click writes on `replaceState` so `?case=` is shareable without a 25-entry undo stack. `event.state` may be `null` — re-parse `location.search`
- **Search input:** native `<input type="search">` + `aria-label`. Do not invent a combobox
- **React 19:** no SSR in this app. Detail fetch in `useEffect`. Do not call `use()`
- **Date-only ISO:** `new Date("YYYY-MM-DD")` is UTC midnight. Append `T12:00:00.000Z` before `formatEtDate` so ET cannot roll the calendar day backwards
- **Vite 8:** no new `public/` files required

### Project structure notes

```
src/surfaces/apex/ApexShell.tsx                 UPDATE — provider span + #cases
src/surfaces/apex/ApexF1Context.tsx             UPDATE — caseIds into useApexSelection
src/surfaces/apex/useApexSelection.ts           UPDATE — third axis
src/surfaces/apex/selection.ts                  UPDATE — ?case=
src/surfaces/apex/circuits/useCircuitData.ts    UPDATE — casesReady + isCase
src/surfaces/apex/states/StateDetail.tsx        UPDATE — Open case record commits ?case=
src/surfaces/apex/orientation/Masthead.tsx      UPDATE — development deep link + date helper
src/shared/lib/dates.ts                         UPDATE — formatIsoDate
src/shared/schemas/caseSchema.ts                UPDATE — CaseListItemSchema
src/shared/db/repos/casesRepo.ts                UPDATE — list enrichment (3 extra queries)
src/shared/api/publicApi.test.ts                UPDATE — list pins
src/surfaces/apex/cases/*                       NEW
src/shared/ui/pml.css                           UPDATE — .cases / .caseitem / .docket
src/surfaces/shells.test.tsx                    UPDATE — EmptyState remaining 5
src/surfaces/apex/circuits/circuits.test.tsx    UPDATE — selection literals
src/surfaces/apex/states/states.test.tsx        UPDATE — stub.case
```

Do not create architecture-sketch `pages/`. Do not add D1 tables. Additive list JSON is required; new routes are not.

### Project context reference

No `project-context.md` is present in the repo. Carry architecture.md + the 2.1–2.4 story files as the implementation constitution.

### References

- [Source: epics.md#Story-2.5] L446–460 — user story + ACs
- [Source: epics.md] FR3 (L35), FR40 (L258), UX-DR11 (L186), UX-DR21/22/23, NFR4/NFR5 (L131–133)
- [Source: architecture.md] camelCase API (L345–347), URL params (L360), routing clarification (L711–713), FR40 served by existing REST (L709), `surfaces/apex` (L322)
- [Source: ux-designs/design_handoff_pml/README.md] A3 (~L117–126), long-scroll order (~L67–87)
- [Source: ux-designs/design_handoff_pml/PML Tracker.html] `#cases` markup, `caseMatches`, `renderCases` (do not copy default Flaherty, circuit ids `"3"`, forum filter, `#correct`, `SUMMARY`, or `1fr 3fr`)
- [Source: prds/prd-PML-2026-06-18/prd.md] FR-3 consequences (L118–126) — rich filtering elevated to v1 by epics FR40
- [Source: 2-1-f1-data-model-apis-case-law-seed.md] list vs detail, no `partyRole`, controlling-tag unique index, FTS deferred to 2.5
- [Source: 2-2-apex-orientation-chrome.md] fetch pattern, developments N+1 avoidance, date-only ISO
- [Source: 2-3-circuit-split-heat-map.md] selection contract, fail-closed params, no default NJ
- [Source: 2-4-state-status-board-synced-with-map.md] provider lift, detail-fetch patches, `#trust`, no `?case=` until now
- [Source: deferred-work.md] landing overwrite; FTS owned by 2.5
- [Source: https://developers.cloudflare.com/d1/sql-api/sql-statements/] D1 FTS5 compiled in — unused this story
- [Source: https://developer.mozilla.org/en-US/docs/Web/API/Window/popstate_event] popstate vs replaceState

## Open Questions for Patrick (do not block implementation)

1. **Forum filter?** Present in the HTML prototype, absent from FR40 / AC / README A3. Omitted. Say if you want it anyway (would need labels for all four `Forum` values, not the prototype’s `both`).
2. **Filter/search in the URL?** Architecture says URL is source of truth for shareable selection. This story keeps FR40 controls local so `?case=` stays the deep link (same call as 2.4’s chips). Say if you want `?q=` / `?issue=`.
3. **Masthead vs board query merge?** Board “Open case” preserves `?state=` / `?circuit=`. Masthead developments as a full `href="?case=…#cases"` may drop them. Say if developments must preserve the other params (that requires wrapping Masthead in `ApexF1Provider` or passing `commit` down).

## Dev Agent Record

### Agent Model Used

Cursor Grok 4.6

### Debug Log References

- Preflight on merged 2.4 `534bb37`: 333 passed / 12 files; `npm run check` exit 0; no `LaunchNote.tsx`.
- Post-implementation: 348 passed / 13 files, zero cloud credentials.
- `npm run check` failed once on oxfmt (7 files) then on jsx-a11y `aria-selected` on `<button class="caseitem">`. Used `aria-pressed` (same 2.3 circuit-index pattern) and `[aria-pressed="true"]` CSS. Then `npm run check` exit 0.
- `npx wrangler deploy --dry-run` exit 0. No live deploy.
- Browser verify on `localhost:5173` (Vite restarted after a stale hung server). `#cases` paints 25 of 25; AND search `kalshi flaherty` → 2 rows; Pending chip + that search → unmatched `#trust` empty; Clear restores; issue `cea-preemption` → 9 of 25; NJ + Third Circuit → Flaherty appellate only. Row select writes `?case=case-flaherty#cases`. Docket dates `24 Jul 2026` / `6 Apr 2026` (not the previous ET day). Controlling tag `.itag.primary` is CEA preemption. Caption `font-style: italic`. Resolved row opacity `0.62`. `?case=nope` stripped to `#cases` empty panel. Board “Open case record” from `?state=NJ#states` → `?state=NJ&case=case-flaherty#cases`. Filters hiding Flaherty keep the panel. 900px: `.cases` one column, `.detail` `static`. `#issues` still EmptyState.

### Completion Notes List

- Extended the existing `ApexF1Provider` selection with `?case=`. One hook. Filters stay local React state.
- Enriched `GET /api/cases` with `listIssueTags`, `affectedStateCodes`, `entityRoles` via three follow-up queries. Detail is still bare `CaseDetail`. No `partyRole` scalar. No N+1 `/api/cases/:id` for the list.
- `#cases` is list + sticky panel under `src/surfaces/apex/cases/`. Client-side AND-token search at 25-row scale; FTS5 postponed (deferred-work closed).
- Date-only docket days go through lifted `formatIsoDate` (noon-UTC) so ET cannot roll the calendar day back.
- `.cases` desktop grid is README A3 `1fr 1.05fr`, not the prototype `1fr 3fr`. Case-row buttons use `aria-pressed` because `aria-selected` is invalid on `button`.
- No `pages/CaseDetailPage`, no forum filter, no CSV/JSON, no default Flaherty, no live deploy, no new npm packages.

### File List

- _bmad-output/implementation-artifacts/2-5-case-list-detail-rich-filters.md
- _bmad-output/implementation-artifacts/deferred-work.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- src/shared/api/publicApi.test.ts
- src/shared/db/repos/casesRepo.ts
- src/shared/lib/dates.ts
- src/shared/schemas/caseSchema.ts
- src/shared/ui/pml.css
- src/shared/ui/trustComponents.test.tsx
- src/surfaces/apex/ApexF1Context.tsx
- src/surfaces/apex/ApexShell.tsx
- src/surfaces/apex/cases/CaseBoard.tsx
- src/surfaces/apex/cases/CaseDetail.tsx
- src/surfaces/apex/cases/CaseFilters.tsx
- src/surfaces/apex/cases/CaseList.tsx
- src/surfaces/apex/cases/caseView.ts
- src/surfaces/apex/cases/cases.test.tsx
- src/surfaces/apex/cases/useCaseDetail.ts
- src/surfaces/apex/circuits/circuits.test.tsx
- src/surfaces/apex/circuits/useCircuitData.ts
- src/surfaces/apex/orientation/Masthead.tsx
- src/surfaces/apex/selection.ts
- src/surfaces/apex/states/StateBoard.tsx
- src/surfaces/apex/states/StateDetail.tsx
- src/surfaces/apex/states/states.test.tsx
- src/surfaces/apex/useApexSelection.ts
- src/surfaces/shells.test.tsx

## Change Log

- 2026-09-01: Story context created from Epic 2 / FR3 / FR40 / UX-DR11 / handoff A3 / Stories 2.1–2.4 (ready-for-dev)
- 2026-09-01: Implemented `#cases` list + detail + FR40 filters on the 2.4 selection provider; status → review
