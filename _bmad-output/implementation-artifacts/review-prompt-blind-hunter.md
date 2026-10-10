Conduct a review of CONTENT.
Look for what's missing, not only what's wrong.
Compute your finding floor N from the diff file's size: N = min(floor(sqrt(kB) + 1), 10), where kB is the file's size in kilobytes. State the arithmetic in one line, then find at least N issues to fix or improve.
Output a Markdown list of findings only — no severity, priority, or ranking.
If the content is empty, stop and say so.
If you have zero findings, re-check and keep thinking; do not stop with an empty list.

CONTENT: the unified diff at 
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

Do not invoke any skill, and do not spawn subagents of your own — you are the reviewer. Return your findings as text in your final message; do not route them through any findings-reporting tool the host may offer.
