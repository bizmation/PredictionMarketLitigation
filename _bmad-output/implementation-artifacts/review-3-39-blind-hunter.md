Conduct a review of CONTENT.
Look for what's missing, not only what's wrong.
Compute your finding floor N from the diff file's size: N = min(floor(sqrt(kB) + 1), 10), where kB is the file's size in kilobytes. State the arithmetic in one line, then find at least N issues to fix or improve.
Output a Markdown list of findings only — no severity, priority, or ranking.
If the content is empty, stop and say so.
If you have zero findings, re-check and keep thinking; do not stop with an empty list.

CONTENT: the unified diff at `diff --git a/_bmad-output/implementation-artifacts/spec-3-39-wire-seeded-cftc-scotus-and-legal-news-sources.md b/_bmad-output/implementation-artifacts/spec-3-39-wire-seeded-cftc-scotus-and-legal-news-sources.md
index 2b86174..a8468f5 100644
--- a/_bmad-output/implementation-artifacts/spec-3-39-wire-seeded-cftc-scotus-and-legal-news-sources.md
+++ b/_bmad-output/implementation-artifacts/spec-3-39-wire-seeded-cftc-scotus-and-legal-news-sources.md
@@ -2,8 +2,9 @@
 title: '3.39 — Wire seeded CFTC, SCOTUS, and legal-news sources'
 type: 'feature'
 created: '2026-10-22'
-status: 'draft'
+status: 'in-review'
 route: 'dispatch'
+baseline_commit: 'f234f8c3be99068b86a309cd602c45e650d91254'
 review_loop_iteration: 0
 context:
   - '{project-root}/_bmad-output/implementation-artifacts/3-39-wire-seeded-cftc-scotus-and-legal-news-sources.md'
@@ -53,12 +54,12 @@ context:
 ## Tasks & Acceptance
 
 **Execution:**
-- [ ] `src/pipeline/connectors/publicSource.ts` — one same-origin fetch and the 20-second, 1_000_000-byte, and 8192-byte caps — shared by the three checks.
-- [ ] `src/pipeline/connectors/cftcPress.ts`, `scotusDocket.ts`, `legalNewsLeads.ts` — thin factories for `https://www.cftc.gov`, `https://www.supremecourt.gov`, and `https://news.bloomberglaw.com`.
-- [ ] `src/pipeline/connectors/publicSource.test.ts` — stub `fetch` and cover the matrix rows that do not need a full Run.
-- [ ] `src/pipeline/workflow/dailyRun.ts` — register the three checks.
-- [ ] `src/pipeline/workflow/dailyRun.test.ts` — replace the CourtListener-only registry assertions and cover empty versus failed Runs, plus the token header.
-- [ ] `src/shared/lib/timeouts.ts` — comment only.
+- [x] `src/pipeline/connectors/publicSource.ts` — one same-origin fetch and the 20-second, 1_000_000-byte, and 8192-byte caps — shared by the three checks.
+- [x] `src/pipeline/connectors/cftcPress.ts`, `scotusDocket.ts`, `legalNewsLeads.ts` — thin factories for `https://www.cftc.gov`, `https://www.supremecourt.gov`, and `https://news.bloomberglaw.com`.
+- [x] `src/pipeline/connectors/publicSource.test.ts` — stub `fetch` and cover the matrix rows that do not need a full Run.
+- [x] `src/pipeline/workflow/dailyRun.ts` — register the three checks.
+- [x] `src/pipeline/workflow/dailyRun.test.ts` — replace the CourtListener-only registry assertions and cover empty versus failed Runs, plus the token header.
+- [x] `src/shared/lib/timeouts.ts` — comment only.
 
 **Acceptance Criteria:**
 - Given poll-sources version 0, when a Run packages it, then CFTC press and SCOTUS docket are Tier-1, Legal news leads is Tier-2, and none of the three records `not wired`.
diff --git a/_bmad-output/implementation-artifacts/sprint-status.yaml b/_bmad-output/implementation-artifacts/sprint-status.yaml
index 681add6..1a1c05f 100644
--- a/_bmad-output/implementation-artifacts/sprint-status.yaml
+++ b/_bmad-output/implementation-artifacts/sprint-status.yaml
@@ -36,7 +36,7 @@
 # - Source epics: _bmad-output/planning-artifacts/epics.md; 3.14–3.21 backfill tracked in 3.26.
 
 generated: 2026-08-09
-last_updated: 10-22-2026 12:55
+last_updated: 10-22-2026 13:24
 project: PML
 project_key: NOKEY
 tracking_system: file-system
@@ -115,7 +115,7 @@ development_status:
   3-38-pace-courtlistener-requests-and-recover-from-http-429: done
   3-37-prove-the-live-governed-loop-and-reassess-epic-3: done
   # Added by approved sprint-change-proposal-2026-10-11T1823Z. Checklist 6.4.
-  3-39-wire-seeded-cftc-scotus-and-legal-news-sources: ready-for-dev
+  3-39-wire-seeded-cftc-scotus-and-legal-news-sources: in-progress
   3-40-add-further-web-and-publication-sources: backlog
   # Retrospective 2026-10-11 human override: accepted-with-open-items. Machine verdict was rejected.
   epic-3-retrospective: done
diff --git a/src/pipeline/workflow/dailyRun.test.ts b/src/pipeline/workflow/dailyRun.test.ts
index a239a94..c7c8eba 100644
--- a/src/pipeline/workflow/dailyRun.test.ts
+++ b/src/pipeline/workflow/dailyRun.test.ts
@@ -36,6 +36,7 @@ import {
   timezoneOffsetMs
 } from "./schedule";
 import type { SourceCheck } from "../connectors/connector";
+import { POLL_SOURCES } from "../connectors/sources";
 
 const testEnv = env as Env;
 
@@ -622,15 +623,17 @@ describe("sourceChecksFromEnv (story 3.21)", () => {
     };
   }
 
-  it("wires exactly CourtListener; the other sources stay not wired", async () => {
+  it("registers CourtListener and the three seeded sources in poll order", async () => {
     const checks = sourceChecksFromEnv(
       { COURTLISTENER_API_TOKEN: undefined },
       testEnv.DB
     );
-    expect(Object.keys(checks)).toEqual(["CourtListener"]);
+    expect(Object.keys(checks)).toEqual(
+      POLL_SOURCES.map((source) => source.name)
+    );
   });
 
-  it("records source.skipped unconfigured for CourtListener and not wired for the rest when the token is absent", async () => {
+  it("fetches the seeded pages when the CourtListener token is absent", async () => {
     const id = "run-20260901-0e00";
     await runsRepo.insertRun(testEnv.DB, {
       id,
@@ -645,7 +648,16 @@ describe("sourceChecksFromEnv (story 3.21)", () => {
       scheduledFor: "2026-09-01"
     });
     await attachSnapshot(testEnv.DB, id);
-    const fetchMock = vi.fn();
+    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
+      const url = String(input);
+      if (url.includes("courtlistener.com")) {
+        throw new Error("CourtListener must not be fetched");
+      }
+      return new Response("<html></html>", {
+        status: 200,
+        headers: { "content-type": "text/html" }
+      });
+    });
     vi.stubGlobal("fetch", fetchMock);
     const packaged = await packageDailyRun(
       testEnv.DB,
@@ -664,22 +676,36 @@ describe("sourceChecksFromEnv (story 3.21)", () => {
       draftCount: 0,
       anyFailure: true
     });
-    expect(fetchMock).not.toHaveBeenCalled();
-    const skipped = (await evidenceRepo.listByRun(testEnv.DB, id)).filter(
-      (e) => e.event === "source.skipped"
-    );
-    const reasons = Object.fromEntries(
-      skipped.map((e) => [
-        (e.payload as { source: string }).source,
-        (e.payload as { reason: string }).reason
-      ])
-    );
-    expect(reasons).toEqual({
-      CourtListener: "unconfigured",
-      "CFTC press": "not wired",
-      "SCOTUS docket": "not wired",
-      "Legal news leads": "not wired"
-    });
+    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
+      "https://www.cftc.gov/PressRoom/PressReleases",
+      "https://www.supremecourt.gov/docket/",
+      "https://news.bloomberglaw.com/securities-law"
+    ]);
+    const evidence = await evidenceRepo.listByRun(testEnv.DB, id);
+    const skipped = evidence.filter((e) => e.event === "source.skipped");
+    expect(
+      skipped.map((e) => (e.payload as { source: string }).source)
+    ).toEqual(["CourtListener"]);
+    expect(skipped[0]?.payload).toMatchObject({ reason: "unconfigured" });
+    const fetched = evidence.filter((e) => e.event === "source.fetched");
+    expect(
+      fetched.map((e) => (e.payload as { source: string }).source)
+    ).toEqual(["CFTC press", "SCOTUS docket", "Legal news leads"]);
+    for (const event of fetched) {
+      expect(event.payload).toMatchObject({
+        itemCount: 0,
+        failed: false,
+        status: 200,
+        pollSourcesVersion: 0
+      });
+      expect(event.payload).not.toMatchObject({ reason: "not wired" });
+    }
+    expect(fetched.map((e) => (e.payload as { tier: string }).tier)).toEqual([
+      "tier1",
+      "tier1",
+      "tier2"
+    ]);
+    expect(await draftsRepo.listByRun(testEnv.DB, id)).toEqual([]);
     expect((await runsRepo.getRunById(testEnv.DB, id))?.status).toBe("failed");
   });
 
@@ -774,12 +800,223 @@ describe("sourceChecksFromEnv (story 3.21)", () => {
       newEntries: 1
     });
     expect(illinois).not.toHaveProperty("skippedOlder");
-    const authHeaders = fetchMock.mock.calls.map((call) =>
-      new Headers((call[1] as RequestInit | undefined)?.headers).get(
-        "authorization"
+    const calls = fetchMock.mock.calls.map((call) => ({
+      url: String(call[0]),
+      authorization: new Headers(
+        (call[1] as RequestInit | undefined)?.headers
+      ).get("authorization")
+    }));
+    const seeded = calls.filter(
+      (call) =>
+        call.url.startsWith("https://www.cftc.gov/") ||
+        call.url.startsWith("https://www.supremecourt.gov/") ||
+        call.url.startsWith("https://news.bloomberglaw.com/")
+    );
+    expect(seeded.map((call) => call.authorization)).toEqual([
+      null,
+      null,
+      null
+    ]);
+    expect(
+      calls
+        .filter((call) => call.url.includes("courtlistener.com"))
+        .every((call) => call.authorization === "Token tok")
+    ).toBe(true);
+    const evidenceText = JSON.stringify(
+      await evidenceRepo.listByRun(testEnv.DB, id)
+    );
+    expect(evidenceText).not.toContain("tok");
+  });
+
+  function courtListenerRows(input: RequestInfo | URL): Response {
+    const url = new URL(String(input));
+    const docket = url.searchParams.get("docket");
+    const floor = url.searchParams.get("date_filed__gte");
+    const rows = [
+      {
+        id: 33901,
+        entry_number: 3,
+        date_filed: "2026-09-20",
+        description: "MINUTE ENTRY: status conference held."
+      }
+    ].filter((row) => floor == null || row.date_filed >= floor);
+    return Response.json({
+      results: docket === "73133459" ? rows : []
+    });
+  }
+
+  async function seedRun(id: string): Promise<void> {
+    await runsRepo.insertRun(testEnv.DB, {
+      id,
+      origin: "scheduled",
+      mode: "hitl",
+      status: "running",
+      startedAt: NOW,
+      completedAt: null,
+      spendCents: 0,
+      spendCurrency: "USD",
+      budgetCents: null,
+      scheduledFor: "2026-09-01"
+    });
+    await attachSnapshot(testEnv.DB, id);
+  }
+
+  function checksWithToken() {
+    return sourceChecksFromEnv(
+      {
+        COURTLISTENER_API_TOKEN: "cl-seeded-page-token",
+        FIRST_FETCH_WINDOW_DAYS: 3,
+        courtListenerWait: async () => {},
+        now: () => "2026-09-20T16:00:00.000Z"
+      },
+      testEnv.DB
+    );
+  }
+
+  it("finishes empty when CourtListener and the seeded pages have nothing new", async () => {
+    const id = "run-20260901-0e02";
+    await seedRun(id);
+    const before = await testEnv.DB.prepare(
+      "SELECT COUNT(*) AS n FROM docket_events"
+    ).first<{ n: number }>();
+    vi.stubGlobal(
+      "fetch",
+      vi.fn(async (input: RequestInfo | URL) => {
+        const url = String(input);
+        if (url.includes("courtlistener.com")) {
+          return Response.json({ results: [] });
+        }
+        return new Response(
+          "<html>index mentions 1:26-cv-03659 and nothing else</html>",
+          { status: 200, headers: { "content-type": "text/html" } }
+        );
+      })
+    );
+    const packaged = await packageDailyRun(
+      testEnv.DB,
+      id,
+      {
+        db: testEnv.DB,
+        costPolicy: fixtureCostPolicy,
+        provider: provider(),
+        now: () => NOW
+      },
+      checksWithToken()
+    );
+    expect(packaged).toMatchObject({
+      skip: false,
+      draftCount: 0,
+      anyFailure: false
+    });
+    const fetched = (await evidenceRepo.listByRun(testEnv.DB, id)).filter(
+      (event) => event.event === "source.fetched"
+    );
+    expect(fetched).toHaveLength(4);
+    for (const event of fetched) {
+      expect(event.payload).toMatchObject({ itemCount: 0, failed: false });
+    }
+    expect(await draftsRepo.listByRun(testEnv.DB, id)).toEqual([]);
+    const after = await testEnv.DB.prepare(
+      "SELECT COUNT(*) AS n FROM docket_events"
+    ).first<{ n: number }>();
+    expect(after?.n).toBe(before?.n);
+    expect((await runsRepo.getRunById(testEnv.DB, id))?.status).toBe("empty");
+    expect(
+      JSON.stringify(await evidenceRepo.listByRun(testEnv.DB, id))
+    ).not.toContain("cl-seeded-page-token");
+  });
+
+  it("keeps CourtListener drafts when one seeded page returns 403", async () => {
+    const id = "run-20260901-0e03";
+    await seedRun(id);
+    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
+      const url = String(input);
+      if (url.startsWith("https://www.cftc.gov/")) {
+        return new Response("denied", { status: 403 });
+      }
+      if (
+        url.startsWith("https://www.supremecourt.gov/") ||
+        url.startsWith("https://news.bloomberglaw.com/")
+      ) {
+        return new Response("<html>ok</html>", { status: 200 });
+      }
+      return courtListenerRows(input);
+    });
+    vi.stubGlobal("fetch", fetchMock);
+    const packaged = await packageDailyRun(
+      testEnv.DB,
+      id,
+      {
+        db: testEnv.DB,
+        costPolicy: fixtureCostPolicy,
+        provider: provider(),
+        now: () => NOW
+      },
+      checksWithToken()
+    );
+    expect(packaged).toMatchObject({ draftCount: 1, anyFailure: true });
+    const drafts = await draftsRepo.listByRun(testEnv.DB, id);
+    expect(drafts).toHaveLength(1);
+    expect(drafts[0]).toMatchObject({
+      targetEntityType: "docket_events",
+      targetEntityId: "de-case-il-cftc-33901"
+    });
+    const evidence = await evidenceRepo.listByRun(testEnv.DB, id);
+    const cftc = evidence.find(
+      (event) =>
+        event.event === "source.skipped" &&
+        (event.payload as { source?: string }).source === "CFTC press"
+    );
+    expect(cftc?.payload).toMatchObject({
+      reason: "http_403",
+      failed: true,
+      status: 403
+    });
+    const courtListener = evidence.find(
+      (event) =>
+        event.event === "source.fetched" &&
+        (event.payload as { source?: string }).source === "CourtListener"
+    );
+    expect(courtListener?.payload).toMatchObject({ failed: false });
+    expect(
+      fetchMock.mock.calls.filter((call) =>
+        String(call[0]).startsWith("https://www.cftc.gov/")
       )
+    ).toHaveLength(1);
+    expect(JSON.stringify(evidence)).not.toContain("cl-seeded-page-token");
+    expect((await runsRepo.getRunById(testEnv.DB, id))?.status).toBe("running");
+  });
+
+  it("fails the Run when a seeded page is blocked and nothing was drafted", async () => {
+    const id = "run-20260901-0e04";
+    await seedRun(id);
+    vi.stubGlobal(
+      "fetch",
+      vi.fn(async (input: RequestInfo | URL) => {
+        const url = String(input);
+        if (url.startsWith("https://www.cftc.gov/")) {
+          return new Response("denied", { status: 403 });
+        }
+        if (url.includes("courtlistener.com")) {
+          return Response.json({ results: [] });
+        }
+        return new Response("<html>ok</html>", { status: 200 });
+      })
+    );
+    const packaged = await packageDailyRun(
+      testEnv.DB,
+      id,
+      {
+        db: testEnv.DB,
+        costPolicy: fixtureCostPolicy,
+        provider: provider(),
+        now: () => NOW
+      },
+      checksWithToken()
     );
-    expect(authHeaders.every((h) => h === "Token tok")).toBe(true);
+    expect(packaged).toMatchObject({ draftCount: 0, anyFailure: true });
+    expect(await draftsRepo.listByRun(testEnv.DB, id)).toEqual([]);
+    expect((await runsRepo.getRunById(testEnv.DB, id))?.status).toBe("failed");
   });
 });
 
diff --git a/src/pipeline/workflow/dailyRun.ts b/src/pipeline/workflow/dailyRun.ts
index 517a6ab..78990c4 100644
--- a/src/pipeline/workflow/dailyRun.ts
+++ b/src/pipeline/workflow/dailyRun.ts
@@ -16,6 +16,9 @@ import {
   firstFetchWindowDays,
   type CourtListenerWait
 } from "../connectors/courtListener";
+import { createCftcPressCheck } from "../connectors/cftcPress";
+import { createLegalNewsLeadsCheck } from "../connectors/legalNewsLeads";
+import { createScotusDocketCheck } from "../connectors/scotusDocket";
 import { llmProvidersFromEnv, type GatewayDeps } from "../ai/gateway";
 import {
   ensureRun,
@@ -87,10 +90,12 @@ export function gatewayDepsFromEnv(
 }
 
 /**
- * Story 3.21 — the live connector registry, keyed on the exact source name
+ * Live connector registry, keyed on the exact source name
  * (3.17 makes names operator-editable; an unknown name falls back to
- * `stubCheck` → `"not wired"`). The token is a per-Worker secret typed as
- * optional on `Env`; absent → `source.skipped { reason: "unconfigured" }`.
+ * `stubCheck` → `"not wired"`). The CourtListener token is a per-Worker
+ * secret typed as optional on `Env`; absent →
+ * `source.skipped { reason: "unconfigured" }`. The seeded page checks do
+ * not receive that token, the wait, the clock, or the database.
  */
 export function sourceChecksFromEnv(
   env: Pick<Env, "COURTLISTENER_API_TOKEN" | "FIRST_FETCH_WINDOW_DAYS"> & {
@@ -112,7 +117,10 @@ export function sourceChecksFromEnv(
       firstFetchWindowDays: firstFetchWindowDays(env.FIRST_FETCH_WINDOW_DAYS),
       ...(env.courtListenerWait ? { wait: env.courtListenerWait } : {}),
       ...(env.now ? { now: env.now } : {})
-    })
+    }),
+    "CFTC press": createCftcPressCheck(),
+    "SCOTUS docket": createScotusDocketCheck(),
+    "Legal news leads": createLegalNewsLeadsCheck()
   };
 }
 
diff --git a/src/shared/lib/timeouts.ts b/src/shared/lib/timeouts.ts
index 87e9021..f664446 100644
--- a/src/shared/lib/timeouts.ts
+++ b/src/shared/lib/timeouts.ts
@@ -24,8 +24,9 @@
  * (`provider_error`, `source.skipped { reason: "timeout" }`).
  *
  * No retries and no backoff live in this module. These constants stay
- * fixed. CourtListener is the per-check exception: `observe` uses that
- * check's `pollTimeoutMs` instead of `CONNECTOR_TIMEOUT_MS` (story 3.38).
+ * fixed. `observe` uses a check's `pollTimeoutMs` when the check sets one,
+ * instead of `CONNECTOR_TIMEOUT_MS`. CourtListener sets an 8 minute budget
+ * (story 3.38). Each seeded page check sets 20 seconds (story 3.39).
  * Pacing and 429 waits live in the CourtListener connector.
  */
 
diff --git a/src/pipeline/connectors/cftcPress.ts b/src/pipeline/connectors/cftcPress.ts
new file mode 100644
index 0000000..26356c2
--- /dev/null
+++ b/src/pipeline/connectors/cftcPress.ts
@@ -0,0 +1,5 @@
+import { createSeededPageCheck } from "./publicSource";
+
+export function createCftcPressCheck() {
+  return createSeededPageCheck("https://www.cftc.gov");
+}
diff --git a/src/pipeline/connectors/legalNewsLeads.ts b/src/pipeline/connectors/legalNewsLeads.ts
new file mode 100644
index 0000000..a2dc1f3
--- /dev/null
+++ b/src/pipeline/connectors/legalNewsLeads.ts
@@ -0,0 +1,5 @@
+import { createSeededPageCheck } from "./publicSource";
+
+export function createLegalNewsLeadsCheck() {
+  return createSeededPageCheck("https://news.bloomberglaw.com");
+}
diff --git a/src/pipeline/connectors/publicSource.test.ts b/src/pipeline/connectors/publicSource.test.ts
new file mode 100644
index 0000000..06f042f
--- /dev/null
+++ b/src/pipeline/connectors/publicSource.test.ts
@@ -0,0 +1,345 @@
+import { afterEach, describe, expect, it, vi } from "vitest";
+
+import { COURTLISTENER_POLL_TIMEOUT_MS } from "./courtListener";
+import { SourceUnavailableError, type SourceCheckContext } from "./connector";
+import { createCftcPressCheck } from "./cftcPress";
+import { createLegalNewsLeadsCheck } from "./legalNewsLeads";
+import {
+  createSeededPageCheck,
+  SEEDED_PAGE_ERROR_BODY_MAX_BYTES,
+  SEEDED_PAGE_MAX_BYTES,
+  SEEDED_PAGE_POLL_TIMEOUT_MS
+} from "./publicSource";
+import { createScotusDocketCheck } from "./scotusDocket";
+import { POLL_SOURCES, type PollSource } from "./sources";
+
+const CFTC = POLL_SOURCES.find((source) => source.name === "CFTC press")!;
+const SCOTUS = POLL_SOURCES.find((source) => source.name === "SCOTUS docket")!;
+
+function context(
+  beforeRequest: () => Promise<void> = async () => {}
+): SourceCheckContext {
+  return { signal: new AbortController().signal, beforeRequest };
+}
+
+function page(
+  status: number,
+  body: BodyInit | null = "",
+  headers?: HeadersInit
+): Response {
+  return new Response(body, { status, headers });
+}
+
+describe("seeded page checks", () => {
+  afterEach(() => vi.unstubAllGlobals());
+
+  it("keeps the three poll budgets inside the default step", () => {
+    for (const check of [
+      createCftcPressCheck(),
+      createScotusDocketCheck(),
+      createLegalNewsLeadsCheck()
+    ]) {
+      expect((check as { pollTimeoutMs?: number }).pollTimeoutMs).toBe(
+        SEEDED_PAGE_POLL_TIMEOUT_MS
+      );
+    }
+    expect(SEEDED_PAGE_POLL_TIMEOUT_MS).toBe(20_000);
+    expect(
+      COURTLISTENER_POLL_TIMEOUT_MS + 3 * SEEDED_PAGE_POLL_TIMEOUT_MS
+    ).toBeLessThan(10 * 60 * 1000);
+  });
+
+  it("returns entities [] and a fetched summary for a 200 that names a docket", async () => {
+    const body = "<html>docket 1:26-cv-03659 remains on the index</html>";
+    const order: string[] = [];
+    const fetchMock = vi.fn(
+      async (_input: RequestInfo | URL, _init?: RequestInit) => {
+        order.push("fetch");
+        return page(200, body, { "content-type": "text/html; charset=utf-8" });
+      }
+    );
+    vi.stubGlobal("fetch", fetchMock);
+    const items = await createCftcPressCheck()(
+      CFTC,
+      context(async () => {
+        order.push("before");
+      })
+    );
+    expect(order).toEqual(["before", "fetch"]);
+    expect(fetchMock).toHaveBeenCalledTimes(1);
+    const init = fetchMock.mock.calls[0]?.[1];
+    expect(init?.redirect).toBe("manual");
+    expect(new Headers(init?.headers).get("authorization")).toBeNull();
+    expect(items).toEqual([
+      {
+        entities: [],
+        fetched: {
+          status: 200,
+          contentType: "text/html; charset=utf-8",
+          bytes: new TextEncoder().encode(body).byteLength
+        }
+      }
+    ]);
+    expect(JSON.stringify(items)).not.toContain("1:26-cv-03659");
+  });
+
+  it("truncates contentType to 120 characters and allows a null type", async () => {
+    const longType = `text/html; ${"a".repeat(200)}`;
+    vi.stubGlobal(
+      "fetch",
+      vi.fn(async () => page(200, "ok", { "content-type": longType }))
+    );
+    const [item] = await createCftcPressCheck()(CFTC, context());
+    expect(item?.fetched?.contentType).toBe(longType.slice(0, 120));
+
+    vi.stubGlobal(
+      "fetch",
+      vi.fn(async () => {
+        const response = page(200, "ok");
+        response.headers.delete("content-type");
+        return response;
+      })
+    );
+    const [again] = await createScotusDocketCheck()(SCOTUS, context());
+    expect(again?.fetched?.contentType).toBeNull();
+    expect(again?.entities).toEqual([]);
+  });
+
+  it("skips a 429 after one fetch and does not retry", async () => {
+    const fetchMock = vi.fn(async () => page(429, "slow down"));
+    vi.stubGlobal("fetch", fetchMock);
+    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
+      {
+        reason: "http_429",
+        detail: { status: 429, detail: "slow down" }
+      }
+    );
+    expect(fetchMock).toHaveBeenCalledTimes(1);
+  });
+
+  it("skips a 5xx after one fetch and does not retry", async () => {
+    const fetchMock = vi.fn(async () => page(503, "unavailable"));
+    vi.stubGlobal("fetch", fetchMock);
+    await expect(
+      createLegalNewsLeadsCheck()(
+        POLL_SOURCES.find((source) => source.name === "Legal news leads")!,
+        context()
+      )
+    ).rejects.toMatchObject({
+      reason: "http_5xx",
+      detail: { status: 503, detail: "unavailable" }
+    });
+    expect(fetchMock).toHaveBeenCalledTimes(1);
+  });
+
+  it("reads at most 8192 error bytes before scrubbing", async () => {
+    let pulled = 0;
+    const stream = new ReadableStream<Uint8Array>(
+      {
+        pull(controller) {
+          if (pulled >= 9000) {
+            controller.close();
+            return;
+          }
+          const size = Math.min(1024, 9000 - pulled);
+          const chunk = new Uint8Array(size);
+          chunk.fill(97);
+          if (pulled === 0) chunk[0] = 84;
+          controller.enqueue(chunk);
+          pulled += size;
+        }
+      },
+      { highWaterMark: 0 }
+    );
+    vi.stubGlobal(
+      "fetch",
+      vi.fn(async () => {
+        return {
+          status: 403,
+          headers: new Headers({ "content-type": "text/html" }),
+          body: stream
+        } as Response;
+      })
+    );
+    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
+      {
+        reason: "http_403",
+        detail: { status: 403, detail: `T${"a".repeat(179)}` }
+      }
+    );
+    expect(pulled).toBe(SEEDED_PAGE_ERROR_BODY_MAX_BYTES);
+  });
+
+  it("does not follow a redirect or read Location", async () => {
+    let pulled = false;
+    const stream = new ReadableStream(
+      {
+        pull(controller) {
+          pulled = true;
+          controller.enqueue(new TextEncoder().encode("secret-body"));
+          controller.close();
+        }
+      },
+      { highWaterMark: 0 }
+    );
+    const fetchMock = vi.fn(async () => {
+      return {
+        status: 302,
+        headers: new Headers({ location: "https://evil.example/secret" }),
+        body: stream
+      } as Response;
+    });
+    vi.stubGlobal("fetch", fetchMock);
+    const err = await Promise.resolve(
+      createCftcPressCheck()(CFTC, context())
+    ).then(
+      () => {
+        throw new Error("redirect was fetched");
+      },
+      (caught: unknown) => caught
+    );
+    expect(err).toBeInstanceOf(SourceUnavailableError);
+    expect(err).toMatchObject({ reason: "redirect", detail: { status: 302 } });
+    expect(
+      JSON.stringify((err as SourceUnavailableError).detail)
+    ).not.toContain("evil.example");
+    expect(fetchMock).toHaveBeenCalledTimes(1);
+    expect(pulled).toBe(false);
+  });
+
+  it("rejects a foreign origin before fetch and omits the URL", async () => {
+    const fetchMock = vi.fn();
+    vi.stubGlobal("fetch", fetchMock);
+    const before = vi.fn(async () => {});
+    const foreign: PollSource = {
+      ...CFTC,
+      url: "https://example.com/PressRoom/PressReleases"
+    };
+    await expect(
+      createCftcPressCheck()(foreign, context(before))
+    ).rejects.toMatchObject({ reason: "unsafe_url", detail: {} });
+    expect(fetchMock).not.toHaveBeenCalled();
+    expect(before).not.toHaveBeenCalled();
+  });
+
+  it("rejects a steered URL that leaves the seeded origin", async () => {
+    const fetchMock = vi.fn();
+    vi.stubGlobal("fetch", fetchMock);
+    const steered: PollSource = {
+      name: "SCOTUS docket",
+      url: "https://user:pw@www.supremecourt.gov/docket/",
+      tier: "tier1"
+    };
+    const err = await Promise.resolve(
+      createScotusDocketCheck()(steered, context())
+    ).then(
+      () => {
+        throw new Error("credentials were fetched");
+      },
+      (caught: unknown) => caught
+    );
+    expect(err).toMatchObject({ reason: "unsafe_url", detail: {} });
+    expect(JSON.stringify(err)).not.toContain("user:pw");
+    expect((err as Error).message).not.toContain("user:pw");
+    expect(fetchMock).not.toHaveBeenCalled();
+  });
+
+  it("fetches a same-origin steered path", async () => {
+    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
+      page(200, "ok")
+    );
+    vi.stubGlobal("fetch", fetchMock);
+    const steered: PollSource = {
+      ...CFTC,
+      url: "https://www.cftc.gov/PressRoom/Other"
+    };
+    const items = await createCftcPressCheck()(steered, context());
+    expect(items[0]?.entities).toEqual([]);
+    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
+      "https://www.cftc.gov/PressRoom/Other"
+    );
+  });
+
+  it("does not fetch when the factory origin disagrees with the source name", async () => {
+    const fetchMock = vi.fn();
+    vi.stubGlobal("fetch", fetchMock);
+    await expect(
+      createCftcPressCheck()(SCOTUS, context())
+    ).rejects.toMatchObject({ reason: "unsafe_url" });
+    expect(fetchMock).not.toHaveBeenCalled();
+  });
+
+  it("maps TimeoutError to timeout and rethrows AbortError", async () => {
+    vi.stubGlobal(
+      "fetch",
+      vi.fn(async () => {
+        throw new DOMException("timed out", "TimeoutError");
+      })
+    );
+    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
+      { reason: "timeout" }
+    );
+
+    vi.stubGlobal(
+      "fetch",
+      vi.fn(async () => {
+        throw new DOMException("aborted", "AbortError");
+      })
+    );
+    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
+      { name: "AbortError" }
+    );
+  });
+
+  it("maps other fetch failures to network", async () => {
+    vi.stubGlobal(
+      "fetch",
+      vi.fn(async () => {
+        throw new TypeError("boom");
+      })
+    );
+    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
+      { reason: "network" }
+    );
+  });
+
+  it("does not read a 200 whose Content-Length is over the cap", async () => {
+    let pulled = false;
+    const stream = new ReadableStream(
+      {
+        pull() {
+          pulled = true;
+          throw new Error("body was read");
+        }
+      },
+      { highWaterMark: 0 }
+    );
+    vi.stubGlobal(
+      "fetch",
+      vi.fn(async () => {
+        return {
+          status: 200,
+          headers: new Headers({
+            "content-length": String(SEEDED_PAGE_MAX_BYTES + 1)
+          }),
+          body: stream
+        } as Response;
+      })
+    );
+    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
+      { reason: "response_too_large", detail: {} }
+    );
+    expect(pulled).toBe(false);
+  });
+
+  it("rejects a 200 body that exceeds the cap while being read", async () => {
+    const chunk = new Uint8Array(SEEDED_PAGE_MAX_BYTES + 1);
+    vi.stubGlobal(
+      "fetch",
+      vi.fn(async () => new Response(chunk, { status: 200 }))
+    );
+    await expect(
+      createSeededPageCheck("https://www.cftc.gov")(CFTC, context())
+    ).rejects.toMatchObject({ reason: "response_too_large" });
+  });
+});
diff --git a/src/pipeline/connectors/publicSource.ts b/src/pipeline/connectors/publicSource.ts
new file mode 100644
index 0000000..1d7135a
--- /dev/null
+++ b/src/pipeline/connectors/publicSource.ts
@@ -0,0 +1,210 @@
+import {
+  SourceUnavailableError,
+  type SourceCheck,
+  type SourceCheckContext
+} from "./connector";
+import { reasonForStatus, scrubResponseDetail } from "./courtListener";
+import { POLL_SOURCES } from "./sources";
+import {
+  fetchWithTimeout,
+  isAbortError,
+  isTimeoutError,
+  SOURCE_FETCH_TIMEOUT_MS
+} from "../../shared/lib/timeouts";
+
+/** One seeded page poll. Three of these plus CourtListener stay under 10 minutes. */
+export const SEEDED_PAGE_POLL_TIMEOUT_MS = 20_000;
+/** A 200 body larger than this is `response_too_large` and is not parsed. */
+export const SEEDED_PAGE_MAX_BYTES = 1_000_000;
+/** Non-200 bodies are scrubbed from this prefix only. */
+export const SEEDED_PAGE_ERROR_BODY_MAX_BYTES = 8192;
+
+const CONTENT_TYPE_MAX = 120;
+
+const ACCEPT =
+  "text/html, application/xhtml+xml, application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8";
+
+const SEEDED_NAMES = new Set([
+  "CFTC press",
+  "SCOTUS docket",
+  "Legal news leads"
+]);
+
+function allowedOrigin(name: string): string | null {
+  if (!SEEDED_NAMES.has(name)) return null;
+  const seeded = POLL_SOURCES.find((source) => source.name === name);
+  if (seeded == null) return null;
+  return new URL(seeded.url).origin;
+}
+
+/** Same-origin https only. The rejected URL stays out of the error. */
+function guardedUrl(input: string, origin: string): string {
+  let url: URL;
+  try {
+    if (
+      !input ||
+      input.includes("\\") ||
+      /%(?![0-9a-f]{2})/i.test(input) ||
+      Array.from(input).some((char) => {
+        const code = char.charCodeAt(0);
+        return code <= 0x20 || code === 0x7f;
+      })
+    ) {
+      throw new Error("invalid URL");
+    }
+    url = new URL(input);
+  } catch (err) {
+    if (err instanceof SourceUnavailableError) throw err;
+    throw new SourceUnavailableError("unsafe_url");
+  }
+  if (
+    url.protocol !== "https:" ||
+    url.origin !== origin ||
+    url.username !== "" ||
+    url.password !== ""
+  ) {
+    throw new SourceUnavailableError("unsafe_url");
+  }
+  return url.href;
+}
+
+function concatBytes(chunks: Uint8Array[], total: number): Uint8Array {
+  const out = new Uint8Array(total);
+  let offset = 0;
+  for (const chunk of chunks) {
+    out.set(chunk, offset);
+    offset += chunk.byteLength;
+  }
+  return out;
+}
+
+/** Read at most `maxBytes` and leave the rest of the stream unread. */
+async function readAtMost(
+  response: Response,
+  maxBytes: number
+): Promise<Uint8Array> {
+  const reader = response.body?.getReader();
+  if (!reader) return new Uint8Array(0);
+  const chunks: Uint8Array[] = [];
+  let total = 0;
+  while (total < maxBytes) {
+    const { done, value } = await reader.read();
+    if (done) break;
+    if (value == null || value.byteLength === 0) continue;
+    const room = maxBytes - total;
+    if (value.byteLength > room) {
+      chunks.push(value.subarray(0, room));
+      total += room;
+      break;
+    }
+    chunks.push(value);
+    total += value.byteLength;
+  }
+  return concatBytes(chunks, total);
+}
+
+function declaredLength(response: Response): number | null {
+  const raw = response.headers.get("content-length")?.trim();
+  if (raw == null || !/^\d+$/.test(raw)) return null;
+  const value = Number(raw);
+  return Number.isSafeInteger(value) ? value : null;
+}
+
+async function readSuccessBody(response: Response): Promise<Uint8Array> {
+  const declared = declaredLength(response);
+  if (declared != null && declared > SEEDED_PAGE_MAX_BYTES) {
+    throw new SourceUnavailableError("response_too_large");
+  }
+  const reader = response.body?.getReader();
+  if (!reader) return new Uint8Array(0);
+  const chunks: Uint8Array[] = [];
+  let total = 0;
+  while (true) {
+    const { done, value } = await reader.read();
+    if (done) break;
+    if (value == null || value.byteLength === 0) continue;
+    if (total + value.byteLength > SEEDED_PAGE_MAX_BYTES) {
+      throw new SourceUnavailableError("response_too_large");
+    }
+    chunks.push(value);
+    total += value.byteLength;
+  }
+  return concatBytes(chunks, total);
+}
+
+function contentTypeOf(response: Response): string | null {
+  const value = response.headers.get("content-type");
+  if (value == null) return null;
+  return value.length > CONTENT_TYPE_MAX
+    ? value.slice(0, CONTENT_TYPE_MAX)
+    : value;
+}
+
+async function errorDetail(response: Response): Promise<string> {
+  const bytes = await readAtMost(response, SEEDED_PAGE_ERROR_BODY_MAX_BYTES);
+  return scrubResponseDetail(new TextDecoder().decode(bytes), "");
+}
+
+function unavailable(
+  reason: string,
+  detail: Record<string, unknown>
+): SourceUnavailableError {
+  return new SourceUnavailableError(reason, detail);
+}
+
+async function fetchSeededPage(
+  url: string,
+  context: SourceCheckContext | undefined
+): Promise<Response> {
+  try {
+    return await fetchWithTimeout(
+      url,
+      {
+        signal: context?.signal,
+        redirect: "manual",
+        headers: { accept: ACCEPT }
+      },
+      SOURCE_FETCH_TIMEOUT_MS
+    );
+  } catch (err) {
+    if (isAbortError(err)) throw err;
+    if (isTimeoutError(err)) throw unavailable("timeout", {});
+    throw unavailable("network", {});
+  }
+}
+
+/**
+ * One same-origin fetch for a seeded page. `origin` is the factory's host.
+ * It must match the `POLL_SOURCES` origin for `source.name`.
+ */
+export function createSeededPageCheck(origin: string): SourceCheck {
+  const check: SourceCheck = async (source, context) => {
+    const allowed = allowedOrigin(source.name);
+    if (allowed == null || allowed !== origin) {
+      throw unavailable("unsafe_url", {});
+    }
+    const url = guardedUrl(source.url, allowed);
+    await context?.beforeRequest();
+    const response = await fetchSeededPage(url, context);
+    if (response.status >= 300 && response.status < 400) {
+      throw unavailable("redirect", { status: response.status });
+    }
+    if (response.status !== 200) {
+      const detail = await errorDetail(response);
+      throw unavailable(reasonForStatus(response.status), {
+        status: response.status,
+        ...(detail ? { detail } : {})
+      });
+    }
+    const contentType = contentTypeOf(response);
+    const bytes = await readSuccessBody(response);
+    return [
+      {
+        entities: [],
+        fetched: { status: 200, contentType, bytes: bytes.byteLength }
+      }
+    ];
+  };
+  Object.assign(check, { pollTimeoutMs: SEEDED_PAGE_POLL_TIMEOUT_MS });
+  return check;
+}
diff --git a/src/pipeline/connectors/scotusDocket.ts b/src/pipeline/connectors/scotusDocket.ts
new file mode 100644
index 0000000..dbce667
--- /dev/null
+++ b/src/pipeline/connectors/scotusDocket.ts
@@ -0,0 +1,5 @@
+import { createSeededPageCheck } from "./publicSource";
+
+export function createScotusDocketCheck() {
+  return createSeededPageCheck("https://www.supremecourt.gov");
+}
`. Read that file — it is the content under review.

Do not invoke any skill, and do not spawn subagents of your own — you are the reviewer. Return your findings as text in your final message; do not route them through any findings-reporting tool the host may offer.
