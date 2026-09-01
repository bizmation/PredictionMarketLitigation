---
baseline_commit: ee5a3b2
---

# Story 2.1: F1 Data Model, APIs & Case-Law Seed

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a reader (via the tracker),
I want approved litigation entities loaded from a real store with seed content,
so that apex views can show trustworthy, structured data instead of hard-coded HTML mocks.

## ⚠️ Read this before writing any code

**This is the first story that touches D1, and the first that adds a public `/api/*` route.** Three things will bite you, and only one of them is caught by tests:

1. **Public `/api/*` routes will return `index.html`, not JSON, in production** unless you add them to `run_worker_first` in `wrangler.jsonc`. The test pool has no asset layer, so **every test will pass while production is broken.** See Task 5.
2. **`banned` is a value in TWO different enums** and they mean different things. Conflating them corrupts the data model at its root. See "The vocabulary trap".
3. **The controlled vocabularies already exist in shipped code.** Do not invent new ones. See "Reuse, do not reinvent".

## Acceptance Criteria

1. **Given** the Cloudflare app from Epic 1, **when** D1 migrations and Zod schemas are added for circuits, states (incl. operational status, posture, per-platform breakdown, sources, `updated_at`), cases (docket events, issue tags, party role, lifecycle), entities/platforms, and cert signal, **then** `wrangler d1 migrations apply` runs clean against both local and remote
2. **And** a seed script/migration loads illustrative data from the case-law surveys in `docs/research/` (realistic captions/states; **not** claiming production freshness until the pipeline exists)
3. **And** read-only public REST endpoints return these entities as JSON validated by Zod, in the architecture's envelopes — list `{ items, nextCursor? }`, single resource bare, error `{ code, message, details? }`
4. **And** every seeded published claim carries a provenance label + publish/last-updated timestamps (FR18 seed)
5. **And** no Draft/Run tables are required yet (those come in Epic 3)
6. **And** untracked vs tracked-unsettled states are distinguishable in the schema — "we have no data" must never render as "we looked and found nothing concerning"

## Tasks / Subtasks

- [x] **Task 1: Preflight** (AC: all)
  - [x] Confirm baseline green: `npm test` → **218 tests / 7 files / exit 0 / zero cloud credentials**. That last clause is load-bearing and survives this story — D1 tests run against Miniflare, never the real database
  - [x] Confirm `npm run check` exits 0 and `npm ci` exits 0
  - [x] Confirm `env.DB` is referenced nowhere in `src/` yet (`grep -r "env.DB" src/`). This story is its first consumer
  - [x] Read `docs/research/aug926-prediction_markets_case_law_survey.md` (largest and most current, 120 KB) plus the June survey for the seed corpus. **Do not invent case captions** — every seeded case must trace to a survey

- [x] **Task 2: Canonical enums in `src/shared/schemas/`** (AC: 1, 6)
  - [x] Create `src/shared/schemas/vocabulary.ts` as the single source of truth for the controlled vocabularies, defined as Zod enums
  - [x] **Import the exact string sets from the shipped UI types — do not retype them from memory.** They are already correct and already rendered:
    - `Posture` — `src/shared/ui/PostureSwatch.tsx:15` → `untracked | platform | pending | state | banned`
    - `OperationalStatus` — `src/shared/ui/StatusBadge.tsx:11` → `go | restricted | banned`
    - `ProvenanceKind` — `src/shared/ui/ProvenanceLabel.tsx:12` → `human | agent`
  - [x] **Invert the dependency**: the Zod enum becomes canonical, and each UI component imports its type from `shared/schemas/vocabulary.ts` instead of declaring its own. Architecture is explicit that `src/shared/schemas` is canonical [Source: architecture.md#Enforcement-Guidelines]. Two definitions of `Posture` that can drift is the failure this prevents
  - [x] Add a test asserting the Zod enum members equal the UI's rendered label keys (`POSTURE_LABELS`), so adding a posture without a label fails the build rather than rendering `undefined`
  - [x] **Do not add new vocabulary values.** If the surveys need a posture that does not exist, stop and flag it — the ramp is a UX-DR2 design decision, not an implementation detail
    - Note: `operational_status` gained `unknown` (Patrick, 2026-08-11) for AC6 absence — deliberately not a posture value; Minnesota stays `restricted` without a fourth judgement value

- [x] **Task 3: D1 migrations** (AC: 1, 5, 6)
  - [x] Create `migrations/` at repo root. It does not exist yet; `wrangler.jsonc` already declares `"migrations_dir": "migrations"`, so no config change is needed
  - [x] `migrations/0001_f1_core.sql` — tables per the schema sketch in Dev Notes. `snake_case` plural tables, `snake_case` columns, `id` TEXT primary keys, `<entity>_id` FKs, `idx_<table>_<cols>` indexes [Source: architecture.md#Naming-Patterns]
  - [x] Store enum values as the **PRD glossary strings verbatim** — `go`, `restricted`, `banned`. No integer codes, no abbreviations
  - [x] Timestamps stored as ISO 8601 UTC strings with `Z`, not unix integers [Source: architecture.md#Format-Patterns]
  - [x] **Create NO `drafts`, `runs`, or `evidence_events` tables** — Epic 3 owns those. **No `poll_votes`** — Story 2.9's migration owns it. **No `submissions`** — Story 4.5's
  - [x] Booleans as INTEGER 0/1 in D1, coerced at the Zod boundary [Source: architecture.md#API-Response-Formats]
  - [x] Fresh local migration apply → 33 schema + 212 seed + 28 source-correction + 10 URL-hardening commands, ✅
  - [x] `--remote` apply — held until the seed and review fixes passed, then both migrations applied successfully on 2026-08-31

- [x] **Task 4: Zod schemas + repos** (AC: 1, 3)
  - [x] `src/shared/schemas/` — `circuit.ts`, `state.ts`, `caseSchema.ts`, `entity.ts`, `certSignal.ts`. `PascalCase` + `Schema` suffix (`StateSchema`, `CaseSchema`) [Source: architecture.md#Code-Naming-Conventions]
  - [x] `src/shared/db/client.ts` + `src/shared/db/repos/{statesRepo,casesRepo,circuitsRepo,entitiesRepo,certSignalRepo}.ts`
  - [x] **The snake_case → camelCase mapping happens in the repo layer and nowhere else.** `operational_status` → `operationalStatus`. Never leak `snake_case` to the public API [Source: architecture.md#Data-Exchange-Formats]
  - [x] `src/shared/api/errors.ts` + `src/shared/api/respond.ts` — the `{ code, message, details? }` envelope and list/single helpers. **Reuse the existing envelope shape** already used by `requireOperator` in `src/shared/lib/adminGuard.ts:122` so the API speaks one error dialect
  - [x] No direct browser → D1. All access through Worker routes → repos [Source: architecture.md#API-Boundaries]

- [x] **Task 5: Public REST routes — AND the `run_worker_first` fix** (AC: 3)
  - [x] Add read-only routes in `src/server.ts`: `GET /api/circuits`, `/api/states`, `/api/states/:code`, `/api/cases`, `/api/cases/:id`, `/api/entities`, `/api/cert-signal`. Plural, no trailing slash, query params `camelCase` [Source: architecture.md#API-Naming-Conventions]
  - [x] **CRITICAL — add the public API prefix to `run_worker_first` in `wrangler.jsonc` AND `wrangler.test.jsonc`.** Already widened to `/api` + `/api/*`
  - [x] Order matters in the fetch handler: `isAdminApiPath` and `isAgentsPath` must still be evaluated **before** any public `/api/*` matching
  - [x] **Regression guard, non-negotiable:** `/api/administrivia` must stay unguarded-and-not-matched, and `/api/poll/votes` must keep returning 404 (Story 2.9 owns it)
  - [x] Public GETs are cacheable; admin responses are not. **Do not** apply `ADMIN_CACHE_HEADERS` to public routes
  - [x] Errors map to `{ code, message }` at the route edge, no stack or secret leakage

- [x] **Task 6: Seed from the case-law surveys** (AC: 2, 4)
  - [x] `migrations/0002_seed_f1.sql`
  - [x] `migrations/0003_source_fit_corrections.sql` preserves immutable remote history while correcting source-to-claim mismatches found by the delayed post-review audit
  - [x] `migrations/0004_prefer_official_primary_urls.sql` replaces third-party mirrors with official court/agency-hosted copies where available
  - [x] Every seeded row carries `provenance_kind = 'human'`, publish timestamp, and `updated_at`
  - [x] **The seed must not claim production freshness.** Fixed stamp `2026-08-09T16:00:00.000Z`
  - [x] Every state/posture claim links to ≥1 primary source (FR2)
  - [x] Seed covers surveyed states + platforms + circuits; all 50 states + DC present (untracked → `unknown`)
  - [x] **Untracked states seeded as untracked, not omitted** (AC6)

- [x] **Task 7: Tests** (AC: all)
  - [x] D1 tests in the **`workers` project** with `applyD1Migrations` / `readD1Migrations` (Cloudflare Vitest D1 recipe)
  - [x] Schema / route / perimeter / AC6 round-trip coverage in `publicApi.test.ts` + vocabulary tests
  - [x] `npm test` green with **zero cloud credentials**

- [x] **Task 8: Finalize** (AC: all)
  - [x] `npm run check` exit 0
  - [x] `npx wrangler deploy --dry-run` clean *(live deploy + curl against production left for operator — `npm run deploy` runs migrate:remote then deploy)*
  - [x] `npm run migrate:remote` applied all four migrations; remote seed, source-fit corrections, and official URL replacements verified
  - [x] Build the File List from `git status` / diff
  - [ ] Single commit; do not push unless asked *(awaiting Patrick)*

### Review Findings — 2026-08-31

- [x] [Review][Patch] Implement nested rich payloads on the existing state and case detail routes — Patrick chose nested arrays; list routes remain summaries. Include platform statuses and sources for states, and sources, docket events, issue tags, affected states, and entities for cases, all validated by Zod.
- [x] [Review][Patch] Close every primary-source gap — Patrick chose to locate genuine court/agency records for each published claim and to drop or narrow a claim when no fitting primary record can be verified. A delayed source-fit audit caught primary records attached to the wrong claim; immutable migration `0003_source_fit_corrections.sql` corrects them and removes or narrows unsupported operational-status claims.
- [x] [Review][Patch] Store provenance and publish/last-updated timestamps on every claim-bearing row — Patrick chose row-level ownership for `entities`, `docket_events`, `issue_tags`, and all case relationship rows rather than inherited attribution.
- [x] [Review][Patch] Normalize controlled platform roles onto `case_entities` and remove case-level `partyRole` — Patrick chose per-entity roles so CFTC-v-state matters and multi-platform cases do not publish a false plaintiff/defendant assignment.
- [x] [Review][Patch] Add and classify `operational_status_basis` on every `state_platform_statuses` row — Patrick chose row-level basis because platform-specific evidence can differ from the state-wide basis.
- [x] [Review][Patch] Reopen remote migration acceptance and run it only after all review fixes pass — Patrick chose not to freeze the current in-place schema revision in production.
- [x] [Review][Patch] Reclassify secondary reporting and enforce Tier-1 docket-event sources [migrations/0002_seed_f1.sql:153]
- [x] [Review][Patch] Replace launch copy that says the completed data model and seed do not exist [src/surfaces/apex/LaunchNote.tsx:67]
- [x] [Review][Patch] Return 500 for internal failures and 400 for malformed encoded case IDs [src/shared/api/publicRouter.ts:81]
- [x] [Review][Patch] Validate cert-signal factors structurally and require valid JSON in D1 [src/shared/schemas/certSignal.ts:10]
- [x] [Review][Patch] Enforce real, fully anchored ISO dates in Zod and D1 [src/shared/schemas/common.ts:11]
- [x] [Review][Patch] Make seed/API tests non-vacuous and cover successful detail resources plus source integrity [src/shared/api/publicApi.test.ts:17]
- [x] [Review][Patch] Declare every single-column TEXT primary key NOT NULL [migrations/0001_f1_core.sql:43]
- [x] [Review][Patch] Pin `run_worker_first` parity and admin-path coverage in config tests [src/shared/lib/wranglerConfig.test.tsx:18]
- [x] [Review][Patch] Use `OwningTableSchema` and require valid source URLs [src/shared/schemas/caseSchema.ts:42]
- [x] [Review][Defer] Repository deploy still overwrites the out-of-tree production landing page [package.json:20] — deferred, pre-existing

## Dev Notes

### The vocabulary trap — read twice

**`banned` exists in two different enums and means two different things.**

| Enum | Values | Question it answers |
|---|---|---|
| `Posture` | `untracked` \| `platform` \| `pending` \| `state` \| `banned` | Which way did the *litigation* come out? |
| `OperationalStatus` | `go` \| `restricted` \| `banned` | Can a platform *operate there today*? |

A state can be `operationalStatus: "restricted"` while its `posture` is `pending`. These are independent axes and both live on the `states` table. Modelling them as one column, or reusing one enum for both, destroys the distinction the whole apex product exists to show. Name the columns `operational_status` and `posture` and keep them separate all the way to the JSON.

### Reuse, do not reinvent

Everything below already exists and is already shipped. Import it.

| Need | Already at | Note |
|---|---|---|
| Posture ramp + labels | `src/shared/ui/PostureSwatch.tsx` | `POSTURE_LABELS` is the rendered copy |
| Operational status | `src/shared/ui/StatusBadge.tsx` | glossary strings, stored verbatim in D1 |
| Provenance kinds | `src/shared/ui/ProvenanceLabel.tsx` | `human` \| `agent` |
| ISO → ET display | `src/shared/lib/dates.ts` | `formatEtDateTime`, `formatEtDate`. Storage stays ISO-UTC-`Z`; only presentation is ET |
| Error envelope | `src/shared/lib/adminGuard.ts:122` | `{ code, message }` — match it |
| Empty states | `src/shared/ui/EmptyState.tsx` | Story 2.7 requires it for platforms with no matters |
| Last-updated chrome | `src/shared/ui/LastUpdated.tsx`, `UpdatedBadge.tsx` | consumers of the timestamps this story stores |

**Zod is already a dependency at `^4.4.3`** (architecture-verified version) and already imported in `src/server.ts`. Do not add a validation library.

### Schema sketch (starting point, not a contract)

```
circuits(id, name, number, posture, summary, updated_at)
states(id, code, name, circuit_id, operational_status, posture,
       controlling_case_id, why_note, provenance_kind, published_at, updated_at)
state_platform_status(state_id, entity_id, operational_status, note)   -- AC1 "per-platform breakdown"
sources(id, owning_table, owning_id, url, title, tier, published_at)   -- FR2: ≥1 primary source per claim
cases(id, caption, court, docket_number, forum, party_role, lifecycle,
      posture, circuit_id, provenance_kind, published_at, updated_at)
docket_events(id, case_id, at, description, source_id)                 -- reverse-chron timeline (2.5)
issue_tags(id, label, slug)
case_issue_tags(case_id, issue_tag_id, is_controlling)                 -- "first/controlling in accent" (2.5)
case_states(case_id, state_id)                                         -- affected states (2.5)
entities(id, name, slug, role)                                         -- platforms (2.7)
case_entities(case_id, entity_id, role)
cert_signal(id, reading, factors_json, method_note, reviewed_at,
            approver, provenance_kind, updated_at)                     -- single current row (2.8)
```

Adjust as the surveys demand — but keep the join tables. Stories 2.4–2.7 all need many-to-many (a case affects several states; a platform appears in several cases), and retrofitting that after the seed lands is far more expensive than getting it right now.

### What later stories need from this one

| Story | Needs |
|---|---|
| 2.2 Orientation chrome | KPI figures from **aggregate queries**, not hard-coded — matters tracked, states, appeals pending, changed in 30 days |
| 2.3 Heat map | `posture` per state + circuit membership; `untracked` distinguishable |
| 2.4 Status board | sortable state/status/posture/updated; per-platform breakdown; `?state=NJ` deep link |
| 2.5 Case list | free-text search, posture, issue tag, state, circuit filters; docket timeline |
| 2.6 Issue map | issue × posture matrix, emergence timeline — needs `issue_tags` with dates |
| 2.7 Entity ledger | per-platform matter lists |
| 2.8 Cert signal | factors + last-review + approver |
| 2.9 Poll | **its own migration** — do not create `poll_votes` here |

### Previous story intelligence (1.5, and the Epic 1 arc)

- **`.dev.vars` is loaded into the Vitest environment.** It silently disarmed five tests in Story 1.4. Any test asserting rejection must construct its own env — see `src/server.test.ts:30` (`anon`/`authed`).
- **A JWKS-style module-level cache burned a test in this very repo.** `access.ts` caches per team domain for the isolate's lifetime, which made a test pass for the wrong reason for two stories. If you add any module-level cache to the repo layer, ask what a second test in the same isolate will see.
- **Verify claims by running them.** Story 1.3 claimed 61 green tests and a passing check; neither reproduced. Read exit codes, not summary lines.
- **`npm run deploy` now runs the full test suite as a gate** (`vite build && vitest run && wrangler deploy`). A failing test blocks the deploy — that is deliberate, do not route around it.
- **There is no CI.** Workers Builds was dropped in Story 1.5; `main` does not auto-deploy. Deploys are manual and local. Nothing will catch a mistake for you after the fact.
- **`npm run check` covers markdown and JSON**, not just source. It regressed late in Story 1.5 for exactly this reason.
- **Two Vitest projects:** `workers` for `*.test.ts` (workerd, has D1, no fs), `ui` for `*.test.tsx` (node, has fs, no bindings).

### Current code state (verified at `ee5a3b2`)

- `src/server.ts` — `ChatAgent` DO + a `fetch` handler that guards `isAgentsPath`, then `isAdminApiPath` (with a `GET /api/admin/session` handler), then falls through to `routeAgentRequest` and a bare 404. **Your public router goes after the two guards and before the fallthrough.**
- `src/shared/lib/` — `access.ts`, `adminGuard.ts`, `dates.ts`, `surface.ts`. No `db/`, no `schemas/`, no `api/` yet — all three are new in this story.
- `wrangler.jsonc` — D1 `pml` bound as `DB`, id `d07713fe-d0f1-4708-a174-394b04fc01b9`, `migrations_dir: "migrations"` already declared. `run_worker_first` covers `/agents`, `/agents/*`, `/oauth/*`, `/api/admin`, `/api/admin/*` — **and nothing else.**
- The D1 database exists and has **0 tables**. This story creates the first.
- `docs/research/` holds the three case-law surveys (268 KB total) — the seed corpus.

### Architecture requirements binding this story

- **Data (LOCKED):** D1 is canonical for F1 entities; DO is in-flight Run state only [architecture.md#Data-Architecture]
- **Validation:** Zod shared schemas as source of truth, canonical in `src/shared/schemas` [#Enforcement-Guidelines]
- **Migrations:** Wrangler D1 migrations from day 1, in `migrations/` [#Structure-Patterns]
- **API envelopes:** single = bare JSON; list = `{ items, nextCursor? }`; error = `{ code, message, details? }` [#API-Response-Formats]
- **Boundary:** DB `snake_case` ↔ API `camelCase`, mapped in the repo layer [#Data-Exchange-Formats]
- **Dates:** ISO 8601 UTC with `Z` [#Format-Patterns]
- **Write path:** only the Approval Gate publishes live F1 — but no gate exists yet, so this story's seed is the one sanctioned bulk write. Do not build a general-purpose write API [#Write-path-rules]
- **Boundaries:** `surfaces/*` may import `shared/*`, never `pipeline/*` [#Component-Boundaries]

### Scope boundaries (do NOT do in this story)

- **No UI.** Stories 2.2–2.10 own every apex view. This story ends at JSON.
- **No `poll_votes`** (2.9), **no `submissions`** (4.5), **no `drafts`/`runs`/`evidence_events`** (Epic 3)
- No AI Gateway, no agents, no pipeline code
- No write endpoints — read-only public REST only
- No TopoJSON/geo assets (2.3 owns `public/geo/`)
- Do not touch `ChatAgent` internals or the admin/agents guards beyond adding the public router alongside them
- Never touch `_bmad/`, `.claude/`, `.agents/`, or `_bmad-output/` except this story file and `sprint-status.yaml`

### Testing standards summary

- Vitest ~4.1.10, two projects; baseline **218 tests / 7 files / exit 0 / zero cloud credentials**
- D1 tests use `applyD1Migrations` from `cloudflare:test` against Miniflare — never the real database, never credentials
- This story's bar: every endpoint gets a shape test and a not-found test; the admin/agents perimeter gets a regression test proving the new router did not open it
- `wrangler deploy --dry-run` validates config; **only a real `curl` against the deployed domain validates `run_worker_first`**

### References

- [Source: epics.md#Story-2.1] lines 378–392 — story + ACs
- [Source: epics.md] 394–539 — Stories 2.2–2.10, the consumers of this schema
- [Source: architecture.md] 169–177 (data), 188–196 (API), 296–310 (naming), 318–350 (structure/format), 377–381 (write path), 412–509 (directory tree), 513–531 (boundaries), 700–721 (post-epics amendments)
- [Source: docs/research/] three case-law surveys — the seed corpus
- [Source: _bmad-output/implementation-artifacts/1-5-deploy-pipeline-environments.md] — deploy gate, no-CI decision, test-isolation traps
- [Cloudflare: D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/) · [vitest-pool-workers D1](https://developers.cloudflare.com/workers/testing/vitest-integration/) · [run_worker_first](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)

## Open Questions for Patrick (do not block implementation)

1. **Seed breadth.** Minimum viable is the states the surveys actually cover. Do you want all 50 states seeded as `untracked` so the map renders complete on day one, or only tracked states until the pipeline fills the rest?
2. **Cert signal shape.** Story 2.8 needs factors with "bold leads + explanations". Store as a JSON column, or a `cert_signal_factors` table? JSON is faster now; a table is queryable later.
3. **`nextCursor` today or later?** The architecture specifies it, but the seed is small enough that no endpoint will paginate. Ship the field unused, or omit until a list actually needs it?

## Review Findings — code review 2026-08-11 (Blind Hunter · Edge Case Hunter · Acceptance Auditor)

Run against the working tree at baseline `ee5a3b2` with Tasks 1–3 complete and 4–8 unstarted. All three layers completed; none failed. ~60 raw findings → deduplicated to the below. **9 dismissed** (mostly restatements of "Tasks 4–8 are unstarted", which was scoped out, plus two false positives about `wrangler.test.jsonc` needing changes it does not).

Severity is by consequence for the reader of a public litigation tracker, not by theoretical worst case. On this project, "renders an unfounded legal claim as fact" is `high` regardless of how small the code change is.

### RESOLVED during the review (all were live in production)

- [x] **[HIGH][blind+auditor] Landing copy asserted four unsourced quantitative claims, and stated the litigation direction backwards.** `LaunchNote.tsx` said Kalshi, Polymarket, Robinhood and Coinbase "are being sued by state gaming regulators" — the dominant federal pattern is the reverse (`KalshiEX v. Flaherty`, `v. Martin`, `v. Schuler`, `v. Orgel`, `v. Cox` are all platform-as-plaintiff on preemption). It also asserted "roughly nineteen states / six federal circuits / no split resolved yet" with no source, twelve lines above a paragraph explaining that mock content is forbidden *because a reader cannot tell a mock from a finding*. **Fixed and deployed** (`cef4d538`): rewritten as the two-directional dispute, all counts removed, with a comment forbidding quantitative claims in that JSX.
- [x] **[HIGH][edge+auditor] `className="why"` rendered completely unstyled.** `pml.css` defines `.why` only as `.sec-head .why`. Both LaunchNote paragraphs were direct children of `.wrap`, so they shipped as full-bleed unstyled body text — and the file's own header claimed "styled entirely with existing classes". **Fixed and deployed** (`ad738aee`): switched to `.muted`, which is standalone-styled, with a comment naming the trap.
- [x] **[HIGH][auditor] Copy credited a governance control that does not exist.** "the operator gate that means no machine can publish here on its own" — there is no publish path at all, for human or machine, so the gate is not what prevents it. **Fixed:** now states plainly that no publishing path exists yet. Also fixed present-indicative "is published next door on ops." → "**will be** published".
- [x] **[HIGH][auditor] AC6 failed on the second axis — `operational_status` forced every state into an affirmative legality claim.** `posture` had `untracked`, but `operational_status` was `NOT NULL` with only `go | restricted | banned`. ~31 states appear nowhere in the corpus and would have had to be seeded `go`, which `pml.css:274` renders **green** — a green GO badge beside a "No tracked activity" swatch, i.e. AC6's exact prohibition. **Resolved by decision (Patrick, option B):** added `unknown`, styled dashed-and-uncoloured to match UX-DR2's treatment of absence. Deliberately not named `untracked` — that string is already a `Posture` member and a second cross-enum overlap would worsen the axis confusion this module exists to prevent.
- [x] **[HIGH][blind+edge] Nothing applied the migration automatically.** Wrangler runs it fine (`wrangler d1 migrations apply pml --local` was run, 26 commands ✅) — the gap was pipeline, not capability: `npm run deploy` had no migrate step, so a deploy could ship a Worker against a database with no tables. **Fixed:** added `migrate:local` / `migrate:remote` scripts, and `deploy` now migrates before deploying so new code never meets an old schema.
- [x] **[MEDIUM][edge] No test tied enum values to stylesheet rules.** Both `StatusBadge` and `PostureSwatch` derive their CSS class from the raw enum string, so a new value without a rule renders unstyled — invisible except by eye. This is exactly how the `.why` bug reached production. **Fixed:** `trustComponents.test.tsx` now reads `pml.css` and asserts a rule exists for every `OPERATIONAL_STATUS_VALUES` and `POSTURE_VALUES` member.

### DECISION NEEDED — before the seed (Task 6)

- [x] **[HIGH][auditor] Story 2.6's emergence timeline** — **Resolved: added `cases.filed_at` / `decided_at`** in `0001_f1_core.sql` (nullable real-world dates).
- [x] **[MEDIUM][edge][Deferred to 2.2] `LaunchNote` renders unconditionally.** If any band is wired by Stories 2.3–2.8 *before* Story 2.2 deletes LaunchNote, "Nothing is published here yet" renders directly above real published findings. The ordering constraint is accepted: Story 2.2 owns the chrome and deletes `LaunchNote` before later tracker bands are wired.

### PATCH — fold into the DDL revision, before `migrate:remote`

- [x] **[HIGH][blind+edge+auditor] No `CHECK` constraint on any enum column.** The seed lands as raw SQL via `wrangler d1 migrations apply`, so **Zod is never in the write path**. `posture='GO'`, `operational_status='pending'`, `provenance_kind='system'` all insert cleanly, and `StatusBadge` interpolates the raw string into both the CSS class and the visible text — a corrupted value renders a wrong legal status. This is what makes "vocabulary.ts is canonical for D1 and the UI alike" a comment rather than a mechanism. One `CHECK (col IN (…))` per column.
- [x] **[HIGH][blind+edge+auditor] `state_platform_status` claims are structurally unsourceable.** It carries the most legally specific claim the product makes ("legal for Kalshi, not for Polymarket") with no `provenance_kind` and no `published_at`, and `sources.owning_table` does not list it as a valid owner — so those rows *cannot* link to a source at all, violating FR2. Its composite PK also leaves no `owning_id` to point at. Needs a surrogate `id`, provenance columns, and admission to `owning_table`. `circuits` has the same provenance gap on `posture` / `has_split`.
- [x] **[MEDIUM][blind+edge] `docket_events.source_id` is nullable and untiered** while `ApexShell.tsx:143` already promises readers "Every docket event will link to a Tier-1 source."
- [x] **[MEDIUM][blind+edge+auditor] Three enum-shaped columns exist only as SQL comments** — `forum`, `sources.owning_table`, `cert_signal.reading`. No Zod enum, no test, no type. `forum` is load-bearing for Story 2.2's "appeals pending" KPI and its four values were invented here, traceable to no spec source.
- [x] **[MEDIUM][edge] Timestamp format unconstrained.** `'2026-08-12 10:00:00'` (space, no `Z`) sorts before `'…T…'` and makes `formatEtDateTime` return "Invalid Date". Mixed precision is worse: `'.'` < `'Z'`, so `…00.500Z` sorts *before* `…00Z`.
- [x] **[MEDIUM][edge+auditor] `cert_signal` has no singleton constraint** — a second row makes "which reading is live?" undefined for Story 2.8.
- [x] **[MEDIUM][edge] `states.code` / `entities.slug` UNIQUE is BINARY-collated** — `'ca'` and `'CA'` both insert, producing one state listed twice with conflicting postures.
- [x] **[MEDIUM][edge] Two `case_issue_tags` rows can both be `is_controlling`** — Story 2.5 then renders two accent tags or an arbitrary one. `CREATE UNIQUE INDEX … ON case_issue_tags(case_id) WHERE is_controlling = 1` fixes it.
- [x] **[MEDIUM][edge] Migration is not transaction-wrapped** — Wrangler's D1 migration runner splits the SQL and executes the statements in one `db.batch()` transaction; a fresh local apply and the remote apply both completed atomically.
- [x] **[MEDIUM][edge] Decided postures may carry no controlling authority.** `posture IN ('state','platform','banned')` with `controlling_case_id IS NULL` is an unsourced FR2 claim. Likewise `forum='federal-appellate'` with `circuit_id IS NULL` silently drops a case from the circuit-split view that exists to show it.
- [x] **[LOW][blind+auditor] Two tables are singular** — `state_platform_status`, `cert_signal` — under a header asserting the naming rule is followed "without exception", and `cert_signal` propagates the singular into `sources.owning_table` data.

### PATCH — code and tests

- [x] **[MEDIUM][blind] Two comments assert coverage that does not exist** — owner-existence triggers and a non-vacuous orphan-source test now enforce the polymorphic source invariant; a partial unique index enforces at most one controlling tag.
- [x] **[MEDIUM][blind+edge] Three new vocabularies are unpinned and unconsumed** — their literal memberships are pinned in `vocabulary.test.ts`, and the D1/API schemas consume them.
- [x] **[MEDIUM][blind+edge] `run_worker_first` parity between the two configs is untested** — parity plus `/api`, public API, admin-session, and OAuth bare-path coverage are pinned in `wranglerConfig.test.tsx`.
- [x] **[MEDIUM][edge] `/oauth` bare path is absent from `run_worker_first`** — added to both Wrangler configs and covered by the routing test.
- [x] **[MEDIUM][edge+auditor] Unhandled `/api/*` returns bare-text 404** — owned public API paths now return the architecture error envelope while explicitly reserved paths remain unmatched.
- [x] **[MEDIUM][blind] `ApexShell` renders a hardcoded `LastUpdated at="2026-08-10…"`** — aligned to the sanctioned seed's fixed 2026-08-09 publication snapshot; Story 2.2 replaces this temporary chrome with data-derived freshness.
- [x] **[MEDIUM][blind+edge] Three LaunchNote tests are vacuous.** Launch-specific copy assertions now render `LaunchNote` directly, while the shell test pins the exact empty-state count.
- [x] **[MEDIUM][blind+auditor] `LaunchNote` hand-rolls `EmptyState`'s exact markup** — replaced with the shared `EmptyState` primitive.
- [x] **[LOW][edge] `ProvenanceLabel` falls through to the human branch** — labels now come from an exhaustive `Record<ProvenanceKind, string>`.
- [x] **[LOW][edge][Deferred] `ops.` and `/admin` still have no `<h1>`** — pre-existing surface-outline work is recorded in the deferred ledger; Story 2.1 owns no UI for either surface.
- [x] **[LOW][blind] `wrangler.jsonc` carries two comments giving opposite instructions** — consolidated the guidance around parent paths, globs, and redundant-rule rejection.
- [x] **[LOW][auditor] Story bookkeeping** — corrected task/review checkboxes, final test counts, migration results, File List, and status.

### DEFER

- [x] **[MEDIUM][edge][Deferred] Brand the two colliding enums** — `PostureSchema.brand<'Posture'>()` / `OperationalStatusSchema.brand<'OperationalStatus'>()`. Real, but a wider cross-UI type refactor than this data/API story; recorded in the deferred ledger.
- [x] **[LOW][edge][Deferred to 2.5] No FTS index for Story 2.5's free-text case search.** Fine at seed scale; recorded for the story that implements search.
- [x] **[LOW][auditor][Deferred] FR9's "pending-primary label" third state** has no representation on `states` / `cases`. The current seed closes every primary gap; the future ingestion state remains recorded in the deferred ledger.
- [x] **[LOW][auditor] `run_worker_first` was widened ahead of the routes that justify it** — self-resolved when the public API routes landed in Task 5.

## Decisions taken mid-implementation (Patrick, approved 2026-08-11)

Both arose from reading the actual case-law corpus, and neither was anticipated by the ACs. Recorded here because each changes what the seed is allowed to assert.

### 1. Minnesota is `restricted`. No fourth `operational_status` value.

Minnesota enacted a felony ban (SF 4760) that took effect 1 Aug 2026, and a federal preliminary injunction blocked enforcement four days earlier. So the statute is real and the platforms are running.

- `go` hides a felony statute that is on the books and could be un-enjoined on appeal.
- `banned` is factually wrong about what a reader can do today, and this column answers exactly "is [platform] legal in [state] today?".
- `restricted` is the honest middle. The nuance lives in `why_note`, which Story 2.4 renders in the detail panel.

**No fourth enum value was added**, per this story's own Task 2 instruction. `StatusBadge` renders exactly three values with matching CSS and a hatch pattern for `restricted`; extending the ramp is a UX-DR3 design decision, not an implementation detail. If a future state needs `banned-but-enjoined` as a first-class value, that is a UX story, not a schema patch.

### 2. New column: `states.operational_status_basis` — `stated` | `inferred`.

The corpus states an operational status for only **three** of roughly nineteen substantively-covered states (Nevada, Illinois, Massachusetts). Every other value would be *derived from injunction posture* — a reasonable inference, but an inference.

On a tracker whose entire premise is that a reader can trust what it displays, seeding inference as fact is the precise failure mode the project exists to avoid, and AC2 forbids claiming freshness the sources do not support. One column keeps the distinction queryable rather than buried in prose, and lets Story 2.4 mark inferred rows visibly.

**Consequence for the seed:** every row carries its basis, and the `stated` rows are traceable to a specific sentence in a specific survey. Where a status is `inferred`, `why_note` must name the injunction it was inferred from.

### Related, already applied

- **`circuits.has_split` seeds `false`.** Survey [A] asserts an existing Third/Sixth Circuit split; it has conflated the *S.D. Ohio district* ruling with a Sixth Circuit ruling — its own table labels that column correctly. As of the corpus's latest coverage (2026-08-07) there is no federal appellate split: `Flaherty` is the only appellate merits holding.
- **Massachusetts is the row most likely to be seeded wrong.** Survey [A] never mentions the Feb 2026 Appeals Court stay, so following it alone produces a `banned` flag when platforms are in fact still operating pending SJC review. Seed `restricted` + `stated`.
- **The three surveys are not three sources.** Two of them are the same document at two points in time. Genuine corroboration exists only where the independent survey agrees with that pair — roughly 60% of extracted rows rest on a single document. The seed carries per-row source attribution rather than implying consensus.

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (claude-opus-5) — Claude Code session, with three research subagents (seed-corpus extraction, D1/vitest testing API, Workers asset-routing semantics)

### Debug Log References

- **The vocabulary lived in the UI, not in schemas.** Story 1.2 declared `Posture`, `OperationalStatus` and `ProvenanceKind` as hand-written union types inside the components that render them, while architecture designates `src/shared/schemas` canonical. Inverted rather than duplicated: the schema owns the values, the components `import type` from it and re-export for their existing call sites.
- **`import type` is load-bearing, not stylistic.** A value import of `vocabulary.ts` would drag zod into the client bundle for a type that is erased at compile time. Verified empirically: after the inversion the client bundle emitted the **same content hash** (`index-SXlhDgBw.js`) as the pre-change build — byte-identical, zero bytes added, and `grep` confirms no zod in `dist/client`.

### Completion Notes List

- **Task 1 — preflight green.** 218 tests / 7 files / exit 0, `npm run check` 0, `npm ci` 0, `env.DB` confirmed unconsumed (this story is its first consumer), `CLOUDFLARE_API_TOKEN` unset so the zero-credential invariant held from the start.
- **Task 2 — canonical vocabulary.** `src/shared/schemas/vocabulary.ts` now owns `Posture`, `OperationalStatus`, `ProvenanceKind`, plus `CaseLifecycle`, `PartyRole` and `SourceTier` that the DDL needed. 26 tests pin the membership *literally* rather than deriving it from the implementation — a test that computes its expectation from the code under test proves nothing.
- **The `banned` collision is pinned by test, not just by comment.** `banned` is a member of both `Posture` and `OperationalStatus` and means different things in each. Three tests assert the two enums stay independent: that they overlap on exactly `banned`, that `pending` satisfies only posture, and that `go` satisfies only operational status. If the two are ever merged, all three fail.
- **UI consistency is enforced at both levels.** `Record<Posture, string>` makes a *missing* label a compile error; four new runtime cases in `trustComponents.test.tsx` catch what the type cannot — an empty-string label and a stale extra key left after a value is removed from the ramp.
- **Task 3 — schema applies clean.** Fresh local apply completed both migrations (33 DDL commands + 212 seed commands). Remote D1 then applied both migrations after all review gates passed. Join tables (`case_states`, `case_entities`, `case_issue_tags`) are in from the start because Stories 2.4–2.7 all need many-to-many and retrofitting after a seed lands is far more expensive.
- **`sources` is polymorphic by `(owning_table, owning_id)`** because one court order is routinely the source for a case, a state and a circuit simultaneously. SQLite cannot declare that polymorphic FK directly, so owner-existence triggers enforce it and a non-vacuous test pins the behavior.
- **No numeric column on `cert_signal`, deliberately.** Story 2.8 requires an explicitly qualitative reading; adding a score column later is exactly how a qualitative signal quietly becomes a forecast.
- **2026-08-31 — Tasks 4–8 completed and review patches applied.** Public F1 REST router (`handlePublicApi`) after admin/agents guards; validated rich state/case detail payloads; Zod schemas + repos with snake→camel mapping; Vitest D1 via `readD1Migrations` + `applyD1Migrations` (Cloudflare recipe); source-integrity constraints and corrected primary records; seed `0002_seed_f1.sql` (13 circuits, 51 states incl. DC, 25 cases, 5 entities, one cert signal). Final verification after source-fit follow-up: `npm test` **292 passed / 9 files**, `npm run check` 0, production build clean, and `wrangler deploy --dry-run` clean.
- **Delayed source-fit audit reconciled.** The audit's original 56-gap count inspected a pre-patch seed snapshot; re-auditing the current seed found narrower but real source-to-claim mismatches. Migration `0003_source_fit_corrections.sql` separates Flaherty merits/cert sources, fixes Connecticut and Arizona records, corrects docket dates, adds fitting docket sources, removes unsupported Illinois platform rows, and changes operational statuses to `unknown` where the primary record proves legal posture but not actual availability.
- **Official-primary URL hardening completed.** A later research pass found official-hosted copies for Massachusetts, Minnesota, New York, Wisconsin, Arizona, Tennessee, Utah, Nevada, and Michigan records. Immutable migration `0004_prefer_official_primary_urls.sql` replaces the corresponding mirrors without importing post–August 9 merits developments into the fixed snapshot.
- **Remote acceptance completed.** `npm run migrate:remote` applied migrations `0001`–`0004`. Read-only production-D1 queries verified the corrected URLs, docket events, narrowed statuses, and Illinois row removals. The Worker/site was not deployed.

### Change Log

- 2026-08-11: Tasks 1–3 (vocabulary, DDL, early review fixes).
- 2026-08-31: Tasks 4–8 — schemas, repos, public API, seed, Vitest D1, status → review.
- 2026-08-31: Adversarial review patches completed; local/remote migrations and all verification gates passed; status → done.
- 2026-08-31: Delayed source-fit audit reconciled; immutable correction migration applied locally and remotely; 292 tests pass.
- 2026-08-31: Official court/agency copies replaced available third-party mirrors via immutable migration `0004`; remote verification passed.

### File List

New:

- migrations/0001_f1_core.sql
- migrations/0002_seed_f1.sql
- migrations/0003_source_fit_corrections.sql
- migrations/0004_prefer_official_primary_urls.sql
- src/d1-env.d.ts
- src/shared/schemas/vocabulary.ts
- src/shared/schemas/vocabulary.test.ts
- src/shared/schemas/common.ts
- src/shared/schemas/circuit.ts
- src/shared/schemas/state.ts
- src/shared/schemas/caseSchema.ts
- src/shared/schemas/entity.ts
- src/shared/schemas/source.ts
- src/shared/schemas/certSignal.ts
- src/shared/db/client.ts
- src/shared/db/repos/circuitsRepo.ts
- src/shared/db/repos/statesRepo.ts
- src/shared/db/repos/casesRepo.ts
- src/shared/db/repos/entitiesRepo.ts
- src/shared/db/repos/sourcesRepo.ts
- src/shared/db/repos/certSignalRepo.ts
- src/shared/api/errors.ts
- src/shared/api/respond.ts
- src/shared/api/publicRouter.ts
- src/shared/api/publicApi.test.ts
- src/test/apply-migrations.ts
- src/test/test-env.d.ts
- src/surfaces/apex/LaunchNote.tsx
- _bmad-output/implementation-artifacts/2-1-f1-data-model-apis-case-law-seed.md

Modified:

- src/server.ts (public API router after admin/agents)
- vitest.config.ts (async `readD1Migrations` + TEST_MIGRATIONS binding)
- wrangler.jsonc / wrangler.test.jsonc (`run_worker_first` `/api` `/api/*`)
- package.json (`migrate:local` / `migrate:remote`; deploy runs remote migrate)
- docs/deploy-runbook.md
- src/shared/ui/PostureSwatch.tsx / StatusBadge.tsx / ProvenanceLabel.tsx (types from vocabulary)
- src/shared/ui/pml.css / DesignSystemGallery.tsx / trustComponents.test.tsx
- src/surfaces/apex/ApexShell.tsx / shells.test.tsx
- _bmad-output/implementation-artifacts/deferred-work.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
