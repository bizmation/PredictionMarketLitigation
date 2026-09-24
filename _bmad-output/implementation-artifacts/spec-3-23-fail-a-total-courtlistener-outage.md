---
title: 'Fail a total CourtListener outage'
type: 'bugfix'
created: '2026-09-24'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** When every CourtListener docket returns an isolated error (live Runs: HTTP 400), the poll still writes `source.fetched` with `failed` false and `itemCount: 1` (one summary object). A zero-draft Run then finishes `empty`, so a day the connector could not read looks like “nothing new.”

**Approach:** If one or more dockets were polled and every one of them errored, keep `source.fetched` (each docket’s status and a scrubbed response reason, never the API token) but mark the connector failed so the zero-draft Run finishes `failed`. `itemCount` is the number of new entries. One docket error beside a docket that returned entries stays non-fatal. 401, 403, 429, 5xx, network, and timeout still fail the source on the first such response. A healthy poll with nothing new stays `empty`. Configured-docket absence stays `no_dockets`.

</frozen-after-approval>

## Implementation Notes

- A total outage stays `source.fetched`. `SourceItem.failed` is set only when every polled docket has `summary.error`. `runConnector` then returns `failed: true` after writing the summary, so `completeDailyStep` finishes the zero-draft Run `failed`.
- Scrubbed text is `detail`: whitespace collapsed, the API token replaced with `[redacted]`, capped at 180 characters. Typed `error` and HTTP `status` stay. Malformed JSON has no body left to read, so it still has no `detail`.
- `itemCount` counts entities (new entries), not `SourceItem`s. A summary-only fetch is `0`.
- `FetchImpl` now includes `text` so an error body can be read. 401/403/429/5xx still escalate on the first response and carry `detail` when a body was read.
- The budget-stop daily-run test used a frozen 2026-09-22 clock against a wall-clock `startedAt`, so `completed_at >= started_at` failed once the real date passed that stamp. That one call now uses a timestamp after insertion.

## Review Triage Log

- `low` — generic `SourceItem.failed` has no direct connector test. Rejected: the CourtListener total-outage test already drives `runConnector` to `{ draftCount: 0, failed: true }` with `source.fetched`.
- `low` — no unit tests for `scrubResponseDetail` edges. Rejected: one integration case pins redaction, and extra cases would not change the helper.
- `low` — 401/403/429/5xx tests do not assert `detail`. Rejected: `toMatchObject` allows it; the total-outage test pins the scrubbed field.
- `false` — `source.fetched` needs its own failure flag. The Run status is `failed`, `run.failed` is written, and each docket keeps `status` and `detail`.
- `low` — `SourceItem.failed` JSDoc was CourtListener-specific. Patched to the generic meaning.
- `false` — module header does not say isolated 4xx is non-fatal. It omitted the all-errored rule; that sentence was added.
- `false` — a healthy docket plus an error could regress to total failure unnoticed. The isolation test expects `failed: false` when one docket 404s and another returns entries.
- `low` — 404 expectation hard-codes the stub's `{"results":[]}`. Rejected: that is the body the stub sends and the scrubber stores.
- `false` — Implementation Notes misstate malformed handling. They describe the ok+malformed path, which consumes the body in `json()` and stores no `detail`.
- `maybe-false` — non-exact token echoes could reach Evidence. Deferred. A real 400 body would settle it. Unverified severity: medium.
- `false` — the budget-stop clock override is still calendar-sensitive. Stop time is one second after wall-clock insertion, so `completed_at >= started_at` holds on any date.
