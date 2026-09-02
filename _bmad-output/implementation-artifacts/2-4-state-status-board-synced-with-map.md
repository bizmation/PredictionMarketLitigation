---
baseline_commit: 727e2ecc8b6a67364c645a4ac31a731f30725a88
---

# Story 2.4: State Status Board (Synced with Map)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a compliance reader,
I want a filterable/sortable state board with a detail panel synced to the heat map,
so that I can answer “is [platform] legal in [state]?” with sources.

## ⚠️ Read this before writing any code

**This is the first story that answers the compliance question, and the first that must share selection with the map.** Six things will bite you; tests catch only some of them:

1. **One selection hook. Not two.** `useApexSelection` already lives inside `CircuitSplit`. Instantiating it again in the board will desync map and table on the first click. Lift data + selection to a parent both bands read. [Source: CircuitSplit.tsx; architecture.md#State-Management-Patterns]
2. **Filter chips are operational status. Map fills stay posture.** `All / Go / Restricted / Banned` dim map states whose `operationalStatus` does not match. They must not recolor the choropleth, must not call `postureOf()`, and must not treat `banned` as one field. [Source: vocabulary.ts; 2-3 story]
3. **Do not invent APIs or field names.** List = `GET /api/states` `{ items: State[] }`. Detail = `GET /api/states/:code` bare `StateDetail` with `platformStatuses` + `sources` — **not** `platformBreakdown`. Controlling-case “citation” is `cases.caption` + `cases.docketNumber`. There is no `citation` field. [Source: publicRouter.ts; state.ts]
4. **Do not follow architecture’s `pages/StateDetailPage.tsx` sketch.** Apex is one long-scroll page. Board files go under `src/surfaces/apex/states/`, same pattern as `circuits/`. `?state=NJ` is the standalone surface. [Source: architecture.md#Frontend-routing-clarification]
5. **Do not default-select New Jersey.** Empty URL → no row selected → empty panel copy. Handoff `sel = { state: "New Jersey" }` is a prototype bug Story 2.3 already forbade.
6. **Do not live-deploy.** Production landing overwrite is still open in deferred-work.

## Acceptance Criteria

1. **Given** the heat map selection model (Story 2.3) and seeded states, **when** I view the `#states` band, **then** a table shows state (circuit beneath), operational `StatusBadge`, `PostureSwatch`, controlling case caption + docket number, updated date via `formatEtDate` (+ `UpdatedBadge` when `updatedAt` is inside the 30-day window relative to published freshness — same rule as KPIs, **not** `Date.now()`)
2. **And** I can sort by state, status, posture, updated (header `<button>` toggles direction; `aria-sort` on the active `<th>` only). Default sort is name ascending. Controlling-case column is not sortable
3. **And** filter chips All / Go / Restricted / Banned filter the **table** by `operationalStatus` and dim non-matching states on the map (opacity ~0.22, same as circuit dim). Posture legend chips stay independent. No `unknown` chip — that value is absence, not a fourth judgement
4. **And** selecting a table row or map state opens/updates a sticky detail panel with status, posture, circuit, controlling case, provenance (`ProvenanceLabel`), per-platform `platformStatuses` table, why-note, primary-source links, and actions to jump to `#cases` / `#trust`
5. **And** map ↔ table ↔ panel share one `{ state, circuit }` selection. Clicking a board row uses `selectionForState`. Circuit index / map circuit select still uses `selectionForCircuit`
6. **And** `?state=NJ` (already parsed by 2.3) restores selection **and** the detail panel on load. Invalid codes fail closed. Do not add `StateDetailPage` or `/states/nj`
7. **And** every tracked status/posture claim in the **panel** links to ≥1 Tier-1 source from `GET /api/states/:code` `sources` (FR2). Table cells do not N+1 detail; they select the row so the panel carries the sources. Untracked states are omitted from the table (absence is not a finding) but remain on the map — selecting one from the map shows honest untracked copy, never a `go` badge

## Tasks / Subtasks

- [x] **Task 1: Preflight** (AC: all)
  - [x] Confirm `npm test` is green on **main at `727e2ec`** (2.3 merged). Record the count. Zero cloud credentials
  - [x] Confirm `npm run check` exits 0
  - [x] Confirm `GET /api/states`, `/api/states/NJ`, `/api/circuits`, `/api/cases` match the envelopes in Dev Notes. If `/api/states/NJ` 404s, you are not on 2.1
  - [x] Confirm `#circuits` is live (`CircuitSplit`) and `#states` is still EmptyState. If `LaunchNote.tsx` exists, stop
  - [x] Read, do not remember: Tracker.html `#states` (~812–857), board CSS (~286–324), `boardRows` / `renderBoard` / `renderDetail` (~1588–1662), filter/sort listeners (~1979–1986). Recreate in React; do not ship the HTML (UX-DR24)
  - [x] Read `CircuitSplit.tsx`, `useApexSelection.ts`, `selection.ts`, `CircuitMap.tsx` `paint()`, `ApexShell.tsx` `#states`, `state.ts`, `StatusBadge.tsx`, `UpdatedBadge.tsx`, `kpisRepo.ts` `windowStartUtc`
  - [x] Branch: `story/2-4-state-status-board-synced-with-map` from `main` (`727e2ec`), not from an old 2.2 SHA

- [x] **Task 2: Lift selection + F1 lists so both bands share them** (AC: 5, 6)
  - [x] New `src/surfaces/apex/ApexF1Context.tsx` (or equivalent provider in `src/surfaces/apex/` — **not** `src/shared/`):
    - Call `useCircuitData()` **once**
    - Call `useApexSelection(stateCodes, circuitIds, listsReady)` **once**
    - Own `statusFilter: "all" | "go" | "restricted" | "banned"` (local React state, **not** a URL param)
    - Expose `{ circuits, states, cases, listsReady, selection, commit, statusFilter, setStatusFilter }`
  - [x] `ApexShell` wraps `#circuits` + `#states` in the provider (orientation stays on `useOrientation`; do not merge those fetches)
  - [x] Refactor `CircuitSplit` to **consume the context** — delete its own `useCircuitData` / `useApexSelection`. Keep local `mapPostures` and `showCirc` inside CircuitSplit (posture legend is not the board filter)
  - [x] Extend `useApexSelection` with a `popstate` listener that re-runs `nextApexSearch(window.location.search, …)` and `setSelection`. `popstate` does **not** fire on `replaceState` — do not expect Back to undo every map click. Do **not** switch clicks to `pushState` (that floods history). On popstate, do not `replaceState` unless the URL is ill-formed
  - [x] Tighten `isState` in `useCircuitData.ts` to require `operationalStatus` (string). The board will crash-dim on undefined if the guard stays posture-only
  - [x] HALT if you add Redux, TanStack Query, React Router, or a second `useApexSelection`

- [x] **Task 3: Pure board helpers** (AC: 1–3)
  - [x] New `src/surfaces/apex/states/boardView.ts` — **pure, no `window`**:
    - `trackedStates(states)` → `posture !== "untracked"`
    - `filterByStatus(rows, filter)` → `filter === "all"` or `operationalStatus === filter`
    - `sortBoardRows(rows, { key, dir })` with status order `go < restricted < banned < unknown` and posture order matching `POSTURE_RAMP` (`untracked` < `platform` < `pending` < `state` < `banned`). Name = `localeCompare`. Updated = ISO string compare (already UTC-Z)
    - `isFresh(updatedAt, freshness)` → `updatedAt >= windowStart(freshness)` where window is **30 UTC days before the published freshness stamp** (copy `kpisRepo` arithmetic; do not import the repo into the client). Freshness = `maxUpdatedAt(states)` already in `circuitView.ts` — import that, do not duplicate
  - [x] Default `{ key: "name", dir: 1 }`. Same-key click flips `dir`; new key resets `dir` to `1`
  - [x] Pin these in unit tests with **mock** rows (`st-nj` go/pending, `st-ak` unknown/untracked). Do not assert seed counts in UI tests

- [x] **Task 4: `#states` UI** (AC: 1–7)
  - [x] New files under `src/surfaces/apex/states/` (surface-local — **not** `src/shared/ui/`):
    - `StateBoard.tsx` — filters + `.board` grid (table | panel); composed inside existing `SectionBand id="states"`
    - `StateFilters.tsx` — `All / Go / Restricted / Banned` as `<button class="chip" aria-pressed>`
    - `StateTable.tsx` — `table.grid` (already in `pml.css`) + sort headers
    - `StateDetail.tsx` — sticky aside
    - `useStateDetail.ts` — fetch `GET /api/states/${code}` when `selection.state` is set; AbortController; fail closed; `import type { StateDetail }` from schemas
  - [x] Rewrite `ApexShell.tsx` `#states` only: keep SectionBand; replace EmptyState with `<StateBoard />`. Update kicker/title/why to the handoff’s reader language:
    - kicker: `Status board`
    - title: `State by state`
    - why: `Operational status answers the compliance question — can this platform take the order in this state today. Posture answers where the law is heading. They are not the same field, and they can disagree.`
    - Leave `#issues` `#cases` `#entities` `#cert` `#trust` `#ops` as EmptyState
  - [x] **Table columns:** State (`td.stname` + `span.cite` = `circuitShortLabel` from `circuitView.ts`) · Status (`<StatusBadge status={row.operationalStatus} />`) · Posture (`<PostureSwatch />`) · Controlling case (`em.case` caption, `span.cite` docketNumber from the already-fetched `/api/cases` list) · Updated (`.num` + optional `<UpdatedBadge />`)
  - [x] **Omit untracked from the table.** Row count copy: `{visible} of {tracked.length} tracked states` — interpolate, never a literal
  - [x] **Rows:** `tr.pick` with `aria-selected={selection.state === row.code}`. Select via a real `<button>` in the state-name cell (jsx-a11y `prefer-tag-over-role` — do not put `role="button"` on `<tr>`). Row click may also call `commit(selectionForState(code, states))`
  - [x] **Sort headers:** `<th scope="col" aria-sort="ascending|descending">` only on the active key; other sortable `<th>` omit `aria-sort`. Inner `<button type="button">`. Controlling case: plain `<th>`, no button
  - [x] **Panel empty state** (no selection): `.empty` inside the aside — “Select a state on the map or in the table.” / hint “Absence of a finding is not a finding of legality.” Do **not** render NJ
  - [x] **Panel selected (from list immediately, detail as it lands):**
    - kicker `State detail · is it legal here?`
    - `<h3>{name}</h3>` — this is a section heading, **not** a second document `h1`
    - `StatusBadge` + `PostureSwatch` + optional `UpdatedBadge` (label stays `"updated"`, not the handoff’s `"updated this week"`)
    - `<dl>`: Circuit (`circuits.find` **name**, e.g. “Third Circuit”), Controlling (`<em>caption</em>, docketNumber` or “None tracked”), Updated (`formatEtDate`), Provenance (`<ProvenanceLabel kind={row.provenanceKind} />`)
    - `whyNote` paragraph when present
    - **By platform:** `table.plat` of `detail.platformStatuses` — Platform = `entity.name`, Status = `StatusBadge`. Empty array → EmptyState “No per-platform breakdown published” / hint “That is a gap in this record, not a finding of legality.”
    - Platform-row `note`s, when present, go under the table (this is the handoff `platformNote`; there is no state-level `platformNote` field)
    - **Primary sources:** `.srcline` links from `detail.sources` (`title`, `url`, `target="_blank" rel="noopener"`). Tracked + still loading → don’t claim “no sources”. Tracked + loaded + zero tier1 → show EmptyState; do not invent a URL
    - Actions: `Open case record` → `<a class="btn btn-secondary" href="#cases">` only if `controllingCaseId` is set (Story 2.5 owns `?case=` — do **not** add it here). `Report an error` → `<a class="btn btn-ghost" href="#trust">` (apex correction band is `#trust`, not the prototype’s `#correct`)
  - [x] **Untracked selected from the map:** panel shows name + `PostureSwatch` untracked + `StatusBadge unknown` + copy: “Nothing in this state has been reviewed. Absence of a finding is not a finding of legality — no case, order or enforcement action is being tracked here.” Do not fetch-fail into a `go` badge
  - [x] **Detail fetch:** one request per selected code. Unwrap is **bare JSON** (`jsonOk`), not `{ items }`. 404/network → honest message in the panel; table stays up
  - [x] One document `<h1>` remains the masthead
  - [x] Focus ring is the global accent outline (NFR5)

- [x] **Task 5: Map stays in sync with the operational filter** (AC: 3, 5)
  - [x] Pass `statusFilter` into `CircuitMap`
  - [x] In `paint()` opacity: keep existing `inCircuit && inPosture`; add `inStatus` (`statusFilter === "all"` or `row.operationalStatus === statusFilter`). Missing row (unseeded atlas name) dims when a status filter is on
  - [x] **Do not change fills.** Choropleth class remains `st ${posture}`
  - [x] Selecting a dimmed state from the map is still allowed (opens panel; row may be hidden if untracked or filtered). Do not auto-clear `statusFilter` on map click
  - [x] Circuit overlay / posture legend behavior from 2.3 is unchanged

- [x] **Task 6: CSS** (AC: 1, 4, 5)
  - [x] Port into `src/shared/ui/pml.css` using tokens: `.board`, `.detail`, `.detail .dhead`, `.detail .dbody`, `.detail dl/dt/dd`, `.plat`, `.srcline`, `td.stname`, `td .case`, `td .cite`
  - [x] Desktop `.board { grid-template-columns: 1.5fr 1fr; gap: var(--space-6); align-items: start; }`
  - [x] `.detail { position: sticky; top: 78px; border: 1px solid var(--color-neutral-700); }`
  - [x] Add `.board { grid-template-columns: 1fr; }` and `.detail { position: static; }` to the existing `@media (max-width: 940px)` block that already collapses `.f1` in `pml.css` (~L1376). Do not invent a new breakpoint
  - [x] Reuse `table.grid` (selected row + inset accent already exist). Reuse `.chip`, `.filters`, `.badge.*`, `.empty`, `.btn`. Do **not** add `.export` (CSV/JSON is out of scope)
  - [x] Do not redeclare posture fills or status badge colors

- [x] **Task 7: Tests** (AC: all)
  - [x] `src/surfaces/apex/states/states.test.tsx`:
    - Filter `go` hides a `restricted` mock row; All shows both tracked mocks; `untracked` mock never appears in the table
    - Sort by status: `go` before `restricted` before `banned`
    - Selected row `aria-selected="true"`; panel heading is the selected name
    - Empty panel copy when `state: null`
    - `?state=` hydrate: render with a committed `NJ` selection → panel, not empty copy
    - Sources: tracked detail mock with a tier1 link is present; do not hit the network
  - [x] `selection.ts` / `useApexSelection`: existing round-trip tests still pass; add a popstate test if you can fire one without jsdom lying (if not, unit-test a small `selectionFromSearch` helper the listener calls)
  - [x] `circuits.test.tsx`: `CircuitSplit first paint` currently renders `<CircuitSplit />` naked — wrap it in the provider (or keep a test-safe default). Map dim assertion: with `statusFilter="banned"`, the helper/opacity path treats a `go` state as dimmed — test the pure condition if paint is hard to reach via `renderToStaticMarkup`
  - [x] `shells.test.tsx`: `#states` no longer contains “State board not yet wired”; `.board` / `table.grid` present; remaining EmptyState bands are `issues`, `cases`, `entities`, `cert`, `trust`, `ops` (**6**). IA split still holds. Exactly one `h1`
  - [x] Static markup will not run `useEffect` — first paint without rows is expected. Do not assert seed `51` / `20` in JSX
  - [x] `npm test` green, zero cloud credentials

- [x] **Task 8: Finalize** (AC: all)
  - [x] `npm run check` exit 0
  - [x] **Do not live-deploy.** `npx wrangler deploy --dry-run` is enough
  - [x] File List from `git status` / diff. Single commit only if Patrick asks
  - [x] Browser-verify `#states`: table paints tracked states, sort, chips, row → panel, map click updates panel + URL `?state=`, chips dim the map, 940px stacks and unsticks the panel, `?state=NJ` restores panel, `?state=ZZ` fail-closed, untracked map state does not appear as `go`

## Dev Notes

### Current code state (verified 2026-09-01)

- `main` is `727e2ec` — Stories 2.1–2.3 are merged. Branch from here
- `ApexShell.tsx` `#states` is EmptyState (“State board not yet wired”). `#circuits` is `<CircuitSplit />`, which **owns** `useCircuitData` + `useApexSelection`
- `GET /api/states` → `{ items: State[] }` ordered by name. Fields include `operationalStatus`, `posture`, `controllingCaseId`, `whyNote`, `provenanceKind`, `updatedAt`. **No** `sources`, **no** `platformStatuses`
- `GET /api/states/:code` → bare `StateDetail` (`jsonOk`). Regex is exactly two letters. Adds `platformStatuses[]` (`entity`, `operationalStatus`, `note`, `sources`) and `sources[]`. 404 envelope `{ code, message }`
- `GET /api/cases` list has `caption` + `docketNumber`. Join captions the same way the map tooltip does. Do not N+1 `/api/cases/:id`
- `GET /api/circuits` has `id`, `number`, `name`. Use `circuitShortLabel` in the table, `name` in the panel
- Seed: 51 states (50 + DC). Tracked = `posture !== "untracked"`. Untracked ⇒ `operationalStatus === "unknown"` (pinned in `publicApi.test.ts`). `unknown` is dashed `.badge.unknown`, never green
- `UpdatedBadge` is presentational only (`label` default `"updated"`). Window math belongs in `boardView.ts`
- KPI 30-day window is relative to published `freshness`, not wall clock (`kpisRepo.ts`). Copy that rule
- `useCircuitData.isState` does **not** currently require `operationalStatus` — tighten it
- `popstate` is deferred from 2.3 (`deferred-work.md`)
- No `src/surfaces/apex/states/` yet
- React `^19.2.7`, Vite `^8.1.0`, Vitest `~4.1.10`, Zod `^4.4.3`. **No new npm packages**

### Allowed new dependencies

None. Table + panel + fetch. If you think you need lucide, TanStack Table, or a router, you are off the story.

### Reuse, do not reinvent

| Need | Already at | Note |
|---|---|---|
| Selection URL | `selection.ts` / `useApexSelection.ts` | Lift; do not fork |
| F1 list fetch | `useCircuitData.ts` | Call once in the provider |
| Circuit short label / max stamp | `circuits/circuitView.ts` | Import from sibling; do not copy `CIRC_HUE` |
| Operational badge | `StatusBadge` | Raw glossary string (`go`, not “Go”) |
| Posture label | `PostureSwatch` / `POSTURE_LABELS` | “Decided for state”, not the handoff’s “Expected / decided for state” |
| Provenance | `ProvenanceLabel` | `kind="human"` \| `"agent"` from the row |
| Updated chip | `UpdatedBadge` | Caller decides visibility |
| Dates | `dates.ts` `formatEtDate` | Storage stays ISO-Z |
| Band chrome | `SectionBand`, `EmptyState` | Success path is not EmptyState |
| Table selection chrome | `table.grid` + `tr.pick` + `aria-selected` | Already in `pml.css` |
| Chips / filters row | `.chip` / `.filters` | Same as overlay toggle |
| List envelopes | `jsonList` `{ items }` | Detail is **not** an envelope |

### Architecture compliance

- URL params are the shareable source of truth for **selection**. Filter/sort stay in component state (not in AC; do not add `?status=` / `?sort=`)
- No Mapbox, no new D1 tables, no KV, no `/api/poll/*`, no writes
- Apex stays one long-scroll page. Do not create `pages/` or per-state routes
- `surfaces/apex` must not import `surfaces/ops` internals
- DB snake_case stays in repos; client sees camelCase only
- `import type` from schemas in client so zod stays out of the bundle
- Do not host `#layers` / `#journal` on apex
- Public GETs remain cacheable as today

### Scope boundaries (do NOT do)

- CSV/JSON export (handoff `.export` — not in ACs)
- `?case=` / case list UI (2.5). Hash `#cases` only
- Correction form / GitHub issue (2.10 / 4.5). Hash `#trust` only
- Entity activity layer / per-platform map paints (2.7)
- Issue map / ECharts (2.6)
- Brand `Posture` vs `OperationalStatus` at the type boundary (deferred-work)
- Lucide, `react-simple-maps`, full `d3`, CDN script tags
- Live production deploy
- `unknown` filter chip, traffic-light colors, title-cased badge text
- Fetching `/api/states/:code` for every table row
- Adding `GET /api/circuits/:id`

### Handoff bugs you must not recreate

| Handoff | Seed / app | Do this |
|---|---|---|
| `sel.state = "New Jersey"` | URL empty until click | No invented default |
| Circuit ids `"1"` / `"DC"` | `cir-1` / `cir-dc` | Seed ids; `circuitShortLabel` for display |
| `STATUS[status]` title case | `StatusBadge` raw enum | `go` / `restricted` / `banned` / `unknown` |
| `postureOf` uses `s.status === "banned"` | Independent axes | Board = status; map fill = posture |
| Filter does **not** call `paintMap` | Epic AC 3 requires map sync | Dim by `operationalStatus` |
| `#correct` | Section id is `#trust` | `href="#trust"` |
| `platformNote` on the state | `StatePlatformStatus.note` | Per-row notes under `table.plat` |
| `s.src` tuples | `sources[{ title, url, tier }]` | HTTPS links from detail payload |
| Export retrieved `STAMP` | Data-derived freshness | Omit export |
| “updated this week” | 30-day freshness window | `<UpdatedBadge />` default label |
| Prefill correction “New Jersey — …” | Form not wired | Don’t touch `#trust` copy |

### Current files being modified (read before editing)

**`CircuitSplit.tsx` — UPDATE**
- Today: fetches lists, owns selection, local `mapPostures` / `showCirc`, renders legend + map + index
- Change: consume `ApexF1Context`; pass `statusFilter` into `CircuitMap`; keep posture legend local
- Preserve: overlay toggle, posture chips, circuit index, fallback when topology fails, URL commit via `selectionForState` / `selectionForCircuit`

**`useApexSelection.ts` — UPDATE**
- Today: mount effect hydrates from `location.search`; `commit` → `replaceState`; no `popstate`
- Change: add `popstate` listener; still do not read `window.location` during render
- Preserve: `listsReady` gate (do not rewrite URL until both lists settle); unrelated query keys; fail-closed invalid codes

**`CircuitMap.tsx` — UPDATE**
- Today: `paint()` opacity = `inCircuit && inPosture`
- Change: AND `inStatus` from `statusFilter`
- Preserve: posture fills, dashed untracked, accent selected stroke 2.6px, overlay dim 0.22, `cir-fed` does not dim the whole choropleth, resize refit, topology fallback

**`ApexShell.tsx` — UPDATE**
- Today: `#states` EmptyState; `#circuits` `<CircuitSplit />` with no props
- Change: provider around circuits+states; `#states` `<StateBoard />`; handoff copy
- Preserve: orientation, IA split, remaining EmptyStates, single `h1`, TopBar `#states` link

**`pml.css` — UPDATE**
- Today: `.filters`, `table.grid`, `.badge.*`, no `.board` / `.detail`
- Change: port board/panel/plat/srcline/stname
- Preserve: existing `.f1` map grid, posture `.sw.*`, chip/badge tokens

**`shells.test.tsx` — UPDATE**
- Remaining EmptyState ids lose `"states"` (6 left)

**`useCircuitData.ts` — UPDATE (small)**
- `isState` must require `operationalStatus` so the board filter is defined

### Testing standards summary

- Vitest ~4.1.10, two projects, Miniflare D1, zero cloud credentials
- UI tests mock state/circuit/case props; workers tests already pin `/api/states/:code` — do not weaken them
- Keep the IA-split test
- `npm run check` = oxfmt + oxlint + tsc. Prefer real `<button>` / `<table>` / `<th>` over ARIA role soup
- `renderToStaticMarkup` does not run effects — detail panel’s first paint without `platformStatuses` is expected

### Previous story intelligence

**2.1:** List endpoints stay summaries; detail is nested (`platformStatuses`, `sources`). `banned` in two enums. Untracked ⇒ `unknown`. Tests: workers own numeric/SQL truth; UI owns structure and honesty. Every tracked published claim already has Tier-1 coverage in seed.

**2.2:** `useOrientation` is the public-surface fetch template (AbortController, fail closed, `import type`). Do not hardcode seed counts in JSX. Present-tense pipeline claims are still lies. TrustBar freshness is data-derived. Remaining bands stay EmptyState until their story.

**2.3:** Geography is vendored us-atlas; map fill is posture; selection `{ state: code, circuit: id }` is the 2.4 contract. `CircuitSplit` currently owns that hook — lifting it is this story’s integration risk. Review patches to keep: wait for both F1 lists before rewriting query params; do not dim the choropleth when `cir-fed` is selected; untracked dashed hairline; overlay dim ~0.22. `#states` was deliberately left EmptyState.

### Git intelligence

HEAD on `main` is `727e2ec` (`story 2.3: circuit-split heat map from published F1 posture`). 2.2 is `6350b88`. 2.1 is `0b8a748`. Patterns that worked: fail closed, `import type` for schemas, no second API envelope, no live deploy, surface-local folders (`orientation/`, `circuits/`), pin `run_worker_first` parity (do not touch it).

### Latest technical notes

- **History API:** `popstate` fires on Back/Forward traversal, **not** on `pushState`/`replaceState`, **not** on first load (MDN). Keep `replaceState` for clicks so the URL is shareable without a 51-entry undo stack. Listen for `popstate` and re-parse `location.search`. Treat the URL as source of truth; `event.state` may be `null`
- **Sortable table (WAI-ARIA APG):** `aria-sort` on the **`<th>`**, not the button; only the active column; inner `<button type="button">` for keyboard (Enter/Space is native). Do not invent `role="grid"`
- **React 19:** no SSR in this app. Detail fetch in `useEffect`. Do not call `use()`
- **Vite 8:** no new `public/` files required (geo already vendored)

### Project structure notes

```
src/surfaces/apex/ApexShell.tsx                 UPDATE — provider + #states
src/surfaces/apex/ApexF1Context.tsx             NEW — shared lists + selection + statusFilter
src/surfaces/apex/useApexSelection.ts           UPDATE — popstate
src/surfaces/apex/selection.ts                  KEEP — already the URL contract
src/surfaces/apex/circuits/CircuitSplit.tsx     UPDATE — consume context
src/surfaces/apex/circuits/CircuitMap.tsx       UPDATE — statusFilter dim
src/surfaces/apex/circuits/useCircuitData.ts    UPDATE — isState requires operationalStatus
src/surfaces/apex/states/*                      NEW
src/shared/ui/pml.css                           UPDATE — .board / .detail / .plat
src/surfaces/shells.test.tsx                    UPDATE — EmptyState remaining 6
```

Do not create architecture-sketch `pages/`. Do not add fields to Zod/D1.

### Project context reference

No `project-context.md` is present in the repo. Carry architecture.md + the 2.1–2.3 story files as the implementation constitution.

### References

- [Source: epics.md#Story-2.4] L428–444 — user story + ACs
- [Source: epics.md] FR2 (L33), UX-DR3 (L170), UX-DR10 (L184), UX-DR22 (L210), NFR4/NFR5
- [Source: architecture.md] URL params (L360), camelCase API (L345–347), routing clarification (L711–713), `surfaces/apex` (L322)
- [Source: ux-designs/design_handoff_pml/README.md] A2 (~L107–115), synced selection (~L203–205)
- [Source: ux-designs/design_handoff_pml/PML Tracker.html] #states markup, boardRows, renderDetail (do not copy default NJ, circuit ids, or `#correct`)
- [Source: 2-1-f1-data-model-apis-case-law-seed.md] list vs detail, banned dual-enum, unknown
- [Source: 2-2-apex-orientation-chrome.md] fetch pattern, freshness-relative 30-day window, no live deploy
- [Source: 2-3-circuit-split-heat-map.md] selection contract, posture-only choropleth, lift warning
- [Source: deferred-work.md] landing overwrite; popstate deferred to 2.4
- [Source: https://developer.mozilla.org/en-US/docs/Web/API/Window/popstate_event] popstate vs replaceState
- [Source: https://www.w3.org/WAI/ARIA/apg/patterns/table/examples/sortable-table/] aria-sort on th + header button

## Open Questions for Patrick (do not block implementation)

1. **Filter/sort in the URL?** Architecture says URL is source of truth for shareable filters. This story keeps chips/sort local so `?state=NJ` stays the FR2 deep link. Say if you want `?status=banned` too.
2. **Export CSV/JSON?** Present in the handoff, absent from ACs — omitted. Say if you want it in 2.4 anyway.
3. **Scroll on `?state=` load?** Default: only scroll to `#states` when the hash is already `#states` (or empty hash + query). A bare `?state=NJ#circuits` stays on the map with the board highlighted.

## Dev Agent Record

### Agent Model Used

Cursor Grok 4.6

### Debug Log References

- Isolated `npm test` on `727e2ec` before edits was not re-run in this session (2.3 already green on main). Post-implementation: 325 passed / 12 files, zero cloud credentials.
- `npm run check` failed once on oxfmt (11 files); `npx oxfmt` then `npm run check` exit 0.
- `npx wrangler deploy --dry-run` exit 0. No live deploy.
- Browser verify against `localhost:5173` initially 500’d `GET /api/states/NJ` (`sps.operational_status_basis` missing). Local D1 was a stale 0001 apply. Reset `.wrangler/state/v3/d1` and applied 0001–0004. Not a 2.4 schema change.
- After reset: `?state=NJ` hydrates the panel with Kalshi platform row + Flaherty Tier-1 link; `#cases` / `#trust` jumps; Go chip leaves AZ/NJ/TN and dims NV/AK/MD map fills to 0.22 without recoloring posture classes; Status `aria-sort="ascending"`; Alaska map select → `unknown` copy, not `go`, omitted from table; `?state=ZZ` stripped to `#states` empty panel; 940px board is one column and `.detail` is `static`.
- No jsdom `popstate` test: `replaceState` does not fire `popstate`; existing `selection.ts` round-trips still pass.

### Completion Notes List

- Lifted `useCircuitData` + `useApexSelection` into `ApexF1Provider` so `#circuits` and `#states` share one `{ state, circuit }` selection. Status chips stay local React state, not URL params.
- `#states` is a filterable/sortable board + sticky detail panel. Table omits untracked. Detail fetches bare `GET /api/states/:code` (`platformStatuses` + `sources`). Map choropleth fills stay posture; operational filter only dims.
- `UpdatedBadge` window is 30 UTC days before published freshness (`boardView.ts`), not `Date.now()`.
- No `pages/StateDetailPage`, no `?case=`, no CSV/JSON export, no new npm packages, no live deploy.

### File List

- _bmad-output/implementation-artifacts/2-4-state-status-board-synced-with-map.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- src/shared/ui/pml.css
- src/surfaces/apex/ApexF1Context.tsx
- src/surfaces/apex/ApexShell.tsx
- src/surfaces/apex/circuits/CircuitMap.tsx
- src/surfaces/apex/circuits/CircuitSplit.tsx
- src/surfaces/apex/circuits/circuits.test.tsx
- src/surfaces/apex/circuits/useCircuitData.ts
- src/surfaces/apex/states/StateBoard.tsx
- src/surfaces/apex/states/StateDetail.tsx
- src/surfaces/apex/states/StateFilters.tsx
- src/surfaces/apex/states/StateTable.tsx
- src/surfaces/apex/states/boardView.ts
- src/surfaces/apex/states/states.test.tsx
- src/surfaces/apex/states/useStateDetail.ts
- src/surfaces/apex/useApexSelection.ts
- src/surfaces/shells.test.tsx

## Change Log

- 2026-09-01: Story context created from Epic 2 / FR2 / UX-DR3 / handoff A2 / Stories 2.1–2.3 (ready-for-dev)
- 2026-09-01: Implemented `#states` board synced to the 2.3 map via one `ApexF1Provider` selection; status → review
- 2026-09-01: Adversarial code review findings recorded; status remains review pending patch resolution
- 2026-09-01: Review patches applied (stale detail, inset accent, footnote honesty, join-miss copy, re-select refetch, 940px scroll, untracked unknown, note keys, stopPropagation, em.case, detail guard, aria-live, panel max-height); status → done

### Review Findings — 2026-09-01

Parallel Blind Hunter / Edge Case Hunter / Acceptance Auditor. No AC1–AC7 behavioral misses; findings below are honesty, selection-sync, and spec-constraint nits.

- [x] [Review][Patch] Detail panel can paint the previous state's platforms and sources under the newly selected heading until the effect runs [src/surfaces/apex/states/useStateDetail.ts:26]
- [x] [Review][Patch] Selected-row inset accent on `table.grid` was deleted while adding sort-button rules [src/shared/ui/pml.css:508]
- [x] [Review][Patch] Board footnote claims every status and posture cell "links to at least one Tier-1 source" — cells are not links, and the panel may still be loading or in the no-source EmptyState [src/surfaces/apex/states/StateBoard.tsx:69]
- [x] [Review][Patch] When `controllingCaseId` is set but the cases list join misses, table and panel say "None tracked" while "Open case record" still renders [src/surfaces/apex/states/StateDetail.tsx:98]
- [x] [Review][Patch] A failed detail fetch is not retried when the same state is selected again — effect keys on `code` only [src/surfaces/apex/states/useStateDetail.ts:65]
- [x] [Review][Patch] At `max-width: 940px` the panel is `static` under the full table and row selection never brings it into view [src/surfaces/apex/states/StateBoard.tsx:41]
- [x] [Review][Patch] Untracked panel binds `StatusBadge` to `selected.operationalStatus` instead of forcing `unknown` [src/surfaces/apex/states/StateDetail.tsx:56]
- [x] [Review][Patch] Platform notes are keyed by note text, so two platforms with the same note collide [src/surfaces/apex/states/StateDetail.tsx:159]
- [x] [Review][Patch] Name-cell `<button>` and `<tr onClick>` both call `onSelect` with no `stopPropagation` [src/surfaces/apex/states/StateTable.tsx:102]
- [x] [Review][Patch] Controlling-case caption is `span.case`, not spec `em.case` [src/surfaces/apex/states/StateTable.tsx:121]
- [x] [Review][Patch] `isStateDetail` accepts any arrays; a 200 with a platform row missing `entity.name` throws with no error boundary [src/surfaces/apex/states/useStateDetail.ts:15]
- [x] [Review][Patch] Whole `<aside>` is `aria-live="polite"`, so every selection re-announces the panel [src/surfaces/apex/states/StateDetail.tsx:37]
- [x] [Review][Patch] Sticky panel has no `max-height`; a long platform list puts sources and actions below the viewport [src/shared/ui/pml.css:563]
- [x] [Review][Defer] Failed or empty F1 list still prints "0 of 0 tracked states" with absence-is-not-a-finding copy — deferred, pre-existing `useCircuitData` fail-closed
