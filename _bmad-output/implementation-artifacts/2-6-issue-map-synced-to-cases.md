---
baseline_commit: c84679bb32ea6aa86530b2351d25c4bc85d3ecfb
baseline_branch: story/2-5-case-list-detail-rich-filters
main_at_creation: 534bb371bb494164ffbe2cc9c1af32585353ec55
---

# Story 2.6: Issue Map Synced to Cases

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a reader exploring doctrine,
I want interactive issue-taxonomy visualizations that filter the case record,
so that I can see how issues cluster by posture and jump to matters.

## ⚠️ Read this before writing any code

**This is the first story that answers “what is being litigated?”, and the first that must deep-link an issue.** Eight things will bite you; tests catch only some of them:

1. **Do not branch from today’s `main` until 2.5 is merged.** `main` at story creation is `534bb37` (Story 2.4). Story 2.5’s `#cases` band, `listIssueTags`, and `{ state, circuit, case }` live on `story/2-5-case-list-detail-rich-filters` (`c84679b`). Branch `story/2-6-issue-map-synced-to-cases` from **2.5 after it is merged (or from this SHA)**. Starting from 2.4 deletes the case board.
2. **One selection hook. Not two.** `useApexSelection` already lives inside `ApexF1Provider`, which already wraps `#issues`. Instantiating it again in the issue band desyncs map, board, list, and charts. Extend `{ state, circuit, case }` with `issue` in place. [Source: ApexF1Context.tsx; architecture.md#Frontend-routing-clarification]
3. **`?issue=` is the active-issue axis. Other FR40 filters stay local.** Story 2.5 kept search / posture chips / state / circuit in React state so `?case=` stayed the case deep link. Architecture still says selected **issue** is URL-param deep-linkable. Bind the case-bar issue `<select>` to `selection.issue`. Do **not** put `?q=` / `?posture=` / `?state=` (the filter dropdown) on the URL. Do **not** add a second “activeIssue” useState that can disagree with the dropdown.
4. **Do not N+1 `/api/cases/:id` to place emergence marks.** List rows have `listIssueTags` and `filedAt` but **no docket events**. The handoff places each mark at the **first docket event**. Add **one** bulk `MIN(occurred_at)` query in `listCases` → `firstOccurredAt: IsoDate | null` on `CaseListItemSchema`. Do **not** call `getCaseById` in a loop. Do **not** add `GET /api/issues`. Do **not** add FTS5.
5. **Controlling issue is `isControlling`, not array index 0.** The prototype’s `ISSUE_INDEX` counted `i === 0` as primary. 2.1’s unique partial index and 2.5’s list payload already carry the boolean. The issue-bar “controlling in N” count uses that boolean. [Source: migrations/0001_f1_core.sql; caseSchema.ts ListIssueTagSchema]
6. **Do not ship Tracker.html or its `ISSUE_FAMILY` keyed by prototype labels.** D1 `issue_tags` has **no family column** — eight seed slugs only (`cea-preemption`, `swap-definition`, `sports-event-contracts`, `state-enforcement`, `cftc-offensive`, `geofencing`, `certiorari-path`, `statutory-ban`). Family is a **client constant keyed by slug** in `issueView.ts` (Task 4). HALT if you add a D1 migration for family. HALT if you look up family by the prototype’s extra labels (`Field preemption`, `UIGEA`, …) that are not in the seed.
7. **Do not load ECharts from jsDelivr / unpkg.** Prototype `<script src="https://cdn.jsdelivr.net/npm/echarts@5.5.1/...">` has **no SRI**. Architecture: vendor the bundle or SRI-address it. This story **`npm install echarts@5`** and imports from `echarts/core` + `SVGRenderer` so Vite bundles it. HALT on a CDN `<script>`. HALT on `echarts-for-react` — `CircuitMap` already shows the `useRef` + `useEffect` init/dispose pattern. d3/topojson stay map-only.
8. **Do not live-deploy.** Production landing overwrite is still open in deferred-work. Do not default-select an issue. Empty URL → issue bar “Nothing selected”. Do not add `IssueDetailPage` or `/issues/:slug`.

## Acceptance Criteria

1. **Given** cases with issue tags (Stories 2.1, 2.5), **when** I view the `#issues` band, **then** four token-themed ECharts views render: issue × posture matrix, emergence timeline, frequency strip, sunburst (FR42, UX-DR14)
2. **And** empty outcome columns are omitted in the matrix; sunburst leaf labels stay off with hover naming the case
3. **And** clicking a cell / mark / bar / tag-segment sets an active issue, shows matching matters with jump buttons, and filters the case record with its issue dropdown synced. Sunburst **leaf** click opens that case (`selectionForCase` + `#cases`) instead of only setting the issue
4. **And** Clear resets active issue **and** the case band’s local filters (search, posture chips, state, circuit)
5. **And** the chart bundle is vendored via the npm `echarts@5` dependency (Vite-bundled). No unpinned CDN. If ECharts fails to init, an honest EmptyState — issue tags still exist on the case records below; do not invent a taxonomy

## Tasks / Subtasks

- [ ] **Task 1: Preflight** (AC: all)
  - [ ] Confirm Story 2.5 is **merged to `main`** (or this branch is based on `c84679b`). Record `git log -1 --oneline`. If 2.5 is missing `#cases` / `listIssueTags`, **stop**
  - [ ] Confirm `npm test` is green on that 2.5 SHA. Record the count. Zero cloud credentials
  - [ ] Confirm `npm run check` exits 0
  - [ ] Confirm `GET /api/cases` items have `listIssueTags` / `affectedStateCodes` / `entityRoles`, still no `partyRole`, and `GET /api/cases/case-flaherty` is unchanged bare `CaseDetail`
  - [ ] Confirm `#issues` is still EmptyState (“Issue views not yet wired”) **inside** `ApexF1Provider`, and `#cases` is `<CaseBoard />`. If `LaunchNote.tsx` exists, stop
  - [ ] Read, do not remember: Tracker.html `#issues` (~859–900), issue CSS (~15–35), `ISSUE_INDEX` / `selectIssue` / `drawMatrix` / `drawTimeline` / `drawStrip` / `drawTree` (~2195–2421). Recreate in React; do not ship the HTML (UX-DR24)
  - [ ] Read `ApexF1Context.tsx`, `selection.ts`, `useApexSelection.ts`, `useCircuitData.ts`, `ApexShell.tsx` `#issues`, `CaseBoard.tsx`, `CaseFilters.tsx`, `caseView.ts` (`caseMatches`, `uniqueIssueTags`), `caseSchema.ts`, `casesRepo.ts` `listCases`, `CircuitMap.tsx` (init/dispose + fallback copy), `pml.css`, `circuits.test.tsx`, `cases.test.tsx`, `shells.test.tsx`
  - [ ] Branch: `story/2-6-issue-map-synced-to-cases` from the **2.5 commit**, not from `534bb37`

- [ ] **Task 2: Enrich list rows with first docket day** (AC: 1–2)
  - [ ] `CaseListItemSchema` already exists. **Extend it** with `firstOccurredAt: IsoDateSchema.nullable()` — **not** on `CaseSchema` / `CaseDetailSchema`
  - [ ] In `listCases`, after the existing three follow-up queries, add a **fourth** bulk query: `SELECT case_id, MIN(occurred_at) AS first_occurred_at FROM docket_events GROUP BY case_id`. Assemble in JS. Missing events → `null`. Do not use `filedAt` as a silent stand-in (emergence note says first **docket** event; a mark with no date is omitted)
  - [ ] Keep `GET /api/cases/:id` unchanged. Do not add `/api/issues`
  - [ ] Pin in `publicApi.test.ts`: Flaherty list row has a `firstOccurredAt` string matching `YYYY-MM-DD`; still no `partyRole`. Do not assert seed `25` in UI tests
  - [ ] `useCircuitData` `isCase`: require `firstOccurredAt === null || typeof string`. Keep `listsReady = circuits ∧ states ∧ cases`
  - [ ] HALT if you add FTS5, a second cases endpoint, or per-row `getCaseById`

- [ ] **Task 3: Extend selection with `?issue=`** (AC: 3–4)
  - [ ] `ApexSelection = { state, circuit, case, issue }` where `issue` is the seed **slug** (`cea-preemption`) or `null`
  - [ ] Parse: `ISSUE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i` — fail closed (drop `CEA preemption`, spaces, path-like values). Store lowercase
  - [ ] `serializeApexSelection` writes/deletes `issue` the same way it does `case`. Preserve unrelated keys
  - [ ] `constrainApexSelection(..., issueSlugs: ReadonlySet<string>)` — staggered-axis rule: empty set keeps the parsed value; non-empty set drops unknown slugs. Update **every** caller (`nextApexSearch`, `useApexSelection`, `circuits.test.tsx`, `states.test.tsx`, `cases.test.tsx` stubs)
  - [ ] `selectionForIssue(slug, current)` → `{ ...current, issue: slug }`. Does **not** clear state/circuit/case. Clicking the already-active slug → `{ ...current, issue: null }` (prototype toggle)
  - [ ] `useApexSelection(..., issueSlugs, listsReady)` — fourth key `issueKey`. Membership = slugs from published `cases.flatMap(listIssueTags)`. Initial state includes `issue: null`
  - [ ] **Case bar sync (this amends 2.5 AC2 for the issue dropdown only):** `CaseBoard` derives `filters.issue` from `selection.issue ?? "all"`. The issue `<select>` `onIssue` calls `commit(selectionForIssue(slug | null, selection))`. Search / posture / state / circuit stay `useState`. Case-bar **Clear** calls `setFilters(emptyCaseFilters())` **and** `commit({ ...selection, issue: null })`
  - [ ] HALT if you add React Router, `pushState` for clicks, or a second selection store
  - [ ] **Do not** change `CircuitMap.paint()` from `selection.issue`. Map fills stay posture. Issue selection is a charts / case-filter / URL concern

- [ ] **Task 4: Pure issue helpers** (AC: 1–4)
  - [ ] New `src/surfaces/apex/issues/issueView.ts` — **pure, no `window`, no `echarts` import**:
    - `ISSUE_FAMILY: Record<string, string>` keyed by **slug**:
      - `cea-preemption`, `swap-definition` → `Federal preemption`
      - `cftc-offensive`, `certiorari-path` → `Federal jurisdiction`
      - `sports-event-contracts`, `state-enforcement`, `statutory-ban` → `State gaming law`
      - `geofencing` → `Consumer & fiscal`
      - unknown slug → `Other` (do not crash)
    - `FAMILY_ORDER`: `Federal preemption`, `Federal jurisdiction`, `Indian gaming`, `State gaming law`, `Consumer & fiscal` (Indian gaming stays in the order even if the seed has no IGRA tag — the sunburst simply omits empty families)
    - `POSTURE_CHIP_ORDER` for columns: reuse cases `CASE_POSTURE_CHIP` short labels; **omit postures that have zero tagged cases** (empty outcome columns dropped). Do **not** include `untracked` unless a tagged case actually has that posture
    - `indexIssues(rows: readonly CaseListItem[])` → tags with `{ slug, label, family, cases, controllingCount }` where `controllingCount` = rows whose matching `listIssueTags` entry has `isControlling: true`. Sort: family order, then case-count descending, then label `localeCompare`
    - `matrixCells` / `emergencePoints` / `frequencySeries` / `sunburstTree` — inputs for ECharts options. Emergence points omit rows with `firstOccurredAt === null`. Sunburst: family → tag → one child per case (`value: 1`, `leaf: true`, `caseId`, `caption`, `posture`). Leaf **names** may be shortened in the data for hover; **labels on the outer ring are `show: false`**
    - `POST_HEX` from the same posture ramp the map uses conceptually (`#a8dcb9` / `#e9d59b` / `#e0a583` / `#b05541` / `#f6f5f3`) — these are chart fills, not a second `PostureSwatch`. Do not invent a sixth outcome
  - [ ] Pin with **mock** rows (Flaherty `cea-preemption` controlling + pending; a banned NV row with `state-enforcement`). Empty posture column omitted. Controlling count ignores tag order. `firstOccurredAt: null` drops the emergence mark. Do not assert seed counts

- [ ] **Task 5: `#issues` UI + ECharts** (AC: 1–5)
  - [ ] `npm install echarts@5` (latest 5.x). Import `echarts/core`, register `SVGRenderer`, `HeatmapChart`, `ScatterChart`, `BarChart`, `SunburstChart`, plus `GridComponent` / `TooltipComponent` / `VisualMapComponent` / `LegendComponent` / `Calendar?` **no**. `animation: false`. `renderer: "svg"`. Theme fonts/colors from tokens (`Lora` / `#605d5d` / `#f3f2f2` / accent `#b68235`) — port `CH_FONT` / `CH_TIP` from the prototype, do not invent a dark dashboard theme
  - [ ] New files under `src/surfaces/apex/issues/` (surface-local):
    - `IssueBoard.tsx` — issue bar + four `.chartcard`s; composed inside existing `SectionBand id="issues"`
    - `IssueBar.tsx` — empty: kicker `Nothing selected` + `{tagCount} issue tags across {matterCount} matters. Select a cell, a mark, a bar or a branch to filter the record below.` Selected: `.fam` family, `.lead` label, `{n} matters · controlling in {controllingCount}`, posture counts, `.issuematters` buttons (caption → `commit(selectionForCase(id, selection))` + `href="#cases"`), Clear chip
    - `IssueChart.tsx` — one `useRef<HTMLDivElement>` host; `useEffect` `echarts.init(el, null, { renderer: "svg" })`, `setOption`, `on("click")`, resize listener (debounce ~160ms), **dispose on cleanup**. If `init` throws / returns null → render the same EmptyState copy as AC5
    - `issueCharts.ts` — option builders (matrix / time / strip / sunburst). Sunburst `levels[3].label.show = false`, `nodeClick: false`. Matrix click → tag on Y axis. Timeline / strip click → tag. Sunburst: `data.leaf` → case jump; `data.tag` → `selectionForIssue`
  - [ ] **Provider:** already wraps `#issues`. Do **not** create a second provider. Do **not** lift `useOrientation`
  - [ ] Rewrite `ApexShell.tsx` `#issues` only: keep `SectionBand`; replace EmptyState with `<IssueBoard />`. Handoff copy:
    - kicker: `A2b · Issue map` (**do not keep `04`**)
    - title: `What is actually being litigated`
    - why: `Every matter carries a controlling issue and its secondary issues, drawn from a fixed vocabulary. Click anything below: the panel names the matters, and the case record further down filters to match.`
    - Leave `#entities` `#cert` `#trust` `#ops` as EmptyState
  - [ ] Highlight: `dispatchAction({ type: "highlight", name: selectedLabel })` using the **label** ECharts series name, not a second store
  - [ ] One document `<h1>` remains the masthead. Focus ring is the global accent outline (NFR5)
  - [ ] At `max-width: 940px` charts `resize()`. Do not invent a new breakpoint beyond the existing `@media (max-width: 940px)` block

- [ ] **Task 6: CSS** (AC: 1–3)
  - [ ] Port into `src/shared/ui/pml.css` using tokens: `.chart`, `.chartcard`, `.chartcard > .ch`, `.issuebar`, `.issuebar .lead`, `.issuebar .fam`, `.issuematters`, `.issuematters button`, `.issuehint`. Heights: matrix 520px, time 460px, strip 430px, sunburst 640px (handoff). Do **not** restyle `.cases` / `.board` / `.f1`
  - [ ] Reuse `.chip`, `.empty`, `.kicker`, `.num`. Do **not** add `.export`

- [ ] **Task 7: Tests** (AC: all)
  - [ ] `src/surfaces/apex/issues/issues.test.tsx`:
    - `indexIssues` groups by slug; controlling count uses `isControlling` even when that tag is not first
    - Matrix column set omits a posture with zero tagged cases
    - Emergence omits `firstOccurredAt: null`
    - Empty issue bar copy when `selection.issue === null`
    - `?issue=cea-preemption` stub → issue bar lead is `CEA preemption`, not empty copy
    - Garbage `?issue=CEA%20preemption` and unknown `?issue=uigea` fail closed
    - Selecting a matter button uses `selectionForCase` and does not invent a second case store
    - Chart-init failure path shows EmptyState copy, not a blank card that looks like “no issues”
  - [ ] `cases.test.tsx`: issue dropdown follows `selection.issue`; case-bar Clear also commits `issue: null`
  - [ ] `circuits.test.tsx`: every expected `{ state, circuit, case }` grows `issue: null`; add round-trip `?issue=cea-preemption`; staggered empty `issueSlugs` keeps parsed issue
  - [ ] `shells.test.tsx`: `#issues` no longer contains “Issue views not yet wired”; `.issuebar` or `.chartcard` present; remaining EmptyState bands are `entities`, `cert`, `trust`, `ops` (**4**)
  - [ ] `publicApi.test.ts`: `firstOccurredAt` pin (Task 2); existing Flaherty detail tests still pass
  - [ ] Do not assert seed `25` / exact ECharts canvas pixels. Mock `echarts.init` if a component test would otherwise need a real SVG host
  - [ ] `npm test` green, zero cloud credentials

- [ ] **Task 8: Finalize** (AC: all)
  - [ ] `npm run check` exit 0
  - [ ] **Do not live-deploy.** `npx wrangler deploy --dry-run` is enough
  - [ ] File List from `git status` / diff. Single commit only if Patrick asks
  - [ ] Browser-verify `#issues`: four charts paint, click matrix cell → issue bar + case dropdown sync + `#cases` filtered, Clear restores both, `?issue=cea-preemption` restores the bar, `?issue=nope` fail-closed, sunburst leaf → `#cases` with that case selected, hover leaf names the caption, 940px resizes, `#entities` still EmptyState

## Dev Notes

### Current code state (verified 2026-09-02, SHA `c84679b`)

- `main` is `534bb37` — Stories 2.1–2.4 only. **2.5 is the required base** (`CaseBoard`, `listIssueTags`, `{ state, circuit, case }`)
- `ApexShell.tsx` `#issues` is EmptyState (“Issue views not yet wired”) **inside** `ApexF1Provider` (wrap is `#circuits` through `#cases`). `#cases` is `<CaseBoard />`
- `ApexSelection` is `{ state, circuit, case }` only. `?issue=` is ignored. Filters except the upcoming issue axis are local React state in `CaseBoard`
- `GET /api/cases` → `{ items: CaseListItem[] }` with `listIssueTags`, `affectedStateCodes`, `entityRoles`. **No** `firstOccurredAt` yet. **No** docket rows. **No** `GET /api/issues`
- `GET /api/cases/:id` → bare `CaseDetail` including `issueTags[]` (`tag` + `isControlling`). Do not N+1 this for the map
- D1 `issue_tags`: `id, slug, label, provenance_*` — **no family**. Seed slugs listed in the bite list above
- Prototype `ISSUE_FAMILY` is keyed by **labels that are not all in D1** and counts primary as `i === 0`. Both are forbidden
- `CircuitMap.tsx`: `useEffect` + fallback EmptyState when geometry fails — copy that honesty for chart-init failure
- `package.json` has `d3-geo` / `topojson-client` for the map and **no** `echarts`. Adding `echarts@5` is in scope; adding `echarts-for-react`, Fuse, a router, or lucide is not
- React `^19.2.7`, Vite `^8.1.0`, Vitest `~4.1.10`, Zod `^4.4.3`

### Project Structure Notes

- Issue surface: `src/surfaces/apex/issues/` — same locality rule as `cases/` and `states/`. Not `src/shared/ui/`. Not `src/pages/`
- Selection stays in `src/surfaces/apex/selection.ts` + `useApexSelection.ts` + `ApexF1Context.tsx`
- List enrichment stays in `src/shared/db/repos/casesRepo.ts` + `src/shared/schemas/caseSchema.ts`
- CSS tokens in `src/shared/ui/pml.css` only — do not add a second stylesheet for charts
- Detected variance: architecture directory sketch still mentions `pages/`; v1 is one long-scroll page. Follow the post-epics routing clarification, not the sketch

### Previous story intelligence (2.5)

- One hook inside `ApexF1Provider`. Filters that are **not** shareable stay local; shareable axes go on the URL. 2.6 adds **issue** as a shareable axis and **rebinds** the case-bar issue dropdown to it
- `listCases` already runs three unscoped follow-ups and `CaseListItemSchema.parse`s every row — a fourth `MIN(occurred_at)` query is the same pattern. One invalid row still 500s the list (deferred in 2.5 review); do not “fix” that here unless it blocks you
- `isControlling` is already on `listIssueTags`. Charts must not re-derive it from array order
- Case list empty states: loading ≠ filter miss ≠ empty catalog. Chart-init failure is a retrieval problem, not “no issues in the law”
- `aria-pressed` on real `<button>`s (jsx-a11y forbade `aria-selected` on the case rows). Issue-matter jump buttons are buttons; Clear is a chip
- Clicks use `replaceState`, not `pushState`. `detailEpoch` is for state-detail retry; case detail uses a local epoch — do not route issue clicks through a refetch of the open docket unless the case id changes
- Do not live-deploy. Do not default-select Flaherty **or** CEA preemption

### Git intelligence

- Last commits: `c84679b` 2.5 review patches (honest empties, local case epoch); `f9754ae` 2.5 implementation; `534bb37` 2.4 board (`#4`)
- Pattern: surface-local folder + pure `*View.ts` + `useEffect` fetch/init + co-located `*.test.tsx` + `shells.test.tsx` EmptyState count
- No CDN script tags in the app; map geometry is a vendored atlas. ECharts must follow the npm/Vite path, not the prototype’s jsDelivr tag

### Latest tech (ECharts)

- Prototype pinned **echarts@5.5.1** SVG. Install **`echarts@5`** (5.x line). Do not jump to ECharts 6 in this story — heatmap / sunburst `levels` / `nodeClick: false` were written against 5.x
- `echarts-for-react@3.0.6` exists and lists React 19, but this repo’s map already inits imperative libraries in `useEffect`. Skip the wrapper to keep one pattern and one new dependency
- Tree-shake: `import * as echarts from "echarts/core"` + `echarts.use([SVGRenderer, HeatmapChart, ...])`. Do not `import * from "echarts"` (pulls canvas + geo + gl)
- `opts: { renderer: "svg" }` is required. Canvas is a different a11y/print surface than the rest of apex

### Project context reference

No `project-context.md` is present. Carry architecture.md + the 2.1–2.5 story files as the implementation constitution.

### References

- [Source: epics.md#Story-2.6] L462–476 — user story + ACs
- [Source: epics.md] FR42 (L115), UX-DR14 (L192), UX-DR24 (do not ship HTML), NFR4/NFR5
- [Source: architecture.md] Issue map charts (L706), Frontend-routing-clarification (L711–713) — `?issue=` is a selected-issue param
- [Source: ux-designs/design_handoff_pml/README.md] Issue map four views (L147–159)
- [Source: ux-designs/design_handoff_pml/PML Tracker.html] `#issues` markup (~859–900), issue CSS (~15–35), chart JS (~2195–2421)
- [Source: 2-5-case-list-detail-rich-filters.md] local FR40 filters, `listIssueTags`, one selection hook, `isControlling`, provider already spans `#issues`
- [Source: 2-1-f1-data-model-apis-case-law-seed.md] `issue_tags` + unique controlling index; no family column
- [Source: deferred-work.md] landing overwrite; 2.5 `items.every` / parse-all / fetch-timeout still deferred

## Open Questions for Patrick (do not block implementation)

1. **Family map?** D1 has no family. The slug→family table in Task 4 is a seed-complete guess (`geofencing` → Consumer & fiscal; no IGRA tag so that family is empty). Say if a tag should move, or if 2.7+ should add a `family` column.
2. **Issue-map Clear vs case-bar Clear?** AC says issue Clear resets active issue **and** case filters. Implemented as both buttons clearing `?issue=` plus local FR40 state. Say if case-bar Clear should leave the charts’ highlight alone (it will not, because they share `selection.issue`).

## Dev Agent Record

### Agent Model Used

Cursor Grok 4.6

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created

### File List
