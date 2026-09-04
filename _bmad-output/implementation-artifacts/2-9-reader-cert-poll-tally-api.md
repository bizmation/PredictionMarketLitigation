---
baseline_commit: 8e192cb74ae7e6a1b90328f3da9dc8b7ad635de1
baseline_branch: main
main_at_creation: 8e192cb74ae7e6a1b90328f3da9dc8b7ad635de1
---

# Story 2.9: Reader Cert Poll & Tally API

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a visitor,
I want to cast an unscientific cert poll (thumbs + OT term) and see results after voting,
so that engagement is possible without undermining the qualitative cert signal.

## ⚠️ Read this before writing any code

**This is FR44 / UX-DR13, not FR4.** The qualitative `#cert` gauge is Story 2.8 and already ships. Ten things will bite you:

1. **Branch from today’s `main` (`8e192cb`, Story 2.8).** `#cert` is `CertBoard` **outside** `ApexF1Provider`. `#poll` is still the 2.2 comment inside `Masthead` children, between `KpiRow` and `#brief`. Starting from an older SHA deletes the cert gauge or the entity ledger.
2. **Placement is KPI → `#poll` → `#brief` (UX-DR8).** Insert the panel as a Masthead child **after** `<KpiRow />`, still **outside** `ApexF1Provider`. Do **not** move it next to `#cert`. Do **not** wrap it in `SectionBand`. Do **not** add `?poll=`.
3. **Durable D1, not localStorage.** Architecture: `POST /api/poll/votes` + `GET /api/poll/results` + migration `poll_votes`. Tracker.html’s `POLL_KEY` / `POLL_BASE` (`yes: 1284` …) is prototype theatre. **HALT** if production tally is `localStorage`-only, if you seed those fake counts, or if the header shows “1,895 votes” on an empty table.
4. **`handlePublicApi` currently 404s every `/api/poll/*` on purpose.** `isReservedPublicPath` + the GET-only guard + `publicApi.test.ts` “does not claim `/api/poll/votes`” + `server.test.ts` POST 404 are the 2.1/1.4 placeholders. This story **owns** those paths: remove poll from the reserve list, handle POST before the GET-only throw, and **rewrite** those two tests. POST must stay **unauthenticated** (`adminGuard` is path-scoped, never method-scoped — do not “fix” that).
5. **Poll GET/POST must be `Cache-Control: no-store`.** `jsonOk` sets `public, max-age=60`. Reusing it caches a live tally and can leak `Set-Cookie` into a cached response. Add a no-store helper or pass headers explicitly.
6. **Disclaimer integrity vs the prototype footer.** Keep the FR44 sentences verbatim: unscientific, not evidence, not a forecast, not connected to any market, one vote per browser, plus the `#cert` link. **Drop** “stored locally; nothing is sent anywhere” — that is a lie the moment you POST to D1. **HALT** if the footer claims votes never leave the browser.
7. **Do not touch `#cert`.** `CertBoard` tests forbid `%`, `kalshi.com`, `robinhood.com`, and the substring `poll`. Percentage bars belong **only** in `#poll` after a vote. Do not restyle `.certgauge`. Remaining EmptyStates stay `trust`, `ops`.
8. **No Lucide package. No reader accounts. No fingerprinting.** Inline the Tracker.html thumb SVG paths. Identity is an **HttpOnly** cookie + `poll_votes.voter_token`, not canvas/IP. PRD A7 / NFR11. `__Host-` cookies break `http://localhost:5173` — use `pml_poll` with `HttpOnly; Path=/; SameSite=Lax`; add `Secure` only when the request URL is `https:`.
9. **Do not ship Story 2.10.** No donations row, no correction form, no `#trust` rewrite.
10. **Do not live-deploy.** `npm run deploy` applies **remote** D1 migrations then `wrangler deploy`. Local: `npm run migrate:local` so Vite’s D1 has `poll_votes`. Tests pick up `migrations/0005_*.sql` via `readD1Migrations` automatically. `npx wrangler deploy --dry-run` is enough for the Worker bundle.

## Acceptance Criteria

1. **Given** the apex page with the poll panel (UX-DR13, FR44), **when** I vote thumbs up/down (They grant / They deny) and may pick a term (OT 2026 / OT 2027 / OT 2028 / Later or never), **then** the vote is recorded via a durable tally API backed by D1 `poll_votes` added in this story’s migration (not localStorage-only in production)
2. **And** cert percentage bars reveal only after a cert vote, with my choice in accent (`.row.me`); term bars reveal only after a term pick; labelled `NN%`
3. **And** footer copy states it is unscientific, not evidence, not a forecast, not connected to any market, one vote per browser, and links to `#cert` — without claiming the vote stays on-device
4. **And** the poll sits under the KPI row, is visually a reader widget (not the cert gauge), and cannot be read as an official PML forecast
5. **And** abuse basics: one voter token per browser via cookie; first write wins (no toggle-off, no changing a cast cert/term); no reader accounts; anonymous POST is not 403

## Tasks / Subtasks

- [x] **Task 1: Preflight** (AC: all)
  - [x] Confirm HEAD is Story 2.8 (`8e192cb` or later with `CertBoard`). Record `git log -1 --oneline`. If `#cert` is still EmptyState, **stop**
  - [x] Confirm `npm test` is green. Record the count. Zero cloud credentials
  - [x] Confirm `npm run check` exits 0
  - [x] Confirm `GET /api/poll/votes` is still non-JSON 404 and `POST /api/poll/votes` is 404 not 403. Both must change in this story — record the current assertions so you rewrite them on purpose
  - [x] Confirm `#poll` is the comment inside `Masthead` after `KpiRow`; wrap still ends after `#entities`; remaining EmptyStates `trust`, `ops`
  - [x] Read, do not remember: Tracker.html `#poll` (~613–644), poll CSS (~37–81), poll JS (~2425–2473). Recreate in React from D1; do not ship the HTML or `POLL_BASE` (UX-DR24)
  - [x] Read `ApexShell.tsx` Masthead children, `publicRouter.ts` `isReservedPublicPath`, `respond.ts` `jsonOk` cache headers, `errors.ts`, `adminGuard.ts` (path-scoped), `publicApi.test.ts` poll pin, `server.test.ts` AC5 poll POST, `cert/cert.test.tsx` (must keep forbidding `poll` inside CertBoard), `0001_f1_core.sql` (explicitly reserved `poll_votes` for 2.9), `package.json` `migrate:local` / `deploy`
  - [x] Branch: `story/2-9-reader-cert-poll-tally-api` from **`8e192cb` (main)**

- [x] **Task 2: Migration + schema + repo** (AC: 1, 5)
  - [x] New `migrations/0005_poll_votes.sql` — **do not edit 0001–0004**. Table `poll_votes`:
    - `id TEXT PRIMARY KEY`
    - `voter_token TEXT NOT NULL UNIQUE`
    - `cert TEXT NOT NULL CHECK (cert IN ('yes','no'))`
    - `term TEXT CHECK (term IS NULL OR term IN ('ot26','ot27','ot28','later'))`
    - `created_at TEXT NOT NULL` / `updated_at TEXT NOT NULL` (ISO-8601 UTC `Z`)
    - No IP column. No score. No FK to `cert_signals`
  - [x] New `src/shared/schemas/poll.ts` — Zod `.strict()` body `{ cert: 'yes'|'no', term?: 'ot26'|…|'later' | null }`. Results DTO camelCase: `{ voted, mine: { cert, term }, total, cert: { yes, no } | null, terms: { ot26, ot27, ot28, later } | null }`. `cert`/`terms` counts are **null when `voted` is false**
  - [x] Vocabulary: add `POLL_CERT_VALUES` / `POLL_TERM_VALUES` next to `CERT_READING_VALUES` (CHECK strings must match)
  - [x] New `src/shared/db/repos/pollVotesRepo.ts` — `insertVote`, `setTermIfNull`, `getByToken`, `tally`. Prepared `?` binds only. Map through Zod. Do not return `voter_token` on the wire
  - [x] Add `conflict(message)` → 409 `conflict` in `errors.ts` if missing

- [x] **Task 3: Tally API** (AC: 1, 5)
  - [x] Remove `/api/poll` from `isReservedPublicPath` (leave `/api/administrivia`)
  - [x] **Before** the GET-only guard: route
    - `POST /api/poll/votes` — parse JSON; require `cert` on first insert; `crypto.randomUUID()` for `id` + token; `Set-Cookie: pml_poll=<token>; HttpOnly; Path=/; SameSite=Lax; Max-Age=31536000` + `Secure` iff `https:`; if cookie already identifies a row: unchanged fields 200 idempotent, changed cert/term → 409; return the results DTO (`voted: true`) + no-store
    - `GET /api/poll/results` — no-store; without cookie or unknown token: `{ voted: false, mine: { cert: null, term: null }, total, cert: null, terms: null }`; with a row: fill counts + `mine`
  - [x] `GET /api/poll/votes` → 405 allow POST. `POST /api/poll/results` → 405 allow GET. Unknown `/api/poll/:x` → envelope 404
  - [x] Anonymous POST is **not** 403. Do not send `ADMIN_CACHE_HEADERS`

- [x] **Task 4: `#poll` UI** (AC: 1–5)
  - [x] New `src/surfaces/apex/poll/` (surface-local, same rule as `cert/`):
    - `pollView.ts` — **pure, no `window`**: term labels (`OT 2026` … `Later or never`), `percent(n, total)` (0 if total 0), `formatVoteCount(n)`
    - `usePoll.ts` — `useEffect` + AbortController `GET /api/poll/results` (`credentials: 'same-origin'`). Status `idle | loading | success | error`. Fail closed. Do not fold into `listsReady` / `useOrientation` / `useCertSignal`
    - `PollPanel.tsx` — composed as Masthead child. Support injected `results` + `status` + `onVote` for tests (EntityBoard/CertBoard pattern)
  - [x] **Loading:** honest wait. Do not paint `0%` bars or “They grant” as a finding
  - [x] **Error:** EmptyState-style hint inside the panel, not a hardcoded 1284. Copy must not look like a Remote/deny forecast
  - [x] **Pre-vote cert column:** no bars. Hint: `{total} readers have called it. Vote to see the split.` (real `total`, including 0)
  - [x] **Pre-vote term column:** no bars. Static chrome from the handoff is OK: petition docketed 28 July 2026 / OT 2026 conference note. Not a tally
  - [x] **Buttons:** They grant / They deny with **inline** Lucide-path SVGs (`aria-hidden`). Terms: OT 2026 / OT 2027 / OT 2028 / Later or never. `aria-pressed` on the current `mine`. Click posts; do not toggle off
  - [x] **Post-vote:** `.pres` labelled bars; `.row.me` + full-accent fill on `mine`; `NN%`. Header `.pn` = `{total} votes` from D1 (no fake “since 19 June 2026” count)
  - [x] **Footer** (single block, `#cert` link): `An unscientific reader poll. It is not evidence, not a forecast, and not connected to any market — the tracker's own cert reading is qualitative and set by a named human. One vote per browser.`
  - [x] Question chrome: kicker `Reader poll`; title `Will the Supreme Court take it?`; left label `Cert granted in Flaherty?`; right `And if they grant — which term?`
  - [x] One document `<h1>` remains the masthead. Focus ring is the global accent outline (NFR5). `max-width: 820px` stacks `.pgrid` (handoff). Do **not** reuse the 940px F1 breakpoint for this grid

- [x] **Task 5: CSS** (AC: 2, 4)
  - [x] Port into `src/shared/ui/pml.css` using tokens: `.poll`, `.poll .ph`, `.pq`, `.pn`, `.pgrid`, `.pgrid .vr`, `.pcol`, `.plabel`, `.pvote`, `.pbtn`, `.pterms`, `.pres`, `.pres .row`, `.pres .track`, `.pres .fill`, `.pres .row.me`, `.pfoot`. Reuse `.kicker`, `.issuehint`, `.num`, `.empty` if present
  - [x] `.row.me .fill` uses `accent` (full), other fills `accent-300` — that is what makes “my choice” visible
  - [x] Do **not** restyle `.certgauge` / `.etab` / `.cases` / `.board` / `.f1` / `.chartcard`
  - [x] Separate `@media (max-width: 820px)` for `.pgrid` only. Leave the existing 940px block alone (do not stuff `.poll` into it)

- [x] **Task 6: Tests** (AC: all)
  - [x] `src/surfaces/apex/poll/poll.test.tsx` (Node `renderToStaticMarkup`; **no** new testing-library):
    - `percent` / labels for `ot26` → `OT 2026`, `later` → `Later or never`
    - Injected unvoted `{ total: 0, cert: null }` shows the wait hint, **no** `%` bars, **no** `POLL_BASE` numbers
    - Injected voted `{ mine.cert: 'yes', cert: { yes: 3, no: 1 } }` shows a `%`, `.me` on grant, not on deny
    - Footer contains unscientific / not evidence / not a forecast / not connected to any market / One vote per browser / `href="#cert"`
    - Footer does **not** contain `stored locally` or `nothing is sent`
    - Markup does not contain `kalshi.com` / `robinhood.com`; thumbs SVG present; no `lucide-react` import
  - [x] `shells.test.tsx`: `#poll` present (`id="poll"` / `class="poll"`); remaining EmptyStates still `trust`, `ops`; `#cert` still has `.certgauge`/`.cert`
  - [x] `publicApi.test.ts`: **replace** the “does not claim” test:
    - `GET /api/poll/results` 200, `voted === false`, `cert === null`, `total === 0` on empty DB, `cache-control` includes `no-store`
    - `POST /api/poll/votes` `{ cert: "yes" }` 200, `Set-Cookie` has `pml_poll` + `HttpOnly`, body `voted === true`
    - Second POST with that cookie and `{ cert: "no" }` → 409
    - Second POST same `{ cert: "yes" }` → 200 idempotent
    - `GET /api/poll/results` with cookie returns counts; without cookie still hides `cert` counts
    - `GET /api/poll/votes` 405
  - [x] `server.test.ts` AC5: POST `/api/poll/votes` as anon is **not** 403 (200 or 400). Do not keep the 404 assertion
  - [x] `cert.test.tsx` still forbids `poll` inside CertBoard HTML
  - [x] Do not add `@testing-library`. `npm test` green, zero cloud credentials

- [x] **Task 7: Finalize** (AC: all)
  - [x] `npm run migrate:local` so Vite D1 has the table
  - [x] `npm run check` exit 0
  - [x] **Do not** `npm run deploy` / `migrate:remote`. `npx wrangler deploy --dry-run` is enough
  - [x] File List from `git status` / diff. Single commit only if Patrick asks
  - [x] Browser-verify: `#poll` under KPIs; grant → bars appear with accent on “They grant”; deny path hidden until vote; term bars only after a term; footer links `#cert` and does not say stored locally; Network has `POST /api/poll/votes` + `GET /api/poll/results` and **no** Kalshi/Robinhood; refresh keeps the vote (cookie); `#cert` still Elevated / four D1 factors / no `%` in that band; 820px stacks the poll grid; `#trust` EmptyState

### Review Findings

- [x] [Review][Defer] Unthrottled anonymous INSERT endpoint allows ballot stuffing — `POST /api/poll/votes` mints a fresh `crypto.randomUUID()` token per cookieless request and inserts unconditionally; a script can insert unbounded rows and inflate the public tally. — deferred, accepted: unscientific reader poll; identity options beyond the cookie (IP/fingerprint/accounts) are forbidden by spec; revisit if stuffing becomes visible
- [x] [Review][Patch] Term pick accepted after a "They deny" vote — UI enables term buttons when `mineCert !== null`, so a deny-voter can pick a term that is then tallied, contradicting the "And if they grant — which term?" label. Fix (Patrick's call): disable term buttons unless `mineCert === 'yes'` UI-side.
- [x] [Review][Patch] Double-click race casts two votes from one browser [src/surfaces/apex/poll/PollPanel.tsx:53, src/surfaces/apex/poll/usePoll.ts:85, src/shared/api/publicRouter.ts:153] — no in-flight guard or button disable; two rapid clicks both arrive cookie-less, each mints a distinct token, both INSERT (UNIQUE can't dedupe distinct tokens) → two rows, tally inflated, one orphaned row. Violates AC5 one-vote-per-browser. Fix: in-flight lock + disabled buttons (server-side dedup impossible without forbidden fingerprinting).
- [x] [Review][Patch] Term TOCTOU race returns 200 with a term that was never stored [src/shared/api/publicRouter.ts:141, src/shared/db/repos/pollVotesRepo.ts:83] — `setTermIfNull` returns void; concurrent term picks both read `term === null`, the UPDATE `WHERE term IS NULL` makes the loser a silent no-op, yet the loser responds 200 with the requested (not stored) term. Fix: check `meta.changes` or read back the row; 409 or return the actually-stored term.
- [x] [Review][Patch] Vote failures are silently swallowed by the UI [src/surfaces/apex/poll/PollPanel.tsx:53, src/surfaces/apex/poll/usePoll.ts:96] — `void vote(...)` discards the boolean; a 409 dead-end click (opposite cert after voting) gives zero feedback and buttons stay enabled. Fix: disable cert buttons once voted and while in-flight (pairs with the double-click patch).
- [x] [Review][Patch] Term write path has zero test coverage [src/shared/api/publicApi.test.ts:643] — `setTermIfNull` and the "Term already chosen." 409 are never exercised; the integration suite is cert-only. Add: second POST with same cookie + `{cert:'yes', term}` → 200; different term → 409.
- [x] [Review][Patch] Unbounded `request.json()` on the only public POST [src/shared/api/publicRouter.ts:119] — body fully buffered/parsed before the cheap Zod check; reject oversized `content-length` before parsing.
- [x] [Review][Patch] Percent bars can sum to 99% or 101% [src/surfaces/apex/poll/pollView.ts:33] — independent `Math.round` per row (e.g. 1/8 → 13 + 7/8 → 88 = 101); largest-remainder adjustment keeps the displayed split at 100.
- [x] [Review][Patch] Term labels duplicated in `POLL_TERMS` and `TERM_LABELS` in the same file [src/surfaces/apex/poll/pollView.ts:9] — derive one from the other to kill drift risk (still no Zod on the client).
- [x] [Review][Patch] Migration file missing trailing newline [migrations/0005_poll_votes.sql:35] — every other SQL/TS file in the diff ends cleanly.

## Dev Notes

### Current code state (verified 2026-09-02, SHA `8e192cb`)

- `main` is `8e192cb` — Stories 2.1–2.8. **2.8 is the required base** (`CertBoard`, provider wrap through `#entities`)
- `ApexShell.tsx` Masthead children: `<KpiRow />` then `{/* Story 2.9 inserts #poll here, between KPI and #brief */}`. `#cert` is `<CertBoard />` outside the provider. `#trust` / `#ops` EmptyState
- `handlePublicApi` GET/HEAD only. `isReservedPublicPath` returns null for `/api/poll` and `/api/poll/*` so the outer Worker 404s **plain text**, not `{ code, message }`
- `jsonOk` → `cache-control: public, max-age=60`. Poll must not use that
- `0001_f1_core.sql` L34: `poll_votes (Story 2.9)` is explicitly **not** in that migration. Next file is `0005_*.sql` (`0004` is source-URL hardening)
- `npm run deploy` = `vite build && vitest run && wrangler d1 migrations apply pml --remote && wrangler deploy`. That is why this story must not “just deploy to try the table”
- React `^19.2.7`, Vite `^8.1.0`, Vitest `~4.1.10`, Zod `^4.4.3`. **No lucide in package.json. Do not add it**

### What this story changes vs what must be preserved

| File | Today | This story | Must preserve |
|---|---|---|---|
| `ApexShell.tsx` | Poll comment after KpiRow | `<PollPanel />` there | Provider wrap ends after `#entities`; `#cert` is CertBoard; `#trust`/`#ops` EmptyState |
| `publicRouter.ts` | Poll reserved → unmatched 404 | POST votes + GET results | Other F1 GETs still `jsonOk`/`jsonList`; `/api/administrivia` still reserved |
| `respond.ts` / `errors.ts` | GET cache + 404/400/405/500 | no-store poll helper; 409 conflict | Do not make all public GETs no-store |
| `pml.css` | No `.poll` | Port handoff poll CSS + 820px | Existing 940px `.f1,.board,.cases,.ent,.cert` block |
| `publicApi.test.ts` / `server.test.ts` | Poll 404 pins | Real poll contract | Admin/agents 403 perimeter |
| `cert/cert.test.tsx` | Forbids `poll` in CertBoard | **Untouched** | |
| `ApexF1Context.tsx` | Four axes | **Untouched** | No poll axis |
| Masthead / KpiRow | children slot | Poll as sibling of KpiRow | One `<h1>` |

### Anti-patterns (HALT)

- `POLL_BASE` / `localStorage.setItem("pml.poll.v1")` as the production tally
- Footer “stored locally; nothing is sent anywhere”
- `npm install lucide` / `lucide-react`
- Canvas fingerprint, IP column, reader accounts, Access on POST
- Reusing `jsonOk` (60s public cache) for results or votes
- Putting `#poll` in `#cert`, wrapping poll in `ApexF1Provider`, or `?poll=`
- Toggle-off votes (prototype does this; FR44 is one vote per browser)
- Painting `%` bars before `voted`
- Editing 0001–0004; live `wrangler deploy` / `migrate:remote`
- Shipping 2.10 donations / correction form
- Changing CertBoard caveat or adding poll chrome there

### Project Structure Notes

- Poll surface: `src/surfaces/apex/poll/` — not `src/shared/ui/`, not architecture’s `pages/` sketch
- Repo + schema live under `src/shared/db/repos/` and `src/shared/schemas/` like 2.1
- CSS tokens in `src/shared/ui/pml.css` only
- Detected variance: architecture directory sketch still mentions `pages/`; v1 is one long-scroll page. Handoff poll breakpoint is **820px**, F1 boards are **940px** — keep both

### Previous story intelligence (2.8)

- Surface-local folder + pure `*View.ts` + `useEffect` fetch + co-located `*.test.tsx` + `shells.test.tsx` EmptyState count
- Fail closed; loading copy must not report a finding
- Client guards are hand-copied sets / `import type` so Zod stays off the client bundle
- Do not fold a new fetch into `listsReady`
- UI tests stay `renderToStaticMarkup`; no new test harness
- Review patches: layout-neutral copy; `role="list"` where `list-style: none`; pin success-path strings the AC names
- Do not live-deploy

### Git intelligence

- Last commits: `8e192cb` 2.8 cert signal (#8); `6677e2b` 2.7 entity ledger (#7); `3b86914` 2.6 issue map (#6)
- Pattern: replace one placeholder, port handoff CSS, pin with mocks, leave later bands EmptyState
- This story is the **first public POST** and the **first D1 migration since 2.1**. Closer to 2.1 (schema + router) plus 2.2 (Masthead child) than to 2.8 (UI-only)

### Latest tech information

- Workers: parse `Cookie` by hand; `Set-Cookie` on the POST response. `credentials: 'same-origin'` on `fetch` so the HttpOnly cookie round-trips. `crypto.randomUUID()` is available
- D1: `INSERT` + `UNIQUE(voter_token)`; on conflict 409 unless payload matches (idempotent retry). Always `.bind(?)`
- React 19: `useEffect` + AbortController. Do not use `use()` for this fetch
- Zod 4 on the Worker. Client: `import type` + copied value sets
- Cookie: `SameSite=Lax` is the CSRF baseline for this same-origin POST. Do not add a CSRF token library. Do not use `__Host-` (localhost HTTP)

### Project context reference

No `project-context.md` is present. Carry architecture.md + the 2.1–2.8 story files as the implementation constitution.

### References

- [Source: epics.md#Story-2.9] L508–522 — user story + ACs
- [Source: epics.md] FR44 (L119, L261), UX-DR13 (L190), UX-DR8 section order (L180), NFR11 (L145), A7 (prd L618)
- [Source: architecture.md] Reader poll tally (L707) — `POST /api/poll/votes`, `GET /api/poll/results`, `poll_votes`; Frontend-routing-clarification (L711–713)
- [Source: ux-designs/design_handoff_pml/README.md] Reader poll (L141–145); Lucide note (L290) — **inline the paths, do not add the package**
- [Source: ux-designs/design_handoff_pml/PML Tracker.html] `#poll` (~613–644), CSS (~37–81), JS (~2425–2473)
- [Source: 2-1-f1-data-model-apis-case-law-seed.md] reserved poll 404; `deploy` runs `migrate:remote`; enum CHECKs required because Zod is not in the SQL seed path
- [Source: 2-8-qualitative-cert-signal.md] `#cert` outside provider; CertBoard forbids `poll`/`%`; remaining EmptyStates trust/ops
- [Source: deferred-work.md] 2.8 seed `methodNote` / nav label — not this story

## Open Questions for Patrick (do not block implementation)

1. **Footer “stored locally”?** Implemented as dropped (it would be false). Say if you want a replacement clause that names the cookie/D1 tally in plain language.
2. **Locked first vote vs prototype toggle?** Implemented as first write wins (FR44). Say if a later story should allow changing the term.
3. **Empty tally copy?** `0 readers have called it. Vote to see the split.` is honest. Say if you want different zero-state wording.

## Dev Agent Record

### Agent Model Used

deepseek/deepseek-v4-pro-0813

### Debug Log References

- Preflight: HEAD `8e192cb` (Story 2.8 with `CertBoard`), `git log -1 --oneline` = "8e192cb story 2.8: qualitative certiorari signal from GET /api/cert-signal (#8)".
- Preflight: `npm test` green at baseline — 395 tests, 16 files. After this story: 410 tests, 17 files (all passing).
- Preflight: `npm run check` does NOT exit 0 at baseline `8e192cb`. Two pre-existing failures, both in cert files the story marks "Untouched": (1) `oxfmt --check` flags a >80-col `toContain(...)` line in `src/surfaces/apex/cert/cert.test.tsx`; (2) `oxlint` flags `jsx-a11y(no-redundant-roles)` on the `role="list"` `<ul>` in `src/surfaces/apex/cert/CertBoard.tsx`. Neither was introduced by this story; all files touched by this story pass `oxfmt --check`, `oxlint`, and `tsc` cleanly.
- Confirmed the 2.1/1.4 placeholders before rewriting: `publicApi.test.ts` "does not claim /api/poll/votes" and `server.test.ts` AC5 POST 404 were replaced with the real poll contract (both pre-changes were verified by reading `publicRouter.ts` `isReservedPublicPath` + the GET/HEAD-only guard).
- `npm run migrate:local` applied `0005_poll_votes.sql` (4 commands). `wrangler deploy --dry-run` succeeded (Worker bundle: env.DB D1 + env.AI + ChatAgent DO).

### Completion Notes List

- Added `migrations/0005_poll_votes.sql`: durable `poll_votes` table (TEXT id PK, `UNIQUE` `voter_token`, `cert` CHECK, nullable `term` CHECK, strict ISO-8601 `created_at`/`updated_at`). No IP, no score, no FK to `cert_signals`. 0001–0004 untouched.
- Added `src/shared/schemas/poll.ts` (Zod `.strict()` vote body + results DTO with `cert`/`terms` counts null-when-unvoted/un-picked) and `POLL_CERT_VALUES`/`POLL_TERM_VALUES` in `vocabulary.ts`.
- Added `src/shared/db/repos/pollVotesRepo.ts` (`insertVote`, `setTermIfNull`, `getByToken`, `tally`; prepared `?` binds only; `voter_token` never leaves the repo).
- `errors.ts`: added `conflict()` → 409. `respond.ts`: added `jsonNoStore` + `NO_STORE_HEADERS` (poll GET/POST never use `jsonOk`'s 60s public cache).
- `publicRouter.ts`: removed `/api/poll` from the reserve list; added `POST /api/poll/votes` (public, no-store, `Set-Cookie: pml_poll` HttpOnly/SameSite=Lax/Max-Age + Secure iff https, idempotent re-vote 200, changed cert/term 409) and `GET /api/poll/results` (no-store, hides counts without a cookie). `GET /api/poll/votes` → 405 allow POST; unknown `/api/poll/:x` → envelope 404.
- Added the `src/surfaces/apex/poll/` surface (`pollView.ts` pure helpers, `usePoll.ts` useEffect+AbortController fetch with `credentials: same-origin`, `PollPanel.tsx` with injectable `results`/`status`/`onVote`). Wired `<PollPanel />` into `ApexShell` as a `Masthead` child after `<KpiRow />`, outside `ApexF1Provider`.
- Ported the handoff poll CSS into `pml.css` (`.poll` … `.pfoot`) with a separate `@media (max-width: 820px)` `.pgrid` block; left the existing 940px block and all other component classes untouched. Footer drops "stored locally; nothing is sent anywhere" and links `#cert`.
- Tests: `poll.test.tsx` (pure view + `renderToStaticMarkup` panels), `shells.test.tsx` #poll assertions, rewritten `publicApi.test.ts` poll contract, `server.test.ts` AC5 anon POST 200. `cert.test.tsx` untouched.

### File List

New:
- migrations/0005_poll_votes.sql
- src/shared/schemas/poll.ts
- src/shared/db/repos/pollVotesRepo.ts
- src/surfaces/apex/poll/PollPanel.tsx
- src/surfaces/apex/poll/pollView.ts
- src/surfaces/apex/poll/usePoll.ts
- src/surfaces/apex/poll/poll.test.tsx

Modified:
- src/shared/schemas/vocabulary.ts
- src/shared/api/errors.ts
- src/shared/api/respond.ts
- src/shared/api/publicRouter.ts
- src/surfaces/apex/ApexShell.tsx
- src/shared/ui/pml.css
- src/surfaces/shells.test.tsx
- src/shared/api/publicApi.test.ts
- src/server.test.ts

## Change Log

- 2026-09-03: Code review (Blind Hunter / Edge Case Hunter / Acceptance Auditor, triaged): 9 patches applied — usePoll in-flight ref guard + panel pending/disable state (double-click two-token race, silent 409 dead-ends); term buttons grant-only + locked after pick; `setTermIfNull` returns `meta.changes` so a lost first-write race 409s instead of 200-ing with an unstored term; content-length cap (1 KiB) before `request.json()`; `percentSplit` largest-remainder so bars sum to 100; `TERM_LABELS` derived from `POLL_TERMS`; migration trailing newline. Tests +4 (term follow-up/409, oversized body 400, percent sums, disabled semantics) → 414 passing; tsc 0. One finding deferred/accepted (unthrottled anonymous inserts — Patrick). Story → done.
- 2026-09-03: Implemented reader cert poll & tally API (Story 2.9) — D1 `poll_votes` migration, `POST /api/poll/votes` + `GET /api/poll/results`, `#poll` Masthead panel, ported CSS, rewritten poll contract tests. Status → review.
- 2026-09-02: Story context created from Epic 2 / FR44 / UX-DR13 / handoff poll / Stories 2.1–2.8 (ready-for-dev)
