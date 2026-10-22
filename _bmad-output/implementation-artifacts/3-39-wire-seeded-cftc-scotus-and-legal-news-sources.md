---
baseline_commit: 31ed902fcf4a0dab98004e853e5b85030934ebdc
---

# Story 3.39: Wire seeded CFTC, SCOTUS, and legal-news sources

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an operator,
I want the three seeded sources that are not CourtListener to be monitored,
so that a day with no new CourtListener entries is empty only when those sources were actually consulted or explicitly blocked.

## Acceptance Criteria

1. **Given** poll-sources version 0 names CourtListener, CFTC press, SCOTUS docket, and Legal news leads, **when** a Run packages those four sources, **then** CFTC press and SCOTUS docket are consulted as Tier-1, and Legal news leads is consulted as Tier-2. Tiers come from the snapshotted `PollSource`, not from a hard-coded override.
2. **And** each of those three emits `source.fetched` or `source.skipped` with a scrubbed reason other than `not wired`.
3. **And** a blocked or disallowed fetch records the skip and does not invent entries. No Draft is inserted for that source. No row is written to `cases`, `docket_events`, `sources`, or any other F1 table by the connector.
4. **And** material items from a consulted source become Drafts with tier labels only through `runConnector`, under the story 3.4 package. That path still cannot write live F1. These three checks do not return entities.
5. **And** a successful fetch from CFTC press, SCOTUS docket, or Legal news leads returns `entities: []`. A 200 body that contains a seeded docket number such as `1:26-cv-03659` still inserts zero Drafts and zero `docket_events` rows.
6. **And** CourtListener keeps story 3.38 pacing and story 3.23's fail-on-first behavior for 401, 403, 5xx, network, and timeout. Do not edit `courtListener.ts` pacing, retry, or poll deadline.
7. **And** an access failure on one of the three does not by itself fail CourtListener. `monitorAndPackage` still runs every snapshotted source. CourtListener's own observation stays whatever that check returned.
8. **And** fixture tests cover a fetch, a named access skip, and a CourtListener-only registry no longer being the success path for these three names. `vi.stubGlobal("fetch")` only. No live HTTP.
9. **And** this story does not deploy, call staging or production, or make a paid model call. Tests keep the fake provider. Do not run `npm run deploy` or `npm run deploy:build`.

## Tasks / Subtasks

- [x] **Task 1: Register the three seeded checks** (AC: 1, 2, 6, 7)
  - [x] Add `createCftcPressCheck`, `createScotusDocketCheck`, and `createLegalNewsLeadsCheck`. Each returns a `SourceCheck` with `pollTimeoutMs` set to `SEEDED_PAGE_POLL_TIMEOUT_MS` (20 seconds) via `Object.assign`, the same attachment `createCourtListenerCheck` uses.
  - [x] Implement the fetch once in `src/pipeline/connectors/publicSource.ts`. The three modules are thin wrappers that pass the seeded origin for that name. Architecture names `cftcPress.ts`, `scotusDocket.ts`, and `legalNewsLeads.ts`.
  - [x] `sourceChecksFromEnv` returns CourtListener plus these three, keyed by the exact `POLL_SOURCES` names, in that order. An unknown name still falls through to `stubCheck` inside `monitorAndPackage`.
  - [x] Do not pass `COURTLISTENER_API_TOKEN`, `courtListenerWait`, or `now` into the new checks. Do not give them a database handle.
- [x] **Task 2: One bounded public fetch per source** (AC: 2, 3, 4, 5, 6, 7)
  - [x] Fetch only the snapshotted `source.url`, and only after it passes the origin guard. `redirect: "manual"`. No `authorization` header. Call `context.beforeRequest()` immediately before `fetch`, after the guard.
  - [x] Use `fetchWithTimeout` with `SOURCE_FETCH_TIMEOUT_MS` (12 seconds). Map `TimeoutError` to `SourceUnavailableError("timeout")`. Rethrow `AbortError`. Map other fetch failures to `SourceUnavailableError("network")`.
  - [x] 3xx: `SourceUnavailableError("redirect", { status })`. Do not read the body or `Location`.
  - [x] 401, 403, 429, and 5xx: `SourceUnavailableError(reasonForStatus(status), { status, detail })` on the first response. No retry and no CourtListener pace clock. Read at most `SEEDED_PAGE_ERROR_BODY_MAX_BYTES` (8192) before `scrubResponseDetail(body, "")`. Do not call `response.text()` on the full error page. The scrub still caps detail at 180 characters and has no token to redact.
  - [x] Other non-200: `SourceUnavailableError("http_error", { status })` with that same capped, scrubbed detail. Do not invent entries.
  - [x] 200: read at most `SEEDED_PAGE_MAX_BYTES` (1_000_000). If `Content-Length` or the bytes read exceed that, `SourceUnavailableError("response_too_large")` and do not parse. Otherwise return one `SourceItem`: `{ entities: [], fetched: { status: 200, contentType, bytes } }`. `contentType` is the header value truncated to 120 characters, or `null`.
- [x] **Task 3: Tests** (AC: 1–9)
  - [x] Replace the story 3.21 registry assertion. Keys are `CourtListener`, `CFTC press`, `SCOTUS docket`, `Legal news leads`.
  - [x] Token absent: CourtListener is `unconfigured` and its URL is not fetched. The other three are fetched or skipped with a reason other than `not wired`. A stubbed 200 yields `source.fetched`, `failed: false`, `itemCount: 0`, and zero Drafts.
  - [x] A stubbed 403 on one of the three is `source.skipped` with `reason: "http_403"`, `failed: true`, zero Drafts for that source, and no token-like text in evidence. CourtListener's fixture entries still become its own Drafts.
  - [x] When `COURTLISTENER_API_TOKEN` is set, the three fetches send no `authorization` header and the token string is absent from evidence.
  - [x] A stubbed 429 performs one fetch and skips with `http_429`. A stubbed 5xx performs one fetch and skips with `http_5xx`. Neither retries.
  - [x] CourtListener zero new entries plus a 200 from each of the three finishes the Run `empty`. CourtListener zero new entries plus a 403 from one of the three finishes the Run `failed` (existing `completeDailyStep` rule). Do not special-case that to `empty`.
  - [x] A 200 body that contains a seeded docket number (for example `1:26-cv-03659`) still inserts zero Drafts and zero `docket_events` rows.
  - [x] `redirect: "manual"` is set. A 302 does not produce a second fetch. A foreign-origin URL throws `unsafe_url` and does not call `fetch`.
  - [x] `COURTLISTENER_POLL_TIMEOUT_MS + 3 * SEEDED_PAGE_POLL_TIMEOUT_MS` is less than 10 minutes. `dailyRunRecovery.test.ts` still sees no config object on `run-daily-step`.
  - [x] `npm run check` and `npm test` exit 0.
- [x] **Task 4: Leave the rest alone** (AC: 6, 9)
  - [x] Do not rename `run-daily-step` or pass a `StepConfig` to it. Do not add a dependency, a D1 table, a migration, or a secret. Do not implement story 3.40. Do not deploy.

### Review Findings

- [x] [Review][Patch] Remove the inlined review prompts so the next baseline diff does not pick them up [_bmad-output/implementation-artifacts/review-3-39-blind-hunter.md]
- [x] [Review][Patch] Pin `guardedUrl`'s pre-parse rejections with an `it.each` [src/pipeline/connectors/publicSource.test.ts]
- [x] [Review][Patch] The failed-run test must show the CFTC `http_403` skip and the other three `source.fetched` events [src/pipeline/workflow/dailyRun.test.ts:990]
- [x] [Review][Patch] Use a distinctive CourtListener token and require at least one CourtListener call before `every()` [src/pipeline/workflow/dailyRun.test.ts:820]
- [x] [Review][Patch] Record the real task state, file list, and check/test results, and set story, spec, and sprint status through the workflow [3-39-wire-seeded-cftc-scotus-and-legal-news-sources.md]
- [x] [Review][Defer] No User-Agent beyond the Workers default, and live CDN or paywall behavior is unmeasured [src/pipeline/connectors/publicSource.ts] — deferred: unverified until the first staging Run
- [x] [Review][Defer] `connector.ts` still says every other check stays at 60 seconds [src/pipeline/connectors/connector.ts:121] — deferred: the spec forbids changing `connector.ts`
- [x] [Review][Defer] An operator rename of a seeded source falls back to `stubCheck` / `not wired` [src/pipeline/connectors/publicSource.ts] — deferred: pre-existing 3.21 name-keyed design
- [x] [Review][Defer] The Epic 3 context cache dropped later handoffs, the timeout policy, the staging topology, and the do-not-deploy rule [_bmad-output/implementation-artifacts/epic-3-context.md] — deferred: unverified against the planning artifacts

#### Rejected

- spec — Following same-origin redirects, cancelling unread bodies, treating other 2xx statuses as success, a content-type or paywall check on 200s, counting a 200 body without keeping the bytes, and recording a 403 whose body fails to read as `http_403` rather than `network` would edit the frozen spec.
- false — Status 0 or opaqueredirect: Workers `redirect: "manual"` returns the 3xx.
- false — The poll-budget test: the acceptance criterion is the sum of the budgets.
- low — An AbortError not caused by the deadline, the comment claiming a 12-second timeout on body reads, the error-detail charset, mixed error-helper use, and the deferred-entry format.
- low — The `running` status in the 403-beside-drafts test matches `packageDailyRun`.
- low — The baseline-commit mismatch.

## Dev Notes

### Story selection

Create-story auto-discover read `_bmad-output/implementation-artifacts/sprint-status.yaml` from start to end. The first `number-number-name` key whose status is `backlog` is `3-39-wire-seeded-cftc-scotus-and-legal-news-sources`. Epic 3 already has `3-1-run-draft-evidence-data-model`, so this is not story 3.1. `epic-3` is already `in-progress`. The workflow does not change that status while creating this story. Story 3.40 stays `backlog`.

Resolved customization: `activation_steps_prepend`, `activation_steps_append`, and `persistent_facts` are empty. `on_complete` is empty. Config: project PML, user Patrick, English, intermediate. Planning artifacts `_bmad-output/planning-artifacts`. Implementation artifacts `_bmad-output/implementation-artifacts`. Date of this story file: 2026-10-16.

Discovery: sharded PRD `prds/prd-PML-2026-06-18/prd.md` (FR-9). Whole architecture `architecture.md`. Whole epics `epics.md` (Epic 3, stories 3.4, 3.21, 3.23, 3.27, 3.38, 3.39, 3.40). Sharded UX `ux-designs/design_handoff_pml/README.md` is a handoff pointer; the UX requirement used here is whole-file `ux-brief-pack.md` B1–B3 (sources consulted and skipped, Tier-2-only flag). No new screen.

### What is broken today

`POLL_SOURCES` in `src/pipeline/connectors/sources.ts` already names four sources:

| Name | URL | Tier |
|---|---|---|
| CourtListener | `https://www.courtlistener.com/` | tier1 |
| CFTC press | `https://www.cftc.gov/PressRoom/PressReleases` | tier1 |
| SCOTUS docket | `https://www.supremecourt.gov/docket/` | tier1 |
| Legal news leads | `https://news.bloomberglaw.com/securities-law` | tier2 |

`sourceChecksFromEnv` returns only `CourtListener`. `monitorAndPackage` uses `checks[source.name] ?? stubCheck`. `stubCheck` returns `[]`. `observe` maps that empty array to `source.skipped` / `not wired` / `failed: false` only when `check === stubCheck`. A real check that returns `[]` is `no material change`, not `not wired`. A real check that returns `[{ entities: [], fetched }]` is `source.fetched`.

Staging `run-20261011-0000` fetched CourtListener with `itemCount: 0` and then skipped the other three as `not wired`. The Run finished `empty`. That matched the old story 3.21 stub sentence. Story 3.39 supersedes that sentence for these three names. `not wired` is no longer their success path. `stubCheck` stays the fallback for a name that is not one of the four.

### Current files the story updates

`sourceChecksFromEnv` (`src/pipeline/workflow/dailyRun.ts`) builds the CourtListener check from `COURTLISTENER_API_TOKEN`, `FIRST_FETCH_WINDOW_DAYS`, optional `courtListenerWait`, and optional `now`. `DailyRunWorkflow.sourceChecks` passes that record into `packageDailyRun` on `step.do("run-daily-step")` with **no** `StepConfig`. `draft-and-review` is a separate step with `{ retries: { limit: 0, delay: 0 }, timeout: "20 minutes" }`. `dailyRunRecovery.test.ts` asserts `configs.has("run-daily-step") === false`. Do not add a config to `run-daily-step`.

`observe` (`src/pipeline/connectors/connector.ts`) wraps the check in `withAbortableDeadline(pollTimeoutMs(check))`. `pollTimeoutMs` reads a numeric `pollTimeoutMs` property on the function. CourtListener sets `COURTLISTENER_POLL_TIMEOUT_MS` (8 minutes). Every other check currently gets `CONNECTOR_TIMEOUT_MS` (60 seconds). `SourceUnavailableError` becomes `source.skipped` with `failed: true` and the error's `detail` plus `reason`. `DeadlineError` becomes `reason: "timeout"`. Any other throw becomes `run.failed` / `reason: "error"`. The new checks must throw only `SourceUnavailableError`, or rethrow `AbortError`. Do not throw a generic `Error`.

`runConnector` writes the evidence event, then inserts one Draft per entity. `tier2Only` is `source.tier === "tier2"`. It does not write F1. `completeDailyStep`: drafts present → Run `awaiting` even if `anyFailure`; zero drafts and `anyFailure` → `failed`; zero drafts and no failure → `empty`. A named access skip uses `SourceUnavailableError`, so `failed` is true. A zero-draft Run that saw one of those skips finishes `failed`, not `empty`. That is the existing rule. Do not swallow the skip into `failed: false` to force `empty`. The user-story "empty only when consulted or blocked" is met because `not wired` no longer produces the empty Run. A consulted 200 with zero entities is `failed: false` and can still finish `empty`. A blocked fetch is explicit failure.

`f1Apply.ts` can publish only `states`, `cases`, `circuits`, `entities`, `cert_signals`, and `docket_events`. The `docket_events` path inserts a Tier-1 `sources` row, inserts `docket_events`, and updates `cases`. An unknown `targetEntityType` throws `UnpublishableError` at approval time, after the Draft is already in the queue. Do not create that Draft.

### Material items

These three seeded URLs are HTML index pages, not a docket API and not an F1 field update. A press release, a SCOTUS docket index, or a news page that mentions a docket number is not a `docket_events` record. Publishing one would insert a false filing and, for Legal news leads, would store a Tier-2 document as the Tier-1 `sources` row that `applyDocketEventStmts` hard-codes.

A successful fetch therefore returns `entities: []` plus the `fetched` summary. That is `source.fetched` with `itemCount: 0`. It is not `source.skipped` / `no material change`, and it is not `not wired`. The story 3.4 package already turns a non-empty `entities` array into Drafts with `tier2Only` from the source tier and does not write live F1 (`connector.test.ts`, `oneMaterial` / `oneTier2`). This story does not add entities. A 200 fixture whose body contains `1:26-cv-03659` must still create zero Drafts and leave `docket_events` unchanged. That pins the rule.

Do not call the drafter or reviewer from the connector. A zero-draft package never enters `draft-and-review`, so this story's success path makes no model call. Do not add a live call to prove that.

### Fetch contract

Shared helper, one request:

1. Resolve the allowed origin from `POLL_SOURCES` by exact `source.name` (`https://www.cftc.gov`, `https://www.supremecourt.gov`, `https://news.bloomberglaw.com`). If the name is not one of those three, throw `SourceUnavailableError("unsafe_url")` and do not fetch.
2. Reject the snapshotted URL when it is empty, contains `\`, has a bad `%` escape, or contains a character at code 0x20 or below or 0x7f. Reject unless `protocol` is `https:`, `origin` equals that seeded origin, and `username` and `password` are empty. Same-origin path changes are allowed (a steered `poll_sources` URL). A different origin is `unsafe_url`. Do not put the rejected URL in the error detail.
3. `await context?.beforeRequest()` then `fetchWithTimeout(url, { signal, redirect: "manual", headers: { accept: "text/html, application/xhtml+xml, application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8" } }, SOURCE_FETCH_TIMEOUT_MS)`. No `authorization`. No CourtListener token. Workers supplies the User-Agent. Do not add a new header library.
4. Status handling is Task 2. Reuse `reasonForStatus` and `scrubResponseDetail` from `courtListener.ts`. Do not copy the pace loop, `Retry-After`, or pagination validator.
5. On 200, if `Content-Length` parses to a number greater than `SEEDED_PAGE_MAX_BYTES`, skip `response_too_large` without reading. Otherwise read with a reader and stop at the cap. Exceeding the cap is `response_too_large`. Do not parse a partial body into entries.
6. Return `{ entities: [], fetched: { status: 200, contentType, bytes } }`. `contentType` is the header value truncated to 120 characters, or `null`. `bytes` is the number read. Do not put the body, titles, or links in `fetched`. `scrubPayload` still runs, but the summary must already be safe.

`SEEDED_PAGE_POLL_TIMEOUT_MS` is 20_000. `observe` uses it instead of 60 seconds for these three checks only. CourtListener stays at 8 minutes. The default `step.do` timeout is 10 minutes ([Cloudflare Workflows, Sleeping and retrying](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/)). 8 minutes + 3 × 20 seconds = 9 minutes, which leaves margin for the D1 writes inside the same step. Do not raise that poll budget, and do not set `pollTimeoutMs` to `CONNECTOR_TIMEOUT_MS` on these checks: 8 minutes + 3 × 60 seconds overruns the step. Do not pass a timeout config into `run-daily-step` to "fix" that. Update the comment in `src/shared/lib/timeouts.ts` so it no longer says the only per-check exception is CourtListener. Do not change `CONNECTOR_TIMEOUT_MS` or `SOURCE_FETCH_TIMEOUT_MS`.

No second request. No `robots.txt` fetch, no pagination, no RSS URL substituted for the seeded URL. A 200 HTML page, including a paywall document, is `source.fetched` with zero entities. Do not sniff the body for the word "paywall".

### CourtListener must keep working

Do not change `createCourtListenerCheck`, `COURTLISTENER_MIN_INTERVAL_MS`, attempt counts, wait budget, or `COURTLISTENER_POLL_TIMEOUT_MS`. 401, 403, 5xx, network, and timeout on CourtListener stay fail-on-first. HTTP 429 pacing stays inside that connector only. An access skip from CFTC, SCOTUS, or Legal news leads must not throw out of `monitorAndPackage` and must not clear CourtListener drafts. `packageDailyRun` still calls the provider only when `draftCount > 0`, and only from `draft-and-review`.

### Tests that will fail if left as they are

`src/pipeline/workflow/dailyRun.test.ts` describes `sourceChecksFromEnv (story 3.21)`:

- `"wires exactly CourtListener; the other sources stay not wired"` expects `Object.keys(checks)` to equal `["CourtListener"]`. Change it to the four names in `POLL_SOURCES` order.
- `"records source.skipped unconfigured for CourtListener and not wired for the rest when the token is absent"` stubs `fetch` and expects it **not** to be called, and expects the three reasons to be `not wired`. After this story the three checks fetch even when the token is absent. Stub their responses. CourtListener must still not be fetched. Reasons for the three must not be `not wired`.
- With `COURTLISTENER_API_TOKEN` set, those three requests still have no `authorization` header, and the token string does not appear in evidence.

`src/pipeline/connectors/connector.test.ts` passes its own check maps. The case that expects `POLL_SOURCES.length - 2` leftovers with `not wired` supplies only CourtListener and CFTC press. Those leftovers are still `stubCheck` because the map, not `sourceChecksFromEnv`, is what `monitorAndPackage` uses. Leave that assertion. Do not point that test at `sourceChecksFromEnv`.

Story 3.4 tests that pass `{}` still record `not wired` for every source. That remains true for an empty registry. Do not change `stubCheck`.

### Project structure

New files:

- `src/pipeline/connectors/publicSource.ts` — origin guard, one fetch, constants `SEEDED_PAGE_POLL_TIMEOUT_MS`, `SEEDED_PAGE_MAX_BYTES`, and `SEEDED_PAGE_ERROR_BODY_MAX_BYTES`
- `src/pipeline/connectors/cftcPress.ts`
- `src/pipeline/connectors/scotusDocket.ts`
- `src/pipeline/connectors/legalNewsLeads.ts`
- `src/pipeline/connectors/publicSource.test.ts` — guard, status map, byte cap, zero entities, no second fetch

Update:

- `src/pipeline/workflow/dailyRun.ts` — register the three checks in `sourceChecksFromEnv`
- `src/pipeline/workflow/dailyRun.test.ts` — the two registry tests above, plus the empty-versus-failed package cases
- `src/shared/lib/timeouts.ts` — comment only

Do not add `federalRegister.ts` or `tier2News.ts`. Architecture already names the three seeded modules. Do not edit `POLL_SOURCES`. Story 3.40 adds further names only after Patrick names them.

Tests are co-located `*.test.ts` and run under the existing Vitest workers pool. Follow `courtListener.test.ts`: `vi.stubGlobal("fetch")`, Miniflare D1, no live network.

### Libraries

No new dependency. Zod stays the installed `zod` 4 (`package.json` `^4.4.3`). Do not parse these pages with a new schema. Context7 has no `v4.4.3` entry (nearest published docs are v4.3.6 and v4.6.5). Match `EntrySchema` in `courtListener.ts` if a schema is unavoidable: `z.object`, not a Zod 3 `z.record` with one argument. Prefer no schema on this path.

HTMLRewriter is the Workers HTML transform API ([HTMLRewriter](https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/)). Do not use it here. These checks do not rewrite HTML and do not extract anchors into Drafts. `fetch` with `redirect: "manual"` is the same call CourtListener already makes.

Workflow default step config, verified 2026-10-16 from Cloudflare docs: `retries.limit` 5, `delay` 10000, `backoff` `"exponential"`, `timeout` `"10 minutes"`. Wall clock inside a step is not the CPU limit. Waiting on `fetch` is not CPU time. That does not raise the 10-minute `step.do` timeout. Keep the three polls inside the 20-second caps so the default timeout still covers CourtListener's 8 minutes.

### Previous story intelligence

Story 3.38 (`3-38-pace-courtlistener-requests-and-recover-from-http-429.md`, status done) is the previous Epic 3 story file. Use these lessons:

- `fetchWithTimeout` uses `setTimeout`, not `AbortSignal.timeout`. Fake timers do not drive `AbortSignal.timeout`.
- `redirect: "manual"`. Do not follow redirects or read `Location`.
- Do not rename `run-daily-step`. Do not call `step.sleep` inside it. Stories 3.32 and 3.34 checkpoint that name.
- Do not add Cloudflare Queues. Architecture still defers Queues.
- Scrub response text before it reaches evidence. Never log a token. These checks have no token; still do not put the body in evidence.
- Inject `fetch` in tests. Do not call CourtListener, CFTC, SCOTUS, Bloomberg, staging, or production.
- `npm run check` and `npm test` must both exit 0 before review. The 3.38 completion note recorded 1,499 passed and 6 skipped. Do not treat that count as this story's baseline. Read the new exit codes.
- Review patches on 3.38 were about pace deadlines and assertions, not about these three sources. Do not reopen them.

### Git intelligence

Latest `main` commits at story creation:

- `31ed902` Apply approved Tier-1 and Tier-2 source monitoring stories (#81)
- `4dba6b5` Renew the staging DeepInfra V4-Flash budget period (#79)
- `a8634e6` Epic 3 retrospective: accepted with open items (#78)
- `f531e4e` Add Epic 4 story 4.8 for admin approver control help (#77)
- `a0d4a31` Story 3.37: prove the live governed loop and reassess Epic 3 (#76)

#81 is the planning change that added this story. Implementation was not in that commit. Follow the local connector style from `courtListener.ts` and `connector.ts`: typed skips, stubbed fetch, no new runtime dependency.

### Latest technical notes

- Cloudflare Workflows default `step.do` timeout is 10 minutes. Custom timeouts must be 30 minutes or less. This story uses the default for `run-daily-step` and does not set one.
- `SOURCE_FETCH_TIMEOUT_MS` is 12 seconds and stays the per-request cap. The 20-second `pollTimeoutMs` is the `observe` deadline around that single request plus the D1 ownership check.
- Do not add an XML or HTML parser package. A 200 body is counted and discarded.

### Project context

`project-context.md` is not in the repo. Epic 3 narrative context is `_bmad-output/implementation-artifacts/epic-3-context.md`. UX: `ux-brief-pack.md` B1 (run status, including empty and failed), B2 (sources consulted and skipped with reasons), B3 (Tier-2-only on pending Drafts). No new component. New source names show up on the existing evidence payload (`source`, `url`, `tier`, `reason` or `itemCount`).

### What must keep working

- Version-0 seed URLs and tiers stay as written.
- `stubCheck` and the `not wired` reason stay for unknown names and for tests that pass no check.
- CourtListener token-absent path stays `unconfigured`, no fetch, `failed: true`.
- Draft insertion, `tier2Only`, and F1 writes stay in `runConnector` and `f1Apply` respectively.
- `packageDailyRun` / `reviewDailyRun` still skip the provider when `draftCount` is 0.
- Story 3.40 is not started. No URL is added that Patrick did not already seed.

### References

- [Source: _bmad-output/planning-artifacts/epics.md] Story 3.39, and the 3.4 / 3.21 supersession sentences
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-10-11T1823Z.md] approved handoff, registry change, no new table, no deploy
- [Source: _bmad-output/planning-artifacts/prds/prd-PML-2026-06-18/prd.md] FR-9, including the sentence that a `not wired` skip is not monitoring
- [Source: _bmad-output/planning-artifacts/architecture.md] connector filenames and external integrations
- [Source: src/pipeline/connectors/sources.ts] `POLL_SOURCES`
- [Source: src/pipeline/connectors/connector.ts] `observe`, `stubCheck`, `SourceUnavailableError`, `runConnector`
- [Source: src/pipeline/workflow/dailyRun.ts] `sourceChecksFromEnv`, `step.do("run-daily-step")`
- [Source: src/pipeline/workflow/dailyRunSteps.ts] `monitorAndPackage`, `completeDailyStep`
- [Source: src/pipeline/gate/f1Apply.ts] publishable targets; `docket_events` insert is Tier-1 only
- [Source: src/shared/lib/timeouts.ts] `CONNECTOR_TIMEOUT_MS`, `SOURCE_FETCH_TIMEOUT_MS`, `fetchWithTimeout`
- [Source: Cloudflare Workflows sleeping and retrying](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/)

## Dev Agent Record

### Agent Model Used

Grok 4.7

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- The three seeded checks share one same-origin fetch. A 200 returns `entities: []` and a byte count, and the body is not retained. Body-read failures use the fetch map. `npm run check` exited 0. `npm test` exited 0: 1,671 passed, 6 skipped, 68 files. No deploy, staging, production, or paid-provider call.
- ✅ Resolved review finding [high]: Removed the three inlined review prompts.
- ✅ Resolved review finding [medium]: Pre-parse URL rejections are pinned by `it.each`.
- ✅ Resolved review finding [medium]: The blocked zero-draft Run asserts the CFTC `http_403` skip and `source.fetched` for SCOTUS docket, Legal news leads, and CourtListener.
- ✅ Resolved review finding [medium]: The poll test uses `cl-review-token-7f3a` and requires a CourtListener call before `every()`.
- ✅ Resolved review finding [medium]: Tasks, the file list, and these check/test results are recorded. Story status and sprint status are set by the code-review status step. The spec was already `done`.
- Code-review verification: `npm run check` exited 0. `npm test` exited 0: 1,671 passed, 6 skipped, 68 files. No deploy, staging, production, or paid-provider call. Deferred items were recorded and rejected findings were left unchanged.

### File List

- `_bmad-output/implementation-artifacts/3-39-wire-seeded-cftc-scotus-and-legal-news-sources.md`
- `_bmad-output/implementation-artifacts/spec-3-39-wire-seeded-cftc-scotus-and-legal-news-sources.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/deferred-work.md`
- `_bmad-output/implementation-artifacts/epic-3-context.md`
- `src/pipeline/connectors/publicSource.ts`
- `src/pipeline/connectors/publicSource.test.ts`
- `src/pipeline/connectors/cftcPress.ts`
- `src/pipeline/connectors/scotusDocket.ts`
- `src/pipeline/connectors/legalNewsLeads.ts`
- `src/pipeline/workflow/dailyRun.ts`
- `src/pipeline/workflow/dailyRun.test.ts`
- `src/shared/lib/timeouts.ts`

## Change Log

- 2026-10-16: Created story 3.39 from sprint auto-discover. Status ready-for-dev.
- 2026-10-22: Code review patches applied. Review prompts removed. Story status set to done.
