---
title: 'Diagnose DeepInfra cost-policy failures and cap the first docket fetch'
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

**Problem:** Run `run-20261010-0003` (main `5ee23f6`) stored 335 drafts as `evals_not_run` with basis `Evaluation did not complete: cost_policy_invalid`, and spent $0. The DeepInfra policy is valid through `2026-10-11T19:10:00Z`, and a desktop `/models/list` fetch passes. The Worker catch hides the cause. With no stored events, `sources.published_at` reaches back to `2025-11-28`, so a later success still reserves about 16 cents a call against the USD 1 cap.

**Approach:** Keep code `cost_policy_invalid`, name the stage, and record the failure on the error, the draft basis, and one log. Send a User-Agent and `Accept: application/json` on the catalog request. On the `source_published_at` path only, use the later of that baseline and 2 days before the ET run date.

## Boundaries & Constraints

**Always:** Stages are `policy_lookup`, `policy_model_mismatch`, `deepinfra_preflight`, `openrouter_preflight`, and `revalidate_before_inference`. Basis and `GatewayError` message are `cost_policy_invalid: <stage>`, plus ` (http <status>)` when a status exists. Example: `cost_policy_invalid: deepinfra_preflight (http 403)`. Siblings stopped by that error use the same basis. Detail and one `console.warn` object also include a caught error's name and message, HTTP status, a whitespace-collapsed body prefix of at most 180 characters, and the failed field. No secrets, keys, or headers. Catalog headers are `User-Agent: PredictionMarketLitigation/0.1.0 (+https://predictionmarketlitigation.com)` and `Accept: application/json`; `redirect: "error"` stays. `COURTLISTENER_FIRST_FETCH_WINDOW_DAYS` is 2. The run date is the `America/New_York` date of `deps.now()`. The cutoff is the later of `published_at` and that date minus 2 calendar days, inclusive for the client filter, pagination stop, and `date_filed__gte`. The summary adds `effectiveCutoff` and `skippedOlder` (returned entries filed strictly before the cutoff). The `MAX(occurred_at)` path and a null baseline stay unchanged.

**Never:** Do not deploy, start a Run, or change Cloudflare or staging. Do not change 3.36 (`in-progress`) or 3.37 (`backlog`). Do not change `costPolicy.ts` or the public code. Do not backfill older history (deferred). Do not add a draft-count cap, Queues, or a new checkpoint.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Other stages | Bad policy, mismatch, OpenRouter, or revalidate | Basis names that stage; OpenRouter records status, field, or the caught error | DeepInfra must not relabel revalidate |
| Recent first fetch | `published_at` later than the window start | Cutoff stays `published_at` | N/A |
| No baseline | No event date and no `published_at` | No `date_filed__gte` | N/A |

</frozen-after-approval>

## Code Map

- `src/pipeline/ai/gateway.ts` — Five `cost_policy_invalid` sites: policy catch, model mismatch, `revalidateBeforeInference`, OpenRouter preflight, DeepInfra preflight. Move DeepInfra revalidate out of the bare catch. Do not change reservation or `costPolicy.ts`.
- `src/pipeline/ai/deepinfra.test.ts` — Catalog fetch sends no headers today. Pin the new ones. Bound is 16 cents.
- `src/pipeline/ai/gateway.test.ts` — Add stage, status, and field on OpenRouter refusals.
- `src/pipeline/agents/draftAndReview.ts` — Basis is `Evaluation did not complete: ${code}`; siblings get a generic skip. This code stops the run. Keep that, and use the public message for both.
- `src/pipeline/connectors/courtListener.ts` — `entriesUrl`, baseline, summary, and client skip. Reuse `etCalendarDate`. Do not change pace, 429, or timeouts.
- `src/pipeline/connectors/courtListener.test.ts` — Keep stored-date D, null baseline, and the `2026-09-12` MAX cutoff. Inject `now`.
- `src/server.ts` — Admin 503 returns `error.message`. Log one object, like `courtlistener_request_timeout`.

## Tasks & Acceptance

**Execution:**
- [ ] `src/pipeline/ai/gateway.ts` -- Add stages, message, detail, one log, named fields, and catalog headers.
- [ ] `src/pipeline/ai/deepinfra.test.ts` -- Cover 403, a named field, a thrown fetch, headers, and no secrets.
- [ ] `src/pipeline/ai/gateway.test.ts` -- Cover the other four stages.
- [ ] `src/pipeline/agents/draftAndReview.ts` -- Use the public message for this code, including stopped siblings.
- [ ] `src/pipeline/agents/draftAndReview.test.ts` -- Assert the basis.
- [ ] `src/pipeline/connectors/courtListener.ts` -- Apply the window on `source_published_at` only and record the two summary fields.
- [ ] `src/pipeline/connectors/courtListener.test.ts` -- Cover the window, both boundaries, and the unchanged MAX cutoff.

**Acceptance Criteria:**
- Given a non-OK catalog response, when preflight throws, then the code stays `cost_policy_invalid`, the basis matches the Boundaries example, and the log has the detail fields with no secret or header.
- Given any other `cost_policy_invalid` site, when it throws, then the basis names only that stage.
- Given the catalog request, when it is sent, then it carries the User-Agent and `Accept` from Boundaries.
- Given no stored events and a `published_at` older than 2 ET days, when the docket is polled, then `date_filed__gte` is the cutoff, that date is drafted, the day before is not, and the summary has the cutoff and `skippedOlder`.
- Given `MAX(occurred_at)` date D, when that docket is polled, then `date_filed__gte` is D and the window fields are absent.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

32 cents per draft means the 100-cent cap completes 3 drafts. Two ET days is the handful; one day is often empty and seven overruns. A burst still hits the cap.

## Verification

**Commands:**
- `npm run check` -- expected: exit 0
- `npm test` -- expected: exit 0
