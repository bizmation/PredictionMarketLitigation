---
title: 'Use a Workers-legal redirect mode on DeepInfra fetches'
type: 'bugfix'
created: '2026-10-10'
status: 'done'
route: 'dispatch'
baseline_commit: 'f002b1edd61a5387e89e5899ecb43f61e8277ea8'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-deepinfra-preflight-diagnostics-and-first-fetch-window.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** On staging `pml-build` (worker `2d5baca`), revising run-20261010-0003 throws `cost_policy_invalid` before reservation. `wrangler tail` shows `deepinfra_preflight` / `TypeError`: `Invalid redirect value, must be one of "follow" or "manual" ("error" won't be implemented since it does not make sense at the edge; use "manual" and check the response status code)`. Workerd rejects `redirect: "error"` before send. Node accepts it, so tests stay green. No `llm_operations` row and $0 spent.

**Approach:** Use `redirect: "manual"` on both DeepInfra fetches. Keep 3xx and opaque-redirect (`status` 0) on the existing fail-closed paths. Pin that with a Workers-shaped stub, a static `src/` check, and redirect tests. Set `env.build.vars.FIRST_FETCH_WINDOW_DAYS` to the string `"3"`. Append the deferred revise note below; do not fix it.

## Boundaries & Constraints

**Always:** Catalog GET (`createDeepInfraProvider` preflight, ~1047) and chat POST (`prepare`, ~1140) use `"manual"`. Catalog `Accept`, `User-Agent`, `signal`, deadline, and diagnostics stay (status, `bodyPrefix`, `field`, `errorName`, `errorMessage`, one `console.warn`). A catalog status 300–399, status 0, or `type === "opaqueredirect"` uses the existing non-OK throw: `cost_policy_invalid: deepinfra_preflight (http <status>)`. Preflight is before `accounting.reserve` (`complete()` ~408, then ~429), so nothing is reserved. A chat response in that set uses `if (!response.ok) throw new Error()` (~1152). The catch (~1176) throws `provider_error` / `DeepInfra gateway request failed.` That is not `ProvenPreDispatchRefusal`, so ~508–523 calls `markUncertain(..., "provider_outcome_unknown")` and does not release or `settle`. The row stays `state='uncertain'` with that issue and the 16-cent admission bound. `accountingForRun` is `totalCents: 16`, `issueCount: 1`. A repeat is `accounting_uncertain`. `env.build.vars` is exactly `{ "FIRST_FETCH_WINDOW_DAYS": "3" }` (string). Top-level, other envs, and `wrangler.test.jsonc` have no `vars`. Append this bullet verbatim and change nothing else in `deferred-work.md`:

- **Revise failure surfaces as 400 and strands a NULL-eval child (from 0003 entry 170, Oct 10).** `submitTurn` maps `reviseDraft` status `invalid` to HTTP 400 "Revision did not complete" after the turn receipt and child draft are already persisted. The retry then gets 409 from `hasInFlightSuccessor`. Fix: return a 5xx/502-class error for gateway or provider failures, have the UI refresh the draft chain after any revise error, and decide whether a failed revise child should be marked terminal so the parent can be revised again. Doesn't block 3.36.

**Never:** No deploy, tail, or Run. No `bmad-code-review`. Do not set `redirect` on OpenRouter (~806). Do not edit `courtListener.ts` (already `"manual"` at 557). Do not change `costPolicy.ts`, `reserve`, `settle`, or `markUncertain`. Do not follow redirects or read `Location`. Do not send the DeepInfra key on the catalog request. Do not set the window on production or the test config. Do not edit other PRs' reject or batch files. Do not fix the revise bug.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Catalog redirect | 302, or status 0 / `opaqueredirect` | No reserve, no chat POST | `cost_policy_invalid: deepinfra_preflight (http <status>)`; log has `status` |
| Chat redirect | Catalog ok; POST 302 or status 0 / `opaqueredirect` | `uncertain`, issue `provider_outcome_unknown`, liability 16; not settled or released | `provider_error`, `DeepInfra gateway request failed.` |
| Illegal mode | Either DeepInfra fetch gets `redirect: "error"` | Stub throws the tail `TypeError` before a response | Catalog: `cost_policy_invalid`, `errorName` `TypeError`, no status. Chat: `provider_error`, then uncertain |
| Staging window | `env.build` only | `FIRST_FETCH_WINDOW_DAYS` is `"3"` and the only var | No other `vars` object |
| Existing non-OK | Catalog 403; chat 503 | Unchanged diagnostics and liability | Unchanged |

</frozen-after-approval>

## Code Map

- `src/pipeline/ai/gateway.ts` — Catalog fetch ~1043 (`redirect` 1047, non-OK 1054–1066). Chat fetch ~1138 (`redirect` 1140, `!response.ok` 1152, `provider_error` 1176–1180). `preflight` ~408 is before `reserve` ~429. ~508–523: `ProvenPreDispatchRefusal` releases; any other failure `markUncertain`. OpenRouter fetch ~806 sets no `redirect`.
- `src/pipeline/ai/deepinfra.test.ts` — `http()` ~99 and assertions at 110, 251, and 926 expect `"error"`. Non-2xx liability is ~902. `courtListener.ts:557` is already `"manual"`; do not edit. `markUncertain` (~200 in `llmAccountingRepo.ts`) is unchanged.
- `wrangler.jsonc` `env.build` ~204 — no `vars` yet. `wranglerConfig.test.tsx` ~40 bans every `"vars"`; narrow it. `access-env.d.ts` ~60 says there is no vars block; correct the comment. `firstFetchWindowDays` already accepts `"3"`.
- `vitest.config.ts` — `*.test.ts` is workerd (no fs). Static scan is `src/pipeline/ai/fetchRedirect.test.tsx` in the Node `ui` project. Append `deferred-work.md` only.

## Tasks & Acceptance

**Execution:**
- [x] `src/pipeline/ai/gateway.ts` -- Both DeepInfra redirects become `"manual"`. 3xx, status 0, and `opaqueredirect` stay on the existing non-OK branches.
- [x] `src/pipeline/ai/deepinfra.test.ts` -- Shared stub throws the tail `TypeError` when `redirect` is `"error"`, on the catalog URL and the chat POST. Expect `"manual"` at 110, 251, and 926. Add 302 and status-0 / `opaqueredirect` cases for both fetches.
- [x] `src/pipeline/ai/fetchRedirect.test.tsx` -- Fail if any non-test file under `src/` sets `redirect` to `"error"` or `'error'`.
- [x] `wrangler.jsonc` -- `env.build.vars` is `{ "FIRST_FETCH_WINDOW_DAYS": "3" }` only.
- [x] `src/shared/lib/wranglerConfig.test.tsx` -- Allow only that build var. `wrangler.test.jsonc` stays var-free.
- [x] `src/access-env.d.ts` -- Comment: build sets `"3"`; other environments omit it.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- Append the Boundaries bullet verbatim.

**Acceptance Criteria:**
- Given non-test files under `src/`, when the static check runs, then none set `redirect` to `"error"`.
- Given `deferred-work.md`, when this change is read, then the revise bullet is present verbatim and revise behavior is unchanged.

## Implementation Notes

- `npm run check` exit 0. `npm test` exit 0 (1544 passed, 6 skipped).
- Request docs still list redirect mode `error`. The staging tail is the runtime: workerd throws before send. Both DeepInfra fetches use `manual`. `deepInfraRedirectRefused` keeps 3xx, status 0, and `opaqueredirect` on the existing non-OK branches. A chat failure still `markUncertain`s with `provider_outcome_unknown` and does not release or settle.
- Status 0 is not valid `ResponseInit`. Those tests use a response-shaped object. The shared `http()` stub throws the tail `TypeError` when `redirect` is `"error"`, so a regression fails the existing success paths as well as the direct stub test.
- Spec size is about 1900 tokens by characters/4 and about 1340 by words×1.3. The window string and the verbatim deferred note stay in this change because that was the requested scope.
- Review patches: catalog and chat inits are `deepInfraCatalogRequestInit` and `deepInfraChatRequestInit`. `deepinfraRequest.test.ts` runs in the workers pool (`compatibility_date` `2026-06-11`) and passes those inits to `new Request`. Temporarily setting both to `"error"` made both tests throw the workerd `TypeError` at `new Request`; they were restored to `"manual"`. The mock-only redirect test is gone. The source scan has a positive control. The review prompt files are deleted.

## Spec Change Log

## Review Triage Log

- Verification Gap: no gaps. Edge Case Hunter: `[]`.
- `[medium]` `[patch]` Blind Hunter 1. `toHaveBeenCalledWith(expect.not.objectContaining({ status: expect.anything() }))` passes if any warn lacks `status`, and `expect.anything()` ignores null and undefined. Fixed: the `cost_policy_invalid` log object asserts `errorName` and `not.toHaveProperty("status")` together.
- `[medium]` `[patch]` Blind Hunter 2. The scan had no sample that must match and one that must not. An unreadable file was treated as clean. The `.tsx` file does run: the Node `ui` project includes `src/**/*.test.tsx`, and `npm test` executed it. Computed redirect values are outside the literal check the spec required; a parser would be a new scanner. Fixed: `sourceSetsRedirectError` flags `"error"` and `'error'` and ignores `"manual"` and `"follow"`, and a read error fails the walk.
- `[low]` `[reject]` Blind Hunter 3. `!response.ok` is the existing non-OK path, so 403 and 503 stay fail-closed. The extra arms do not change a real `Response`. Status 0 is not valid `ResponseInit`. Splitting the predicate adds branches for a name.
- `[false]` `[reject]` Blind Hunter 4. The chat POST `redirect` is already `"manual"` at the success assertion and the non-2xx assertion in `deepinfra.test.ts`. PML Code Review rejected that part. The 302 and opaque chat tests already expect no `llm_calls` row, and the non-2xx test expects the repeat `accounting_uncertain` on this same catch. The workerd test still covers the chat init.
- `[medium]` `[patch]` Blind Hunter 5. "rejects redirect error before a catalog or chat response" only calls the mock `fetcher`. Replaced by `deepinfraRequest.test.ts`, which passes the production catalog and chat inits to workerd `new Request`.
- `[low]` `[reject]` Blind Hunter 6. The fix is a spec edit. The I/O matrix already states `manual`, the catalog error with no reservation, the uncertain chat row, and `env.build.vars`. The AC section does not repeat those rows.
- `[low]` `[patch]` Blind Hunter 7. A missing `text()` still left `read` false. The catalog redirect stub did not check headers, `bodyPrefix`, or `field`. Fixed: `text()` sets `read`, and the catalog stub checks `Accept`, `User-Agent`, `signal`, `bodyPrefix`, and the absence of `field`.
- `[low]` `[reject]` Blind Hunter 8. Informational. The Never rule leaves the OpenRouter fetch without a `redirect`. Extending the scan to other modes is a new rule.
- `[false]` `[reject]` Blind Hunter 9. `configs` is still the `ACCESS_DEV_BYPASS` `it.each`. Both of its files are still checked: `wrangler.test.jsonc` has no `vars`, and `wrangler.jsonc` has only the build string.
- `[false]` `[reject]` Blind Hunter 10. `string | number` matches `firstFetchWindowDays`, which accepts a JSON number. The committed build value is the string `"3"` because Wrangler vars are strings. The comment states both.

## Design Notes

Request docs retrieved 2026-10-10 (`search_cloudflare_documentation`, `https://developers.cloudflare.com/workers/runtime-apis/request/`) still list `follow`, `error`, and `manual`, and say `manual` returns the 3xx as-is. The tail shows workerd rejects `"error"` before send. Follow the runtime and fail closed on that 3xx. No new error code. Status 0 is not valid `ResponseInit` (200–599); those tests use a response-shaped object, like the unreadable-body catalog test. Wrangler vars are strings. The diagnostics spec forbade a vars block; this request overrides that for `env.build` only. Do not deploy.

## Verification

**Commands:**
- `npm run check` -- expected: exit 0
- `npm test` -- expected: exit 0

**Manual checks (if no CLI):**
- Do not deploy. `git diff` must not touch reject or batch files, OpenRouter, or `courtListener.ts`.
