# Edge Case Hunter Review

**Goal:** You are a pure path tracer. Never comment on whether code is good or bad; only list missing handling.
When a diff is provided, scan only the diff hunks and list boundaries that are directly reachable from the changed lines and lack an explicit guard in the diff.
When no diff is provided (full file or function), treat the entire provided content as the scope.
Ignore the rest of the codebase unless the provided content explicitly references external functions.
A brief secondary deletion check runs as Step 4 when the diff removes code.
A claims check runs as Step 5.

**Inputs:**
- **content** — Content to review, or a path to read it from: diff, full file, or function
- **also_consider** (optional) — Areas to keep in mind during review alongside normal edge-case analysis
- **claims_file** — Path to the spec this change was built from. Do NOT read it before Step 5: the path tracing in Steps 2–3 must finish before the claims are seen.

**MANDATORY: Execute steps in the Execution section IN EXACT ORDER. DO NOT skip steps or change the sequence. When a halt condition triggers, follow its specific instruction exactly. Each action within a step is a REQUIRED action to complete that step.**

**Your method is exhaustive path enumeration — mechanically walk every branch, not hunt by intuition. Report ONLY paths and conditions that lack handling — discard handled ones silently. Do NOT editorialize or add filler. Do not assign severity labels, rankings, or priority levels.**


## EXECUTION

### Step 1: Receive Content

- Take the content to review from the parent message that launched you — inline, or by reading the file it points to (never from this instruction file)
- If no content is supplied, or it is empty, unreadable, or cannot be decoded as text, return `[{"location":"N/A","trigger_condition":"Input empty or undecodable","guard_snippet":"Provide valid content to review","potential_consequence":"Review skipped — no analysis performed"}]` and stop
- Identify content type (diff, full file, or function) to determine scope rules

### Step 2: Exhaustive Path Analysis

**Walk every branching path and boundary condition within scope — report only unhandled ones.**

- If `also_consider` input was provided, incorporate those areas into the analysis
- Walk all branching paths: control flow (conditionals, loops, error handlers, early returns) and domain boundaries (where values, states, or conditions transition). Derive the relevant edge classes from the content itself — don't rely on a fixed checklist. Examples: missing else/default, unguarded inputs, off-by-one loops, arithmetic overflow, implicit type coercion, race conditions, timeout gaps
- Consider implicit branches: the diff special-cases or changes the handling of one or more members of a fixed set of values — enums, status codes, sentinels, type tags, flags, value ranges. The rest of the set is implicit branches (e.g. the diff changes the `RED` and `YELLOW` cases of a `RED`/`YELLOW`/`GREEN` enum; `GREEN` is the implicit branch)
- Consider handle lifetime: when the changed code re-checks, re-fetches, or re-validates something it already held — a handle, index, id, pointer — the re-check exists because an intervening call can invalidate it. Identify that call, what it does to the thing held, and what the changed code silently skips when the re-check fails
- For each call site the diff adds or changes — in test files as well as production code — read the callee's declaration and check the call against it: argument count, order, types, and defaults. Report any mismatch
- For each path: determine whether the content handles it
- Collect only the unhandled paths as findings — discard handled ones silently

### Step 3: Validate Completeness

- Revisit every edge class from Step 2 — e.g., missing else/default, null/empty inputs, off-by-one loops, arithmetic overflow, implicit type coercion, race conditions, timeout gaps
- Add any newly found unhandled paths to findings; discard confirmed-handled ones

### Step 4: Deletion Check

If the diff removed or replaced meaningful code (ignore pure renames and whitespace): load `references/deletion-check.md` and follow it.

### Step 5: Claims Check

Load `references/claims-check.md` and follow it.

### Step 6: Present Findings

Output all findings as a single JSON array following the Output Format specification exactly.


## OUTPUT FORMAT

Return ONLY a valid JSON array of objects. Each edge-case finding contains exactly these four fields:

```json
[{
  "location": "file:start-end (or file:line when single line, or file:hunk when exact line unavailable)",
  "trigger_condition": "one-line description (max 15 words)",
  "guard_snippet": "minimal code sketch that closes the gap (single-line escaped string, no raw newlines or unescaped quotes)",
  "potential_consequence": "what could actually go wrong (max 15 words)"
}]
```

No extra text, no explanations, no markdown wrapping. An empty array `[]` is valid when nothing is found. Deletion findings from Step 4 and claim findings from Step 5, if any, go in the same array with the extra fields defined in `references/deletion-check.md` and `references/claims-check.md`.


## HALT CONDITIONS

- If no content is supplied, or it is empty, unreadable, or cannot be decoded as text, return `[{"location":"N/A","trigger_condition":"Input empty or undecodable","guard_snippet":"Provide valid content to review","potential_consequence":"Review skipped — no analysis performed"}]` and stop
<reference path="references/deletion-check.md">
# Deletion Check

Secondary pass for the Edge Case Hunter — runs only when the diff removed meaningful code. Subordinate to the edge-case pass; findings are usually few or none.

For each chunk of removed or replaced code (ignore pure renames and whitespace), ask: did it carry behavior or a contract that the change neither re-established nor intentionally retired? Add a finding for any resulting regression, orphaned reference, or newly-dead code. Skip anything already covered by your edge-case findings.

Append each finding to the same JSON array as the edge-case findings, with the four standard fields plus:

- `kind`: `"deletion"`
- `confidence`: `"high"`, `"medium"`, or `"low"` — these are inferences; rate them

For a deletion finding the standard fields read as: `location` = the removed item; `trigger_condition` = the behavior or contract it enforced; `guard_snippet` = where or how to re-establish it; `potential_consequence` = the regression or orphan.

Add nothing if nothing qualifies.
</reference>
<reference path="references/claims-check.md">
# Claims Check

Final pass for the Edge Case Hunter. Read the claims file named in the message that launched you now, for the first time; the path tracing is finished and the claims cannot steer it retroactively.

It is the spec the change was built from. Read only its `## Intent` and `## Tasks & Acceptance` sections — the claims live there; ignore the rest of the file. The spec is the change's own account of itself: testimony, not evidence — a claim repeated in a code comment is still the same claim, not confirmation. Extract each checkable claim — what the change does, what it preserves, ordering, arithmetic, and parity with existing code ("exactly as X does") — then try to falsify each one against the code you have already traced. Where your trace is not enough to decide, read the code that decides it: the compared-to function, the actual callee, the state the claim assumes.

Append one finding per falsified claim to the same JSON array, with the four standard fields plus:

- `kind`: `"claim"`
- `confidence`: `"high"`, `"medium"`, or `"low"`

For a claim finding the standard fields read as: `location` = where the code contradicts the claim; `trigger_condition` = the claim, quoted or tightly paraphrased; `guard_snippet` = what the code actually does; `potential_consequence` = what goes wrong for someone who believed the claim.

Verified claims produce nothing. Add nothing if nothing is falsified.
</reference>

## CONTENT SOURCE

"Review content:" in the message that launched you gives the content itself or a path to read it from. Read the file when it is a path; either way that is the content under review, and this instruction file never is.

claims_file (leave unread until your instructions call for it):
---
title: 'Reject every undecided draft in an awaiting Run'
type: 'feature'
created: '2026-10-10'
status: 'in-review'
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
- Verification: `npm run check` passed. `npm test` passed 1511 tests, 6 skipped.

## Spec Change Log

## Review Triage Log

## Design Notes

D1 `batch()` is one transaction (Cloudflare D1 Database docs). Three statements: update undecided heads, `finalizeDecidedRunStmt`, guarded `run.completed` insert. Success body is the run id, `rejected`, and the count. Two buttons on the latest-run card, only while it is `awaiting`.

## Verification

**Commands:**
- `npm run check` — expected: exit 0
- `npm test` — expected: exit 0

Review content: the unified diff at `the block that follows`. Read that file — it is the content under review.

diff --git a/_bmad-output/implementation-artifacts/spec-reject-awaiting-run-batch.md b/_bmad-output/implementation-artifacts/spec-reject-awaiting-run-batch.md
index 868116f..bae5d47 100644
--- a/_bmad-output/implementation-artifacts/spec-reject-awaiting-run-batch.md
+++ b/_bmad-output/implementation-artifacts/spec-reject-awaiting-run-batch.md
@@ -2,8 +2,9 @@
 title: 'Reject every undecided draft in an awaiting Run'
 type: 'feature'
 created: '2026-10-10'
-status: 'draft'
+status: 'in-review'
 route: 'dispatch'
+baseline_commit: '01906011bf40785f0003dd6f00f9e8a0c8875b9c'
 review_loop_iteration: 0
 context:
   - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
@@ -13,7 +14,7 @@ context:
 
 ## Intent
 
-**Problem:** Admin can reject only one draft (`POST /api/admin/drafts/:id/decision`). Run `run-20261010-0003` is `awaiting` with 335 drafts. The Workflow does not wait, so the Run stays `awaiting` until `finalizeDecidedRunStmt`. Admission then refuses another Run for that date.
+**Problem:** Admin can reject only one draft (`POST /api/admin/drafts/:id/decision`). Run `run-20261010-0003` is `awaiting` with 335 drafts, and it stays there until `finalizeDecidedRunStmt`, so admission refuses that date.
 
 **Approach:** A run-level reject. One D1 batch rejects every undecided current-head draft, writes one public evidence row, and moves the Run to `rejected` through the existing terminal path. Nothing is published.
 
@@ -21,8 +22,8 @@ context:
 
 **Always:**
 - `POST /api/admin/runs/:id/reject` only, behind `requireOperator`. Cookie-only `CF_Authorization` must not authorize it. No public or token path.
-- Only while the Run is `awaiting`. Same decision columns as a per-draft reject. Exactly one public evidence row: run id, rejected count, operator display identity, time. A repeat writes no second row.
-- Afterward, settled accounting lets admission treat that date as clear. Story 3.36 stays `in-progress`.
+- Only while the Run is `awaiting`. Same decision columns as a per-draft reject. `reject_reason` stays null. `reject_reason_private` is the fixed sentence `Rejected with the Run.` That sentence stays off every public payload. Exactly one public evidence row: run id, rejected count, operator display identity, time. A repeat writes no second row.
+- After reject, a finished settled admission lets a new Run through for that date: the check at `dailyRun.ts:270-282` does not return conflict. `reservedCents`, `uncertainCents`, or `accountingIssueCount` above zero still block (`dailyRun.ts:274-279`; `settled` and `date_admission` in `runAdmissionRepo.ts:27-28` and `:66-70`). Batch reject does not clear them. Story 3.36 stays `in-progress`.
 
 **Never:**
 - No publication, docket events, F1 writes, or baselines. No new shortcut, and J/K/A/E/R must not trigger this. Do not deploy, start a Run, or touch Cloudflare or staging. Do not edit `gateway.ts` or `courtListener.ts`. `d-expired` is an expired session. Supersede stays for a prior published Run only.
@@ -33,54 +34,58 @@ context:
 |----------|--------------|---------------------------|----------------|
 | Anonymous | POST, no token | 403, no writes | fail closed |
 | Cross-site | Valid JWT only in the cookie | 403, no writes | fail closed |
-| Happy path | `awaiting`, undecided current heads only | Those heads rejected, one evidence row, Run `rejected` | batch rolls back if the receipt does not insert |
+| Happy path | `awaiting`, undecided current heads only | Those heads rejected, one evidence row, Run `rejected` | rolls back if the receipt misses |
 | Repeat | Already `rejected` | No second evidence row | 409 |
 | Not awaiting | Other status, or unknown id | No writes | 409, or 404 if unknown |
-| Approved head | A current head is `approved` or `edited` | No writes; Run stays `awaiting` | 409, so the terminal path cannot publish |
+| Approved head | A current head is `approved` or `edited` | No writes; Run stays `awaiting` | 409 |
 | Side effects | Happy path | No `gate.decided`, docket, F1, or baseline writes | N/A |
-| Admission | Rejected, finished admission, settled accounting | A later Run for that date is admitted | N/A |
+| Admission | Rejected, finished admission, settled accounting | `startRun` admits a new Run; `dailyRun.ts:270-282` does not return conflict | N/A |
+| Accounting hold | Rejected, but reserved cents, uncertain cents, or an accounting issue remain | That date stays blocked | conflict from `dailyRun.ts:274-279` and `date_admission` |
 | Confirm | Latest admin Run is `awaiting` | Confirm step shows the undecided count, then POSTs | Shortcuts do not POST |
 
 </frozen-after-approval>
 
-## Open Questions
-
-- Public reject text — a rejected draft must store `reject_reason` or `reject_reason_private`. Options: one fixed public sentence on every draft, shown on the public archive / a fixed private sentence only, so the archive shows no reason / one reason typed in the confirmation and stored as the public reason on every draft.
-
 ## Code Map
 
-- `src/shared/lib/access.ts` `readTokens` — POST ignores the cookie. Reuse `requireOperator`; do not add another CSRF check.
-- `src/server.ts` ~211–323 and ~356–398 — match POST handling and `run-[0-9]{8}-[0-9a-f]{4}`. `GET /api/admin/loop` ~325–354: add the undecided head count beside `latest`.
-- `src/pipeline/gate/approval.ts` `decide` — reject columns are outcome, time, display name, and one reason; reject does not call `applyF1Stmts`. Do not write one `gate.decided` per draft.
-- `src/shared/db/repos/runsRepo.ts` `finalizeDecidedRunStmt` ~309–321 — terminal update. It publishes if any current head is approved or edited, so refuse that state first.
-- `src/shared/db/repos/draftsRepo.ts` `currentHeadSql` ~514 — update heads only. `READY_HEAD_SQL` is not required.
-- `src/shared/db/repos/evidenceRepo.ts` `completionReceiptStmt` — reuse event `run.completed` and id `run-completed-${runId}` (no CHECK migration). Payload `{ status: "rejected", rejectedCount, decidedBy }`; time is `created_at`.
-- `src/shared/db/repos/gateAssertions.ts` `assertStmt` — guard the insert with `changes() = 1` so a miss rolls back the batch.
-- `src/pipeline/workflow/dailyRun.ts` ~270–282 and `runAdmissionRepo.ts` `admit` — do not change admission SQL.
-- `src/surfaces/admin/LoopControls.tsx` ~481–517 and `.rejectbox` ~551 — confirm on the latest-run card. `ApprovalQueue.tsx` ~697–737 keeps J/K/A/E/R per-draft.
-- `src/shared/api/adminApi.test.ts` — auth and admission fixtures. Leave sprint-status `3-36-...` unchanged. Do not edit `gateway.ts` or `courtListener.ts`.
+- `src/shared/lib/access.ts` `readTokens` — POST ignores the cookie. Reuse `requireOperator`.
+- `src/server.ts` ~211–398 — copy POST handling and the run-id pattern. Add the undecided head count beside `latest` on `GET /api/admin/loop`.
+- `src/pipeline/gate/approval.ts` `decide` — same reject columns, private reason only, no `applyF1Stmts`, no per-draft `gate.decided`.
+- `src/shared/db/repos/runsRepo.ts` `finalizeDecidedRunStmt` ~309–321 — refuse first if a current head is approved or edited.
+- `src/shared/db/repos/draftsRepo.ts` `currentHeadSql` ~514 — heads only. Readiness is not required.
+- `src/shared/db/repos/evidenceRepo.ts` `completionReceiptStmt` — reuse `run.completed` and id `run-completed-${runId}`. Payload `{ status: "rejected", rejectedCount, decidedBy }`.
+- `src/shared/db/repos/gateAssertions.ts` `assertStmt` — `changes() = 1` rolls the batch back when the receipt misses.
+- `src/pipeline/workflow/dailyRun.ts:270-282`, `runAdmissionRepo.ts:27-28`, `:66-70` — do not change this SQL.
+- `src/surfaces/admin/LoopControls.tsx` ~481–551 — confirm on the latest-run card. `ApprovalQueue.tsx` ~697–737 keeps J/K/A/E/R per-draft.
+- `src/shared/api/adminApi.test.ts` — auth and admission fixtures. Leave `3-36-...` unchanged. Do not edit `gateway.ts` or `courtListener.ts`.
 
 ## Tasks & Acceptance
 
 **Execution:**
-- [ ] `src/pipeline/gate/approval.ts` — add the batch reject from the Code Map.
-- [ ] `src/server.ts` — route, loop count, and 403/404/409 mapping.
-- [ ] `src/surfaces/admin/LoopControls.tsx` — count confirmation for the displayed `awaiting` Run.
-- [ ] `src/shared/api/adminApi.test.ts`, `src/surfaces/admin/loopControls.mount.test.tsx` — matrix rows, including shortcuts.
+- [x] `src/pipeline/gate/approval.ts` — add the batch reject from the Code Map.
+- [x] `src/server.ts` — route, loop count, and 403/404/409 mapping.
+- [x] `src/surfaces/admin/LoopControls.tsx` — count confirmation for the displayed `awaiting` Run.
+- [x] `src/shared/api/adminApi.test.ts`, `src/surfaces/admin/loopControls.mount.test.tsx` — matrix rows, including shortcuts and the post-reject `startRun` admission test.
 
 **Acceptance Criteria:**
-- Given the matrix preconditions, when the route or the confirm control runs, then each row's outcome holds, including no publication side effects and a cleared date.
+- Given the matrix preconditions, when the route or the confirm control runs, then each row's outcome holds, including no publication side effects.
+- Given a finished settled admission, when `startRun` follows reject, then `dailyRun.ts:270-282` admits the new Run. A reserved, uncertain, or issue balance still conflicts.
 - Given J, K, A, E, or R on the admin Run card, when the key is pressed, then this route is not called.
 
 ## Implementation Notes
 
+- `rejectAwaitingRun` writes `Rejected with the Run.` only to `reject_reason_private`. The `run.completed` payload is `status`, `rejectedCount`, and `decidedBy`.
+- One D1 batch (Cloudflare D1 `batch()` transaction): awaiting / unpublished-head / undecided-head assertions, one head UPDATE, `finalizeDecidedRunStmt`, then `run.completed` guarded by `changes() = 1`. A failed assertion or a taken evidence id rolls the batch back.
+- `GET /api/admin/loop` adds `pendingHeadCount` for an awaiting latest Run. The latest-run card uses a `<button type="button">` confirm step (React docs: pass `onClick`, do not add an access key). J/K/A/E/R are not handled.
+- Reserved cents still block same-date admission after reject (`dailyRun.ts:274-279` and `date_admission`). The reject path does not clear them.
+- Verification: `npm run check` passed. `npm test` passed 1511 tests, 6 skipped.
+
 ## Spec Change Log
 
 ## Review Triage Log
 
 ## Design Notes
 
-D1 `batch()` is one transaction (Cloudflare D1 Database docs). Three statements: update undecided heads, `finalizeDecidedRunStmt`, guarded `run.completed` insert. Repeat is 409. Success body is the run id, `rejected`, and the count. The confirm count uses that same head predicate. Two buttons on the latest-run card, only while it is `awaiting`.
+D1 `batch()` is one transaction (Cloudflare D1 Database docs). Three statements: update undecided heads, `finalizeDecidedRunStmt`, guarded `run.completed` insert. Success body is the run id, `rejected`, and the count. Two buttons on the latest-run card, only while it is `awaiting`.
 
 ## Verification
 
diff --git a/src/pipeline/gate/approval.ts b/src/pipeline/gate/approval.ts
index 8fa7ca9..6ed197c 100644
--- a/src/pipeline/gate/approval.ts
+++ b/src/pipeline/gate/approval.ts
@@ -265,3 +265,133 @@ export async function decide(
   if (!record) return { status: "not_found" };
   return { status: "decided", record };
 }
+
+/** Private only. Public `reject_reason` stays null, so the archive gains no new text. */
+export const RUN_REJECT_PRIVATE_REASON = "Rejected with the Run.";
+
+export type RejectRunResult =
+  | { status: "not_found" }
+  | { status: "conflict" }
+  | { status: "rejected"; runId: string; rejectedCount: number };
+
+/**
+ * Reject every undecided current head of an awaiting Run in one D1 batch.
+ * One `run.completed` receipt. No F1, docket, or per-draft `gate.decided`.
+ */
+export async function rejectAwaitingRun(
+  db: Db,
+  input: { runId: string; operator: { displayName: string }; now: string }
+): Promise<RejectRunResult> {
+  const parsed = z
+    .object({
+      runId: z.string().regex(/^run-[0-9]{8}-[0-9a-f]{4}$/),
+      operator: OperatorSchema,
+      now: IsoUtcSchema
+    })
+    .strict()
+    .safeParse(input);
+  if (!parsed.success) return { status: "conflict" };
+
+  const { runId, operator, now } = parsed.data;
+  const run = await runsRepo.getRunById(db, runId);
+  if (!run) return { status: "not_found" };
+  if (run.status !== "awaiting") return { status: "conflict" };
+
+  const blocking = await db
+    .prepare(
+      `SELECT 1 AS present FROM drafts d
+        WHERE d.run_id = ? AND d.outcome IN ('approved','edited')
+          AND ${draftsRepo.currentHeadSql("d")} LIMIT 1`
+    )
+    .bind(runId)
+    .first<{ present: number }>();
+  if (blocking) return { status: "conflict" };
+  if ((await draftsRepo.countUndecidedCurrentHeads(db, runId)) === 0) {
+    return { status: "conflict" };
+  }
+
+  const reason = RUN_REJECT_PRIVATE_REASON;
+  const evidenceId = `run-completed-${runId}`;
+  try {
+    await db.batch([
+      assertStmt(
+        db,
+        "reject_run_awaiting",
+        "EXISTS (SELECT 1 FROM runs WHERE id = ? AND status = 'awaiting')",
+        [runId]
+      ),
+      assertStmt(
+        db,
+        "reject_run_unpublished",
+        `NOT EXISTS (SELECT 1 FROM drafts d WHERE d.run_id = ? AND d.outcome IN ('approved','edited') AND ${draftsRepo.currentHeadSql("d")})`,
+        [runId]
+      ),
+      assertStmt(
+        db,
+        "reject_run_heads",
+        `EXISTS (SELECT 1 FROM drafts d WHERE d.run_id = ? AND d.outcome IS NULL AND ${draftsRepo.currentHeadSql("d")})`,
+        [runId]
+      ),
+      db
+        .prepare(
+          `UPDATE drafts
+              SET outcome = 'rejected', decided_at = ?, decided_by = ?,
+                  reject_reason = NULL, reject_reason_private = ?, updated_at = ?
+            WHERE run_id = ? AND outcome IS NULL
+              AND ${draftsRepo.currentHeadSql("drafts")}
+              AND EXISTS (
+                SELECT 1 FROM runs WHERE id = drafts.run_id AND status = 'awaiting'
+              )`
+        )
+        .bind(now, operator.displayName, reason, now, runId),
+      runsRepo.finalizeDecidedRunStmt(db, runId, now),
+      db
+        .prepare(
+          `INSERT INTO evidence_events (id, run_id, seq, event, payload_json, created_at)
+           SELECT ?, runs.id, (
+             SELECT COALESCE(MAX(seq), -1) + 1 FROM evidence_events WHERE run_id = runs.id
+           ), 'run.completed', json_object(
+             'status', runs.status,
+             'rejectedCount', (
+               SELECT COUNT(*) FROM drafts d
+                WHERE d.run_id = runs.id AND d.outcome = 'rejected'
+                  AND d.decided_at = ? AND d.decided_by = ?
+                  AND d.reject_reason IS NULL AND d.reject_reason_private = ?
+             ),
+             'decidedBy', ?
+           ), ?
+           FROM runs WHERE runs.id = ? AND changes() = 1`
+        )
+        .bind(
+          evidenceId,
+          now,
+          operator.displayName,
+          reason,
+          operator.displayName,
+          now,
+          runId
+        ),
+      assertStmt(db, "reject_run_receipt", "changes() = 1")
+    ]);
+  } catch (error) {
+    const message = String(error);
+    if (
+      message.includes("gate_assertion_failed") ||
+      message.includes("UNIQUE") ||
+      message.includes("constraint")
+    ) {
+      return { status: "conflict" };
+    }
+    throw error;
+  }
+
+  const written = await db
+    .prepare(`SELECT payload_json FROM evidence_events WHERE id = ?`)
+    .bind(evidenceId)
+    .first<{ payload_json: string }>();
+  const payload = written
+    ? (JSON.parse(written.payload_json) as { rejectedCount?: unknown })
+    : null;
+  if (typeof payload?.rejectedCount !== "number") return { status: "conflict" };
+  return { status: "rejected", runId, rejectedCount: payload.rejectedCount };
+}
diff --git a/src/server.ts b/src/server.ts
index 5db3b08..de6f4c9 100644
--- a/src/server.ts
+++ b/src/server.ts
@@ -34,7 +34,7 @@ import { IsoDateSchema } from "./shared/schemas/common";
 import { ModePostBodySchema } from "./shared/schemas/mode";
 import { etCalendarDate } from "./shared/lib/schedule";
 import { llmProvidersFromEnv } from "./pipeline/ai/gateway";
-import { decide } from "./pipeline/gate/approval";
+import { decide, rejectAwaitingRun } from "./pipeline/gate/approval";
 import { submitTurn } from "./pipeline/steering/submitTurn";
 import { SteeringPostBodySchema } from "./shared/schemas/steering";
 import {
@@ -332,9 +332,17 @@ export default {
         }
         try {
           const items = await runsRepo.listRuns(getDb(env));
+          const latest = items[0] ?? null;
           return Response.json(
             {
-              latest: items[0] ?? null,
+              latest,
+              pendingHeadCount:
+                latest?.status === "awaiting"
+                  ? await draftsRepo.countUndecidedCurrentHeads(
+                      getDb(env),
+                      latest.id
+                    )
+                  : null,
               dispatches: await runAdmissionRepo.listActive(getDb(env))
             },
             { headers: ADMIN_CACHE_HEADERS }
@@ -414,6 +422,82 @@ export default {
         }
       }
 
+      const rejectRunMatch =
+        /^\/api\/admin\/runs\/(run-[0-9]{8}-[0-9a-f]{4})\/reject$/.exec(
+          adminPath
+        );
+      if (rejectRunMatch) {
+        if (request.method !== "POST") {
+          return new Response("Method not allowed", {
+            status: 405,
+            headers: { ...ADMIN_CACHE_HEADERS, allow: "POST" }
+          });
+        }
+        let bodyText = "";
+        try {
+          bodyText = await request.text();
+        } catch {
+          return jsonError(badRequest("Malformed JSON body."), {
+            headers: ADMIN_CACHE_HEADERS
+          });
+        }
+        if (bodyText.trim() !== "") {
+          try {
+            const parsed: unknown = JSON.parse(bodyText);
+            if (
+              parsed === null ||
+              typeof parsed !== "object" ||
+              Array.isArray(parsed)
+            ) {
+              return jsonError(badRequest("Invalid reject body."), {
+                headers: ADMIN_CACHE_HEADERS
+              });
+            }
+          } catch {
+            return jsonError(badRequest("Malformed JSON body."), {
+              headers: ADMIN_CACHE_HEADERS
+            });
+          }
+        }
+        try {
+          const result = await rejectAwaitingRun(getDb(env), {
+            runId: rejectRunMatch[1]!,
+            operator: { displayName: gate.operator.displayName },
+            now: new Date().toISOString()
+          });
+          if (result.status === "not_found") {
+            return jsonError(
+              notFound(`Run '${rejectRunMatch[1]}' not found.`),
+              {
+                headers: ADMIN_CACHE_HEADERS
+              }
+            );
+          }
+          if (result.status === "conflict") {
+            return jsonError(conflict("Run cannot be rejected."), {
+              headers: ADMIN_CACHE_HEADERS
+            });
+          }
+          return Response.json(
+            {
+              runId: result.runId,
+              status: "rejected",
+              rejectedCount: result.rejectedCount
+            },
+            { headers: ADMIN_CACHE_HEADERS }
+          );
+        } catch (error) {
+          console.error(
+            JSON.stringify({
+              event: "admin_api.error",
+              path: pathname,
+              message: error instanceof Error ? error.message : String(error)
+            })
+          );
+          return jsonError(internalError(), { headers: ADMIN_CACHE_HEADERS });
+        }
+      }
+
       if (adminPath === "/api/admin/runs") {
         if (request.method !== "POST") {
           return new Response("Method not allowed", {
diff --git a/src/shared/api/adminApi.test.ts b/src/shared/api/adminApi.test.ts
index 9700b17..3c65d19 100644
--- a/src/shared/api/adminApi.test.ts
+++ b/src/shared/api/adminApi.test.ts
@@ -1103,7 +1103,11 @@ describe("admin loop controls (story 3.12)", () => {
     await testEnv.DB.prepare("DELETE FROM runs").run();
     const res = await auth("/api/admin/loop");
     expect(res.status).toBe(200);
-    expect(await res.json()).toEqual({ latest: null, dispatches: [] });
+    expect(await res.json()).toEqual({
+      latest: null,
+      pendingHeadCount: null,
+      dispatches: []
+    });
   });
 
   it("defaults scheduledFor to today's ET date when omitted", async () => {
@@ -3009,3 +3013,288 @@ describe("Access-protected accounting reconciliation (3.31)", () => {
     expect(run).not.toHaveBeenCalled();
   });
 });
+
+describe("admin run reject", () => {
+  const SENTENCE = "Rejected with the Run.";
+  const AT = "2026-04-17T15:00:00.000Z";
+
+  async function seedAwaiting(
+    runId: string,
+    scheduledFor: string,
+    status:
+      | "awaiting"
+      | "published"
+      | "failed"
+      | "stopped"
+      | "empty"
+      | "running" = "awaiting"
+  ) {
+    await runsRepo.insertRun(testEnv.DB, {
+      id: runId,
+      origin: "manual",
+      mode: "hitl",
+      status,
+      startedAt: AT,
+      completedAt: status === "running" ? null : AT,
+      spendCents: 0,
+      spendCurrency: "USD",
+      budgetCents: 100,
+      scheduledFor
+    });
+  }
+
+  async function seedDraft(
+    id: string,
+    runId: string,
+    options?: {
+      parentId?: string;
+      revision?: number;
+      outcome?: "approved" | "edited" | null;
+    }
+  ) {
+    const outcome = options?.outcome ?? null;
+    await testEnv.DB.prepare(
+      `INSERT INTO drafts (id, run_id, target_entity_type, target_entity_id, diff_json, body,
+        tier2_only, confidence, eval_summary_json, outcome, decided_at, decided_by, edited_body,
+        reject_reason, reject_reason_private, parent_draft_id, revision_index, created_at, updated_at)
+       VALUES (?, ?, 'states', 'st-nv', '{}', ?, 0, NULL, NULL, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?)`
+    )
+      .bind(
+        id,
+        runId,
+        `Body ${id}.`,
+        outcome,
+        outcome ? AT : null,
+        outcome ? "Earlier Operator" : null,
+        options?.parentId ?? null,
+        options?.revision ?? 0,
+        AT,
+        AT
+      )
+      .run();
+  }
+
+  function reject(runId: string, token?: string) {
+    const path = `/api/admin/runs/${runId}/reject`;
+    return token
+      ? jsonPost(token, path, {})
+      : get(path, {
+          method: "POST",
+          headers: { "content-type": "application/json" },
+          body: "{}"
+        });
+  }
+
+  it("rejects an anonymous caller and a cookie-only token with 403 and no writes", async () => {
+    const runId = "run-20260417-0a01";
+    await seedAwaiting(runId, "2026-04-17");
+    await seedDraft("d-cookie", runId);
+    const anonRes = await worker.fetch(reject(runId), realEnv());
+    expect(anonRes.status).toBe(403);
+    const token = await sign(EMAIL);
+    const cookieRes = await worker.fetch(
+      new Request(`https://pml.example.com/api/admin/runs/${runId}/reject`, {
+        method: "POST",
+        headers: {
+          cookie: `CF_Authorization=${token}`,
+          "content-type": "application/json"
+        },
+        body: "{}"
+      }),
+      realEnv()
+    );
+    expect(cookieRes.status).toBe(403);
+    expect((await draftRow("d-cookie")).outcome).toBeNull();
+    expect(await runStatus(runId)).toBe("awaiting");
+  });
+
+  it("rejects every undecided head, writes one evidence row, and leaves publication untouched", async () => {
+    const runId = "run-20260417-0a02";
+    await seedAwaiting(runId, "2026-04-17");
+    await seedDraft("d-parent", runId);
+    await seedDraft("d-child", runId, { parentId: "d-parent", revision: 1 });
+    await seedDraft("d-other", runId);
+    const before = await f1Snapshot();
+    const dockets = await testEnv.DB.prepare(
+      "SELECT COUNT(*) AS count FROM docket_events"
+    ).first<{ count: number }>();
+    const token = await sign(EMAIL);
+    const res = await worker.fetch(reject(runId, token), realEnv());
+    expect(res.status).toBe(200);
+    expect(await res.json()).toEqual({
+      runId,
+      status: "rejected",
+      rejectedCount: 2
+    });
+    expect(await runStatus(runId)).toBe("rejected");
+    const child = await draftRow("d-child");
+    const other = await draftRow("d-other");
+    const parent = await draftRow("d-parent");
+    expect(parent.outcome).toBeNull();
+    for (const row of [child, other]) {
+      expect(row.outcome).toBe("rejected");
+      expect(row.decided_by).toBe(DISPLAY_NAME);
+      expect(row.reject_reason).toBeNull();
+      expect(row.reject_reason_private).toBe(SENTENCE);
+    }
+    const evidence = await testEnv.DB.prepare(
+      `SELECT run_id, event, payload_json, created_at FROM evidence_events WHERE id = ?`
+    )
+      .bind(`run-completed-${runId}`)
+      .first<{
+        run_id: string;
+        event: string;
+        payload_json: string;
+        created_at: string;
+      }>();
+    expect(evidence).toMatchObject({
+      run_id: runId,
+      event: "run.completed",
+      created_at: child.decided_at
+    });
+    expect(JSON.parse(evidence!.payload_json)).toEqual({
+      status: "rejected",
+      rejectedCount: 2,
+      decidedBy: DISPLAY_NAME
+    });
+    expect(
+      await testEnv.DB.prepare(
+        `SELECT COUNT(*) AS count FROM evidence_events
+          WHERE run_id = ? AND event = 'gate.decided'`
+      )
+        .bind(runId)
+        .first<{ count: number }>()
+    ).toEqual({ count: 0 });
+    expect(await f1Snapshot()).toEqual(before);
+    expect(
+      await testEnv.DB.prepare(
+        "SELECT COUNT(*) AS count FROM docket_events"
+      ).first<{ count: number }>()
+    ).toEqual(dockets);
+    const detail = JSON.stringify(
+      await (await worker.fetch(get(`/api/runs/${runId}`), testEnv)).json()
+    );
+    const feed = await (await worker.fetch(get("/api/drafts"), testEnv)).text();
+    expect(detail).not.toContain(SENTENCE);
+    expect(feed).not.toContain(SENTENCE);
+    expect(detail).not.toContain("reject_reason_private");
+    const again = await worker.fetch(reject(runId, token), realEnv());
+    expect(again.status).toBe(409);
+    expect(await evidenceCount(`run-completed-${runId}`)).toBe(1);
+    expect((await draftRow("d-child")).decided_at).toBe(child.decided_at);
+  });
+
+  it("rolls back when the evidence id is already taken", async () => {
+    const runId = "run-20260417-0a03";
+    await seedAwaiting(runId, "2026-04-17");
+    await seedDraft("d-atomic", runId);
+    await testEnv.DB.prepare(
+      `INSERT INTO evidence_events (id, run_id, seq, event, payload_json, created_at)
+       VALUES (?, ?, 0, 'run.started', '{}', ?)`
+    )
+      .bind(`run-completed-${runId}`, runId, AT)
+      .run();
+    const res = await worker.fetch(reject(runId, await sign(EMAIL)), realEnv());
+    expect(res.status).toBe(409);
+    expect((await draftRow("d-atomic")).outcome).toBeNull();
+    expect(await runStatus(runId)).toBe("awaiting");
+  });
+
+  it("refuses a run that is not awaiting, an unknown id, and an approved head", async () => {
+    const published = "run-20260418-0b01";
+    await seedAwaiting(published, "2026-04-18", "published");
+    await seedDraft("d-published", published);
+    const token = await sign(EMAIL);
+    expect(
+      (await worker.fetch(reject(published, token), realEnv())).status
+    ).toBe(409);
+    expect(await runStatus(published)).toBe("published");
+    expect((await draftRow("d-published")).outcome).toBeNull();
+    expect(
+      (await worker.fetch(reject("run-20260419-0c01", token), realEnv())).status
+    ).toBe(404);
+    const mixed = "run-20260420-0d01";
+    await seedAwaiting(mixed, "2026-04-20");
+    await seedDraft("d-approved", mixed, { outcome: "approved" });
+    await seedDraft("d-open", mixed);
+    expect((await worker.fetch(reject(mixed, token), realEnv())).status).toBe(
+      409
+    );
+    expect(await runStatus(mixed)).toBe("awaiting");
+    expect((await draftRow("d-open")).outcome).toBeNull();
+    expect((await draftRow("d-approved")).outcome).toBe("approved");
+    const getRes = await worker.fetch(
+      signed(token, `/api/admin/runs/${mixed}/reject`, { method: "GET" }),
+      realEnv()
+    );
+    expect(getRes.status).toBe(405);
+    expect(getRes.headers.get("allow")).toBe("POST");
+  });
+
+  it("lets a settled rejected date through dailyRun admission and still blocks reserved cents", async () => {
+    const clearId = "run-20260421-0e01";
+    const heldId = "run-20260422-0f01";
+    await seedAwaiting(clearId, "2026-04-21");
+    await seedAwaiting(heldId, "2026-04-22");
+    await seedDraft("d-clear", clearId);
+    await seedDraft("d-held", heldId);
+    for (const runId of [clearId, heldId]) {
+      await testEnv.DB.prepare(
+        `INSERT INTO run_admissions
+          (run_id, scheduled_for, request_id, instance_id, state, entered, finished, released)
+         VALUES (?, ?, ?, ?, 'confirmed', 1, 1, 0)`
+      )
+        .bind(
+          runId,
+          runId === clearId ? "2026-04-21" : "2026-04-22",
+          `req-${runId}`,
+          `daily-${runId}`
+        )
+        .run();
+    }
+    const token = await sign(EMAIL);
+    expect((await worker.fetch(reject(clearId, token), realEnv())).status).toBe(
+      200
+    );
+    expect((await worker.fetch(reject(heldId, token), realEnv())).status).toBe(
+      200
+    );
+    await testEnv.DB.prepare(
+      `INSERT INTO llm_operations
+        (id, run_id, logical_key, fingerprint, role, state, owner, bound_cents, liability_cents, policy_json, created_at)
+       VALUES ('op-held-0f01', ?, 'hold', 'fp-hold', 'drafter', 'reserved', 'test', 5, 5, '{}', ?)`
+    )
+      .bind(heldId, AT)
+      .run();
+    const workflow = { create: vi.fn(async () => ({})) };
+    const env = {
+      ...realEnv(),
+      DAILY_RUN: workflow
+    } as unknown as Env;
+    const admitted = await worker.fetch(
+      jsonPost(token, "/api/admin/runs", {
+        origin: "manual",
+        scheduledFor: "2026-04-21",
+        requestId: "admit-after-reject"
+      }),
+      env
+    );
+    expect(admitted.status).toBe(200);
+    const created = (await admitted.json()) as { id: string; status: string };
+    expect(created.id).not.toBe(clearId);
+    expect(created.status).toBe("running");
+    expect(workflow.create).toHaveBeenCalled();
+    const blocked = await worker.fetch(
+      jsonPost(token, "/api/admin/runs", {
+        origin: "manual",
+        scheduledFor: "2026-04-22",
+        requestId: "blocked-after-reject"
+      }),
+      env
+    );
+    expect(blocked.status).toBe(409);
+    expect(await runsRepo.listRunIdsForDate(testEnv.DB, "2026-04-22")).toEqual([
+      heldId
+    ]);
+  });
+});
diff --git a/src/shared/db/repos/draftsRepo.ts b/src/shared/db/repos/draftsRepo.ts
index c35a7a0..23bd358 100644
--- a/src/shared/db/repos/draftsRepo.ts
+++ b/src/shared/db/repos/draftsRepo.ts
@@ -510,6 +510,21 @@ export async function applyDecisionStmt(
     );
 }
 
+/** Undecided chain heads for one Run. Same predicate the batch reject updates. */
+export async function countUndecidedCurrentHeads(
+  db: Db,
+  runId: string
+): Promise<number> {
+  const row = await db
+    .prepare(
+      `SELECT COUNT(*) AS count FROM drafts d
+        WHERE d.run_id = ? AND d.outcome IS NULL AND ${currentHeadSql("d")}`
+    )
+    .bind(runId)
+    .first<{ count: number }>();
+  return Number(row?.count ?? 0);
+}
+
 /** Mirrors pendingTips: highest revision, breaking ties by listByRun order. */
 export function currentHeadSql(alias: string): string {
   return `NOT EXISTS (
diff --git a/src/surfaces/admin/LoopControls.tsx b/src/surfaces/admin/LoopControls.tsx
index 8abfe32..a00dfee 100644
--- a/src/surfaces/admin/LoopControls.tsx
+++ b/src/surfaces/admin/LoopControls.tsx
@@ -33,13 +33,19 @@ type LoopControlsProps = {
   dev?: boolean;
   /** Injected latest row for tests. `null` is "no runs"; omit to fetch. */
   latest?: RunLogItem | null;
+  /** Undecided current-head count for an injected awaiting Run. */
+  pendingHeadCount?: number;
 };
 
 type LoopView =
   | { status: "loading" }
   | { status: "signedOut" }
   | { status: "timedOut" }
-  | { status: "ready"; latest: RunLogItem | null };
+  | {
+      status: "ready";
+      latest: RunLogItem | null;
+      pendingHeadCount: number | null;
+    };
 
 export const LOOP_TIMEOUT_NOTICE =
   "The latest Run status did not load within 15 seconds. Showing the last known state.";
@@ -145,6 +151,17 @@ function isRunLogItem(value: unknown): value is RunLogItem {
   );
 }
 
+function pendingHeadCountOf(body: unknown): number | null {
+  if (
+    body === null ||
+    typeof body !== "object" ||
+    !("pendingHeadCount" in body)
+  )
+    return null;
+  const value = (body as { pendingHeadCount: unknown }).pendingHeadCount;
+  return isNonNegativeInt(value) ? value : null;
+}
+
 function unwrapLatest(body: unknown): RunLogItem | null | undefined {
   if (body === null || typeof body !== "object" || !("latest" in body)) {
     return undefined;
@@ -164,6 +181,7 @@ function errorCode(body: unknown): string | null {
 
 export function LoopControls({
   latest: injectedLatest,
+  pendingHeadCount: injectedHeadCount,
   dev = false
 }: LoopControlsProps) {
   const injected = injectedLatest !== undefined;
@@ -171,6 +189,7 @@ export function LoopControls({
   const [reload, setReload] = useState(0);
   const [busy, setBusy] = useState(false);
   const [confirming, setConfirming] = useState(false);
+  const [rejecting, setRejecting] = useState(false);
   const [dispatches, setDispatches] = useState<RunDispatch[]>([]);
   const pendingRequest = useRef<PendingRequest | null>(null);
   const confirmationRequest = useRef<PendingRequest | null>(null);
@@ -234,7 +253,11 @@ export function LoopControls({
           setView({ status: "signedOut" });
           return;
         }
-        setView({ status: "ready", latest });
+        setView({
+          status: "ready",
+          latest,
+          pendingHeadCount: pendingHeadCountOf(body)
+        });
         // A poll that timed out earlier is no longer stale; other notices
         // (run trigger outcomes) stay until the next trigger clears them.
         setNotice((current) =>
@@ -431,6 +454,72 @@ export function LoopControls({
     }
   }
 
+  async function rejectRun(runId: string) {
+    setBusy(true);
+    setNotice(null);
+    try {
+      const res = await fetchWithTimeout(
+        `/api/admin/runs/${runId}/reject`,
+        {
+          method: "POST",
+          credentials: "same-origin",
+          headers: {
+            "content-type": "application/json",
+            accept: "application/json"
+          },
+          body: "{}"
+        },
+        ADMIN_POST_TIMEOUT_MS
+      );
+      if (res.status === 403) {
+        setView({ status: "signedOut" });
+        setReload((value) => value + 1);
+        return;
+      }
+      let body: unknown = null;
+      try {
+        body = await res.json();
+      } catch {
+        body = null;
+      }
+      if (res.status === 409) {
+        setRejecting(false);
+        setNotice("This run cannot be rejected.");
+        setReload((value) => value + 1);
+        return;
+      }
+      if (!res.ok) {
+        setNotice(
+          "Reject did not complete. The run is unchanged until you confirm it again."
+        );
+        return;
+      }
+      const rejectedCount =
+        body &&
+        typeof body === "object" &&
+        "rejectedCount" in body &&
+        typeof body.rejectedCount === "number"
+          ? body.rejectedCount
+          : null;
+      setRejecting(false);
+      setNotice(
+        rejectedCount === null
+          ? `Run ${runId} rejected.`
+          : `Run ${runId} rejected. ${rejectedCount} drafts were rejected.`
+      );
+      setReload((value) => value + 1);
+    } catch (err) {
+      setNotice(
+        isTimeoutError(err)
+          ? "No answer within 30 seconds. The run may or may not have been rejected — the status below refreshes."
+          : "Reject outcome is unknown. Check this same Run again."
+      );
+      setReload((value) => value + 1);
+    } finally {
+      setBusy(false);
+    }
+  }
+
   if (!injected && view.status === "signedOut") {
     return (
       <EmptyState
@@ -475,6 +564,11 @@ export function LoopControls({
     : view.status === "ready"
       ? view.latest
       : null;
+  const pendingHeadCount = injected
+    ? (injectedHeadCount ?? null)
+    : view.status === "ready"
+      ? view.pendingHeadCount
+      : null;
 
   return (
     <div className="loop-workspace">
@@ -503,6 +597,43 @@ export function LoopControls({
               View run evidence →
             </a>
           </p>
+          {latest.status === "awaiting" && pendingHeadCount !== null ? (
+            rejecting ? (
+              <div className="rejectbox">
+                <p>
+                  Reject {pendingHeadCount} undecided drafts in {latest.id}?
+                  Nothing will be published.
+                </p>
+                <button
+                  type="button"
+                  className="btn btn-primary"
+                  disabled={busy}
+                  onClick={() => void rejectRun(latest.id)}
+                >
+                  Reject {pendingHeadCount} drafts
+                </button>
+                <button
+                  type="button"
+                  className="btn btn-ghost"
+                  disabled={busy}
+                  onClick={() => setRejecting(false)}
+                >
+                  Cancel
+                </button>
+              </div>
+            ) : (
+              <p>
+                <button
+                  type="button"
+                  className="btn btn-secondary"
+                  disabled={busy}
+                  onClick={() => setRejecting(true)}
+                >
+                  Reject this run
+                </button>
+              </p>
+            )
+          ) : null}
           <details className="cost-details">
             <summary>Budget accounting details</summary>
             Budget accounting: {latest.spendCents} cents (includes estimates).
diff --git a/src/surfaces/admin/loopControls.mount.test.tsx b/src/surfaces/admin/loopControls.mount.test.tsx
index 66d59e1..3f309b2 100644
--- a/src/surfaces/admin/loopControls.mount.test.tsx
+++ b/src/surfaces/admin/loopControls.mount.test.tsx
@@ -668,4 +668,51 @@ describe("tab-local request recovery and confirmation", () => {
       );
     }
   );
+
+  it("confirms the undecided count before rejecting and ignores J, K, A, E, and R", async () => {
+    const fetchMock = vi.fn(
+      async (input: RequestInfo | URL, init?: RequestInit) => {
+        const url = String(input);
+        if (url.includes("/reject") && init?.method === "POST") {
+          return scripted({
+            runId: "run-20261111-0000",
+            status: "rejected",
+            rejectedCount: 4
+          });
+        }
+        return scripted({
+          latest: item({
+            status: "awaiting",
+            completedAt: null,
+            approvalOutcome: null
+          }),
+          pendingHeadCount: 4,
+          dispatches: []
+        });
+      }
+    );
+    vi.stubGlobal("fetch", fetchMock);
+    render(<LoopControls />);
+    await act(async () => {});
+    for (const key of ["j", "k", "a", "e", "r"]) {
+      fireEvent.keyDown(document.body, { key });
+    }
+    expect(
+      fetchMock.mock.calls.some((call) => String(call[0]).includes("/reject"))
+    ).toBe(false);
+    const open = screen.getByRole("button", { name: "Reject this run" });
+    expect(open.getAttribute("accesskey")).toBeNull();
+    fireEvent.click(open);
+    expect(document.body.textContent).toContain(
+      "Reject 4 undecided drafts in run-20261111-0000?"
+    );
+    expect(document.body.textContent).toContain("Nothing will be published.");
+    fireEvent.click(screen.getByRole("button", { name: "Reject 4 drafts" }));
+    await act(async () => {});
+    const post = fetchMock.mock.calls.find((call) =>
+      String(call[0]).includes("/reject")
+    );
+    expect(post?.[0]).toBe("/api/admin/runs/run-20261111-0000/reject");
+    expect(post?.[1]?.method).toBe("POST");
+  });
 });
diff --git a/src/surfaces/admin/loopControls.test.tsx b/src/surfaces/admin/loopControls.test.tsx
index 5544d75..910eae3 100644
--- a/src/surfaces/admin/loopControls.test.tsx
+++ b/src/surfaces/admin/loopControls.test.tsx
@@ -48,4 +48,22 @@ describe("LoopControls (story 3.12)", () => {
     expect(html).toContain("awaiting approval");
     expect(html).toContain('class="run awaiting"');
   });
+
+  it("shows run reject only while the latest run is awaiting and a count is known", () => {
+    const awaiting = renderToStaticMarkup(
+      <LoopControls
+        latest={item({ status: "awaiting" })}
+        pendingHeadCount={4}
+      />
+    );
+    expect(awaiting).toContain("Reject this run");
+    expect(awaiting).not.toContain("accesskey");
+    const published = renderToStaticMarkup(
+      <LoopControls
+        latest={item({ status: "published" })}
+        pendingHeadCount={4}
+      />
+    );
+    expect(published).not.toContain("Reject this run");
+  });
 });

Do not invoke any skill, and do not spawn subagents of your own — you are the reviewer. If the instruction file is unreadable, report that exact failure and stop. Return your findings as text in your final message; do not route them through any findings-reporting tool the host may offer.
