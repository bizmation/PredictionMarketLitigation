---
title: 'Retry a CourtListener request timeout and narrow the docket window'
type: 'bugfix'
created: '2026-10-10'
status: 'done'
route: 'dispatch'
baseline_commit: '16b6153b19fbfe91a88c733c55e9ea42d9f8afec'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Staging Run `run-20261010-0002` failed about 192s in because the CourtListener request for docket `73242633` hit the 12s per-request limit. That timeout fails the whole source, so zero drafts become Run `failed`. The 3.38 budgets did not fire, and Observability had no log.

**Approach:** Retry that timeout through `pace`, record it in evidence and one structured log, and give CourtListener its own 20s request timeout. Add `date_filed__gte` only at the baseline date pagination already stops on.

## Boundaries & Constraints

**Always:** Retry a `TimeoutError` through `pace(0)` up to 3 attempts. Pace keeps 15s start spacing, the 6-minute wait budget, and the 8-minute poll deadline. An exhausted timeout with no 429 on that request is `source.skipped` `reason: "timeout"` with no `status`. The skip and one console object include kind `docket-entries`, docket, elapsed ms, `timeoutMs`, and attempt. The CourtListener request timeout is 20000 and is the poll margin. The shared fetch timeout stays 12000. Set `date_filed__gte` to the baseline date `fetchEntries` already uses (`oldest >= baseline`; keep `date >= baseline`), taken from `MAX(occurred_at)` or `sources.published_at`. No new checkpoint and no shifted date. A null baseline sends no filter. Follow `next` and the 5-page cap.

**Never:** Deferred, do not build: skip unchanged dockets via `date_modified`; CourtListener webhooks or alerts; paid docket providers. If `date_filed__gte` would need new stored state or a cutoff other than that baseline, omit it and leave query narrowing deferred. Do not deploy, trigger a Run, or change Cloudflare. Do not change 3.36 (`in-progress`) or 3.37 (`backlog`). Do not split `run-daily-step`, add Queues, or redraft because a fetch retried. Do not log the API token. 401, 403, 5xx, network, unsafe URL, and redirect stay fail-on-first.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Recovered timeout | Attempt 1 times out; attempt 2 is 200 | One Draft set; log for attempt 1; docket summary lists it | N/A |
| Three timeouts | No 429 on that URL | Skip `timeout`, `attempt: 3`, `timeoutMs: 20000`, docket, elapsed ms, no `status`; Run `failed` | Log each attempt |
| Prior 429, then this URL times out 3 times | A 429 already happened on another request | This skip stays `timeout` | 429 path unchanged |
| Retry wait misses deadline or budget | Pace cannot fit the next wait | Existing stop; `http_429` only after a real 429 | No extra request |
| Boundary dates | Baseline date D already in D1 | URL cutoff is D; entries filed on D and the next day are drafted | The day before D stays undrafted |
| No baseline | No event date and no `published_at` | No `date_filed__gte` | Client date check remains |

</frozen-after-approval>

## Code Map

- `src/pipeline/connectors/courtListener.ts` — Change `defaultFetch`, the `TimeoutError` branch, the pace margin, and `entriesUrl`. Reuse `pace`, the 3-attempt cap, and `next` validation. Do not change 429 backoff. `timeout` is source-level today.
- `src/pipeline/connectors/courtListener.test.ts` — Update the 12s hang test, the deadline-margin tests, the 71s five-docket test (`4 * 15s + 11s`), and the `entriesUrl` assertion. `stubFetch` already routes on `docket`.
- `src/pipeline/connectors/connector.ts` — `observe` already copies skip detail. No edit.
- `src/shared/lib/timeouts.ts` — Comment only. `SOURCE_FETCH_TIMEOUT_MS` stays 12000.
- `src/pipeline/workflow/dailyRunSteps.ts` — Do not change `finishFailed`. Detail stays on `source.skipped`.
- `src/server.ts` — Workers Logs indexes one object argument.

## Tasks & Acceptance

**Execution:**
- [x] `src/pipeline/connectors/courtListener.ts` -- Add the 20s timeout, retry through `pace(0)`, log and record each attempt, and set `date_filed__gte` to the existing baseline only. -- Fixes the incident.
- [x] `src/shared/lib/timeouts.ts` -- Note the CourtListener timeout in the comment. Do not change the shared constant. -- Other sources stay on 12s.
- [x] `src/pipeline/connectors/courtListener.test.ts` -- Cover the matrix, the 20s margin, the 95s finish, and the boundary-date regression. -- Locks the edges.

**Acceptance Criteria:**
- Given a CourtListener timeout and no 429 on that request, when an attempt remains, then the next try goes through `pace` and still obeys 15s spacing, the wait budget, and the poll deadline.
- Given three timeouts and no 429, when the source is skipped, then the payload is `reason: "timeout"` with kind `docket-entries`, docket, elapsed ms, `timeoutMs` 20000, and attempt 3, and it has no `status`.
- Given a timed-out attempt, when it fails, then one console object carries those fields and not the token.
- Given baseline date D, when that docket is polled, then `date_filed__gte` is D, an entry filed on D is drafted, and an entry filed the next day is drafted.
- Given five fetches of `COURTLISTENER_FETCH_TIMEOUT_MS - 1s`, when the poll finishes, then elapsed time is 95s, above 60s and below 8 minutes.

## Implementation Notes

## Spec Change Log

## Review Triage Log

### 2026-10-10 — Review pass (`2f8df45`)
- verdicts: 11 findings — high 0, medium 4, low 2, false 5, maybe-false 0. Edge-case hunter returned no findings.
- survivors: 6 patch (event-date cutoff pin, independent URL cutoff, one network call, console `elapsedMs`, prior-429 call order, header sentence and warn restore)
- findings:
  - `[false]` `[reject]` Fatal timeout drops earlier `timeouts` and earlier pages (blind-hunter) — the skip is specified to carry the last attempt, and each attempt is logged before the throw. The summary array is the success-path record. A fatal throw has no summary.
  - `[false]` `[reject]` Same-page 429 then a final timeout stays `timeout` (blind-hunter) — a terminal `TimeoutError` stays `timeout`. `seenRateLimit` selects only the pace-stop reason. The matrix row is a 429 on another request, and that skip stays `timeout`.
  - `[low]` `[patch]` The prior-429 hang test never shows Illinois was answered before the hang (blind-hunter) — `check()` waits are instant, so 60s is enough for three 20s hangs. The test still did not record the 429. Fixed: Illinois is called twice before docket `72237443` hangs three times.
  - `[medium]` `[patch]` Credential and pagination URL checks round-trip `date_filed__gte` (blind-hunter) — a missing or shifted cutoff still matched. Fixed: those URLs must equal `entriesUrl` for the known baseline, including Furcolo `2026-09-12` after the published development.
  - `[false]` `[reject]` A `next` link that omits the filter reopens the window (blind-hunter) — the spec says follow `next`. `pollDocket` still skips `date < baseline`, so a later page cannot draft the day before.
  - `[false]` `[reject]` A non-ISO baseline omits the filter and widens the pull (blind-hunter) — `occurred_at` and `sources.published_at` are `YYYY-MM-DD` checks, so `pollDocket` cannot read a non-ISO baseline. Omitting an invalid cutoff does not drop entries.
  - `[false]` `[reject]` Timeout retries are not shown to obey pace, budget, and the deadline (blind-hunter) — `spaces timeout retries` requires two 15s waits and exactly 3 fetches, so a retry that skips `pace` fails. The budget and deadline checks are inside that `pace`, which the existing stop tests cover.
  - `[low]` `[patch]` The header says 429 retries only, and a failed expect leaves `console.warn` mocked (blind-hunter) — the log and `run.failed {reason:"error"}` claims are already specified and tested. Fixed: the header no longer says "only", and both warn spies restore in `finally`.
  - `[medium]` `[patch]` `date_filed__gte` is not pinned when the event date differs from `published_at` (verification-gap) — sending `2026-05-21` would still pass. Fixed: the published-development test expects `date_filed__gte=2026-09-12`.
  - `[medium]` `[patch]` A thrown network error can be retried without failing its test (verification-gap) — the catch throws on the first non-timeout, but the test never counted calls. Fixed: that test expects one call.
  - `[medium]` `[patch]` The timeout console object is not checked for `elapsedMs` (verification-gap) — deleting the field from `console.warn` would still pass. Fixed: each hung-request warn argument includes `elapsedMs`.

## Design Notes

The shared 12s cap protects a 60s deadline CourtListener no longer uses, so its cap is 20s and the pace margin matches it. A 19s fetch exceeds the 15s gap, so five fetches finish at 95s.

`date_filed__gte` is inclusive (v4 `field__lookup`; docket-entries `date_filed` lists `gte`). The cutoff is that baseline string, not a new last-checked value. `occurred_at` and `sources.published_at` are already `YYYY-MM-DD`.

## Verification

**Commands:**
- `npm run check` -- expected: exit 0
- `npm test` -- expected: exit 0
