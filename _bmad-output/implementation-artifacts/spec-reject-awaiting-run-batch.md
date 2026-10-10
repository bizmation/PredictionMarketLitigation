---
title: 'Reject every undecided draft in an awaiting Run'
type: 'feature'
created: '2026-10-10'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Admin can reject only one draft (`POST /api/admin/drafts/:id/decision`). Run `run-20261010-0003` is `awaiting` with 335 drafts. The Workflow does not wait, so the Run stays `awaiting` until `finalizeDecidedRunStmt`. Admission then refuses another Run for that date.

**Approach:** A run-level reject. One D1 batch rejects every undecided current-head draft, writes one public evidence row, and moves the Run to `rejected` through the existing terminal path. Nothing is published.

## Boundaries & Constraints

**Always:**
- `POST /api/admin/runs/:id/reject` only, behind `requireOperator`. Cookie-only `CF_Authorization` must not authorize it. No public or token path.
- Only while the Run is `awaiting`. Same decision columns as a per-draft reject. Exactly one public evidence row: run id, rejected count, operator display identity, time. A repeat writes no second row.
- Afterward, settled accounting lets admission treat that date as clear. Story 3.36 stays `in-progress`.

**Never:**
- No publication, docket events, F1 writes, or baselines. No new shortcut, and J/K/A/E/R must not trigger this. Do not deploy, start a Run, or touch Cloudflare or staging. Do not edit `gateway.ts` or `courtListener.ts`. `d-expired` is an expired session. Supersede stays for a prior published Run only.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Anonymous | POST, no token | 403, no writes | fail closed |
| Cross-site | Valid JWT only in the cookie | 403, no writes | fail closed |
| Happy path | `awaiting`, undecided current heads only | Those heads rejected, one evidence row, Run `rejected` | batch rolls back if the receipt does not insert |
| Repeat | Already `rejected` | No second evidence row | 409 |
| Not awaiting | Other status, or unknown id | No writes | 409, or 404 if unknown |
| Approved head | A current head is `approved` or `edited` | No writes; Run stays `awaiting` | 409, so the terminal path cannot publish |
| Side effects | Happy path | No `gate.decided`, docket, F1, or baseline writes | N/A |
| Admission | Rejected, finished admission, settled accounting | A later Run for that date is admitted | N/A |
| Confirm | Latest admin Run is `awaiting` | Confirm step shows the undecided count, then POSTs | Shortcuts do not POST |

</frozen-after-approval>

## Open Questions

- Public reject text — a rejected draft must store `reject_reason` or `reject_reason_private`. Options: one fixed public sentence on every draft, shown on the public archive / a fixed private sentence only, so the archive shows no reason / one reason typed in the confirmation and stored as the public reason on every draft.

## Code Map

- `src/shared/lib/access.ts` `readTokens` — POST ignores the cookie. Reuse `requireOperator`; do not add another CSRF check.
- `src/server.ts` ~211–323 and ~356–398 — match POST handling and `run-[0-9]{8}-[0-9a-f]{4}`. `GET /api/admin/loop` ~325–354: add the undecided head count beside `latest`.
- `src/pipeline/gate/approval.ts` `decide` — reject columns are outcome, time, display name, and one reason; reject does not call `applyF1Stmts`. Do not write one `gate.decided` per draft.
- `src/shared/db/repos/runsRepo.ts` `finalizeDecidedRunStmt` ~309–321 — terminal update. It publishes if any current head is approved or edited, so refuse that state first.
- `src/shared/db/repos/draftsRepo.ts` `currentHeadSql` ~514 — update heads only. `READY_HEAD_SQL` is not required.
- `src/shared/db/repos/evidenceRepo.ts` `completionReceiptStmt` — reuse event `run.completed` and id `run-completed-${runId}` (no CHECK migration). Payload `{ status: "rejected", rejectedCount, decidedBy }`; time is `created_at`.
- `src/shared/db/repos/gateAssertions.ts` `assertStmt` — guard the insert with `changes() = 1` so a miss rolls back the batch.
- `src/pipeline/workflow/dailyRun.ts` ~270–282 and `runAdmissionRepo.ts` `admit` — do not change admission SQL.
- `src/surfaces/admin/LoopControls.tsx` ~481–517 and `.rejectbox` ~551 — confirm on the latest-run card. `ApprovalQueue.tsx` ~697–737 keeps J/K/A/E/R per-draft.
- `src/shared/api/adminApi.test.ts` — auth and admission fixtures. Leave sprint-status `3-36-...` unchanged. Do not edit `gateway.ts` or `courtListener.ts`.

## Tasks & Acceptance

**Execution:**
- [ ] `src/pipeline/gate/approval.ts` — add the batch reject from the Code Map.
- [ ] `src/server.ts` — route, loop count, and 403/404/409 mapping.
- [ ] `src/surfaces/admin/LoopControls.tsx` — count confirmation for the displayed `awaiting` Run.
- [ ] `src/shared/api/adminApi.test.ts`, `src/surfaces/admin/loopControls.mount.test.tsx` — matrix rows, including shortcuts.

**Acceptance Criteria:**
- Given the matrix preconditions, when the route or the confirm control runs, then each row's outcome holds, including no publication side effects and a cleared date.
- Given J, K, A, E, or R on the admin Run card, when the key is pressed, then this route is not called.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

D1 `batch()` is one transaction (Cloudflare D1 Database docs). Three statements: update undecided heads, `finalizeDecidedRunStmt`, guarded `run.completed` insert. Repeat is 409. Success body is the run id, `rejected`, and the count. The confirm count uses that same head predicate. Two buttons on the latest-run card, only while it is `awaiting`.

## Verification

**Commands:**
- `npm run check` — expected: exit 0
- `npm test` — expected: exit 0
