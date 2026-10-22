---
title: '3.39 — Wire seeded CFTC, SCOTUS, and legal-news sources'
type: 'feature'
created: '2026-10-22'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
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
- [ ] `src/pipeline/connectors/publicSource.ts` — one same-origin fetch and the 20-second, 1_000_000-byte, and 8192-byte caps — shared by the three checks.
- [ ] `src/pipeline/connectors/cftcPress.ts`, `scotusDocket.ts`, `legalNewsLeads.ts` — thin factories for `https://www.cftc.gov`, `https://www.supremecourt.gov`, and `https://news.bloomberglaw.com`.
- [ ] `src/pipeline/connectors/publicSource.test.ts` — stub `fetch` and cover the matrix rows that do not need a full Run.
- [ ] `src/pipeline/workflow/dailyRun.ts` — register the three checks.
- [ ] `src/pipeline/workflow/dailyRun.test.ts` — replace the CourtListener-only registry assertions and cover empty versus failed Runs, plus the token header.
- [ ] `src/shared/lib/timeouts.ts` — comment only.

**Acceptance Criteria:**
- Given poll-sources version 0, when a Run packages it, then CFTC press and SCOTUS docket are Tier-1, Legal news leads is Tier-2, and none of the three records `not wired`.
- Given the three new poll budgets plus the CourtListener poll budget, when they are added, then the sum is under 10 minutes.
- Given `npm run check` and `npm test`, when they run, then both exit 0. No deploy and no live or paid call.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run check` — expected: exit 0
- `npm test` — expected: exit 0
