---
baseline_commit: 3b869142ada58b46eac385bbda6661e09b67f1f2
baseline_branch: main
main_at_creation: 3b869142ada58b46eac385bbda6661e09b67f1f2
---

# Story 2.7: Entity Ledger

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a reader tracking platforms,
I want a per-platform footprint ledger,
so that I can see each player’s matters and jump into case records.

## ⚠️ Read this before writing any code

**This is FR41, not FR6.** FR6 (player/party map: CFTC, AGs, tribes, map “Entity activity” layer) is deferred. Eight things will bite you:

1. **Branch from today’s `main` (`3b86914`, Story 2.6).** `#issues` is `IssueBoard`, selection is `{ state, circuit, case, issue }`, `GET /api/cases` has `firstOccurredAt`. Starting from an older SHA deletes the issue map.
2. **`#entities` is outside `ApexF1Provider` today.** Matter and state jumps need `commit`. Extend the existing wrap through `#entities`. Do **not** instantiate `useApexSelection` again. Leave `#cert` / `#trust` / `#ops` outside.
3. **`GET /api/cases` cannot power this band.** List rows have `entityRoles` (role strings only) — not which entity. `GET /api/states` has no `platformStatuses` (those are on `GET /api/states/:code`). N+1 `getCaseById` / `getStateByCode` is forbidden. Enrich **`GET /api/entities`** with bulk-joined `matters` + `footprint` (same pattern as 2.6’s `firstOccurredAt`). Do **not** add `GET /api/entities/:slug`. Do **not** add `entityIds` to `CaseListItem` (that forces `isCase` + every F1 stub).
4. **D1 has no profile, legal name, type, or per-matter note.** Seed entities are `id, slug, name, role (DCM|FCM), provenance_*`. Prototype `ENTITIES[].profile` / `legal` / `type` / matter blurbs are editorial HTML — **HALT** if you paste them. Render `name` + `role` from the API. Matter rows use case caption/court/docket/forum/lifecycle/posture + `case_entities.role`. Footprint notes may use `state_platform_statuses.note` (already in D1).
5. **Five seeded platforms. No CFTC row.** `ent-kalshi`, `ent-polymarket-us`, `ent-robinhood-derivatives`, `ent-nadex-cryptocom`, `ent-coinbase`. Prototype’s sixth `cftc` tab (`key: null`, “Nine states sued”) is residual FR6. **HALT** if you add a CFTC entity, a D1 migration, or a hard-coded nine-state list.
6. **Do not add `?entity=`.** Architecture deep-links `state` / `case` / `issue` only. Selected platform is **local React state**, like case-bar search. Empty URL does **not** default-select Kalshi (handoff `selEntity = "kalshi"` is the same prototype bug 2.5 forbade for Flaherty).
7. **Do not filter `#cases` by the selected platform.** Matter click = `selectionForCase` + jump `#cases`. That *opens* the record (AC2 / Story 2.5). Filtering the list to one player is FR6. Do **not** add an entity axis to `CaseFilters`. Do **not** paint the map from entity selection (`layer-entity` in Tracker.html is out of scope).
8. **Do not live-deploy.** Production landing overwrite is still open in deferred-work. No new npm dependency. No `.export`. No D1 migration.

## Acceptance Criteria

1. **Given** seeded entities/platforms linked to cases (Story 2.1), **when** I view the `#entities` band, **then** each tracked platform shows its published role (`DCM` / `FCM` from `entities.role`) and a matter list drawn from `case_entities` (FR41, UX-DR15)
2. **And** selecting a matter opens that case in the Story 2.5 record (`selectionForCase` + `#cases`) without adding a second case store or an entity filter on the case bar
3. **And** empty platforms (zero matters **and** zero footprint rows) use EmptyState rather than looking like “no legal risk”; a platform with matters but no footprint (or the reverse) uses EmptyState only for the missing half, with copy that absence is not a finding of legality
4. **And** the operational footprint table (go / restricted / banned, plus `unknown` if present) is assembled from `state_platform_statuses`, not from case posture; state-name clicks jump to `#states` via `selectionForState`. Untracked states are omitted, not rendered as `go`

## Tasks / Subtasks

- [x] **Task 1: Preflight** (AC: all)
  - [x] Confirm HEAD is Story 2.6 (`3b86914` or later with `#issues` / `?issue=`). Record `git log -1 --oneline`. If `IssueBoard` is missing, **stop**
  - [x] Confirm `npm test` is green. Record the count. Zero cloud credentials
  - [x] Confirm `npm run check` exits 0
  - [x] Confirm `GET /api/entities` is `{ items: Entity[] }` length 5 (thin: `id, slug, name, role, provenanceKind, publishedAt, updatedAt`) and `GET /api/cases` items still have `entityRoles` / `firstOccurredAt` with **no** per-entity ids. `GET /api/entities/kalshi` is unmatched → envelope 404. Keep it that way
  - [x] Confirm `#entities` is EmptyState (“Entity view not yet wired”) **outside** `ApexF1Provider` (wrap ends after `#cases`). `#issues` is `<IssueBoard />`. If `LaunchNote.tsx` exists, stop
  - [x] Read, do not remember: Tracker.html `#entities` (~933–944), entity CSS (~372–410), `ENTITIES` / `ROLE` / `entityFootprint` / `renderEntities` (~1436–2090). Recreate in React from D1; do not ship the HTML (UX-DR24)
  - [x] Read `ApexF1Context.tsx`, `selection.ts`, `useApexSelection.ts`, `ApexShell.tsx` `#entities`, `IssueBoard.tsx` (`jumpToCases` / `replaceState`), `CaseDetail.tsx` state links, `entitiesRepo.ts`, `entity.ts`, `publicRouter.ts`, `caseSchema.ts` `entityRoles`, `statesRepo.ts` `listStates` vs `getStateByCode`, `StatusBadge.tsx`, `EmptyState.tsx`, `vocabulary.ts` `CASE_ENTITY_ROLE_VALUES` + `OPERATIONAL_STATUS_VALUES`, `shells.test.tsx`, `pml.css` `@media (max-width: 940px)`
  - [x] Branch: `story/2-7-entity-ledger` from **`3b86914` (main)**, not from an older Epic 2 SHA

- [x] **Task 2: Enrich `GET /api/entities` so the ledger does not N+1** (AC: 1, 3–4)
  - [x] Keep `EntitySchema` thin (nested in state/case detail). Add `EntityListItemSchema = EntitySchema.extend({ matters, footprint })` in `entity.ts`:
    - `matters: EntityMatterSchema[]` — `caseId`, `caption`, `court`, `docketNumber` (nullable), `forum`, `lifecycle`, `posture`, `role` (`CaseEntityRoleSchema`)
    - `footprint: EntityFootprintSchema[]` — `stateCode` (2-letter), `stateName`, `operationalStatus` (`OperationalStatusSchema` including `unknown`), `note` (nullable)
  - [x] `listEntities`: after the existing entities `SELECT`, run **two** unscoped follow-ups and assemble in JS (same pattern as `listCases`):
    1. `case_entities` JOIN `cases` → matters (order: caption `localeCompare` in JS, or `ORDER BY c.caption`)
    2. `state_platform_statuses` JOIN `states` → footprint (order: state name)
  - [x] Missing joins → `[]`, not 500. Do **not** call `getCaseById` / `getStateByCode` in a loop. Do **not** change `GET /api/cases`, `GET /api/cases/:id`, `GET /api/states`, `GET /api/states/:code`
  - [x] `getEntityBySlug` stays thin `Entity | null`. Do **not** add `/api/entities/:slug`
  - [x] Pin in `publicApi.test.ts`: Kalshi list item (`slug === "kalshi"`) has `matters` containing `{ caseId: "case-flaherty", role: "plaintiff" }` and `footprint` containing `{ stateCode: "NJ", operationalStatus: "go" }`. Still length 5. Thin fields still present. Do not assert seed matter counts in UI tests
  - [x] HALT if you add FTS5, a second entities endpoint, query params, or a D1 migration

- [x] **Task 3: Pure ledger helpers** (AC: 1–4)
  - [x] New `src/surfaces/apex/entities/entityView.ts` — **pure, no `window`**:
    - `entityMetrics(item)` → `{ total, plaintiff, defendant, appellate }` where `plaintiff` / `defendant` count **exact** `role` values (do **not** fold `appellant` into plaintiff; do **not** invent prototype `PD`). `appellate` = `forum === "federal-appellate"`
    - `groupFootprint(item)` → `{ go, restricted, banned, unknown }` arrays of footprint rows. Do **not** map `unknown` onto `go`. Do **not** treat a missing state as `go`
    - `roleTagLabel(role)` — reuse cases `partyRoleLabel([role])` or title-case a single `CaseEntityRole` (`enforcement-target` → `Enforcement target`). Do **not** emit prototype `P` / `D` / `PD`
  - [x] Pin with **mock** items (Kalshi-like: one plaintiff + one NJ `go`; empty arrays). Empty footprint groups stay empty. Do not assert seed `5`

- [x] **Task 4: `#entities` UI** (AC: 1–4)
  - [x] New files under `src/surfaces/apex/entities/` (surface-local, same rule as `issues/`):
    - `useEntityLedger.ts` — `useEffect` + `AbortController` fetch `GET /api/entities`, fail closed, `import type` only from schemas (copy `useOrientation`, **not** `useCircuitData`). Status `idle | loading | success | error`. Do **not** fold this fetch into `listsReady`
    - `EntityBoard.tsx` — tabs + detail; composed inside existing `SectionBand id="entities"`
    - `EntityTabs.tsx` — `.etabs` / `.etab`; `role="tablist"` / `role="tab"` / `aria-selected`. Each tab: `.en` name, `.et` role (`DCM`/`FCM` or omitted if `role` is null), `.estats` (Matters / Plaintiff / Defendant / On appeal), footprint bar from `groupFootprint` (only `n > 0` segments; `.sw.go` / `.sw.restricted` / `.sw.banned` — **not** posture classes). Selected tab is local state (`slug | null`)
    - `EntityDetail.tsx` — two-column `.ent`: identity (name as `h3`, role line, `ProvenanceLabel`) + footprint table; matters list on the right
  - [x] **Selection:** `useState<string | null>(null)`. Clicking a tab sets that slug. Clicking the already-selected tab may keep it selected (tabs are not issue-toggle). **No default slug.** Nothing selected → kicker `Nothing selected` + hint that the tabs are the record, not a finding
  - [x] **Footprint table:** `.ledger` rows for go / restricted / banned using existing `StatusBadge`. Add an `unknown` row **only if** that bucket is non-empty. State names are buttons → `commit(selectionForState(code, states, selection))` + `replaceState` hash `#states` (copy `IssueBoard.jumpToCases` — do **not** assign `window.location.hash`). Empty bucket inside a non-empty footprint: muted `none`. **Zero footprint rows:** EmptyState title `No operational footprint is published for this platform` / hint `Absence of a row is not a finding of legality.` / body that the other states are untracked. Do **not** print “19 tracked states” or “thirty-one”
  - [x] **Matters:** `.matters` list from `item.matters`. Each row: italic caption (`.mcap`), `.mmeta num` court · docket, `.rtag` role label, `.rtag` lifecycle (`Active`/`Resolved` via existing `LIFECYCLE_LABELS`), `PostureSwatch` (or `.ctag` + `.sw` + `CASE_POSTURE_CHIP`). **No invented note `<p>`.** Button `Open case record` → `commit(selectionForCase(caseId, selection))` + `replaceState` `#cases`. **Zero matters:** EmptyState title `No matters are linked to this platform` / hint `That is a gap in the published join, not a finding that the platform faces no litigation.`
  - [x] **Loading / error:** while `status === "loading"` do **not** render `0` matters as a finding (2.6 review: issue bar reported zero tags while lists loaded). Error → EmptyState `Entity list could not be loaded` / hint `A missing ledger is not an empty docket.`
  - [x] **Provider:** extend `ApexF1Provider` so it wraps `#circuits` through `#entities`. One hook. EntityBoard calls `useApexF1()` for `states`, `selection`, `commit` only
  - [x] Rewrite `ApexShell.tsx` `#entities` only: keep `SectionBand`; replace EmptyState with `<EntityBoard />`. Handoff copy:
    - kicker: `A3b · Entity record` (**do not keep `06`**)
    - title: `Platforms and parties`
    - why: `The same order can reach one platform and not another. This view reads the record the other way round — by who is actually bound.`
    - Leave `#cert` `#trust` `#ops` as EmptyState
  - [x] One document `<h1>` remains the masthead. Focus ring is the global accent outline (NFR5)
  - [x] At `max-width: 940px` `.ent` becomes one column. Do not invent a new breakpoint

- [x] **Task 5: CSS** (AC: 1, 4)
  - [x] Port into `src/shared/ui/pml.css` using tokens: `.etabs`, `.etab`, `.etab .en`, `.etab .et`, `.etab .ec`, `.estats`, `.etab .bar`, `.etab .barcap`, `.rtag`, `.ent`, `.ledger`, `.ledger .sts`, `.matters`, `.matters .mrow`, `.matters .mcap`, `.matters .mmeta`. Reuse `.chip`, `.empty`, `.kicker`, `.num`, `.badge`, `.sw`. Do **not** add `.export`
  - [x] `.etab[aria-selected="true"]` accent border + `accent-100` fill (handoff). Do **not** restyle `.cases` / `.board` / `.f1` / `.chartcard`
  - [x] Append `.ent` to the existing `@media (max-width: 940px)` block that already collapses `.f1, .board, .cases`

- [x] **Task 6: Tests** (AC: all)
  - [x] `src/surfaces/apex/entities/entities.test.tsx`:
    - `entityMetrics` counts exact roles; `appellant` is not plaintiff
    - `groupFootprint` puts `unknown` in its own bucket; missing states are not `go`
    - Empty tab selection shows “Nothing selected”, not Kalshi
    - Kalshi-like mock tab + Open case record calls `commit` with `selectionForCase` and does not invent a second case store
    - Zero-matter mock shows the matters EmptyState copy, not “no legal risk”
    - Zero-footprint mock shows the footprint EmptyState copy
    - Fetch failure shows “could not be loaded”, not a blank that looks like “no platforms”
  - [x] `shells.test.tsx`: `#entities` no longer contains “Entity view not yet wired”; `.etabs` or `.ent` present; remaining EmptyState bands are `cert`, `trust`, `ops` (**3**)
  - [x] `publicApi.test.ts`: Kalshi matters/footprint pin (Task 2); existing Flaherty detail / `entityRoles` tests still pass; `/api/entities/kalshi` still 404
  - [x] Do not assert seed `5` / `25` in UI tests. Stub `ApexF1Stub` like issues/cases tests
  - [x] `npm test` green, zero cloud credentials

- [x] **Task 7: Finalize** (AC: all)
  - [x] `npm run check` exit 0
  - [x] **Do not live-deploy.** `npx wrangler deploy --dry-run` is enough
  - [x] File List from `git status` / diff. Single commit only if Patrick asks
  - [x] Browser-verify `#entities`: five tabs, no default selection, click KalshiEX LLC → matters include Flaherty + NJ in go, Open case record → `?case=case-flaherty#cases` (preserve `?issue=` if present), ledger state name → `#states`, empty-URL still no Kalshi preselected, 940px stacks `.ent`, `#cert` still EmptyState, map still has no entity-activity layer

### Review Findings

- [x] [Review][Patch] Gate matter/state jumps on `listsReady` so `commit` cannot constrain against empty F1 membership and wipe `?issue=` / case [src/surfaces/apex/entities/EntityBoard.tsx:46]
- [x] [Review][Patch] Treat a successful empty `items` array as fail-closed error, not “Nothing selected” with an empty tablist [src/surfaces/apex/entities/EntityBoard.tsx:77]
- [x] [Review][Patch] `jumpToBand` must scroll the target band — `replaceState` does not, and re-opening the already-selected case/state skips `CaseBoard`/`StateBoard` `scrollIntoView` [src/surfaces/apex/entities/EntityBoard.tsx:15]
- [x] [Review][Defer] Entity tests pin selection helpers and static “Open case record” copy instead of clicking `commit` [src/surfaces/apex/entities/entities.test.tsx:176] — deferred, pre-existing

## Dev Notes

### Current code state (verified 2026-09-02, SHA `3b86914`)

- `main` is `3b86914` — Stories 2.1–2.6. **2.6 is the required base** (`IssueBoard`, `{ state, circuit, case, issue }`, `firstOccurredAt`)
- `ApexShell.tsx` `#entities` is EmptyState (“Entity view not yet wired”) **outside** `ApexF1Provider` (wrap is `#circuits` through `#cases`). `#issues` is `<IssueBoard />`, `#cases` is `<CaseBoard />`
- `ApexSelection` is `{ state, circuit, case, issue }`. There is no entity axis. Keep it that way
- `GET /api/entities` → `{ items: Entity[] }` length 5, thin schema. `entitiesRepo.getEntityBySlug` exists and is **unrouted**
- `GET /api/cases` `entityRoles` is `CaseEntityRole[]` with **no entity id/slug**. `GET /api/states` has no platform breakdown; `GET /api/states/NJ` does
- Seed (`migrations/0002_seed_f1.sql`): five platforms, `role` is `DCM` or `FCM`. Sparse footprint (Kalshi has the most SPS rows; Coinbase/Robinhood/NADEX are mostly NV `banned`). All five have ≥1 `case_entities` row. **No CFTC entity**
- `case_entities.role` vocab: `plaintiff | defendant | appellant | appellee | beneficiary | affected | enforcement-target`. PK `(case_id, entity_id)` — one role per pair, so prototype `PD` cannot occur
- `StatusBadge` already renders `go` / `restricted` / `banned` / `unknown`. Reuse it. `banned` on this badge is operational status, **not** posture
- `IssueBoard.jumpToCases` uses `history.replaceState` + `#cases` (2.6 review forbade `window.location.hash`). Copy that. `CaseDetail` still uses `href="#states"` — do not “fix” it here
- React `^19.2.7`, Vite `^8.1.0`, Vitest `~4.1.10`, Zod `^4.4.3`, `echarts@^5.6.0` (issues only). **No new dependency**

### What this story changes vs what must be preserved

| File | Today | This story | Must preserve |
|---|---|---|---|
| `entitiesRepo.ts` `listEntities` | Thin `Entity[]` | Assemble `matters` + `footprint` | `getEntityBySlug` thin; ORDER BY name |
| `entity.ts` | `EntitySchema` only | Add list-item + matter + footprint schemas | Nested `EntitySchema` in case/state detail unchanged |
| `publicRouter.ts` | `GET /api/entities` list | Same path, richer items | No `/api/entities/:slug`; `/api/poll` still reserved |
| `ApexShell.tsx` | `#entities` EmptyState outside provider | `EntityBoard` **inside** extended provider | `#cert` EmptyState; kicker/title/why as Task 4 |
| `ApexF1Context.tsx` | Wraps through `#cases` | Wrap through `#entities` | One `useApexSelection`; `filtersEpoch` / `shouldBumpStateDetailEpoch` unchanged |
| `selection.ts` | Four axes | **No fifth axis** | `?issue=` survives state/case jumps |
| `CaseBoard` / `caseView` | FR40 local filters | **Untouched** | No entity filter |
| `CircuitMap` | Posture fills | **Untouched** | No entity-activity layer |
| `pml.css` | No `.etab` / `.ledger` | Port handoff entity CSS | Existing 940px breakpoint only |
| `shells.test.tsx` | 4 remaining empties | 3 (`cert`, `trust`, `ops`) | IA split assertions |

### Anti-patterns (HALT)

- Pasting Tracker.html `profile` / `legal` / CFTC tab / `selEntity = "kalshi"` / `ROLE` P-D-PD map / `layer-entity` / `.export`
- `GET /api/entities/:id`, `GET /api/platforms`, query `?include=matters`
- N+1 detail fetches; adding `entityIds` to `CaseListItem` “so we can group on the client”
- `?entity=` on the URL; React Router; a second `useApexSelection`
- D1 migration for `profile` / `family` / `type` / CFTC
- Mapping operational `unknown` or missing SPS → `go`
- Counting `appellant` as plaintiff because the prototype used `P`
- Filtering `#cases` when a tab is selected
- New npm packages (`echarts-for-react`, Fuse, lucide, a table library)
- Live `wrangler deploy`

### Project Structure Notes

- Entity surface: `src/surfaces/apex/entities/` — not `src/shared/ui/`, not `src/pages/`, not architecture’s `pages/` sketch
- List enrichment stays in `src/shared/db/repos/entitiesRepo.ts` + `src/shared/schemas/entity.ts`
- Selection stays in `src/surfaces/apex/selection.ts` (unchanged shape)
- CSS tokens in `src/shared/ui/pml.css` only
- Detected variance: architecture directory sketch still mentions `StateDetailPage` / `CaseDetailPage`; v1 is one long-scroll page. Follow the post-epics routing clarification

### Previous story intelligence (2.6)

- One hook inside `ApexF1Provider`. Shareable axes go on the URL; local UI (issue bar used to be the exception — issue **is** shareable). Entity tab is **not** shareable — keep it local
- `listCases` already runs four unscoped follow-ups and `Schema.parse`s every row. `listEntities` adding two follow-ups is the same pattern. One invalid row still 500s the list (deferred); do not “fix” that here
- Hash jumps must `replaceState`, not `location.hash` (pushes history)
- Loading copy must not report zero as a finding
- `shouldBumpStateDetailEpoch` ignores issue/case-only clicks. Entity tab clicks must **not** `commit` a new state or they will refetch the open state panel. State-name clicks **should** `commit(selectionForState)` and bump — that is correct
- `?issue=` must survive `selectionForCase` and `selectionForState` (already preserved on those helpers after 2.6 review)
- Do not live-deploy. Do not default-select Kalshi

### Git intelligence

- Last commits: `3b86914` 2.6 issue map (#6); `d7d647b` 2.5 cases (#5); `534bb37` 2.4 board (#4)
- Pattern: surface-local folder + pure `*View.ts` + `useEffect` fetch + co-located `*.test.tsx` + `shells.test.tsx` EmptyState count
- Enrich the list endpoint the band already needs; do not add a detail route for a long-scroll panel

### Latest tech information

- No new libraries. Do not upgrade `echarts`, add `echarts-for-react`, or pull a data-grid. Zod 4 `.extend` is already how `CaseListItemSchema` is built — copy that, not a new parser
- React 19: keep `useEffect` + AbortController. Do not use `use()` for this fetch
- `StatusBadge` / `PostureSwatch` already exist; a second badge component is wheel-reinvention

### Project context reference

No `project-context.md` is present. Carry architecture.md + the 2.1–2.6 story files as the implementation constitution.

### References

- [Source: epics.md#Story-2.7] L478–490 — user story + ACs
- [Source: epics.md] FR41 (L113), UX-DR15 (L194), FR6 deferred (L41, L223, L286), UX-DR8 section order, UX-DR24 (do not ship HTML), NFR4/NFR5
- [Source: architecture.md] Apex orientation + entity ledger (L709) — **no new architectural components**; Frontend-routing-clarification (L711–713) — selected **state/case/issue** only
- [Source: prd.md#FR-6] L147–152 — player map (phase-in); v1 footprint is FR41, not this FR
- [Source: ux-designs/design_handoff_pml/README.md] Entity ledger `#entities` (L83)
- [Source: ux-designs/design_handoff_pml/PML Tracker.html] `#entities` markup (~933–944), CSS (~372–410), `renderEntities` (~2009–2090)
- [Source: 2-6-issue-map-synced-to-cases.md] provider wrap, `replaceState` jumps, honest loading, `?issue=` preservation
- [Source: 2-5-case-list-detail-rich-filters.md] `entityRoles` vs no `partyRole`; `selectionForCase`; no default Flaherty
- [Source: 2-1-f1-data-model-apis-case-law-seed.md] `entities` + `case_entities` + `state_platform_statuses`; five-platform seed
- [Source: deferred-work.md] landing overwrite; `items.every` blast radius still deferred

## Open Questions for Patrick (do not block implementation)

1. **Tab labels?** Seed `name` is the legal string (`KalshiEX LLC`, `Polymarket US (QCX LLC)`). The prototype used short names. Story renders the published `name`. Say if 2.8+ should add a `shortName` column.
2. **Shareable entity?** Architecture omitted `?entity=`. Implemented as local tab state. Say if a later story should deep-link a platform the way `?issue=` deep-links a tag.
3. **CFTC / party map?** Out of scope (FR6). The prototype’s CFTC tab is the obvious “helpful” extra — it is explicitly deferred.

## Dev Agent Record

### Agent Model Used

Cursor Grok 4.6

### Debug Log References

- Preflight: branch `story/2-7-entity-ledger` from `3b86914` (Story 2.6). `npm test` 387/15. `npm run check` 0. `GET /api/entities/kalshi` remains envelope 404.
- Live D1 footprint for Kalshi is later than 0002 comments (AZ go, MN restricted, NV banned, NJ go, TN go, UT/WA unknown). UI reads published `state_platform_statuses`; tests pin NJ go + Flaherty plaintiff, not seed counts.
- Browser (`localhost:5173`): empty `#entities` shows “Nothing selected” (no default Kalshi); five D1 tabs; Kalshi matters include Flaherty; NJ in go; Open case record → `?case=case-flaherty#cases`; with `?issue=cea-preemption` both case and NJ jumps keep the issue (`?issue=cea-preemption&state=NJ&circuit=cir-3#states`); 900px `.ent` is one column; `#cert` still EmptyState; map has no entity-activity layer.
- `npx wrangler deploy --dry-run` exit 0. No live deploy.

### Completion Notes List

- `#entities` is FR41: per-platform footprint + matter list from a bulk-enriched `GET /api/entities`. Selected platform is local React state — no `?entity=`, no default Kalshi, no CFTC tab, no case-bar entity filter, no map layer.
- `listEntities` runs two unscoped joins (`case_entities`+`cases`, `state_platform_statuses`+`states`) and parses `EntityListItem`. `EntitySchema` and `getEntityBySlug` stay thin; `/api/entities/:slug` stays unrouted.
- `entityMetrics` counts exact `plaintiff`/`defendant`; appellate is `forum === "federal-appellate"`. `unknown` is its own footprint bucket. Jumps use `history.replaceState` + existing `selectionForCase` / `selectionForState`.
- `ApexF1Provider` now wraps through `#entities`. `#cert` / `#trust` / `#ops` remain EmptyState. Tracker.html profile/legal copy was not shipped.
- Checks: `npm test` 387 passed / 15 files; `npm run check` 0; wrangler dry-run 0. No new npm dependency. No D1 migration.

### File List

- `_bmad-output/implementation-artifacts/2-7-entity-ledger.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/shared/api/publicApi.test.ts`
- `src/shared/db/repos/entitiesRepo.ts`
- `src/shared/schemas/entity.ts`
- `src/shared/ui/pml.css`
- `src/surfaces/apex/ApexF1Context.tsx`
- `src/surfaces/apex/ApexShell.tsx`
- `src/surfaces/apex/entities/EntityBoard.tsx`
- `src/surfaces/apex/entities/EntityDetail.tsx`
- `src/surfaces/apex/entities/EntityTabs.tsx`
- `src/surfaces/apex/entities/entities.test.tsx`
- `src/surfaces/apex/entities/entityView.ts`
- `src/surfaces/apex/entities/useEntityLedger.ts`
- `src/surfaces/shells.test.tsx`

## Change Log

- 2026-09-02: Story context created from Epic 2 / FR41 / UX-DR15 / handoff A3b / Stories 2.1–2.6 (ready-for-dev)
- 2026-09-02: Implemented `#entities` EntityBoard from bulk-joined `GET /api/entities`; status → review
- 2026-09-02: Code review patches — `listsReady` jump gate, empty list fail-closed, `jumpToBand` scrolls the target band; status → done
