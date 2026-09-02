---
baseline_commit: 6677e2b7034e7b432420cc277e92e1e5895d1a57
baseline_branch: main
main_at_creation: 6677e2b7034e7b432420cc277e92e1e5895d1a57
---

# Story 2.8: Qualitative Cert Signal

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a reader watching SCOTUS timing,
I want a clearly labeled qualitative cert-likelihood signal with named factors,
so that I understand the reading without mistaking it for a market price or probability.

## ⚠️ Read this before writing any code

**This is FR4 / UX-DR12, not FR44.** The reader poll (`#poll`, thumbs, OT term, tally API) is Story 2.9. Eight things will bite you:

1. **Branch from today’s `main` (`6677e2b`, Story 2.7).** `#entities` is `EntityBoard` **inside** `ApexF1Provider`. `#cert` is still EmptyState **outside** the provider. Starting from an older SHA deletes the entity ledger.
2. **Do not wrap `#cert` in `ApexF1Provider`.** The signal is a singleton fetch, not a selection axis. Leave the wrap ending after `#entities`. Do **not** instantiate `useApexSelection`. Do **not** add `?cert=`.
3. **`GET /api/cert-signal` already exists.** Story 2.1 ships a camelCase singleton (`id: "current"`, `reading`, `factors[]`, `methodNote`, `reviewedAt`, `approver`, `provenanceKind`, timestamps). `jsonOk`, not `{ items }`. **Do not** add `/api/cert-signal/:id`, query params, a list envelope, or a D1 migration. Do **not** N+1 `sources` — `src-cert` is not on `CertSignalSchema`.
4. **Render D1 factors, not Tracker.html’s five editorial bullets.** Seed has **four** `{ lead, explanation }` rows (appellate merits, NJ SCOTUS timing, multi-circuit pending, CFTC-vs-states). Prototype HTML (~978–992) is a different five-factor essay. **HALT** if you paste those `<li>`s or invent a fifth factor. Number `1…n` in render order.
5. **No numeric probability. No market fetch.** `cert_signals` has no score column on purpose. The dashed `.reserved` block is static chrome for a future Kalshi/Robinhood number + methodology + reflexivity caveat. **HALT** if you call Kalshi/Robinhood, add a `%`, a `<meter>`, ECharts gauge, or a score field.
6. **Do not ship Story 2.9.** No thumbs, no OT picker, no `poll_votes`, no `POST /api/poll/votes`. `/api/poll/votes` must stay unmatched (non-JSON 404). `#poll` is still the 2.2 comment between KPI and `#brief`.
7. **Do not print `approver` (“Patrick (seed curator)”) on the public gauge.** FR4’s “approver (human or agent)” is `ProvenanceLabel` from `provenanceKind`. Reviewed date is `reviewedAt` (`YYYY-MM-DD`) via **`formatIsoDate`**, not `formatEtDate` (UTC-midnight rolls the ET calendar day).
8. **Do not live-deploy.** Production landing overwrite is still open in deferred-work. No new npm dependency. No `.export`. Do not claim a live ops. draft pipeline in method copy (2.2 forbade present-tense pipeline claims).

## Acceptance Criteria

1. **Given** the seeded cert signal (`id = 'current'`, Story 2.1), **when** I view the `#cert` band, **then** I see a qualitative reading on a 5-segment scale (Remote · Low · Elevated · Likely · Near-certain) with explicit “not a probability / not market-derived” caveat (FR4, UX-DR12)
2. **And** a numbered factors list renders each published `{ lead, explanation }` as a bold lead + explanation; method copy states there is no weighting, no model, and no score
3. **And** a provenance label (`human` / `agent` from `provenanceKind`) and a reviewed date from `reviewedAt` are visible (FR18)
4. **And** a dashed reserved block holds space for a future market-derived value + methodology + reflexivity caveat and is clearly not shipped
5. **And** no Kalshi/Robinhood market data is fetched or displayed as a live figure

## Tasks / Subtasks

- [x] **Task 1: Preflight** (AC: all)
  - [x] Confirm HEAD is Story 2.7 (`6677e2b` or later with `#entities` / `EntityBoard`). Record `git log -1 --oneline`. If `EntityBoard` is missing, **stop**
  - [x] Confirm `npm test` is green. Record the count. Zero cloud credentials
  - [x] Confirm `npm run check` exits 0
  - [x] Confirm `GET /api/cert-signal` is a singleton (`id === "current"`, `reading === "elevated"`, `factors.length >= 1`, camelCase, **no** `factors_json` / `method_note`). `GET /api/poll/votes` still non-JSON 404. Keep both that way
  - [x] Confirm `#cert` is EmptyState (“Signal view not yet wired”) **outside** `ApexF1Provider` (wrap ends after `#entities`). Remaining EmptyStates are `cert`, `trust`, `ops` (**3**). If `LaunchNote.tsx` exists, stop
  - [x] Read, do not remember: Tracker.html `#cert` (~946–1000), cert CSS (~421–433). Recreate in React from D1; do not ship the HTML (UX-DR24)
  - [x] Read `ApexShell.tsx` `#cert`, `certSignal.ts`, `certSignalRepo.ts`, `publicRouter.ts` `/api/cert-signal`, `vocabulary.ts` `CERT_READING_VALUES`, `publicApi.test.ts` cert pin, `useEntityLedger.ts` (copy the fetch, not the list `every()`), `useOrientation.ts`, `ProvenanceLabel.tsx`, `UpdatedBadge.tsx`, `dates.ts` `formatIsoDate`, `shells.test.tsx`, `pml.css` `@media (max-width: 940px)` that already collapses `.f1, .board, .cases, .ent`
  - [x] Branch: `story/2-8-qualitative-cert-signal` from **`6677e2b` (main)**, not from an older Epic 2 SHA

- [x] **Task 2: Pure cert helpers** (AC: 1–2)
  - [x] New `src/surfaces/apex/cert/certView.ts` — **pure, no `window`**:
    - `CERT_SCALE` = `CERT_READING_VALUES` order: `remote | low | elevated | likely | near-certain`
    - `readingLabel(reading)` → `Remote` / `Low` / `Elevated` / `Likely` / `Near-certain` (hyphen stays on the last one). Do **not** emit prototype title-case from a hardcoded `"Elevated"`
    - `scaleFilledCount(reading)` → `indexOf(reading) + 1` (elevated = 3 of 5). Do **not** map unknown strings to 0 in a way that paints an empty scale as a “Remote” finding — callers only pass a validated `CertReading`
  - [x] Pin with mocks: `elevated` → label `Elevated`, filled `3`; `remote` → `1`; `near-certain` → `5`. Do not assert seed factor count `4` in UI tests

- [x] **Task 3: `#cert` UI** (AC: 1–5)
  - [x] New files under `src/surfaces/apex/cert/` (surface-local, same rule as `entities/` / `issues/`):
    - `useCertSignal.ts` — `useEffect` + `AbortController` fetch `GET /api/cert-signal`, fail closed, `import type` only from schemas (copy `useOrientation` / `useEntityLedger`, **not** `useCircuitData`). Status `idle | loading | success | error`. Response is the **object**, not `{ items }`. Invalid / missing `id === "current"` / empty `factors` → `error`. Do **not** fold this fetch into `listsReady` or `useOrientation`
    - `CertBoard.tsx` — gauge + factors; composed inside existing `SectionBand id="cert"`. Support injected `signal` + `status` for tests (same pattern as `EntityBoard`)
  - [x] **Loading:** while `idle` / `loading` do **not** render `Remote` or `0` filled segments as a finding (2.6/2.7: zero-as-finding while lists loaded). Honest wait copy, e.g. kicker `Loading cert reading` / hint that a wait is not a Remote forecast
  - [x] **Error / unpublished:** EmptyState title `Cert signal could not be loaded` / hint `A missing reading is not a forecast of Remote.` Do **not** fall back to hardcoded `Elevated`
  - [x] **Gauge (`.certgauge`):** kicker `Reading`; `.val` = `readingLabel`; `aria-label={`Qualitative reading: ${label}`}` on the gauge (the bar row stays `aria-hidden="true"`). `.scale` of five `<span>`s, first `scaleFilledCount` get `.on`; caption line `Remote · Low · Elevated · Likely · Near-certain` with the active word in `<strong>`. Caveat (static product chrome, not D1): `A qualitative editorial reading of the factors at right. It is not a probability, and it is not derived from any market.` Then `ProvenanceLabel kind={provenanceKind}` + `UpdatedBadge` `Reviewed {formatIsoDate(reviewedAt)}`
  - [x] **Reserved block:** immediately under the gauge, class `.reserved`, copy: `Reserved: market-derived cert probability (Kalshi / Robinhood), with methodology and reflexivity caveat. Not shipped in v1.` Static. No fetch. No number
  - [x] **Factors:** kicker `Factors named in this reading`. `<ol>` or numbered `<ul class="factors">` from `signal.factors`. Each row: `.fn` index, `<strong>{lead}</strong>` + explanation text. After the list: D1 `methodNote` as a paragraph, **plus** static chrome `Factors are the whole method. There is no weighting, no model and no score behind this reading.` Do **not** add “the change appears as a draft on ops. before it appears here”
  - [x] **Provider / shell:** rewrite `ApexShell.tsx` `#cert` only: keep `SectionBand`; replace EmptyState with `<CertBoard />`. Handoff copy:
    - kicker: `A4 · Qualitative signal` (**do not keep `07`**)
    - title: `Certiorari likelihood`
    - why: `Qualitative only. No market-derived number ships in v1 — the space below the reading is deliberately held open for one, with its methodology and its reflexivity caveat.`
    - Leave `#trust` `#ops` as EmptyState. Do **not** extend `ApexF1Provider`
  - [x] One document `<h1>` remains the masthead. Focus ring is the global accent outline (NFR5)
  - [x] At `max-width: 940px` `.cert` becomes one column. Do not invent a new breakpoint

- [x] **Task 4: CSS** (AC: 1, 4)
  - [x] Port into `src/shared/ui/pml.css` using tokens: `.cert`, `.certgauge`, `.certgauge .val`, `.certgauge .scale`, `.certgauge .scale span`, `.certgauge .scale span.on`, `.factors`, `.factors li`, `.factors .fn`, `.reserved`. Reuse `.kicker`, `.prov`, `.badge.upd`, `.empty`, `.rule` if already present. Do **not** add `.export`
  - [x] `.on` uses `accent-300` fill + `accent-600` border (handoff). Do **not** restyle `.etab` / `.cases` / `.board` / `.f1` / `.chartcard`
  - [x] Append `.cert` to the existing `@media (max-width: 940px)` block that already collapses `.f1, .board, .cases, .ent`

- [x] **Task 5: Tests** (AC: all)
  - [x] `src/surfaces/apex/cert/cert.test.tsx` (Node `renderToStaticMarkup`, same as entities; **no** new testing-library):
    - `readingLabel` / `scaleFilledCount` for `remote` / `elevated` / `near-certain`
    - Injected elevated mock shows `Elevated`, three `.on` segments, caveat “not a probability”, reserved “Not shipped”, numbered leads from the mock — **not** Tracker.html’s “deep district-court split” essay
    - Injected mock `reviewedAt: "2026-08-09"` shows `Reviewed 9 Aug 2026` (via `formatIsoDate`)
    - Loading does not contain `Remote` as a finding and does not contain `>0</` filled counts as a forecast
    - Fetch failure / invalid payload shows “could not be loaded”, not hardcoded Elevated
    - Markup does not contain `%`, `kalshi.com`, `robinhood.com`, or `poll`
  - [x] `shells.test.tsx`: `#cert` no longer contains “Signal view not yet wired”; `.cert` or `.certgauge` present; remaining EmptyState bands are `trust`, `ops` (**2**)
  - [x] `publicApi.test.ts`: existing cert pin still passes; add `reading === "elevated"` and `methodNote` truthy if not already asserted. `/api/poll/votes` still 404. Do not assert seed factor count `4` in UI tests
  - [x] Do not add `@testing-library`. Stub via CertBoard props like EntityBoard
  - [x] `npm test` green, zero cloud credentials

- [x] **Task 6: Finalize** (AC: all)
  - [x] `npm run check` exit 0
  - [x] **Do not live-deploy.** `npx wrangler deploy --dry-run` is enough
  - [x] File List from `git status` / diff. Single commit only if Patrick asks
  - [x] Browser-verify `#cert`: reading Elevated, three filled scale segments, four D1 factors (first lead contains appellate merits / Flaherty — **not** the prototype’s five), Human-approved + Reviewed 9 Aug 2026, reserved dashed “Not shipped”, no `%` in the band, `#trust` still EmptyState, `#entities` still has tabs, 940px stacks `.cert`, Network tab has `GET /api/cert-signal` and **no** Kalshi/Robinhood requests

### Review Findings

- [x] [Review][Patch] Caveat says “factors at right” while 940px stacks the band to one column — use layout-neutral copy [src/surfaces/apex/cert/CertBoard.tsx:7]
- [x] [Review][Patch] Success-path tests do not pin factor explanations, `.fn` numbering, or the rendered `methodNote` [src/surfaces/apex/cert/cert.test.tsx:53]
- [x] [Review][Patch] Factors `<ul>` uses `list-style: none` with no `role="list"`, which drops list semantics in VoiceOver/Safari [src/surfaces/apex/cert/CertBoard.tsx:95]
- [x] [Review][Defer] Seed `methodNote` now prints on the public gauge and includes the repo path `docs/research/` [src/surfaces/apex/cert/CertBoard.tsx:105] — deferred, pre-existing
- [x] [Review][Defer] Top-nav label remains “Cert signal” after the band title changed to “Certiorari likelihood” [src/surfaces/apex/ApexShell.tsx:61] — deferred, pre-existing

## Dev Notes

### Current code state (verified 2026-09-02, SHA `6677e2b`)

- `main` is `6677e2b` — Stories 2.1–2.7. **2.7 is the required base** (`EntityBoard`, provider wrap through `#entities`)
- `ApexShell.tsx` `#cert` is EmptyState (“Signal view not yet wired”) **outside** `ApexF1Provider`. `#entities` is `<EntityBoard />`, `#trust` / `#ops` EmptyState
- `GET /api/cert-signal` → `CertSignal` singleton via `certSignalRepo.getCertSignal` + `jsonOk`. Unrouted: no slug/id variant. Missing row → envelope 404 `"Cert signal not published."`
- Seed (`migrations/0002_seed_f1.sql` L350): `reading = elevated`, **four** factors, `reviewed_at = 2026-08-09`, `approver = Patrick (seed curator)`, `provenance_kind = human`, `method_note` already says qualitative / no numeric probability
- `CERT_READING_VALUES` already in `vocabulary.ts`. `CertSignalSchema` already `.strict()` on factors and `id` literal `"current"`. **Do not migrate**
- `UpdatedBadge` exists (`.badge.upd`). `ProvenanceLabel` maps `human` / `agent` only — unknown kind renders `undefined` (do not pass a free string)
- `formatIsoDate` exists specifically so `YYYY-MM-DD` does not roll back a day in ET
- React `^19.2.7`, Vite `^8.1.0`, Vitest `~4.1.10`, Zod `^4.4.3`, `echarts@^5.6.0` (**issues only**). **No new dependency**

### What this story changes vs what must be preserved

| File | Today | This story | Must preserve |
|---|---|---|---|
| `ApexShell.tsx` | `#cert` EmptyState outside provider | `CertBoard` still **outside** provider | `#trust` EmptyState; kicker/title/why as Task 3; wrap still ends after `#entities` |
| `pml.css` | No `.cert` / `.certgauge` | Port handoff cert CSS | Existing 940px breakpoint; do not restyle `.ent` / `.etab` |
| `shells.test.tsx` | 3 remaining empties | 2 (`trust`, `ops`) | IA split assertions; entities still wired |
| `publicRouter.ts` / `certSignalRepo.ts` / `certSignal.ts` | Singleton GET | **Untouched** | No poll routes; no score column |
| `ApexF1Context.tsx` / `selection.ts` | Four axes | **Untouched** | No `?cert=` |
| `CircuitMap` / `CaseBoard` / `EntityBoard` | Live | **Untouched** | |
| Masthead / `#poll` comment | 2.2 placement | **Untouched** | Poll is 2.9 |

### Anti-patterns (HALT)

- Pasting Tracker.html’s five-factor essay / hardcoded `Elevated` / `<meter value>`
- `GET /api/cert-signal/:id`, wrapping the singleton as `{ items }`, adding `score` / `probability` to the schema
- Fetching Kalshi, Robinhood, Polymarket, or any prediction-market API
- Implementing `#poll`, `localStorage` votes, or `poll_votes` “while we’re here”
- Extending `ApexF1Provider` through `#cert`; `?cert=` on the URL
- `formatEtDate("2026-08-09")` for the reviewed badge
- Rendering `signal.approver` on the public page
- Method copy that claims drafts already appear on ops.
- New npm packages (`echarts-for-react`, a gauge library, lucide)
- D1 migration; live `wrangler deploy`

### Project Structure Notes

- Cert surface: `src/surfaces/apex/cert/` — not `src/shared/ui/`, not architecture’s `pages/CertSignal.tsx` sketch
- Reuse `GET /api/cert-signal`; do not add a repo method
- CSS tokens in `src/shared/ui/pml.css` only
- Detected variance: architecture directory sketch still mentions `CertSignal.tsx` under `pages/`; v1 is one long-scroll page. Follow the post-epics routing clarification

### Previous story intelligence (2.7)

- Surface-local folder + pure `*View.ts` + `useEffect` fetch + co-located `*.test.tsx` + `shells.test.tsx` EmptyState count
- Fail closed: empty/invalid payload is the error EmptyState, not a blank that looks like a finding (`[].every` footgun on lists — this story is a singleton, still reject missing `factors`)
- Loading copy must not report a reading
- Do not fold a new fetch into `listsReady`
- Hash jumps / `listsReady` gates are **not** this story — cert does not `commit`
- UI tests stay `renderToStaticMarkup`; no new test harness (2.7 deferred click tests)
- Do not live-deploy

### Git intelligence

- Last commits: `6677e2b` 2.7 entity ledger (#7); `3b86914` 2.6 issue map (#6); `d7d647b` 2.5 cases (#5)
- Pattern: replace one EmptyState, port handoff CSS into `pml.css`, pin behavior with mocks, leave later bands EmptyState
- This story is **UI-only** on an existing singleton endpoint — closer to 2.2 orientation than to 2.6/2.7 list enrichment

### Latest tech information

- No new libraries. Do not add a gauge chart. Five CSS flex segments are the handoff
- React 19: keep `useEffect` + AbortController. Do not use `use()` for this fetch
- Zod 4 stays on the Worker. Client guards are hand-copied sets / `import type`, same as `useEntityLedger`

### Project context reference

No `project-context.md` is present. Carry architecture.md + the 2.1–2.7 story files as the implementation constitution.

### References

- [Source: epics.md#Story-2.8] L492–506 — user story + ACs
- [Source: epics.md] FR4 (L37, L221), UX-DR12 (L188), FR18 (L65), FR44 deferred to 2.9 (L508–522), UX-DR8 section order, UX-DR24, NFR4/NFR5
- [Source: prd.md#FR-4] L128–137 — qualitative, no Kalshi/Robinhood in v1, last-review + approver (human or agent), reserved market-derived later
- [Source: architecture.md] Apex cert (L448 sketch) — **no new architectural components**; Frontend-routing-clarification (L711–713) — selected **state/case/issue** only
- [Source: ux-designs/design_handoff_pml/README.md] A4 cert (L128–133)
- [Source: ux-designs/design_handoff_pml/PML Tracker.html] `#cert` (~946–1000), CSS (~421–433)
- [Source: 2-1-f1-data-model-apis-case-law-seed.md] `GET /api/cert-signal`, singleton `cert_signals`, structured factors
- [Source: 2-7-entity-ledger.md] provider wrap through `#entities`, honest loading, fail-closed empty, no live-deploy
- [Source: deferred-work.md] landing overwrite; 2.7 click-harness defer

## Open Questions for Patrick (do not block implementation)

1. **Seed four vs prototype five?** Implemented as published D1 factors. Say if a later story should rewrite the seed essay to match Tracker.html.
2. **Approver name on the gauge?** Handoff shows Human-approved + date only. `approver` stays in the API for ops/admin later.
3. **Poll placement?** Still Story 2.9 under the KPI row (UX-DR13), not inside `#cert`.

## Dev Agent Record

### Agent Model Used

Cursor Grok 4.6

### Debug Log References

- HEAD at start: `6677e2b story 2.7: entity ledger by platform from bulk-joined GET /api/entities (#7)` on branch `story/2-8-qualitative-cert-signal`
- Preflight `npx vitest run`: 15 files, 390 passed
- `#cert` was EmptyState outside `ApexF1Provider`; wrap still ended after `#entities`; no `LaunchNote.tsx`
- `GET /api/cert-signal` singleton `id=current` `reading=elevated` four D1 factors, camelCase; `GET /api/poll/votes` 404 `text/plain`
- Post-impl `npx vitest run`: 16 files, 395 passed
- `npm run check`: exit 0
- `npx wrangler deploy --dry-run`: exit 0, no live publish
- Browser `http://localhost:5173/#cert`: Elevated, three `.on` segments, four D1 leads (first “Only one appellate merits holding” / Flaherty), Human-approved, Reviewed 9 Aug 2026, reserved “Not shipped”, no `%`, `#trust` EmptyState, five entity tabs, 390px `grid-template-columns` is one track, resource log has `/api/cert-signal` and no Kalshi/Robinhood hosts

### Completion Notes List

- Wired `#cert` as a singleton UI over existing `GET /api/cert-signal`. Did not extend `ApexF1Provider`, did not add `?cert=`, did not fetch markets, did not ship `#poll`.
- Scale labels and filled count come from `readingLabel` / `scaleFilledCount`; loading copy never paints Remote; invalid/missing payload is EmptyState, not a hardcoded Elevated.
- Factors are D1 `{ lead, explanation }` (four in the seed). Tracker.html’s five-factor essay was not pasted. `approver` stays off the public gauge; reviewed date uses `formatIsoDate`.
- Remaining EmptyStates: `trust`, `ops`.

### File List

- src/surfaces/apex/cert/certView.ts
- src/surfaces/apex/cert/useCertSignal.ts
- src/surfaces/apex/cert/CertBoard.tsx
- src/surfaces/apex/cert/cert.test.tsx
- src/surfaces/apex/ApexShell.tsx
- src/shared/ui/pml.css
- src/surfaces/shells.test.tsx
- src/shared/api/publicApi.test.ts
- _bmad-output/implementation-artifacts/2-8-qualitative-cert-signal.md
- _bmad-output/implementation-artifacts/sprint-status.yaml

## Change Log

- 2026-09-02: Story context created from Epic 2 / FR4 / UX-DR12 / handoff A4 / Stories 2.1–2.7 (ready-for-dev)
- 2026-09-02: Implemented qualitative `#cert` gauge from the existing singleton API; remaining EmptyStates are trust/ops (review)
- 2026-09-02: Code review — layout-neutral caveat, `role="list"` on factors, tighter success-path tests (done)
