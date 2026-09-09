---
title: 'Story 3.3: Daily Run Workflow & Empty Runs'
type: 'feature'
created: '2026-09-08'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: bfcdf6ed4b957acf62c790b70c4a9d34a649a0c5
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Nothing runs the daily loop. Runs, Drafts, and Evidence exist (3.1) and an AI gateway exists (3.2), but there is no scheduled harness to create a Run every calendar day — so "silence" cannot yet be distinguished from "the harness didn't look," and there is no container to hang source monitoring (3.4), drafting (3.5), or the gate (3.10) on.

**Approach:** Build `DailyRunWorkflow` — a scheduled entry point that, fired at the daily cadence (or a test trigger), creates a Run with origin `scheduled`, writes `run.started`/`run.completed`/`run.empty` evidence, completes an **empty Run** on no-material-change days, records the schedule timezone + next-run time for public display, supports `catch-up` origin, and resumes an interrupted awaiting-approval Run under the SAME Run ID without a duplicate Draft set.

## Boundaries & Constraints

**Always:**
- A Run is always produced for a scheduled attempt — even a no-change day completes an `empty` Run whose Evidence states zero drafts (FR10); silence is never mistaken for "didn't look"
- Missing/failed attempts are represented (visible gap), never silently deleted
- Catch-up Runs (`origin = 'catch-up'`) supplement, never replace, the day's prior attempt
- Same-Run-ID resume: an awaiting-approval Run interrupted hours/days later resumes under the same `run-*` id without regenerating a conflicting Draft set (idempotent)
- Schedule timezone + next-run time are stored for public Endpoints reading (FR27), and the displayed rule is exactly the one enforced
- Money/spend/everything stays integer cents; DB snake_case ↔ JSON camelCase; repos map via `Schema.parse`; prepared `?` binds only; no `BEGIN`/`PRAGMA`
- Evidence writes go through a repo (this story adds the missing evidence write function — 3.1 left `evidenceRepo` read-only and 3.2 wrote raw SQL; the harness is the first legitimate projector-side writer)

**Never:**
- No Draft-writing to live F1 (this story completes Runs; it does not yet fetch sources or draft — 3.4/3.5)
- No mutation of `0001`–`0007`
- No public UI change beyond storing the schedule fields (`ops.` run log is 3.7)
- No secret/credential ever in a prompt or public artifact
- No ad-hoc provider/model call outside `pipeline/ai/gateway`
- Scheduling rule: **dual-UTC cron triggers + an ET-hour guard** — fires on hourly UTC crons, acts only when the current `America/New_York` hour is noon (holds noon ET across DST; the displayed rule is exactly this)
- Orchestration: **Cloudflare Workflows** binding (`wrangler.jsonc` `workflows` + a DO migration) — step durability + native `waitForApproval`, per architecture's locked "Agents SDK + Workflows"
- Same-Run-ID resume: **deterministic `run-YYYYMMDD-xxxx` from the date** — no schema change; resume re-derives the id; duplicate-Draft suppression on resume is logic-enforced (no DB uniqueness on `scheduled_for`)

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Scheduled fire, no prior run | noon cadence trigger; no run for `scheduled_for` | New Run `run-YYYYMMDD-xxxx`, origin `scheduled`, `run.started` + empty completion (`run.empty`) evidence, status `empty` | N/A |
| Catch-up for a skipped day | `origin='catch-up'`, prior failed/missing attempt exists | New catch-up Run *alongside* the day's record, never replacing it | N/A |
| Interrupted awaiting-approval | an `awaiting` Run exists for the date | Resume SAME Run id; no new Run; no duplicate Draft set | N/A |
| Trigger fires twice same day | a `scheduled` Run already exists for the date | No-op (idempotent); no second Run | N/A |
| No-change day | sources empty / no material update | Run completes with status `empty`, evidence states zero drafts | N/A |
| Workflow error mid-run | step throws | Run marked `failed` + `run.failed` evidence; attempt recorded, not silent | N/A |

</frozen-after-approval>

## Code Map

- `wrangler.jsonc` — NO `triggers.crons` today; 3.3 introduces the first schedule (Q2 fixes whether it's `triggers` or `workflows`); `wrangler.test.jsonc` must mirror whatever is added for parity tests
- `src/server.ts:221-323` — the single `fetch` handler; a `scheduled` export would be NEW (none exists); dispatch lives here
- `src/shared/db/repos/runsRepo.ts` — `insertRun` documented as "the pipeline write path (3.3)"; `getRunById`, `markStopped`; NOTE no lookup by `scheduled_for`/origin exists yet
- `src/shared/db/repos/evidenceRepo.ts` — read-only today (`listByRun`); 3.3 adds the first evidence WRITE (append event with `MAX(seq)+1` per-run, `UNIQUE(run_id,seq)` from 0006)
- `src/shared/schemas/vocabulary.ts` — `RUN_ORIGIN_VALUES`, `RUN_STATUS_VALUES` (has `empty`), `EVIDENCE_EVENT_VALUES` already has `run.started`/`run.completed`/`run.empty`/`run.failed`/`run.stopped` (no migration needed)
- `migrations/0006_run_draft_evidence.sql:95-101` — `scheduled_for` date column; no uniqueness (multiple runs may share a date); `:58-60` documents that
- `src/shared/lib/dates.ts` — ET formatting helpers (`Intl` `America/New_York`); NO "compute next noon-ET" helper exists — 3.3 adds the scheduling-time computation + storage
- `src/pipeline/ai/gateway.ts` — `complete({ role })` (not yet needed this story; the empty/no-change path must NOT call the model)
- `src/surfaces/ops/OpsShell.tsx:59` — hardcoded "Next run — not yet scheduled" placeholder; 3.3 stores the real fields (no UI rewrite yet)

## Tasks & Acceptance

**Execution:**
- [ ] `wrangler.jsonc` + `wrangler.test.jsonc` -- add the schedule binding per Q2 (+ parity in the test config) -- the first production schedule
- [ ] `src/shared/db/repos/evidenceRepo.ts` -- ADD `appendEvent(db, {runId, event, payload, createdAt})` (or similar) computing per-run seq -- closes the 3.1 read-only gap; the harness's write path
- [ ] `src/shared/db/repos/runsRepo.ts` -- ADD lookup to support same-Run-ID resume (by `scheduled_for`+`origin`, per Q3) and `completeRun(db, runId, status, completedAt)` -- idempotent resume + empty/failed completion
- [ ] `src/pipeline/workflow/dailyRun.ts` -- NEW -- `DailyRunWorkflow`: create-or-resume Run, write `run.started`, run the (stub) daily step, complete as `empty` on no-change or `awaiting` when material work lands (stub for 3.4), write `run.completed`/`run.empty`/`run.failed`; idempotent on a second same-day trigger -- RATIONALE: the harness everything else hangs on
- [ ] `src/pipeline/workflow/schedule.ts` -- NEW -- compute next noon-ET instant + store timezone for public display (Q1 rule) -- the FR27 fields
- [ ] `src/server.ts` -- ADD the `scheduled` entry point (or Workflow binding wiring per Q2) -- the trigger seam
- [ ] `src/pipeline/workflow/dailyRun.test.ts` -- NEW -- Vitest: Run creation, empty-Run completion, same-Run-ID resume, catch-up alongside, double-trigger idempotency, failure→`failed` -- the I/O matrix
- [ ] `src/shared/schemas/run.ts` + `vocabulary.ts` -- any schedule-field schema additions (nextRunAt/timezone) if display requires them now (else defer to 3.7) -- RATIONALE: FR27 storage

**Acceptance Criteria:**
- Given a scheduled trigger, when it fires, then a Run with origin `scheduled` is created and `run.started` evidence is written
- Given a no-material-change day, when the workflow completes, then the Run status is `empty` and `run.empty` evidence states zero drafts
- Given an awaiting-approval Run interrupted, when the workflow resumes, then the SAME Run id is reused and no duplicate Draft set is produced
- Given a second trigger for an already-recorded day, when it fires, then no new Run is created
- Given a workflow step failure, when it throws, then the Run is marked `failed` with `run.failed` evidence (never silently dropped)

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

- The empty/no-change path must NOT invoke the gateway (no model call on a day with nothing to draft); 3.4 will add the source-monitoring step that produces material work.
- Schedule storage: `next_run_at` (ISO UTC) + `timezone` (`America/New_York`) live on the run row or a config row, so the public run log (3.7) can render "next run" without recomputation.

## Verification

**Commands:**
- `npm run migrate:local` -- expected: any Q3 migration applies clean (if Q3 = b)
- `npm test` -- expected: all suites pass incl. `pipeline/workflow/dailyRun.test.ts`
- `npm run check` -- expected: exit 0 (oxfmt + oxlint + tsc)
