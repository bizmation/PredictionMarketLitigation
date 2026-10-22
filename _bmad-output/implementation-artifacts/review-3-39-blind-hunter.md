Conduct a review of CONTENT.
Look for what's missing, not only what's wrong.
Compute your finding floor N from the diff file's size: N = min(floor(sqrt(kB) + 1), 10), where kB is the file's size in kilobytes. State the arithmetic in one line, then find at least N issues to fix or improve.
Output a Markdown list of findings only — no severity, priority, or ranking.
If the content is empty, stop and say so.
If you have zero findings, re-check and keep thinking; do not stop with an empty list.

CONTENT: the unified diff at `diff --git a/_bmad-output/implementation-artifacts/review-3-39-blind-hunter.md b/_bmad-output/implementation-artifacts/review-3-39-blind-hunter.md
new file mode 100644
index 0000000..8cd2f94
--- /dev/null
+++ b/_bmad-output/implementation-artifacts/review-3-39-blind-hunter.md
@@ -0,0 +1,1056 @@
+Conduct a review of CONTENT.
+Look for what's missing, not only what's wrong.
+Compute your finding floor N from the diff file's size: N = min(floor(sqrt(kB) + 1), 10), where kB is the file's size in kilobytes. State the arithmetic in one line, then find at least N issues to fix or improve.
+Output a Markdown list of findings only — no severity, priority, or ranking.
+If the content is empty, stop and say so.
+If you have zero findings, re-check and keep thinking; do not stop with an empty list.
+
+CONTENT: the unified diff at `diff --git a/_bmad-output/implementation-artifacts/spec-3-39-wire-seeded-cftc-scotus-and-legal-news-sources.md b/_bmad-output/implementation-artifacts/spec-3-39-wire-seeded-cftc-scotus-and-legal-news-sources.md
+index 2b86174..a8468f5 100644
+--- a/_bmad-output/implementation-artifacts/spec-3-39-wire-seeded-cftc-scotus-and-legal-news-sources.md
++++ b/_bmad-output/implementation-artifacts/spec-3-39-wire-seeded-cftc-scotus-and-legal-news-sources.md
+@@ -2,8 +2,9 @@
+ title: '3.39 — Wire seeded CFTC, SCOTUS, and legal-news sources'
+ type: 'feature'
+ created: '2026-10-22'
+-status: 'draft'
++status: 'in-review'
+ route: 'dispatch'
++baseline_commit: 'f234f8c3be99068b86a309cd602c45e650d91254'
+ review_loop_iteration: 0
+ context:
+   - '{project-root}/_bmad-output/implementation-artifacts/3-39-wire-seeded-cftc-scotus-and-legal-news-sources.md'
+@@ -53,12 +54,12 @@ context:
+ ## Tasks & Acceptance
+ 
+ **Execution:**
+-- [ ] `src/pipeline/connectors/publicSource.ts` — one same-origin fetch and the 20-second, 1_000_000-byte, and 8192-byte caps — shared by the three checks.
+-- [ ] `src/pipeline/connectors/cftcPress.ts`, `scotusDocket.ts`, `legalNewsLeads.ts` — thin factories for `https://www.cftc.gov`, `https://www.supremecourt.gov`, and `https://news.bloomberglaw.com`.
+-- [ ] `src/pipeline/connectors/publicSource.test.ts` — stub `fetch` and cover the matrix rows that do not need a full Run.
+-- [ ] `src/pipeline/workflow/dailyRun.ts` — register the three checks.
+-- [ ] `src/pipeline/workflow/dailyRun.test.ts` — replace the CourtListener-only registry assertions and cover empty versus failed Runs, plus the token header.
+-- [ ] `src/shared/lib/timeouts.ts` — comment only.
++- [x] `src/pipeline/connectors/publicSource.ts` — one same-origin fetch and the 20-second, 1_000_000-byte, and 8192-byte caps — shared by the three checks.
++- [x] `src/pipeline/connectors/cftcPress.ts`, `scotusDocket.ts`, `legalNewsLeads.ts` — thin factories for `https://www.cftc.gov`, `https://www.supremecourt.gov`, and `https://news.bloomberglaw.com`.
++- [x] `src/pipeline/connectors/publicSource.test.ts` — stub `fetch` and cover the matrix rows that do not need a full Run.
++- [x] `src/pipeline/workflow/dailyRun.ts` — register the three checks.
++- [x] `src/pipeline/workflow/dailyRun.test.ts` — replace the CourtListener-only registry assertions and cover empty versus failed Runs, plus the token header.
++- [x] `src/shared/lib/timeouts.ts` — comment only.
+ 
+ **Acceptance Criteria:**
+ - Given poll-sources version 0, when a Run packages it, then CFTC press and SCOTUS docket are Tier-1, Legal news leads is Tier-2, and none of the three records `not wired`.
+diff --git a/_bmad-output/implementation-artifacts/sprint-status.yaml b/_bmad-output/implementation-artifacts/sprint-status.yaml
+index 681add6..1a1c05f 100644
+--- a/_bmad-output/implementation-artifacts/sprint-status.yaml
++++ b/_bmad-output/implementation-artifacts/sprint-status.yaml
+@@ -36,7 +36,7 @@
+ # - Source epics: _bmad-output/planning-artifacts/epics.md; 3.14–3.21 backfill tracked in 3.26.
+ 
+ generated: 2026-08-09
+-last_updated: 10-22-2026 12:55
++last_updated: 10-22-2026 13:24
+ project: PML
+ project_key: NOKEY
+ tracking_system: file-system
+@@ -115,7 +115,7 @@ development_status:
+   3-38-pace-courtlistener-requests-and-recover-from-http-429: done
+   3-37-prove-the-live-governed-loop-and-reassess-epic-3: done
+   # Added by approved sprint-change-proposal-2026-10-11T1823Z. Checklist 6.4.
+-  3-39-wire-seeded-cftc-scotus-and-legal-news-sources: ready-for-dev
++  3-39-wire-seeded-cftc-scotus-and-legal-news-sources: in-progress
+   3-40-add-further-web-and-publication-sources: backlog
+   # Retrospective 2026-10-11 human override: accepted-with-open-items. Machine verdict was rejected.
+   epic-3-retrospective: done
+diff --git a/src/pipeline/workflow/dailyRun.test.ts b/src/pipeline/workflow/dailyRun.test.ts
+index a239a94..c7c8eba 100644
+--- a/src/pipeline/workflow/dailyRun.test.ts
++++ b/src/pipeline/workflow/dailyRun.test.ts
+@@ -36,6 +36,7 @@ import {
+   timezoneOffsetMs
+ } from "./schedule";
+ import type { SourceCheck } from "../connectors/connector";
++import { POLL_SOURCES } from "../connectors/sources";
+ 
+ const testEnv = env as Env;
+ 
+@@ -622,15 +623,17 @@ describe("sourceChecksFromEnv (story 3.21)", () => {
+     };
+   }
+ 
+-  it("wires exactly CourtListener; the other sources stay not wired", async () => {
++  it("registers CourtListener and the three seeded sources in poll order", async () => {
+     const checks = sourceChecksFromEnv(
+       { COURTLISTENER_API_TOKEN: undefined },
+       testEnv.DB
+     );
+-    expect(Object.keys(checks)).toEqual(["CourtListener"]);
++    expect(Object.keys(checks)).toEqual(
++      POLL_SOURCES.map((source) => source.name)
++    );
+   });
+ 
+-  it("records source.skipped unconfigured for CourtListener and not wired for the rest when the token is absent", async () => {
++  it("fetches the seeded pages when the CourtListener token is absent", async () => {
+     const id = "run-20260901-0e00";
+     await runsRepo.insertRun(testEnv.DB, {
+       id,
+@@ -645,7 +648,16 @@ describe("sourceChecksFromEnv (story 3.21)", () => {
+       scheduledFor: "2026-09-01"
+     });
+     await attachSnapshot(testEnv.DB, id);
+-    const fetchMock = vi.fn();
++    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
++      const url = String(input);
++      if (url.includes("courtlistener.com")) {
++        throw new Error("CourtListener must not be fetched");
++      }
++      return new Response("<html></html>", {
++        status: 200,
++        headers: { "content-type": "text/html" }
++      });
++    });
+     vi.stubGlobal("fetch", fetchMock);
+     const packaged = await packageDailyRun(
+       testEnv.DB,
+@@ -664,22 +676,36 @@ describe("sourceChecksFromEnv (story 3.21)", () => {
+       draftCount: 0,
+       anyFailure: true
+     });
+-    expect(fetchMock).not.toHaveBeenCalled();
+-    const skipped = (await evidenceRepo.listByRun(testEnv.DB, id)).filter(
+-      (e) => e.event === "source.skipped"
+-    );
+-    const reasons = Object.fromEntries(
+-      skipped.map((e) => [
+-        (e.payload as { source: string }).source,
+-        (e.payload as { reason: string }).reason
+-      ])
+-    );
+-    expect(reasons).toEqual({
+-      CourtListener: "unconfigured",
+-      "CFTC press": "not wired",
+-      "SCOTUS docket": "not wired",
+-      "Legal news leads": "not wired"
+-    });
++    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
++      "https://www.cftc.gov/PressRoom/PressReleases",
++      "https://www.supremecourt.gov/docket/",
++      "https://news.bloomberglaw.com/securities-law"
++    ]);
++    const evidence = await evidenceRepo.listByRun(testEnv.DB, id);
++    const skipped = evidence.filter((e) => e.event === "source.skipped");
++    expect(
++      skipped.map((e) => (e.payload as { source: string }).source)
++    ).toEqual(["CourtListener"]);
++    expect(skipped[0]?.payload).toMatchObject({ reason: "unconfigured" });
++    const fetched = evidence.filter((e) => e.event === "source.fetched");
++    expect(
++      fetched.map((e) => (e.payload as { source: string }).source)
++    ).toEqual(["CFTC press", "SCOTUS docket", "Legal news leads"]);
++    for (const event of fetched) {
++      expect(event.payload).toMatchObject({
++        itemCount: 0,
++        failed: false,
++        status: 200,
++        pollSourcesVersion: 0
++      });
++      expect(event.payload).not.toMatchObject({ reason: "not wired" });
++    }
++    expect(fetched.map((e) => (e.payload as { tier: string }).tier)).toEqual([
++      "tier1",
++      "tier1",
++      "tier2"
++    ]);
++    expect(await draftsRepo.listByRun(testEnv.DB, id)).toEqual([]);
+     expect((await runsRepo.getRunById(testEnv.DB, id))?.status).toBe("failed");
+   });
+ 
+@@ -774,12 +800,223 @@ describe("sourceChecksFromEnv (story 3.21)", () => {
+       newEntries: 1
+     });
+     expect(illinois).not.toHaveProperty("skippedOlder");
+-    const authHeaders = fetchMock.mock.calls.map((call) =>
+-      new Headers((call[1] as RequestInit | undefined)?.headers).get(
+-        "authorization"
++    const calls = fetchMock.mock.calls.map((call) => ({
++      url: String(call[0]),
++      authorization: new Headers(
++        (call[1] as RequestInit | undefined)?.headers
++      ).get("authorization")
++    }));
++    const seeded = calls.filter(
++      (call) =>
++        call.url.startsWith("https://www.cftc.gov/") ||
++        call.url.startsWith("https://www.supremecourt.gov/") ||
++        call.url.startsWith("https://news.bloomberglaw.com/")
++    );
++    expect(seeded.map((call) => call.authorization)).toEqual([
++      null,
++      null,
++      null
++    ]);
++    expect(
++      calls
++        .filter((call) => call.url.includes("courtlistener.com"))
++        .every((call) => call.authorization === "Token tok")
++    ).toBe(true);
++    const evidenceText = JSON.stringify(
++      await evidenceRepo.listByRun(testEnv.DB, id)
++    );
++    expect(evidenceText).not.toContain("tok");
++  });
++
++  function courtListenerRows(input: RequestInfo | URL): Response {
++    const url = new URL(String(input));
++    const docket = url.searchParams.get("docket");
++    const floor = url.searchParams.get("date_filed__gte");
++    const rows = [
++      {
++        id: 33901,
++        entry_number: 3,
++        date_filed: "2026-09-20",
++        description: "MINUTE ENTRY: status conference held."
++      }
++    ].filter((row) => floor == null || row.date_filed >= floor);
++    return Response.json({
++      results: docket === "73133459" ? rows : []
++    });
++  }
++
++  async function seedRun(id: string): Promise<void> {
++    await runsRepo.insertRun(testEnv.DB, {
++      id,
++      origin: "scheduled",
++      mode: "hitl",
++      status: "running",
++      startedAt: NOW,
++      completedAt: null,
++      spendCents: 0,
++      spendCurrency: "USD",
++      budgetCents: null,
++      scheduledFor: "2026-09-01"
++    });
++    await attachSnapshot(testEnv.DB, id);
++  }
++
++  function checksWithToken() {
++    return sourceChecksFromEnv(
++      {
++        COURTLISTENER_API_TOKEN: "cl-seeded-page-token",
++        FIRST_FETCH_WINDOW_DAYS: 3,
++        courtListenerWait: async () => {},
++        now: () => "2026-09-20T16:00:00.000Z"
++      },
++      testEnv.DB
++    );
++  }
++
++  it("finishes empty when CourtListener and the seeded pages have nothing new", async () => {
++    const id = "run-20260901-0e02";
++    await seedRun(id);
++    const before = await testEnv.DB.prepare(
++      "SELECT COUNT(*) AS n FROM docket_events"
++    ).first<{ n: number }>();
++    vi.stubGlobal(
++      "fetch",
++      vi.fn(async (input: RequestInfo | URL) => {
++        const url = String(input);
++        if (url.includes("courtlistener.com")) {
++          return Response.json({ results: [] });
++        }
++        return new Response(
++          "<html>index mentions 1:26-cv-03659 and nothing else</html>",
++          { status: 200, headers: { "content-type": "text/html" } }
++        );
++      })
++    );
++    const packaged = await packageDailyRun(
++      testEnv.DB,
++      id,
++      {
++        db: testEnv.DB,
++        costPolicy: fixtureCostPolicy,
++        provider: provider(),
++        now: () => NOW
++      },
++      checksWithToken()
++    );
++    expect(packaged).toMatchObject({
++      skip: false,
++      draftCount: 0,
++      anyFailure: false
++    });
++    const fetched = (await evidenceRepo.listByRun(testEnv.DB, id)).filter(
++      (event) => event.event === "source.fetched"
++    );
++    expect(fetched).toHaveLength(4);
++    for (const event of fetched) {
++      expect(event.payload).toMatchObject({ itemCount: 0, failed: false });
++    }
++    expect(await draftsRepo.listByRun(testEnv.DB, id)).toEqual([]);
++    const after = await testEnv.DB.prepare(
++      "SELECT COUNT(*) AS n FROM docket_events"
++    ).first<{ n: number }>();
++    expect(after?.n).toBe(before?.n);
++    expect((await runsRepo.getRunById(testEnv.DB, id))?.status).toBe("empty");
++    expect(
++      JSON.stringify(await evidenceRepo.listByRun(testEnv.DB, id))
++    ).not.toContain("cl-seeded-page-token");
++  });
++
++  it("keeps CourtListener drafts when one seeded page returns 403", async () => {
++    const id = "run-20260901-0e03";
++    await seedRun(id);
++    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
++      const url = String(input);
++      if (url.startsWith("https://www.cftc.gov/")) {
++        return new Response("denied", { status: 403 });
++      }
++      if (
++        url.startsWith("https://www.supremecourt.gov/") ||
++        url.startsWith("https://news.bloomberglaw.com/")
++      ) {
++        return new Response("<html>ok</html>", { status: 200 });
++      }
++      return courtListenerRows(input);
++    });
++    vi.stubGlobal("fetch", fetchMock);
++    const packaged = await packageDailyRun(
++      testEnv.DB,
++      id,
++      {
++        db: testEnv.DB,
++        costPolicy: fixtureCostPolicy,
++        provider: provider(),
++        now: () => NOW
++      },
++      checksWithToken()
++    );
++    expect(packaged).toMatchObject({ draftCount: 1, anyFailure: true });
++    const drafts = await draftsRepo.listByRun(testEnv.DB, id);
++    expect(drafts).toHaveLength(1);
++    expect(drafts[0]).toMatchObject({
++      targetEntityType: "docket_events",
++      targetEntityId: "de-case-il-cftc-33901"
++    });
++    const evidence = await evidenceRepo.listByRun(testEnv.DB, id);
++    const cftc = evidence.find(
++      (event) =>
++        event.event === "source.skipped" &&
++        (event.payload as { source?: string }).source === "CFTC press"
++    );
++    expect(cftc?.payload).toMatchObject({
++      reason: "http_403",
++      failed: true,
++      status: 403
++    });
++    const courtListener = evidence.find(
++      (event) =>
++        event.event === "source.fetched" &&
++        (event.payload as { source?: string }).source === "CourtListener"
++    );
++    expect(courtListener?.payload).toMatchObject({ failed: false });
++    expect(
++      fetchMock.mock.calls.filter((call) =>
++        String(call[0]).startsWith("https://www.cftc.gov/")
+       )
++    ).toHaveLength(1);
++    expect(JSON.stringify(evidence)).not.toContain("cl-seeded-page-token");
++    expect((await runsRepo.getRunById(testEnv.DB, id))?.status).toBe("running");
++  });
++
++  it("fails the Run when a seeded page is blocked and nothing was drafted", async () => {
++    const id = "run-20260901-0e04";
++    await seedRun(id);
++    vi.stubGlobal(
++      "fetch",
++      vi.fn(async (input: RequestInfo | URL) => {
++        const url = String(input);
++        if (url.startsWith("https://www.cftc.gov/")) {
++          return new Response("denied", { status: 403 });
++        }
++        if (url.includes("courtlistener.com")) {
++          return Response.json({ results: [] });
++        }
++        return new Response("<html>ok</html>", { status: 200 });
++      })
++    );
++    const packaged = await packageDailyRun(
++      testEnv.DB,
++      id,
++      {
++        db: testEnv.DB,
++        costPolicy: fixtureCostPolicy,
++        provider: provider(),
++        now: () => NOW
++      },
++      checksWithToken()
+     );
+-    expect(authHeaders.every((h) => h === "Token tok")).toBe(true);
++    expect(packaged).toMatchObject({ draftCount: 0, anyFailure: true });
++    expect(await draftsRepo.listByRun(testEnv.DB, id)).toEqual([]);
++    expect((await runsRepo.getRunById(testEnv.DB, id))?.status).toBe("failed");
+   });
+ });
+ 
+diff --git a/src/pipeline/workflow/dailyRun.ts b/src/pipeline/workflow/dailyRun.ts
+index 517a6ab..78990c4 100644
+--- a/src/pipeline/workflow/dailyRun.ts
++++ b/src/pipeline/workflow/dailyRun.ts
+@@ -16,6 +16,9 @@ import {
+   firstFetchWindowDays,
+   type CourtListenerWait
+ } from "../connectors/courtListener";
++import { createCftcPressCheck } from "../connectors/cftcPress";
++import { createLegalNewsLeadsCheck } from "../connectors/legalNewsLeads";
++import { createScotusDocketCheck } from "../connectors/scotusDocket";
+ import { llmProvidersFromEnv, type GatewayDeps } from "../ai/gateway";
+ import {
+   ensureRun,
+@@ -87,10 +90,12 @@ export function gatewayDepsFromEnv(
+ }
+ 
+ /**
+- * Story 3.21 — the live connector registry, keyed on the exact source name
++ * Live connector registry, keyed on the exact source name
+  * (3.17 makes names operator-editable; an unknown name falls back to
+- * `stubCheck` → `"not wired"`). The token is a per-Worker secret typed as
+- * optional on `Env`; absent → `source.skipped { reason: "unconfigured" }`.
++ * `stubCheck` → `"not wired"`). The CourtListener token is a per-Worker
++ * secret typed as optional on `Env`; absent →
++ * `source.skipped { reason: "unconfigured" }`. The seeded page checks do
++ * not receive that token, the wait, the clock, or the database.
+  */
+ export function sourceChecksFromEnv(
+   env: Pick<Env, "COURTLISTENER_API_TOKEN" | "FIRST_FETCH_WINDOW_DAYS"> & {
+@@ -112,7 +117,10 @@ export function sourceChecksFromEnv(
+       firstFetchWindowDays: firstFetchWindowDays(env.FIRST_FETCH_WINDOW_DAYS),
+       ...(env.courtListenerWait ? { wait: env.courtListenerWait } : {}),
+       ...(env.now ? { now: env.now } : {})
+-    })
++    }),
++    "CFTC press": createCftcPressCheck(),
++    "SCOTUS docket": createScotusDocketCheck(),
++    "Legal news leads": createLegalNewsLeadsCheck()
+   };
+ }
+ 
+diff --git a/src/shared/lib/timeouts.ts b/src/shared/lib/timeouts.ts
+index 87e9021..f664446 100644
+--- a/src/shared/lib/timeouts.ts
++++ b/src/shared/lib/timeouts.ts
+@@ -24,8 +24,9 @@
+  * (`provider_error`, `source.skipped { reason: "timeout" }`).
+  *
+  * No retries and no backoff live in this module. These constants stay
+- * fixed. CourtListener is the per-check exception: `observe` uses that
+- * check's `pollTimeoutMs` instead of `CONNECTOR_TIMEOUT_MS` (story 3.38).
++ * fixed. `observe` uses a check's `pollTimeoutMs` when the check sets one,
++ * instead of `CONNECTOR_TIMEOUT_MS`. CourtListener sets an 8 minute budget
++ * (story 3.38). Each seeded page check sets 20 seconds (story 3.39).
+  * Pacing and 429 waits live in the CourtListener connector.
+  */
+ 
+diff --git a/src/pipeline/connectors/cftcPress.ts b/src/pipeline/connectors/cftcPress.ts
+new file mode 100644
+index 0000000..26356c2
+--- /dev/null
++++ b/src/pipeline/connectors/cftcPress.ts
+@@ -0,0 +1,5 @@
++import { createSeededPageCheck } from "./publicSource";
++
++export function createCftcPressCheck() {
++  return createSeededPageCheck("https://www.cftc.gov");
++}
+diff --git a/src/pipeline/connectors/legalNewsLeads.ts b/src/pipeline/connectors/legalNewsLeads.ts
+new file mode 100644
+index 0000000..a2dc1f3
+--- /dev/null
++++ b/src/pipeline/connectors/legalNewsLeads.ts
+@@ -0,0 +1,5 @@
++import { createSeededPageCheck } from "./publicSource";
++
++export function createLegalNewsLeadsCheck() {
++  return createSeededPageCheck("https://news.bloomberglaw.com");
++}
+diff --git a/src/pipeline/connectors/publicSource.test.ts b/src/pipeline/connectors/publicSource.test.ts
+new file mode 100644
+index 0000000..06f042f
+--- /dev/null
++++ b/src/pipeline/connectors/publicSource.test.ts
+@@ -0,0 +1,345 @@
++import { afterEach, describe, expect, it, vi } from "vitest";
++
++import { COURTLISTENER_POLL_TIMEOUT_MS } from "./courtListener";
++import { SourceUnavailableError, type SourceCheckContext } from "./connector";
++import { createCftcPressCheck } from "./cftcPress";
++import { createLegalNewsLeadsCheck } from "./legalNewsLeads";
++import {
++  createSeededPageCheck,
++  SEEDED_PAGE_ERROR_BODY_MAX_BYTES,
++  SEEDED_PAGE_MAX_BYTES,
++  SEEDED_PAGE_POLL_TIMEOUT_MS
++} from "./publicSource";
++import { createScotusDocketCheck } from "./scotusDocket";
++import { POLL_SOURCES, type PollSource } from "./sources";
++
++const CFTC = POLL_SOURCES.find((source) => source.name === "CFTC press")!;
++const SCOTUS = POLL_SOURCES.find((source) => source.name === "SCOTUS docket")!;
++
++function context(
++  beforeRequest: () => Promise<void> = async () => {}
++): SourceCheckContext {
++  return { signal: new AbortController().signal, beforeRequest };
++}
++
++function page(
++  status: number,
++  body: BodyInit | null = "",
++  headers?: HeadersInit
++): Response {
++  return new Response(body, { status, headers });
++}
++
++describe("seeded page checks", () => {
++  afterEach(() => vi.unstubAllGlobals());
++
++  it("keeps the three poll budgets inside the default step", () => {
++    for (const check of [
++      createCftcPressCheck(),
++      createScotusDocketCheck(),
++      createLegalNewsLeadsCheck()
++    ]) {
++      expect((check as { pollTimeoutMs?: number }).pollTimeoutMs).toBe(
++        SEEDED_PAGE_POLL_TIMEOUT_MS
++      );
++    }
++    expect(SEEDED_PAGE_POLL_TIMEOUT_MS).toBe(20_000);
++    expect(
++      COURTLISTENER_POLL_TIMEOUT_MS + 3 * SEEDED_PAGE_POLL_TIMEOUT_MS
++    ).toBeLessThan(10 * 60 * 1000);
++  });
++
++  it("returns entities [] and a fetched summary for a 200 that names a docket", async () => {
++    const body = "<html>docket 1:26-cv-03659 remains on the index</html>";
++    const order: string[] = [];
++    const fetchMock = vi.fn(
++      async (_input: RequestInfo | URL, _init?: RequestInit) => {
++        order.push("fetch");
++        return page(200, body, { "content-type": "text/html; charset=utf-8" });
++      }
++    );
++    vi.stubGlobal("fetch", fetchMock);
++    const items = await createCftcPressCheck()(
++      CFTC,
++      context(async () => {
++        order.push("before");
++      })
++    );
++    expect(order).toEqual(["before", "fetch"]);
++    expect(fetchMock).toHaveBeenCalledTimes(1);
++    const init = fetchMock.mock.calls[0]?.[1];
++    expect(init?.redirect).toBe("manual");
++    expect(new Headers(init?.headers).get("authorization")).toBeNull();
++    expect(items).toEqual([
++      {
++        entities: [],
++        fetched: {
++          status: 200,
++          contentType: "text/html; charset=utf-8",
++          bytes: new TextEncoder().encode(body).byteLength
++        }
++      }
++    ]);
++    expect(JSON.stringify(items)).not.toContain("1:26-cv-03659");
++  });
++
++  it("truncates contentType to 120 characters and allows a null type", async () => {
++    const longType = `text/html; ${"a".repeat(200)}`;
++    vi.stubGlobal(
++      "fetch",
++      vi.fn(async () => page(200, "ok", { "content-type": longType }))
++    );
++    const [item] = await createCftcPressCheck()(CFTC, context());
++    expect(item?.fetched?.contentType).toBe(longType.slice(0, 120));
++
++    vi.stubGlobal(
++      "fetch",
++      vi.fn(async () => {
++        const response = page(200, "ok");
++        response.headers.delete("content-type");
++        return response;
++      })
++    );
++    const [again] = await createScotusDocketCheck()(SCOTUS, context());
++    expect(again?.fetched?.contentType).toBeNull();
++    expect(again?.entities).toEqual([]);
++  });
++
++  it("skips a 429 after one fetch and does not retry", async () => {
++    const fetchMock = vi.fn(async () => page(429, "slow down"));
++    vi.stubGlobal("fetch", fetchMock);
++    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
++      {
++        reason: "http_429",
++        detail: { status: 429, detail: "slow down" }
++      }
++    );
++    expect(fetchMock).toHaveBeenCalledTimes(1);
++  });
++
++  it("skips a 5xx after one fetch and does not retry", async () => {
++    const fetchMock = vi.fn(async () => page(503, "unavailable"));
++    vi.stubGlobal("fetch", fetchMock);
++    await expect(
++      createLegalNewsLeadsCheck()(
++        POLL_SOURCES.find((source) => source.name === "Legal news leads")!,
++        context()
++      )
++    ).rejects.toMatchObject({
++      reason: "http_5xx",
++      detail: { status: 503, detail: "unavailable" }
++    });
++    expect(fetchMock).toHaveBeenCalledTimes(1);
++  });
++
++  it("reads at most 8192 error bytes before scrubbing", async () => {
++    let pulled = 0;
++    const stream = new ReadableStream<Uint8Array>(
++      {
++        pull(controller) {
++          if (pulled >= 9000) {
++            controller.close();
++            return;
++          }
++          const size = Math.min(1024, 9000 - pulled);
++          const chunk = new Uint8Array(size);
++          chunk.fill(97);
++          if (pulled === 0) chunk[0] = 84;
++          controller.enqueue(chunk);
++          pulled += size;
++        }
++      },
++      { highWaterMark: 0 }
++    );
++    vi.stubGlobal(
++      "fetch",
++      vi.fn(async () => {
++        return {
++          status: 403,
++          headers: new Headers({ "content-type": "text/html" }),
++          body: stream
++        } as Response;
++      })
++    );
++    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
++      {
++        reason: "http_403",
++        detail: { status: 403, detail: `T${"a".repeat(179)}` }
++      }
++    );
++    expect(pulled).toBe(SEEDED_PAGE_ERROR_BODY_MAX_BYTES);
++  });
++
++  it("does not follow a redirect or read Location", async () => {
++    let pulled = false;
++    const stream = new ReadableStream(
++      {
++        pull(controller) {
++          pulled = true;
++          controller.enqueue(new TextEncoder().encode("secret-body"));
++          controller.close();
++        }
++      },
++      { highWaterMark: 0 }
++    );
++    const fetchMock = vi.fn(async () => {
++      return {
++        status: 302,
++        headers: new Headers({ location: "https://evil.example/secret" }),
++        body: stream
++      } as Response;
++    });
++    vi.stubGlobal("fetch", fetchMock);
++    const err = await Promise.resolve(
++      createCftcPressCheck()(CFTC, context())
++    ).then(
++      () => {
++        throw new Error("redirect was fetched");
++      },
++      (caught: unknown) => caught
++    );
++    expect(err).toBeInstanceOf(SourceUnavailableError);
++    expect(err).toMatchObject({ reason: "redirect", detail: { status: 302 } });
++    expect(
++      JSON.stringify((err as SourceUnavailableError).detail)
++    ).not.toContain("evil.example");
++    expect(fetchMock).toHaveBeenCalledTimes(1);
++    expect(pulled).toBe(false);
++  });
++
++  it("rejects a foreign origin before fetch and omits the URL", async () => {
++    const fetchMock = vi.fn();
++    vi.stubGlobal("fetch", fetchMock);
++    const before = vi.fn(async () => {});
++    const foreign: PollSource = {
++      ...CFTC,
++      url: "https://example.com/PressRoom/PressReleases"
++    };
++    await expect(
++      createCftcPressCheck()(foreign, context(before))
++    ).rejects.toMatchObject({ reason: "unsafe_url", detail: {} });
++    expect(fetchMock).not.toHaveBeenCalled();
++    expect(before).not.toHaveBeenCalled();
++  });
++
++  it("rejects a steered URL that leaves the seeded origin", async () => {
++    const fetchMock = vi.fn();
++    vi.stubGlobal("fetch", fetchMock);
++    const steered: PollSource = {
++      name: "SCOTUS docket",
++      url: "https://user:pw@www.supremecourt.gov/docket/",
++      tier: "tier1"
++    };
++    const err = await Promise.resolve(
++      createScotusDocketCheck()(steered, context())
++    ).then(
++      () => {
++        throw new Error("credentials were fetched");
++      },
++      (caught: unknown) => caught
++    );
++    expect(err).toMatchObject({ reason: "unsafe_url", detail: {} });
++    expect(JSON.stringify(err)).not.toContain("user:pw");
++    expect((err as Error).message).not.toContain("user:pw");
++    expect(fetchMock).not.toHaveBeenCalled();
++  });
++
++  it("fetches a same-origin steered path", async () => {
++    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
++      page(200, "ok")
++    );
++    vi.stubGlobal("fetch", fetchMock);
++    const steered: PollSource = {
++      ...CFTC,
++      url: "https://www.cftc.gov/PressRoom/Other"
++    };
++    const items = await createCftcPressCheck()(steered, context());
++    expect(items[0]?.entities).toEqual([]);
++    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
++      "https://www.cftc.gov/PressRoom/Other"
++    );
++  });
++
++  it("does not fetch when the factory origin disagrees with the source name", async () => {
++    const fetchMock = vi.fn();
++    vi.stubGlobal("fetch", fetchMock);
++    await expect(
++      createCftcPressCheck()(SCOTUS, context())
++    ).rejects.toMatchObject({ reason: "unsafe_url" });
++    expect(fetchMock).not.toHaveBeenCalled();
++  });
++
++  it("maps TimeoutError to timeout and rethrows AbortError", async () => {
++    vi.stubGlobal(
++      "fetch",
++      vi.fn(async () => {
++        throw new DOMException("timed out", "TimeoutError");
++      })
++    );
++    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
++      { reason: "timeout" }
++    );
++
++    vi.stubGlobal(
++      "fetch",
++      vi.fn(async () => {
++        throw new DOMException("aborted", "AbortError");
++      })
++    );
++    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
++      { name: "AbortError" }
++    );
++  });
++
++  it("maps other fetch failures to network", async () => {
++    vi.stubGlobal(
++      "fetch",
++      vi.fn(async () => {
++        throw new TypeError("boom");
++      })
++    );
++    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
++      { reason: "network" }
++    );
++  });
++
++  it("does not read a 200 whose Content-Length is over the cap", async () => {
++    let pulled = false;
++    const stream = new ReadableStream(
++      {
++        pull() {
++          pulled = true;
++          throw new Error("body was read");
++        }
++      },
++      { highWaterMark: 0 }
++    );
++    vi.stubGlobal(
++      "fetch",
++      vi.fn(async () => {
++        return {
++          status: 200,
++          headers: new Headers({
++            "content-length": String(SEEDED_PAGE_MAX_BYTES + 1)
++          }),
++          body: stream
++        } as Response;
++      })
++    );
++    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
++      { reason: "response_too_large", detail: {} }
++    );
++    expect(pulled).toBe(false);
++  });
++
++  it("rejects a 200 body that exceeds the cap while being read", async () => {
++    const chunk = new Uint8Array(SEEDED_PAGE_MAX_BYTES + 1);
++    vi.stubGlobal(
++      "fetch",
++      vi.fn(async () => new Response(chunk, { status: 200 }))
++    );
++    await expect(
++      createSeededPageCheck("https://www.cftc.gov")(CFTC, context())
++    ).rejects.toMatchObject({ reason: "response_too_large" });
++  });
++});
+diff --git a/src/pipeline/connectors/publicSource.ts b/src/pipeline/connectors/publicSource.ts
+new file mode 100644
+index 0000000..1d7135a
+--- /dev/null
++++ b/src/pipeline/connectors/publicSource.ts
+@@ -0,0 +1,210 @@
++import {
++  SourceUnavailableError,
++  type SourceCheck,
++  type SourceCheckContext
++} from "./connector";
++import { reasonForStatus, scrubResponseDetail } from "./courtListener";
++import { POLL_SOURCES } from "./sources";
++import {
++  fetchWithTimeout,
++  isAbortError,
++  isTimeoutError,
++  SOURCE_FETCH_TIMEOUT_MS
++} from "../../shared/lib/timeouts";
++
++/** One seeded page poll. Three of these plus CourtListener stay under 10 minutes. */
++export const SEEDED_PAGE_POLL_TIMEOUT_MS = 20_000;
++/** A 200 body larger than this is `response_too_large` and is not parsed. */
++export const SEEDED_PAGE_MAX_BYTES = 1_000_000;
++/** Non-200 bodies are scrubbed from this prefix only. */
++export const SEEDED_PAGE_ERROR_BODY_MAX_BYTES = 8192;
++
++const CONTENT_TYPE_MAX = 120;
++
++const ACCEPT =
++  "text/html, application/xhtml+xml, application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8";
++
++const SEEDED_NAMES = new Set([
++  "CFTC press",
++  "SCOTUS docket",
++  "Legal news leads"
++]);
++
++function allowedOrigin(name: string): string | null {
++  if (!SEEDED_NAMES.has(name)) return null;
++  const seeded = POLL_SOURCES.find((source) => source.name === name);
++  if (seeded == null) return null;
++  return new URL(seeded.url).origin;
++}
++
++/** Same-origin https only. The rejected URL stays out of the error. */
++function guardedUrl(input: string, origin: string): string {
++  let url: URL;
++  try {
++    if (
++      !input ||
++      input.includes("\\") ||
++      /%(?![0-9a-f]{2})/i.test(input) ||
++      Array.from(input).some((char) => {
++        const code = char.charCodeAt(0);
++        return code <= 0x20 || code === 0x7f;
++      })
++    ) {
++      throw new Error("invalid URL");
++    }
++    url = new URL(input);
++  } catch (err) {
++    if (err instanceof SourceUnavailableError) throw err;
++    throw new SourceUnavailableError("unsafe_url");
++  }
++  if (
++    url.protocol !== "https:" ||
++    url.origin !== origin ||
++    url.username !== "" ||
++    url.password !== ""
++  ) {
++    throw new SourceUnavailableError("unsafe_url");
++  }
++  return url.href;
++}
++
++function concatBytes(chunks: Uint8Array[], total: number): Uint8Array {
++  const out = new Uint8Array(total);
++  let offset = 0;
++  for (const chunk of chunks) {
++    out.set(chunk, offset);
++    offset += chunk.byteLength;
++  }
++  return out;
++}
++
++/** Read at most `maxBytes` and leave the rest of the stream unread. */
++async function readAtMost(
++  response: Response,
++  maxBytes: number
++): Promise<Uint8Array> {
++  const reader = response.body?.getReader();
++  if (!reader) return new Uint8Array(0);
++  const chunks: Uint8Array[] = [];
++  let total = 0;
++  while (total < maxBytes) {
++    const { done, value } = await reader.read();
++    if (done) break;
++    if (value == null || value.byteLength === 0) continue;
++    const room = maxBytes - total;
++    if (value.byteLength > room) {
++      chunks.push(value.subarray(0, room));
++      total += room;
++      break;
++    }
++    chunks.push(value);
++    total += value.byteLength;
++  }
++  return concatBytes(chunks, total);
++}
++
++function declaredLength(response: Response): number | null {
++  const raw = response.headers.get("content-length")?.trim();
++  if (raw == null || !/^\d+$/.test(raw)) return null;
++  const value = Number(raw);
++  return Number.isSafeInteger(value) ? value : null;
++}
++
++async function readSuccessBody(response: Response): Promise<Uint8Array> {
++  const declared = declaredLength(response);
++  if (declared != null && declared > SEEDED_PAGE_MAX_BYTES) {
++    throw new SourceUnavailableError("response_too_large");
++  }
++  const reader = response.body?.getReader();
++  if (!reader) return new Uint8Array(0);
++  const chunks: Uint8Array[] = [];
++  let total = 0;
++  while (true) {
++    const { done, value } = await reader.read();
++    if (done) break;
++    if (value == null || value.byteLength === 0) continue;
++    if (total + value.byteLength > SEEDED_PAGE_MAX_BYTES) {
++      throw new SourceUnavailableError("response_too_large");
++    }
++    chunks.push(value);
++    total += value.byteLength;
++  }
++  return concatBytes(chunks, total);
++}
++
++function contentTypeOf(response: Response): string | null {
++  const value = response.headers.get("content-type");
++  if (value == null) return null;
++  return value.length > CONTENT_TYPE_MAX
++    ? value.slice(0, CONTENT_TYPE_MAX)
++    : value;
++}
++
++async function errorDetail(response: Response): Promise<string> {
++  const bytes = await readAtMost(response, SEEDED_PAGE_ERROR_BODY_MAX_BYTES);
++  return scrubResponseDetail(new TextDecoder().decode(bytes), "");
++}
++
++function unavailable(
++  reason: string,
++  detail: Record<string, unknown>
++): SourceUnavailableError {
++  return new SourceUnavailableError(reason, detail);
++}
++
++async function fetchSeededPage(
++  url: string,
++  context: SourceCheckContext | undefined
++): Promise<Response> {
++  try {
++    return await fetchWithTimeout(
++      url,
++      {
++        signal: context?.signal,
++        redirect: "manual",
++        headers: { accept: ACCEPT }
++      },
++      SOURCE_FETCH_TIMEOUT_MS
++    );
++  } catch (err) {
++    if (isAbortError(err)) throw err;
++    if (isTimeoutError(err)) throw unavailable("timeout", {});
++    throw unavailable("network", {});
++  }
++}
++
++/**
++ * One same-origin fetch for a seeded page. `origin` is the factory's host.
++ * It must match the `POLL_SOURCES` origin for `source.name`.
++ */
++export function createSeededPageCheck(origin: string): SourceCheck {
++  const check: SourceCheck = async (source, context) => {
++    const allowed = allowedOrigin(source.name);
++    if (allowed == null || allowed !== origin) {
++      throw unavailable("unsafe_url", {});
++    }
++    const url = guardedUrl(source.url, allowed);
++    await context?.beforeRequest();
++    const response = await fetchSeededPage(url, context);
++    if (response.status >= 300 && response.status < 400) {
++      throw unavailable("redirect", { status: response.status });
++    }
++    if (response.status !== 200) {
++      const detail = await errorDetail(response);
++      throw unavailable(reasonForStatus(response.status), {
++        status: response.status,
++        ...(detail ? { detail } : {})
++      });
++    }
++    const contentType = contentTypeOf(response);
++    const bytes = await readSuccessBody(response);
++    return [
++      {
++        entities: [],
++        fetched: { status: 200, contentType, bytes: bytes.byteLength }
++      }
++    ];
++  };
++  Object.assign(check, { pollTimeoutMs: SEEDED_PAGE_POLL_TIMEOUT_MS });
++  return check;
++}
+diff --git a/src/pipeline/connectors/scotusDocket.ts b/src/pipeline/connectors/scotusDocket.ts
+new file mode 100644
+index 0000000..dbce667
+--- /dev/null
++++ b/src/pipeline/connectors/scotusDocket.ts
+@@ -0,0 +1,5 @@
++import { createSeededPageCheck } from "./publicSource";
++
++export function createScotusDocketCheck() {
++  return createSeededPageCheck("https://www.supremecourt.gov");
++}
+`. Read that file — it is the content under review.
+
+Do not invoke any skill, and do not spawn subagents of your own — you are the reviewer. Return your findings as text in your final message; do not route them through any findings-reporting tool the host may offer.
diff --git a/_bmad-output/implementation-artifacts/review-3-39-edge-case-hunter.md b/_bmad-output/implementation-artifacts/review-3-39-edge-case-hunter.md
new file mode 100644
index 0000000..0e11897
--- /dev/null
+++ b/_bmad-output/implementation-artifacts/review-3-39-edge-case-hunter.md
@@ -0,0 +1,1244 @@
+Read `# Edge Case Hunter Review
+
+**Goal:** You are a pure path tracer. Never comment on whether code is good or bad; only list missing handling.
+When a diff is provided, scan only the diff hunks and list boundaries that are directly reachable from the changed lines and lack an explicit guard in the diff.
+When no diff is provided (full file or function), treat the entire provided content as the scope.
+Ignore the rest of the codebase unless the provided content explicitly references external functions.
+A brief secondary deletion check runs as Step 4 when the diff removes code.
+A claims check runs as Step 5.
+
+**Inputs:**
+- **content** — Content to review, or a path to read it from: diff, full file, or function
+- **also_consider** (optional) — Areas to keep in mind during review alongside normal edge-case analysis
+- **claims_file** — Path to the spec this change was built from. Do NOT read it before Step 5: the path tracing in Steps 2–3 must finish before the claims are seen.
+
+**MANDATORY: Execute steps in the Execution section IN EXACT ORDER. DO NOT skip steps or change the sequence. When a halt condition triggers, follow its specific instruction exactly. Each action within a step is a REQUIRED action to complete that step.**
+
+**Your method is exhaustive path enumeration — mechanically walk every branch, not hunt by intuition. Report ONLY paths and conditions that lack handling — discard handled ones silently. Do NOT editorialize or add filler. Do not assign severity labels, rankings, or priority levels.**
+
+
+## EXECUTION
+
+### Step 1: Receive Content
+
+- Take the content to review from the parent message that launched you — inline, or by reading the file it points to (never from this instruction file)
+- If no content is supplied, or it is empty, unreadable, or cannot be decoded as text, return `[{"location":"N/A","trigger_condition":"Input empty or undecodable","guard_snippet":"Provide valid content to review","potential_consequence":"Review skipped — no analysis performed"}]` and stop
+- Identify content type (diff, full file, or function) to determine scope rules
+
+### Step 2: Exhaustive Path Analysis
+
+**Walk every branching path and boundary condition within scope — report only unhandled ones.**
+
+- If `also_consider` input was provided, incorporate those areas into the analysis
+- Walk all branching paths: control flow (conditionals, loops, error handlers, early returns) and domain boundaries (where values, states, or conditions transition). Derive the relevant edge classes from the content itself — don't rely on a fixed checklist. Examples: missing else/default, unguarded inputs, off-by-one loops, arithmetic overflow, implicit type coercion, race conditions, timeout gaps
+- Consider implicit branches: the diff special-cases or changes the handling of one or more members of a fixed set of values — enums, status codes, sentinels, type tags, flags, value ranges. The rest of the set is implicit branches (e.g. the diff changes the `RED` and `YELLOW` cases of a `RED`/`YELLOW`/`GREEN` enum; `GREEN` is the implicit branch)
+- Consider handle lifetime: when the changed code re-checks, re-fetches, or re-validates something it already held — a handle, index, id, pointer — the re-check exists because an intervening call can invalidate it. Identify that call, what it does to the thing held, and what the changed code silently skips when the re-check fails
+- For each call site the diff adds or changes — in test files as well as production code — read the callee's declaration and check the call against it: argument count, order, types, and defaults. Report any mismatch
+- For each path: determine whether the content handles it
+- Collect only the unhandled paths as findings — discard handled ones silently
+
+### Step 3: Validate Completeness
+
+- Revisit every edge class from Step 2 — e.g., missing else/default, null/empty inputs, off-by-one loops, arithmetic overflow, implicit type coercion, race conditions, timeout gaps
+- Add any newly found unhandled paths to findings; discard confirmed-handled ones
+
+### Step 4: Deletion Check
+
+If the diff removed or replaced meaningful code (ignore pure renames and whitespace): load `references/deletion-check.md` and follow it.
+
+### Step 5: Claims Check
+
+Load `references/claims-check.md` and follow it.
+
+### Step 6: Present Findings
+
+Output all findings as a single JSON array following the Output Format specification exactly.
+
+
+## OUTPUT FORMAT
+
+Return ONLY a valid JSON array of objects. Each edge-case finding contains exactly these four fields:
+
+```json
+[{
+  "location": "file:start-end (or file:line when single line, or file:hunk when exact line unavailable)",
+  "trigger_condition": "one-line description (max 15 words)",
+  "guard_snippet": "minimal code sketch that closes the gap (single-line escaped string, no raw newlines or unescaped quotes)",
+  "potential_consequence": "what could actually go wrong (max 15 words)"
+}]
+```
+
+No extra text, no explanations, no markdown wrapping. An empty array `[]` is valid when nothing is found. Deletion findings from Step 4 and claim findings from Step 5, if any, go in the same array with the extra fields defined in `references/deletion-check.md` and `references/claims-check.md`.
+
+
+## HALT CONDITIONS
+
+- If no content is supplied, or it is empty, unreadable, or cannot be decoded as text, return `[{"location":"N/A","trigger_condition":"Input empty or undecodable","guard_snippet":"Provide valid content to review","potential_consequence":"Review skipped — no analysis performed"}]` and stop
+<reference path="references/deletion-check.md">
+# Deletion Check
+
+Secondary pass for the Edge Case Hunter — runs only when the diff removed meaningful code. Subordinate to the edge-case pass; findings are usually few or none.
+
+For each chunk of removed or replaced code (ignore pure renames and whitespace), ask: did it carry behavior or a contract that the change neither re-established nor intentionally retired? Add a finding for any resulting regression, orphaned reference, or newly-dead code. Skip anything already covered by your edge-case findings.
+
+Append each finding to the same JSON array as the edge-case findings, with the four standard fields plus:
+
+- `kind`: `"deletion"`
+- `confidence`: `"high"`, `"medium"`, or `"low"` — these are inferences; rate them
+
+For a deletion finding the standard fields read as: `location` = the removed item; `trigger_condition` = the behavior or contract it enforced; `guard_snippet` = where or how to re-establish it; `potential_consequence` = the regression or orphan.
+
+Add nothing if nothing qualifies.
+</reference>
+<reference path="references/claims-check.md">
+# Claims Check
+
+Final pass for the Edge Case Hunter. Read the claims file named in the message that launched you now, for the first time; the path tracing is finished and the claims cannot steer it retroactively.
+
+It is the spec the change was built from. Read only its `## Intent` and `## Tasks & Acceptance` sections — the claims live there; ignore the rest of the file. The spec is the change's own account of itself: testimony, not evidence — a claim repeated in a code comment is still the same claim, not confirmation. Extract each checkable claim — what the change does, what it preserves, ordering, arithmetic, and parity with existing code ("exactly as X does") — then try to falsify each one against the code you have already traced. Where your trace is not enough to decide, read the code that decides it: the compared-to function, the actual callee, the state the claim assumes.
+
+Append one finding per falsified claim to the same JSON array, with the four standard fields plus:
+
+- `kind`: `"claim"`
+- `confidence`: `"high"`, `"medium"`, or `"low"`
+
+For a claim finding the standard fields read as: `location` = where the code contradicts the claim; `trigger_condition` = the claim, quoted or tightly paraphrased; `guard_snippet` = what the code actually does; `potential_consequence` = what goes wrong for someone who believed the claim.
+
+Verified claims produce nothing. Add nothing if nothing is falsified.
+</reference>
+
+## CONTENT SOURCE
+
+"Review content:" in the message that launched you gives the content itself or a path to read it from. Read the file when it is a path; either way that is the content under review, and this instruction file never is.
+` completely and follow it as your review instructions.
+
+claims_file (leave unread until your instructions call for it): ---
+title: '3.39 — Wire seeded CFTC, SCOTUS, and legal-news sources'
+type: 'feature'
+created: '2026-10-22'
+status: 'in-review'
+route: 'dispatch'
+baseline_commit: 'f234f8c3be99068b86a309cd602c45e650d91254'
+review_loop_iteration: 0
+context:
+  - '{project-root}/_bmad-output/implementation-artifacts/3-39-wire-seeded-cftc-scotus-and-legal-news-sources.md'
+  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
+---
+
+<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">
+
+## Intent
+
+**Problem:** A Run that finds nothing new on CourtListener still finishes empty while CFTC press, SCOTUS docket, and Legal news leads are skipped as `not wired`. Those three seeded sources are never fetched.
+
+**Approach:** Register one check per seeded name. Each check performs a single same-origin fetch and records `source.fetched` with no entities, or a named access skip other than `not wired`. CourtListener stays as it is.
+
+## Boundaries & Constraints
+
+**Always:** Tiers come from the snapshotted source. A 200 returns `entities: []` plus `status`, `bytes`, and `contentType` truncated to 120 characters. Non-200 bodies are read only up to 8192 bytes before scrubbing. Each new check's `pollTimeoutMs` is 20 seconds. `redirect` is `manual`. Call `beforeRequest` immediately before `fetch`. Reuse `reasonForStatus` and `scrubResponseDetail`. `stubCheck` remains the fallback for an unknown name.
+
+**Never:** Do not emit Drafts or write F1 from these three checks, even when the body contains a docket number. Do not send `authorization` or the CourtListener token. Do not retry, pace, paginate, follow redirects, or fetch a second URL. Do not change CourtListener pacing or fail-on-first behavior. Do not pass a step config to `run-daily-step`, add a dependency, migration, or secret, deploy, or call staging, production, or a paid model. Do not start story 3.40.
+
+## I/O & Edge-Case Matrix
+
+| Scenario | Input / State | Expected Output / Behavior | Error Handling |
+|---|---|---|---|
+| Consulted, nothing new | Token set; CourtListener has no new entries; each of the three returns 200 | Three `source.fetched` events, `itemCount` 0, `failed` false; Run `empty` | N/A |
+| Token absent | `COURTLISTENER_API_TOKEN` unset | CourtListener skips `unconfigured` and is not fetched; the three still fetch | Their reasons are not `not wired` |
+| Access skip beside CourtListener drafts | One of the three returns 403; CourtListener returns entries | That source skips `http_403`; CourtListener Drafts remain | `failed` true on the skip only |
+| Access skip, no Drafts | One of the three returns 403; CourtListener adds nothing | Zero Drafts; Run `failed`, not `empty` | Do not force `empty` |
+| Rate limit or server error | 429 or 5xx on one new check | One fetch; skip `http_429` or `http_5xx` | No retry |
+| Redirect or foreign URL | 302, or a snapshotted URL on another origin | No second fetch; foreign URL is `unsafe_url` and is not fetched | Do not read `Location` or put the rejected URL in evidence |
+| Docket number in a 200 body | Body contains `1:26-cv-03659` | Zero Drafts and zero new `docket_events` | N/A |
+| Token present | Token set on the env | The three requests have no `authorization` header; the token is absent from evidence | N/A |
+
+</frozen-after-approval>
+
+## Code Map
+
+- `src/pipeline/connectors/sources.ts` — `POLL_SOURCES` names, URLs, and tiers. Do not edit.
+- `src/pipeline/workflow/dailyRun.ts` `sourceChecksFromEnv` — today returns only CourtListener. Add the three checks in `POLL_SOURCES` order. Do not pass the token, wait, clock, or database into them. `step.do("run-daily-step")` at line 350 takes no config.
+- `src/pipeline/connectors/connector.ts` `stubCheck`, `observe`, `SourceUnavailableError`, `runConnector` — empty `stubCheck` is `not wired`; a real check with `fetched` and no entities is `source.fetched`; `SourceUnavailableError` is `source.skipped` with `failed: true`. Reuse this. Do not change it.
+- `src/pipeline/workflow/dailyRunSteps.ts` `monitorAndPackage`, `completeDailyStep` — unknown names use `stubCheck`. Drafts finish `awaiting`; zero drafts plus `anyFailure` finish `failed`; otherwise `empty`.
+- `src/pipeline/gate/f1Apply.ts` — live writes, including a Tier-1 `docket_events` insert. These checks must not create a Draft that approval could publish.
+- `src/pipeline/connectors/courtListener.ts` `reasonForStatus`, `scrubResponseDetail`, `COURTLISTENER_POLL_TIMEOUT_MS` — reuse the helpers. Do not change pacing. `pollTimeoutMs` is attached with `Object.assign`.
+- `src/shared/lib/timeouts.ts` — `SOURCE_FETCH_TIMEOUT_MS` is 12 seconds; `CONNECTOR_TIMEOUT_MS` is 60 seconds. Update the comment that says only CourtListener sets `pollTimeoutMs`. Do not change the constants.
+- `src/pipeline/workflow/dailyRun.test.ts` — the story 3.21 registry tests expect only CourtListener and `not wired` for the rest. `src/pipeline/workflow/dailyRunRecovery.test.ts` asserts `run-daily-step` has no config. `connector.test.ts` passes its own check maps; leave the `not wired` leftover count alone.
+
+## Tasks & Acceptance
+
+**Execution:**
+- [x] `src/pipeline/connectors/publicSource.ts` — one same-origin fetch and the 20-second, 1_000_000-byte, and 8192-byte caps — shared by the three checks.
+- [x] `src/pipeline/connectors/cftcPress.ts`, `scotusDocket.ts`, `legalNewsLeads.ts` — thin factories for `https://www.cftc.gov`, `https://www.supremecourt.gov`, and `https://news.bloomberglaw.com`.
+- [x] `src/pipeline/connectors/publicSource.test.ts` — stub `fetch` and cover the matrix rows that do not need a full Run.
+- [x] `src/pipeline/workflow/dailyRun.ts` — register the three checks.
+- [x] `src/pipeline/workflow/dailyRun.test.ts` — replace the CourtListener-only registry assertions and cover empty versus failed Runs, plus the token header.
+- [x] `src/shared/lib/timeouts.ts` — comment only.
+
+**Acceptance Criteria:**
+- Given poll-sources version 0, when a Run packages it, then CFTC press and SCOTUS docket are Tier-1, Legal news leads is Tier-2, and none of the three records `not wired`.
+- Given the three new poll budgets plus the CourtListener poll budget, when they are added, then the sum is under 10 minutes.
+- Given `npm run check` and `npm test`, when they run, then both exit 0. No deploy and no live or paid call.
+
+## Implementation Notes
+
+## Spec Change Log
+
+## Review Triage Log
+
+## Verification
+
+**Commands:**
+- `npm run check` — expected: exit 0
+- `npm test` — expected: exit 0
+
+
+Review content: the unified diff at `diff --git a/_bmad-output/implementation-artifacts/spec-3-39-wire-seeded-cftc-scotus-and-legal-news-sources.md b/_bmad-output/implementation-artifacts/spec-3-39-wire-seeded-cftc-scotus-and-legal-news-sources.md
+index 2b86174..a8468f5 100644
+--- a/_bmad-output/implementation-artifacts/spec-3-39-wire-seeded-cftc-scotus-and-legal-news-sources.md
++++ b/_bmad-output/implementation-artifacts/spec-3-39-wire-seeded-cftc-scotus-and-legal-news-sources.md
+@@ -2,8 +2,9 @@
+ title: '3.39 — Wire seeded CFTC, SCOTUS, and legal-news sources'
+ type: 'feature'
+ created: '2026-10-22'
+-status: 'draft'
++status: 'in-review'
+ route: 'dispatch'
++baseline_commit: 'f234f8c3be99068b86a309cd602c45e650d91254'
+ review_loop_iteration: 0
+ context:
+   - '{project-root}/_bmad-output/implementation-artifacts/3-39-wire-seeded-cftc-scotus-and-legal-news-sources.md'
+@@ -53,12 +54,12 @@ context:
+ ## Tasks & Acceptance
+ 
+ **Execution:**
+-- [ ] `src/pipeline/connectors/publicSource.ts` — one same-origin fetch and the 20-second, 1_000_000-byte, and 8192-byte caps — shared by the three checks.
+-- [ ] `src/pipeline/connectors/cftcPress.ts`, `scotusDocket.ts`, `legalNewsLeads.ts` — thin factories for `https://www.cftc.gov`, `https://www.supremecourt.gov`, and `https://news.bloomberglaw.com`.
+-- [ ] `src/pipeline/connectors/publicSource.test.ts` — stub `fetch` and cover the matrix rows that do not need a full Run.
+-- [ ] `src/pipeline/workflow/dailyRun.ts` — register the three checks.
+-- [ ] `src/pipeline/workflow/dailyRun.test.ts` — replace the CourtListener-only registry assertions and cover empty versus failed Runs, plus the token header.
+-- [ ] `src/shared/lib/timeouts.ts` — comment only.
++- [x] `src/pipeline/connectors/publicSource.ts` — one same-origin fetch and the 20-second, 1_000_000-byte, and 8192-byte caps — shared by the three checks.
++- [x] `src/pipeline/connectors/cftcPress.ts`, `scotusDocket.ts`, `legalNewsLeads.ts` — thin factories for `https://www.cftc.gov`, `https://www.supremecourt.gov`, and `https://news.bloomberglaw.com`.
++- [x] `src/pipeline/connectors/publicSource.test.ts` — stub `fetch` and cover the matrix rows that do not need a full Run.
++- [x] `src/pipeline/workflow/dailyRun.ts` — register the three checks.
++- [x] `src/pipeline/workflow/dailyRun.test.ts` — replace the CourtListener-only registry assertions and cover empty versus failed Runs, plus the token header.
++- [x] `src/shared/lib/timeouts.ts` — comment only.
+ 
+ **Acceptance Criteria:**
+ - Given poll-sources version 0, when a Run packages it, then CFTC press and SCOTUS docket are Tier-1, Legal news leads is Tier-2, and none of the three records `not wired`.
+diff --git a/_bmad-output/implementation-artifacts/sprint-status.yaml b/_bmad-output/implementation-artifacts/sprint-status.yaml
+index 681add6..1a1c05f 100644
+--- a/_bmad-output/implementation-artifacts/sprint-status.yaml
++++ b/_bmad-output/implementation-artifacts/sprint-status.yaml
+@@ -36,7 +36,7 @@
+ # - Source epics: _bmad-output/planning-artifacts/epics.md; 3.14–3.21 backfill tracked in 3.26.
+ 
+ generated: 2026-08-09
+-last_updated: 10-22-2026 12:55
++last_updated: 10-22-2026 13:24
+ project: PML
+ project_key: NOKEY
+ tracking_system: file-system
+@@ -115,7 +115,7 @@ development_status:
+   3-38-pace-courtlistener-requests-and-recover-from-http-429: done
+   3-37-prove-the-live-governed-loop-and-reassess-epic-3: done
+   # Added by approved sprint-change-proposal-2026-10-11T1823Z. Checklist 6.4.
+-  3-39-wire-seeded-cftc-scotus-and-legal-news-sources: ready-for-dev
++  3-39-wire-seeded-cftc-scotus-and-legal-news-sources: in-progress
+   3-40-add-further-web-and-publication-sources: backlog
+   # Retrospective 2026-10-11 human override: accepted-with-open-items. Machine verdict was rejected.
+   epic-3-retrospective: done
+diff --git a/src/pipeline/workflow/dailyRun.test.ts b/src/pipeline/workflow/dailyRun.test.ts
+index a239a94..c7c8eba 100644
+--- a/src/pipeline/workflow/dailyRun.test.ts
++++ b/src/pipeline/workflow/dailyRun.test.ts
+@@ -36,6 +36,7 @@ import {
+   timezoneOffsetMs
+ } from "./schedule";
+ import type { SourceCheck } from "../connectors/connector";
++import { POLL_SOURCES } from "../connectors/sources";
+ 
+ const testEnv = env as Env;
+ 
+@@ -622,15 +623,17 @@ describe("sourceChecksFromEnv (story 3.21)", () => {
+     };
+   }
+ 
+-  it("wires exactly CourtListener; the other sources stay not wired", async () => {
++  it("registers CourtListener and the three seeded sources in poll order", async () => {
+     const checks = sourceChecksFromEnv(
+       { COURTLISTENER_API_TOKEN: undefined },
+       testEnv.DB
+     );
+-    expect(Object.keys(checks)).toEqual(["CourtListener"]);
++    expect(Object.keys(checks)).toEqual(
++      POLL_SOURCES.map((source) => source.name)
++    );
+   });
+ 
+-  it("records source.skipped unconfigured for CourtListener and not wired for the rest when the token is absent", async () => {
++  it("fetches the seeded pages when the CourtListener token is absent", async () => {
+     const id = "run-20260901-0e00";
+     await runsRepo.insertRun(testEnv.DB, {
+       id,
+@@ -645,7 +648,16 @@ describe("sourceChecksFromEnv (story 3.21)", () => {
+       scheduledFor: "2026-09-01"
+     });
+     await attachSnapshot(testEnv.DB, id);
+-    const fetchMock = vi.fn();
++    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
++      const url = String(input);
++      if (url.includes("courtlistener.com")) {
++        throw new Error("CourtListener must not be fetched");
++      }
++      return new Response("<html></html>", {
++        status: 200,
++        headers: { "content-type": "text/html" }
++      });
++    });
+     vi.stubGlobal("fetch", fetchMock);
+     const packaged = await packageDailyRun(
+       testEnv.DB,
+@@ -664,22 +676,36 @@ describe("sourceChecksFromEnv (story 3.21)", () => {
+       draftCount: 0,
+       anyFailure: true
+     });
+-    expect(fetchMock).not.toHaveBeenCalled();
+-    const skipped = (await evidenceRepo.listByRun(testEnv.DB, id)).filter(
+-      (e) => e.event === "source.skipped"
+-    );
+-    const reasons = Object.fromEntries(
+-      skipped.map((e) => [
+-        (e.payload as { source: string }).source,
+-        (e.payload as { reason: string }).reason
+-      ])
+-    );
+-    expect(reasons).toEqual({
+-      CourtListener: "unconfigured",
+-      "CFTC press": "not wired",
+-      "SCOTUS docket": "not wired",
+-      "Legal news leads": "not wired"
+-    });
++    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
++      "https://www.cftc.gov/PressRoom/PressReleases",
++      "https://www.supremecourt.gov/docket/",
++      "https://news.bloomberglaw.com/securities-law"
++    ]);
++    const evidence = await evidenceRepo.listByRun(testEnv.DB, id);
++    const skipped = evidence.filter((e) => e.event === "source.skipped");
++    expect(
++      skipped.map((e) => (e.payload as { source: string }).source)
++    ).toEqual(["CourtListener"]);
++    expect(skipped[0]?.payload).toMatchObject({ reason: "unconfigured" });
++    const fetched = evidence.filter((e) => e.event === "source.fetched");
++    expect(
++      fetched.map((e) => (e.payload as { source: string }).source)
++    ).toEqual(["CFTC press", "SCOTUS docket", "Legal news leads"]);
++    for (const event of fetched) {
++      expect(event.payload).toMatchObject({
++        itemCount: 0,
++        failed: false,
++        status: 200,
++        pollSourcesVersion: 0
++      });
++      expect(event.payload).not.toMatchObject({ reason: "not wired" });
++    }
++    expect(fetched.map((e) => (e.payload as { tier: string }).tier)).toEqual([
++      "tier1",
++      "tier1",
++      "tier2"
++    ]);
++    expect(await draftsRepo.listByRun(testEnv.DB, id)).toEqual([]);
+     expect((await runsRepo.getRunById(testEnv.DB, id))?.status).toBe("failed");
+   });
+ 
+@@ -774,12 +800,223 @@ describe("sourceChecksFromEnv (story 3.21)", () => {
+       newEntries: 1
+     });
+     expect(illinois).not.toHaveProperty("skippedOlder");
+-    const authHeaders = fetchMock.mock.calls.map((call) =>
+-      new Headers((call[1] as RequestInit | undefined)?.headers).get(
+-        "authorization"
++    const calls = fetchMock.mock.calls.map((call) => ({
++      url: String(call[0]),
++      authorization: new Headers(
++        (call[1] as RequestInit | undefined)?.headers
++      ).get("authorization")
++    }));
++    const seeded = calls.filter(
++      (call) =>
++        call.url.startsWith("https://www.cftc.gov/") ||
++        call.url.startsWith("https://www.supremecourt.gov/") ||
++        call.url.startsWith("https://news.bloomberglaw.com/")
++    );
++    expect(seeded.map((call) => call.authorization)).toEqual([
++      null,
++      null,
++      null
++    ]);
++    expect(
++      calls
++        .filter((call) => call.url.includes("courtlistener.com"))
++        .every((call) => call.authorization === "Token tok")
++    ).toBe(true);
++    const evidenceText = JSON.stringify(
++      await evidenceRepo.listByRun(testEnv.DB, id)
++    );
++    expect(evidenceText).not.toContain("tok");
++  });
++
++  function courtListenerRows(input: RequestInfo | URL): Response {
++    const url = new URL(String(input));
++    const docket = url.searchParams.get("docket");
++    const floor = url.searchParams.get("date_filed__gte");
++    const rows = [
++      {
++        id: 33901,
++        entry_number: 3,
++        date_filed: "2026-09-20",
++        description: "MINUTE ENTRY: status conference held."
++      }
++    ].filter((row) => floor == null || row.date_filed >= floor);
++    return Response.json({
++      results: docket === "73133459" ? rows : []
++    });
++  }
++
++  async function seedRun(id: string): Promise<void> {
++    await runsRepo.insertRun(testEnv.DB, {
++      id,
++      origin: "scheduled",
++      mode: "hitl",
++      status: "running",
++      startedAt: NOW,
++      completedAt: null,
++      spendCents: 0,
++      spendCurrency: "USD",
++      budgetCents: null,
++      scheduledFor: "2026-09-01"
++    });
++    await attachSnapshot(testEnv.DB, id);
++  }
++
++  function checksWithToken() {
++    return sourceChecksFromEnv(
++      {
++        COURTLISTENER_API_TOKEN: "cl-seeded-page-token",
++        FIRST_FETCH_WINDOW_DAYS: 3,
++        courtListenerWait: async () => {},
++        now: () => "2026-09-20T16:00:00.000Z"
++      },
++      testEnv.DB
++    );
++  }
++
++  it("finishes empty when CourtListener and the seeded pages have nothing new", async () => {
++    const id = "run-20260901-0e02";
++    await seedRun(id);
++    const before = await testEnv.DB.prepare(
++      "SELECT COUNT(*) AS n FROM docket_events"
++    ).first<{ n: number }>();
++    vi.stubGlobal(
++      "fetch",
++      vi.fn(async (input: RequestInfo | URL) => {
++        const url = String(input);
++        if (url.includes("courtlistener.com")) {
++          return Response.json({ results: [] });
++        }
++        return new Response(
++          "<html>index mentions 1:26-cv-03659 and nothing else</html>",
++          { status: 200, headers: { "content-type": "text/html" } }
++        );
++      })
++    );
++    const packaged = await packageDailyRun(
++      testEnv.DB,
++      id,
++      {
++        db: testEnv.DB,
++        costPolicy: fixtureCostPolicy,
++        provider: provider(),
++        now: () => NOW
++      },
++      checksWithToken()
++    );
++    expect(packaged).toMatchObject({
++      skip: false,
++      draftCount: 0,
++      anyFailure: false
++    });
++    const fetched = (await evidenceRepo.listByRun(testEnv.DB, id)).filter(
++      (event) => event.event === "source.fetched"
++    );
++    expect(fetched).toHaveLength(4);
++    for (const event of fetched) {
++      expect(event.payload).toMatchObject({ itemCount: 0, failed: false });
++    }
++    expect(await draftsRepo.listByRun(testEnv.DB, id)).toEqual([]);
++    const after = await testEnv.DB.prepare(
++      "SELECT COUNT(*) AS n FROM docket_events"
++    ).first<{ n: number }>();
++    expect(after?.n).toBe(before?.n);
++    expect((await runsRepo.getRunById(testEnv.DB, id))?.status).toBe("empty");
++    expect(
++      JSON.stringify(await evidenceRepo.listByRun(testEnv.DB, id))
++    ).not.toContain("cl-seeded-page-token");
++  });
++
++  it("keeps CourtListener drafts when one seeded page returns 403", async () => {
++    const id = "run-20260901-0e03";
++    await seedRun(id);
++    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
++      const url = String(input);
++      if (url.startsWith("https://www.cftc.gov/")) {
++        return new Response("denied", { status: 403 });
++      }
++      if (
++        url.startsWith("https://www.supremecourt.gov/") ||
++        url.startsWith("https://news.bloomberglaw.com/")
++      ) {
++        return new Response("<html>ok</html>", { status: 200 });
++      }
++      return courtListenerRows(input);
++    });
++    vi.stubGlobal("fetch", fetchMock);
++    const packaged = await packageDailyRun(
++      testEnv.DB,
++      id,
++      {
++        db: testEnv.DB,
++        costPolicy: fixtureCostPolicy,
++        provider: provider(),
++        now: () => NOW
++      },
++      checksWithToken()
++    );
++    expect(packaged).toMatchObject({ draftCount: 1, anyFailure: true });
++    const drafts = await draftsRepo.listByRun(testEnv.DB, id);
++    expect(drafts).toHaveLength(1);
++    expect(drafts[0]).toMatchObject({
++      targetEntityType: "docket_events",
++      targetEntityId: "de-case-il-cftc-33901"
++    });
++    const evidence = await evidenceRepo.listByRun(testEnv.DB, id);
++    const cftc = evidence.find(
++      (event) =>
++        event.event === "source.skipped" &&
++        (event.payload as { source?: string }).source === "CFTC press"
++    );
++    expect(cftc?.payload).toMatchObject({
++      reason: "http_403",
++      failed: true,
++      status: 403
++    });
++    const courtListener = evidence.find(
++      (event) =>
++        event.event === "source.fetched" &&
++        (event.payload as { source?: string }).source === "CourtListener"
++    );
++    expect(courtListener?.payload).toMatchObject({ failed: false });
++    expect(
++      fetchMock.mock.calls.filter((call) =>
++        String(call[0]).startsWith("https://www.cftc.gov/")
+       )
++    ).toHaveLength(1);
++    expect(JSON.stringify(evidence)).not.toContain("cl-seeded-page-token");
++    expect((await runsRepo.getRunById(testEnv.DB, id))?.status).toBe("running");
++  });
++
++  it("fails the Run when a seeded page is blocked and nothing was drafted", async () => {
++    const id = "run-20260901-0e04";
++    await seedRun(id);
++    vi.stubGlobal(
++      "fetch",
++      vi.fn(async (input: RequestInfo | URL) => {
++        const url = String(input);
++        if (url.startsWith("https://www.cftc.gov/")) {
++          return new Response("denied", { status: 403 });
++        }
++        if (url.includes("courtlistener.com")) {
++          return Response.json({ results: [] });
++        }
++        return new Response("<html>ok</html>", { status: 200 });
++      })
++    );
++    const packaged = await packageDailyRun(
++      testEnv.DB,
++      id,
++      {
++        db: testEnv.DB,
++        costPolicy: fixtureCostPolicy,
++        provider: provider(),
++        now: () => NOW
++      },
++      checksWithToken()
+     );
+-    expect(authHeaders.every((h) => h === "Token tok")).toBe(true);
++    expect(packaged).toMatchObject({ draftCount: 0, anyFailure: true });
++    expect(await draftsRepo.listByRun(testEnv.DB, id)).toEqual([]);
++    expect((await runsRepo.getRunById(testEnv.DB, id))?.status).toBe("failed");
+   });
+ });
+ 
+diff --git a/src/pipeline/workflow/dailyRun.ts b/src/pipeline/workflow/dailyRun.ts
+index 517a6ab..78990c4 100644
+--- a/src/pipeline/workflow/dailyRun.ts
++++ b/src/pipeline/workflow/dailyRun.ts
+@@ -16,6 +16,9 @@ import {
+   firstFetchWindowDays,
+   type CourtListenerWait
+ } from "../connectors/courtListener";
++import { createCftcPressCheck } from "../connectors/cftcPress";
++import { createLegalNewsLeadsCheck } from "../connectors/legalNewsLeads";
++import { createScotusDocketCheck } from "../connectors/scotusDocket";
+ import { llmProvidersFromEnv, type GatewayDeps } from "../ai/gateway";
+ import {
+   ensureRun,
+@@ -87,10 +90,12 @@ export function gatewayDepsFromEnv(
+ }
+ 
+ /**
+- * Story 3.21 — the live connector registry, keyed on the exact source name
++ * Live connector registry, keyed on the exact source name
+  * (3.17 makes names operator-editable; an unknown name falls back to
+- * `stubCheck` → `"not wired"`). The token is a per-Worker secret typed as
+- * optional on `Env`; absent → `source.skipped { reason: "unconfigured" }`.
++ * `stubCheck` → `"not wired"`). The CourtListener token is a per-Worker
++ * secret typed as optional on `Env`; absent →
++ * `source.skipped { reason: "unconfigured" }`. The seeded page checks do
++ * not receive that token, the wait, the clock, or the database.
+  */
+ export function sourceChecksFromEnv(
+   env: Pick<Env, "COURTLISTENER_API_TOKEN" | "FIRST_FETCH_WINDOW_DAYS"> & {
+@@ -112,7 +117,10 @@ export function sourceChecksFromEnv(
+       firstFetchWindowDays: firstFetchWindowDays(env.FIRST_FETCH_WINDOW_DAYS),
+       ...(env.courtListenerWait ? { wait: env.courtListenerWait } : {}),
+       ...(env.now ? { now: env.now } : {})
+-    })
++    }),
++    "CFTC press": createCftcPressCheck(),
++    "SCOTUS docket": createScotusDocketCheck(),
++    "Legal news leads": createLegalNewsLeadsCheck()
+   };
+ }
+ 
+diff --git a/src/shared/lib/timeouts.ts b/src/shared/lib/timeouts.ts
+index 87e9021..f664446 100644
+--- a/src/shared/lib/timeouts.ts
++++ b/src/shared/lib/timeouts.ts
+@@ -24,8 +24,9 @@
+  * (`provider_error`, `source.skipped { reason: "timeout" }`).
+  *
+  * No retries and no backoff live in this module. These constants stay
+- * fixed. CourtListener is the per-check exception: `observe` uses that
+- * check's `pollTimeoutMs` instead of `CONNECTOR_TIMEOUT_MS` (story 3.38).
++ * fixed. `observe` uses a check's `pollTimeoutMs` when the check sets one,
++ * instead of `CONNECTOR_TIMEOUT_MS`. CourtListener sets an 8 minute budget
++ * (story 3.38). Each seeded page check sets 20 seconds (story 3.39).
+  * Pacing and 429 waits live in the CourtListener connector.
+  */
+ 
+diff --git a/src/pipeline/connectors/cftcPress.ts b/src/pipeline/connectors/cftcPress.ts
+new file mode 100644
+index 0000000..26356c2
+--- /dev/null
++++ b/src/pipeline/connectors/cftcPress.ts
+@@ -0,0 +1,5 @@
++import { createSeededPageCheck } from "./publicSource";
++
++export function createCftcPressCheck() {
++  return createSeededPageCheck("https://www.cftc.gov");
++}
+diff --git a/src/pipeline/connectors/legalNewsLeads.ts b/src/pipeline/connectors/legalNewsLeads.ts
+new file mode 100644
+index 0000000..a2dc1f3
+--- /dev/null
++++ b/src/pipeline/connectors/legalNewsLeads.ts
+@@ -0,0 +1,5 @@
++import { createSeededPageCheck } from "./publicSource";
++
++export function createLegalNewsLeadsCheck() {
++  return createSeededPageCheck("https://news.bloomberglaw.com");
++}
+diff --git a/src/pipeline/connectors/publicSource.test.ts b/src/pipeline/connectors/publicSource.test.ts
+new file mode 100644
+index 0000000..06f042f
+--- /dev/null
++++ b/src/pipeline/connectors/publicSource.test.ts
+@@ -0,0 +1,345 @@
++import { afterEach, describe, expect, it, vi } from "vitest";
++
++import { COURTLISTENER_POLL_TIMEOUT_MS } from "./courtListener";
++import { SourceUnavailableError, type SourceCheckContext } from "./connector";
++import { createCftcPressCheck } from "./cftcPress";
++import { createLegalNewsLeadsCheck } from "./legalNewsLeads";
++import {
++  createSeededPageCheck,
++  SEEDED_PAGE_ERROR_BODY_MAX_BYTES,
++  SEEDED_PAGE_MAX_BYTES,
++  SEEDED_PAGE_POLL_TIMEOUT_MS
++} from "./publicSource";
++import { createScotusDocketCheck } from "./scotusDocket";
++import { POLL_SOURCES, type PollSource } from "./sources";
++
++const CFTC = POLL_SOURCES.find((source) => source.name === "CFTC press")!;
++const SCOTUS = POLL_SOURCES.find((source) => source.name === "SCOTUS docket")!;
++
++function context(
++  beforeRequest: () => Promise<void> = async () => {}
++): SourceCheckContext {
++  return { signal: new AbortController().signal, beforeRequest };
++}
++
++function page(
++  status: number,
++  body: BodyInit | null = "",
++  headers?: HeadersInit
++): Response {
++  return new Response(body, { status, headers });
++}
++
++describe("seeded page checks", () => {
++  afterEach(() => vi.unstubAllGlobals());
++
++  it("keeps the three poll budgets inside the default step", () => {
++    for (const check of [
++      createCftcPressCheck(),
++      createScotusDocketCheck(),
++      createLegalNewsLeadsCheck()
++    ]) {
++      expect((check as { pollTimeoutMs?: number }).pollTimeoutMs).toBe(
++        SEEDED_PAGE_POLL_TIMEOUT_MS
++      );
++    }
++    expect(SEEDED_PAGE_POLL_TIMEOUT_MS).toBe(20_000);
++    expect(
++      COURTLISTENER_POLL_TIMEOUT_MS + 3 * SEEDED_PAGE_POLL_TIMEOUT_MS
++    ).toBeLessThan(10 * 60 * 1000);
++  });
++
++  it("returns entities [] and a fetched summary for a 200 that names a docket", async () => {
++    const body = "<html>docket 1:26-cv-03659 remains on the index</html>";
++    const order: string[] = [];
++    const fetchMock = vi.fn(
++      async (_input: RequestInfo | URL, _init?: RequestInit) => {
++        order.push("fetch");
++        return page(200, body, { "content-type": "text/html; charset=utf-8" });
++      }
++    );
++    vi.stubGlobal("fetch", fetchMock);
++    const items = await createCftcPressCheck()(
++      CFTC,
++      context(async () => {
++        order.push("before");
++      })
++    );
++    expect(order).toEqual(["before", "fetch"]);
++    expect(fetchMock).toHaveBeenCalledTimes(1);
++    const init = fetchMock.mock.calls[0]?.[1];
++    expect(init?.redirect).toBe("manual");
++    expect(new Headers(init?.headers).get("authorization")).toBeNull();
++    expect(items).toEqual([
++      {
++        entities: [],
++        fetched: {
++          status: 200,
++          contentType: "text/html; charset=utf-8",
++          bytes: new TextEncoder().encode(body).byteLength
++        }
++      }
++    ]);
++    expect(JSON.stringify(items)).not.toContain("1:26-cv-03659");
++  });
++
++  it("truncates contentType to 120 characters and allows a null type", async () => {
++    const longType = `text/html; ${"a".repeat(200)}`;
++    vi.stubGlobal(
++      "fetch",
++      vi.fn(async () => page(200, "ok", { "content-type": longType }))
++    );
++    const [item] = await createCftcPressCheck()(CFTC, context());
++    expect(item?.fetched?.contentType).toBe(longType.slice(0, 120));
++
++    vi.stubGlobal(
++      "fetch",
++      vi.fn(async () => {
++        const response = page(200, "ok");
++        response.headers.delete("content-type");
++        return response;
++      })
++    );
++    const [again] = await createScotusDocketCheck()(SCOTUS, context());
++    expect(again?.fetched?.contentType).toBeNull();
++    expect(again?.entities).toEqual([]);
++  });
++
++  it("skips a 429 after one fetch and does not retry", async () => {
++    const fetchMock = vi.fn(async () => page(429, "slow down"));
++    vi.stubGlobal("fetch", fetchMock);
++    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
++      {
++        reason: "http_429",
++        detail: { status: 429, detail: "slow down" }
++      }
++    );
++    expect(fetchMock).toHaveBeenCalledTimes(1);
++  });
++
++  it("skips a 5xx after one fetch and does not retry", async () => {
++    const fetchMock = vi.fn(async () => page(503, "unavailable"));
++    vi.stubGlobal("fetch", fetchMock);
++    await expect(
++      createLegalNewsLeadsCheck()(
++        POLL_SOURCES.find((source) => source.name === "Legal news leads")!,
++        context()
++      )
++    ).rejects.toMatchObject({
++      reason: "http_5xx",
++      detail: { status: 503, detail: "unavailable" }
++    });
++    expect(fetchMock).toHaveBeenCalledTimes(1);
++  });
++
++  it("reads at most 8192 error bytes before scrubbing", async () => {
++    let pulled = 0;
++    const stream = new ReadableStream<Uint8Array>(
++      {
++        pull(controller) {
++          if (pulled >= 9000) {
++            controller.close();
++            return;
++          }
++          const size = Math.min(1024, 9000 - pulled);
++          const chunk = new Uint8Array(size);
++          chunk.fill(97);
++          if (pulled === 0) chunk[0] = 84;
++          controller.enqueue(chunk);
++          pulled += size;
++        }
++      },
++      { highWaterMark: 0 }
++    );
++    vi.stubGlobal(
++      "fetch",
++      vi.fn(async () => {
++        return {
++          status: 403,
++          headers: new Headers({ "content-type": "text/html" }),
++          body: stream
++        } as Response;
++      })
++    );
++    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
++      {
++        reason: "http_403",
++        detail: { status: 403, detail: `T${"a".repeat(179)}` }
++      }
++    );
++    expect(pulled).toBe(SEEDED_PAGE_ERROR_BODY_MAX_BYTES);
++  });
++
++  it("does not follow a redirect or read Location", async () => {
++    let pulled = false;
++    const stream = new ReadableStream(
++      {
++        pull(controller) {
++          pulled = true;
++          controller.enqueue(new TextEncoder().encode("secret-body"));
++          controller.close();
++        }
++      },
++      { highWaterMark: 0 }
++    );
++    const fetchMock = vi.fn(async () => {
++      return {
++        status: 302,
++        headers: new Headers({ location: "https://evil.example/secret" }),
++        body: stream
++      } as Response;
++    });
++    vi.stubGlobal("fetch", fetchMock);
++    const err = await Promise.resolve(
++      createCftcPressCheck()(CFTC, context())
++    ).then(
++      () => {
++        throw new Error("redirect was fetched");
++      },
++      (caught: unknown) => caught
++    );
++    expect(err).toBeInstanceOf(SourceUnavailableError);
++    expect(err).toMatchObject({ reason: "redirect", detail: { status: 302 } });
++    expect(
++      JSON.stringify((err as SourceUnavailableError).detail)
++    ).not.toContain("evil.example");
++    expect(fetchMock).toHaveBeenCalledTimes(1);
++    expect(pulled).toBe(false);
++  });
++
++  it("rejects a foreign origin before fetch and omits the URL", async () => {
++    const fetchMock = vi.fn();
++    vi.stubGlobal("fetch", fetchMock);
++    const before = vi.fn(async () => {});
++    const foreign: PollSource = {
++      ...CFTC,
++      url: "https://example.com/PressRoom/PressReleases"
++    };
++    await expect(
++      createCftcPressCheck()(foreign, context(before))
++    ).rejects.toMatchObject({ reason: "unsafe_url", detail: {} });
++    expect(fetchMock).not.toHaveBeenCalled();
++    expect(before).not.toHaveBeenCalled();
++  });
++
++  it("rejects a steered URL that leaves the seeded origin", async () => {
++    const fetchMock = vi.fn();
++    vi.stubGlobal("fetch", fetchMock);
++    const steered: PollSource = {
++      name: "SCOTUS docket",
++      url: "https://user:pw@www.supremecourt.gov/docket/",
++      tier: "tier1"
++    };
++    const err = await Promise.resolve(
++      createScotusDocketCheck()(steered, context())
++    ).then(
++      () => {
++        throw new Error("credentials were fetched");
++      },
++      (caught: unknown) => caught
++    );
++    expect(err).toMatchObject({ reason: "unsafe_url", detail: {} });
++    expect(JSON.stringify(err)).not.toContain("user:pw");
++    expect((err as Error).message).not.toContain("user:pw");
++    expect(fetchMock).not.toHaveBeenCalled();
++  });
++
++  it("fetches a same-origin steered path", async () => {
++    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
++      page(200, "ok")
++    );
++    vi.stubGlobal("fetch", fetchMock);
++    const steered: PollSource = {
++      ...CFTC,
++      url: "https://www.cftc.gov/PressRoom/Other"
++    };
++    const items = await createCftcPressCheck()(steered, context());
++    expect(items[0]?.entities).toEqual([]);
++    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
++      "https://www.cftc.gov/PressRoom/Other"
++    );
++  });
++
++  it("does not fetch when the factory origin disagrees with the source name", async () => {
++    const fetchMock = vi.fn();
++    vi.stubGlobal("fetch", fetchMock);
++    await expect(
++      createCftcPressCheck()(SCOTUS, context())
++    ).rejects.toMatchObject({ reason: "unsafe_url" });
++    expect(fetchMock).not.toHaveBeenCalled();
++  });
++
++  it("maps TimeoutError to timeout and rethrows AbortError", async () => {
++    vi.stubGlobal(
++      "fetch",
++      vi.fn(async () => {
++        throw new DOMException("timed out", "TimeoutError");
++      })
++    );
++    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
++      { reason: "timeout" }
++    );
++
++    vi.stubGlobal(
++      "fetch",
++      vi.fn(async () => {
++        throw new DOMException("aborted", "AbortError");
++      })
++    );
++    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
++      { name: "AbortError" }
++    );
++  });
++
++  it("maps other fetch failures to network", async () => {
++    vi.stubGlobal(
++      "fetch",
++      vi.fn(async () => {
++        throw new TypeError("boom");
++      })
++    );
++    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
++      { reason: "network" }
++    );
++  });
++
++  it("does not read a 200 whose Content-Length is over the cap", async () => {
++    let pulled = false;
++    const stream = new ReadableStream(
++      {
++        pull() {
++          pulled = true;
++          throw new Error("body was read");
++        }
++      },
++      { highWaterMark: 0 }
++    );
++    vi.stubGlobal(
++      "fetch",
++      vi.fn(async () => {
++        return {
++          status: 200,
++          headers: new Headers({
++            "content-length": String(SEEDED_PAGE_MAX_BYTES + 1)
++          }),
++          body: stream
++        } as Response;
++      })
++    );
++    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
++      { reason: "response_too_large", detail: {} }
++    );
++    expect(pulled).toBe(false);
++  });
++
++  it("rejects a 200 body that exceeds the cap while being read", async () => {
++    const chunk = new Uint8Array(SEEDED_PAGE_MAX_BYTES + 1);
++    vi.stubGlobal(
++      "fetch",
++      vi.fn(async () => new Response(chunk, { status: 200 }))
++    );
++    await expect(
++      createSeededPageCheck("https://www.cftc.gov")(CFTC, context())
++    ).rejects.toMatchObject({ reason: "response_too_large" });
++  });
++});
+diff --git a/src/pipeline/connectors/publicSource.ts b/src/pipeline/connectors/publicSource.ts
+new file mode 100644
+index 0000000..1d7135a
+--- /dev/null
++++ b/src/pipeline/connectors/publicSource.ts
+@@ -0,0 +1,210 @@
++import {
++  SourceUnavailableError,
++  type SourceCheck,
++  type SourceCheckContext
++} from "./connector";
++import { reasonForStatus, scrubResponseDetail } from "./courtListener";
++import { POLL_SOURCES } from "./sources";
++import {
++  fetchWithTimeout,
++  isAbortError,
++  isTimeoutError,
++  SOURCE_FETCH_TIMEOUT_MS
++} from "../../shared/lib/timeouts";
++
++/** One seeded page poll. Three of these plus CourtListener stay under 10 minutes. */
++export const SEEDED_PAGE_POLL_TIMEOUT_MS = 20_000;
++/** A 200 body larger than this is `response_too_large` and is not parsed. */
++export const SEEDED_PAGE_MAX_BYTES = 1_000_000;
++/** Non-200 bodies are scrubbed from this prefix only. */
++export const SEEDED_PAGE_ERROR_BODY_MAX_BYTES = 8192;
++
++const CONTENT_TYPE_MAX = 120;
++
++const ACCEPT =
++  "text/html, application/xhtml+xml, application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8";
++
++const SEEDED_NAMES = new Set([
++  "CFTC press",
++  "SCOTUS docket",
++  "Legal news leads"
++]);
++
++function allowedOrigin(name: string): string | null {
++  if (!SEEDED_NAMES.has(name)) return null;
++  const seeded = POLL_SOURCES.find((source) => source.name === name);
++  if (seeded == null) return null;
++  return new URL(seeded.url).origin;
++}
++
++/** Same-origin https only. The rejected URL stays out of the error. */
++function guardedUrl(input: string, origin: string): string {
++  let url: URL;
++  try {
++    if (
++      !input ||
++      input.includes("\\") ||
++      /%(?![0-9a-f]{2})/i.test(input) ||
++      Array.from(input).some((char) => {
++        const code = char.charCodeAt(0);
++        return code <= 0x20 || code === 0x7f;
++      })
++    ) {
++      throw new Error("invalid URL");
++    }
++    url = new URL(input);
++  } catch (err) {
++    if (err instanceof SourceUnavailableError) throw err;
++    throw new SourceUnavailableError("unsafe_url");
++  }
++  if (
++    url.protocol !== "https:" ||
++    url.origin !== origin ||
++    url.username !== "" ||
++    url.password !== ""
++  ) {
++    throw new SourceUnavailableError("unsafe_url");
++  }
++  return url.href;
++}
++
++function concatBytes(chunks: Uint8Array[], total: number): Uint8Array {
++  const out = new Uint8Array(total);
++  let offset = 0;
++  for (const chunk of chunks) {
++    out.set(chunk, offset);
++    offset += chunk.byteLength;
++  }
++  return out;
++}
++
++/** Read at most `maxBytes` and leave the rest of the stream unread. */
++async function readAtMost(
++  response: Response,
++  maxBytes: number
++): Promise<Uint8Array> {
++  const reader = response.body?.getReader();
++  if (!reader) return new Uint8Array(0);
++  const chunks: Uint8Array[] = [];
++  let total = 0;
++  while (total < maxBytes) {
++    const { done, value } = await reader.read();
++    if (done) break;
++    if (value == null || value.byteLength === 0) continue;
++    const room = maxBytes - total;
++    if (value.byteLength > room) {
++      chunks.push(value.subarray(0, room));
++      total += room;
++      break;
++    }
++    chunks.push(value);
++    total += value.byteLength;
++  }
++  return concatBytes(chunks, total);
++}
++
++function declaredLength(response: Response): number | null {
++  const raw = response.headers.get("content-length")?.trim();
++  if (raw == null || !/^\d+$/.test(raw)) return null;
++  const value = Number(raw);
++  return Number.isSafeInteger(value) ? value : null;
++}
++
++async function readSuccessBody(response: Response): Promise<Uint8Array> {
++  const declared = declaredLength(response);
++  if (declared != null && declared > SEEDED_PAGE_MAX_BYTES) {
++    throw new SourceUnavailableError("response_too_large");
++  }
++  const reader = response.body?.getReader();
++  if (!reader) return new Uint8Array(0);
++  const chunks: Uint8Array[] = [];
++  let total = 0;
++  while (true) {
++    const { done, value } = await reader.read();
++    if (done) break;
++    if (value == null || value.byteLength === 0) continue;
++    if (total + value.byteLength > SEEDED_PAGE_MAX_BYTES) {
++      throw new SourceUnavailableError("response_too_large");
++    }
++    chunks.push(value);
++    total += value.byteLength;
++  }
++  return concatBytes(chunks, total);
++}
++
++function contentTypeOf(response: Response): string | null {
++  const value = response.headers.get("content-type");
++  if (value == null) return null;
++  return value.length > CONTENT_TYPE_MAX
++    ? value.slice(0, CONTENT_TYPE_MAX)
++    : value;
++}
++
++async function errorDetail(response: Response): Promise<string> {
++  const bytes = await readAtMost(response, SEEDED_PAGE_ERROR_BODY_MAX_BYTES);
++  return scrubResponseDetail(new TextDecoder().decode(bytes), "");
++}
++
++function unavailable(
++  reason: string,
++  detail: Record<string, unknown>
++): SourceUnavailableError {
++  return new SourceUnavailableError(reason, detail);
++}
++
++async function fetchSeededPage(
++  url: string,
++  context: SourceCheckContext | undefined
++): Promise<Response> {
++  try {
++    return await fetchWithTimeout(
++      url,
++      {
++        signal: context?.signal,
++        redirect: "manual",
++        headers: { accept: ACCEPT }
++      },
++      SOURCE_FETCH_TIMEOUT_MS
++    );
++  } catch (err) {
++    if (isAbortError(err)) throw err;
++    if (isTimeoutError(err)) throw unavailable("timeout", {});
++    throw unavailable("network", {});
++  }
++}
++
++/**
++ * One same-origin fetch for a seeded page. `origin` is the factory's host.
++ * It must match the `POLL_SOURCES` origin for `source.name`.
++ */
++export function createSeededPageCheck(origin: string): SourceCheck {
++  const check: SourceCheck = async (source, context) => {
++    const allowed = allowedOrigin(source.name);
++    if (allowed == null || allowed !== origin) {
++      throw unavailable("unsafe_url", {});
++    }
++    const url = guardedUrl(source.url, allowed);
++    await context?.beforeRequest();
++    const response = await fetchSeededPage(url, context);
++    if (response.status >= 300 && response.status < 400) {
++      throw unavailable("redirect", { status: response.status });
++    }
++    if (response.status !== 200) {
++      const detail = await errorDetail(response);
++      throw unavailable(reasonForStatus(response.status), {
++        status: response.status,
++        ...(detail ? { detail } : {})
++      });
++    }
++    const contentType = contentTypeOf(response);
++    const bytes = await readSuccessBody(response);
++    return [
++      {
++        entities: [],
++        fetched: { status: 200, contentType, bytes: bytes.byteLength }
++      }
++    ];
++  };
++  Object.assign(check, { pollTimeoutMs: SEEDED_PAGE_POLL_TIMEOUT_MS });
++  return check;
++}
+diff --git a/src/pipeline/connectors/scotusDocket.ts b/src/pipeline/connectors/scotusDocket.ts
+new file mode 100644
+index 0000000..dbce667
+--- /dev/null
++++ b/src/pipeline/connectors/scotusDocket.ts
+@@ -0,0 +1,5 @@
++import { createSeededPageCheck } from "./publicSource";
++
++export function createScotusDocketCheck() {
++  return createSeededPageCheck("https://www.supremecourt.gov");
++}
+`. Read that file — it is the content under review.
+
+Do not invoke any skill, and do not spawn subagents of your own — you are the reviewer. If the instruction file is unreadable, report that exact failure and stop. Return your findings as text in your final message; do not route them through any findings-reporting tool the host may offer.
diff --git a/_bmad-output/implementation-artifacts/review-3-39-verification-gap.md b/_bmad-output/implementation-artifacts/review-3-39-verification-gap.md
new file mode 100644
index 0000000..0f19458
--- /dev/null
+++ b/_bmad-output/implementation-artifacts/review-3-39-verification-gap.md
@@ -0,0 +1,1164 @@
+Read `# Verification Gap Review
+
+**Goal:** Find changed behavior that could break without reliable verification catching it. Ask one question — "if the behavior this change is supposed to produce broke where it's actually used, would verification fail?" Do not hunt for correctness bugs, but report genuine problems you notice while tracing verification.
+
+The main verification gap shapes are:
+
+1. **Regression gap:** the changed code regresses where it's used, and no test covering that use would fail.
+2. **Missing-adoption gap:** a place that should now use the new behavior doesn't; it handles the same case its own way, or not at all, and no test would flag the omission.
+3. **Broken-verification gap:** a test appears to cover the changed behavior, but would not actually protect it because it is skipped, flaky, not run in the normal verification path, or too weak to observe the regression.
+
+## Evidence Rules
+
+- Read a test before claiming what it covers, runs, asserts, or misses.
+- Before claiming no test exists, search the whole repo by the symbol under test and by import references; expected file locations are not enough.
+- Never assert what you did not verify. If a finding cannot be grounded, drop it.
+- In a finding, say what you actually checked — "none of the tests I read cover this" — and show how far you looked. Say a test doesn't exist anywhere only when the symbol/import-reference search actually shows that.
+- Do not assign severity, confidence, priority, or ranking.
+
+## Review Sequence
+
+### Step 1: Screen for behavioral change
+
+Screen each part of the change separately. If a part is non-behavioral, skip it. Call a part non-behavioral only when the changed code does not alter return values, thrown errors, caller-visible side effects, or observable state (including iteration order and emitted messages). Once a part meets that test, move on; do not inspect callers or tests for extra confirmation.
+
+Common non-behavioral examples: formatting, comments, whitespace; pure renames; trivial getters/setters and pass-throughs; type-only or compiler-enforced changes with no runtime effect; etc.
+
+Only outcomes produced by deterministic code are worth automatically testing; tests are useless on static source text and brittle on LLM output. Skip those parts.
+
+If every part is skipped, output the clean result (see Output Format).
+
+### Step 2: Find the behavior that changed
+
+Identify what behavior changed compared to the previous version: output, side effect, branch, error path, schema/event shape, config default, validation/authorization rule, external contract, etc. If the change affects more than one behavior, handle each separately.
+
+Treat broad-impact changes as behavioral even when no single changed line looks important: dependency, toolchain, build/config, data-file, etc.
+
+### Step 3: Trace where that behavior is used
+
+Trace the changed behavior to the places that observe it. Start with direct callers and registered entry points (routes, commands, DI), contract consumers (schemas, events, APIs, database readers), and reverse-dependency info if already available.
+
+Follow a path only while the changed behavior is reachable and unverified. Stop when a test at that boundary would fail, the consumer does not observe the changed behavior, or the next hop is guesswork (dynamic dispatch, reflection, outside-repo consumers, etc.). Prefer the nearest observable boundary, often one to three hops away, especially across contract, integration, or service edges. If there are more than five similar consumers, group obvious repeats and check representative paths; expand only when a consumer observes the behavior differently.
+
+### Step 4: Qualify the consumer, then check its test
+
+For each consumer, name the smallest realistic regression this consumer would observe: invert the branch, drop the default, omit the field, return the old error code, skip the integration call, etc. This is the Demonstration. If no such regression exists, drop the path; untested downstream code is not a finding.
+
+A `Missing-adoption gap` qualifies not by the adoption failure alone but by a supersession signal: the change gives clear evidence the new behavior is meant to replace the local one — PR intent, naming or docs, a replaced sibling site, deleted duplicate logic, or a test defining the new rule — and the local site shares the same observable contract. Without a supersession signal and a shared observable contract, it is a refactor suggestion, not a verification-gap finding. Once both hold, check whether any test for that site would flag the non-adoption; missing coverage of the non-adoption is the gap itself, not a disqualifier.
+
+Find and read the relevant test. Ask whether the Demonstration would make an assertion fail.
+
+- If yes, the behavior is verified. No finding.
+- For a regression-style Demonstration: if no test runs the path, the test is skipped/flaky/not run normally, or the test runs the code without checking the changed result, report a `Regression gap` or `Broken-verification gap`.
+- For a qualifying Missing-adoption case: if none of the site tests you found assert it adopts the new behavior, report a `Missing-adoption gap`.
+
+A test counts only if it runs normally and an assertion observes the changed output, branch, or contract. These do not count: no execution; source-text assertions that match a file's wording instead of running it; success/no-throw/snapshot-only checks; mock/log-call checks; human-only checks; tests that mock away the integration; e2e tests that pass through without checking the changed output; stale assertions or fixtures.
+
+For example, `expect(x ?? DEFAULT).toBe(DEFAULT)` passes when `x` is missing.
+
+Common patterns:
+
+- **Caller-path gap** — helper test covers the branch, but caller values skip it.
+- **Contract drift** — payload/schema/event changes must be verified at the consumer.
+- **Migration compatibility** — tests only create new-format rows or fresh schemas.
+- **Phantom exception** — handled partial-failure path has no test.
+- **Missing-adoption gap** — sibling site should use the new rule/helper and does not.
+- **Removed verification** — deleted test or weakened assertion leaves behavior unpinned; removing a source-text assertion is not this, since it never counted.
+
+### Step 5: Confirm each finding is real
+
+Before writing a finding, re-open the specific tests or search results the finding relies on. Verify the Demonstration would not make any test you checked fail, or that the absence claim is backed by the symbol/import-reference search. Do not claim more than you verified; drop any finding you cannot ground.
+
+Explain why the test misses the bug using what the test sets up and checks.
+
+Do not report: compiler/type-checker-enforced cases; behavior already verified by an integration, contract, or e2e test; implementation-detail or mock-only tests; low coverage or a missing test file by itself; legacy untested code the change did not affect.
+
+Report genuine problems you noticed while tracing verification, even if they are not verification gaps. Put them under `Other findings` in the output. This permits reporting what you already reached, not extra hunting. A claim that code misbehaves is a defect, not a gap — it goes under `Other findings` for standard triage, however you found it.
+
+## OUTPUT FORMAT
+
+Emit each verification-gap finding as one block. No general advice, no severity or confidence. Triage trusts a gap finding as filed and does not re-verify it, so each block must stand on its own evidence.
+
+```markdown
+### <one-line title naming the gap>
+
+- **Changed surface:** the exact behavior or contract that changed — `file:line`.
+- **Impacted consumer or site:** named concretely with `file:line` (e.g. "the `createInvoice` mutation used by the billing dashboard at `billing/dashboard.ts:88`," not "callers of this function").
+- **Existing test evidence:**
+  - `Regression gap`: what the relevant test actually asserts, with `file:line`; or, if none, the symbol/import-reference searches run and their result.
+  - `Missing-adoption gap`: tests for the impacted site, and whether any assert it adopts the new behavior.
+  - `Broken-verification gap`: the apparent test or verification path, and why it does not count.
+- **Missing verification:** the precise assertion or check that's absent.
+- **Demonstration:**
+  - `Regression gap` / `Broken-verification gap`: the concrete regression that would ship undetected, and why the tests you checked would not fail.
+  - `Missing-adoption gap`: the case the site mishandles by not adopting the new behavior, and that none of the tests you read assert adoption.
+- **Consequence:** the concrete thing that ships wrong — a regression the checked evidence would not catch, or a site that should use the new behavior and doesn't.
+- **Disposition:** `patch` — name the test to add, fit to the repo's own way of verifying (don't impose a generic test pyramid) — or `defer` when the gap is real but not worth closing as part of this change, with one sentence of why.
+```
+
+If you noticed genuine non-gap problems while tracing verification, append:
+
+```markdown
+## Other findings
+
+- <description only; no severity, confidence, priority, or ranking>
+```
+
+When you find no verification gaps and no other findings, output exactly this single line, not an empty response:
+
+`No verification gaps found.`
+
+## CONTENT SOURCE
+
+"Review content:" in the message that launched you gives the content itself or a path to read it from. Read the file when it is a path; either way that is the content under review, and this instruction file never is. If no content is supplied, or the file it points to is missing, empty, or unreadable, say exactly that and stop — never report a clean review for content you could not read.
+` completely and follow it as your review instructions.
+
+Review content: the unified diff at `diff --git a/_bmad-output/implementation-artifacts/spec-3-39-wire-seeded-cftc-scotus-and-legal-news-sources.md b/_bmad-output/implementation-artifacts/spec-3-39-wire-seeded-cftc-scotus-and-legal-news-sources.md
+index 2b86174..a8468f5 100644
+--- a/_bmad-output/implementation-artifacts/spec-3-39-wire-seeded-cftc-scotus-and-legal-news-sources.md
++++ b/_bmad-output/implementation-artifacts/spec-3-39-wire-seeded-cftc-scotus-and-legal-news-sources.md
+@@ -2,8 +2,9 @@
+ title: '3.39 — Wire seeded CFTC, SCOTUS, and legal-news sources'
+ type: 'feature'
+ created: '2026-10-22'
+-status: 'draft'
++status: 'in-review'
+ route: 'dispatch'
++baseline_commit: 'f234f8c3be99068b86a309cd602c45e650d91254'
+ review_loop_iteration: 0
+ context:
+   - '{project-root}/_bmad-output/implementation-artifacts/3-39-wire-seeded-cftc-scotus-and-legal-news-sources.md'
+@@ -53,12 +54,12 @@ context:
+ ## Tasks & Acceptance
+ 
+ **Execution:**
+-- [ ] `src/pipeline/connectors/publicSource.ts` — one same-origin fetch and the 20-second, 1_000_000-byte, and 8192-byte caps — shared by the three checks.
+-- [ ] `src/pipeline/connectors/cftcPress.ts`, `scotusDocket.ts`, `legalNewsLeads.ts` — thin factories for `https://www.cftc.gov`, `https://www.supremecourt.gov`, and `https://news.bloomberglaw.com`.
+-- [ ] `src/pipeline/connectors/publicSource.test.ts` — stub `fetch` and cover the matrix rows that do not need a full Run.
+-- [ ] `src/pipeline/workflow/dailyRun.ts` — register the three checks.
+-- [ ] `src/pipeline/workflow/dailyRun.test.ts` — replace the CourtListener-only registry assertions and cover empty versus failed Runs, plus the token header.
+-- [ ] `src/shared/lib/timeouts.ts` — comment only.
++- [x] `src/pipeline/connectors/publicSource.ts` — one same-origin fetch and the 20-second, 1_000_000-byte, and 8192-byte caps — shared by the three checks.
++- [x] `src/pipeline/connectors/cftcPress.ts`, `scotusDocket.ts`, `legalNewsLeads.ts` — thin factories for `https://www.cftc.gov`, `https://www.supremecourt.gov`, and `https://news.bloomberglaw.com`.
++- [x] `src/pipeline/connectors/publicSource.test.ts` — stub `fetch` and cover the matrix rows that do not need a full Run.
++- [x] `src/pipeline/workflow/dailyRun.ts` — register the three checks.
++- [x] `src/pipeline/workflow/dailyRun.test.ts` — replace the CourtListener-only registry assertions and cover empty versus failed Runs, plus the token header.
++- [x] `src/shared/lib/timeouts.ts` — comment only.
+ 
+ **Acceptance Criteria:**
+ - Given poll-sources version 0, when a Run packages it, then CFTC press and SCOTUS docket are Tier-1, Legal news leads is Tier-2, and none of the three records `not wired`.
+diff --git a/_bmad-output/implementation-artifacts/sprint-status.yaml b/_bmad-output/implementation-artifacts/sprint-status.yaml
+index 681add6..1a1c05f 100644
+--- a/_bmad-output/implementation-artifacts/sprint-status.yaml
++++ b/_bmad-output/implementation-artifacts/sprint-status.yaml
+@@ -36,7 +36,7 @@
+ # - Source epics: _bmad-output/planning-artifacts/epics.md; 3.14–3.21 backfill tracked in 3.26.
+ 
+ generated: 2026-08-09
+-last_updated: 10-22-2026 12:55
++last_updated: 10-22-2026 13:24
+ project: PML
+ project_key: NOKEY
+ tracking_system: file-system
+@@ -115,7 +115,7 @@ development_status:
+   3-38-pace-courtlistener-requests-and-recover-from-http-429: done
+   3-37-prove-the-live-governed-loop-and-reassess-epic-3: done
+   # Added by approved sprint-change-proposal-2026-10-11T1823Z. Checklist 6.4.
+-  3-39-wire-seeded-cftc-scotus-and-legal-news-sources: ready-for-dev
++  3-39-wire-seeded-cftc-scotus-and-legal-news-sources: in-progress
+   3-40-add-further-web-and-publication-sources: backlog
+   # Retrospective 2026-10-11 human override: accepted-with-open-items. Machine verdict was rejected.
+   epic-3-retrospective: done
+diff --git a/src/pipeline/workflow/dailyRun.test.ts b/src/pipeline/workflow/dailyRun.test.ts
+index a239a94..c7c8eba 100644
+--- a/src/pipeline/workflow/dailyRun.test.ts
++++ b/src/pipeline/workflow/dailyRun.test.ts
+@@ -36,6 +36,7 @@ import {
+   timezoneOffsetMs
+ } from "./schedule";
+ import type { SourceCheck } from "../connectors/connector";
++import { POLL_SOURCES } from "../connectors/sources";
+ 
+ const testEnv = env as Env;
+ 
+@@ -622,15 +623,17 @@ describe("sourceChecksFromEnv (story 3.21)", () => {
+     };
+   }
+ 
+-  it("wires exactly CourtListener; the other sources stay not wired", async () => {
++  it("registers CourtListener and the three seeded sources in poll order", async () => {
+     const checks = sourceChecksFromEnv(
+       { COURTLISTENER_API_TOKEN: undefined },
+       testEnv.DB
+     );
+-    expect(Object.keys(checks)).toEqual(["CourtListener"]);
++    expect(Object.keys(checks)).toEqual(
++      POLL_SOURCES.map((source) => source.name)
++    );
+   });
+ 
+-  it("records source.skipped unconfigured for CourtListener and not wired for the rest when the token is absent", async () => {
++  it("fetches the seeded pages when the CourtListener token is absent", async () => {
+     const id = "run-20260901-0e00";
+     await runsRepo.insertRun(testEnv.DB, {
+       id,
+@@ -645,7 +648,16 @@ describe("sourceChecksFromEnv (story 3.21)", () => {
+       scheduledFor: "2026-09-01"
+     });
+     await attachSnapshot(testEnv.DB, id);
+-    const fetchMock = vi.fn();
++    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
++      const url = String(input);
++      if (url.includes("courtlistener.com")) {
++        throw new Error("CourtListener must not be fetched");
++      }
++      return new Response("<html></html>", {
++        status: 200,
++        headers: { "content-type": "text/html" }
++      });
++    });
+     vi.stubGlobal("fetch", fetchMock);
+     const packaged = await packageDailyRun(
+       testEnv.DB,
+@@ -664,22 +676,36 @@ describe("sourceChecksFromEnv (story 3.21)", () => {
+       draftCount: 0,
+       anyFailure: true
+     });
+-    expect(fetchMock).not.toHaveBeenCalled();
+-    const skipped = (await evidenceRepo.listByRun(testEnv.DB, id)).filter(
+-      (e) => e.event === "source.skipped"
+-    );
+-    const reasons = Object.fromEntries(
+-      skipped.map((e) => [
+-        (e.payload as { source: string }).source,
+-        (e.payload as { reason: string }).reason
+-      ])
+-    );
+-    expect(reasons).toEqual({
+-      CourtListener: "unconfigured",
+-      "CFTC press": "not wired",
+-      "SCOTUS docket": "not wired",
+-      "Legal news leads": "not wired"
+-    });
++    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
++      "https://www.cftc.gov/PressRoom/PressReleases",
++      "https://www.supremecourt.gov/docket/",
++      "https://news.bloomberglaw.com/securities-law"
++    ]);
++    const evidence = await evidenceRepo.listByRun(testEnv.DB, id);
++    const skipped = evidence.filter((e) => e.event === "source.skipped");
++    expect(
++      skipped.map((e) => (e.payload as { source: string }).source)
++    ).toEqual(["CourtListener"]);
++    expect(skipped[0]?.payload).toMatchObject({ reason: "unconfigured" });
++    const fetched = evidence.filter((e) => e.event === "source.fetched");
++    expect(
++      fetched.map((e) => (e.payload as { source: string }).source)
++    ).toEqual(["CFTC press", "SCOTUS docket", "Legal news leads"]);
++    for (const event of fetched) {
++      expect(event.payload).toMatchObject({
++        itemCount: 0,
++        failed: false,
++        status: 200,
++        pollSourcesVersion: 0
++      });
++      expect(event.payload).not.toMatchObject({ reason: "not wired" });
++    }
++    expect(fetched.map((e) => (e.payload as { tier: string }).tier)).toEqual([
++      "tier1",
++      "tier1",
++      "tier2"
++    ]);
++    expect(await draftsRepo.listByRun(testEnv.DB, id)).toEqual([]);
+     expect((await runsRepo.getRunById(testEnv.DB, id))?.status).toBe("failed");
+   });
+ 
+@@ -774,12 +800,223 @@ describe("sourceChecksFromEnv (story 3.21)", () => {
+       newEntries: 1
+     });
+     expect(illinois).not.toHaveProperty("skippedOlder");
+-    const authHeaders = fetchMock.mock.calls.map((call) =>
+-      new Headers((call[1] as RequestInit | undefined)?.headers).get(
+-        "authorization"
++    const calls = fetchMock.mock.calls.map((call) => ({
++      url: String(call[0]),
++      authorization: new Headers(
++        (call[1] as RequestInit | undefined)?.headers
++      ).get("authorization")
++    }));
++    const seeded = calls.filter(
++      (call) =>
++        call.url.startsWith("https://www.cftc.gov/") ||
++        call.url.startsWith("https://www.supremecourt.gov/") ||
++        call.url.startsWith("https://news.bloomberglaw.com/")
++    );
++    expect(seeded.map((call) => call.authorization)).toEqual([
++      null,
++      null,
++      null
++    ]);
++    expect(
++      calls
++        .filter((call) => call.url.includes("courtlistener.com"))
++        .every((call) => call.authorization === "Token tok")
++    ).toBe(true);
++    const evidenceText = JSON.stringify(
++      await evidenceRepo.listByRun(testEnv.DB, id)
++    );
++    expect(evidenceText).not.toContain("tok");
++  });
++
++  function courtListenerRows(input: RequestInfo | URL): Response {
++    const url = new URL(String(input));
++    const docket = url.searchParams.get("docket");
++    const floor = url.searchParams.get("date_filed__gte");
++    const rows = [
++      {
++        id: 33901,
++        entry_number: 3,
++        date_filed: "2026-09-20",
++        description: "MINUTE ENTRY: status conference held."
++      }
++    ].filter((row) => floor == null || row.date_filed >= floor);
++    return Response.json({
++      results: docket === "73133459" ? rows : []
++    });
++  }
++
++  async function seedRun(id: string): Promise<void> {
++    await runsRepo.insertRun(testEnv.DB, {
++      id,
++      origin: "scheduled",
++      mode: "hitl",
++      status: "running",
++      startedAt: NOW,
++      completedAt: null,
++      spendCents: 0,
++      spendCurrency: "USD",
++      budgetCents: null,
++      scheduledFor: "2026-09-01"
++    });
++    await attachSnapshot(testEnv.DB, id);
++  }
++
++  function checksWithToken() {
++    return sourceChecksFromEnv(
++      {
++        COURTLISTENER_API_TOKEN: "cl-seeded-page-token",
++        FIRST_FETCH_WINDOW_DAYS: 3,
++        courtListenerWait: async () => {},
++        now: () => "2026-09-20T16:00:00.000Z"
++      },
++      testEnv.DB
++    );
++  }
++
++  it("finishes empty when CourtListener and the seeded pages have nothing new", async () => {
++    const id = "run-20260901-0e02";
++    await seedRun(id);
++    const before = await testEnv.DB.prepare(
++      "SELECT COUNT(*) AS n FROM docket_events"
++    ).first<{ n: number }>();
++    vi.stubGlobal(
++      "fetch",
++      vi.fn(async (input: RequestInfo | URL) => {
++        const url = String(input);
++        if (url.includes("courtlistener.com")) {
++          return Response.json({ results: [] });
++        }
++        return new Response(
++          "<html>index mentions 1:26-cv-03659 and nothing else</html>",
++          { status: 200, headers: { "content-type": "text/html" } }
++        );
++      })
++    );
++    const packaged = await packageDailyRun(
++      testEnv.DB,
++      id,
++      {
++        db: testEnv.DB,
++        costPolicy: fixtureCostPolicy,
++        provider: provider(),
++        now: () => NOW
++      },
++      checksWithToken()
++    );
++    expect(packaged).toMatchObject({
++      skip: false,
++      draftCount: 0,
++      anyFailure: false
++    });
++    const fetched = (await evidenceRepo.listByRun(testEnv.DB, id)).filter(
++      (event) => event.event === "source.fetched"
++    );
++    expect(fetched).toHaveLength(4);
++    for (const event of fetched) {
++      expect(event.payload).toMatchObject({ itemCount: 0, failed: false });
++    }
++    expect(await draftsRepo.listByRun(testEnv.DB, id)).toEqual([]);
++    const after = await testEnv.DB.prepare(
++      "SELECT COUNT(*) AS n FROM docket_events"
++    ).first<{ n: number }>();
++    expect(after?.n).toBe(before?.n);
++    expect((await runsRepo.getRunById(testEnv.DB, id))?.status).toBe("empty");
++    expect(
++      JSON.stringify(await evidenceRepo.listByRun(testEnv.DB, id))
++    ).not.toContain("cl-seeded-page-token");
++  });
++
++  it("keeps CourtListener drafts when one seeded page returns 403", async () => {
++    const id = "run-20260901-0e03";
++    await seedRun(id);
++    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
++      const url = String(input);
++      if (url.startsWith("https://www.cftc.gov/")) {
++        return new Response("denied", { status: 403 });
++      }
++      if (
++        url.startsWith("https://www.supremecourt.gov/") ||
++        url.startsWith("https://news.bloomberglaw.com/")
++      ) {
++        return new Response("<html>ok</html>", { status: 200 });
++      }
++      return courtListenerRows(input);
++    });
++    vi.stubGlobal("fetch", fetchMock);
++    const packaged = await packageDailyRun(
++      testEnv.DB,
++      id,
++      {
++        db: testEnv.DB,
++        costPolicy: fixtureCostPolicy,
++        provider: provider(),
++        now: () => NOW
++      },
++      checksWithToken()
++    );
++    expect(packaged).toMatchObject({ draftCount: 1, anyFailure: true });
++    const drafts = await draftsRepo.listByRun(testEnv.DB, id);
++    expect(drafts).toHaveLength(1);
++    expect(drafts[0]).toMatchObject({
++      targetEntityType: "docket_events",
++      targetEntityId: "de-case-il-cftc-33901"
++    });
++    const evidence = await evidenceRepo.listByRun(testEnv.DB, id);
++    const cftc = evidence.find(
++      (event) =>
++        event.event === "source.skipped" &&
++        (event.payload as { source?: string }).source === "CFTC press"
++    );
++    expect(cftc?.payload).toMatchObject({
++      reason: "http_403",
++      failed: true,
++      status: 403
++    });
++    const courtListener = evidence.find(
++      (event) =>
++        event.event === "source.fetched" &&
++        (event.payload as { source?: string }).source === "CourtListener"
++    );
++    expect(courtListener?.payload).toMatchObject({ failed: false });
++    expect(
++      fetchMock.mock.calls.filter((call) =>
++        String(call[0]).startsWith("https://www.cftc.gov/")
+       )
++    ).toHaveLength(1);
++    expect(JSON.stringify(evidence)).not.toContain("cl-seeded-page-token");
++    expect((await runsRepo.getRunById(testEnv.DB, id))?.status).toBe("running");
++  });
++
++  it("fails the Run when a seeded page is blocked and nothing was drafted", async () => {
++    const id = "run-20260901-0e04";
++    await seedRun(id);
++    vi.stubGlobal(
++      "fetch",
++      vi.fn(async (input: RequestInfo | URL) => {
++        const url = String(input);
++        if (url.startsWith("https://www.cftc.gov/")) {
++          return new Response("denied", { status: 403 });
++        }
++        if (url.includes("courtlistener.com")) {
++          return Response.json({ results: [] });
++        }
++        return new Response("<html>ok</html>", { status: 200 });
++      })
++    );
++    const packaged = await packageDailyRun(
++      testEnv.DB,
++      id,
++      {
++        db: testEnv.DB,
++        costPolicy: fixtureCostPolicy,
++        provider: provider(),
++        now: () => NOW
++      },
++      checksWithToken()
+     );
+-    expect(authHeaders.every((h) => h === "Token tok")).toBe(true);
++    expect(packaged).toMatchObject({ draftCount: 0, anyFailure: true });
++    expect(await draftsRepo.listByRun(testEnv.DB, id)).toEqual([]);
++    expect((await runsRepo.getRunById(testEnv.DB, id))?.status).toBe("failed");
+   });
+ });
+ 
+diff --git a/src/pipeline/workflow/dailyRun.ts b/src/pipeline/workflow/dailyRun.ts
+index 517a6ab..78990c4 100644
+--- a/src/pipeline/workflow/dailyRun.ts
++++ b/src/pipeline/workflow/dailyRun.ts
+@@ -16,6 +16,9 @@ import {
+   firstFetchWindowDays,
+   type CourtListenerWait
+ } from "../connectors/courtListener";
++import { createCftcPressCheck } from "../connectors/cftcPress";
++import { createLegalNewsLeadsCheck } from "../connectors/legalNewsLeads";
++import { createScotusDocketCheck } from "../connectors/scotusDocket";
+ import { llmProvidersFromEnv, type GatewayDeps } from "../ai/gateway";
+ import {
+   ensureRun,
+@@ -87,10 +90,12 @@ export function gatewayDepsFromEnv(
+ }
+ 
+ /**
+- * Story 3.21 — the live connector registry, keyed on the exact source name
++ * Live connector registry, keyed on the exact source name
+  * (3.17 makes names operator-editable; an unknown name falls back to
+- * `stubCheck` → `"not wired"`). The token is a per-Worker secret typed as
+- * optional on `Env`; absent → `source.skipped { reason: "unconfigured" }`.
++ * `stubCheck` → `"not wired"`). The CourtListener token is a per-Worker
++ * secret typed as optional on `Env`; absent →
++ * `source.skipped { reason: "unconfigured" }`. The seeded page checks do
++ * not receive that token, the wait, the clock, or the database.
+  */
+ export function sourceChecksFromEnv(
+   env: Pick<Env, "COURTLISTENER_API_TOKEN" | "FIRST_FETCH_WINDOW_DAYS"> & {
+@@ -112,7 +117,10 @@ export function sourceChecksFromEnv(
+       firstFetchWindowDays: firstFetchWindowDays(env.FIRST_FETCH_WINDOW_DAYS),
+       ...(env.courtListenerWait ? { wait: env.courtListenerWait } : {}),
+       ...(env.now ? { now: env.now } : {})
+-    })
++    }),
++    "CFTC press": createCftcPressCheck(),
++    "SCOTUS docket": createScotusDocketCheck(),
++    "Legal news leads": createLegalNewsLeadsCheck()
+   };
+ }
+ 
+diff --git a/src/shared/lib/timeouts.ts b/src/shared/lib/timeouts.ts
+index 87e9021..f664446 100644
+--- a/src/shared/lib/timeouts.ts
++++ b/src/shared/lib/timeouts.ts
+@@ -24,8 +24,9 @@
+  * (`provider_error`, `source.skipped { reason: "timeout" }`).
+  *
+  * No retries and no backoff live in this module. These constants stay
+- * fixed. CourtListener is the per-check exception: `observe` uses that
+- * check's `pollTimeoutMs` instead of `CONNECTOR_TIMEOUT_MS` (story 3.38).
++ * fixed. `observe` uses a check's `pollTimeoutMs` when the check sets one,
++ * instead of `CONNECTOR_TIMEOUT_MS`. CourtListener sets an 8 minute budget
++ * (story 3.38). Each seeded page check sets 20 seconds (story 3.39).
+  * Pacing and 429 waits live in the CourtListener connector.
+  */
+ 
+diff --git a/src/pipeline/connectors/cftcPress.ts b/src/pipeline/connectors/cftcPress.ts
+new file mode 100644
+index 0000000..26356c2
+--- /dev/null
++++ b/src/pipeline/connectors/cftcPress.ts
+@@ -0,0 +1,5 @@
++import { createSeededPageCheck } from "./publicSource";
++
++export function createCftcPressCheck() {
++  return createSeededPageCheck("https://www.cftc.gov");
++}
+diff --git a/src/pipeline/connectors/legalNewsLeads.ts b/src/pipeline/connectors/legalNewsLeads.ts
+new file mode 100644
+index 0000000..a2dc1f3
+--- /dev/null
++++ b/src/pipeline/connectors/legalNewsLeads.ts
+@@ -0,0 +1,5 @@
++import { createSeededPageCheck } from "./publicSource";
++
++export function createLegalNewsLeadsCheck() {
++  return createSeededPageCheck("https://news.bloomberglaw.com");
++}
+diff --git a/src/pipeline/connectors/publicSource.test.ts b/src/pipeline/connectors/publicSource.test.ts
+new file mode 100644
+index 0000000..06f042f
+--- /dev/null
++++ b/src/pipeline/connectors/publicSource.test.ts
+@@ -0,0 +1,345 @@
++import { afterEach, describe, expect, it, vi } from "vitest";
++
++import { COURTLISTENER_POLL_TIMEOUT_MS } from "./courtListener";
++import { SourceUnavailableError, type SourceCheckContext } from "./connector";
++import { createCftcPressCheck } from "./cftcPress";
++import { createLegalNewsLeadsCheck } from "./legalNewsLeads";
++import {
++  createSeededPageCheck,
++  SEEDED_PAGE_ERROR_BODY_MAX_BYTES,
++  SEEDED_PAGE_MAX_BYTES,
++  SEEDED_PAGE_POLL_TIMEOUT_MS
++} from "./publicSource";
++import { createScotusDocketCheck } from "./scotusDocket";
++import { POLL_SOURCES, type PollSource } from "./sources";
++
++const CFTC = POLL_SOURCES.find((source) => source.name === "CFTC press")!;
++const SCOTUS = POLL_SOURCES.find((source) => source.name === "SCOTUS docket")!;
++
++function context(
++  beforeRequest: () => Promise<void> = async () => {}
++): SourceCheckContext {
++  return { signal: new AbortController().signal, beforeRequest };
++}
++
++function page(
++  status: number,
++  body: BodyInit | null = "",
++  headers?: HeadersInit
++): Response {
++  return new Response(body, { status, headers });
++}
++
++describe("seeded page checks", () => {
++  afterEach(() => vi.unstubAllGlobals());
++
++  it("keeps the three poll budgets inside the default step", () => {
++    for (const check of [
++      createCftcPressCheck(),
++      createScotusDocketCheck(),
++      createLegalNewsLeadsCheck()
++    ]) {
++      expect((check as { pollTimeoutMs?: number }).pollTimeoutMs).toBe(
++        SEEDED_PAGE_POLL_TIMEOUT_MS
++      );
++    }
++    expect(SEEDED_PAGE_POLL_TIMEOUT_MS).toBe(20_000);
++    expect(
++      COURTLISTENER_POLL_TIMEOUT_MS + 3 * SEEDED_PAGE_POLL_TIMEOUT_MS
++    ).toBeLessThan(10 * 60 * 1000);
++  });
++
++  it("returns entities [] and a fetched summary for a 200 that names a docket", async () => {
++    const body = "<html>docket 1:26-cv-03659 remains on the index</html>";
++    const order: string[] = [];
++    const fetchMock = vi.fn(
++      async (_input: RequestInfo | URL, _init?: RequestInit) => {
++        order.push("fetch");
++        return page(200, body, { "content-type": "text/html; charset=utf-8" });
++      }
++    );
++    vi.stubGlobal("fetch", fetchMock);
++    const items = await createCftcPressCheck()(
++      CFTC,
++      context(async () => {
++        order.push("before");
++      })
++    );
++    expect(order).toEqual(["before", "fetch"]);
++    expect(fetchMock).toHaveBeenCalledTimes(1);
++    const init = fetchMock.mock.calls[0]?.[1];
++    expect(init?.redirect).toBe("manual");
++    expect(new Headers(init?.headers).get("authorization")).toBeNull();
++    expect(items).toEqual([
++      {
++        entities: [],
++        fetched: {
++          status: 200,
++          contentType: "text/html; charset=utf-8",
++          bytes: new TextEncoder().encode(body).byteLength
++        }
++      }
++    ]);
++    expect(JSON.stringify(items)).not.toContain("1:26-cv-03659");
++  });
++
++  it("truncates contentType to 120 characters and allows a null type", async () => {
++    const longType = `text/html; ${"a".repeat(200)}`;
++    vi.stubGlobal(
++      "fetch",
++      vi.fn(async () => page(200, "ok", { "content-type": longType }))
++    );
++    const [item] = await createCftcPressCheck()(CFTC, context());
++    expect(item?.fetched?.contentType).toBe(longType.slice(0, 120));
++
++    vi.stubGlobal(
++      "fetch",
++      vi.fn(async () => {
++        const response = page(200, "ok");
++        response.headers.delete("content-type");
++        return response;
++      })
++    );
++    const [again] = await createScotusDocketCheck()(SCOTUS, context());
++    expect(again?.fetched?.contentType).toBeNull();
++    expect(again?.entities).toEqual([]);
++  });
++
++  it("skips a 429 after one fetch and does not retry", async () => {
++    const fetchMock = vi.fn(async () => page(429, "slow down"));
++    vi.stubGlobal("fetch", fetchMock);
++    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
++      {
++        reason: "http_429",
++        detail: { status: 429, detail: "slow down" }
++      }
++    );
++    expect(fetchMock).toHaveBeenCalledTimes(1);
++  });
++
++  it("skips a 5xx after one fetch and does not retry", async () => {
++    const fetchMock = vi.fn(async () => page(503, "unavailable"));
++    vi.stubGlobal("fetch", fetchMock);
++    await expect(
++      createLegalNewsLeadsCheck()(
++        POLL_SOURCES.find((source) => source.name === "Legal news leads")!,
++        context()
++      )
++    ).rejects.toMatchObject({
++      reason: "http_5xx",
++      detail: { status: 503, detail: "unavailable" }
++    });
++    expect(fetchMock).toHaveBeenCalledTimes(1);
++  });
++
++  it("reads at most 8192 error bytes before scrubbing", async () => {
++    let pulled = 0;
++    const stream = new ReadableStream<Uint8Array>(
++      {
++        pull(controller) {
++          if (pulled >= 9000) {
++            controller.close();
++            return;
++          }
++          const size = Math.min(1024, 9000 - pulled);
++          const chunk = new Uint8Array(size);
++          chunk.fill(97);
++          if (pulled === 0) chunk[0] = 84;
++          controller.enqueue(chunk);
++          pulled += size;
++        }
++      },
++      { highWaterMark: 0 }
++    );
++    vi.stubGlobal(
++      "fetch",
++      vi.fn(async () => {
++        return {
++          status: 403,
++          headers: new Headers({ "content-type": "text/html" }),
++          body: stream
++        } as Response;
++      })
++    );
++    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
++      {
++        reason: "http_403",
++        detail: { status: 403, detail: `T${"a".repeat(179)}` }
++      }
++    );
++    expect(pulled).toBe(SEEDED_PAGE_ERROR_BODY_MAX_BYTES);
++  });
++
++  it("does not follow a redirect or read Location", async () => {
++    let pulled = false;
++    const stream = new ReadableStream(
++      {
++        pull(controller) {
++          pulled = true;
++          controller.enqueue(new TextEncoder().encode("secret-body"));
++          controller.close();
++        }
++      },
++      { highWaterMark: 0 }
++    );
++    const fetchMock = vi.fn(async () => {
++      return {
++        status: 302,
++        headers: new Headers({ location: "https://evil.example/secret" }),
++        body: stream
++      } as Response;
++    });
++    vi.stubGlobal("fetch", fetchMock);
++    const err = await Promise.resolve(
++      createCftcPressCheck()(CFTC, context())
++    ).then(
++      () => {
++        throw new Error("redirect was fetched");
++      },
++      (caught: unknown) => caught
++    );
++    expect(err).toBeInstanceOf(SourceUnavailableError);
++    expect(err).toMatchObject({ reason: "redirect", detail: { status: 302 } });
++    expect(
++      JSON.stringify((err as SourceUnavailableError).detail)
++    ).not.toContain("evil.example");
++    expect(fetchMock).toHaveBeenCalledTimes(1);
++    expect(pulled).toBe(false);
++  });
++
++  it("rejects a foreign origin before fetch and omits the URL", async () => {
++    const fetchMock = vi.fn();
++    vi.stubGlobal("fetch", fetchMock);
++    const before = vi.fn(async () => {});
++    const foreign: PollSource = {
++      ...CFTC,
++      url: "https://example.com/PressRoom/PressReleases"
++    };
++    await expect(
++      createCftcPressCheck()(foreign, context(before))
++    ).rejects.toMatchObject({ reason: "unsafe_url", detail: {} });
++    expect(fetchMock).not.toHaveBeenCalled();
++    expect(before).not.toHaveBeenCalled();
++  });
++
++  it("rejects a steered URL that leaves the seeded origin", async () => {
++    const fetchMock = vi.fn();
++    vi.stubGlobal("fetch", fetchMock);
++    const steered: PollSource = {
++      name: "SCOTUS docket",
++      url: "https://user:pw@www.supremecourt.gov/docket/",
++      tier: "tier1"
++    };
++    const err = await Promise.resolve(
++      createScotusDocketCheck()(steered, context())
++    ).then(
++      () => {
++        throw new Error("credentials were fetched");
++      },
++      (caught: unknown) => caught
++    );
++    expect(err).toMatchObject({ reason: "unsafe_url", detail: {} });
++    expect(JSON.stringify(err)).not.toContain("user:pw");
++    expect((err as Error).message).not.toContain("user:pw");
++    expect(fetchMock).not.toHaveBeenCalled();
++  });
++
++  it("fetches a same-origin steered path", async () => {
++    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
++      page(200, "ok")
++    );
++    vi.stubGlobal("fetch", fetchMock);
++    const steered: PollSource = {
++      ...CFTC,
++      url: "https://www.cftc.gov/PressRoom/Other"
++    };
++    const items = await createCftcPressCheck()(steered, context());
++    expect(items[0]?.entities).toEqual([]);
++    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
++      "https://www.cftc.gov/PressRoom/Other"
++    );
++  });
++
++  it("does not fetch when the factory origin disagrees with the source name", async () => {
++    const fetchMock = vi.fn();
++    vi.stubGlobal("fetch", fetchMock);
++    await expect(
++      createCftcPressCheck()(SCOTUS, context())
++    ).rejects.toMatchObject({ reason: "unsafe_url" });
++    expect(fetchMock).not.toHaveBeenCalled();
++  });
++
++  it("maps TimeoutError to timeout and rethrows AbortError", async () => {
++    vi.stubGlobal(
++      "fetch",
++      vi.fn(async () => {
++        throw new DOMException("timed out", "TimeoutError");
++      })
++    );
++    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
++      { reason: "timeout" }
++    );
++
++    vi.stubGlobal(
++      "fetch",
++      vi.fn(async () => {
++        throw new DOMException("aborted", "AbortError");
++      })
++    );
++    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
++      { name: "AbortError" }
++    );
++  });
++
++  it("maps other fetch failures to network", async () => {
++    vi.stubGlobal(
++      "fetch",
++      vi.fn(async () => {
++        throw new TypeError("boom");
++      })
++    );
++    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
++      { reason: "network" }
++    );
++  });
++
++  it("does not read a 200 whose Content-Length is over the cap", async () => {
++    let pulled = false;
++    const stream = new ReadableStream(
++      {
++        pull() {
++          pulled = true;
++          throw new Error("body was read");
++        }
++      },
++      { highWaterMark: 0 }
++    );
++    vi.stubGlobal(
++      "fetch",
++      vi.fn(async () => {
++        return {
++          status: 200,
++          headers: new Headers({
++            "content-length": String(SEEDED_PAGE_MAX_BYTES + 1)
++          }),
++          body: stream
++        } as Response;
++      })
++    );
++    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
++      { reason: "response_too_large", detail: {} }
++    );
++    expect(pulled).toBe(false);
++  });
++
++  it("rejects a 200 body that exceeds the cap while being read", async () => {
++    const chunk = new Uint8Array(SEEDED_PAGE_MAX_BYTES + 1);
++    vi.stubGlobal(
++      "fetch",
++      vi.fn(async () => new Response(chunk, { status: 200 }))
++    );
++    await expect(
++      createSeededPageCheck("https://www.cftc.gov")(CFTC, context())
++    ).rejects.toMatchObject({ reason: "response_too_large" });
++  });
++});
+diff --git a/src/pipeline/connectors/publicSource.ts b/src/pipeline/connectors/publicSource.ts
+new file mode 100644
+index 0000000..1d7135a
+--- /dev/null
++++ b/src/pipeline/connectors/publicSource.ts
+@@ -0,0 +1,210 @@
++import {
++  SourceUnavailableError,
++  type SourceCheck,
++  type SourceCheckContext
++} from "./connector";
++import { reasonForStatus, scrubResponseDetail } from "./courtListener";
++import { POLL_SOURCES } from "./sources";
++import {
++  fetchWithTimeout,
++  isAbortError,
++  isTimeoutError,
++  SOURCE_FETCH_TIMEOUT_MS
++} from "../../shared/lib/timeouts";
++
++/** One seeded page poll. Three of these plus CourtListener stay under 10 minutes. */
++export const SEEDED_PAGE_POLL_TIMEOUT_MS = 20_000;
++/** A 200 body larger than this is `response_too_large` and is not parsed. */
++export const SEEDED_PAGE_MAX_BYTES = 1_000_000;
++/** Non-200 bodies are scrubbed from this prefix only. */
++export const SEEDED_PAGE_ERROR_BODY_MAX_BYTES = 8192;
++
++const CONTENT_TYPE_MAX = 120;
++
++const ACCEPT =
++  "text/html, application/xhtml+xml, application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8";
++
++const SEEDED_NAMES = new Set([
++  "CFTC press",
++  "SCOTUS docket",
++  "Legal news leads"
++]);
++
++function allowedOrigin(name: string): string | null {
++  if (!SEEDED_NAMES.has(name)) return null;
++  const seeded = POLL_SOURCES.find((source) => source.name === name);
++  if (seeded == null) return null;
++  return new URL(seeded.url).origin;
++}
++
++/** Same-origin https only. The rejected URL stays out of the error. */
++function guardedUrl(input: string, origin: string): string {
++  let url: URL;
++  try {
++    if (
++      !input ||
++      input.includes("\\") ||
++      /%(?![0-9a-f]{2})/i.test(input) ||
++      Array.from(input).some((char) => {
++        const code = char.charCodeAt(0);
++        return code <= 0x20 || code === 0x7f;
++      })
++    ) {
++      throw new Error("invalid URL");
++    }
++    url = new URL(input);
++  } catch (err) {
++    if (err instanceof SourceUnavailableError) throw err;
++    throw new SourceUnavailableError("unsafe_url");
++  }
++  if (
++    url.protocol !== "https:" ||
++    url.origin !== origin ||
++    url.username !== "" ||
++    url.password !== ""
++  ) {
++    throw new SourceUnavailableError("unsafe_url");
++  }
++  return url.href;
++}
++
++function concatBytes(chunks: Uint8Array[], total: number): Uint8Array {
++  const out = new Uint8Array(total);
++  let offset = 0;
++  for (const chunk of chunks) {
++    out.set(chunk, offset);
++    offset += chunk.byteLength;
++  }
++  return out;
++}
++
++/** Read at most `maxBytes` and leave the rest of the stream unread. */
++async function readAtMost(
++  response: Response,
++  maxBytes: number
++): Promise<Uint8Array> {
++  const reader = response.body?.getReader();
++  if (!reader) return new Uint8Array(0);
++  const chunks: Uint8Array[] = [];
++  let total = 0;
++  while (total < maxBytes) {
++    const { done, value } = await reader.read();
++    if (done) break;
++    if (value == null || value.byteLength === 0) continue;
++    const room = maxBytes - total;
++    if (value.byteLength > room) {
++      chunks.push(value.subarray(0, room));
++      total += room;
++      break;
++    }
++    chunks.push(value);
++    total += value.byteLength;
++  }
++  return concatBytes(chunks, total);
++}
++
++function declaredLength(response: Response): number | null {
++  const raw = response.headers.get("content-length")?.trim();
++  if (raw == null || !/^\d+$/.test(raw)) return null;
++  const value = Number(raw);
++  return Number.isSafeInteger(value) ? value : null;
++}
++
++async function readSuccessBody(response: Response): Promise<Uint8Array> {
++  const declared = declaredLength(response);
++  if (declared != null && declared > SEEDED_PAGE_MAX_BYTES) {
++    throw new SourceUnavailableError("response_too_large");
++  }
++  const reader = response.body?.getReader();
++  if (!reader) return new Uint8Array(0);
++  const chunks: Uint8Array[] = [];
++  let total = 0;
++  while (true) {
++    const { done, value } = await reader.read();
++    if (done) break;
++    if (value == null || value.byteLength === 0) continue;
++    if (total + value.byteLength > SEEDED_PAGE_MAX_BYTES) {
++      throw new SourceUnavailableError("response_too_large");
++    }
++    chunks.push(value);
++    total += value.byteLength;
++  }
++  return concatBytes(chunks, total);
++}
++
++function contentTypeOf(response: Response): string | null {
++  const value = response.headers.get("content-type");
++  if (value == null) return null;
++  return value.length > CONTENT_TYPE_MAX
++    ? value.slice(0, CONTENT_TYPE_MAX)
++    : value;
++}
++
++async function errorDetail(response: Response): Promise<string> {
++  const bytes = await readAtMost(response, SEEDED_PAGE_ERROR_BODY_MAX_BYTES);
++  return scrubResponseDetail(new TextDecoder().decode(bytes), "");
++}
++
++function unavailable(
++  reason: string,
++  detail: Record<string, unknown>
++): SourceUnavailableError {
++  return new SourceUnavailableError(reason, detail);
++}
++
++async function fetchSeededPage(
++  url: string,
++  context: SourceCheckContext | undefined
++): Promise<Response> {
++  try {
++    return await fetchWithTimeout(
++      url,
++      {
++        signal: context?.signal,
++        redirect: "manual",
++        headers: { accept: ACCEPT }
++      },
++      SOURCE_FETCH_TIMEOUT_MS
++    );
++  } catch (err) {
++    if (isAbortError(err)) throw err;
++    if (isTimeoutError(err)) throw unavailable("timeout", {});
++    throw unavailable("network", {});
++  }
++}
++
++/**
++ * One same-origin fetch for a seeded page. `origin` is the factory's host.
++ * It must match the `POLL_SOURCES` origin for `source.name`.
++ */
++export function createSeededPageCheck(origin: string): SourceCheck {
++  const check: SourceCheck = async (source, context) => {
++    const allowed = allowedOrigin(source.name);
++    if (allowed == null || allowed !== origin) {
++      throw unavailable("unsafe_url", {});
++    }
++    const url = guardedUrl(source.url, allowed);
++    await context?.beforeRequest();
++    const response = await fetchSeededPage(url, context);
++    if (response.status >= 300 && response.status < 400) {
++      throw unavailable("redirect", { status: response.status });
++    }
++    if (response.status !== 200) {
++      const detail = await errorDetail(response);
++      throw unavailable(reasonForStatus(response.status), {
++        status: response.status,
++        ...(detail ? { detail } : {})
++      });
++    }
++    const contentType = contentTypeOf(response);
++    const bytes = await readSuccessBody(response);
++    return [
++      {
++        entities: [],
++        fetched: { status: 200, contentType, bytes: bytes.byteLength }
++      }
++    ];
++  };
++  Object.assign(check, { pollTimeoutMs: SEEDED_PAGE_POLL_TIMEOUT_MS });
++  return check;
++}
+diff --git a/src/pipeline/connectors/scotusDocket.ts b/src/pipeline/connectors/scotusDocket.ts
+new file mode 100644
+index 0000000..dbce667
+--- /dev/null
++++ b/src/pipeline/connectors/scotusDocket.ts
+@@ -0,0 +1,5 @@
++import { createSeededPageCheck } from "./publicSource";
++
++export function createScotusDocketCheck() {
++  return createSeededPageCheck("https://www.supremecourt.gov");
++}
+`. Read that file — it is the content under review.
+
+Do not invoke any skill, and do not spawn subagents of your own — you are the reviewer. If the instruction file is unreadable, report that exact failure and stop. Return your findings as text in your final message; do not route them through any findings-reporting tool the host may offer.
diff --git a/_bmad-output/implementation-artifacts/spec-3-39-wire-seeded-cftc-scotus-and-legal-news-sources.md b/_bmad-output/implementation-artifacts/spec-3-39-wire-seeded-cftc-scotus-and-legal-news-sources.md
index 2b86174..8bda2b0 100644
--- a/_bmad-output/implementation-artifacts/spec-3-39-wire-seeded-cftc-scotus-and-legal-news-sources.md
+++ b/_bmad-output/implementation-artifacts/spec-3-39-wire-seeded-cftc-scotus-and-legal-news-sources.md
@@ -2,9 +2,10 @@
 title: '3.39 — Wire seeded CFTC, SCOTUS, and legal-news sources'
 type: 'feature'
 created: '2026-10-22'
-status: 'draft'
+status: 'in-review'
 route: 'dispatch'
-review_loop_iteration: 0
+baseline_commit: 'f234f8c3be99068b86a309cd602c45e650d91254'
+review_loop_iteration: 1
 context:
   - '{project-root}/_bmad-output/implementation-artifacts/3-39-wire-seeded-cftc-scotus-and-legal-news-sources.md'
   - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
@@ -53,12 +54,12 @@ context:
 ## Tasks & Acceptance
 
 **Execution:**
-- [ ] `src/pipeline/connectors/publicSource.ts` — one same-origin fetch and the 20-second, 1_000_000-byte, and 8192-byte caps — shared by the three checks.
-- [ ] `src/pipeline/connectors/cftcPress.ts`, `scotusDocket.ts`, `legalNewsLeads.ts` — thin factories for `https://www.cftc.gov`, `https://www.supremecourt.gov`, and `https://news.bloomberglaw.com`.
-- [ ] `src/pipeline/connectors/publicSource.test.ts` — stub `fetch` and cover the matrix rows that do not need a full Run.
-- [ ] `src/pipeline/workflow/dailyRun.ts` — register the three checks.
-- [ ] `src/pipeline/workflow/dailyRun.test.ts` — replace the CourtListener-only registry assertions and cover empty versus failed Runs, plus the token header.
-- [ ] `src/shared/lib/timeouts.ts` — comment only.
+- [x] `src/pipeline/connectors/publicSource.ts` — one same-origin fetch and the 20-second, 1_000_000-byte, and 8192-byte caps — shared by the three checks. A failure from `reader.read()` in `readSuccessBody` or `readAtMost` uses the fetch map: rethrow `AbortError`, `TimeoutError` becomes `timeout`, any other read error becomes `network`. `SourceUnavailableError` from the byte cap still propagates. Do not `cancel()` the unread remainder: in this runtime that drains the rest of the stream, which reads a redirect body and reads past 8192 bytes.
+- [x] `src/pipeline/connectors/cftcPress.ts`, `scotusDocket.ts`, `legalNewsLeads.ts` — thin factories for `https://www.cftc.gov`, `https://www.supremecourt.gov`, and `https://news.bloomberglaw.com`.
+- [x] `src/pipeline/connectors/publicSource.test.ts` — stub `fetch` and cover the matrix rows that do not need a full Run. Include a body-read `TypeError` that rejects with `network`, and an `AbortError` from `reader.read()` that is not wrapped.
+- [x] `src/pipeline/workflow/dailyRun.ts` — register the three checks.
+- [x] `src/pipeline/workflow/dailyRun.test.ts` — replace the CourtListener-only registry assertions and cover empty versus failed Runs, plus the token header.
+- [x] `src/shared/lib/timeouts.ts` — comment only.
 
 **Acceptance Criteria:**
 - Given poll-sources version 0, when a Run packages it, then CFTC press and SCOTUS docket are Tier-1, Legal news leads is Tier-2, and none of the three records `not wired`.
@@ -69,8 +70,39 @@ context:
 
 ## Spec Change Log
 
+- Trigger: body-read failures (`readSuccessBody`, `readAtMost`) leave `fetchSeededPage`'s catch and `observe` records `run.failed { reason: "error" }`. Blind-hunter, edge-case-hunter, and verification-gap all reported it. A 403 whose body read throws also loses `http_403`.
+- Amended: the `publicSource.ts` task now maps those read errors the same way as `fetch` (`AbortError` rethrown, `TimeoutError` → `timeout`, anything else → `network`) and forbids `cancel()` of the unread remainder.
+- Known-bad state avoided: a named skip other than `not wired`, and not reading past the 8192-byte cap or a redirect body.
+- KEEP: one shared fetch; thin origin factories; `pollTimeoutMs` 20 seconds via `Object.assign`; `entities: []` on 200; `redirect: "manual"`; no `authorization`; `beforeRequest` after the origin guard; reuse `reasonForStatus` and `scrubResponseDetail`; caps 8192 and 1_000_000; `contentType` truncated to 120; registry order without the CourtListener token, wait, clock, or database; no `run-daily-step` config; CourtListener pacing unchanged; stubbed `fetch` only.
+
 ## Review Triage Log
 
+- Blind-hunter, unread bodies on early exit. Verdict `low`, rejected. Cloudflare's simultaneous-connection limit stops counting a fetch once headers arrive, and the cited page says `cancel()` frees memory. It does not document a held connection or a warning. In this runtime `reader.cancel()` drains the remainder, so the fix would read past the cap. Users do not meet a held connection, and the fix is not a direct deletion.
+- Blind-hunter, body-read errors escape the fetch catch. Verdict `medium`. `reader.read()` is outside `fetchSeededPage`, and `observe` maps a raw error to `run.failed { reason: "error" }` at `connector.ts`. Grouped with the edge-case and verification-gap body-read findings. Route `bad_spec`.
+- Blind-hunter, `SOURCE_FETCH_TIMEOUT_MS` does not cover the body. Verdict `false`. `fetchWithTimeout` is specified to bound the request. `observe` bounds the whole check with `pollTimeoutMs` of 20 seconds and records `DeadlineError` as `source.skipped` timeout.
+- Blind-hunter, status 0 and other 2xx. Verdict `false`. Workers `redirect: "manual"` returns the 3xx response. `reasonForStatus(204)` is `http_error`, which is the specified non-200 reason.
+- Blind-hunter, no User-Agent and likely daily 403s. Verdict `maybe-false`. The story says the Workers runtime supplies the User-Agent, and this story cannot make the live call that would show a CDN 403. If that 403 were real it would be `high`. Route `defer`, not processed on this loopback.
+- Blind-hunter, no content-type check or change hash. Verdict `false`. A 200 is specified to return `entities: []` plus status, bytes, and contentType. The fix would edit the frozen contract.
+- Blind-hunter, duplicated origin strings. Verdict `false`. The tasks require thin factories that pass the origin. A mismatch fails closed as `unsafe_url`.
+- Blind-hunter, dead `SourceUnavailableError` branch in `guardedUrl`. Verdict `low`. Nothing in the `try` throws that type. Route `patch`, not processed on this loopback.
+- Blind-hunter, CourtListener `.every()` is vacuous. Verdict `false`. The same test already requires an Illinois CourtListener URL before that assertion. With no such call, `new URL` throws.
+- Blind-hunter, `"tok"` substring. Verdict `low`. The token is the letters `tok`, so a later payload containing `token` fails the assertion for the wrong reason. Route `patch`, not processed on this loopback.
+- Blind-hunter, 403-beside-drafts expects `running`. Verdict `low`. `packageDailyRun` leaves a Run with drafts `running` for `reviewDailyRun`. The assertion matches that. A comment would be the fix. Route `patch`, not processed on this loopback.
+- Blind-hunter, failed-run test omits sibling evidence. Verdict `medium`. The test checks draft count and `failed` status only, so a registry that never fetched the other sources could still pass. Route `patch`, not processed on this loopback.
+- Blind-hunter, missing boundary tests. Verdict `low`, rejected. Everyday use does not hit an untested chunk boundary, and adding those cases is more than a direct correction.
+- Blind-hunter, 180-character expectation is implicit. Verdict `low`. The expected detail length is `scrubResponseDetail`'s cap, which the test does not name. Route `patch`, not processed on this loopback.
+- Blind-hunter, spec `in-review` versus sprint `in-progress`. Verdict `false`. Step 3 sets the sprint key and step 4 sets the spec status. They are different fields.
+- Blind-hunter, redirect test locks an open body. Verdict `false`. The test locks the required "do not read the redirect body" behavior.
+- Edge-case-hunter, body stream error. Verdict `medium`. Same `observe` mapping as the blind-hunter body-read finding. Route `bad_spec`.
+- Edge-case-hunter, 3xx body not cancelled. Verdict `low`, rejected. Same memory-versus-drain evidence as the unread-body finding.
+- Edge-case-hunter, `response_too_large` leaves the stream open. Verdict `low`, rejected. Same evidence.
+- Edge-case-hunter, `readAtMost` leaves the error stream open. Verdict `low`, rejected. Same evidence.
+- Edge-case-hunter, missing `context`. Verdict `false`. `observe` always passes `context`. The production caller is `runConnector`.
+- Edge-case-hunter claim, body-read failure contradicts the named-skip outcome. Verdict `medium`. `run.failed { reason: "error" }` is a third outcome. Route `bad_spec`.
+- Verification-gap, pre-parse URL rejection has no test. Verdict `medium`, pre-verified. Deleting the character checks would let `URL` normalize a backslash or a space, and no current test feeds those inputs. Filed disposition `patch`. Not processed on this loopback.
+- Verification-gap other finding, body-read failure is not a named skip. Verdict `medium`. Same `observe` path. Route `bad_spec`.
+- Verification-gap other finding, `connector.ts` still says other checks stay at 60 seconds. Verdict `medium`. The seeded checks set 20 seconds. A later edit that trusts the comment can drop `pollTimeoutMs` and overrun the 10-minute step. Route `patch`, not processed on this loopback.
+
 ## Verification
 
 **Commands:**
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
index 0000000..819b385
--- /dev/null
+++ b/src/pipeline/connectors/publicSource.test.ts
@@ -0,0 +1,424 @@
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
+function streamThatThrows(err: Error): ReadableStream<Uint8Array> {
+  return new ReadableStream(
+    {
+      pull() {
+        throw err;
+      }
+    },
+    { highWaterMark: 0 }
+  );
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
+  it("maps a body-read TypeError to network and does not wrap AbortError", async () => {
+    const typeError = new TypeError("read failed");
+    vi.stubGlobal(
+      "fetch",
+      vi.fn(async () => {
+        return {
+          status: 200,
+          headers: new Headers({ "content-type": "text/html" }),
+          body: streamThatThrows(typeError)
+        } as Response;
+      })
+    );
+    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
+      { reason: "network" }
+    );
+
+    const timeout = new DOMException("read timed out", "TimeoutError");
+    vi.stubGlobal(
+      "fetch",
+      vi.fn(async () => {
+        return {
+          status: 200,
+          headers: new Headers(),
+          body: streamThatThrows(timeout)
+        } as Response;
+      })
+    );
+    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
+      { reason: "timeout" }
+    );
+
+    const abort = new DOMException("aborted", "AbortError");
+    vi.stubGlobal(
+      "fetch",
+      vi.fn(async () => {
+        return {
+          status: 200,
+          headers: new Headers(),
+          body: streamThatThrows(abort)
+        } as Response;
+      })
+    );
+    const caught = await Promise.resolve(
+      createCftcPressCheck()(CFTC, context())
+    ).then(
+      () => {
+        throw new Error("abort was swallowed");
+      },
+      (err: unknown) => err
+    );
+    expect(caught).toBe(abort);
+    expect(caught).not.toBeInstanceOf(SourceUnavailableError);
+
+    vi.stubGlobal(
+      "fetch",
+      vi.fn(async () => {
+        return {
+          status: 403,
+          headers: new Headers(),
+          body: streamThatThrows(new TypeError("error body failed"))
+        } as Response;
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
index 0000000..ae9ee6f
--- /dev/null
+++ b/src/pipeline/connectors/publicSource.ts
@@ -0,0 +1,225 @@
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
+  } catch {
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
+function unavailable(
+  reason: string,
+  detail: Record<string, unknown>
+): SourceUnavailableError {
+  return new SourceUnavailableError(reason, detail);
+}
+
+/**
+ * `reader.read()` uses the same map as `fetch`. Do not `cancel()` the
+ * remainder: in this runtime that drains the rest of the stream.
+ */
+async function readChunk(
+  reader: ReadableStreamDefaultReader<Uint8Array>
+): Promise<ReadableStreamReadResult<Uint8Array>> {
+  try {
+    return await reader.read();
+  } catch (err) {
+    if (isAbortError(err)) throw err;
+    if (isTimeoutError(err)) throw unavailable("timeout", {});
+    throw unavailable("network", {});
+  }
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
+    const { done, value } = await readChunk(reader);
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
+    const { done, value } = await readChunk(reader);
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
 
`. Read that file — it is the content under review.

Do not invoke any skill, and do not spawn subagents of your own — you are the reviewer. Return your findings as text in your final message; do not route them through any findings-reporting tool the host may offer.
