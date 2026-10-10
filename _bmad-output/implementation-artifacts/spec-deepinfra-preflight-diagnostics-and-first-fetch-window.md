---
title: 'Diagnose DeepInfra cost-policy failures and cap the first docket fetch'
type: 'bugfix'
created: '2026-10-10'
status: 'done'
route: 'dispatch'
baseline_commit: '402107e90b99981ae7abc823d52fac6af93d514b'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Run `run-20261010-0003` (main `5ee23f6`) stored 335 drafts as `evals_not_run` with basis `Evaluation did not complete: cost_policy_invalid`, and spent $0. The DeepInfra policy is valid through `2026-10-11T19:10:00Z`, and a desktop `/models/list` fetch passes. The Worker catch hides the cause. With no stored events, `sources.published_at` reaches back to `2025-11-28`, so a later success still reserves about 16 cents a call against the USD 1 cap.

**Approach:** Keep code `cost_policy_invalid`, name the stage, and record the failure on the error, the draft basis, and one log. Send a User-Agent and `Accept: application/json` on the catalog request. On the `source_published_at` path only, use the later of that baseline and `FIRST_FETCH_WINDOW_DAYS` (default 7) before the ET run date.

## Boundaries & Constraints

**Always:** Stages are `policy_lookup`, `policy_model_mismatch`, `deepinfra_preflight`, `openrouter_preflight`, and `revalidate_before_inference`. Basis and `GatewayError` message are `cost_policy_invalid: <stage>`, plus ` (http <status>)` when a status exists. Example: `cost_policy_invalid: deepinfra_preflight (http 403)`. Siblings stopped by that error use the same basis. Detail and one `console.warn` object also include a caught error's name and message, HTTP status, a whitespace-collapsed body prefix of at most 180 characters, and the failed field. No secrets, keys, or headers. Catalog headers are `User-Agent: PredictionMarketLitigation/0.1.0 (+https://predictionmarketlitigation.com)` and `Accept: application/json`; `redirect: "error"` stays. `FIRST_FETCH_WINDOW_DAYS` is an optional Worker var, default 7. An integer from 1 through 30 is used, including a leading zero. A larger integer, or any other set value, falls back to 7 and the log includes that rejected text. Unset uses 7 with no log. `wrangler.jsonc` has no `vars` block, so the code default is the convention. The run date is the `America/New_York` date of `deps.now()`. The cutoff is the later of `published_at` and that date minus the window, inclusive for the client filter, pagination stop, and `date_filed__gte`. The summary adds `effectiveCutoff` and `olderEntriesNotRequested: true`. `date_filed__gte` is that cutoff, so older rows are not requested. A row that still comes back before the cutoff is not drafted. The `MAX(occurred_at)` path and a null baseline stay unchanged. A budget ceiling hit during evaluation marks the in-progress and remaining drafts `evals_not_run`, settles completed calls, opens no new reservation, leaves the run `stopped` rather than `failed`, and leaves reserved cents, uncertain cents, and accounting issues at zero.

**Never:** Do not deploy, start a Run, or change Cloudflare or staging. Do not change 3.36 (`in-progress`) or 3.37 (`backlog`). Do not change `costPolicy.ts` or the public code. Do not backfill older history (deferred). Do not add a draft-count cap, Queues, or a new checkpoint.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Other stages | Bad policy, mismatch, OpenRouter, or revalidate | Basis names that stage; OpenRouter records status, field, or the caught error | DeepInfra must not relabel revalidate |
| Recent first fetch | `published_at` later than the window start | Cutoff stays `published_at` | N/A |
| No baseline | No event date and no `published_at` | No `date_filed__gte` | N/A |
| Invalid window | `FIRST_FETCH_WINDOW_DAYS` is `0`, blank, not an integer, or greater than 30 | Window is 7 and one log records the fallback and the rejected text | N/A |
| Run 0003 dates | Run date 2026-10-11; filings 10-05 (3), 10-02 (3), 10-01 (1), 09-28 (2), 09-25 (1) | Cutoff `2026-10-04`; the 10-05 entries are drafted; 10-02 and older are not requested; `olderEntriesNotRequested` is true | N/A |
| Budget ceiling | A settled call leaves the next call over the run budget | Remaining drafts are `evals_not_run`; run is `stopped`, not `failed`; reserved, uncertain, and issue counts are 0 | No new reservation |

</frozen-after-approval>

## Code Map

- `src/pipeline/ai/gateway.ts` — Five `cost_policy_invalid` sites: policy catch, model mismatch, `revalidateBeforeInference`, OpenRouter preflight, DeepInfra preflight. Move DeepInfra revalidate out of the bare catch. Do not change reservation or `costPolicy.ts`.
- `src/pipeline/ai/deepinfra.test.ts` — Catalog fetch sends no headers today. Pin the new ones. Bound is 16 cents.
- `src/pipeline/ai/gateway.test.ts` — Add stage, status, and field on OpenRouter refusals.
- `src/pipeline/agents/draftAndReview.ts` — Basis is `Evaluation did not complete: ${code}`; siblings get a generic skip. This code stops the run. Keep that, and use the public message for both.
- `src/pipeline/connectors/courtListener.ts` — `entriesUrl`, baseline, summary, and client skip. Reuse `etCalendarDate`. Parse `FIRST_FETCH_WINDOW_DAYS` here. Do not change pace, 429, or timeouts.
- `src/pipeline/connectors/courtListener.test.ts` — Default `now` is `2026-09-18T16:00:00.000Z`, so a 7-day window moves the Furcolo first-fetch cutoff to `2026-09-11`. Keep null baseline and the `2026-09-12` MAX cutoff. Update first-fetch expectations that assumed `published_at` was the cutoff.
- `src/pipeline/workflow/dailyRun.ts` — `sourceChecksFromEnv` (94) passes the token only. Pass the parsed window. Admission block is 270–282: `running`, `awaiting`, reserved, uncertain, or issue count. `stopped` is not in that list.
- `src/pipeline/agents/draftAndReview.ts` — Budget stop returns at 869–870 after stamping siblings. Do not throw that path.
- `src/pipeline/workflow/dailyRunSteps.ts` — `afterPackaging` calls `completeDailyStep` only while status is `running` (251). A `stopped` run must not become `failed`.
- `src/pipeline/ai/gateway.ts` — Ceiling refusal is before `reserve` (335). Successful calls `settle` (520).
- `src/access-env.d.ts` — Optional `FIRST_FETCH_WINDOW_DAYS?: string | number`, with the other hand-written Env fields. A JSON number is accepted. Do not add a `wrangler.jsonc` `vars` block.
- `src/server.ts` — Admin 503 returns `error.message`. Log one object, like `courtlistener_request_timeout`.

## Tasks & Acceptance

**Execution:**
- [x] `src/pipeline/ai/gateway.ts` -- Add stages, message, detail, one log, named fields, and catalog headers.
- [x] `src/pipeline/ai/deepinfra.test.ts` -- Cover 403, a named field, a thrown fetch, headers, and no secrets.
- [x] `src/pipeline/ai/gateway.test.ts` -- Cover the other four stages.
- [x] `src/pipeline/agents/draftAndReview.ts` -- Use the public message for this code, including stopped siblings.
- [x] `src/pipeline/agents/draftAndReview.test.ts` -- Assert the basis.
- [x] `src/pipeline/connectors/courtListener.ts` -- Apply the configurable window on `source_published_at` only and record the two summary fields.
- [x] `src/access-env.d.ts` -- Add optional `FIRST_FETCH_WINDOW_DAYS`.
- [x] `src/pipeline/workflow/dailyRun.ts` -- Pass the parsed window into the CourtListener check.
- [x] `src/pipeline/connectors/courtListener.test.ts` -- Cover the 0003 distribution, the inclusive cutoff boundary, an invalid window, and the unchanged MAX cutoff.
- [x] `src/pipeline/agents/draftAndReview.test.ts` -- Assert a mid-evaluation budget ceiling leaves no reserved, uncertain, or issue cents and does not fail the run. Fix the code only if that fails.

**Acceptance Criteria:**
- Given a non-OK catalog response, when preflight throws, then the code stays `cost_policy_invalid`, the basis matches the Boundaries example, and the log has the detail fields with no secret or header.
- Given any other `cost_policy_invalid` site, when it throws, then the basis names only that stage.
- Given the catalog request, when it is sent, then it carries the User-Agent and `Accept` from Boundaries.
- Given no stored events, `published_at` older than the window, and the default of 7, when the docket is polled, then `date_filed__gte` is the cutoff, that date is drafted, the day before is not, and the summary has `effectiveCutoff` and `olderEntriesNotRequested: true`.
- Given run date `2026-10-11` and the 0003 filing counts, when the docket is polled, then `effectiveCutoff` is `2026-10-04`, `date_filed__gte` is that cutoff, the three `2026-10-05` entries are drafted, `2026-10-02` and older are not requested, and `olderEntriesNotRequested` is true.
- Given `FIRST_FETCH_WINDOW_DAYS` is not an integer from 1 through 30, when it is read, then the window is 7 and one log records the fallback and the rejected text.
- Given `MAX(occurred_at)` date D, when that docket is polled, then `date_filed__gte` is D and the window fields are absent.
- Given a settled call and a next call over the run budget, when evaluation stops, then the remaining drafts are `evals_not_run`, the run is `stopped` rather than `failed`, and reserved cents, uncertain cents, and accounting issues are 0.

## Implementation Notes

- `npm run check` exit 0. `npm test` exit 0 (1514 passed, 6 skipped).
- Review patches: `npm run check` exit 0. `npm test` exit 0 (1519 passed, 6 skipped). The window is 1 through 30, invalid text is logged, and the diagnostic, status, and draft-basis tests cover the patched findings.
- The budget ceiling already settles the completed call, refuses the next call before `reserve`, stamps remaining drafts `evals_not_run`, returns `{ budgetStopped: true }`, and leaves the run `stopped`. Admission ignores that status. The new assertions lock reserved cents, uncertain cents, and issue count at 0. No production change was required on that path.
- `sourceChecksFromEnv` accepts an optional `now` so tests can pin the ET run date. Production leaves it unset and uses the wall clock.
- Code review patches: `npm run check` exit 0. `npm test` exit 0 (1536 passed, 6 skipped). A JSON number is a valid window, and an out-of-range code value logs the same fallback. First-fetch evidence records `effectiveCutoff` and `olderEntriesNotRequested: true`. OpenRouter field refusals and the non-cost-policy draft basis are pinned.

## Spec Change Log

- 2026-10-10 review: the window is an integer from 1 through 30. 30 covers the 16-day span of run 0003 (2026-09-25 through 2026-10-05) and cannot reach the oldest seeded docket, 2025-11-28. A larger or invalid value falls back to 7, and the log includes the rejected text. A leading zero, such as `08`, is that integer.
- 2026-10-10 code review: a JSON number is a valid window. An out-of-range value passed in code logs the same fallback. The first-fetch summary drops `skippedOlder` and records `olderEntriesNotRequested: true`, because `date_filed__gte` means those rows are not requested. OpenRouter field refusals and the non-cost-policy draft basis are pinned by tests.

## Review Triage Log

- `[high]` `[patch]` A huge safe integer throws inside `calendarDaysBefore` and fails the poll (edge `courtListener.ts:217-235`, claim). `setUTCDate` of an extreme offset makes `toISOString` throw. Fixed: values outside 1–30 fall back to 7 before any date math, including a raw dep.
- `[high]` `[patch]` No upper bound, the fallback log drops the rejected text, and `08` is rejected (blind). `08` is the integer 8. Fixed with the cap, the log field `value`, and acceptance of leading zeros.
- `[medium]` `[patch]` A non-default `FIRST_FETCH_WINDOW_DAYS` never reaches a docket cutoff (verification-gap, blind). Fixed: the `sourceChecksFromEnv` poll sets `3`, drafts 2026-09-20, and excludes 2026-09-15, with `date_filed__gte` and `effectiveCutoff` of 2026-09-17.
- `[medium]` `[patch]` The 180-character collapse is unenforced, and some warn spies pass when nothing is logged (verification-gap, blind). Fixed: a newline-heavy body over 180 characters is asserted on the error and the warn object. The claim that `policy_model_mismatch` must name a field is false: that stage is one code for both sides of the mismatch.
- `[medium]` `[patch]` The OpenRouter catch for a thrown endpoints fetch has no test (verification-gap). Fixed: a `TypeError` asserts the stage, `errorName`, and `errorMessage`.
- `[medium]` `[patch]` A failed `text()` on a non-OK preflight can drop the status without a test noticing (verification-gap). The inner catch already rethrows with the status when the deadline has not won. Fixed: both 403 tests reject `text()` and still expect `(http 403)`.
- `[medium]` `[patch]` The draft basis test never uses `cost_policy_invalid: deepinfra_preflight (http 403)` (blind). The sibling path copies `err.message`, which the policy-lookup test already covers. Fixed: a preflight `GatewayError` with that message is the basis on both drafts.
- `[low]` `[patch]` The catalog success test allows an extra `Authorization` header (blind). Fixed: the header list is only `accept` and `user-agent`.
- `[low]` `[reject]` A deadline that wins while a non-OK body is still reading omits the HTTP status (edge). `withAbortableDeadline` already replaces an aborted read with `DeadlineError`. That path is a 60-second stall after headers arrived. Preserving the status would thread new state through the deadline wrapper.
- `[low]` `[reject]` A non-OK catalog or endpoints body is buffered before the 180-character slice (edge, blind). The logged prefix is already capped. Reading the body through a stream and cancelling the rest is a new reader, not a direct correction. Error bodies on this preflight are small.
- `[low]` `[reject]` `diagnosticText` redacts only `bearer` plus whitespace, so other secret shapes can be logged (edge, claim, blind, verification-gap other). The catalog request sends no credential, and inference failures use a fixed message. The specified redaction is the bearer form. Adding `api_key` and `sk-` patterns is a new policy.
- `[low]` `[reject]` Pagination does not show a second page stopping at the first-fetch cutoff (blind). `fetchEntries` already stops on the same floor, and the stored-development test covers that stop. A second first-fetch page would be a new scenario.
- `[false]` `[reject]` `latestEntryDate` can later become the `docket_events` baseline (blind). The field is only on the `source.fetched` summary. The next baseline is `MAX(occurred_at)` of published rows, and entries before the cutoff are not drafted.
- `[false]` `[reject]` A date-only `now` is the previous ET date, and month boundaries are untested (blind). `etCalendarDate` of UTC midnight is the previous ET date on purpose. Production uses a full timestamp. Month subtraction is covered by the June-to-May cutoff test added with the window cap.
- `[false]` `[reject]` The budget test misses `evals_not_run`, a voided spend, and `afterPackaging` (blind). The same test already expects both drafts to be `evals_not_run`, and `provider.count() === 1` fails if the settled spend does not reach the ceiling. `afterPackaging` calls `completeDailyStep` only while status is `running` (`dailyRunSteps.ts:251`). `finalizeIfRunning` returns before that call when the run is stopped.

## Design Notes

Run `0003`'s newest filings are three entries on `2026-10-05`. A 2-day window before `2026-10-11` excludes them and the run is empty. Seven days sets the cutoff at `2026-10-04`, drafts those three, and reserves 96 cents. The operator can set the window up to 30 days: that still covers the 16-day span back to `2026-09-25`, and it cannot reach the oldest seeded docket on `2025-11-28`. There is no `vars` block in `wrangler.jsonc`, so the default lives in code and `Env`.

## Verification

**Commands:**
- `npm run check` -- expected: exit 0
- `npm test` -- expected: exit 0
