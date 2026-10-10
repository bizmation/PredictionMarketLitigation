---
title: 'Release a DeepInfra 429 engine_overloaded chat without blocking the LLM period'
type: 'bugfix'
created: '2026-10-10'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/llm-accounting.md'
  - '{project-root}/docs/deepinfra-runbook.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Staging worker `7d6851ff` (main `e2d0d3d`) revised `de-case-nv-assad-9th-457656684`. Drafter `bc41ae9d` settled. Reviewer `26ec8765` came back in 417ms as HTTP 429 `engine_overloaded` with headers. `complete()` stored `uncertain` / `provider_outcome_unknown`, and that 16-cent issue blocks `llm_period_admission` for the whole period.

**Approach:** Retry only that refusal inside the DeepInfra chat closure, under the one reservation. If the closure gives up on that same refusal, release with no issue and evidence reason `provider_definite_refusal`. Patrick approved this exception at 7:51 PM ET on 2026-10-10. Every other failure stays uncertain.

## Boundaries & Constraints

**Always:** Release (`issue` null, `liability_cents` 0) only when the chat response exists, `status` is 429, and `jsonApiError` `errorCode` is `engine_overloaded`. Evidence is `{ reason: "provider_definite_refusal", status, errorCode, aigLogId }` (`aigLogId` from `cf-aig-log-id` when present). New repo function, not `releaseBeforePaidInvocation`. Retry only this case, in the chat closure, on that same row. At most three HTTP attempts. Backoff 5s, then 15s, then 30s. Do not start an attempt when less than 80s of the 120s chat deadline would remain after that backoff. Log every attempt: attempt number, `elapsedMs`, `status`, `errorCode`, `aigLogId`. Both docs name this exception and Patrick's approval on 2026-10-10. The release is its own commit.

**Never:** Do not release any other 4xx, any 5xx, timeout, network error, redirect, or 429 with a different code. Do not call `gateway.complete` again on the same key. Do not change admission SQL, `cf-aig-max-attempts` (`"1"`), preflight, `prepare`, other providers, `timeouts.ts`, `STEERING_POST_TIMEOUT_MS`, or the 20-minute `draft-and-review` step (retries 0). No deploy.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Retry then success | 429 `engine_overloaded` with headers, then 200 | One row `settled`, one `llm_calls` row | No `provider_error` |
| Overload gives up | All attempts are that 429, or the 80s gate stops | `uncertainCents` 0, `issueCount` 0, `released`, liability 0, evidence reason `provider_definite_refusal`, `status` 429, `errorCode` `engine_overloaded`, `aigLogId` | `provider_error`. Same key: `result_unavailable`. A different key in the period can reserve |
| Not this refusal | Other 429, 400, 422, 5xx, timeout, network | One fetch. `uncertain`, `provider_outcome_unknown`, liability 16, `issueCount` 1 | Repeat is `accounting_uncertain` |
| Deadline gate | Fake timers; after the next backoff, under 80s would remain | That attempt is not sent | Last matching 429 still releases |
| Overload then unknown | A later attempt is 5xx, timeout, or network | Stays uncertain. No release | `provider_outcome_unknown` |

</frozen-after-approval>

## Code Map

- `src/pipeline/ai/gateway.ts` — Chat closure (`jsonApiError`, `logDeepInfraChatFailure`) becomes `GatewayError("provider_error")`. `complete()` uses `withAbortableDeadline` / `DEEPINFRA_CHAT_TIMEOUT_MS`. Only `ProvenPreDispatchRefusal` releases today; else `markUncertain(..., "provider_outcome_unknown")`. `replay()` does not dispatch `released`.
- `src/shared/db/repos/llmAccountingRepo.ts` — `releaseBeforePaidInvocation` evidence is fixed `local_policy_refusal_before_paid_invocation`. `llm_period_admission` blocks on any attributed `issue`. `llm_run_accounting` ignores `released`.
- `src/shared/lib/timeouts.ts` — 120s chat, 250s steering, no retries here, `setTimeout` deadline. `src/pipeline/workflow/dailyRun.ts` — `draft-and-review` 20 minutes, retries 0.
- `src/pipeline/ai/deepinfra.test.ts` — D1 liability and fake-timer abort. `providerCallFailed.test.ts` uses `toMatchObject`. Docs say HTTP failures never release.

## Tasks & Acceptance

**Execution:**
- [ ] `src/shared/db/repos/llmAccountingRepo.ts` -- `releaseDefiniteProviderRefusal` uses the same owner, `dispatched`, and `version = op.version + 1` guard and `syncRun` as `releaseBeforePaidInvocation`. Own commit, with the docs and the `complete()` branch that calls it.
- [ ] `docs/llm-accounting.md` and `docs/deepinfra-runbook.md` -- Name only this 429 and Patrick's approval on 2026-10-10. Runbook: retries share the 120s deadline, so two chats fit in 250s. Leave the ~480s preflight gap and per-`draftCount` step timeout deferred.
- [ ] `src/pipeline/ai/gateway.ts` -- Second commit. Retry in the closure. Backoff `[5_000, 15_000, 30_000]` before attempts 2–4. No sleep and no send when `120_000 - elapsed - backoff < 80_000` (no fourth fetch: 5s+15s leaves at most 70s after 30s). Sleep with `setTimeout` on the deadline signal. Log `attempt` on each failure and on a later success. Terminal matching 429 is not `ProvenPreDispatchRefusal`. `complete()` releases, then throws the existing `provider_error`.
- [ ] `src/pipeline/ai/deepinfra.test.ts` -- Matrix, including fake timers for the 80s gate. One settlement. Give-up: `uncertainCents` 0, `issueCount` 0, evidence fields, and a different key can reserve.

**Acceptance Criteria:**
- Given `npm run check` and `npm test`, when they run, then both exit 0 and CI `verify` is green.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run check` -- expected: exit 0
- `npm test` -- expected: exit 0
