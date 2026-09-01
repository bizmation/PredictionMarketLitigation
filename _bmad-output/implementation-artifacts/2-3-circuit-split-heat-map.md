---
baseline_commit: 6350b88913f73132ec2c4dde7d08433ca266bcdf
---

# Story 2.3: Circuit-Split Heat Map

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a reader,
I want an interactive circuit-split heat map with a circuit index,
so that I can see regional posture at a glance and drill to controlling cases.

## ⚠️ Read this before writing any code

**This is the first story that draws US geography and the first that adds npm libraries since Epic 1.** Five things will bite you; tests catch only some of them:

1. **Never freehand the United States.** Geometry is `us-atlas@3.0.1` `states-10m.json` via `topojson-client` + `d3-geo`. A hand-traced SVG, a CSS-flag map, or `react-simple-maps` is a product defect. [Source: epics.md#Story-2.3; architecture.md#Maps; UX-DR9]
2. **Fill by `posture`, never by `operationalStatus`.** `banned` lives on both axes. The handoff's `postureOf()` paints `s.status === "banned"` as posture-banned — that is the exact mix Story 2.1 forbade. Map choropleth = `states.posture`. Operational badges stay on the 2.4 board. [Source: vocabulary.ts; 2-1 story]
3. **Do not copy `CIRCUITS` from Tracker.html.** Seed IDs are `cir-1`…`cir-11`, `cir-dc`, `cir-fed`. Handoff IDs are `"1"`/`"DC"`/`"Fed"`. Seed First Circuit is `pending` (Mass. SJC); handoff marks it `untracked`. Eighth Circuit is `pending` in seed, `untracked` in the HTML. Membership comes from `states.circuitId`, not a hardcoded name list.
4. **Do not fetch `cdn.jsdelivr.net` or `unpkg.com` at runtime.** Vendor the TopoJSON under `public/geo/`. Install `d3-geo`, `d3-selection`, `topojson-client` from npm (lockfile is the pin; architecture's "SRI" was written for the HTML prototype's `<script integrity>` tags). Do not add `d3` the meta-package, ECharts, Mapbox, Leaflet, lucide, or TanStack Query.
5. **Story 2.2 is `done` in sprint-status but its implementation is still uncommitted** on `story/2-2-apex-orientation-chrome` (HEAD is only the 2.2 context spec `d4ea9f9`). Implement 2.3 on a new branch **on top of the 2.2 working tree**, not on `main` and not on `d4ea9f9` alone. Do not live-deploy (production landing overwrite still open in deferred-work).

## Acceptance Criteria

1. **Given** seeded circuits/states/cases (Story 2.1) and apex orientation chrome (Story 2.2), **when** I view the `#circuits` band, **then** a real US state TopoJSON map (`us-atlas@3.0.1` `states-10m.json` via d3/topojson) renders each state's **posture** with the five-step ramp; untracked (and atlas features with no seeded row) use near-white + dashed hairline
2. **And** a visible legend maps color → posture before/near the map, using `PostureSwatch` / `.sw.{posture}` — not a second ramp
3. **And** hover shows a tooltip (posture label, controlling case caption when present, last-updated via `formatEtDate`); click selects the state; keyboard focus/activation works (`tabindex="0"`, Enter/Space, `role="button"`, `aria-label` naming state + posture)
4. **And** circuit boundaries overlay member states (`topojson.merge` of that circuit's atlas geometries); selecting a circuit emphasizes members and dims others (handoff opacity 1 vs ~0.18–0.28)
5. **And** layout is map (~1.5fr) + circuit index (~1fr), collapsing to one column under ~940px (UX-DR22). **Ignore** Tracker.html's `.f1 { 1fr }` — that CSS never implements the README/UX-DR9 split; the media query at 940px assumes the desktop split exists
6. **And** if topology fetch fails, the map hides with an honest message and the circuit index still carries postures. Do **not** invent a status board — `#states` stays EmptyState until Story 2.4. Fallback copy may say the board will carry the same postures; it must not pretend the board is live
7. **And** the map reflects only published F1 (`GET /api/circuits`, `/api/states`, `/api/cases`). No draft tables, no KV, no write path
8. **And** selection `{ state: code | null, circuit: id | null }` is URL-param shareable (`?state=NJ`, `?circuit=cir-3`) so Story 2.4 can sync the board without inventing a second model. Invalid codes fail closed (ignore). Do not implement the board, detail panel, or operational filter chips

## Tasks / Subtasks

- [x] **Task 1: Preflight** (AC: all)
  - [x] Confirm `npm test` is green on the **2.2 tree** (orientation chrome present, `LaunchNote.tsx` gone). Record the count. Zero cloud credentials
  - [x] Confirm `npm run check` exits 0
  - [x] Confirm `GET /api/circuits`, `/api/states`, `/api/cases` return list envelopes. If they 404, you are not on top of 2.1
  - [x] Confirm `src/surfaces/apex/LaunchNote.tsx` does not exist. If it does, stop — 2.2 did not land
  - [x] Read, do not remember: Tracker.html `#circuits` markup (~752–809), map CSS (~216–268), `drawMap` / `paintMap` / `selectState` / `selectCircuit` (~1778–1971). Recreate in React; do not ship the HTML file (UX-DR24)
  - [x] Read `ApexShell.tsx` `#circuits` EmptyState, `useOrientation.ts` (fetch pattern), `PostureSwatch.tsx` (`showLabel={false}` escape hatch is for this story), `circuitsRepo.ts`, `state.ts`, `vocabulary.ts`, `wrangler.jsonc` `assets.directory` + `run_worker_first`
  - [x] Branch: `story/2-3-circuit-split-heat-map` from the 2.2 implementation, not from `main`

- [x] **Task 2: Geography + allowed libraries** (AC: 1, 6)
  - [x] `npm install d3-geo d3-selection topojson-client` and `npm install -D @types/d3-geo @types/d3-selection @types/topojson-client`
  - [x] Pin **topojson-client@3.1.0** (handoff). `d3-geo` / `d3-selection` major 3 (the d3 7 line). Do not install the `d3` umbrella package. Do not add script tags to `index.html`
  - [x] Create `public/geo/states-10m.json` by copying **us-atlas 3.0.1** `states-10m.json` (Census 2017 cartographic states; quantized, **not** the pre-projected `states-albers-10m.json`). Add `public/geo/README.md` with version, source URL, and that fills join on `properties.name`
  - [x] Fetch `/geo/states-10m.json` with `fetch` + `AbortController`. `/geo/*` is **not** in `run_worker_first`, so Cloudflare serves it as a static asset; do not add it to that list (it would bill Worker invocations for a ~100KB JSON)
  - [x] Convert with `topojson.feature(topo, topo.objects.states)`; project `geoAlbersUsa().fitSize([w-24, h-24], fc)`; draw with `geoPath`. Atlas fields: `feature.id` = two-digit FIPS (`"34"`), `feature.properties.name` = `"New Jersey"`. Join to seed on **name** (seed has no FIPS column)
  - [x] Circuit overlay: for each circuit with member states, `topojson.merge(topo, memberGeometries)`. Label centroid skips Alaska/Hawaii (handoff). `cir-fed` has no members — index row only, no overlay path
  - [x] HALT if you think you need Mapbox, Leaflet, ECharts, lucide, or a second geography file

- [x] **Task 3: Selection model** (AC: 3, 4, 8)
  - [x] New `src/surfaces/apex/selection.ts` (pure parse/serialize) + `useApexSelection.ts` (`history.replaceState`, no router library). Shape: `{ state: string | null, circuit: string | null }` where `state` is the 2-letter **code** (`NJ`) and `circuit` is the seed **id** (`cir-3`)
  - [x] Selecting a state sets `state` and that row's `circuitId`. Selecting a circuit sets `circuit` and, if it has members, a representative member `state` (handoff: first member in the states list). "All" clears `circuit` and keeps `state`
  - [x] Invalid `?state=` / `?circuit=` values are ignored, not 404'd
  - [x] This module is how 2.4 syncs. Do not put it inside the map file. Do not read `window.location` in render without an effect

- [x] **Task 4: `#circuits` UI** (AC: 1–7)
  - [x] New files under `src/surfaces/apex/circuits/` (surface-local — **not** `src/shared/ui/`):
    - `CircuitSplit.tsx` — legend + map card + index; composed inside existing `SectionBand id="circuits"`
    - `CircuitMap.tsx` — SVG + d3 in `useEffect` on a ref; cleanup on unmount
    - `CircuitIndex.tsx` — 13 rows, keyboardable `<button class="crow">`
    - `CircuitLegend.tsx` — posture chips + optional circuit chips
    - `useCircuitData.ts` — parallel fetch `/api/circuits`, `/api/states`, `/api/cases` copying `useOrientation` (AbortController, fail closed, `import type` from schemas)
  - [x] Rewrite `ApexShell.tsx` `#circuits` only: keep SectionBand; replace EmptyState with `<CircuitSplit />`. Update kicker/title/why to the handoff's reader language (`The circuit split` / geography-vs-doctrine why). Leave `#states` EmptyState
  - [x] **Posture legend** before the map. Counts from the fetched payload, never literals. Chips may filter map opacity (handoff `mapPostures`); they must not claim to filter the unwired board
  - [x] **Circuit index:** label from `number` (`1st`/`2d`/`3d`/…/`D.C.`/`Fed.` — not seed ids). Body = `summary` when tracked, "No tracked activity" when `untracked`. Swatch = `PostureSwatch`. Header count: interpolate `circuits.filter(c => c.posture !== "untracked").length` of `circuits.length` — seed is **9 of 13**, not the handoff's "7 of 13"
  - [x] **Map card:** caption "Controlling posture by state"; circuit-overlay toggle (`.chip`, `aria-pressed`); freshness from max `updatedAt` of loaded states/circuits via `formatEtDate`, not hardcoded `9 Aug 2026`
  - [x] **Tooltip:** posture label; `<em>caption</em>` joined via `states.controllingCaseId` → `/api/cases` list (one fetch, no N+1 `/api/cases/:id` or `/api/states/:code`); `formatEtDate(updatedAt)`. Untracked / unknown atlas name: "No tracked activity. Absence of a finding is not a finding of legality."
  - [x] **Fills:** same oklch as `.sw.platform|pending|state|banned|untracked` in `pml.css`. Selected state: accent stroke ~2.6px. Unseeded atlas features: dashed hairline + untracked fill
  - [x] **Circuit strokes:** identity hues (port `CIRC_HUE` keyed to `cir-1`…`cir-fed`), `pointer-events: none` on `.circ`; labels clickable. Dim non-selected circuits when a circuit is selected
  - [x] **Do not ship** the handoff "Layer / Entity activity" bar. That paints operational status onto the posture ramp and belongs with Story 2.7 (entity ledger) if at all
  - [x] One document `<h1>` remains the masthead. SectionBand title stays `<h2>`
  - [x] Accessibility: map `role="img"` + group label; each state path is a named button; `PostureSwatch showLabel={false}` only when the path/`crow` aria-label already names the posture; focus ring is the global accent outline (NFR5)

- [x] **Task 5: CSS** (AC: 5)
  - [x] Port `.legend`, `.legrow`, `.pchip`, `.cchip`, `.f1`, `.mapcard`, `#map`/`[data-map]`, `.st`, `.circ`, `.clabel`, `.tooltip`, `.circuits`, `.crow`, `.cnum`, `.cbody` from Tracker.html into `src/shared/ui/pml.css` using tokens
  - [x] Desktop `.f1 { grid-template-columns: 1.5fr 1fr; gap: var(--space-6); }`; `@media (max-width: 940px) { .f1 { grid-template-columns: 1fr; } }`
  - [x] Index is a single column of rows when beside the map (do not keep `#circuitlist { minmax(390px) }` — that was compensating for the prototype's accidental 1-col desktop grid)
  - [x] Reuse `.chip`, `.sw`, `.kicker`, `.num`. Do not redeclare posture fills

- [x] **Task 6: Tests** (AC: all)
  - [x] `src/surfaces/apex/circuits/*.test.tsx`: CircuitIndex + legend with **mock** circuits (`cir-3` / `cir-fed`, mixed postures) — figures equal the mock, not seed `7`. Fallback message when topology failed. `selection.ts` round-trips `NJ`/`cir-3` and ignores garbage
  - [x] `shells.test.tsx`: `#circuits` no longer contains "Map not yet wired"; `.f1` / circuit index present; remaining EmptyState bands are `states`, `issues`, `cases`, `entities`, `cert`, `trust`, `ops` (7). IA split still holds (no `#layers` / `#journal` hosted on apex). Exactly one `h1`
  - [x] Optional workers assertion: every seeded `states.name` is in a small fixture of us-atlas `properties.name` values (51 incl. "District of Columbia") so a rename cannot silently un-paint the map
  - [x] `renderToStaticMarkup` will not run map `useEffect` — first paint without paths is expected. Do not assert path `d` attributes in static markup
  - [x] `npm test` green, zero cloud credentials

- [x] **Task 7: Finalize** (AC: all)
  - [x] `npm run check` exit 0
  - [x] **Do not live-deploy.** `npx wrangler deploy --dry-run` is enough
  - [x] File List from `git status` / diff. Single commit only if Patrick asks
  - [x] Browser-verify `#circuits`: topology paints, tooltip, click + keyboard, circuit overlay, URL params, 940px collapse, fallback (block `/geo/states-10m.json` in DevTools)

## Dev Notes

### Current code state (verified 2026-09-01)

- `ApexShell.tsx` `#circuits` is still EmptyState ("Map not yet wired"). Orientation chrome above it is live (2.2, uncommitted on this branch)
- `GET /api/circuits` → `{ items: Circuit[] }` ordered by number, DC/Fed last (`number IS NULL`). No member array. `GET /api/circuits/:id` does **not** exist — do not add it
- `GET /api/states` list includes `code`, `name`, `circuitId`, `posture`, `controllingCaseId`, `updatedAt`. It does **not** include caption, sources, or platform breakdown (those are `GET /api/states/:code`, which 2.4 owns). Join captions from `GET /api/cases`
- `GET /api/cases` list includes `id`, `caption`, `court`, `docketNumber`, `circuitId`, `posture`. Enough for tooltips. Do not N+1 detail
- Seed: 13 circuits, 51 states (50 + DC). `has_split` is **false** on every circuit — *Flaherty* is the only appellate merits holding. Do not render a "split exists" badge
- `PostureSwatch` already documents `showLabel={false}` for map regions whose `aria-label` names the posture
- `public/` does not exist yet. Wrangler `assets.directory` is `./public`. Creating it is this story
- No d3/topojson in `package.json`. React `^19.2.7`, Vite `^8.1.0`, Vitest `~4.1.10`, Zod `^4.4.3`

### Allowed new dependencies (this story only)

| Package | Why |
|---|---|
| `d3-geo@3` | `geoAlbersUsa`, `geoPath` |
| `d3-selection@3` | bind paths on the SVG ref |
| `topojson-client@3.1.0` | `feature`, `merge` |
| matching `@types/*` | TypeScript |

Fetch the JSON with `fetch`, not `d3.json`. Native fetch already matches `useOrientation`.

### Reuse, do not reinvent

| Need | Already at | Note |
|---|---|---|
| Fetch-on-mount + abort | `useOrientation.ts` / `useAdminSession.ts` | Copy. No query library. No React 19 `use()` |
| Posture ramp + labels | `PostureSwatch`, `POSTURE_LABELS`, `.sw.*` | Map fill **is** this ramp |
| Dates | `src/shared/lib/dates.ts` | `formatEtDate`. Noon-Z trick for date-only if needed |
| Band chrome | `SectionBand`, `EmptyState` | Fallback uses EmptyState; success does not |
| List envelopes | `jsonList` `{ items }` | Unwrap `items`. Fail closed to `[]` |
| Selection deep links | architecture URL-param rule | `?state=NJ` is the 2.4 contract; start it here |
| Tokens / chips / focus | `tokens.css`, `.chip` | Overlay toggle is a chip, not a new button system |

### Architecture compliance

- No Mapbox. No new D1 tables. No KV. No `/api/poll/*`. Public GET cacheable as today
- Apex stays one long-scroll page. Do not create `pages/HomePage.tsx` or per-circuit routes
- `surfaces/apex` must not import `surfaces/ops` internals
- DB `snake_case` stays in repos; client sees camelCase only
- `import type` from schemas in client so zod stays out of the bundle
- Do not host `#layers` / `#journal` on apex

### Scope boundaries (do NOT do)

- State status board, detail panel, operational filter chips, `UpdatedBadge` on the table (2.4)
- Case list, `?case=` (2.5)
- Entity activity layer / platform chips on the map (2.7) — handoff paints operational status onto the posture ramp; skip it
- Issue map / ECharts (2.6)
- Reader poll (2.9)
- Lucide, Mapbox, Leaflet, `react-simple-maps`, full `d3` package, CDN script tags
- Live production deploy
- Branding `Posture` vs `OperationalStatus` at the type boundary (deferred-work; not this story)

### Handoff bugs you must not recreate

| Handoff | Seed / tokens | Do this |
|---|---|---|
| Circuit ids `"1"`…`"Fed"` | `cir-1`…`cir-fed` | Seed ids only |
| 1st Cir. `untracked`; 8th `untracked` | both `pending` | API payload |
| "7 of 13 with tracked activity" | 9 of 13 | Interpolate |
| `postureOf` uses `s.status === "banned"` | independent axes | `state.posture` only |
| `.f1` 1-col desktop | UX-DR9 1.5fr + 1fr | Follow UX-DR9 |
| `cdn.jsdelivr.net/npm/us-atlas@3.0.1/...` | local `public/geo/` | Vendor |
| Entity activity layer | no per-platform map in 2.3 | Omit |
| Default `sel.state = "New Jersey"` | URL empty until click | No invented default selection |

### Previous story intelligence

**2.1:** List endpoints stay summaries; that is why the map joins `/api/cases` for captions instead of bloating `/api/states`. `banned` in two enums. `Forum` / circuit_id on appellate cases. Tests: workers own numeric/SQL truth; UI owns structure and honesty.

**2.2:** `useOrientation` is the public-surface fetch template. Orientation components live under `src/surfaces/apex/<feature>/`, not `src/shared/ui/`. Static markup tests see pre-fetch DOM (em dashes / empty feed). Do not hardcode seed counts in JSX. Present-tense pipeline claims are still lies. TrustBar freshness is data-derived — map caption should follow that, not `Updated 9 Aug 2026`. LaunchNote is gone; remaining bands stay EmptyState until their story.

### Git intelligence

HEAD on this branch is `d4ea9f9` (2.2 **context spec** only). 2.1 is `0b8a748` on main. The 2.2 UI (`orientation/*`, `kpisRepo`, deleted LaunchNote) is dirty working tree. Patterns that worked: fail closed, pin `run_worker_first` parity, `import type` for schemas, no second API envelope, no live deploy.

### Latest technical notes (d3 7 / us-atlas 3 / React 19)

- **us-atlas 3.0.1** `states-10m.json`: `objects.states` + `objects.nation`; state `id` is FIPS, `properties.name` is the join key (`"California"`, `"District of Columbia"`). Unprojected — you must `geoAlbersUsa`. Do **not** use `states-albers-10m.json` (already projected to 975×610; `fitSize` would double-project)
- **topojson-client 3.1.0** ESM: `import { feature, merge } from "topojson-client"`. `merge(topology, geometryArray)` returns a GeoJSON MultiPolygon
- **d3-geo 3 / d3-selection 3:** `import { geoAlbersUsa, geoPath } from "d3-geo"`; `import { select } from "d3-selection"`. React 19 still has no SSR in this app — draw in `useEffect`, tear down the `<g>` on cleanup, do not call `use()`
- **Vite 8:** files in `public/` are served as `/…` in dev and copied to assets on build. Worker `run_worker_first` does not include `/geo/*`, so production fetch of `/geo/states-10m.json` is the asset pipeline, not the Worker

### Project structure notes

```
src/surfaces/apex/ApexShell.tsx                 UPDATE — fill #circuits only
src/surfaces/apex/selection.ts                  NEW — URL parse/serialize
src/surfaces/apex/useApexSelection.ts           NEW — replaceState + hook
src/surfaces/apex/circuits/*                    NEW
src/shared/ui/pml.css                           UPDATE — map/index/legend/tooltip
src/surfaces/shells.test.tsx                    UPDATE — EmptyState remaining 7
public/geo/states-10m.json                      NEW — vendored us-atlas 3.0.1
public/geo/README.md                            NEW — attribution + join key
package.json / package-lock.json                UPDATE — d3-geo, d3-selection, topojson-client
```

Do not create architecture-sketch `pages/`. Do not add `GET /api/circuits/:id`.

### Testing standards summary

- Vitest ~4.1.10, two projects, Miniflare D1, zero cloud credentials
- UI tests mock circuit/state props; workers tests already pin `/api/circuits`
- Keep the IA-split test
- `npm run check` = oxfmt + oxlint + tsc (jsx-a11y `prefer-tag-over-role` fired on 2.2 — use real `<button>` / `<ul>` rather than `role=`)

### References

- [Source: epics.md#Story-2.3] L409–426 — user story + ACs
- [Source: epics.md] FR1 (L31), UX-DR9 (L182), UX-DR2 (L168), UX-DR22 (L210), maps additional requirements (L153)
- [Source: architecture.md] Maps (L156, L254), URL params (L360), `public/` (L428), routing clarification (L711–713), d3+topojson vs ECharts (L706)
- [Source: ux-designs/design_handoff_pml/README.md] A1 (~L89–105)
- [Source: ux-designs/design_handoff_pml/PML Tracker.html] #circuits markup, drawMap, CIRCUITS (do not copy ids), paintMap
- [Source: 2-1-f1-data-model-apis-case-law-seed.md] list vs detail, banned dual-enum, has_split false
- [Source: 2-2-apex-orientation-chrome.md] fetch pattern, no hardcoded counts, no live deploy
- [Source: deferred-work.md] landing overwrite; LaunchNote resolved
- [Source: wrangler.jsonc] assets `./public`, `run_worker_first` `/api/*` only
- [Source: https://github.com/topojson/us-atlas/releases/tag/v3.0.1] states-10m join fields

## Open Questions for Patrick (do not block implementation)

1. **Commit 2.2 first?** The 2.2 implementation is still uncommitted on `story/2-2-apex-orientation-chrome`. A 2.3 branch from current `HEAD` (`d4ea9f9`) would miss LaunchNote deletion and orientation chrome. Commit/PR 2.2, then branch 2.3 from that.
2. **Entity activity layer.** Handoff paints per-platform operational status on the map. This story omits it (wrong axis + 2.7's ledger). Say if you want a stub chip that does nothing — default is omit.
3. **Default selection.** Handoff starts on New Jersey. This story starts with no selection (URL empty) so we do not imply NJ is more important than the seed. `?state=NJ` still works.

## Dev Agent Record

### Agent Model Used

Cursor Grok 4.6

### Debug Log References

- Story git note was stale: 2.2 is already on `main` (`6350b88`, PR #2). Branched `story/2-3-circuit-split-heat-map` from that commit, not from `d4ea9f9`.
- Preflight `npm test`: 298 passed. After implementation: 309 passed. `npm run check` exit 0. `wrangler deploy --dry-run` exit 0. No live deploy.
- oxfmt wanted to pretty-print vendored `states-10m.json`; ignored it in `.oxfmtrc.json` so the quantized atlas stays byte-stable.
- jsx-a11y `prefer-tag-over-role` fires on choropleth `role="img"` (no `<img>` equivalent). File-level oxlint disable on `CircuitMap.tsx`. Index rows use `aria-pressed` instead of invalid `aria-selected` on `<button>`.
- Browser: `#circuits` paints us-atlas geography, 9 of 13 tracked, posture counts from payload (51/33/4/7/6/1). Circuit index click → `?state=DE&circuit=cir-3`. Overlay toggle hides `.circ`. 900px width collapses `.f1` to one column. `?state=ZZ` fail-closed to empty search. `?state=NJ` persists.

### Implementation Plan

- Vendor us-atlas 3.0.1 `states-10m.json` under `public/geo/`; fetch locally; draw in `useEffect` with `geoAlbersUsa` + `topojson.feature` / `merge`.
- Pure `selection.ts` is the 2.4 URL contract; `useApexSelection` writes `history.replaceState` after mount.
- `#circuits` only: `CircuitSplit` composes legend + map card + index. Fills from `.sw.*` oklch. No entity-activity layer.

### Completion Notes List

- Wired the `#circuits` band to a real US choropleth (posture ramp, not operational status) plus a 13-row circuit index. Selection is URL-shareable for Story 2.4. `#states` remains EmptyState. No live deploy.

### File List

- .oxfmtrc.json
- _bmad-output/implementation-artifacts/2-3-circuit-split-heat-map.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- package.json
- package-lock.json
- public/geo/README.md
- public/geo/states-10m.json
- src/shared/api/publicApi.test.ts
- src/shared/lib/wranglerConfig.test.tsx
- src/shared/ui/pml.css
- src/surfaces/apex/ApexShell.tsx
- src/surfaces/apex/circuits/atlasStateNames.ts
- src/surfaces/apex/circuits/CircuitIndex.tsx
- src/surfaces/apex/circuits/CircuitLegend.tsx
- src/surfaces/apex/circuits/CircuitMap.tsx
- src/surfaces/apex/circuits/CircuitSplit.tsx
- src/surfaces/apex/circuits/circuitView.ts
- src/surfaces/apex/circuits/circuits.test.tsx
- src/surfaces/apex/circuits/useCircuitData.ts
- src/surfaces/apex/selection.ts
- src/surfaces/apex/useApexSelection.ts
- src/surfaces/shells.test.tsx

## Change Log

- 2026-09-01: Story context created from Epic 2 / FR1 / UX-DR9 / handoff A1 / Stories 2.1–2.2 (ready-for-dev)
- 2026-09-01: Implemented circuit-split heat map on us-atlas 3.0.1 + URL selection; status → review
- 2026-09-01: Adversarial code review findings recorded; status remains review pending patch resolution
- 2026-09-01: Review patches applied (untracked dash, overlay dim, shared posture tokens, resize refit, atlas file test, fail-closed URL constraint); status → done
- 2026-09-01: Late review-layer follow-up — wait for both F1 lists before rewriting `?state=`/`?circuit=`; keep unrelated query keys; do not dim the choropleth when the selected circuit has no members

### Review Findings — 2026-09-01

Parallel Blind Hunter / Edge Case Hunter / Acceptance Auditor were launched; this pass also reviewed the Story 2.3 source directly against AC 1–8.

- [x] [Review][Patch] Seeded `untracked` states get the near-white fill but not the dashed hairline AC1 requires for untracked [src/surfaces/apex/circuits/CircuitMap.tsx:298]
- [x] [Review][Patch] Selected-circuit dimming on overlay paths/labels is 0.4/0.45, not the handoff 0.18–0.28 band [src/surfaces/apex/circuits/CircuitMap.tsx:322]
- [x] [Review][Patch] `POSTURE_FILL` redeclares the `.sw.*` oklch ramp in JS after CSS said not to [src/surfaces/apex/circuits/circuitView.ts:21]
- [x] [Review][Patch] Map projection is fitted once; a 940px collapse or later resize never refits `geoAlbersUsa` [src/surfaces/apex/circuits/CircuitMap.tsx:128]
- [x] [Review][Patch] Atlas name-join test uses a handwritten 51-name set instead of reading `public/geo/states-10m.json` [src/shared/api/publicApi.test.ts:574]
- [x] [Review][Patch] `constrainApexSelection` skips membership checks while both code sets are empty, so a failed F1 fetch leaves well-formed junk `?state=` / `?circuit=` live [src/surfaces/apex/selection.ts:51]
- [x] [Review][Patch] Staggered `/api/states` vs `/api/circuits` arrival can rewrite a pasted `?state=`/`?circuit=` pair before the other list lands [src/surfaces/apex/useApexSelection.ts]
- [x] [Review][Patch] Selecting `cir-fed` (no member states) dims the entire choropleth [src/surfaces/apex/circuits/CircuitMap.tsx]

- [x] [Review][Defer] `history.replaceState` does not listen for `popstate` — deferred, Story 2.4 owns board sync and can attach history traversal if the URL contract needs Back/Forward
