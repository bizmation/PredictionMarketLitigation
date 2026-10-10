---
title: 'Reject remaining undecided heads when a Run is partly approved'
type: 'feature'
created: '2026-10-10'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-reject-awaiting-run-batch.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `POST /api/admin/runs/:id/reject` returns 409 (`reject_run_unpublished`) when any current head is `approved` or `edited`. After one draft is approved, the other undecided heads can only be closed one at a time, so the Run never finalizes.

**Approach:** The same operator route rejects every remaining undecided current head and finalizes through the existing decided-run path. That path publishes when any approved or edited draft exists. One `run.completed` receipt records the rejected count.

## Boundaries & Constraints

**Always:**
- Header-only `requireOperator`. Cookie-only `CF_Authorization` stays 403 and writes nothing.
- One `db.batch`: Run is `awaiting`, at least one undecided current head exists, update those heads, `finalizeDecidedRunStmt`, then one `run-completed-${runId}` row guarded by `changes() = 1`.
- Same reject columns as today. `reject_reason` stays null. `reject_reason_private` stays `Rejected with the Run.` That sentence stays off public payloads.
- Receipt payload stays `status`, `rejectedCount`, `decidedBy`. `status` is the Run status after finalize (`published` if any draft is `approved` or `edited`, else `rejected`). `rejectedCount` is only the heads this call rejected. The HTTP body returns that `status` and count.
- Repeat, not awaiting, or no undecided current head: 409 and no second receipt. Unknown id: 404.
- Approved and edited heads, `edited_body`, and F1 written at approval stay unchanged. Holds still block admission. A fully rejected settled Run still admits a new Run. A published result still requires supersede.
- Confirm copy names how many drafts will be rejected and says already-approved drafts stay published.

**Never:**
- No `gate.decided`, F1, docket-event, or baseline writes from this reject. Do not change `finalizeDecidedRunStmt`, admission SQL, or `currentHeadSql`.
- Do not clear accounting. Do not deploy. Do not edit `gateway.ts` or `courtListener.ts`.
- Do not re-apply the in-flight #64 follow-up (bc-1a74da67): narrowed catch, 400 body tests, singular copy, 404 confirm close. Leave the catch as it is on the starting base. On rebase, do not widen it.
- J, K, A, E, and R must not call this route. No new request field.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Anonymous / cookie | No token, or JWT only in the cookie | 403, no writes | fail closed |
| All undecided | `awaiting`, undecided heads only | Heads rejected, receipt `status: rejected`, Run `rejected` | rolls back if the receipt misses |
| Partly approved | `awaiting`, an `approved` or `edited` current head, plus an undecided head | Undecided heads rejected; decided heads unchanged; Run `published`; receipt `status: published` and this call's count | rolls back if the receipt misses |
| Non-head | Superseded parent still undecided | Parent outcome stays null | N/A |
| Repeat / closed | Already `published` or `rejected`, or no undecided head | No second receipt | 409 |
| Unknown | Unknown id, or not `awaiting` | No writes | 404, or 409 if known |
| Side effects | Partly approved success | No new `gate.decided`, docket, or F1 rows | N/A |
| Admission | Fully rejected, finished, settled | New Run for that date is admitted | N/A |
| Supersede | Published by this reject, settled, no hold | Later start without supersede is `supersede_required` | existing rule |
| Accounting hold | Reserved, uncertain, or an issue remains | Date stays blocked | existing conflict |
| Confirm | Awaiting, undecided count > 0 | Copy names the count and that already-approved drafts stay published | Shortcuts do not POST |
| Success | Body `status` is `published` | Card shows `published`; notice names the rejected count | All-rejected notice stays |

</frozen-after-approval>

## Code Map

- Baseline `103fb656a6173eda92d9cd93824706cc5c9183cd`. Leave `src/pipeline/ai/gateway.ts`, `src/pipeline/connectors/courtListener.ts`, `finalizeDecidedRunStmt`, `currentHeadSql`, and admission SQL alone.
- `src/shared/lib/access.ts` `readTokens` — POST ignores the cookie. `requireOperator` in `src/server.ts` already guards the route.
- `src/pipeline/gate/approval.ts` `rejectAwaitingRun` — delete the approved/edited pre-check and `reject_run_unpublished`. Keep the awaiting check, zero-head check, private reason, `outcome IS NULL` update, finalize, and receipt. Return receipt `status` plus `rejectedCount`. Do not edit the catch.
- `src/server.ts` reject handler — JSON `status` is that terminal status.
- `src/surfaces/admin/LoopControls.tsx` — replace `Nothing will be published.` with `Already-approved drafts stay published.` Keep the count sentence and `Reject {n} drafts` button. On `published`, set the card to `published` and name the rejected count.
- `src/shared/api/adminApi.test.ts` — approved and edited heads expect `published`, unchanged rows, unchanged `f1Snapshot`, no new docket or `gate.decided`, one receipt, and 409 on repeat. Keep the all-undecided, cookie, and reserved-cent tests.
- `src/surfaces/admin/loopControls.mount.test.tsx` — confirm text has the count and `Already-approved drafts stay published.` A `published` response updates the card.

## Tasks & Acceptance

**Execution:**
- [ ] `src/pipeline/gate/approval.ts` — let a partly decided awaiting Run through the existing batch and return the receipt status.
- [ ] `src/server.ts` — return that terminal status.
- [ ] `src/surfaces/admin/LoopControls.tsx` — confirm copy and published success state.
- [ ] `src/shared/api/adminApi.test.ts`, `src/surfaces/admin/loopControls.mount.test.tsx` — partly approved, edited, confirm, and supersede rows.

**Acceptance Criteria:**
- Given the all-undecided, cookie-only, repeat, and reserved-cent cases, when this route runs, then those #64 outcomes still hold.
- Given a taken `run-completed-${runId}` id, when the batch runs, then it rolls back and the route returns 409, using the catch already on the branch.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run check` — expected: exit 0
- `npm test` — expected: exit 0
