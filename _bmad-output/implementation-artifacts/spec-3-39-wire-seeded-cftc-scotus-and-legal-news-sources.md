---
title: '3.39 — Wire seeded CFTC, SCOTUS, and legal-news sources'
type: 'feature'
created: '2026-10-22'
status: 'done'
route: 'dispatch'
baseline_commit: 'f234f8c3be99068b86a309cd602c45e650d91254'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/implementation-artifacts/3-39-wire-seeded-cftc-scotus-and-legal-news-sources.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A Run that finds nothing new on CourtListener still finishes empty while CFTC press, SCOTUS docket, and Legal news leads are skipped as `not wired`. Those three seeded sources are never fetched.

**Approach:** Register one check per seeded name. Each check performs a single same-origin fetch and records `source.fetched` with no entities, or a named access skip other than `not wired`. CourtListener stays as it is.

## Boundaries & Constraints

**Always:** Tiers come from the snapshotted source. A 200 returns `entities: []` plus `status`, `bytes`, and `contentType` truncated to 120 characters. Non-200 bodies are read only up to 8192 bytes before scrubbing. Each new check's `pollTimeoutMs` is 20 seconds. `redirect` is `manual`. Call `beforeRequest` immediately before `fetch`. Reuse `reasonForStatus` and `scrubResponseDetail`. `stubCheck` remains the fallback for an unknown name.

**Never:** Do not emit Drafts or write F1 from these three checks, even when the body contains a docket number. Do not send `authorization` or the CourtListener token. Do not retry, pace, paginate, follow redirects, or fetch a second URL. Do not change CourtListener pacing or fail-on-first behavior. Do not pass a step config to `run-daily-step`, add a dependency, migration, or secret, deploy, or call staging, production, or a paid model. Do not start story 3.40.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Consulted, nothing new | Token set; CourtListener has no new entries; each of the three returns 200 | Three `source.fetched` events, `itemCount` 0, `failed` false; Run `empty` | N/A |
| Token absent | `COURTLISTENER_API_TOKEN` unset | CourtListener skips `unconfigured` and is not fetched; the three still fetch | Their reasons are not `not wired` |
| Access skip beside CourtListener drafts | One of the three returns 403; CourtListener returns entries | That source skips `http_403`; CourtListener Drafts remain | `failed` true on the skip only |
| Access skip, no Drafts | One of the three returns 403; CourtListener adds nothing | Zero Drafts; Run `failed`, not `empty` | Do not force `empty` |
| Rate limit or server error | 429 or 5xx on one new check | One fetch; skip `http_429` or `http_5xx` | No retry |
| Redirect or foreign URL | 302, or a snapshotted URL on another origin | No second fetch; foreign URL is `unsafe_url` and is not fetched | Do not read `Location` or put the rejected URL in evidence |
| Docket number in a 200 body | Body contains `1:26-cv-03659` | Zero Drafts and zero new `docket_events` | N/A |
| Token present | Token set on the env | The three requests have no `authorization` header; the token is absent from evidence | N/A |

</frozen-after-approval>

## Code Map

- `src/pipeline/connectors/sources.ts` — `POLL_SOURCES` names, URLs, and tiers. Do not edit.
- `src/pipeline/workflow/dailyRun.ts` `sourceChecksFromEnv` — today returns only CourtListener. Add the three checks in `POLL_SOURCES` order. Do not pass the token, wait, clock, or database into them. `step.do("run-daily-step")` at line 350 takes no config.
- `src/pipeline/connectors/connector.ts` `stubCheck`, `observe`, `SourceUnavailableError`, `runConnector` — empty `stubCheck` is `not wired`; a real check with `fetched` and no entities is `source.fetched`; `SourceUnavailableError` is `source.skipped` with `failed: true`. Reuse this. Do not change it.
- `src/pipeline/workflow/dailyRunSteps.ts` `monitorAndPackage`, `completeDailyStep` — unknown names use `stubCheck`. Drafts finish `awaiting`; zero drafts plus `anyFailure` finish `failed`; otherwise `empty`.
- `src/pipeline/gate/f1Apply.ts` — live writes, including a Tier-1 `docket_events` insert. These checks must not create a Draft that approval could publish.
- `src/pipeline/connectors/courtListener.ts` `reasonForStatus`, `scrubResponseDetail`, `COURTLISTENER_POLL_TIMEOUT_MS` — reuse the helpers. Do not change pacing. `pollTimeoutMs` is attached with `Object.assign`.
- `src/shared/lib/timeouts.ts` — `SOURCE_FETCH_TIMEOUT_MS` is 12 seconds; `CONNECTOR_TIMEOUT_MS` is 60 seconds. Update the comment that says only CourtListener sets `pollTimeoutMs`. Do not change the constants.
- `src/pipeline/workflow/dailyRun.test.ts` — the story 3.21 registry tests expect only CourtListener and `not wired` for the rest. `src/pipeline/workflow/dailyRunRecovery.test.ts` asserts `run-daily-step` has no config. `connector.test.ts` passes its own check maps; leave the `not wired` leftover count alone.

## Tasks & Acceptance

**Execution:**
- [x] `src/pipeline/connectors/publicSource.ts` — one same-origin fetch and the 20-second, 1_000_000-byte, and 8192-byte caps — shared by the three checks. A failure from `reader.read()` in `readSuccessBody` or `readAtMost` uses the fetch map: rethrow `AbortError`, `TimeoutError` becomes `timeout`, any other read error becomes `network`. `SourceUnavailableError` from the byte cap still propagates. Do not `cancel()` the unread remainder: in this runtime that drains the rest of the stream, which reads a redirect body and reads past 8192 bytes.
- [x] `src/pipeline/connectors/cftcPress.ts`, `scotusDocket.ts`, `legalNewsLeads.ts` — thin factories for `https://www.cftc.gov`, `https://www.supremecourt.gov`, and `https://news.bloomberglaw.com`.
- [x] `src/pipeline/connectors/publicSource.test.ts` — stub `fetch` and cover the matrix rows that do not need a full Run. Include a body-read `TypeError` that rejects with `network`, and an `AbortError` from `reader.read()` that is not wrapped.
- [x] `src/pipeline/workflow/dailyRun.ts` — register the three checks.
- [x] `src/pipeline/workflow/dailyRun.test.ts` — replace the CourtListener-only registry assertions and cover empty versus failed Runs, plus the token header.
- [x] `src/shared/lib/timeouts.ts` — comment only.

**Acceptance Criteria:**
- Given poll-sources version 0, when a Run packages it, then CFTC press and SCOTUS docket are Tier-1, Legal news leads is Tier-2, and none of the three records `not wired`.
- Given the three new poll budgets plus the CourtListener poll budget, when they are added, then the sum is under 10 minutes.
- Given `npm run check` and `npm test`, when they run, then both exit 0. No deploy and no live or paid call.

## Implementation Notes

## Spec Change Log

- Trigger: body-read failures (`readSuccessBody`, `readAtMost`) leave `fetchSeededPage`'s catch and `observe` records `run.failed { reason: "error" }`. Blind-hunter, edge-case-hunter, and verification-gap all reported it. A 403 whose body read throws also loses `http_403`.
- Amended: the `publicSource.ts` task now maps those read errors the same way as `fetch` (`AbortError` rethrown, `TimeoutError` → `timeout`, anything else → `network`) and forbids `cancel()` of the unread remainder.
- Known-bad state avoided: a named skip other than `not wired`, and not reading past the 8192-byte cap or a redirect body.
- KEEP: one shared fetch; thin origin factories; `pollTimeoutMs` 20 seconds via `Object.assign`; `entities: []` on 200; `redirect: "manual"`; no `authorization`; `beforeRequest` after the origin guard; reuse `reasonForStatus` and `scrubResponseDetail`; caps 8192 and 1_000_000; `contentType` truncated to 120; registry order without the CourtListener token, wait, clock, or database; no `run-daily-step` config; CourtListener pacing unchanged; stubbed `fetch` only.

## Review Triage Log

- Blind-hunter, unread bodies on early exit. Verdict `low`, rejected. Cloudflare's simultaneous-connection limit stops counting a fetch once headers arrive, and the cited page says `cancel()` frees memory. It does not document a held connection or a warning. In this runtime `reader.cancel()` drains the remainder, so the fix would read past the cap. Users do not meet a held connection, and the fix is not a direct deletion.
- Blind-hunter, body-read errors escape the fetch catch. Verdict `medium`. `reader.read()` is outside `fetchSeededPage`, and `observe` maps a raw error to `run.failed { reason: "error" }` at `connector.ts`. Grouped with the edge-case and verification-gap body-read findings. Route `bad_spec`.
- Blind-hunter, `SOURCE_FETCH_TIMEOUT_MS` does not cover the body. Verdict `false`. `fetchWithTimeout` is specified to bound the request. `observe` bounds the whole check with `pollTimeoutMs` of 20 seconds and records `DeadlineError` as `source.skipped` timeout.
- Blind-hunter, status 0 and other 2xx. Verdict `false`. Workers `redirect: "manual"` returns the 3xx response. `reasonForStatus(204)` is `http_error`, which is the specified non-200 reason.
- Blind-hunter, no User-Agent and likely daily 403s. Verdict `maybe-false`. The story says the Workers runtime supplies the User-Agent, and this story cannot make the live call that would show a CDN 403. If that 403 were real it would be `high`. Route `defer`, not processed on this loopback.
- Blind-hunter, no content-type check or change hash. Verdict `false`. A 200 is specified to return `entities: []` plus status, bytes, and contentType. The fix would edit the frozen contract.
- Blind-hunter, duplicated origin strings. Verdict `false`. The tasks require thin factories that pass the origin. A mismatch fails closed as `unsafe_url`.
- Blind-hunter, dead `SourceUnavailableError` branch in `guardedUrl`. Verdict `low`. Nothing in the `try` throws that type. Route `patch`, not processed on this loopback.
- Blind-hunter, CourtListener `.every()` is vacuous. Verdict `false`. The same test already requires an Illinois CourtListener URL before that assertion. With no such call, `new URL` throws.
- Blind-hunter, `"tok"` substring. Verdict `low`. The token is the letters `tok`, so a later payload containing `token` fails the assertion for the wrong reason. Route `patch`, not processed on this loopback.
- Blind-hunter, 403-beside-drafts expects `running`. Verdict `low`. `packageDailyRun` leaves a Run with drafts `running` for `reviewDailyRun`. The assertion matches that. A comment would be the fix. Route `patch`, not processed on this loopback.
- Blind-hunter, failed-run test omits sibling evidence. Verdict `medium`. The test checks draft count and `failed` status only, so a registry that never fetched the other sources could still pass. Route `patch`, not processed on this loopback.
- Blind-hunter, missing boundary tests. Verdict `low`, rejected. Everyday use does not hit an untested chunk boundary, and adding those cases is more than a direct correction.
- Blind-hunter, 180-character expectation is implicit. Verdict `low`. The expected detail length is `scrubResponseDetail`'s cap, which the test does not name. Route `patch`, not processed on this loopback.
- Blind-hunter, spec `in-review` versus sprint `in-progress`. Verdict `false`. Step 3 sets the sprint key and step 4 sets the spec status. They are different fields.
- Blind-hunter, redirect test locks an open body. Verdict `false`. The test locks the required "do not read the redirect body" behavior.
- Edge-case-hunter, body stream error. Verdict `medium`. Same `observe` mapping as the blind-hunter body-read finding. Route `bad_spec`.
- Edge-case-hunter, 3xx body not cancelled. Verdict `low`, rejected. Same memory-versus-drain evidence as the unread-body finding.
- Edge-case-hunter, `response_too_large` leaves the stream open. Verdict `low`, rejected. Same evidence.
- Edge-case-hunter, `readAtMost` leaves the error stream open. Verdict `low`, rejected. Same evidence.
- Edge-case-hunter, missing `context`. Verdict `false`. `observe` always passes `context`. The production caller is `runConnector`.
- Edge-case-hunter claim, body-read failure contradicts the named-skip outcome. Verdict `medium`. `run.failed { reason: "error" }` is a third outcome. Route `bad_spec`.
- Verification-gap, pre-parse URL rejection has no test. Verdict `medium`, pre-verified. Deleting the character checks would let `URL` normalize a backslash or a space, and no current test feeds those inputs. Filed disposition `patch`. Not processed on this loopback.
- Verification-gap other finding, body-read failure is not a named skip. Verdict `medium`. Same `observe` path. Route `bad_spec`.
- Verification-gap other finding, `connector.ts` still says other checks stay at 60 seconds. Verdict `medium`. The seeded checks set 20 seconds. A later edit that trusts the comment can drop `pollTimeoutMs` and overrun the 10-minute step. Route `patch`, not processed on this loopback.

Round 2, head `8bd8ba6a17392a59141cd8c4549b0d87bf9f84fc`:

- Blind-hunter, a non-200 body-read error becomes `network` and loses `http_403`. Verdict `low`, rejected. `errorDetail` reaches `readChunk`, which maps a throwing body to `SourceUnavailableError("network")` before `reasonForStatus`. The amended task requires that map. A 403 whose body reads still records `http_403`. A throwing error body is not an everyday response, and keeping the status reason would change the task.
- Blind-hunter, the triage log still calls the `guardedUrl` catch an unprocessed patch. Verdict `low`, rejected. The re-derive left that catch bare, so the branch the earlier row described is not in the file. Updating the earlier row would edit this spec.
- Blind-hunter, `network` skips drop the error name. Verdict `low`, rejected. `fetchSeededPage` and `readChunk` both pass an empty detail, which is the fetch map the task requires. Adding a name would put a new field on public evidence.
- Blind-hunter, `readSuccessBody` retains chunks only to read `byteLength`. Verdict `low`. The 200 path copies up to 1_000_000 bytes twice and then discards them. Route `patch`.
- Blind-hunter, the poll-budget test ignores the rest of the step. Verdict `false`. The acceptance criterion is the sum of the four poll budgets, and the test checks that sum. `draft-and-review` is a separate step with its own 20-minute timeout, so provider calls are not inside `run-daily-step`.
- Blind-hunter, the inlined diff shows the round-0 review prompts. Verdict `medium`. That diff was captured before this round's prompts were written, so it still contains the earlier prompt files. The committed prompts are the round-2 files, and they embed that snapshot. Grouped with the nesting and backtick findings. Route `defer`.
- Blind-hunter, each prompt contains the previous prompts. Verdict `medium`. The baseline diff includes `review-3-39-*.md`, and the no-subagent fallback inlines that diff. Same prompt-generation defect. Route `defer`.
- Blind-hunter, the prompt's backtick span breaks on the diff. Verdict `medium`. The fallback substitutes the diff and the reviewer instructions into a single-backtick span. Same prompt-generation defect. Route `defer`.
- Blind-hunter, open patch and defer rows are only in prose. Verdict `false`. This log records each row and that the `bad_spec` loopback left it unprocessed. `deferred-work.md` is written when a defer entry is processed, which that loopback forbids.
- Blind-hunter, `connector.ts` still says other checks stay at 60 seconds. Verdict `medium`. carried The seeded checks set 20 seconds and the comment still says every other check stays at 60 seconds. Route `patch`, not processed again.
- Blind-hunter, the failed-run test omits sibling evidence. Verdict `medium`. carried The test checks draft count and `failed` status only, so a registry that never fetched the other sources could still pass. Route `patch`, not processed again.
- Blind-hunter, `TextDecoder` ignores the error-page charset. Verdict `low`, rejected. The default UTF-8 decoder inserts a replacement character when an 8192-byte cut splits a multibyte sequence. That is one character inside a scrubbed prefix, and charset sniffing is more than a direct correction.
- Blind-hunter, `last_updated` is not ISO. Verdict `false`. The field was already `10-22-2026 12:55` before this story changed the time to `13:24`. The diff does not introduce the format.
- Blind-hunter, nothing records that `cancel()` drains the body. Verdict `false`. The `publicSource.ts` task and the Spec Change Log both state that this runtime drains on `cancel()`. The redirect and 8192 tests lock the unread remainder.
- Edge-case-hunter, a non-200 body-read failure loses the status reason. Verdict `low`, rejected. Same path as the blind-hunter `network` row. The task maps that read error to `network`.
- Edge-case-hunter, an `AbortError` while the observe signal is not aborted becomes `run.failed`. Verdict `low`, rejected. `withAbortableDeadline` swallows a rejection once its signal is aborted and rejects with `DeadlineError`, which `observe` records as `timeout`. An `AbortError` while that signal is still live is rethrown, and `observe` records `run.failed { reason: "error" }`. The task requires that rethrow, and a live-signal `AbortError` is not an everyday fetch failure. Mapping it to `network` would wrap the error the task forbids.
- Edge-case-hunter, `"tok"` is a substring. Verdict `low`. carried The token is the letters `tok`, so a later payload containing `token` fails the assertion for the wrong reason. Route `patch`, not processed again.
- Edge-case-hunter claim, a live-signal `AbortError` is a third outcome. Verdict `low`, rejected. Same `observe` path as the `AbortError` row. The story and the task both require the rethrow.
- Verification-gap, pre-parse URL rejection has no test. Verdict `medium`, pre-verified. carried Deleting the character checks would let `URL` normalize a backslash or a space, and no current test feeds those inputs. Filed disposition `patch`. Not processed again.
- Verification-gap other finding, `connector.ts` still says other checks stay at 60 seconds. Verdict `medium`. carried The seeded checks set 20 seconds. A later edit that trusts the comment can drop `pollTimeoutMs` and overrun the 10-minute step. Route `patch`, not processed again.

Code review of `d9b90b31` applied the pre-parse URL tests, the failed-run sibling evidence, and the distinctive CourtListener token, and removed the inlined review prompts. The connector comment, the User-Agent question, the operator-rename fallback, and the Epic 3 context cache are recorded in `deferred-work.md`. Spec status stays `done`.

## Verification

**Commands:**
- `npm run check` — expected: exit 0
- `npm test` — expected: exit 0
