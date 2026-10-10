---
baseline_commit: 85850d2b376bc56b194cffe6a173e87b36378b6b
---

# Story 3.38: Pace CourtListener requests and recover from HTTP 429

Status: in-progress

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

### Review Findings

- [x] [Review][Patch] Wait-budget exhaustion with no 429 is reported as HTTP 429 — resolved by Patrick (2026-10-10): when no 429 was received, record `reason: "timeout"` with no status; keep `http_429` only when a real 429 preceded the exhaustion (medium) [src/pipeline/connectors/courtListener.ts:750]
- [x] [Review][Patch] Fetch time is not bounded inside the 8-minute poll — resolved by Patrick (2026-10-10): before each wait, check the time left in `COURTLISTENER_POLL_TIMEOUT_MS`; if the wait plus one `SOURCE_FETCH_TIMEOUT_MS` request would not fit, stop cleanly with scrubbed evidence (`http_429` if a real 429 was seen, otherwise `timeout`) (medium) [src/pipeline/connectors/courtListener.ts:732-760]
- [x] [Review][Patch] Timeout evidence records `CONNECTOR_TIMEOUT_MS` (60000) instead of the enforced `pollTimeoutMs(check)` (480000) (medium) [src/pipeline/connectors/connector.ts:166]
- [x] [Review][Patch] Real `defaultWait` is never exercised by a test, including abort during a wait and timer cleanup (medium) [src/pipeline/connectors/courtListener.ts:234]
- [x] [Review][Patch] Pacing is tested only with a frozen clock (`nowMs: () => 0`); remaining-interval math and pagination spacing are unverified (medium) [src/pipeline/connectors/courtListener.test.ts:1206]
- [x] [Review][Patch] "No retry" is asserted only for 401; 403 and 5xx tests do not check call count or waits (medium) [src/pipeline/connectors/courtListener.test.ts:1365]
- [x] [Review][Patch] No workflow-level test shows an exhausted 429 ends a zero-draft Run `failed`, not `empty` (AC5) (medium) [src/pipeline/connectors/courtListener.test.ts]
- [x] [Review][Patch] Run-ownership guard runs before the pace/429 wait instead of immediately before the request (low) [src/pipeline/connectors/courtListener.ts:430-433]
- [x] [Review][Patch] HTTP-date `Retry-After` uses real `Date.now` instead of injected `deps.nowMs` (low) [src/pipeline/connectors/courtListener.ts:458]
- [x] [Review][Patch] HTTP-date test fixtures use wrong weekdays ("Fri, 10 Oct 2026" is a Saturday; "Sat, 11 Oct 2026" is a Sunday) (low) [src/pipeline/connectors/courtListener.test.ts:206,212]
- [x] [Review][Patch] Five-docket test comment says serial polling exceeds 60 s, but 5 × 11 s = 55 s, and its assertions would pass under the old deadline (low) [src/pipeline/connectors/courtListener.test.ts:761-790]
- [x] [Review][Patch] `timeouts.ts` header still says "no per-site overrides" although `pollTimeoutMs` is now a per-check override (low) [src/shared/lib/timeouts.ts:26]
- [x] [Review][Defer] epics.md Story 3.38 entry lacks the "As a / I want / So that" and Given/When/Then format used by other stories [_bmad-output/planning-artifacts/epics.md:1167] — deferred: fix edits a planning artifact, not code

#### Rejected

- low — Replay starts a fresh pace window: a step replay's first request may 429, which the bounded retry absorbs; the fix needs persisted cross-invocation state.
- false — 15 s spacing allows 5 starts in a closed 60 s window: 5 starts per 60 s does not exceed CourtListener's 5/min limit.
- spec — Cap of `Retry-After` at 60 s makes the next 429 certain: AC2 mandates the cap; the fix is a spec change.
- low — Budget-exhausted evidence drops the server's detail and attempts: needs about 6 minutes of waits after a real 429; the fix adds parameters to `pace`.
- low — `retryAfterMs` accepts fractional seconds and lenient `Date.parse` strings: CourtListener sends integer seconds; the fix adds a format guard.
- false — 10-minute step timeout has no arithmetic: the other three sources are instant `stubCheck`s run serially, so the step is the 8-minute poll plus D1 writes.
- false — `pollTimeoutMs` can overflow `setTimeout` or be Infinity: it is only ever set to the constant 480000.
- low — `pollTimeoutMs` attached loosely with `Object.assign`: developer-only; the fix adds type surface.
- false — AbortError escapes unmapped when the signal is not aborted (and the deleted abort mapping): `fetchWithTimeout` rejects with `TimeoutError` on its own deadline, and an AbortError only comes from the caller signal, which is rethrown by design.
- false — `Date.now` stepping backwards inflates waits: the Workers clock does not step backwards within an invocation.
- false — `stubFetch` content-type default changed: the connector never reads `content-type`.
- low — Test-only `courtListenerWait` widens the `Env` type: production never sets it; the fix adds a deps parameter.
- false — Admission `sibling_failure` test lost its sibling: serial polling means no sibling request is ever in flight; abort-during-wait coverage is tracked under the `defaultWait` patch.
- spec — Dev Agent Record has generic filler and no CI link: the fix edits the spec under review.

### Review Findings (re-review of 3cfdc02, 2026-10-10)

- [x] [Review][Patch] Real `defaultWait` test still doesn't prove spacing: "clears the real wait timer" advances 45 s once and checks 4 calls, which also passes if `defaultWait` resolves immediately. Assert 1 call at 14.9 s and 2 calls at 15 s, then the same for the 60 s 429 backoff (medium) [src/pipeline/connectors/courtListener.test.ts:1622]
- [x] [Review][Patch] The `+ SOURCE_FETCH_TIMEOUT_MS` margin in the poll-deadline check isn't pinned: both deadline tests have wait > timeLeft without the margin, so dropping it still passes. Add a moving-clock case with waitMs <= timeLeft < waitMs + 12 s that stops before fetching, and a just-outside case that still fetches (medium) [src/pipeline/connectors/courtListener.ts:772-776]
- [x] [Review][Patch] The poll-deadline check is skipped when no wait is needed: `if (waitMs <= 0) return;` runs before the `timeLeft` check, so a request whose spacing already elapsed can start with under 12 s left and end as the generic deadline skip. Move the time-left check ahead of the early return (low) [src/pipeline/connectors/courtListener.ts:771]
- [x] [Review][Patch] A spacing-only stop still says "rate limit wait budget exhausted" under `reason: "timeout"`, which tells the public log a rate limit happened when none did. Use neutral detail (e.g. "wait budget exhausted") when no 429 was seen (low) [src/pipeline/connectors/courtListener.ts:779]
- [x] [Review][Patch] Five-docket test timing is wrong and its assertions are loose: pacing is measured from request start, so with 11 s fetches the gaps are 4 s and the poll ends at about 71 s, not 115 s. `60 s < elapsed < 480 s` checks total advanced time, not when the poll finished. Fix the comment and assert the finish time within a small tolerance (low) [src/pipeline/connectors/courtListener.test.ts:761]
- [x] [Review][Patch] The workflow exhausted-429 test only checks that some `http_429` skip exists. Also assert `status: 429`, `attempts: 3`, the scrubbed `detail`, fetch count = `COURTLISTENER_MAX_ATTEMPTS`, and that the token never appears in evidence (low) [src/pipeline/workflow/dailyRunRecovery.test.ts:897]

#### Rejected (re-review)

- low: `pollStartedAt` starts a few ms after `observe`'s deadline (one D1 read); the fix needs new context plumbing.
- false: the pace check uses the constant rather than the check's `pollTimeoutMs`; the check's value is that same constant.
- per decision: `seenRateLimit` is poll-wide, so a later stop after any recovered 429 stays `http_429`; this matches Patrick's "a real 429 preceded the exhaustion".
- carried: `pace`'s `http_429` lacks attempts and the server detail (rejected in the first pass).
- low: connector-level `timeout` skips lack `timeoutMs` while deadline skips have it; nothing reads the field.
- per decision: about 25+ dockets can exhaust the spacing budget as `timeout`; that is decision 1's outcome.
- false: the workflow 429 test hits real timers; the harness injects an instant `courtListenerWait`.
- low: the run-ownership test checks only part of the order.
- low: there's no test where both stop conditions fire at once.
- low: the deadline test has no negative 60 s case.
- spec: the File List, the Change Log date, and the 115 s Dev Agent Record note are spec edits; please correct the 115 s note anyway while you fix the test.

### Review Findings (second fix re-review of 59b7430..e19d92b, 2026-10-10)

- [ ] [Review][Patch] The real-wait test never checks how the 429 recovery run ended: change `await retrying;` to `expect(await retrying).toEqual({ draftCount: 0, failed: false });` (low) [src/pipeline/connectors/courtListener.test.ts:~1665]
- [ ] [Review][Patch] The "just fits" boundary test is loose: `calls.length >= 3` and `waits[1]` would still pass if the poll stopped one docket early. With the frozen clock every later pace sits exactly at the boundary, so all dockets fetch; assert the exact `calls` length (all dockets) and the exact `waits` array (low) [src/pipeline/connectors/courtListener.test.ts]
- [ ] [Review][Patch] The five-docket test no longer ties the finish time to the deadlines: restore the `CONNECTOR_TIMEOUT_MS` import and add `expect(finishMs).toBeGreaterThan(CONNECTOR_TIMEOUT_MS)` and `expect(finishMs).toBeLessThan(COURTLISTENER_POLL_TIMEOUT_MS)` (low) [src/pipeline/connectors/courtListener.test.ts]
- [ ] [Review][Patch] The zero-wait deadline stop after an earlier 429 (the `seenRateLimit` branch moved ahead of the early return) has no test: add a case with a 429, a recovered request, then a zero-wait stop with too little time left; assert `reason: "http_429"`, `status: 429` and the deadline detail (low) [src/pipeline/connectors/courtListener.test.ts]
- [ ] [Review][Patch] Dev Agent Record is out of order: the round-2 "✅ Resolved" lines and "Re-review verification … 1,498" sit above the round-1 `timeouts.ts` entry and "Review follow-up verification … 1,495"; move the new block after the round-1 lines (low) [3-38 story file, Dev Agent Record]

#### Rejected (second fix re-review)

- Spacing or deadline stops after any earlier 429 in the poll are reported as `http_429`: consistent with the decision; per-request tracking adds complexity for low impact.
- The `pace` 429 has no attempts or server detail: rejected in both earlier passes.
- No time re-check after `beforeRequest`: needs a new guard for a negligible case.
- The deleted comment: the new comment covers it.
- The redaction token link: matches the harness env and would fail loudly.
- `find` on the skip event and the full-state token scan: both fail loudly or go beyond the AC.
- Constants-only sanity checks and vague story wording or File List: cosmetic or unverified.
- Spacing after the retry: already pinned by the other spacing tests.

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
- Exhausted 429 and an over-budget wait after a real 429 both skip the source as `http_429` with scrubbed detail and no Draft. A recovered 429 writes one Draft. The workflow test calls the provider twice for that Draft, not once per attempt.
- `run-daily-step` was not split. `CONNECTOR_TIMEOUT_MS` remains 60 seconds. `npm run check` exited 0. `npm test` exited 0: 1,482 passed, 6 skipped, 63 files. No deploy, staging, production, or paid-provider call.
- ✅ Resolved review finding [medium]: Wait-budget exhaustion with no 429 is `reason: "timeout"` and has no status. `http_429` remains only when a real 429 preceded the exhaustion.
- ✅ Resolved review finding [medium]: Before each wait, if that wait plus one `SOURCE_FETCH_TIMEOUT_MS` request would not fit in `COURTLISTENER_POLL_TIMEOUT_MS`, the poll stops. The reason is `http_429` after a real 429, otherwise `timeout`, with scrubbed detail.
- ✅ Resolved review finding [medium]: A deadline skip records `timeoutMs` from the enforced `DeadlineError` (`pollTimeoutMs` when the check sets it, otherwise 60 seconds).
- ✅ Resolved review finding [medium]: Tests exercise real `defaultWait`, including abort during a wait and timer cleanup after a completed interval.
- ✅ Resolved review finding [medium]: A moving clock covers remaining-interval waits, including the gap between pagination pages.
- ✅ Resolved review finding [medium]: 401, 403, 500, and 502 each assert one fetch and no waits.
- ✅ Resolved review finding [medium]: A workflow Run that exhausts HTTP 429 finishes `failed` with zero Drafts and no provider call.
- ✅ Resolved review finding [low]: The run-ownership guard runs after the pace wait and immediately before the request.
- ✅ Resolved review finding [low]: HTTP-date `Retry-After` uses the injected `nowMs` clock.
- ✅ Resolved review finding [low]: HTTP-date fixtures use Saturday 10 Oct 2026 and Sunday 11 Oct 2026.
- ✅ Resolved review finding [low]: The five-docket poll is still running just before it finishes and completes inside the 8-minute poll budget. Pacing is measured from request start, so 11-second fetches leave 4-second gaps and the poll finishes at 71 seconds, not 115.
- ✅ Resolved review finding [medium]: Real waits are asserted at 14.9 s (1 call) and 15 s (2 calls), and the same way for a 60-second 429 backoff.
- ✅ Resolved review finding [medium]: A moving clock with `waitMs <= timeLeft < waitMs + 12 s` stops before the fetch. The equal boundary `timeLeft = waitMs + 12 s` still fetches.
- ✅ Resolved review finding [low]: The poll-deadline check runs even when no spacing wait is needed, so a request with under 12 seconds left does not start.
- ✅ Resolved review finding [low]: A spacing-only stop uses detail `wait budget exhausted`. `rate limit wait budget exhausted` stays for a stop after a real 429.
- ✅ Resolved review finding [low]: The exhausted-429 workflow test asserts status 429, 3 attempts, scrubbed detail, fetch count `COURTLISTENER_MAX_ATTEMPTS`, and that the token is absent from evidence.
- Re-review verification: `npm run check` exited 0. `npm test` exited 0: 1,498 passed, 6 skipped, 63 files. No deploy, staging, production, or paid-provider call. Rejected re-review items were left unchanged.
- ✅ Resolved review finding [low]: `timeouts.ts` describes `pollTimeoutMs` as the CourtListener per-check deadline. The constants in that module stay fixed.
- Review follow-up verification: `npm run check` exited 0. `npm test` exited 0: 1,495 passed, 6 skipped, 63 files. No deploy, staging, production, or paid-provider call. The deferred epics.md item and the rejected findings were left unchanged.

### File List

- `_bmad-output/implementation-artifacts/3-38-pace-courtlistener-requests-and-recover-from-http-429.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/epic-3-context.md`
- `_bmad-output/implementation-artifacts/spec-3-36-verify-the-corrected-staging-run-and-gateway.md`
- `_bmad-output/planning-artifacts/epics.md`
- `src/pipeline/connectors/connector.ts`
- `src/pipeline/connectors/connector.test.ts`
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
- 2026-10-10: Addressed code review findings - 12 items resolved (Date: 2026-10-10). Status review.
- 2026-10-10: Addressed code review findings - 6 items resolved (Date: 2026-10-10). The five-docket poll finishes at 71 seconds. Status review.
