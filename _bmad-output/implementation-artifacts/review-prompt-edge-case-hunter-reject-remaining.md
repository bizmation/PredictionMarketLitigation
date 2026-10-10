Read the reviewer instructions below completely and follow them as your review instructions.

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

claims_file (leave unread until your instructions call for it): the spec below.

```markdown
---
title: 'Reject remaining undecided heads when a Run is partly approved'
type: 'feature'
created: '2026-10-10'
status: 'in-review'
route: 'dispatch'
baseline_commit: 'b842569f4cf64ce64cb61e978869899113b05f6f'
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
- The confirm dialog shows both counts: how many undecided drafts will be rejected, and how many approved or edited drafts stay published.

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
| Partly approved | `awaiting`, 1 `approved` head and N undecided heads | Those N heads rejected; the approved head unchanged; Run `published`; receipt `rejectedCount` equals N | rolls back if the receipt misses |
| Edited head | `awaiting`, an `edited` current head, plus an undecided head | Edited row and `edited_body` unchanged; Run `published` | rolls back if the receipt misses |
| Non-head | Superseded parent still undecided | Parent outcome stays null | N/A |
| Repeat / closed | Already `published` or `rejected`, or no undecided head | No second receipt | 409 |
| Unknown | Unknown id, or not `awaiting` | No writes | 404, or 409 if known |
| Side effects | Partly approved success | No new `gate.decided`, docket, or F1 rows | N/A |
| Admission | Fully rejected, finished, settled | New Run for that date is admitted | N/A |
| Supersede | Published by this reject, settled, no hold | Later start without supersede is `supersede_required` | existing rule |
| Accounting hold | Reserved, uncertain, or an issue remains | Date stays blocked | existing conflict |
| Confirm | Awaiting, undecided count > 0 | Dialog shows the undecided count and the approved-or-edited count | Shortcuts do not POST |
| Success | Body `status` is `published` | Card shows `published`; notice names the rejected count | All-rejected notice stays |

</frozen-after-approval>

## Code Map

- Baseline `f002b1edd61a5387e89e5899ecb43f61e8277ea8` (`main`, includes #63 and #65). Leave `src/pipeline/ai/gateway.ts`, `src/pipeline/connectors/courtListener.ts`, `finalizeDecidedRunStmt`, `currentHeadSql`, and admission SQL alone. The #64 follow-up catch narrowing is not on this base; do not add it.
- `src/shared/lib/access.ts` `readTokens` — POST ignores the cookie. `requireOperator` in `src/server.ts` already guards the route.
- `src/pipeline/gate/approval.ts` `rejectAwaitingRun` — delete the approved/edited pre-check and `reject_run_unpublished`. Keep the awaiting check, zero-head check, private reason, `outcome IS NULL` update, finalize, and receipt. Return receipt `status` plus `rejectedCount`. Do not edit the catch.
- `src/server.ts` — JSON `status` is that terminal status. `GET /api/admin/loop` also returns how many current heads are `approved` or `edited` (`publishedHeadCount`), beside `pendingHeadCount`, and null when the latest Run is not `awaiting`.
- `src/surfaces/admin/LoopControls.tsx` — confirm text shows both counts, for example `Reject {pending} undecided drafts in {id}? {published} approved or edited drafts stay published.` Keep the `Reject {n} drafts` button. On `published`, set the card to `published` and name the rejected count.
- `src/shared/api/adminApi.test.ts` — one approved head and N undecided heads: Run `published`, receipt `rejectedCount` equals N, approved row and `f1Snapshot` unchanged, no new docket or `gate.decided`, one receipt, 409 on repeat. Edited head stays edited. Keep the all-undecided, cookie, and reserved-cent tests.
- `src/surfaces/admin/loopControls.mount.test.tsx` — confirm text shows both the undecided count and the approved-or-edited count. A `published` response updates the card.

## Tasks & Acceptance

**Execution:**
- [x] `src/pipeline/gate/approval.ts` — let a partly decided awaiting Run through the existing batch and return the receipt status.
- [x] `src/server.ts` — return that terminal status, and return `publishedHeadCount` on `GET /api/admin/loop`.
- [x] `src/surfaces/admin/LoopControls.tsx` — confirm dialog shows both counts, and the published success state.
- [x] `src/shared/api/adminApi.test.ts`, `src/surfaces/admin/loopControls.mount.test.tsx` — mixed Run (1 approved, N undecided), edited head, both confirm counts, and supersede.

**Acceptance Criteria:**
- Given an awaiting Run with 1 approved current head and N undecided current heads, when reject runs, then the Run is `published` and the `run.completed` receipt's `rejectedCount` equals N.
- Given the all-undecided, cookie-only, repeat, and reserved-cent cases, when this route runs, then those #64 outcomes still hold.
- Given a taken `run-completed-${runId}` id, when the batch runs, then it rolls back and the route returns 409, using the catch already on the branch.

## Implementation Notes

- `rejectAwaitingRun` no longer pre-checks or asserts `reject_run_unpublished`. The update still requires `outcome IS NULL`. The receipt `status` is returned as `terminalStatus` and the route writes that into the JSON `status`.
- `GET /api/admin/loop` adds `publishedHeadCount` via `countPublishedCurrentHeads` (current heads with outcome `approved` or `edited`). It is null when the latest Run is not awaiting.
- Confirm copy is `Reject {pending} undecided drafts in {id}? {published} approved or edited drafts stay published.` A published response sets the card to `published` and names the rejected count. The all-rejected notice string is unchanged. The catch block is unchanged.
- Verification: `npm run check` passed. `npm test` passed 1540 tests, 6 skipped.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run check` — expected: exit 0
- `npm test` — expected: exit 0
```

Review content: the unified diff below. Read it — it is the content under review.

```diff
diff --git a/_bmad-output/implementation-artifacts/spec-gh-64-reject-remaining-undecided-heads.md b/_bmad-output/implementation-artifacts/spec-gh-64-reject-remaining-undecided-heads.md
index 27ab262..7fcc236 100644
--- a/_bmad-output/implementation-artifacts/spec-gh-64-reject-remaining-undecided-heads.md
+++ b/_bmad-output/implementation-artifacts/spec-gh-64-reject-remaining-undecided-heads.md
@@ -2,8 +2,9 @@
 title: 'Reject remaining undecided heads when a Run is partly approved'
 type: 'feature'
 created: '2026-10-10'
-status: 'draft'
+status: 'in-review'
 route: 'dispatch'
+baseline_commit: 'b842569f4cf64ce64cb61e978869899113b05f6f'
 review_loop_iteration: 0
 context:
   - '{project-root}/_bmad-output/implementation-artifacts/spec-reject-awaiting-run-batch.md'
@@ -26,7 +27,7 @@ context:
 - Receipt payload stays `status`, `rejectedCount`, `decidedBy`. `status` is the Run status after finalize (`published` if any draft is `approved` or `edited`, else `rejected`). `rejectedCount` is only the heads this call rejected. The HTTP body returns that `status` and count.
 - Repeat, not awaiting, or no undecided current head: 409 and no second receipt. Unknown id: 404.
 - Approved and edited heads, `edited_body`, and F1 written at approval stay unchanged. Holds still block admission. A fully rejected settled Run still admits a new Run. A published result still requires supersede.
-- Confirm copy names how many drafts will be rejected and says already-approved drafts stay published.
+- The confirm dialog shows both counts: how many undecided drafts will be rejected, and how many approved or edited drafts stay published.
 
 **Never:**
 - No `gate.decided`, F1, docket-event, or baseline writes from this reject. Do not change `finalizeDecidedRunStmt`, admission SQL, or `currentHeadSql`.
@@ -40,7 +41,8 @@ context:
 |----------|--------------|---------------------------|----------------|
 | Anonymous / cookie | No token, or JWT only in the cookie | 403, no writes | fail closed |
 | All undecided | `awaiting`, undecided heads only | Heads rejected, receipt `status: rejected`, Run `rejected` | rolls back if the receipt misses |
-| Partly approved | `awaiting`, an `approved` or `edited` current head, plus an undecided head | Undecided heads rejected; decided heads unchanged; Run `published`; receipt `status: published` and this call's count | rolls back if the receipt misses |
+| Partly approved | `awaiting`, 1 `approved` head and N undecided heads | Those N heads rejected; the approved head unchanged; Run `published`; receipt `rejectedCount` equals N | rolls back if the receipt misses |
+| Edited head | `awaiting`, an `edited` current head, plus an undecided head | Edited row and `edited_body` unchanged; Run `published` | rolls back if the receipt misses |
 | Non-head | Superseded parent still undecided | Parent outcome stays null | N/A |
 | Repeat / closed | Already `published` or `rejected`, or no undecided head | No second receipt | 409 |
 | Unknown | Unknown id, or not `awaiting` | No writes | 404, or 409 if known |
@@ -48,35 +50,41 @@ context:
 | Admission | Fully rejected, finished, settled | New Run for that date is admitted | N/A |
 | Supersede | Published by this reject, settled, no hold | Later start without supersede is `supersede_required` | existing rule |
 | Accounting hold | Reserved, uncertain, or an issue remains | Date stays blocked | existing conflict |
-| Confirm | Awaiting, undecided count > 0 | Copy names the count and that already-approved drafts stay published | Shortcuts do not POST |
+| Confirm | Awaiting, undecided count > 0 | Dialog shows the undecided count and the approved-or-edited count | Shortcuts do not POST |
 | Success | Body `status` is `published` | Card shows `published`; notice names the rejected count | All-rejected notice stays |
 
 </frozen-after-approval>
 
 ## Code Map
 
-- Baseline `103fb656a6173eda92d9cd93824706cc5c9183cd`. Leave `src/pipeline/ai/gateway.ts`, `src/pipeline/connectors/courtListener.ts`, `finalizeDecidedRunStmt`, `currentHeadSql`, and admission SQL alone.
+- Baseline `f002b1edd61a5387e89e5899ecb43f61e8277ea8` (`main`, includes #63 and #65). Leave `src/pipeline/ai/gateway.ts`, `src/pipeline/connectors/courtListener.ts`, `finalizeDecidedRunStmt`, `currentHeadSql`, and admission SQL alone. The #64 follow-up catch narrowing is not on this base; do not add it.
 - `src/shared/lib/access.ts` `readTokens` — POST ignores the cookie. `requireOperator` in `src/server.ts` already guards the route.
 - `src/pipeline/gate/approval.ts` `rejectAwaitingRun` — delete the approved/edited pre-check and `reject_run_unpublished`. Keep the awaiting check, zero-head check, private reason, `outcome IS NULL` update, finalize, and receipt. Return receipt `status` plus `rejectedCount`. Do not edit the catch.
-- `src/server.ts` reject handler — JSON `status` is that terminal status.
-- `src/surfaces/admin/LoopControls.tsx` — replace `Nothing will be published.` with `Already-approved drafts stay published.` Keep the count sentence and `Reject {n} drafts` button. On `published`, set the card to `published` and name the rejected count.
-- `src/shared/api/adminApi.test.ts` — approved and edited heads expect `published`, unchanged rows, unchanged `f1Snapshot`, no new docket or `gate.decided`, one receipt, and 409 on repeat. Keep the all-undecided, cookie, and reserved-cent tests.
-- `src/surfaces/admin/loopControls.mount.test.tsx` — confirm text has the count and `Already-approved drafts stay published.` A `published` response updates the card.
+- `src/server.ts` — JSON `status` is that terminal status. `GET /api/admin/loop` also returns how many current heads are `approved` or `edited` (`publishedHeadCount`), beside `pendingHeadCount`, and null when the latest Run is not `awaiting`.
+- `src/surfaces/admin/LoopControls.tsx` — confirm text shows both counts, for example `Reject {pending} undecided drafts in {id}? {published} approved or edited drafts stay published.` Keep the `Reject {n} drafts` button. On `published`, set the card to `published` and name the rejected count.
+- `src/shared/api/adminApi.test.ts` — one approved head and N undecided heads: Run `published`, receipt `rejectedCount` equals N, approved row and `f1Snapshot` unchanged, no new docket or `gate.decided`, one receipt, 409 on repeat. Edited head stays edited. Keep the all-undecided, cookie, and reserved-cent tests.
+- `src/surfaces/admin/loopControls.mount.test.tsx` — confirm text shows both the undecided count and the approved-or-edited count. A `published` response updates the card.
 
 ## Tasks & Acceptance
 
 **Execution:**
-- [ ] `src/pipeline/gate/approval.ts` — let a partly decided awaiting Run through the existing batch and return the receipt status.
-- [ ] `src/server.ts` — return that terminal status.
-- [ ] `src/surfaces/admin/LoopControls.tsx` — confirm copy and published success state.
-- [ ] `src/shared/api/adminApi.test.ts`, `src/surfaces/admin/loopControls.mount.test.tsx` — partly approved, edited, confirm, and supersede rows.
+- [x] `src/pipeline/gate/approval.ts` — let a partly decided awaiting Run through the existing batch and return the receipt status.
+- [x] `src/server.ts` — return that terminal status, and return `publishedHeadCount` on `GET /api/admin/loop`.
+- [x] `src/surfaces/admin/LoopControls.tsx` — confirm dialog shows both counts, and the published success state.
+- [x] `src/shared/api/adminApi.test.ts`, `src/surfaces/admin/loopControls.mount.test.tsx` — mixed Run (1 approved, N undecided), edited head, both confirm counts, and supersede.
 
 **Acceptance Criteria:**
+- Given an awaiting Run with 1 approved current head and N undecided current heads, when reject runs, then the Run is `published` and the `run.completed` receipt's `rejectedCount` equals N.
 - Given the all-undecided, cookie-only, repeat, and reserved-cent cases, when this route runs, then those #64 outcomes still hold.
 - Given a taken `run-completed-${runId}` id, when the batch runs, then it rolls back and the route returns 409, using the catch already on the branch.
 
 ## Implementation Notes
 
+- `rejectAwaitingRun` no longer pre-checks or asserts `reject_run_unpublished`. The update still requires `outcome IS NULL`. The receipt `status` is returned as `terminalStatus` and the route writes that into the JSON `status`.
+- `GET /api/admin/loop` adds `publishedHeadCount` via `countPublishedCurrentHeads` (current heads with outcome `approved` or `edited`). It is null when the latest Run is not awaiting.
+- Confirm copy is `Reject {pending} undecided drafts in {id}? {published} approved or edited drafts stay published.` A published response sets the card to `published` and names the rejected count. The all-rejected notice string is unchanged. The catch block is unchanged.
+- Verification: `npm run check` passed. `npm test` passed 1540 tests, 6 skipped.
+
 ## Spec Change Log
 
 ## Review Triage Log
diff --git a/src/pipeline/gate/approval.ts b/src/pipeline/gate/approval.ts
index 6ed197c..099de1f 100644
--- a/src/pipeline/gate/approval.ts
+++ b/src/pipeline/gate/approval.ts
@@ -272,11 +272,17 @@ export const RUN_REJECT_PRIVATE_REASON = "Rejected with the Run.";
 export type RejectRunResult =
   | { status: "not_found" }
   | { status: "conflict" }
-  | { status: "rejected"; runId: string; rejectedCount: number };
+  | {
+      status: "rejected";
+      runId: string;
+      rejectedCount: number;
+      terminalStatus: "published" | "rejected";
+    };
 
 /**
  * Reject every undecided current head of an awaiting Run in one D1 batch.
- * One `run.completed` receipt. No F1, docket, or per-draft `gate.decided`.
+ * Approved and edited heads stay. One `run.completed` receipt. No F1,
+ * docket, or per-draft `gate.decided`.
  */
 export async function rejectAwaitingRun(
   db: Db,
@@ -297,15 +303,6 @@ export async function rejectAwaitingRun(
   if (!run) return { status: "not_found" };
   if (run.status !== "awaiting") return { status: "conflict" };
 
-  const blocking = await db
-    .prepare(
-      `SELECT 1 AS present FROM drafts d
-        WHERE d.run_id = ? AND d.outcome IN ('approved','edited')
-          AND ${draftsRepo.currentHeadSql("d")} LIMIT 1`
-    )
-    .bind(runId)
-    .first<{ present: number }>();
-  if (blocking) return { status: "conflict" };
   if ((await draftsRepo.countUndecidedCurrentHeads(db, runId)) === 0) {
     return { status: "conflict" };
   }
@@ -320,12 +317,6 @@ export async function rejectAwaitingRun(
         "EXISTS (SELECT 1 FROM runs WHERE id = ? AND status = 'awaiting')",
         [runId]
       ),
-      assertStmt(
-        db,
-        "reject_run_unpublished",
-        `NOT EXISTS (SELECT 1 FROM drafts d WHERE d.run_id = ? AND d.outcome IN ('approved','edited') AND ${draftsRepo.currentHeadSql("d")})`,
-        [runId]
-      ),
       assertStmt(
         db,
         "reject_run_heads",
@@ -390,8 +381,20 @@ export async function rejectAwaitingRun(
     .bind(evidenceId)
     .first<{ payload_json: string }>();
   const payload = written
-    ? (JSON.parse(written.payload_json) as { rejectedCount?: unknown })
+    ? (JSON.parse(written.payload_json) as {
+        rejectedCount?: unknown;
+        status?: unknown;
+      })
     : null;
-  if (typeof payload?.rejectedCount !== "number") return { status: "conflict" };
-  return { status: "rejected", runId, rejectedCount: payload.rejectedCount };
+  if (
+    typeof payload?.rejectedCount !== "number" ||
+    (payload.status !== "published" && payload.status !== "rejected")
+  )
+    return { status: "conflict" };
+  return {
+    status: "rejected",
+    runId,
+    rejectedCount: payload.rejectedCount,
+    terminalStatus: payload.status
+  };
 }
diff --git a/src/server.ts b/src/server.ts
index de6f4c9..5405577 100644
--- a/src/server.ts
+++ b/src/server.ts
@@ -343,6 +343,13 @@ export default {
                       latest.id
                     )
                   : null,
+              publishedHeadCount:
+                latest?.status === "awaiting"
+                  ? await draftsRepo.countPublishedCurrentHeads(
+                      getDb(env),
+                      latest.id
+                    )
+                  : null,
               dispatches: await runAdmissionRepo.listActive(getDb(env))
             },
             { headers: ADMIN_CACHE_HEADERS }
@@ -481,7 +488,7 @@ export default {
           return Response.json(
             {
               runId: result.runId,
-              status: "rejected",
+              status: result.terminalStatus,
               rejectedCount: result.rejectedCount
             },
             { headers: ADMIN_CACHE_HEADERS }
diff --git a/src/shared/api/adminApi.test.ts b/src/shared/api/adminApi.test.ts
index 540897c..74f9a3e 100644
--- a/src/shared/api/adminApi.test.ts
+++ b/src/shared/api/adminApi.test.ts
@@ -1106,6 +1106,7 @@ describe("admin loop controls (story 3.12)", () => {
     expect(await res.json()).toEqual({
       latest: null,
       pendingHeadCount: null,
+      publishedHeadCount: null,
       dispatches: []
     });
   });
@@ -3202,7 +3203,7 @@ describe("admin run reject", () => {
     expect(await runStatus(runId)).toBe("awaiting");
   });
 
-  it("refuses a run that is not awaiting, an unknown id, and an approved head", async () => {
+  it("refuses a run that is not awaiting and an unknown id", async () => {
     const published = "run-20260418-0b01";
     await seedAwaiting(published, "2026-04-18", "published");
     await seedDraft("d-published", published);
@@ -3215,39 +3216,140 @@ describe("admin run reject", () => {
     expect(
       (await worker.fetch(reject("run-20260419-0c01", token), realEnv())).status
     ).toBe(404);
-    const mixed = "run-20260420-0d01";
-    await seedAwaiting(mixed, "2026-04-20");
-    await seedDraft("d-approved", mixed, { outcome: "approved" });
-    await seedDraft("d-open", mixed);
-    expect((await worker.fetch(reject(mixed, token), realEnv())).status).toBe(
-      409
-    );
-    expect(await runStatus(mixed)).toBe("awaiting");
-    expect((await draftRow("d-open")).outcome).toBeNull();
-    expect((await draftRow("d-approved")).outcome).toBe("approved");
     const getRes = await worker.fetch(
-      signed(token, `/api/admin/runs/${mixed}/reject`, { method: "GET" }),
+      signed(token, `/api/admin/runs/${published}/reject`, { method: "GET" }),
       realEnv()
     );
     expect(getRes.status).toBe(405);
     expect(getRes.headers.get("allow")).toBe("POST");
   });
 
-  it("refuses an edited current head and writes nothing", async () => {
+  it("publishes a mixed run and records the undecided head count on the receipt", async () => {
+    const runId = "run-20260420-0d01";
+    const undecided = ["d-open-a", "d-open-b", "d-open-c"];
+    await seedAwaiting(runId, "2026-04-20");
+    await seedDraft("d-mix-parent", runId);
+    await seedDraft("d-mix-approved", runId, {
+      parentId: "d-mix-parent",
+      revision: 1,
+      outcome: "approved"
+    });
+    for (const id of undecided) await seedDraft(id, runId);
+    const approvedBefore = await draftRow("d-mix-approved");
+    const before = await f1Snapshot();
+    const dockets = await testEnv.DB.prepare(
+      "SELECT COUNT(*) AS count FROM docket_events"
+    ).first<{ count: number }>();
+    const token = await sign(EMAIL);
+    const res = await worker.fetch(reject(runId, token), realEnv());
+    expect(res.status).toBe(200);
+    expect(await res.json()).toEqual({
+      runId,
+      status: "published",
+      rejectedCount: undecided.length
+    });
+    expect(await runStatus(runId)).toBe("published");
+    expect(await draftRow("d-mix-approved")).toEqual(approvedBefore);
+    expect((await draftRow("d-mix-parent")).outcome).toBeNull();
+    for (const id of undecided) {
+      const row = await draftRow(id);
+      expect(row.outcome).toBe("rejected");
+      expect(row.reject_reason).toBeNull();
+      expect(row.reject_reason_private).toBe(SENTENCE);
+    }
+    const evidence = await testEnv.DB.prepare(
+      `SELECT event, payload_json FROM evidence_events WHERE id = ?`
+    )
+      .bind(`run-completed-${runId}`)
+      .first<{ event: string; payload_json: string }>();
+    expect(evidence?.event).toBe("run.completed");
+    expect(JSON.parse(evidence!.payload_json)).toEqual({
+      status: "published",
+      rejectedCount: undecided.length,
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
+    const again = await worker.fetch(reject(runId, token), realEnv());
+    expect(again.status).toBe(409);
+    expect(await evidenceCount(`run-completed-${runId}`)).toBe(1);
+    expect(await draftRow("d-mix-approved")).toEqual(approvedBefore);
+  });
+
+  it("leaves an edited head unchanged and publishes the run", async () => {
     const runId = "run-20260423-0d02";
     await seedAwaiting(runId, "2026-04-23");
     await seedDraft("d-edited-head", runId, { outcome: "edited" });
     await seedDraft("d-still-open", runId);
+    const editedBefore = await draftRow("d-edited-head");
     const token = await sign(EMAIL);
-    expect((await worker.fetch(reject(runId, token), realEnv())).status).toBe(
-      409
-    );
+    const res = await worker.fetch(reject(runId, token), realEnv());
+    expect(res.status).toBe(200);
+    expect(await res.json()).toEqual({
+      runId,
+      status: "published",
+      rejectedCount: 1
+    });
+    expect(await runStatus(runId)).toBe("published");
+    expect(await draftRow("d-edited-head")).toEqual(editedBefore);
+    expect((await draftRow("d-still-open")).outcome).toBe("rejected");
+    expect(await evidenceCount(`run-completed-${runId}`)).toBe(1);
+  });
+
+  it("refuses an awaiting run that has no undecided current head", async () => {
+    const runId = "run-20260426-0d05";
+    await seedAwaiting(runId, "2026-04-26");
+    await seedDraft("d-only-approved", runId, { outcome: "approved" });
+    const before = await draftRow("d-only-approved");
+    const res = await worker.fetch(reject(runId, await sign(EMAIL)), realEnv());
+    expect(res.status).toBe(409);
     expect(await runStatus(runId)).toBe("awaiting");
-    expect((await draftRow("d-still-open")).outcome).toBeNull();
-    expect((await draftRow("d-edited-head")).outcome).toBe("edited");
+    expect(await draftRow("d-only-approved")).toEqual(before);
     expect(await evidenceCount(`run-completed-${runId}`)).toBe(0);
   });
 
+  it("requires supersede after a partly approved reject publishes the run", async () => {
+    const runId = "run-20260425-0d04";
+    await seedAwaiting(runId, "2026-04-25");
+    await seedDraft("d-kept", runId, { outcome: "approved" });
+    await seedDraft("d-rest", runId);
+    const token = await sign(EMAIL);
+    expect((await worker.fetch(reject(runId, token), realEnv())).status).toBe(
+      200
+    );
+    const workflow = { create: vi.fn(async () => ({})) };
+    const blocked = await worker.fetch(
+      jsonPost(token, "/api/admin/runs", {
+        origin: "manual",
+        scheduledFor: "2026-04-25",
+        requestId: "supersede-after-partial-reject"
+      }),
+      { ...realEnv(), DAILY_RUN: workflow } as unknown as Env
+    );
+    expect(blocked.status).toBe(409);
+    expect(await blocked.json()).toEqual({
+      code: "supersede_required",
+      message: expect.any(String),
+      details: { priorRunId: runId }
+    });
+    expect(workflow.create).not.toHaveBeenCalled();
+    expect(await runsRepo.listRunIdsForDate(testEnv.DB, "2026-04-25")).toEqual([
+      runId
+    ]);
+  });
+
   it("reports the undecided current-head count for an awaiting latest run", async () => {
     const runId = "run-20990101-0aa1";
     await seedAwaiting(
@@ -3267,9 +3369,22 @@ describe("admin run reject", () => {
     const body = (await res.json()) as {
       latest: { id: string } | null;
       pendingHeadCount: number | null;
+      publishedHeadCount: number | null;
     };
     expect(body.latest?.id).toBe(runId);
     expect(body.pendingHeadCount).toBe(1);
+    expect(body.publishedHeadCount).toBe(0);
+    await seedDraft("d-loop-approved", runId, { outcome: "approved" });
+    const mixed = await worker.fetch(
+      signed(token, "/api/admin/loop"),
+      realEnv()
+    );
+    const mixedBody = (await mixed.json()) as {
+      pendingHeadCount: number | null;
+      publishedHeadCount: number | null;
+    };
+    expect(mixedBody.pendingHeadCount).toBe(1);
+    expect(mixedBody.publishedHeadCount).toBe(1);
     const publishedId = "run-20990102-0aa2";
     await seedAwaiting(
       publishedId,
@@ -3284,9 +3399,11 @@ describe("admin run reject", () => {
     const next = (await again.json()) as {
       latest: { id: string } | null;
       pendingHeadCount: number | null;
+      publishedHeadCount: number | null;
     };
     expect(next.latest?.id).toBe(publishedId);
     expect(next.pendingHeadCount).toBeNull();
+    expect(next.publishedHeadCount).toBeNull();
   });
 
   it("lets a settled rejected date through dailyRun admission and still blocks reserved cents", async () => {
diff --git a/src/shared/db/repos/draftsRepo.ts b/src/shared/db/repos/draftsRepo.ts
index 23bd358..57f0d61 100644
--- a/src/shared/db/repos/draftsRepo.ts
+++ b/src/shared/db/repos/draftsRepo.ts
@@ -510,6 +510,22 @@ export async function applyDecisionStmt(
     );
 }
 
+/** Current heads already approved or edited. Batch reject does not update them. */
+export async function countPublishedCurrentHeads(
+  db: Db,
+  runId: string
+): Promise<number> {
+  const row = await db
+    .prepare(
+      `SELECT COUNT(*) AS count FROM drafts d
+        WHERE d.run_id = ? AND d.outcome IN ('approved','edited')
+          AND ${currentHeadSql("d")}`
+    )
+    .bind(runId)
+    .first<{ count: number }>();
+  return Number(row?.count ?? 0);
+}
+
 /** Undecided chain heads for one Run. Same predicate the batch reject updates. */
 export async function countUndecidedCurrentHeads(
   db: Db,
diff --git a/src/surfaces/admin/LoopControls.tsx b/src/surfaces/admin/LoopControls.tsx
index 7c5a4a8..434516a 100644
--- a/src/surfaces/admin/LoopControls.tsx
+++ b/src/surfaces/admin/LoopControls.tsx
@@ -35,6 +35,8 @@ type LoopControlsProps = {
   latest?: RunLogItem | null;
   /** Undecided current-head count for an injected awaiting Run. */
   pendingHeadCount?: number;
+  /** Approved or edited current-head count for an injected awaiting Run. */
+  publishedHeadCount?: number;
 };
 
 type LoopView =
@@ -45,6 +47,7 @@ type LoopView =
       status: "ready";
       latest: RunLogItem | null;
       pendingHeadCount: number | null;
+      publishedHeadCount: number | null;
     };
 
 export const LOOP_TIMEOUT_NOTICE =
@@ -151,14 +154,12 @@ function isRunLogItem(value: unknown): value is RunLogItem {
   );
 }
 
-function pendingHeadCountOf(body: unknown): number | null {
-  if (
-    body === null ||
-    typeof body !== "object" ||
-    !("pendingHeadCount" in body)
-  )
-    return null;
-  const value = (body as { pendingHeadCount: unknown }).pendingHeadCount;
+function headCountOf(
+  body: unknown,
+  key: "pendingHeadCount" | "publishedHeadCount"
+): number | null {
+  if (body === null || typeof body !== "object" || !(key in body)) return null;
+  const value = (body as Record<string, unknown>)[key];
   return isNonNegativeInt(value) ? value : null;
 }
 
@@ -182,6 +183,7 @@ function errorCode(body: unknown): string | null {
 export function LoopControls({
   latest: injectedLatest,
   pendingHeadCount: injectedHeadCount,
+  publishedHeadCount: injectedPublishedCount,
   dev = false
 }: LoopControlsProps) {
   const injected = injectedLatest !== undefined;
@@ -256,7 +258,8 @@ export function LoopControls({
         setView({
           status: "ready",
           latest,
-          pendingHeadCount: pendingHeadCountOf(body)
+          pendingHeadCount: headCountOf(body, "pendingHeadCount"),
+          publishedHeadCount: headCountOf(body, "publishedHeadCount")
         });
         // A poll that timed out earlier is no longer stale; other notices
         // (run trigger outcomes) stay until the next trigger clears them.
@@ -503,17 +506,27 @@ export function LoopControls({
           ? body.rejectedCount
           : null;
       setRejectRunId(null);
+      const terminalStatus =
+        body &&
+        typeof body === "object" &&
+        "status" in body &&
+        (body.status === "published" || body.status === "rejected")
+          ? body.status
+          : "rejected";
       setNotice(
         rejectedCount === null
           ? `Run ${runId} rejected.`
-          : `Run ${runId} rejected. ${rejectedCount} drafts were rejected.`
+          : terminalStatus === "published"
+            ? `Run ${runId} published. ${rejectedCount} drafts were rejected.`
+            : `Run ${runId} rejected. ${rejectedCount} drafts were rejected.`
       );
       setView((current) =>
         current.status === "ready" && current.latest?.id === runId
           ? {
               ...current,
-              latest: { ...current.latest, status: "rejected" },
-              pendingHeadCount: null
+              latest: { ...current.latest, status: terminalStatus },
+              pendingHeadCount: null,
+              publishedHeadCount: null
             }
           : current
       );
@@ -580,6 +593,11 @@ export function LoopControls({
     : view.status === "ready"
       ? view.pendingHeadCount
       : null;
+  const publishedHeadCount = injected
+    ? (injectedPublishedCount ?? null)
+    : view.status === "ready"
+      ? view.publishedHeadCount
+      : null;
 
   return (
     <div className="loop-workspace">
@@ -614,8 +632,9 @@ export function LoopControls({
             rejectRunId === latest.id ? (
               <div className="rejectbox">
                 <p>
-                  Reject {pendingHeadCount} undecided drafts in {latest.id}?
-                  Nothing will be published.
+                  Reject {pendingHeadCount} undecided drafts in {latest.id}?{" "}
+                  {publishedHeadCount ?? 0} approved or edited drafts stay
+                  published.
                 </p>
                 <button
                   type="button"
diff --git a/src/surfaces/admin/loopControls.mount.test.tsx b/src/surfaces/admin/loopControls.mount.test.tsx
index d9ee3c4..a9d7d68 100644
--- a/src/surfaces/admin/loopControls.mount.test.tsx
+++ b/src/surfaces/admin/loopControls.mount.test.tsx
@@ -687,6 +687,7 @@ describe("tab-local request recovery and confirmation", () => {
             approvalOutcome: null
           }),
           pendingHeadCount: 4,
+          publishedHeadCount: 1,
           dispatches: []
         });
       }
@@ -706,7 +707,9 @@ describe("tab-local request recovery and confirmation", () => {
     expect(document.body.textContent).toContain(
       "Reject 4 undecided drafts in run-20261111-0000?"
     );
-    expect(document.body.textContent).toContain("Nothing will be published.");
+    expect(document.body.textContent).toContain(
+      "1 approved or edited drafts stay published."
+    );
     fireEvent.click(screen.getByRole("button", { name: "Reject 4 drafts" }));
     await act(async () => {});
     const post = fetchMock.mock.calls.find((call) =>
@@ -848,4 +851,60 @@ describe("tab-local request recovery and confirmation", () => {
     gate.release?.();
     await act(async () => {});
   });
+
+  it("shows a published run after rejecting the remaining undecided drafts", async () => {
+    const gate: { release: (() => void) | null } = { release: null };
+    let posted = false;
+    vi.stubGlobal(
+      "fetch",
+      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
+        const url = String(input);
+        if (url.includes("/reject") && init?.method === "POST") {
+          posted = true;
+          return scripted({
+            runId: "run-20261111-0000",
+            status: "published",
+            rejectedCount: 3
+          });
+        }
+        if (posted) {
+          await new Promise<void>((resolve) => {
+            gate.release = resolve;
+          });
+        }
+        return scripted({
+          latest: item({
+            status: "awaiting",
+            completedAt: null,
+            approvalOutcome: null
+          }),
+          pendingHeadCount: 3,
+          publishedHeadCount: 1,
+          dispatches: []
+        });
+      })
+    );
+    render(<LoopControls />);
+    await act(async () => {});
+    fireEvent.click(screen.getByRole("button", { name: "Reject this run" }));
+    expect(document.body.textContent).toContain(
+      "Reject 3 undecided drafts in run-20261111-0000?"
+    );
+    expect(document.body.textContent).toContain(
+      "1 approved or edited drafts stay published."
+    );
+    fireEvent.click(screen.getByRole("button", { name: "Reject 3 drafts" }));
+    await act(async () => {
+      await Promise.resolve();
+    });
+    expect(document.body.textContent).toContain(
+      "Run run-20261111-0000 published. 3 drafts were rejected."
+    );
+    expect(document.body.textContent).toContain("published");
+    expect(
+      screen.queryByRole("button", { name: "Reject this run" })
+    ).toBeNull();
+    gate.release?.();
+    await act(async () => {});
+  });
 });
```

Do not invoke any skill, and do not spawn subagents of your own — you are the reviewer. If the instruction file is unreadable, report that exact failure and stop. Return your findings as text in your final message; do not route them through any findings-reporting tool the host may offer.
