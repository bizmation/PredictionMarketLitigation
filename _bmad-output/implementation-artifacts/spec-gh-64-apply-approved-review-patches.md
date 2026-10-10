---
title: 'Apply approved review patches for awaiting-run reject'
type: 'bugfix'
created: '2026-10-10'
status: 'in-progress'
baseline_revision: '103fb656a6173eda92d9cd93824706cc5c9183cd'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-reject-awaiting-run-batch.md'
warnings:
  - oversized
deferred: []
---

<intent-contract>

## Intent

**Problem:** The squash-merged awaiting-run reject still swallows unrelated D1 constraint failures as 409, and its route and confirm-step tests stay green if the body guard or the timeout clear is deleted. Count copy is always plural, and a 404 tells the operator to confirm again.

**Approach:** Map only a failed gate assertion and a duplicate `evidence_events.id` to conflict. Pin the bad-body and refusal tests. Use singular copy when the count is 1. On 404, close the confirm step and reload. Record the head-SQL shadowing note; do not change that SQL.

## Boundaries & Constraints

**Always:**
- `rejectAwaitingRun`'s batch catch returns `{ status: "conflict" }` only when `String(error)` contains `gate_assertion_failed` or the SQLite unique-failure text `UNIQUE constraint failed: evidence_events.id`. Every other error is rethrown. The route already maps conflict to 409 and a throw to 500 (`src/server.ts` ~476–498). Leave that mapping.
- `POST /api/admin/runs/:id/reject` with body `"{not json"` or `"[]"`, from a verified operator, returns 400 and writes nothing. `{}` and an empty body stay accepted.
- A 409 confirm shows `This run cannot be rejected.` and closes the confirm step. A 500 shows `Reject did not complete. The run is unchanged until you confirm it again.` and leaves the confirm step open. A timeout that reloads the same run id also closes the confirm step. A 404 closes the confirm step, refetches loop status, and does not show that did-not-complete sentence.
- When the count is 1, the confirm question is `Reject 1 undecided draft in {id}?`, the button is `Reject 1 draft`, and success is `Run {id} rejected. 1 draft was rejected.` Any other count stays plural.

**Never:**
- Do not alias `UPDATE drafts` or `READY_HEAD_SQL`. Do not edit `src/pipeline/ai/gateway.ts` or `src/pipeline/connectors/courtListener.ts`. Do not deploy, and do not change `decide`'s catch.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Assertion failure | First `db.batch` throws `CHECK constraint failed: gate_assertion_failed` | `rejectAwaitingRun` returns conflict; awaiting run and draft stay undecided | 409 at the route |
| Evidence id taken | Batch throws `UNIQUE constraint failed: evidence_events.id`, and the existing seeded duplicate id | conflict; the seeded route case stays 409 with no draft or run change | 409 |
| Other constraint | Batch throws a CHECK other than `gate_assertion_failed`, a NOT NULL, a FOREIGN KEY, or `UNIQUE constraint failed: evidence_events.run_id, evidence_events.seq` | The function throws; the route would 500 | no silent 409 |
| Malformed body | Operator POST body `"{not json"` on an awaiting run with an undecided draft | 400 `Malformed JSON body.` | no draft or run change |
| Array body | Operator POST body `"[]"` on that same shape | 400 `Invalid reject body.` | no draft or run change |
| UI 409 | Confirm open; POST 409; loop reloads the same awaiting run | Notice `This run cannot be rejected.`; confirm closed; `Reject this run` is back | — |
| UI 500 | Confirm open; POST 500 | Did-not-complete notice; confirm question still shown | — |
| UI timeout, same run | POST throws `TimeoutError`; next loop GET is the same run id, still awaiting | Timeout notice; confirm closed; `Reject this run` is back | — |
| UI 404 | Confirm open; POST 404; next loop GET is the same awaiting run | Confirm closed; loop GET runs again; did-not-complete sentence absent | — |
| Singular | `pendingHeadCount` 1, success `rejectedCount` 1 | Question, button, and success use the singular sentences | — |
| Plural | Count 4, as the existing confirm test | `undecided drafts` and `4 drafts were rejected.` stay | — |

</intent-contract>

## Code Map

- `src/pipeline/gate/approval.ts` `rejectAwaitingRun` ~376–386 — the broad catch. `decide` ~256–261 already returns conflict only for `gate_assertion_failed`; do not copy its `invalid` fallback and do not edit it.
- `migrations/0019_gate_assertions.sql` — CHECK name `gate_assertion_failed`. `migrations/0023_run_admission.sql` ~20–40 — `evidence_events.id` primary key, plus `idx_evidence_run_seq` on `(run_id, seq)`.
- `src/test/failingDb.ts` `failBatchAfter` — proxy whose nth `batch()` rejects. `rejectAwaitingRun` batches once, so `failBatchAfter(db, 1, error)` injects the classifier cases. Reuse it; do not add a production hook.
- `src/server.ts` ~425–498 — body guard already returns `badRequest("Malformed JSON body.")` and `badRequest("Invalid reject body.")`. Conflict message is `Run cannot be rejected.` Do not change the guard.
- `src/shared/api/adminApi.test.ts` `describe("admin run reject")` ~3017 — `reject()` posts `{}`. `rolls back when the evidence id is already taken` ~3189 is the live duplicate-id 409. No test posts `"{not json"` or `"[]"`.
- `src/surfaces/admin/LoopControls.tsx` `rejectRun` ~457–531 — 409 closes and reloads; `!res.ok` (~492) shows the did-not-complete sentence and does not clear `rejectRunId`. Timeout ~521–528 already clears it. Copy ~616–626 and ~506–509 is always plural.
- `src/surfaces/admin/loopControls.mount.test.tsx` ~719 — timeout test swaps in `run-20261112-0001`, so a cleared confirm id is not required. `scripted(body, ok, status)` ~42. No 409, 500, or 404 reject test.
- `src/shared/db/repos/draftsRepo.ts` `currentHeadSql` ~529 and `READY_HEAD_SQL` ~544 — CTE `FROM drafts` shadows an outer `drafts` alias. `approval.ts` ~337–341 calls `currentHeadSql("drafts")` inside `UPDATE drafts`. Record only.
- `_bmad-output/implementation-artifacts/deferred-work.md` — append a dated section; do not edit older entries.

## Tasks & Acceptance

**Execution:**
- `src/pipeline/gate/approval.ts` — narrow the `rejectAwaitingRun` catch to the two conflict messages and rethrow the rest — stops CHECK, NOT NULL, FK, and other UNIQUE failures from becoming conflict.
- `src/shared/api/adminApi.test.ts` — add the malformed and array body cases, plus `failBatchAfter` cases for both catch sides — deleting the body guard or restoring `includes("constraint")` / `includes("UNIQUE")` fails.
- `src/surfaces/admin/LoopControls.tsx` — singular copy at count 1; on 404, `setRejectRunId(null)` and `setReload` with no did-not-complete notice — 500 stays on the current branch.
- `src/surfaces/admin/loopControls.mount.test.tsx` — add 409 close, 500 notice, same-run timeout, 404 close-and-reload, and singular copy — the different-run timeout test stays.
- `_bmad-output/implementation-artifacts/deferred-work.md` — append the shadowing note — the SQL stays unchanged.

**Acceptance Criteria:**
- Given `npm run check` and `npm test`, when they run, then both exit 0.
- Given `git diff` for this change, when inspected, then `src/pipeline/ai/gateway.ts` and `src/pipeline/connectors/courtListener.ts` are untouched and `currentHeadSql` / `READY_HEAD_SQL` are not aliased.

## Spec Change Log

## Review Triage Log

## Design Notes

SQLite reports the primary-key clash as `UNIQUE constraint failed: evidence_events.id` and the seq index as `UNIQUE constraint failed: evidence_events.run_id, evidence_events.seq`. Match the id text only. `String(error).includes("constraint")` is the bug.

The CTE note to append, verbatim in substance: using `currentHeadSql("drafts")` inside `UPDATE drafts` lets the CTE's `FROM drafts` shadow the outer name. `run_id = drafts.run_id` is then always true, so the chain collects roots from every run. The result is still correct, because `current.id` binds to the outer row, but it's slow at scale. The same pattern exists in `READY_HEAD_SQL`. The fix is an alias, e.g. `UPDATE drafts AS t … currentHeadSql('t')`.

## Verification

**Commands:**
- `npm run check` — expected: exit 0
- `npm test` — expected: exit 0
