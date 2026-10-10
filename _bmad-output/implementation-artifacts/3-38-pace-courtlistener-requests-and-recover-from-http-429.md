---
baseline_commit: 85850d2b376bc56b194cffe6a173e87b36378b6b
---

# Story 3.38: Pace CourtListener requests and recover from HTTP 429

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an operator,
I want the CourtListener connector to stay under its published request limit and to recover from a transient HTTP 429,
so that a normal daily Run finishes instead of failing before any Draft exists.

## Acceptance Criteria

1. **Given** the seeded case dockets (four `owning_table = 'cases'` CourtListener docket URLs), **when** a Run polls them, **then** request starts are at least `COURTLISTENER_MIN_INTERVAL_MS` (15 seconds) apart, which is four requests per minute, under CourtListener's about-5-per-minute limit.
2. **And** an HTTP 429 with a delta-seconds or HTTP-date `Retry-After` waits `min(parsed delay, 60 seconds)` or the remaining minimum interval, whichever is longer, then retries that same validated URL.
3. **And** an HTTP 429 without a usable `Retry-After` waits one 60-second limit window (still subject to the minimum interval) and retries.
4. **And** a later 200 on that URL returns entries once. Draft insertion and `draft-and-review` run only after the poll returns, so the retry does not create a second Draft or a second paid drafter/reviewer call.
5. **And** after `COURTLISTENER_MAX_ATTEMPTS` (3) failures, or when the next wait would exceed `COURTLISTENER_WAIT_BUDGET_MS` (6 minutes), the source is `source.skipped` with reason `http_429`, the response status, a scrubbed detail, and no API token. A zero-draft Run finishes `failed`, not `empty`.
6. **And** 401, 403, 5xx, network, timeout, unsafe URLs, and redirects still fail that request on the first response. Every docket error still finishes the Run `failed` with scrubbed evidence. Pagination stays on the exact HTTPS CourtListener API origin. `run-daily-step` remains the packaging checkpoint used by stories 3.32 and 3.34.
7. **And** deliberate waits plus fetches stay inside `COURTLISTENER_POLL_TIMEOUT_MS` (8 minutes), inside the default 10-minute Workflow step timeout. The generic `CONNECTOR_TIMEOUT_MS` stays 60 seconds for every other source.

## Tasks / Subtasks

- [x] **Task 1: Pace and retry inside the connector** (AC: 1–7)
  - [x] Serialize docket and pagination fetches. Keep one pace clock per check invocation, measured from request start.
  - [x] Wait with an abortable `setTimeout` (same timer choice as story 3.19). Honor `Retry-After`, the 60-second default, the 15-second floor, the 60-second cap, 3 attempts, and the 6-minute wait budget.
  - [x] On exhaustion or budget breach, throw the existing source-level `http_429` with scrubbed detail. Do not retry any other failure class.
  - [x] Set `pollTimeoutMs` on the CourtListener check to 8 minutes. `observe` uses that only when the check defines it.
  - [x] Leave `DailyRunWorkflow.run` step names unchanged. Do not introduce Queues or a new dependency.
- [x] **Task 2: Tests** (AC: 1–7)
  - [x] Unit-test `retryAfterMs` for seconds, HTTP-date, missing, garbage, and over-cap values.
  - [x] 429 with `Retry-After` recovers and writes one Draft. 429 without the header waits 60 seconds and recovers.
  - [x] Three 429s, and a wait that does not fit the budget, skip `http_429` with scrubbed detail and zero Drafts.
  - [x] 401/403/5xx are not retried. The five-docket poll still reports every docket and the unmatched URL under the new serial schedule.
  - [x] Admission cancellation still aborts the in-flight request, writes no Draft, and does not call the provider. A full workflow poll that sees one 429 then 200 calls the provider twice (drafter and reviewer), not once per attempt.
  - [x] Existing connector, recovery, and `CONNECTOR_TIMEOUT_MS === 60_000` tests stay green. Inject an instant wait from test harnesses that already poll the real connector.
- [x] **Task 3: Verification** (AC: all)
  - [x] `npm run check` and `npm test` exit 0. No deploy, no staging or production call, no paid provider call.

## Dev Notes

### Story selection

Create-story auto-discover's first backlog key is `3-37-prove-the-live-governed-loop-and-reassess-epic-3`. That story is live acceptance and was not rewritten. Story 3.36 is already `in-progress` and is operational verification; its spec was not edited. This defect is absent from the backlog, so the workflow's "add the missing story" choice is a new key, `3-38-pace-courtlistener-requests-and-recover-from-http-429`, inserted ready-for-dev ahead of 3.37. Patrick's instruction to choose rather than halt is the authority for that selection. The checklist's interactive improvement prompt was resolved as **all**.

`uv` is not installed here, so `resolve_customization.py` did not run. The workflow block was merged by hand from `.agents/skills/bmad-create-story/customize.toml`. There is no team or user override. `activation_steps_prepend`, `activation_steps_append`, `persistent_facts`, and `on_complete` are empty. Context7 is configured in `.mcp.json` but has no MCP namespace in this session. Cloudflare behavior below is from the Cloudflare docs MCP (`search_cloudflare_documentation`) on 2026-10-10, plus the installed connector and timeout source. No subagent tool was available.

### Root cause (verified in source, not assumed)

`createCourtListenerCheck` loads case-owned `courtlistener.com/docket/<id>/` rows and polls them with `Promise.all` (`src/pipeline/connectors/courtListener.ts`). The file header says "No retries, no backoff". HTTP 429 is in `SOURCE_LEVEL_REASONS`, so the first 429 aborts siblings and becomes `SourceUnavailableError("http_429")`. `runConnector` records `source.skipped` and does not insert Drafts. `packageDailyRun` then finishes a zero-draft Run as `failed`. Paid review never starts because `draft-and-review` is the next Workflow step and only runs when `draftCount > 0`.

Seeded case dockets are exactly four: `72237443`, `73133459`, `73242633`, `73375343`. The Arizona URL is `owning_table = 'circuits'` and is not polled. Four simultaneous starts sit on the 5/minute ceiling; pagination or any earlier use of the token makes the next start a 429. Staging Run `run-20261004-0002` failed in about eight seconds with `Rate limit exceeded: 5/min. Expected available in 59 seconds.` The connector cannot see a `Retry-After` header today because `FetchImpl` does not return `headers`.

Story 3.23 required 429 to fail on the first response. This story supersedes only that clause. Total outage behavior stays.

### Approach

Pace and retry inside the connector, before it returns entities.

- Minimum start spacing: 15 seconds. Starts at t=0, 15, 30, 45 are four in any 60-second window.
- 429 attempts: 3 per URL. Wait is `max(remaining interval, bounded Retry-After)`. Missing or unparseable `Retry-After` uses 60 seconds. Parsed delays cap at 60 seconds.
- Wait budget: 6 minutes of deliberate delay per check. A wait that would exceed it throws `http_429` with detail `rate limit wait budget exhausted` and does not send the request.
- Poll deadline: 8 minutes, via `pollTimeoutMs` read by `observe`. `CONNECTOR_TIMEOUT_MS` stays 60 seconds. Per-request `SOURCE_FETCH_TIMEOUT_MS` stays 12 seconds.
- Waits use abortable `setTimeout`, not `AbortSignal.timeout` and not `scheduler.wait`. Story 3.19 already found that fake timers do not drive `AbortSignal.timeout`. Cloudflare's limits page says waiting is not CPU time, and a Workflow step's wall clock is unlimited, but the default `step.do` timeout is 10 minutes (`developers.cloudflare.com/workflows/build/sleeping-and-retrying/` and `/workflows/reference/limits/`). Eight minutes of poll plus the existing step leaves margin under that default.
- Do **not** call `step.sleep` and do **not** rename `run-daily-step`. `step.sleep` cannot run inside `step.do`, and stories 3.32 and 3.34 checkpoint that step name. Durable sleep would also keep the 60-second `withAbortableDeadline` from covering the wait only by splitting the step. In-step abortable waits plus the longer CourtListener poll budget keep the checkpoint and still fail closed before the step timeout.
- Do **not** add Cloudflare Queues. Architecture defers Queues until fan-out or a DLQ is needed (`architecture.md`, Deferred Decisions). This is one account and a handful of serial reads. A queue would not itself honor `Retry-After`.
- Retries happen before `runConnector` inserts Drafts and before `reviewDailyRun`. A replay of `run-daily-step` starts a fresh pace window and still dedupes Draft ids. It must not call the provider once per HTTP attempt.

`courtListenerWait` on the env object is a test seam read by `sourceChecksFromEnv`. Production env does not set it. Real waits stay the default.

### Files

- Update `src/pipeline/connectors/courtListener.ts` and `courtListener.test.ts`.
- Update `src/pipeline/connectors/connector.ts` so `observe` reads optional `pollTimeoutMs`.
- Update `src/shared/lib/timeouts.ts` comment only. Do not change `CONNECTOR_TIMEOUT_MS`.
- Pass the test wait through `src/pipeline/workflow/dailyRun.ts`. Instant waits in `dailyRun.test.ts`, `dailyRunRecovery.test.ts`, and the admission cancellation setup so existing polls do not sleep 15 seconds per docket.
- Update `src/pipeline/workflow/runAdmission.test.ts` for serial in-flight cancellation. The semantic that stays: an aborted poll writes nothing and does not call the provider; the generic 60-second deadline must not be what stops CourtListener.
- Planning: `epics.md` story 3.38 and the 3.23 supersession line, `sprint-status.yaml`, `epic-3-context.md`.
- Patrick added one blocker note after story creation: 3.36 live acceptance waits on 3.38 merge and deploy. The 3.36 status value stays `in-progress`. The note is in `spec-3-36-verify-the-corrected-staging-run-and-gateway.md` and the 3.36 sprint-status comment.

### Previous story and git

Story 3.36 (in progress) recorded the 429 on `run-20261004-0002` and left acceptance incomplete. Do not deploy, do not call staging or production, and do not spend on DeepInfra. Stories 3.27, 3.32, 3.33, and 3.34 are done; their origin, replay, admission, and native-workflow assertions must keep passing.

Recent `main` commits: `85850d2` admin workspace, `5b6afca` CourtListener v4 query, `ba287b3` DeepInfra, `bd388d2` native DailyRun tests, `4f6a869` story 3.35. Follow those local patterns: Miniflare D1, stubbed `fetch`, no live CourtListener.

### Project context

`**/project-context.md` does not exist. Epic 3 context is `_bmad-output/implementation-artifacts/epic-3-context.md`. Config: project PML, documents in English, reader Patrick.

### References

- [Source: src/pipeline/connectors/courtListener.ts] concurrent poll, `SOURCE_LEVEL_REASONS`, no backoff
- [Source: src/shared/lib/timeouts.ts] `CONNECTOR_TIMEOUT_MS` 60 seconds, `SOURCE_FETCH_TIMEOUT_MS` 12 seconds
- [Source: src/pipeline/workflow/dailyRun.ts] `step.do("run-daily-step")` then `step.do("draft-and-review")`
- [Source: _bmad-output/planning-artifacts/epics.md] stories 3.23, 3.36, 3.37, 3.38
- [Source: Cloudflare docs, Sleeping and retrying](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/) default step timeout 10 minutes; dynamic retry delay exists but is not used because it would retry the whole packaging step
- [Source: Cloudflare docs, Workflow limits](https://developers.cloudflare.com/workflows/reference/limits/) wall clock per step unlimited; CPU excludes waiting
- [Source: Cloudflare docs, Workers limits](https://developers.cloudflare.com/workers/platform/limits/) waiting on I/O is not CPU time

## Dev Agent Record

### Agent Model Used

Grok 4.7

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- CourtListener polls are serial. Request starts are at least 15 seconds apart. HTTP 429 retries up to 3 times, honoring a capped `Retry-After` or waiting 60 seconds when the header is missing. The wait budget is 6 minutes. The poll deadline is 8 minutes. Other failures still fail on the first response.
- Exhausted 429 and an over-budget wait both skip the source as `http_429` with scrubbed detail and no Draft. A recovered 429 writes one Draft. The workflow test calls the provider twice for that Draft, not once per attempt.
- `run-daily-step` was not split. `CONNECTOR_TIMEOUT_MS` remains 60 seconds. `npm run check` exited 0. `npm test` exited 0: 1,482 passed, 6 skipped, 63 files. No deploy, staging, production, or paid-provider call.

### File List

- `_bmad-output/implementation-artifacts/3-38-pace-courtlistener-requests-and-recover-from-http-429.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/epic-3-context.md`
- `_bmad-output/implementation-artifacts/spec-3-36-verify-the-corrected-staging-run-and-gateway.md`
- `_bmad-output/planning-artifacts/epics.md`
- `src/pipeline/connectors/connector.ts`
- `src/pipeline/connectors/courtListener.ts`
- `src/pipeline/connectors/courtListener.test.ts`
- `src/pipeline/workflow/dailyRun.ts`
- `src/pipeline/workflow/dailyRun.test.ts`
- `src/pipeline/workflow/dailyRunRecovery.test.ts`
- `src/pipeline/workflow/runAdmission.test.ts`
- `src/shared/lib/timeouts.ts`

## Change Log

- 2026-10-10: Created story 3.38. Create-story did not take backlog story 3.37. Status ready-for-dev.
- 2026-10-10: Patrick asked for a 3.36 blocker note. Status value of 3.36 stays `in-progress`. Live acceptance is blocked on 3.38 merge and deploy.
- 2026-10-10: Implemented pacing and bounded 429 recovery. `npm run check` and `npm test` passed. Status review.
