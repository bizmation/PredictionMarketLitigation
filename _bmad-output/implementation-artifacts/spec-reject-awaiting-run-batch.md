---
title: 'Reject every undecided draft in an awaiting Run'
type: 'feature'
created: '2026-10-10'
status: 'done'
route: 'dispatch'
baseline_commit: '01906011bf40785f0003dd6f00f9e8a0c8875b9c'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Admin can reject only one draft (`POST /api/admin/drafts/:id/decision`). Run `run-20261010-0003` is `awaiting` with 335 drafts, and it stays there until `finalizeDecidedRunStmt`, so admission refuses that date.

**Approach:** A run-level reject. One D1 batch rejects every undecided current-head draft, writes one public evidence row, and moves the Run to `rejected` through the existing terminal path. Nothing is published.

## Boundaries & Constraints

**Always:**
- `POST /api/admin/runs/:id/reject` only, behind `requireOperator`. Cookie-only `CF_Authorization` must not authorize it. No public or token path.
- Only while the Run is `awaiting`. Same decision columns as a per-draft reject. `reject_reason` stays null. `reject_reason_private` is the fixed sentence `Rejected with the Run.` That sentence stays off every public payload. Exactly one public evidence row: run id, rejected count, operator display identity, time. A repeat writes no second row.
- After reject, a finished settled admission lets a new Run through for that date: the check at `dailyRun.ts:270-282` does not return conflict. `reservedCents`, `uncertainCents`, or `accountingIssueCount` above zero still block (`dailyRun.ts:274-279`; `settled` and `date_admission` in `runAdmissionRepo.ts:27-28` and `:66-70`). Batch reject does not clear them. Story 3.36 stays `in-progress`.

**Never:**
- No publication, docket events, F1 writes, or baselines. No new shortcut, and J/K/A/E/R must not trigger this. Do not deploy, start a Run, or touch Cloudflare or staging. Do not edit `gateway.ts` or `courtListener.ts`. `d-expired` is an expired session. Supersede stays for a prior published Run only.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Anonymous | POST, no token | 403, no writes | fail closed |
| Cross-site | Valid JWT only in the cookie | 403, no writes | fail closed |
| Happy path | `awaiting`, undecided current heads only | Those heads rejected, one evidence row, Run `rejected` | rolls back if the receipt misses |
| Repeat | Already `rejected` | No second evidence row | 409 |
| Not awaiting | Other status, or unknown id | No writes | 409, or 404 if unknown |
| Approved head | A current head is `approved` or `edited` | No writes; Run stays `awaiting` | 409 |
| Side effects | Happy path | No `gate.decided`, docket, F1, or baseline writes | N/A |
| Admission | Rejected, finished admission, settled accounting | `startRun` admits a new Run; `dailyRun.ts:270-282` does not return conflict | N/A |
| Accounting hold | Rejected, but reserved cents, uncertain cents, or an accounting issue remain | That date stays blocked | conflict from `dailyRun.ts:274-279` and `date_admission` |
| Confirm | Latest admin Run is `awaiting` | Confirm step shows the undecided count, then POSTs | Shortcuts do not POST |

</frozen-after-approval>

## Code Map

- `src/shared/lib/access.ts` `readTokens` — POST ignores the cookie. Reuse `requireOperator`.
- `src/server.ts` ~211–398 — copy POST handling and the run-id pattern. Add the undecided head count beside `latest` on `GET /api/admin/loop`.
- `src/pipeline/gate/approval.ts` `decide` — same reject columns, private reason only, no `applyF1Stmts`, no per-draft `gate.decided`.
- `src/shared/db/repos/runsRepo.ts` `finalizeDecidedRunStmt` ~309–321 — refuse first if a current head is approved or edited.
- `src/shared/db/repos/draftsRepo.ts` `currentHeadSql` ~514 — heads only. Readiness is not required.
- `src/shared/db/repos/evidenceRepo.ts` `completionReceiptStmt` — reuse `run.completed` and id `run-completed-${runId}`. Payload `{ status: "rejected", rejectedCount, decidedBy }`.
- `src/shared/db/repos/gateAssertions.ts` `assertStmt` — `changes() = 1` rolls the batch back when the receipt misses.
- `src/pipeline/workflow/dailyRun.ts:270-282`, `runAdmissionRepo.ts:27-28`, `:66-70` — do not change this SQL.
- `src/surfaces/admin/LoopControls.tsx` ~481–551 — confirm on the latest-run card. `ApprovalQueue.tsx` ~697–737 keeps J/K/A/E/R per-draft.
- `src/shared/api/adminApi.test.ts` — auth and admission fixtures. Leave `3-36-...` unchanged. Do not edit `gateway.ts` or `courtListener.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `src/pipeline/gate/approval.ts` — add the batch reject from the Code Map.
- [x] `src/server.ts` — route, loop count, and 403/404/409 mapping.
- [x] `src/surfaces/admin/LoopControls.tsx` — count confirmation for the displayed `awaiting` Run.
- [x] `src/shared/api/adminApi.test.ts`, `src/surfaces/admin/loopControls.mount.test.tsx` — matrix rows, including shortcuts and the post-reject `startRun` admission test.

**Acceptance Criteria:**
- Given the matrix preconditions, when the route or the confirm control runs, then each row's outcome holds, including no publication side effects.
- Given a finished settled admission, when `startRun` follows reject, then `dailyRun.ts:270-282` admits the new Run. A reserved, uncertain, or issue balance still conflicts.
- Given J, K, A, E, or R on the admin Run card, when the key is pressed, then this route is not called.

## Implementation Notes

- `rejectAwaitingRun` writes `Rejected with the Run.` only to `reject_reason_private`. The `run.completed` payload is `status`, `rejectedCount`, and `decidedBy`.
- One D1 batch (Cloudflare D1 `batch()` transaction): awaiting / unpublished-head / undecided-head assertions, one head UPDATE, `finalizeDecidedRunStmt`, then `run.completed` guarded by `changes() = 1`. A failed assertion or a taken evidence id rolls the batch back.
- `GET /api/admin/loop` adds `pendingHeadCount` for an awaiting latest Run. The latest-run card uses a `<button type="button">` confirm step (React docs: pass `onClick`, do not add an access key). J/K/A/E/R are not handled.
- Reserved cents still block same-date admission after reject (`dailyRun.ts:274-279` and `date_admission`). The reject path does not clear them.
- Verification: `npm run check` passed. `npm test` passed 1516 tests, 6 skipped.
- Confirm is stored as the run id. Timeout and 403 clear it. Success marks that card `rejected` before the reload. A zero `pendingHeadCount` hides the control.

## Spec Change Log

## Review Triage Log

- `false` — `approval.ts` approved/edited non-head. `decide` asserts `READY_HEAD_SQL` (current head) and `insertRevision` refuses a parent whose outcome is already set, so that row shape is not produced. `finalizeDecidedRunStmt` does not publish on this path.
- `false` — claim that the handler returns `rejected` for a published run. The same invariant keeps the CASE on `rejected`, and the route returns that status only after the batch commits.
- `high` — timeout leaves the confirm flag set, and the confirm box renders whatever `latest` the next poll returns, so the next click can reject a different awaiting run. Patch: bind confirm to the run id and clear it on timeout.
- `low` — Design Notes still say three statements. Rejected: the fix is an edit to this spec.
- `false` — one 409 for every refusal. Malformed JSON is already 400. The matrix maps not-awaiting, a blocking head, a repeat, and a rolled-back receipt to the same conflict.
- `false` — post-commit read returns 409 or 500. A successful batch leaves the `json_object` receipt in place, and only this statement writes the private sentence at this `now`.
- `low` — the confirm count can differ from the number of heads rejected at execution time. Rejected: pinning that count would add a request field the approved contract ignores.
- `low` — `pendingHeadCount === 0` still offers reject and then 409. Patch: hide the control unless the count is greater than zero.
- `false` — the client sends no assertion header. Every admin POST relies on Access injecting `cf-access-jwt-assertion`; the cookie-only 403 is the existing rule.
- `medium` — after 200 the card stays `awaiting` until reload, so a second confirm returns 409 and replaces the success notice. A 403 left the confirm flag set, so the next successful loop GET reopened it. Patch: mark the card rejected locally, and clear the confirm id on 403.
- `low` — focus drops when the confirm buttons mount. Rejected: restoring focus adds focus machinery, and mouse use does not hit it.
- `false` — no public-view test for `run.completed`. Readers were left unchanged on purpose; the run row status is `rejected` and the payload carries `status`.
- `medium` — the refusal test never seeds an `edited` head, so dropping `'edited'` from the guard would still pass and then publish. Patch: add that case. Other terminal statuses share the `!== "awaiting"` branch already locked by the published case.
- `medium` — the reserved-cent hold is inserted after reject, so a reject that deleted it would still 409. Patch: insert it first and assert the row is unchanged.
- `false` — shortcut keys while the confirm buttons are mounted. `LoopControls` has no keydown listener.
- `medium` — verification gap: `GET /api/admin/loop` never asserts `pendingHeadCount` for an awaiting run. Patch: expect the current-head count, excluding a non-head, and `null` when the latest run is not awaiting.
- `high` — verification gap: edited-head refusal is untested. Same patch as the edited-head finding above.
- `medium` — verification gap: accounting hold is inserted after reject. Same patch as the admission finding above.

## Design Notes

D1 `batch()` is one transaction (Cloudflare D1 Database docs). Three statements: update undecided heads, `finalizeDecidedRunStmt`, guarded `run.completed` insert. Success body is the run id, `rejected`, and the count. Two buttons on the latest-run card, only while it is `awaiting`.

## Verification

**Commands:**
- `npm run check` — expected: exit 0
- `npm test` — expected: exit 0
