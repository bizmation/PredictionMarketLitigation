Read 
===== BEGIN FILE: /workspace/_bmad/render/bmad-build/workspace-c52ddf65534b/4c7848a4aa9397e73300/review-prompts/edge-case-hunter.md =====
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
===== END FILE: /workspace/_bmad/render/bmad-build/workspace-c52ddf65534b/4c7848a4aa9397e73300/review-prompts/edge-case-hunter.md =====
 completely and follow it as your review instructions.

claims_file (leave unread until your instructions call for it): 
===== BEGIN FILE: /workspace/_bmad-output/implementation-artifacts/spec-courtlistener-request-timeout-retry.md =====
---
title: 'Retry a CourtListener request timeout and narrow the docket window'
type: 'bugfix'
created: '2026-10-10'
status: 'in-review'
route: 'dispatch'
baseline_commit: '16b6153b19fbfe91a88c733c55e9ea42d9f8afec'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Staging Run `run-20261010-0002` failed about 192s in because the CourtListener request for docket `73242633` hit the 12s per-request limit. That timeout fails the whole source, so zero drafts become Run `failed`. The 3.38 budgets did not fire, and Observability had no log.

**Approach:** Retry that timeout through `pace`, record it in evidence and one structured log, and give CourtListener its own 20s request timeout. Add `date_filed__gte` only at the baseline date pagination already stops on.

## Boundaries & Constraints

**Always:** Retry a `TimeoutError` through `pace(0)` up to 3 attempts. Pace keeps 15s start spacing, the 6-minute wait budget, and the 8-minute poll deadline. An exhausted timeout with no 429 on that request is `source.skipped` `reason: "timeout"` with no `status`. The skip and one console object include kind `docket-entries`, docket, elapsed ms, `timeoutMs`, and attempt. The CourtListener request timeout is 20000 and is the poll margin. The shared fetch timeout stays 12000. Set `date_filed__gte` to the baseline date `fetchEntries` already uses (`oldest >= baseline`; keep `date >= baseline`), taken from `MAX(occurred_at)` or `sources.published_at`. No new checkpoint and no shifted date. A null baseline sends no filter. Follow `next` and the 5-page cap.

**Never:** Deferred, do not build: skip unchanged dockets via `date_modified`; CourtListener webhooks or alerts; paid docket providers. If `date_filed__gte` would need new stored state or a cutoff other than that baseline, omit it and leave query narrowing deferred. Do not deploy, trigger a Run, or change Cloudflare. Do not change 3.36 (`in-progress`) or 3.37 (`backlog`). Do not split `run-daily-step`, add Queues, or redraft because a fetch retried. Do not log the API token. 401, 403, 5xx, network, unsafe URL, and redirect stay fail-on-first.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Recovered timeout | Attempt 1 times out; attempt 2 is 200 | One Draft set; log for attempt 1; docket summary lists it | N/A |
| Three timeouts | No 429 on that URL | Skip `timeout`, `attempt: 3`, `timeoutMs: 20000`, docket, elapsed ms, no `status`; Run `failed` | Log each attempt |
| Prior 429, then this URL times out 3 times | A 429 already happened on another request | This skip stays `timeout` | 429 path unchanged |
| Retry wait misses deadline or budget | Pace cannot fit the next wait | Existing stop; `http_429` only after a real 429 | No extra request |
| Boundary dates | Baseline date D already in D1 | URL cutoff is D; entries filed on D and the next day are drafted | The day before D stays undrafted |
| No baseline | No event date and no `published_at` | No `date_filed__gte` | Client date check remains |

</frozen-after-approval>

## Code Map

- `src/pipeline/connectors/courtListener.ts` — Change `defaultFetch`, the `TimeoutError` branch, the pace margin, and `entriesUrl`. Reuse `pace`, the 3-attempt cap, and `next` validation. Do not change 429 backoff. `timeout` is source-level today.
- `src/pipeline/connectors/courtListener.test.ts` — Update the 12s hang test, the deadline-margin tests, the 71s five-docket test (`4 * 15s + 11s`), and the `entriesUrl` assertion. `stubFetch` already routes on `docket`.
- `src/pipeline/connectors/connector.ts` — `observe` already copies skip detail. No edit.
- `src/shared/lib/timeouts.ts` — Comment only. `SOURCE_FETCH_TIMEOUT_MS` stays 12000.
- `src/pipeline/workflow/dailyRunSteps.ts` — Do not change `finishFailed`. Detail stays on `source.skipped`.
- `src/server.ts` — Workers Logs indexes one object argument.

## Tasks & Acceptance

**Execution:**
- [x] `src/pipeline/connectors/courtListener.ts` -- Add the 20s timeout, retry through `pace(0)`, log and record each attempt, and set `date_filed__gte` to the existing baseline only. -- Fixes the incident.
- [x] `src/shared/lib/timeouts.ts` -- Note the CourtListener timeout in the comment. Do not change the shared constant. -- Other sources stay on 12s.
- [x] `src/pipeline/connectors/courtListener.test.ts` -- Cover the matrix, the 20s margin, the 95s finish, and the boundary-date regression. -- Locks the edges.

**Acceptance Criteria:**
- Given a CourtListener timeout and no 429 on that request, when an attempt remains, then the next try goes through `pace` and still obeys 15s spacing, the wait budget, and the poll deadline.
- Given three timeouts and no 429, when the source is skipped, then the payload is `reason: "timeout"` with kind `docket-entries`, docket, elapsed ms, `timeoutMs` 20000, and attempt 3, and it has no `status`.
- Given a timed-out attempt, when it fails, then one console object carries those fields and not the token.
- Given baseline date D, when that docket is polled, then `date_filed__gte` is D, an entry filed on D is drafted, and an entry filed the next day is drafted.
- Given five fetches of `COURTLISTENER_FETCH_TIMEOUT_MS - 1s`, when the poll finishes, then elapsed time is 95s, above 60s and below 8 minutes.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

The shared 12s cap protects a 60s deadline CourtListener no longer uses, so its cap is 20s and the pace margin matches it. A 19s fetch exceeds the 15s gap, so five fetches finish at 95s.

`date_filed__gte` is inclusive (v4 `field__lookup`; docket-entries `date_filed` lists `gte`). The cutoff is that baseline string, not a new last-checked value. `occurred_at` and `sources.published_at` are already `YYYY-MM-DD`.

## Verification

**Commands:**
- `npm run check` -- expected: exit 0
- `npm test` -- expected: exit 0
===== END FILE: /workspace/_bmad-output/implementation-artifacts/spec-courtlistener-request-timeout-retry.md =====


Review content: the unified diff at 
===== BEGIN FILE: /tmp/courtlistener-timeout-diff-mPclvq.diff =====
diff --git a/_bmad-output/implementation-artifacts/spec-courtlistener-request-timeout-retry.md b/_bmad-output/implementation-artifacts/spec-courtlistener-request-timeout-retry.md
index 9f3dae0..f40397a 100644
--- a/_bmad-output/implementation-artifacts/spec-courtlistener-request-timeout-retry.md
+++ b/_bmad-output/implementation-artifacts/spec-courtlistener-request-timeout-retry.md
@@ -2,8 +2,9 @@
 title: 'Retry a CourtListener request timeout and narrow the docket window'
 type: 'bugfix'
 created: '2026-10-10'
-status: 'draft'
+status: 'in-review'
 route: 'dispatch'
+baseline_commit: '16b6153b19fbfe91a88c733c55e9ea42d9f8afec'
 review_loop_iteration: 0
 context:
   - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
@@ -48,9 +49,9 @@ context:
 ## Tasks & Acceptance
 
 **Execution:**
-- [ ] `src/pipeline/connectors/courtListener.ts` -- Add the 20s timeout, retry through `pace(0)`, log and record each attempt, and set `date_filed__gte` to the existing baseline only. -- Fixes the incident.
-- [ ] `src/shared/lib/timeouts.ts` -- Note the CourtListener timeout in the comment. Do not change the shared constant. -- Other sources stay on 12s.
-- [ ] `src/pipeline/connectors/courtListener.test.ts` -- Cover the matrix, the 20s margin, the 95s finish, and the boundary-date regression. -- Locks the edges.
+- [x] `src/pipeline/connectors/courtListener.ts` -- Add the 20s timeout, retry through `pace(0)`, log and record each attempt, and set `date_filed__gte` to the existing baseline only. -- Fixes the incident.
+- [x] `src/shared/lib/timeouts.ts` -- Note the CourtListener timeout in the comment. Do not change the shared constant. -- Other sources stay on 12s.
+- [x] `src/pipeline/connectors/courtListener.test.ts` -- Cover the matrix, the 20s margin, the 95s finish, and the boundary-date regression. -- Locks the edges.
 
 **Acceptance Criteria:**
 - Given a CourtListener timeout and no 429 on that request, when an attempt remains, then the next try goes through `pace` and still obeys 15s spacing, the wait budget, and the poll deadline.
diff --git a/src/pipeline/connectors/courtListener.test.ts b/src/pipeline/connectors/courtListener.test.ts
index 4247b68..0592d6e 100644
--- a/src/pipeline/connectors/courtListener.test.ts
+++ b/src/pipeline/connectors/courtListener.test.ts
@@ -12,6 +12,7 @@ import { completeDailyStep } from "../workflow/dailyRunSteps";
 import { runConnector } from "./connector";
 import {
   COURTLISTENER_DEFAULT_BACKOFF_MS,
+  COURTLISTENER_FETCH_TIMEOUT_MS,
   COURTLISTENER_MAX_ATTEMPTS,
   COURTLISTENER_MAX_BACKOFF_MS,
   COURTLISTENER_MAX_PAGES,
@@ -184,6 +185,19 @@ describe("CourtListener helpers", () => {
       order_by: "-date_filed",
       fields: "id,entry_number,date_filed,description"
     });
+    expect(
+      Object.fromEntries(
+        new URL(entriesUrl("73375343", "2026-05-21")).searchParams
+      )
+    ).toEqual({
+      docket: "73375343",
+      order_by: "-date_filed",
+      fields: "id,entry_number,date_filed,description",
+      date_filed__gte: "2026-05-21"
+    });
+    expect(entriesUrl("73375343", "not-a-date")).toBe(entriesUrl("73375343"));
+    expect(SOURCE_FETCH_TIMEOUT_MS).toBe(12_000);
+    expect(COURTLISTENER_FETCH_TIMEOUT_MS).toBe(20_000);
     expect(reasonForStatus(401)).toBe("http_401");
     expect(reasonForStatus(403)).toBe("http_403");
     expect(reasonForStatus(429)).toBe("http_429");
@@ -314,23 +328,263 @@ describe("CourtListener connector (story 3.21)", () => {
   });
 
   it("times out a hung request at the per-request deadline and skips the source as timeout", async () => {
+    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
     stubFetch((docketId) =>
       docketId === FURCOLO ? { hang: true } : { status: 200 }
     );
     const runId = await newRun();
     vi.useFakeTimers();
     const pending = runConnector(testEnv.DB, runId, SOURCE, check());
-    await vi.advanceTimersByTimeAsync(SOURCE_FETCH_TIMEOUT_MS);
+    await vi.advanceTimersByTimeAsync(COURTLISTENER_FETCH_TIMEOUT_MS * 3);
     const result = await pending;
     expect(vi.getTimerCount()).toBe(0);
     vi.useRealTimers();
     expect(result).toEqual({ draftCount: 0, failed: true });
-    expect(await skippedReason(runId)).toMatchObject({
+    const skipped = await skippedReason(runId);
+    expect(skipped).toMatchObject({
       reason: "timeout",
-      docketId: FURCOLO
+      docketId: FURCOLO,
+      requestKind: "docket-entries",
+      timeoutMs: COURTLISTENER_FETCH_TIMEOUT_MS,
+      attempt: COURTLISTENER_MAX_ATTEMPTS,
+      elapsedMs: COURTLISTENER_FETCH_TIMEOUT_MS
+    });
+    expect(skipped).not.toHaveProperty("status");
+    expect(warn).toHaveBeenCalledTimes(COURTLISTENER_MAX_ATTEMPTS);
+    expect(JSON.stringify(warn.mock.calls)).not.toContain(TOKEN);
+    warn.mockRestore();
+    await completeDailyStep(testEnv.DB, runId, {
+      draftCount: result.draftCount,
+      anyFailure: result.failed
+    });
+    expect(
+      (await evidenceRepo.listByRun(testEnv.DB, runId)).some(
+        (event) =>
+          event.event === "run.failed" &&
+          (event.payload as { reason?: string }).reason === "error"
+      )
+    ).toBe(true);
+  });
+
+  it("retries a timeout through pace and keeps a recovered entry", async () => {
+    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
+    const waits: number[] = [];
+    let clock = 0;
+    let timeouts = 0;
+    const fetchImpl = vi.fn(async (input: string) => {
+      const docketId = new URL(input).searchParams.get("docket");
+      if (docketId === FURCOLO && timeouts === 0) {
+        timeouts += 1;
+        throw new DOMException("timed out", "TimeoutError");
+      }
+      return {
+        status: 200,
+        ok: true,
+        headers: new Headers(),
+        json: async () => ({
+          results:
+            docketId === FURCOLO
+              ? [
+                  {
+                    id: 88001,
+                    entry_number: 1,
+                    date_filed: "2026-09-18",
+                    description: "Recovered after timeout."
+                  }
+                ]
+              : []
+        }),
+        text: async () => ""
+      };
+    });
+    const runId = await newRun();
+    const result = await runConnector(
+      testEnv.DB,
+      runId,
+      SOURCE,
+      check(TOKEN, {
+        fetchImpl,
+        nowMs: () => clock,
+        wait: async (ms) => {
+          waits.push(ms);
+          clock += ms;
+        }
+      })
+    );
+    expect(result).toEqual({ draftCount: 1, failed: false });
+    expect(waits.at(-1)).toBe(COURTLISTENER_MIN_INTERVAL_MS);
+    expect(timeouts).toBe(1);
+    expect(warn).toHaveBeenCalledTimes(1);
+    expect(warn.mock.calls[0]?.[0]).toMatchObject({
+      event: "courtlistener_request_timeout",
+      requestKind: "docket-entries",
+      docketId: FURCOLO,
+      timeoutMs: COURTLISTENER_FETCH_TIMEOUT_MS,
+      attempt: 1
+    });
+    expect(JSON.stringify(warn.mock.calls)).not.toContain(TOKEN);
+    warn.mockRestore();
+    expect(docketSummary(await fetchedPayload(runId), FURCOLO)).toMatchObject({
+      timeouts: [
+        {
+          requestKind: "docket-entries",
+          docketId: FURCOLO,
+          timeoutMs: COURTLISTENER_FETCH_TIMEOUT_MS,
+          attempt: 1
+        }
+      ]
     });
   });
 
+  it("spaces timeout retries and does not report them as http_429", async () => {
+    const waits: number[] = [];
+    let clock = 0;
+    let fetches = 0;
+    const runId = await newRun();
+    const result = await runConnector(
+      testEnv.DB,
+      runId,
+      SOURCE,
+      check(TOKEN, {
+        fetchImpl: async () => {
+          fetches += 1;
+          throw new DOMException("timed out", "TimeoutError");
+        },
+        nowMs: () => clock,
+        wait: async (ms) => {
+          waits.push(ms);
+          clock += ms;
+        }
+      })
+    );
+    expect(result).toEqual({ draftCount: 0, failed: true });
+    expect(fetches).toBe(COURTLISTENER_MAX_ATTEMPTS);
+    expect(waits).toEqual([
+      COURTLISTENER_MIN_INTERVAL_MS,
+      COURTLISTENER_MIN_INTERVAL_MS
+    ]);
+    const skipped = await skippedReason(runId);
+    expect(skipped).toMatchObject({
+      reason: "timeout",
+      attempt: 3,
+      timeoutMs: COURTLISTENER_FETCH_TIMEOUT_MS
+    });
+    expect(skipped).not.toHaveProperty("status");
+    expect(skipped?.reason).not.toBe("http_429");
+  });
+
+  it("keeps a later timeout as timeout after another docket recovered from 429", async () => {
+    let illinois = 0;
+    stubFetch((docketId) => {
+      if (docketId === ILLINOIS) {
+        illinois += 1;
+        if (illinois === 1) {
+          return {
+            status: 429,
+            headers: { "retry-after": "1" },
+            body: { detail: "Rate limit exceeded: 5/min." }
+          };
+        }
+        return { status: 200, body: { results: [] } };
+      }
+      if (docketId === "72237443") return { hang: true };
+      return { status: 200, body: { results: [] } };
+    });
+    const runId = await newRun();
+    vi.useFakeTimers();
+    const pending = runConnector(testEnv.DB, runId, SOURCE, check());
+    await vi.advanceTimersByTimeAsync(COURTLISTENER_FETCH_TIMEOUT_MS * 3);
+    const result = await pending;
+    vi.useRealTimers();
+    expect(result).toEqual({ draftCount: 0, failed: true });
+    const skipped = await skippedReason(runId);
+    expect(skipped).toMatchObject({
+      reason: "timeout",
+      docketId: "72237443",
+      attempt: 3
+    });
+    expect(skipped).not.toHaveProperty("status");
+  });
+
+  it("drafts entries on the baseline date and the next day, and not the day before", async () => {
+    const baseline = FURCOLO_TRACKED_SINCE;
+    const dayBefore = "2026-05-20";
+    const nextDay = "2026-05-22";
+    const calls = stubFetch((docketId) =>
+      docketId === FURCOLO
+        ? {
+            status: 200,
+            body: {
+              results: [
+                {
+                  id: 88101,
+                  entry_number: 1,
+                  date_filed: dayBefore,
+                  description: "Day before the baseline."
+                },
+                {
+                  id: 88102,
+                  entry_number: 2,
+                  date_filed: baseline,
+                  description: "Filed on the baseline."
+                },
+                {
+                  id: 88103,
+                  entry_number: 3,
+                  date_filed: nextDay,
+                  description: "Filed the next day."
+                }
+              ]
+            }
+          }
+        : { status: 200, body: { results: [] } }
+    );
+    const runId = await newRun();
+    const result = await runConnector(testEnv.DB, runId, SOURCE, check());
+    expect(result.failed).toBe(false);
+    const furcolo = calls.find(
+      ({ url }) => new URL(url).searchParams.get("docket") === FURCOLO
+    );
+    expect(new URL(furcolo!.url).searchParams.get("date_filed__gte")).toBe(
+      baseline
+    );
+    const dates = (await draftsRepo.listByRun(testEnv.DB, runId)).map(
+      (draft) => (draft.diff as { occurredAt?: string }).occurredAt
+    );
+    expect(dates).toEqual(expect.arrayContaining([baseline, nextDay]));
+    expect(dates).not.toContain(dayBefore);
+  });
+
+  it("omits date_filed__gte when the docket has no baseline", async () => {
+    await testEnv.DB.prepare(
+      "UPDATE sources SET published_at = NULL WHERE id = 'src-case-ri-docket'"
+    ).run();
+    try {
+      const calls = stubFetch(() => ({
+        status: 200,
+        body: { results: [] }
+      }));
+      const runId = await newRun();
+      expect(await runConnector(testEnv.DB, runId, SOURCE, check())).toEqual({
+        draftCount: 0,
+        failed: false
+      });
+      const furcolo = calls.find(
+        ({ url }) => new URL(url).searchParams.get("docket") === FURCOLO
+      );
+      expect(furcolo).toBeDefined();
+      expect(new URL(furcolo!.url).searchParams.has("date_filed__gte")).toBe(
+        false
+      );
+    } finally {
+      await testEnv.DB.prepare(
+        "UPDATE sources SET published_at = ? WHERE id = 'src-case-ri-docket'"
+      )
+        .bind(FURCOLO_TRACKED_SINCE)
+        .run();
+    }
+  });
+
   it("isolates a dead docket (404 / malformed JSON / missing results) and still drafts the healthy ones", async () => {
     const calls = stubFetch((docketId) => {
       if (docketId === ILLINOIS) return { status: 404 };
@@ -757,11 +1011,11 @@ describe("CourtListener connector (story 3.21)", () => {
       )
     ]);
     try {
-      // Pacing is measured from request start. An 11 s fetch leaves a 4 s
-      // gap, so five starts finish at 71 s: past the generic 60 s deadline
-      // and inside the 8-minute CourtListener poll.
-      const SLOW_MS = SOURCE_FETCH_TIMEOUT_MS - 1_000;
-      const finishMs = 4 * COURTLISTENER_MIN_INTERVAL_MS + SLOW_MS;
+      // Pacing is measured from request start. A 19 s fetch is longer than
+      // the 15 s gap, so five serial fetches finish at 95 s: past the
+      // generic 60 s deadline and inside the 8-minute CourtListener poll.
+      const SLOW_MS = COURTLISTENER_FETCH_TIMEOUT_MS - 1_000;
+      const finishMs = 5 * SLOW_MS;
       expect(finishMs).toBeGreaterThan(CONNECTOR_TIMEOUT_MS);
       expect(finishMs).toBeLessThan(COURTLISTENER_POLL_TIMEOUT_MS);
       vi.stubGlobal(
@@ -928,7 +1182,11 @@ describe("CourtListener credential boundary (story 3.27)", () => {
     expect(
       calls.every(
         ({ url }) =>
-          url === entriesUrl(new URL(url).searchParams.get("docket")!)
+          url ===
+          entriesUrl(
+            new URL(url).searchParams.get("docket")!,
+            new URL(url).searchParams.get("date_filed__gte")
+          )
       )
     ).toBe(true);
     const payload = await fetchedPayload(runId);
@@ -973,7 +1231,18 @@ describe("CourtListener credential boundary (story 3.27)", () => {
           ({ url }) => new URL(url).searchParams.get("docket") === FURCOLO
         )
         .map(({ url }) => url)
-    ).toEqual([entriesUrl(FURCOLO), secondUrl, thirdUrl]);
+    ).toEqual([
+      entriesUrl(
+        FURCOLO,
+        new URL(
+          calls.find(
+            ({ url }) => new URL(url).searchParams.get("docket") === FURCOLO
+          )!.url
+        ).searchParams.get("date_filed__gte")
+      ),
+      secondUrl,
+      thirdUrl
+    ]);
   });
 
   it("does not report an all-docket unsafe pagination response as an empty success", async () => {
@@ -1697,14 +1966,15 @@ describe("CourtListener rate limit (story 3.38)", () => {
     expect(skipped).not.toHaveProperty("status");
     expect(timeLeft).toBeGreaterThanOrEqual(COURTLISTENER_MIN_INTERVAL_MS);
     expect(timeLeft).toBeLessThan(
-      COURTLISTENER_MIN_INTERVAL_MS + SOURCE_FETCH_TIMEOUT_MS
+      COURTLISTENER_MIN_INTERVAL_MS + COURTLISTENER_FETCH_TIMEOUT_MS
     );
   });
 
   it("still fetches when the wait plus one request just fits the poll deadline", async () => {
     const waits: number[] = [];
     let clock = 0;
-    const timeLeft = COURTLISTENER_MIN_INTERVAL_MS + SOURCE_FETCH_TIMEOUT_MS;
+    const timeLeft =
+      COURTLISTENER_MIN_INTERVAL_MS + COURTLISTENER_FETCH_TIMEOUT_MS;
     const calls = stubFetch(() => ({ status: 200, body: { results: [] } }));
     const runId = await newRun();
     expect(
@@ -1732,7 +2002,8 @@ describe("CourtListener rate limit (story 3.38)", () => {
   it("stops a zero-wait request when one fetch would miss the poll deadline", async () => {
     let clock = 0;
     const calls = stubFetch(() => {
-      clock = COURTLISTENER_POLL_TIMEOUT_MS - SOURCE_FETCH_TIMEOUT_MS + 1_000;
+      clock =
+        COURTLISTENER_POLL_TIMEOUT_MS - COURTLISTENER_FETCH_TIMEOUT_MS + 1_000;
       return { status: 200, body: { results: [] } };
     });
     const runId = await newRun();
@@ -1767,7 +2038,8 @@ describe("CourtListener rate limit (story 3.38)", () => {
           body: { detail: "Rate limit exceeded: 5/min." }
         };
       }
-      clock = COURTLISTENER_POLL_TIMEOUT_MS - SOURCE_FETCH_TIMEOUT_MS + 1_000;
+      clock =
+        COURTLISTENER_POLL_TIMEOUT_MS - COURTLISTENER_FETCH_TIMEOUT_MS + 1_000;
       return { status: 200, body: { results: [] } };
     });
     const runId = await newRun();
diff --git a/src/pipeline/connectors/courtListener.ts b/src/pipeline/connectors/courtListener.ts
index e0d5a8e..cfba65b 100644
--- a/src/pipeline/connectors/courtListener.ts
+++ b/src/pipeline/connectors/courtListener.ts
@@ -4,8 +4,7 @@ import type { Db } from "../../shared/db/client";
 import {
   fetchWithTimeout,
   isAbortError,
-  isTimeoutError,
-  SOURCE_FETCH_TIMEOUT_MS
+  isTimeoutError
 } from "../../shared/lib/timeouts";
 import { IsoDateSchema } from "../../shared/schemas/common";
 import {
@@ -30,9 +29,11 @@ import {
  * An isolated 4xx or malformed body stays on that docket. When every polled
  * docket errors, the summary is still `source.fetched` and the connector
  * returns `failed: true` (story 3.23).
- * Story 3.38 paces request starts and retries HTTP 429 only. Other failures
- * still fail on the first response. An exhausted 429 is still source-level
- * `http_429`. A wait that will not fit, when no 429 was received, is
+ * Story 3.38 paces request starts and retries HTTP 429 only. A per-request
+ * timeout retries through that same pace clock. Other failures still fail
+ * on the first response. An exhausted 429 is still source-level `http_429`.
+ * An exhausted timeout that saw no 429 is source-level `timeout` with no
+ * status. A wait that will not fit, when no 429 was received, is
  * source-level `timeout` with no status. Newness is decided against
  * `docket_events` and prior Drafts, and the Draft id embeds the
  * CourtListener entry id so a re-Run is idempotent.
@@ -67,12 +68,22 @@ export function entryUrl(docketUrl: string, entryNumber: number | null) {
 
 // v4 rejects the legacy `limit` filter. Follow its pagination links; the
 // connector enforces COURTLISTENER_MAX_PAGES independently of server page size.
-export function entriesUrl(docketId: string): string {
+export function entriesUrl(
+  docketId: string,
+  filedOnOrAfter?: string | null
+): string {
   const params = new URLSearchParams({
     docket: docketId,
     order_by: "-date_filed",
     fields: COURTLISTENER_FIELDS
   });
+  // Same inclusive baseline `fetchEntries` already stops on. Never shift it.
+  if (
+    filedOnOrAfter != null &&
+    IsoDateSchema.safeParse(filedOnOrAfter).success
+  ) {
+    params.set("date_filed__gte", filedOnOrAfter);
+  }
   return `${COURTLISTENER_API_BASE}?${params.toString()}`;
 }
 
@@ -173,6 +184,12 @@ export type FetchImpl = (
   init: RequestInit
 ) => Promise<Pick<Response, "status" | "ok" | "json" | "text" | "headers">>;
 
+/**
+ * One CourtListener HTTP request. Above the shared 12s cap because this
+ * poll no longer has to fit inside the 60s connector deadline, and below
+ * the 8-minute poll. Also the pace safety margin.
+ */
+export const COURTLISTENER_FETCH_TIMEOUT_MS = 20_000;
 /** Four starts per minute, under CourtListener's about-5-per-minute limit. */
 export const COURTLISTENER_MIN_INTERVAL_MS = 15_000;
 /** One initial request plus two retries. */
@@ -254,7 +271,7 @@ const defaultWait: CourtListenerWait = (ms, signal) => {
 };
 
 const defaultFetch: FetchImpl = (input, init) =>
-  fetchWithTimeout(input, init, SOURCE_FETCH_TIMEOUT_MS);
+  fetchWithTimeout(input, init, COURTLISTENER_FETCH_TIMEOUT_MS);
 
 async function readSourceState<T>(read: () => Promise<T>): Promise<T> {
   try {
@@ -349,18 +366,28 @@ const SOURCE_LEVEL_REASONS = new Set([
   "timeout"
 ]);
 
+export type RequestTimeout = {
+  requestKind: "docket-entries";
+  docketId: string;
+  elapsedMs: number;
+  timeoutMs: number;
+  attempt: number;
+};
+
 /** A docket that failed in isolation — recorded in the summary, not fatal. */
 class DocketError extends Error {
   readonly reason: string;
   readonly status: number | undefined;
   readonly detail: string | undefined;
   readonly attempts: number | undefined;
+  readonly timeoutFact: RequestTimeout | undefined;
 
   constructor(
     reason: string,
     status?: number,
     detail?: string,
-    attempts?: number
+    attempts?: number,
+    timeoutFact?: RequestTimeout
   ) {
     super(`docket ${reason}`);
     this.name = "DocketError";
@@ -368,6 +395,7 @@ class DocketError extends Error {
     this.status = status;
     this.detail = detail;
     this.attempts = attempts;
+    this.timeoutFact = timeoutFact;
   }
 }
 
@@ -417,19 +445,36 @@ async function responseDetail(
   }
 }
 
+function logRequestTimeout(fact: RequestTimeout): void {
+  console.warn({
+    event: "courtlistener_request_timeout",
+    requestKind: fact.requestKind,
+    docketId: fact.docketId,
+    elapsedMs: fact.elapsedMs,
+    timeoutMs: fact.timeoutMs,
+    attempt: fact.attempt
+  });
+}
+
 async function fetchPage(
   fetchImpl: FetchImpl,
   token: string,
   input: string,
+  docketId: string,
   pace: Pace,
   noteStart: () => void,
   nowMs: () => number,
   noteRateLimit: () => void,
   context?: SourceCheckContext
-): Promise<{ entries: DocketEntry[]; next: string | null }> {
+): Promise<{
+  entries: DocketEntry[];
+  next: string | null;
+  timeouts: RequestTimeout[];
+}> {
   const url = validatedPageUrl(input, COURTLISTENER_API_BASE);
   const signal = context?.signal ?? new AbortController().signal;
   let backoff = 0;
+  const timeouts: RequestTimeout[] = [];
   for (let attempt = 1; attempt <= COURTLISTENER_MAX_ATTEMPTS; attempt++) {
     signal.throwIfAborted();
     await pace(backoff, signal);
@@ -438,6 +483,7 @@ async function fetchPage(
     await context?.beforeRequest();
     signal.throwIfAborted();
     noteStart();
+    const started = nowMs();
     let response: Awaited<ReturnType<FetchImpl>>;
     try {
       response = await fetchImpl(url, {
@@ -450,7 +496,21 @@ async function fetchPage(
       });
     } catch (err) {
       if (isAbortError(err) || signal.aborted) throw err;
-      throw new DocketError(isTimeoutError(err) ? "timeout" : "network");
+      if (!isTimeoutError(err)) throw new DocketError("network");
+      const fact: RequestTimeout = {
+        requestKind: "docket-entries",
+        docketId,
+        elapsedMs: Math.max(0, nowMs() - started),
+        timeoutMs: COURTLISTENER_FETCH_TIMEOUT_MS,
+        attempt
+      };
+      logRequestTimeout(fact);
+      if (attempt === COURTLISTENER_MAX_ATTEMPTS) {
+        throw new DocketError("timeout", undefined, undefined, undefined, fact);
+      }
+      timeouts.push(fact);
+      backoff = 0;
+      continue;
     }
     signal.throwIfAborted();
     // Redirects are unsupported, including same-origin ones. Do not inspect
@@ -494,7 +554,8 @@ async function fetchPage(
     // Validate even if the baseline/page cap later means this link is unused.
     return {
       entries,
-      next: next == null ? null : validatedPageUrl(next, url)
+      next: next == null ? null : validatedPageUrl(next, url),
+      timeouts
     };
   }
   throw new DocketError("http_429", 429, undefined, COURTLISTENER_MAX_ATTEMPTS);
@@ -515,9 +576,15 @@ async function fetchEntries(
   nowMs: () => number,
   noteRateLimit: () => void,
   context?: SourceCheckContext
-): Promise<{ entries: DocketEntry[]; pages: number; truncated: boolean }> {
+): Promise<{
+  entries: DocketEntry[];
+  pages: number;
+  truncated: boolean;
+  timeouts: RequestTimeout[];
+}> {
   const entries: DocketEntry[] = [];
-  let url: string | null = entriesUrl(docketId);
+  const timeouts: RequestTimeout[] = [];
+  let url: string | null = entriesUrl(docketId, baseline);
   let pages = 0;
   let truncated = false;
   while (url != null) {
@@ -529,6 +596,7 @@ async function fetchEntries(
       fetchImpl,
       token,
       url,
+      docketId,
       pace,
       noteStart,
       nowMs,
@@ -537,6 +605,7 @@ async function fetchEntries(
     );
     pages += 1;
     entries.push(...page.entries);
+    timeouts.push(...page.timeouts);
     let oldest: string | null = null;
     for (const entry of page.entries) {
       const dated = IsoDateSchema.safeParse(entry.dateFiled);
@@ -550,7 +619,7 @@ async function fetchEntries(
       (baseline == null || oldest == null || oldest >= baseline);
     url = mayHoldMore ? page.next : null;
   }
-  return { entries, pages, truncated };
+  return { entries, pages, truncated, timeouts };
 }
 
 /** The docket-page `sources.published_at` for this case: the date tracking began. */
@@ -696,7 +765,8 @@ async function pollDocket(
       truncated: fetched.truncated,
       newEntries: entities.length,
       seen: seenCount,
-      skippedIncomplete: undated
+      skippedIncomplete: undated,
+      ...(fetched.timeouts.length > 0 ? { timeouts: fetched.timeouts } : {})
     }
   };
 }
@@ -772,7 +842,7 @@ export function createCourtListenerCheck(
         COURTLISTENER_POLL_TIMEOUT_MS - (nowMs() - pollStartedAt);
       // A request with no spacing wait can still miss the poll if one fetch
       // would not fit. Check that before returning.
-      if (waitMs + SOURCE_FETCH_TIMEOUT_MS > timeLeft) {
+      if (waitMs + COURTLISTENER_FETCH_TIMEOUT_MS > timeLeft) {
         const detail = "poll deadline would not fit the next request";
         if (seenRateLimit) throw new DocketError("http_429", 429, detail);
         throw new DocketError("timeout", undefined, detail);
@@ -817,7 +887,15 @@ export function createCourtListenerCheck(
               docketId,
               ...(err.status == null ? {} : { status: err.status }),
               ...(err.detail ? { detail: err.detail } : {}),
-              ...(err.attempts == null ? {} : { attempts: err.attempts })
+              ...(err.attempts == null ? {} : { attempts: err.attempts }),
+              ...(err.timeoutFact == null
+                ? {}
+                : {
+                    requestKind: err.timeoutFact.requestKind,
+                    elapsedMs: err.timeoutFact.elapsedMs,
+                    timeoutMs: err.timeoutFact.timeoutMs,
+                    attempt: err.timeoutFact.attempt
+                  })
             });
           }
           outcomes.push({
diff --git a/src/shared/lib/timeouts.ts b/src/shared/lib/timeouts.ts
index eca5af9..b518abe 100644
--- a/src/shared/lib/timeouts.ts
+++ b/src/shared/lib/timeouts.ts
@@ -40,6 +40,8 @@ export const CONNECTOR_TIMEOUT_MS = 60_000;
  * enough that a connector polling several dockets in series still finishes
  * inside `CONNECTOR_TIMEOUT_MS`; a hung request surfaces as the connector's
  * own typed skip rather than the whole-source deadline.
+ * CourtListener does not use this cap. Its request timeout is
+ * `COURTLISTENER_FETCH_TIMEOUT_MS`, and this shared value stays 12 seconds.
  */
 export const SOURCE_FETCH_TIMEOUT_MS = 12_000;
 /** One `provider.complete` call inside `gateway.complete`. */
===== END FILE: /tmp/courtlistener-timeout-diff-mPclvq.diff =====
. Read that file — it is the content under review.

Do not invoke any skill, and do not spawn subagents of your own — you are the reviewer. If the instruction file is unreadable, report that exact failure and stop. Return your findings as text in your final message; do not route them through any findings-reporting tool the host may offer.
