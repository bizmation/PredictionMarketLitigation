---
title: 'Retry a CourtListener request timeout and narrow the docket window'
type: 'bugfix'
created: '2026-10-10'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Staging Run `run-20261010-0002` failed about 192s in because the CourtListener request for docket `73242633` hit the 12s per-request limit. That timeout fails the whole source, so zero drafts become Run `failed`. The 3.38 budgets did not fire, and Observability had no log.

**Approach:** Retry that timeout through `pace`, record it in evidence and one structured log, give CourtListener its own 20s request timeout, and limit the first docket-entries query to the filing window the connector already keeps.

## Boundaries & Constraints

**Always:** Retry a `TimeoutError` through `pace(0)` up to 3 attempts. Pace keeps 15s start spacing, the 6-minute wait budget, and the 8-minute poll deadline. An exhausted timeout with no 429 on that request is `source.skipped` `reason: "timeout"` with no `status`. The skip and one console object include kind `docket-entries`, docket, elapsed ms, `timeoutMs`, and attempt. The CourtListener request timeout is 20000 and is the poll margin. The shared fetch timeout stays 12000. A `YYYY-MM-DD` baseline sets inclusive `date_filed__gte` on the first URL only. Follow `next`, keep the 5-page cap, and keep same-day entries. No baseline means no date filter.

**Never:** Deferred, do not build: skip unchanged dockets via `date_modified`; CourtListener webhooks or alerts; paid docket providers. Do not deploy, trigger a Run, or change Cloudflare. Do not change 3.36 (`in-progress`) or 3.37 (`backlog`). Do not split `run-daily-step`, add Queues, or redraft because a fetch retried. Do not log the API token. 401, 403, 5xx, network, unsafe URL, and redirect stay fail-on-first.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Recovered timeout | Attempt 1 times out; attempt 2 is 200 | One Draft set; log for attempt 1; docket summary lists it | N/A |
| Three timeouts | No 429 on that URL | Skip `timeout`, `attempt: 3`, `timeoutMs: 20000`, docket, elapsed ms, no `status`; Run `failed` | Log each attempt |
| Prior 429, then this URL times out 3 times | A 429 already happened on another request | This skip stays `timeout` | 429 path unchanged |
| Retry wait misses deadline or budget | Pace cannot fit the next wait | Existing stop; `http_429` only after a real 429 | No extra request |
| Baseline `YYYY-MM-DD` | Latest event or `published_at` | First URL has `date_filed__gte`; same-day entry kept | Older dates not drafted |
| No or invalid baseline | Null, or not `YYYY-MM-DD` | No date filter; client date check remains | Do not send a bad value |

</frozen-after-approval>

## Code Map

- `src/pipeline/connectors/courtListener.ts` — Change `defaultFetch`, `fetchPage`'s `TimeoutError` branch, `pace`'s margin, and `entriesUrl`. Reuse `pace`, the 3-attempt cap, `next` validation, and the `date >= baseline` keep. Do not change 429 backoff. `timeout` is source-level today, so one miss aborts the poll.
- `src/pipeline/connectors/courtListener.test.ts` — Update the 12s hang test, the deadline-margin tests, the 71s five-docket test (`4 * 15s + 11s`), and the `entriesUrl` assertion. `stubFetch` already routes on `docket`.
- `src/pipeline/connectors/connector.ts` — `observe` already copies skip detail. No edit.
- `src/shared/lib/timeouts.ts` — Comment only. `SOURCE_FETCH_TIMEOUT_MS` stays 12000.
- `src/pipeline/workflow/dailyRunSteps.ts` — Do not change `finishFailed`. Detail stays on `source.skipped`.
- `src/server.ts` — Pattern only. Workers Logs indexes one object argument.

## Tasks & Acceptance

**Execution:**
- [ ] `src/pipeline/connectors/courtListener.ts` -- Add the 20s timeout, retry through `pace(0)`, log and record each attempt, and add `date_filed__gte` on the first URL. -- Fixes the incident.
- [ ] `src/shared/lib/timeouts.ts` -- Note the CourtListener timeout in the comment. Do not change the shared constant. -- Other sources stay on 12s.
- [ ] `src/pipeline/connectors/courtListener.test.ts` -- Cover the matrix, the 20s margin, and the 95s five-docket finish. -- Locks the edges.

**Acceptance Criteria:**
- Given a CourtListener timeout and no 429 on that request, when an attempt remains, then the next try goes through `pace` and still obeys 15s spacing, the wait budget, and the poll deadline.
- Given three timeouts and no 429, when the source is skipped, then the payload is `reason: "timeout"` with kind `docket-entries`, docket, elapsed ms, `timeoutMs` 20000, and attempt 3, and it has no `status`.
- Given a timed-out attempt, when it fails, then one console object carries those fields and not the token.
- Given baseline `YYYY-MM-DD`, when the first page is requested, then the URL includes `date_filed__gte` for that date, `next` links still paginate, and a same-day entry is kept.
- Given five fetches of `COURTLISTENER_FETCH_TIMEOUT_MS - 1s`, when the poll finishes, then elapsed time is 95s, above 60s and below 8 minutes.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

CourtListener no longer uses the 60s connector deadline that the shared 12s cap protects, so its own cap is 20s. The pace margin must be 20s. A 19s fetch exceeds the 15s start gap, so five fetches finish at 95s, not `4 * 15s + 19s`. Timeout retry calls `pace(0)` and does not set `seenRateLimit`.

v4 query refinement uses `field__lookup` and ISO-8601 dates; `gte` is inclusive. Docket-entries `date_filed` includes lookup `gte` (CourtListener issue 6961). Unauthenticated OPTIONS returned 401. Use `date_filed__gte`.

## Verification

**Commands:**
- `npm run check` -- expected: exit 0
- `npm test` -- expected: exit 0
