---
title: 'Admin latest-run reconcile'
type: 'feature'
created: '2026-10-10'
status: 'in-review'
baseline_revision: '78542383c7b32dffa33272e9d9f91f4a4ca44420'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/docs/llm-accounting.md'
warnings:
  - oversized
deferred: []
---

<intent-contract>

## Intent

**Problem:** Operators can reconcile an open accounting issue only by calling `POST /api/admin/llm-calls/:id/reconcile`. The admin latest-run card's accounting disclosure is read-only, and `GET /api/admin/loop` does not return operation id or version.

**Approach:** Add a Reconcile form inside that disclosure for each operation with an open `issue`, posting the existing body through the existing admin fetch helper. Expose the evidence operation rows on the loop GET. Do not change reconciliation rules.

## Boundaries & Constraints

**Always:** Match `ReconciliationInputSchema` exactly. Actor stays the Access operator (`credentials: "same-origin"`, `content-type` and `accept` JSON, `fetchWithTimeout`, `ADMIN_POST_TIMEOUT_MS`), same as `rejectRun`. `requestId` is a fresh `crypto.randomUUID()` per submit. `expectedVersion` is that row's numeric `version`. `originalUsd` is sent only for `confirmed_charge` and must match `/^\d+(?:\.\d+)?$/`. `confirmed_no_charge` omits the key. `evidenceReference` and `note` are required, trimmed, and labeled public in visible text. Confirm step names the operation id, the decision, and the charge amount (no-charge states that no USD amount is sent). Failure shows the JSON `message` and leaves the form open with values kept. Success shows a confirmation and reloads `GET /api/admin/loop`. Buttons are `type="button"` with no `accesskey`. Base the branch on `origin/main` `78542383c7b32dffa33272e9d9f91f4a4ca44420`.

**Never:** Change the reconcile route, `ReconciliationInputSchema`, `llmAccountingRepo.reconcile`, accounting semantics, `src/pipeline/ai/gateway.ts`, `rejectRun` (#66 404 notice and singular/plural draft copy), `approval.ts`, or `wrangler.jsonc`. Do not add a reconcile control on the ops evidence page. Do not bind J/K/A/E/R or any other shortcut to this action. Do not deploy.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open issue only | Loop payload has one op with `issue: "timeout"` and one with `issue: null` | Reconcile control only for the timeout row, inside Budget accounting details | No error expected |
| Charge | Decision `confirmed_charge`, `originalUsd` `0.01234`, version `3` | POST body includes `originalUsd`, `expectedVersion: 3`, new `requestId`, reference, and note; confirm names the operation id and `0.01234` | Empty or non-decimal USD does not POST |
| No charge | Decision `confirmed_no_charge` | Body has no `originalUsd` key; USD input is not shown | No error expected |
| Server error | POST 409 `{ code, message: "Stale or conflicting reconciliation." }` | That message is visible; form stays open; no success confirmation | Show `message` |
| Success | POST 200 | Confirmation names the operation; another `GET /api/admin/loop` runs | No error expected |
| Shortcuts | Keys j, k, a, e, r | No reconcile POST | No error expected |
| Loop GET | Latest run has an operation | Response adds `accountingOperations` with `id`, `version`, `issue` | Latest `null` body stays unchanged |

</intent-contract>

## Code Map

- `src/server.ts` ~326–349 — `GET /api/admin/loop` returns `{ latest, pendingHeadCount, dispatches }`. `latest` is a strict `RunLogItem` and has no operations. Add `accountingOperations` only when `latest` is non-null.
- `src/server.ts` ~623–671 — Reconcile POST. Read-only. 400 message `Invalid reconciliation body.`; 409 `Stale or conflicting reconciliation.`; 500 `Unexpected server error.`; actor is `gate.operator.displayName`.
- `src/shared/schemas/gateway.ts` ~142–165 — `ReconciliationInputSchema`. Strict object; charge requires `originalUsd`; no-charge forbids it.
- `src/shared/schemas/run.ts` ~245–261 — Public operation object (`id`, `logicalKey`, `state`, `version`, `boundCents`, `liabilityCents`, `createdAt`, `providerRequestId`, `issue`). Reuse this object schema on the client. Do not add fields to `RunLogItemSchema`.
- `src/shared/db/repos/runsRepo.ts` ~324–349 — `accountingSnapshot` already selects those operation columns for one run. Add `listAccountingOperations(db, runId)` with that same SELECT; leave the snapshot query in place.
- `src/surfaces/admin/LoopControls.tsx` ~223–260 — loop GET parse. ~457–540 — `rejectRun` fetch pattern and #66 behavior (404 notice, `1 draft was rejected.` vs plural). ~590–673 — reject question/singular noun and the `cost-details` disclosure. Insert the form inside that disclosure.
- `src/surfaces/admin/loopControls.mount.test.tsx` — jsdom `scripted` fetch, `fireEvent`, body text. Reject test ignores J/K/A/E/R. Add reconcile cases here.
- `src/shared/api/adminApi.test.ts` ~1098–1110 — empty loop body is exact `{ latest: null, pendingHeadCount: null, dispatches: [] }`. ~2902 — existing reconcile route test; do not edit it. Add a loop GET test beside the loop describes.
- `src/surfaces/ops/EvidenceDetail.tsx` ~804–823 — read-only operation lines. Do not edit.
- `docs/llm-accounting.md` § Operator reconciliation — public evidence reference and note; omit `originalUsd` for no charge.
- `src/shared/ui/pml.css` ~3360 — latest-run `.cost-details` already has `max-width: none`. Reuse `.rejectbox` for the confirm step. No CSS change required unless the form overflows.

## Tasks & Acceptance

**Execution:**
- `src/shared/db/repos/runsRepo.ts` -- add `listAccountingOperations` using the snapshot operation SELECT -- give the loop GET id, version, and issue without a second shape.
- `src/server.ts` -- when `latest` is non-null, set `accountingOperations` from that helper -- smallest read-only GET addition; omit the key when `latest` is null.
- `src/surfaces/admin/LoopControls.tsx` -- parse operations, render Reconcile only for a non-empty `issue`, validate, confirm, and POST -- this is the operator surface.
- `src/surfaces/admin/loopControls.mount.test.tsx` -- cover the matrix rows except the route contract -- mount style already owns this card.
- `src/shared/api/adminApi.test.ts` -- assert a seeded operation's `id`, `version`, and `issue` on `GET /api/admin/loop` -- locks the GET addition.

**Acceptance Criteria:**
- Given an open `issue` and a null `issue` on the latest run, when the accounting disclosure renders, then only the open row offers Reconcile.
- Given a charge or no-charge confirm, when the operator submits, then the POST matches `ReconciliationInputSchema` and uses the row version plus a new request id.
- Given a failed POST, when the response JSON has `message`, then that text remains visible and the form stays open.
- Given success, when the confirmation shows, then loop status reloads from `GET /api/admin/loop`.
- Given keys j, k, a, e, or r, when the disclosure is open, then no reconcile POST is sent.
- Given #66 reject behavior, when one draft is rejected or the run is missing, then the singular notice and the 404 notice are unchanged.

## Spec Change Log

## Review Triage Log

### 2026-10-10 — Review pass (#71 at b8a05c4, bmad-code-review, four layers)

- verdicts: 14 findings — high 2, medium 2, low 10, false 0, maybe-false 0
- resolution: the four `[patch]` findings are applied on this branch. The ten `[low]` items stay in `deferred-work.md`.
- findings:
  - `[high]` `[patch]` One bad accounting row makes `listAccountingOperations` throw and the loop GET fail closed to signed-out — parse each row with `safeParse`, drop and log it, and return `[]` if the query throws.
  - `[high]` `[patch]` A 409, 404, timeout, or unknown throw retries with a stale `expectedVersion` because the loop poll only runs for running or awaiting — call `setReload` and keep the form values.
  - `[medium]` `[patch]` A reconcile 403 is shown as a form error — treat it as signed out, the same way `rejectRun` does, and reload.
  - `[medium]` `[patch]` The Reconcile control does not show `issue`, `state`, `liabilityCents`, or `providerRequestId` — render those next to the control. The loop payload already includes them.
  - `[low]` `[defer]` Reuse `requestId` on retries of an unchanged draft — recorded in `deferred-work.md`.
  - `[low]` `[defer]` Review/Confirm version-change guard — recorded in `deferred-work.md`. The server version check remains the safety net.
  - `[low]` `[defer]` Keep form drafts across poll unmounts — recorded in `deferred-work.md`.
  - `[low]` `[defer]` Derive validation messages and limits from `ReconciliationInputSchema` — recorded in `deferred-work.md`.
  - `[low]` `[defer]` Use the `ADMIN_POST_TIMEOUT_MS` text — recorded in `deferred-work.md`.
  - `[low]` `[defer]` `aria-describedby` / `aria-invalid` and "(public)" on the labels — recorded in `deferred-work.md`.
  - `[low]` `[defer]` Update `docs/llm-accounting.md` for the UI path and the loop GET field — recorded in `deferred-work.md`.
  - `[low]` `[defer]` `Promise.all` the loop GET queries and trim the payload to open ops — recorded in `deferred-work.md`.
  - `[low]` `[defer]` Give `version` its own schema instead of `cents` — recorded in `deferred-work.md`.
  - `[low]` `[defer]` Spec metadata (`followup_review_recommended`, triage log, CSS note) — recorded in `deferred-work.md`. This pass adds the triage log the review asked to record.

## Design Notes

Open `issue` means a non-empty string. Null and `""` are not open. The select starts empty so neither decision is implied; `originalUsd` stays unmounted until `confirmed_charge`. Confirm is a second explicit button, not Enter and not a shortcut. Each submit generates its own `requestId`. The success path calls the existing reload (`setReload`) so spend, issue count, operations, and run status refresh together. Branch from `7854238` before editing so #66's `LoopControls` reject copy is the base, not `54ef6f3`.

## Verification

**Commands:**
- `npm run check` -- expected: exit 0
- `npm test` -- expected: exit 0

## Auto Run Result

Status: in-review

Summary: The latest-run accounting disclosure now offers Reconcile for each operation with a non-empty `issue`. The form posts `ReconciliationInputSchema` through the existing admin fetch helper. `GET /api/admin/loop` adds `accountingOperations` when a latest run exists.

Files changed:
- `src/shared/schemas/run.ts` — named the existing public operation schema
- `src/shared/db/repos/runsRepo.ts` — read-only operation list for one run
- `src/server.ts` — loop GET includes those rows only when latest is non-null
- `src/surfaces/admin/LoopControls.tsx` — reconcile form, confirm step, and POST
- `src/shared/ui/pml.css` — form field layout inside the disclosure
- `src/surfaces/admin/loopControls.mount.test.tsx` — mount coverage for the matrix
- `src/shared/api/adminApi.test.ts` — route test for id, version, and issue

Review findings breakdown: The implementation subagent and the four review layers (blind-hunter, edge-case-hunter, verification-gap, intent-alignment) could not be launched. This session has no subagent tool. Blocking condition for those layers: `no subagents`. No patches were applied by review. No findings were deferred or rejected because the layers did not report.

Follow-up review recommendation: false. No patched entries exist. `followup_review_recommended` stays false.

Verification: `npm run check` exit 0. `npm test` exit 0 (1590 passed, 6 skipped) after the review-fix commit. The skipped tests were already skipped before this change.

Residual risks: Review layers did not read the diff. The live Access-gated admin page was not clicked in a browser; the jsdom mount tests exercise the form.
