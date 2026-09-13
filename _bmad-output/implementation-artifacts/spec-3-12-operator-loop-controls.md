---
title: 'Story 3.12: Operator Loop Controls'
type: 'feature'
created: '2026-09-13'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
baseline_revision: c21851c23989dd6b17405a7f7f01927bd559274f
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
warnings:
  - oversized
deferred:
  - summary: >-
      LoopControls 4s poll while running/awaiting is never observed in jsdom.
    evidence: |-
      First paint of a running row is SSR-tested; no fake-timer second GET.
      EvidenceDetail already has that timer-mount pattern. Deleting setInterval
      would not fail current LoopControls tests, including the awaiting poll
      added this pass.
    location: >-
      src/surfaces/admin/LoopControls.tsx:138
    severity: medium
  - summary: >-
      LoopControls trigger fetch has no timeout, so a hung POST leaves Run now
      disabled.
    evidence: |-
      Same Epic-2 hung-fetch family as ApprovalQueue (no AbortSignal.timeout).
      Settled by a POST timeout plus a test that busy clears.
    location: >-
      src/surfaces/admin/LoopControls.tsx:156
    severity: medium
---

<intent-contract>

## Intent

**Problem:** The only production start path is noon-ET cron → `kickDailyRun`. The operator cannot exercise the harness, see live/last Run status on `/admin`, or re-run a day that already published without a silent second publish.

**Approach:** Access-gated loop controls: `POST /api/admin/runs` starts `DailyRunWorkflow` with origin `manual` (or `catch-up`) and inserts the D1 row *before* `workflow.create` so `GET /api/runs` shows it immediately; `GET /api/admin/loop` returns the same latest row the public log uses. A same-date `published` Run blocks until `supersedePriorPublish: true`; that creates a **new** Run plus public `run.superseded` Evidence. The prior row stays.

## Boundaries & Constraints

**Always:**
- New admin routes ride the existing `requireOperator` + `ADMIN_CACHE_HEADERS`. Do not persist operator identity on trigger (Access already gated the POST); never email.
- `origin` is `manual` | `catch-up` (not `scheduled` — cron keeps that). `scheduledFor` defaults to today's ET date (`etCalendarDate`); always stamped (3.1 allows null; this path never uses it).
- Skip the noon-ET guard. Workflow instance id is `{origin}-{date}-{suffix}` (unique per Run), never `daily-{date}`.
- Allocate `run-YYYYMMDD-xxxx`: prefer `runIdFor` suffix (`0001` catch-up / `0002` manual) if free; else next unused 4-hex that day. Insert `status: running`, then `DAILY_RUN.create`.
- Same origin + `running` → 200 that row (idempotent, no second instance). Same origin `awaiting`, or any *other* origin `running`/`awaiting` that date → 409 `conflict` (no second draft set).
- Same-date any-origin `published` and flag absent → 409 `{ code: "supersede_required", details: { priorRunId } }`. Flag true → new row; append `run.superseded` on the new Run (`payload.priorRunId`); old row untouched.
- Terminal empty/failed/rejected/stopped with no published sibling that date → new Run, no flag.
- 3.11 same-draft 409 still holds. Gate remains the only F1 writer.
- NFR8: no wrangler cron/workflow binding edits. `kickDailyRun` noon guard unchanged.

**Never:**
- No `queued` Run status (3.1 locked `running` as the in-flight state; AC "queued" is that). No `waitForApproval`. No `#mode` / YOLO / threshold / `gateway_config` seed (3.2 leftover, 3.13). No Access-perimeter edits. No agent tools. No `surfaces/*` → `pipeline/*`. No rewriting published/failed history. No 0001–0010 table rebuilds except **0011** admitting `run.superseded` on `evidence_events`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Manual trigger | POST `{origin:"manual"}`; no same-date published/in-flight | D1 `running` + origin `manual`; workflow created; `GET /api/runs` lists it | N/A |
| Catch-up | POST `{origin:"catch-up", scheduledFor}` | Same, origin `catch-up`; does not replace the day's scheduled row | N/A |
| Live/last | GET `/api/admin/loop` | `{ latest }` = `listRuns()[0]` (same row as public log) | `{ latest: null }` when none |
| Idempotent | POST while same origin `running` | 200 existing row; no second instance | N/A |
| Busy | same origin `awaiting`, or a different origin `running`/`awaiting` that date | 409 `conflict`; no new row | Busy |
| Supersede required | published row that date; flag omitted | 409 `supersede_required` + `priorRunId`; no new row | Confirm |
| Supersede confirm | flag true | New Run; `run.superseded` on it; prior still `published` | N/A |
| Retry empty/failed | terminal, no published sibling | New Run, no flag | N/A |
| Anon | no token | opaque 403 | Fail closed |
| Invalid body | bad origin / date | 400 | Fail closed |
| Missing workflow | `DAILY_RUN` undefined after insert | Run `failed` + `run.failed`; 500 | Fail closed |

</intent-contract>

## Code Map

- `migrations/0011_run_superseded.sql` -- NEW -- 0009 rebuild pattern: add `run.superseded` to `evidence_events.event` CHECK; copy rows; restore `idx_evidence_run_seq`.
- `src/shared/schemas/vocabulary.ts:264-278` -- ADD `run.superseded` to `EVIDENCE_EVENT_VALUES` (comment: CHECK now 0011).
- `src/pipeline/workflow/dailyRun.ts:15-45,56-81` -- KEEP `kickDailyRun` scheduled-only. EXTEND `DailyRunParams` with optional `runId`. `run()` uses attach-run's returned id for later steps. ADD `startOperatorRun(db, workflow, {origin, scheduledFor, supersedePriorPublish, now})` with the I/O matrix.
- `src/pipeline/workflow/dailyRunSteps.ts:16-58,174-199` -- ADD next-free suffix helper. `ensureRun` prefers payload `runId`, else existing find-or-create. `packageDailyRun` loads by **id** (not latest-by-date) so a supersede cannot attach to the prior published row.
- `src/shared/db/repos/runsRepo.ts:118-209` -- ADD `listRunIdsForDate` (or equivalent) for suffix allocation; ADD `hasStatusForDate(scheduledFor, statuses)`. Reuse `listRuns` / `insertRun` / `findRunForDate`.
- `src/pipeline/projector/evidence.ts` -- REUSE `append` for `run.superseded` (deterministic id `e:{runId}:run.superseded`).
- `src/server.ts:347-478` -- ADD `GET /api/admin/loop` → `{ latest }` and `POST /api/admin/runs` (Zod `{origin, scheduledFor?, supersedePriorPublish?}`); keep `#mode` 404s and the unknown-admin 404 after these.
- `src/shared/lib/adminGuard.ts` / `access.ts` -- READ ONLY.
- `src/surfaces/admin/LoopControls.tsx` -- NEW -- `#loop` panel: latest status via `RunStatusChip`/`OriginFlag` (running = muted text like `RunLog.tsx:168-172`); poll while `running`; "Run now" POST manual; on `supersede_required` reuse `.rejectbox` Confirm/Cancel ("Supersede prior publish"). Fail to signed-out EmptyState like the queue.
- `src/surfaces/admin/AdminShell.tsx:58-120` -- ADD nav `#loop` + SectionBand (queue and `#mode` placeholder stay).
- `src/surfaces/ops/EvidenceDetail.tsx:148-167` -- INCLUDE `priorRunId` in `stepLabel` extras so Evidence prints `run.superseded · run-…`.
- `src/shared/ui/RunStatusChip.tsx` / `OriginFlag.tsx` / `pml.css` -- READ ONLY chips/flags; reuse `.btn` / `.rejectbox` (no new dialog primitive).
- `src/shared/api/adminApi.test.ts` -- EXTEND Worker matrix: trigger, public GET mirror, 409 supersede, confirm, busy awaiting, idempotent running, catch-up alongside, anon 403.
- `src/pipeline/workflow/dailyRun.test.ts` -- EXTEND: operator start skips ET guard; suffix after 0002; `packageDailyRun` by id; kickDailyRun tests unchanged.
- `src/surfaces/ops/evidenceDetail.test.tsx` / `src/surfaces/shells.test.tsx` -- superseded label; `#loop` band present, `#mode` still placeholder.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `3-12-operator-loop-controls` in-progress then done.

## Tasks & Acceptance

**Execution:**
- `migrations/0011_run_superseded.sql` -- admit `run.superseded` on the Evidence CHECK
- `src/shared/schemas/vocabulary.ts` -- mirror the new event name
- `src/pipeline/workflow/dailyRun.ts` -- `startOperatorRun`; keep `kickDailyRun` scheduled-only
- `src/pipeline/workflow/dailyRunSteps.ts` -- next suffix; id-pinned `packageDailyRun`
- `src/shared/db/repos/runsRepo.ts` -- date id/status lookups for allocation and busy/supersede
- `src/server.ts` -- `GET /api/admin/loop` + `POST /api/admin/runs`
- `src/surfaces/admin/LoopControls.tsx` -- Run now + live/last + supersede confirm
- `src/surfaces/admin/AdminShell.tsx` -- `#loop` band; `#mode` stays placeholder
- `src/surfaces/ops/EvidenceDetail.tsx` -- `run.superseded · priorRunId`
- `src/shared/api/adminApi.test.ts` -- Worker I/O matrix
- `src/pipeline/workflow/dailyRun.test.ts` -- operator start vs noon guard
- `src/surfaces/ops/evidenceDetail.test.tsx` / `src/surfaces/shells.test.tsx` -- label + `#loop`
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- tracking

**Acceptance Criteria:**
- Given `/admin#loop` with Access, when I click Run now and no same-date published or in-flight Run exists, then the panel and `GET /api/runs` both show that Run with origin `manual` and in-flight status `running`
- Given that Run, when I view the public log / `GET /api/admin/loop`, then live/last status is the same row and vocabulary (`running`, `awaiting`→awaiting-approval, `published`, `failed`, `stopped`→budget-stopped, `empty`, `rejected`) — never a private copy
- Given a same-date published Run, when I click Run now, then I must confirm “supersede prior publish”; after confirm, Evidence for the new Run shows `run.superseded` naming the prior id, and the prior Run stays `published`
- Given an awaiting or other-origin in-flight Run that date, when I trigger, then the action is refused and no second workflow starts
- Given routine trigger/inspect/supersede from `/admin`, when those actions succeed, then wrangler cron/bindings are unchanged

## Spec Change Log

## Review Triage Log

### 2026-09-13 — Review pass
- verdicts: 35 findings — high 0, medium 15, low 11, false 9, maybe-false 0
- findings:
  - `[low]` `[reject]` Catch-up exists on POST but `#loop` only posts `manual` with no date control (blind-hunter) — Story 3.12’s operator action is a manual Run now; catch-up stays the 3.3 API seam. A date/origin picker is new public chrome, not a direct correction.
  - `[false]` `[reject]` Catch-up against a published scheduled Run “replaces” via `run.superseded` (blind-hunter) — confirm still inserts a **new** row; the scheduled row stays `published`. The event is lineage on the successor, not a delete/replace.
  - `[false]` `[reject]` Live/last is global `listRuns()[0]` while Run now stamps today ET (blind-hunter) — inspect last vs start today is the specified split; the panel reloads after a successful POST.
  - `[low]` `[reject]` Supersede `.rejectbox` never names `priorRunId` (blind-hunter) — the API already returns it; the panel typically already shows that published latest. Extra chrome, not a fail-closed hole.
  - `[false]` `[reject]` Inspect omits spend / `scheduledFor` / Evidence link (blind-hunter) — FR-12 asks to view live/last **status**; the public log and Evidence page remain the full record.
  - `[medium]` `[patch]` 500 / missing workflow inserts-then-fails but the UI says “not started” and did not reload (blind-hunter) — `setReload` now runs on `!res.ok` and fetch throw.
  - `[false]` `[reject]` `startOperatorRun` never writes `run.started` on the fail-closed path (blind-hunter) — the matrix requires `run.failed` here; `ensureRun` still writes `run.started` when the workflow attaches.
  - `[medium]` `[patch]` In-flight Workflows with a cached void `attach-run` would `getRunById(undefined)` and skip packaging (blind-hunter) — fallback to `payload.runId` then `findRunForDate`.
  - `[low]` `[reject]` Unused `listRunIdsForDate` / `hasStatusForDate` and a snapshot race (blind-hunter) — unused helpers are harmless; two concurrent POSTs are the same single-operator race 3.11 already declined.
  - `[medium]` `[patch]` Polling ran only while `running`, so awaiting → published stayed stale (blind-hunter) — interval now also polls `awaiting`.
  - `[low]` `[patch]` Signed-out EmptyState still said “this queue…” (blind-hunter) — copy now says loop controls; sharing `isRunLogItem` with RunLog was extra, not done.
  - `[medium]` `[patch]` Uncovered matrix cells: empty loop GET, `create` reject, omitted `scheduledFor`, other-origin awaiting (blind-hunter) — Worker/unit/mount tests added for those cells; leftover Cancel/UI-conflict clicks were not worth a new surface.
  - `[low]` `[reject]` Sprint key `done` while spec `in-review` (blind-hunter) — Finalize writes `status: done`.
  - `[medium]` `[patch]` `append` after insert sat outside the `create` try/catch, so a throw left a `running` orphan (edge-case-hunter) — `append` / missing binding / `create` now share one try/catch that `finishFailed`.
  - `[low]` `[reject]` `insertRun` collision when the raced row is not `running` (edge-case-hunter) — single-operator window; retry allocates the next suffix on the next POST.
  - `[low]` `[reject]` Concurrent other-origin start bypasses the busy snapshot (edge-case-hunter) — same single-operator sequential queue as 3.11’s last-pending race.
  - `[false]` `[reject]` Run now/confirm omit `scheduledFor` so today ET is not the shown date (edge-case-hunter) — grouped with the inspect/start split; Worker test now pins the `etCalendarDate` default.
  - `[medium]` `[patch]` Poll only while `running` (edge-case-hunter) — grouped with the awaiting-poll patch.
  - `[low]` `[reject]` Overlapping `load()` polls share one AbortController (edge-case-hunter) — same unmount-abort pattern as EvidenceDetail; a generation counter is extra complexity.
  - `[medium]` `[patch]` Non-OK POST besides 409 did not reload latest (edge-case-hunter) — grouped with the 500-reload patch.
  - `[medium]` `[patch]` `attach-run` result missing/not a run id skips packaging (edge-case-hunter) — grouped with the attach-run fallback.
  - `[medium]` `[defer]` Trigger fetch has no timeout, so hung POST leaves Run now disabled (edge-case-hunter) — Epic-2 hung-fetch family; ApprovalQueue has the same gap.
  - `[medium]` `[patch]` Four-arg `ensureRun(runId)` never executed in tests (verification-gap) — clock-skew fixture now calls `ensureRun(..., 0003)` and packages that return.
  - `[medium]` `[patch]` Run now never exercised the ET `scheduledFor` default (verification-gap) — Worker POST `{ origin: "manual" }` only, asserts `etCalendarDate`.
  - `[medium]` `[patch]` Empty `GET /api/admin/loop` and live `{ latest: null }` parse untested (verification-gap) — Worker `{ latest: null }` plus mount “No runs yet.” / “Run now”.
  - `[medium]` `[patch]` Other-origin `awaiting` missing from the busy 409 tests (verification-gap) — Worker copy of the in-flight test with `awaiting`.
  - `[medium]` `[patch]` `workflow.create` reject untested (hits `if (!workflow)` only) (verification-gap) — unit test `mockRejectedValue` → `workflow_unavailable` / `failed` / `run.failed`.
  - `[medium]` `[defer]` LoopControls 4s poll never observed (verification-gap) — first paint of `running` is SSR-tested; timer-mount is the EvidenceDetail pattern, not required to pin trigger/supersede.
  - `[low]` `[patch]` Live signed-out EmptyState used ApprovalQueue “queue” copy (verification-gap) — grouped with the loop-controls copy patch.
  - `[low]` `[reject]` Catch-up is API-only; UI cannot issue it (intent-alignment) — grouped with the first catch-up-UI row; Reading C leftover, not Story 3.12’s Given/When/Then.
  - `[false]` `[reject]` Inspect tests prove JSON identity, not the ops. RunLog page (intent-alignment) — `GET /api/runs` is the log’s API; 3.7 UI already renders that payload.
  - `[false]` `[reject]` Supersede Evidence not fetched via public `GET /api/runs/:id` (intent-alignment) — `evidence_events` SQL plus EvidenceDetail SSR are the same projection that GET returns.
  - `[false]` `[reject]` NFR8 not exercised as a wrangler assertion (intent-alignment) — no wrangler/cron/binding files in the diff; `kickDailyRun` noon-guard tests unchanged.
  - `[low]` `[reject]` `DailyRunWorkflow.run()` for an operator payload untested (intent-alignment) — `create` args and id-pinned `ensureRun`/`packageDailyRun` are the step helpers; instantiating WorkflowEntrypoint is extra.
  - `[false]` `[reject]` Mode / YOLO / `gateway_config` (stale 3.12 identity) not implemented (intent-alignment) — current 3.12 is loop controls; `#mode` stays 3.13.

## Design Notes

- AC "queued / awaiting-approval / budget-stopped" maps to locked 3.1/3.7 strings (`running` / `awaiting` / `stopped`). Do not add a `queued` CHECK value.
- Supersede is a **new** Run (sprint-change-proposal: re-runs the whole day). Reusing `runIdFor`'s single suffix would force history rewrite; extra 4-hex suffixes keep 3.7's `run-YYYYMMDD-xxxx` regex.
- `conflict()` is code `conflict`; supersede uses a distinct `supersede_required` so the confirm UI does not treat "already awaiting" as "confirm overwrite".
- 3.2's "3.12 seeds gateway_config" is out of scope — this story's ACs are trigger / inspect / supersede.

## Verification

**Commands:**
- `npm test` -- expected: pass, including admin loop matrix and unchanged `kickDailyRun` noon-guard tests
- `npm run check` -- expected: exit 0

**Manual checks (if no CLI):**
- Dev bypass: `/admin#loop` → Run now → ops. log shows `manual`; after a published fixture, Run now asks to supersede and Evidence lists `run.superseded`

## Auto Run Result

Status: done

Summary: Operators can start the daily harness from `/admin#loop` without waiting for noon ET. `POST /api/admin/runs` inserts a `running` row (origin `manual` or `catch-up`) before `DAILY_RUN.create`; `GET /api/admin/loop` returns the same latest row as `GET /api/runs`. A same-date published Run needs an explicit supersede confirm; that starts a **new** Run and records public `run.superseded` Evidence. Cron bindings and `#mode` are unchanged.

Files changed:
- `migrations/0011_run_superseded.sql` — admit `run.superseded` on Evidence
- `src/shared/schemas/vocabulary.ts` — mirror the event name
- `src/pipeline/workflow/dailyRun.ts` — `startOperatorRun`; attach-run fallback; post-insert fail-close
- `src/pipeline/workflow/dailyRunSteps.ts` — `nextFreeRunId`; id-pinned `packageDailyRun`
- `src/shared/db/repos/runsRepo.ts` — `listRunsForDate` for busy/supersede/allocation
- `src/server.ts` — `GET /api/admin/loop` + `POST /api/admin/runs`
- `src/surfaces/admin/LoopControls.tsx` — Run now, live/last, supersede confirm, poll awaiting, reload on 500
- `src/surfaces/admin/AdminShell.tsx` — `#loop` band
- `src/surfaces/ops/EvidenceDetail.tsx` — `run.superseded · priorRunId`
- tests + `sprint-status.yaml` + this spec — matrix, mount, tracking

Review: 4 layers, 35 findings — 0 high. Patches: post-insert try/catch; attach-run id fallback; panel reload on 500; poll while awaiting; EmptyState copy; tests for pinned `ensureRun`, ET date default, empty loop GET, other-origin awaiting, `create` reject. Deferred: poll timer-mount, hung POST timeout. Rejected lows/false as recorded above.

Follow-up review recommended: true — two or more mediums patched. Unverified risk: the attach-run void-return fallback is not exercised by a Cloudflare Workflow replay fixture; poll-while-awaiting has no fake-timer assertion (deferred).

Patch counts by verdict: high 0, medium 9 entries (fail-close, attach-run fallback, 500 reload, awaiting poll, plus five verification-gap tests), low 1 (EmptyState copy).

Verification: `npm test` — 659 passed (33 files). `npx oxlint src/` + `npx tsc` exit 0. `oxfmt --check` exit 0. No live-browser pass of `/admin#loop` (jsdom mount + Worker POST stand in).

Residual risks: remote D1 still needs migration 0011; catch-up is API-only; concurrent double-start remains accepted on a single-operator surface.
