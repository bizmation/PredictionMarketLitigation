---
title: 'Log DeepInfra chat failures and bound the draft step'
type: 'bugfix'
created: '2026-10-10'
status: 'in-review'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: '17e73273b52af7abd008705c72dcbed4d4c7fabc'
baseline_commit: '17e73273b52af7abd008705c72dcbed4d4c7fabc'
context: []
warnings:
  - oversized
deferred: []
---

<intent-contract>

## Intent

**Problem:** On staging, the DeepInfra chat POST in `createDeepInfraProvider` hangs until the provider deadline. The chat closure turns abort, non-OK, bad JSON, and a refused redirect into the generic "DeepInfra gateway request failed." The outer catch then `markUncertain(..., "provider_outcome_unknown")` and logs nothing. The same call can also spend the whole window on reasoning, the chat deadline is still 60s, and `draft-and-review` still uses the Workflows default of 5 retries and a 10-minute attempt timeout.

**Approach:** Before that same rethrow, emit one `console.warn`. Add `reasoning: { enabled: false }` beside `reasoning_effort: "none"`, keep `max_tokens` at 2048, give only the DeepInfra chat dispatch 120s, and run `draft-and-review` once with a 20-minute attempt timeout.

## Boundaries & Constraints

**Always:** One warn object, same style as `cost_policy_invalid` (`diagnosticText`, `errorFacts`): `event: "provider_call_failed"`, `provider: "deepinfra"`, `stage`, `elapsedMs`, `model`, `gatewayId` (`AI_GATEWAY_ID`), `accountIdLast4` (last 4 of `CLOUDFLARE_ACCOUNT_ID` only), `urlHost`, `urlPath` with the account segment masked (`/v1/****3c16/default/custom-deepinfra/v1/openai/chat/completions`), `hasAuthorization`, `hasGatewayAuth`, `dispatchedAt`, `headersReceived`. Optional when known: `status`, `responseType`, `bodyPrefix` (180, whitespace-collapsed, bearer redacted), `errorName`, `errorMessage`, `aigLogId` (`cf-aig-log-id` only). Stages: `timeout` for `AbortError` or `TimeoutError`; `network` when fetch throws otherwise; `redirect_refused` for status 0, `opaqueredirect`, or 3xx (status and `response.type`, body not read); `http` for other non-OK; `invalid_body` when JSON parse throws; `unknown` otherwise. A parsed body adds `finishReason` (`choices[0].finish_reason`), `completionTokens` (`usage.completion_tokens`), and `reasoningTokens` (`usage.completion_tokens_details.reasoning_tokens` when present). No message or reasoning text. Scrub the resolved key, gateway token, and full account id from every logged string. Chat body adds `reasoning: { enabled: false }` and still sends `max_tokens: policy.outputTokens` (2048). `DEEPINFRA_CHAT_TIMEOUT_MS` is `120_000` and is the `withAbortableDeadline` at the `complete` dispatch only when `mapping.provider === "deepinfra"`. Catalog preflight, `prepare`, and every other provider stay on `PROVIDER_TIMEOUT_MS` (60s). `STEERING_POST_TIMEOUT_MS` is `2 * DEEPINFRA_CHAT_TIMEOUT_MS + 10_000`. `step.do("draft-and-review", { retries: { limit: 0, delay: 0 }, timeout: "20 minutes" }, ...)` only; other steps stay default. The thrown error remains `provider_error` / `DeepInfra gateway request failed.` A chat failure still `markUncertain`s with `provider_outcome_unknown` and does not release or settle.

**Never:** No request headers, `Authorization`, API key, gateway token, or `Location`. No `operationKey` or `runId` (they are not in the chat closure). Do not change the URL, the reservation bound, settlement, the catalog warn, OpenRouter, or CourtListener. Do not deploy. Do not edit reject or batch files (`approval.ts`, `LoopControls.tsx`, `adminApi.test.ts`). Do not run `bmad-code-review`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Abort or timeout | Fetch rejects `AbortError` or `TimeoutError` | One warn: `stage: "timeout"`, that `errorName`, numeric `elapsedMs`, `headersReceived: false`, routing facts | Same generic `provider_error` |
| HTTP 5xx | 503, long text, secret in body, `cf-aig-log-id` | `stage: "http"`, `status: 503`, `bodyPrefix` length 180, `aigLogId`; secret absent | Same generic error |
| Refused 3xx | 302 or opaque redirect | `stage: "redirect_refused"`, `status`, `responseType`; body not read; no `Location` | Same generic error; uncertain 16¢ if through `complete` |
| Invalid JSON | 200, not JSON, secret in body | `stage: "invalid_body"`, `errorName: "SyntaxError"`; secret absent | Same generic error |
| Parsed failure body | Non-OK JSON with `finish_reason`, token counts, and message text | `finishReason`, `completionTokens`, `reasoningTokens`; message text absent | Same generic error |
| Routing | Key and token configured; long account id | `gatewayId`, last 4, masked path, both auth booleans true, `dispatchedAt`, `headersReceived`; full id and secrets absent | N/A |
| Reasoning body | Successful chat | Body has `reasoning_effort: "none"` and `reasoning: { enabled: false }`; `max_tokens` 2048 | N/A |
| Deadlines | Hung chat; hung catalog | Chat still pending at 60s and fails at 120s; catalog fails at 60s | Uncertain liability unchanged |
| Draft step | Workflow reaches review | Config is exactly `{ retries: { limit: 0, delay: 0 }, timeout: "20 minutes" }` | Other steps omit a config |

</intent-contract>

## Code Map

- `src/pipeline/ai/gateway.ts` — `diagnosticText` / `errorFacts` / `logCostPolicy` at 111–148. `DEEPINFRA` chat URL at 1070. Chat POST at 1170–1215: `deepInfraRedirectRefused` (1048) treats every `!ok` as a bare `throw new Error()` before the generic catch. `complete` deadline is `withAbortableDeadline` at 514–534 (`PROVIDER_TIMEOUT_MS`). Catalog deadline stays at 1107. `prepare` deadline stays at 440. `policy.outputTokens` is the literal 2048 (`costPolicy.ts`). Drafter/reviewer outputs: docket basis max 400 (`docketInference.ts`); reviewer `notes` and entity `body` have no max (`draftAndReview.ts` 73–88). Leave `max_tokens` at 2048.
- `src/shared/lib/timeouts.ts` — `PROVIDER_TIMEOUT_MS` 48; `STEERING_POST_TIMEOUT_MS` 54 is `2 * PROVIDER_TIMEOUT_MS + 10_000` (130s). Raise it off the 120s chat deadline. `SteeringPanel.mount.test.tsx` asserts the derived "130 seconds".
- `src/pipeline/workflow/dailyRun.ts` — `step.do("draft-and-review")` at 366 has no config. Cloudflare docs (`/workflows/build/sleeping-and-retrying/`): omitted config is `retries.limit` 5, `delay` 10000, `backoff` exponential, `timeout` "10 minutes". `WorkflowStep.do` (`env.d.ts` 13182) takes `(name, config, callback)`.
- `src/pipeline/workflow/dailyRunRecovery.test.ts` — `Checkpoints.step.do` (54) treats argument 2 as the callback. It must accept an optional config or `draft-and-review` breaks.
- `src/pipeline/ai/deepinfra.test.ts` — Success body assertion at 269. Hung chat at 175 advances `PROVIDER_TIMEOUT_MS`. Catalog hang at 639 and prepare hang at 818 must stay 60s. Redirect chat test at 1042 expects the body unread.

## Tasks & Acceptance

**Execution:**
- `src/pipeline/ai/gateway.ts` — One scrubbed warn before the same rethrow; both reasoning controls; 120s only for the DeepInfra `complete` dispatch.
- `src/shared/lib/timeouts.ts` — Add `DEEPINFRA_CHAT_TIMEOUT_MS` and retarget the steering client constant. Update the steering comment and the "130 seconds" assertion.
- `src/pipeline/workflow/dailyRun.ts` — Pass the draft-and-review step config. Teach the recovery checkpoint stub to record it.
- `src/pipeline/ai/providerCallFailed.test.ts` — One stubbed test per failure stage, plus parsed usage and routing, with a planted env secret and body secret.
- `src/pipeline/ai/deepinfra.test.ts` — Pin the request body and the 60s/120s split. `src/shared/lib/timeouts.test.ts` pins the constants.

**Acceptance Criteria:**
- Given each matrix row, when the chat closure fails, then exactly one warn matches that row and the thrown `provider_error` message is unchanged.
- Given a successful DeepInfra chat, when the body is read, then both reasoning controls are present and `max_tokens` is 2048.
- Given a hung DeepInfra chat and a hung catalog, when fake time advances, then the chat survives 60s and fails at 120s, and the catalog fails at 60s.
- Given a material run, when `draft-and-review` is invoked, then its config is the object in the matrix and the other steps pass no config.

## Spec Change Log

## Review Triage Log

## Design Notes

Docket drafter output is a small inference object (basis ≤ 400). Reviewer `notes` and the entity drafter `body` have no max, and the admission bound is still 2048 tokens. Lowering `max_tokens` could clip a legal answer, so it stays 2048. `operationKey` and `runId` are not arguments of `LlmProvider.complete`. A parsed JSON body omits `bodyPrefix` so message text cannot ride along in the raw prefix; non-JSON error text still gets the 180-character prefix. Workflows default cited from Cloudflare docs retrieved 2026-10-10: https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/

## Verification

**Commands:**
- `npm run check` -- expected: exit 0
- `npm test` -- expected: exit 0

**Manual checks (if no CLI):**
- `git diff` must not touch `src/pipeline/gate/approval.ts`, `src/surfaces/admin/LoopControls.tsx`, or `src/shared/api/adminApi.test.ts`. No deploy.

## Auto Run Result

Status: in-review

Summary: DeepInfra chat failures now emit one scrubbed `provider_call_failed` warn before the same generic `provider_error`. The chat body sends `reasoning: { enabled: false }` beside `reasoning_effort: "none"`. `max_tokens` stays 2048. Only the DeepInfra `complete` dispatch uses `DEEPINFRA_CHAT_TIMEOUT_MS` (120s). Catalog preflight, prepare, and other providers stay at 60s. The steering client timeout is `2 * 120_000 + 10_000` (250s). `draft-and-review` runs with `{ retries: { limit: 0, delay: 0 }, timeout: "20 minutes" }`.

Files changed:
- `src/pipeline/ai/gateway.ts` — failure warn, reasoning flag, 120s DeepInfra chat deadline
- `src/pipeline/ai/providerCallFailed.test.ts` — one stubbed warn test per failure stage, plus parsed usage
- `src/pipeline/ai/deepinfra.test.ts` — request body and the 60s/120s split
- `src/shared/lib/timeouts.ts` — chat and steering constants
- `src/shared/lib/timeouts.test.ts` — pins those constants
- `src/pipeline/workflow/dailyRun.ts` — draft-and-review step config
- `src/pipeline/workflow/dailyRunRecovery.test.ts` — records that config
- `src/pipeline/workflow/runAdmission.test.ts` — checkpoint stub accepts the optional config
- `src/surfaces/admin/SteeringPanel.tsx` — comment matches the longer deadline
- `src/surfaces/admin/SteeringPanel.mount.test.tsx` — message now says 250 seconds
- `_bmad-output/implementation-artifacts/spec-gh-68-deepinfra-provider-call-failed-diagnostics.md` — this spec

Review findings breakdown: no patches, no deferred items, no rejected findings. Blind Hunter, Edge Case Hunter, Verification Gap, and Intent Alignment were not launched because this run has no subagent tool. `bmad-code-review` was not run. Follow-up review recommendation: false, because no review pass produced patch verdicts.

`max_tokens` choice: left at 2048. The docket drafter basis is at most 400 characters, but reviewer `notes` and the entity drafter `body` have no maximum, and the admission bound is still 2048 tokens.

Verification: `npm run check` exit 0. `npm test` exit 0 (1555 passed, 6 skipped). Diff does not touch `approval.ts`, `LoopControls.tsx`, or `adminApi.test.ts`. No deploy.

Residual risk: the four build-auto review layers did not read the diff.
