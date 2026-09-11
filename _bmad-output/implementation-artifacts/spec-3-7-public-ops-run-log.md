---
title: 'Story 3.7: Public ops. Run Log'
type: 'feature'
created: '2026-09-11'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
baseline_revision: 58859984e42035323a66c9f96a90adde45776980
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `ops.` still shows a Story 3.7 EmptyState for the run log, so visitors cannot see harness attempts (including empty/failed/stopped) without a vendor console, and the trust bar still says the next run is unscheduled.

**Approach:** Fill the public `#runs` band from `GET /api/runs` (no login): recent Runs with id, status chip, timestamp, origin flag, mode, spend, step summary, approval outcome; show timezone + next noon-ET run; each row links to Evidence detail at `/runs/:id` (page is 3.8).

## Boundaries & Constraints

**Always:**
- No authentication on `ops.` HTML or `GET /api/runs` / `GET /api/schedule`.
- Reuse `RunStatusChip` + `OriginFlag`. Status chips are Run statuses (`published`, `awaiting`→awaiting-approval, `empty`, `failed`, `stopped`→budget-stopped, `rejected`). Catch-up/manual/scheduled are origin flags, not extra status chips (UX-DR6 is both components).
- Display the enforced schedule: timezone `America/New_York`, cadence daily **noon** ET (not the mock's 06:00), next instant from `nextRunAtUtc`. TrustBar `meta` replaces "Next run — not yet scheduled".
- Money stays integer cents on the wire; UI formats for display. Zero spend is a designed `$0.00` (or `0¢`), never blank.
- Newest-first (`started_at DESC`). Empty log keeps EmptyState. `running` rows are visible (label "running"; do not invent a seventh UX-DR6 chip).
- `surfaces/ops` imports `shared/*` only. Evidence href: `surfaceHref("ops", { path: `/runs/${id}`, dev })`.
- List envelope stays `{ items }` (architecture). Schedule is a separate singleton `GET /api/schedule`.

**Never:**
- No Evidence timeline, pending-drafts band, mode audit, filters, or CSV (3.8 / 3.9 / 3.13 / mock extras).
- No React router this story; do not implement `/runs/:id` page.
- No pipeline imports from surfaces. No live F1 writes. No Access on ops.
- No new D1 column for next-run (compute from the same function the cron uses). No edits to migrations `0001`–`0009`.
- Do not treat catch-up/manual as RunStatusChip values.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Empty log | `GET /api/runs` → `{ items: [] }` | `#runs` EmptyState; TrustBar still shows timezone + next run | N/A |
| Mixed Runs | published/awaiting/empty/failed/stopped/rejected; origins scheduled/catch-up/manual | All rows; matching chips + origin flags; newest first | N/A |
| Zero spend | `spendCents: 0` | Spend cell is a visible zero, not empty | N/A |
| No auth | ops host, no cookies | HTML 200; APIs 200 | N/A |
| Approval empty | no Draft `outcome` yet (pre-3.10) | Approval column designed "—" | N/A |
| Evidence link | row for `run-YYYYMMDD-xxxx` | href `/runs/{id}` on ops (dev: `?surface=ops`) | 3.8 owns the page |
| Fetch fail | `/api/runs` non-OK | Fail closed: EmptyState, no invented rows | Do not fake Runs |

</intent-contract>

## Code Map

- `src/surfaces/ops/OpsShell.tsx:56-86` -- REPLACE `#runs` EmptyState with a run-log table; REPLACE TrustBar `meta` from schedule fetch. Leave `#drafts/#mode/#layers/#journal` stubs.
- `src/surfaces/ops/RunLog.tsx` -- NEW -- fetch hook + `table.grid`: Run (id + `formatEtDateTime(startedAt)`), Outcome (`RunStatusChip`), Origin (`OriginFlag`), Mode (`hitl`/`yolo`), Steps (`eventCount`), Spend (cents), Approval (`approvalOutcome` or "—"). Row `href` Evidence.
- `src/surfaces/ops/runLog.test.tsx` -- NEW -- empty/mixed/zero-spend/unauth markup; no login chrome; links `/runs/:id`.
- `src/shared/ui/RunStatusChip.tsx:13-37` -- READ ONLY statuses; do not add catch-up/manual.
- `src/shared/ui/OriginFlag.tsx:9-16` -- READ ONLY origins.
- `src/shared/lib/dates.ts:34-39` -- `formatEtDateTime` for timestamps + next run.
- `src/shared/lib/surface.ts:90-104` -- `surfaceHref` for Evidence links.
- `src/app.tsx:19-22,49-51` -- READ ONLY; still render `OpsShell` (3.8 adds `/runs/:runId`).
- `src/shared/api/publicRouter.ts:271-272` -- KEEP `{ items }` list; ADD `GET /api/schedule` `{ timezone, nextRunAt }` (timezone = `RUN_SCHEDULE_TIMEZONE`, `nextRunAt` = `nextRunAtUtc()`).
- `src/shared/api/respond.ts:56-63` -- READ ONLY `{ items, nextCursor? }`.
- `src/shared/schemas/run.ts:58-71` -- KEEP `RunSummarySchema` (insert/detail). ADD `RunLogItemSchema` = summary + `eventCount` (int ≥ 0) + `approvalOutcome` (`approved`/`edited`/`rejected` or null). List items parse as `RunLogItemSchema`.
- `src/shared/db/repos/runsRepo.ts:96-102` -- `listRuns` returns `RunLogItem[]`: subquery evidence `COUNT(*)`; `approvalOutcome` = one Draft `outcome` if any else null.
- `src/shared/lib/schedule.ts` -- NEW -- `nextRunAtUtc` + ET-hour helpers (moved from pipeline).
- `src/pipeline/workflow/schedule.ts` -- RE-EXPORT `nextRunAtUtc` from `src/shared/lib/schedule.ts` so `dailyRun.ts` callers stay valid.
- `src/shared/schemas/vocabulary.ts:301-302` -- `RUN_SCHEDULE_TIMEZONE`.
- `src/shared/api/publicApi.test.ts:836-889` -- EXTEND: schedule shape; list `eventCount`/`approvalOutcome`; empty items still `[]`. First empty-list test stays first.
- `src/surfaces/shells.test.tsx:127-145` -- `#runs` remains; EmptyState only for still-unwired bands (not a hard-coded "No runs yet" when items exist).
- `_bmad-output/planning-artifacts/ux-designs/design_handoff_pml/PML Ops.html:167-196,388-394` -- column UX; ignore 06:00 cadence and sticky Evidence aside.

## Tasks & Acceptance

**Execution:**
- `src/shared/lib/schedule.ts` -- MOVE `nextRunAtUtc` out of `pipeline/workflow/schedule.ts` (re-export from there) -- one function for cron and public display
- `src/shared/schemas/run.ts` -- ADD `RunLogItemSchema` (`eventCount`, `approvalOutcome`) -- FR27 steps + approval on the list without breaking `insertRun`
- `src/shared/db/repos/runsRepo.ts` -- `listRuns` returns `RunLogItem[]` -- one public query, no N+1
- `src/shared/api/publicRouter.ts` -- ADD `GET /api/schedule`; list items are `RunLogItem` -- FR27 schedule + log row
- `src/surfaces/ops/RunLog.tsx` + `OpsShell.tsx` -- public table + TrustBar next-run -- the visitor surface
- `src/shared/api/publicApi.test.ts` -- schedule + list fields + empty log -- I/O matrix (API)
- `src/surfaces/ops/runLog.test.tsx` -- mixed chips/origins, zero spend, "—", `/runs/:id` links, fail-closed -- I/O matrix (HTML)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `3-7-public-ops-run-log` in-progress then done -- tracking

**Acceptance Criteria:**
- Given Runs in D1, when a visitor opens the ops. run log with no login, then they see recent Runs with id, status chip, timestamp, origin flag, mode, spend, step summary, and approval outcome
- Given those rows, when a status is published, awaiting, empty, failed, budget-stopped, or rejected, then the matching `RunStatusChip` renders, and catch-up/manual/scheduled render only as `OriginFlag`
- Given the enforced daily noon-ET rule, when the page loads, then timezone and next-run time are visible (TrustBar) and match `nextRunAtUtc`
- Given a row, when the visitor follows its Evidence link, then the href is `/runs/{runId}` on ops. (detail page remains 3.8)

## Spec Change Log

## Review Triage Log

### 2026-09-11 — Review pass
- verdicts: 25 findings — high 0, medium 8, low 10, false 7, maybe-false 0
- findings:
  - `[medium]` `[patch]` In-flight/failed `/api/runs` painted “No runs yet” — `useRunLog` now starts `null`; EmptyState only after a settled `[]`
  - `[medium]` `[patch]` `GET /api/schedule` `max-age=60` could serve a past noon — now `jsonNoStore`
  - `[low]` `[reject]` Unbounded `listRuns` with no `started_at` index / cursor — few Runs today; a 0010 index or cursor is extra surface
  - `[low]` `[reject]` No Zod `ScheduleSchema` — first-party singleton; invalid dates already render “Unknown date”
  - `[low]` `[reject]` Client `every(isRunLogItem)` blanks the table on one bad row — our list is schema-validated; per-row skip adds branches
  - `[low]` `[reject]` `RunLogItemSchema.parse` 500s the whole list — poison D1 rows are not an everyday write path
  - `[low]` `[reject]` Approval subquery uses `created_at` not `decided_at`; mixed Drafts — no outcomes until 3.10
  - `[low]` `[reject]` `formatUsdCents` always `$`, ignores `spendCurrency` — every Run is USD; spec example is `$0.47`
  - `[false]` `[reject]` Raw `hitl`/`yolo` / `edited` unwired in HTML — spec lists those vocab strings; `edited` is 3.10
  - `[low]` `[reject]` No `tr.pick` / `.logwrap` overflow — mock extras, not in the 3.7 ACs
  - `[medium]` `[patch]` OpsShell `dev` Evidence href test only saw `?surface=apex` — optional `items` seam; asserts `/runs/…?surface=ops` (3.8 page stays 3.8)
  - `[low]` `[patch]` Apex `#ops` still said the run log “will all live on” ops — copy now “The run log is on ops.”
  - `[false]` `[reject]` Sprint `done` while spec `in-review` — finalize sets both done
  - `[medium]` `[patch]` Edge: in-flight `/api/runs` looks empty — same `null` settle as finding 1
  - `[low]` `[reject]` Edge: held `nextRunAt` goes past noon in an open tab — polling would add a timer; reload computes fresh
  - `[medium]` `[patch]` Edge: cached `/api/schedule` outlives noon — same `jsonNoStore` as finding 2
  - `[low]` `[reject]` Edge: non-USD `spendCurrency` still `$` — same as finding 8
  - `[medium]` `[patch]` Vgap: Steps cells never asserted `eventCount` — mixed HTML now pins `class="num">5<` and `8`
  - `[medium]` `[patch]` Vgap: OpsShell `dev` href test did not observe run links — same `items` seam as finding 11
  - `[false]` `[reject]` Intent: tests are Worker HTTP + injected SSR, not a visitor fetch — APIs and markup are the locked surfaces; hook join is findings 1/11
  - `[medium]` `[patch]` Intent: fetch-fail hook untested — fail now settles to `[]`; EmptyState covered by injected empty
  - `[false]` `[reject]` Intent: TrustBar vs `/api/schedule` body — both use `nextRunAtUtc`
  - `[false]` `[reject]` Intent: persist next-run in D1 (R3) — 3.7 AC is visibility; compute matches the cron
  - `[false]` `[reject]` Intent: catch-up/manual as status chips — UX-DR6 + origin flag; epic context splits them
  - `[false]` `[reject]` Intent: FR13 Evidence/pending drafts in this diff — 3.8/3.9; 3.7 only links

## Design Notes

- Mock "4 of 5" steps invents a total the Run row does not store. v1 step summary is `eventCount` (Evidence rows). 3.8 owns the timeline.
- Approval stays "—" until 3.10 writes Draft `outcome`. Run `rejected`/`published` still use the status chip.
- Spend display example: `47` cents → `$0.47` via integer math, never a float in JSON.

## Verification

**Commands:**
- `npm test` -- expected: pass, including `publicApi.test.ts` and `runLog.test.tsx`
- `npm run check` -- expected: exit 0

**Manual checks (if no CLI):**
- Open ops. (`?surface=ops` in dev): empty vs seeded log, no login wall, next-run not the placeholder, row links to `/runs/:id`

## Auto Run Result

Status: done

Summary: Public ops. run log is live. `#runs` lists recent Runs (id, status chip, timestamp, origin flag, mode, steps/`eventCount`, spend, approval) with no login. TrustBar shows `America/New_York` and the next noon-ET instant from the same `nextRunAtUtc` the cron uses. Each row links to `/runs/:id` (Evidence page is 3.8).

Files changed:
- `src/shared/lib/schedule.ts` — `nextRunAtUtc` moved here; exact-noon `.000Z`
- `src/pipeline/workflow/schedule.ts` — re-exports shared schedule
- `src/shared/schemas/run.ts` — `RunLogItemSchema` (`eventCount`, `approvalOutcome`)
- `src/shared/db/repos/runsRepo.ts` — `listRuns` returns `RunLogItem[]`
- `src/shared/api/publicRouter.ts` — `GET /api/schedule` no-store; list items are log rows
- `src/surfaces/ops/RunLog.tsx` — public table; EmptyState only after settled empty
- `src/surfaces/ops/OpsShell.tsx` — TrustBar next-run; `#runs` mounts RunLog
- `src/surfaces/apex/ApexShell.tsx` — run log described as present on ops.
- `src/shared/api/publicApi.test.ts` / `src/surfaces/ops/runLog.test.tsx` / `src/surfaces/shells.test.tsx` — I/O matrix + review pins
- `_bmad-output/implementation-artifacts/spec-3-7-public-ops-run-log.md` / `sprint-status.yaml`

Review: 5 patch entries applied (in-flight empty, schedule no-store, Steps asserts, OpsShell `dev` href, apex copy). 0 deferred. Rejected: unbounded list/index, ScheduleSchema, all-or-nothing parse, 500 on poison row, approval `created_at`, `$` vs currency, raw mode/`edited`, `tr.pick`, sprint/status race, held-tab stale noon, persist-next-run, catch-up-as-status, 3.8/3.9 FR13, TrustBar/API split.

Follow-up review recommended: true (four medium patches). Unverified risk: `useRunLog` fetch is still not driven by a mocked non-OK `/api/runs` response (EmptyState-after-settle is injected).

Verification: `npm test` — 531 passed. `npm run check` — oxfmt, oxlint, tsc exit 0.

Residual risks: `/runs/:id` is still 3.8. v1 step summary is Evidence `eventCount`, not mock “N of 5”. Approval stays “—” until 3.10. List `/api/runs` remains `public, max-age=60`.
