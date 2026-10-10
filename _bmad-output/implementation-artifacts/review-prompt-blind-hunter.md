Conduct a review of CONTENT.
Look for what's missing, not only what's wrong.
Compute your finding floor N from the diff file's size: N = min(floor(sqrt(kB) + 1), 10), where kB is the file's size in kilobytes. State the arithmetic in one line, then find at least N issues to fix or improve.
Output a Markdown list of findings only — no severity, priority, or ranking.
If the content is empty, stop and say so.
If you have zero findings, re-check and keep thinking; do not stop with an empty list.

CONTENT: the unified diff at the following contents. Read that file — it is the content under review.

diff --git a/_bmad-output/implementation-artifacts/deferred-work.md b/_bmad-output/implementation-artifacts/deferred-work.md
index f5a1e3d..f10fdfd 100644
--- a/_bmad-output/implementation-artifacts/deferred-work.md
+++ b/_bmad-output/implementation-artifacts/deferred-work.md
@@ -224,4 +224,4 @@ Ledger entries above are not edited; this block records where each Epic 3 entry
 
 - source_spec: `_bmad-output/implementation-artifacts/spec-deepinfra-preflight-diagnostics-and-first-fetch-window.md`
   summary: Backfill docket history older than the first-fetch window.
-  evidence: A docket with no stored events uses the later of `sources.published_at` and 2 ET days before the run date, so a USD 1 acceptance run stays a handful of drafts. This story does not fetch the older history later.
+  evidence: A docket with no stored events uses the later of `sources.published_at` and `FIRST_FETCH_WINDOW_DAYS` (default 7) before the run date. This story does not fetch the older history later.
diff --git a/_bmad-output/implementation-artifacts/spec-deepinfra-preflight-diagnostics-and-first-fetch-window.md b/_bmad-output/implementation-artifacts/spec-deepinfra-preflight-diagnostics-and-first-fetch-window.md
index 4802091..cda08f2 100644
--- a/_bmad-output/implementation-artifacts/spec-deepinfra-preflight-diagnostics-and-first-fetch-window.md
+++ b/_bmad-output/implementation-artifacts/spec-deepinfra-preflight-diagnostics-and-first-fetch-window.md
@@ -2,8 +2,9 @@
 title: 'Diagnose DeepInfra cost-policy failures and cap the first docket fetch'
 type: 'bugfix'
 created: '2026-10-10'
-status: 'draft'
+status: 'in-review'
 route: 'dispatch'
+baseline_commit: '402107e90b99981ae7abc823d52fac6af93d514b'
 review_loop_iteration: 0
 context:
   - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
@@ -15,11 +16,11 @@ context:
 
 **Problem:** Run `run-20261010-0003` (main `5ee23f6`) stored 335 drafts as `evals_not_run` with basis `Evaluation did not complete: cost_policy_invalid`, and spent $0. The DeepInfra policy is valid through `2026-10-11T19:10:00Z`, and a desktop `/models/list` fetch passes. The Worker catch hides the cause. With no stored events, `sources.published_at` reaches back to `2025-11-28`, so a later success still reserves about 16 cents a call against the USD 1 cap.
 
-**Approach:** Keep code `cost_policy_invalid`, name the stage, and record the failure on the error, the draft basis, and one log. Send a User-Agent and `Accept: application/json` on the catalog request. On the `source_published_at` path only, use the later of that baseline and 2 days before the ET run date.
+**Approach:** Keep code `cost_policy_invalid`, name the stage, and record the failure on the error, the draft basis, and one log. Send a User-Agent and `Accept: application/json` on the catalog request. On the `source_published_at` path only, use the later of that baseline and `FIRST_FETCH_WINDOW_DAYS` (default 7) before the ET run date.
 
 ## Boundaries & Constraints
 
-**Always:** Stages are `policy_lookup`, `policy_model_mismatch`, `deepinfra_preflight`, `openrouter_preflight`, and `revalidate_before_inference`. Basis and `GatewayError` message are `cost_policy_invalid: <stage>`, plus ` (http <status>)` when a status exists. Example: `cost_policy_invalid: deepinfra_preflight (http 403)`. Siblings stopped by that error use the same basis. Detail and one `console.warn` object also include a caught error's name and message, HTTP status, a whitespace-collapsed body prefix of at most 180 characters, and the failed field. No secrets, keys, or headers. Catalog headers are `User-Agent: PredictionMarketLitigation/0.1.0 (+https://predictionmarketlitigation.com)` and `Accept: application/json`; `redirect: "error"` stays. `COURTLISTENER_FIRST_FETCH_WINDOW_DAYS` is 2. The run date is the `America/New_York` date of `deps.now()`. The cutoff is the later of `published_at` and that date minus 2 calendar days, inclusive for the client filter, pagination stop, and `date_filed__gte`. The summary adds `effectiveCutoff` and `skippedOlder` (returned entries filed strictly before the cutoff). The `MAX(occurred_at)` path and a null baseline stay unchanged.
+**Always:** Stages are `policy_lookup`, `policy_model_mismatch`, `deepinfra_preflight`, `openrouter_preflight`, and `revalidate_before_inference`. Basis and `GatewayError` message are `cost_policy_invalid: <stage>`, plus ` (http <status>)` when a status exists. Example: `cost_policy_invalid: deepinfra_preflight (http 403)`. Siblings stopped by that error use the same basis. Detail and one `console.warn` object also include a caught error's name and message, HTTP status, a whitespace-collapsed body prefix of at most 180 characters, and the failed field. No secrets, keys, or headers. Catalog headers are `User-Agent: PredictionMarketLitigation/0.1.0 (+https://predictionmarketlitigation.com)` and `Accept: application/json`; `redirect: "error"` stays. `FIRST_FETCH_WINDOW_DAYS` is an optional Worker var, default 7. A positive integer is used; any other set value falls back to 7 and logs one object. Unset uses 7 with no log. `wrangler.jsonc` has no `vars` block, so the code default is the convention. The run date is the `America/New_York` date of `deps.now()`. The cutoff is the later of `published_at` and that date minus the window, inclusive for the client filter, pagination stop, and `date_filed__gte`. The summary adds `effectiveCutoff` and `skippedOlder` (returned entries filed strictly before the cutoff). The `MAX(occurred_at)` path and a null baseline stay unchanged. A budget ceiling hit during evaluation marks the in-progress and remaining drafts `evals_not_run`, settles completed calls, opens no new reservation, leaves the run `stopped` rather than `failed`, and leaves reserved cents, uncertain cents, and accounting issues at zero.
 
 **Never:** Do not deploy, start a Run, or change Cloudflare or staging. Do not change 3.36 (`in-progress`) or 3.37 (`backlog`). Do not change `costPolicy.ts` or the public code. Do not backfill older history (deferred). Do not add a draft-count cap, Queues, or a new checkpoint.
 
@@ -30,6 +31,9 @@ context:
 | Other stages | Bad policy, mismatch, OpenRouter, or revalidate | Basis names that stage; OpenRouter records status, field, or the caught error | DeepInfra must not relabel revalidate |
 | Recent first fetch | `published_at` later than the window start | Cutoff stays `published_at` | N/A |
 | No baseline | No event date and no `published_at` | No `date_filed__gte` | N/A |
+| Invalid window | `FIRST_FETCH_WINDOW_DAYS` is `0`, blank, or not an integer | Window is 7 and one log records the fallback | N/A |
+| Run 0003 dates | Run date 2026-10-11; filings 10-05 (3), 10-02 (3), 10-01 (1), 09-28 (2), 09-25 (1) | Cutoff `2026-10-04`; the 10-05 entries are drafted; 10-02 and older are not; `skippedOlder` is 7 | N/A |
+| Budget ceiling | A settled call leaves the next call over the run budget | Remaining drafts are `evals_not_run`; run is `stopped`, not `failed`; reserved, uncertain, and issue counts are 0 | No new reservation |
 
 </frozen-after-approval>
 
@@ -39,37 +43,52 @@ context:
 - `src/pipeline/ai/deepinfra.test.ts` — Catalog fetch sends no headers today. Pin the new ones. Bound is 16 cents.
 - `src/pipeline/ai/gateway.test.ts` — Add stage, status, and field on OpenRouter refusals.
 - `src/pipeline/agents/draftAndReview.ts` — Basis is `Evaluation did not complete: ${code}`; siblings get a generic skip. This code stops the run. Keep that, and use the public message for both.
-- `src/pipeline/connectors/courtListener.ts` — `entriesUrl`, baseline, summary, and client skip. Reuse `etCalendarDate`. Do not change pace, 429, or timeouts.
-- `src/pipeline/connectors/courtListener.test.ts` — Keep stored-date D, null baseline, and the `2026-09-12` MAX cutoff. Inject `now`.
+- `src/pipeline/connectors/courtListener.ts` — `entriesUrl`, baseline, summary, and client skip. Reuse `etCalendarDate`. Parse `FIRST_FETCH_WINDOW_DAYS` here. Do not change pace, 429, or timeouts.
+- `src/pipeline/connectors/courtListener.test.ts` — Default `now` is `2026-09-18T16:00:00.000Z`, so a 7-day window moves the Furcolo first-fetch cutoff to `2026-09-11`. Keep null baseline and the `2026-09-12` MAX cutoff. Update first-fetch expectations that assumed `published_at` was the cutoff.
+- `src/pipeline/workflow/dailyRun.ts` — `sourceChecksFromEnv` (94) passes the token only. Pass the parsed window. Admission block is 270–282: `running`, `awaiting`, reserved, uncertain, or issue count. `stopped` is not in that list.
+- `src/pipeline/agents/draftAndReview.ts` — Budget stop returns at 869–870 after stamping siblings. Do not throw that path.
+- `src/pipeline/workflow/dailyRunSteps.ts` — `afterPackaging` calls `completeDailyStep` only while status is `running` (251). A `stopped` run must not become `failed`.
+- `src/pipeline/ai/gateway.ts` — Ceiling refusal is before `reserve` (335). Successful calls `settle` (520).
+- `src/access-env.d.ts` — Optional `FIRST_FETCH_WINDOW_DAYS?: string`, with the other hand-written Env fields. Do not add a `wrangler.jsonc` `vars` block.
 - `src/server.ts` — Admin 503 returns `error.message`. Log one object, like `courtlistener_request_timeout`.
 
 ## Tasks & Acceptance
 
 **Execution:**
-- [ ] `src/pipeline/ai/gateway.ts` -- Add stages, message, detail, one log, named fields, and catalog headers.
-- [ ] `src/pipeline/ai/deepinfra.test.ts` -- Cover 403, a named field, a thrown fetch, headers, and no secrets.
-- [ ] `src/pipeline/ai/gateway.test.ts` -- Cover the other four stages.
-- [ ] `src/pipeline/agents/draftAndReview.ts` -- Use the public message for this code, including stopped siblings.
-- [ ] `src/pipeline/agents/draftAndReview.test.ts` -- Assert the basis.
-- [ ] `src/pipeline/connectors/courtListener.ts` -- Apply the window on `source_published_at` only and record the two summary fields.
-- [ ] `src/pipeline/connectors/courtListener.test.ts` -- Cover the window, both boundaries, and the unchanged MAX cutoff.
+- [x] `src/pipeline/ai/gateway.ts` -- Add stages, message, detail, one log, named fields, and catalog headers.
+- [x] `src/pipeline/ai/deepinfra.test.ts` -- Cover 403, a named field, a thrown fetch, headers, and no secrets.
+- [x] `src/pipeline/ai/gateway.test.ts` -- Cover the other four stages.
+- [x] `src/pipeline/agents/draftAndReview.ts` -- Use the public message for this code, including stopped siblings.
+- [x] `src/pipeline/agents/draftAndReview.test.ts` -- Assert the basis.
+- [x] `src/pipeline/connectors/courtListener.ts` -- Apply the configurable window on `source_published_at` only and record the two summary fields.
+- [x] `src/access-env.d.ts` -- Add optional `FIRST_FETCH_WINDOW_DAYS`.
+- [x] `src/pipeline/workflow/dailyRun.ts` -- Pass the parsed window into the CourtListener check.
+- [x] `src/pipeline/connectors/courtListener.test.ts` -- Cover the 0003 distribution, the inclusive cutoff boundary, an invalid window, and the unchanged MAX cutoff.
+- [x] `src/pipeline/agents/draftAndReview.test.ts` -- Assert a mid-evaluation budget ceiling leaves no reserved, uncertain, or issue cents and does not fail the run. Fix the code only if that fails.
 
 **Acceptance Criteria:**
 - Given a non-OK catalog response, when preflight throws, then the code stays `cost_policy_invalid`, the basis matches the Boundaries example, and the log has the detail fields with no secret or header.
 - Given any other `cost_policy_invalid` site, when it throws, then the basis names only that stage.
 - Given the catalog request, when it is sent, then it carries the User-Agent and `Accept` from Boundaries.
-- Given no stored events and a `published_at` older than 2 ET days, when the docket is polled, then `date_filed__gte` is the cutoff, that date is drafted, the day before is not, and the summary has the cutoff and `skippedOlder`.
+- Given no stored events, `published_at` older than the window, and the default of 7, when the docket is polled, then `date_filed__gte` is the cutoff, that date is drafted, the day before is not, and the summary has the cutoff and `skippedOlder`.
+- Given run date `2026-10-11` and the 0003 filing counts, when the docket is polled, then `effectiveCutoff` is `2026-10-04`, the three `2026-10-05` entries are drafted, `2026-10-02` and older are not, and `skippedOlder` is 7.
+- Given `FIRST_FETCH_WINDOW_DAYS` is not a positive integer, when it is read, then the window is 7 and one log records the fallback.
 - Given `MAX(occurred_at)` date D, when that docket is polled, then `date_filed__gte` is D and the window fields are absent.
+- Given a settled call and a next call over the run budget, when evaluation stops, then the remaining drafts are `evals_not_run`, the run is `stopped` rather than `failed`, and reserved cents, uncertain cents, and accounting issues are 0.
 
 ## Implementation Notes
 
+- `npm run check` exit 0. `npm test` exit 0 (1514 passed, 6 skipped).
+- The budget ceiling already settles the completed call, refuses the next call before `reserve`, stamps remaining drafts `evals_not_run`, returns `{ budgetStopped: true }`, and leaves the run `stopped`. Admission ignores that status. The new assertions lock reserved cents, uncertain cents, and issue count at 0. No production change was required on that path.
+- `sourceChecksFromEnv` accepts an optional `now` so tests can pin the ET run date. Production leaves it unset and uses the wall clock.
+
 ## Spec Change Log
 
 ## Review Triage Log
 
 ## Design Notes
 
-32 cents per draft means the 100-cent cap completes 3 drafts. Two ET days is the handful; one day is often empty and seven overruns. A burst still hits the cap.
+Run `0003`'s newest filings are three entries on `2026-10-05`. A 2-day window before `2026-10-11` excludes them and the run is empty. Seven days sets the cutoff at `2026-10-04`, drafts those three, and reserves 96 cents. There is no `vars` block in `wrangler.jsonc`, so the default lives in code and `Env`.
 
 ## Verification
 
diff --git a/src/access-env.d.ts b/src/access-env.d.ts
index 7580e81..d4a3f23 100644
--- a/src/access-env.d.ts
+++ b/src/access-env.d.ts
@@ -57,4 +57,10 @@ interface Env {
   /** Account Secrets Store, workers scope; local strings are fixture/dev only. */
   DEEPINFRA_API_KEY?: string | { get(): Promise<string> };
   AI_GATEWAY_TOKEN?: string | { get(): Promise<string> };
+  /**
+   * First CourtListener fetch window, in calendar days. Optional Worker var.
+   * Unset uses 7. A value that is not a positive integer falls back to 7.
+   * Not a secret and not a wrangler.jsonc var: this repo has no `vars` block.
+   */
+  FIRST_FETCH_WINDOW_DAYS?: string;
 }
diff --git a/src/pipeline/agents/draftAndReview.test.ts b/src/pipeline/agents/draftAndReview.test.ts
index 1ec5a4d..fa953d2 100644
--- a/src/pipeline/agents/draftAndReview.test.ts
+++ b/src/pipeline/agents/draftAndReview.test.ts
@@ -3,6 +3,7 @@ import { fixtureCostPolicy } from "../../test/costPolicyFixture";
 import { env } from "cloudflare:workers";
 import { afterEach, describe, expect, it, vi } from "vitest";
 
+import { accountingForRun } from "../../shared/db/repos/llmAccountingRepo";
 import * as draftsRepo from "../../shared/db/repos/draftsRepo";
 import * as evidenceRepo from "../../shared/db/repos/evidenceRepo";
 import * as modeRepo from "../../shared/db/repos/modeRepo";
@@ -345,6 +346,23 @@ describe("draftAndReview (story 3.5)", () => {
       false
     );
     expect(evidence.filter((e) => e.event === "run.stopped")).toHaveLength(1);
+    expect(run?.status).toBe("stopped");
+    expect(await accountingForRun(testEnv.DB, runId)).toMatchObject({
+      reservedCents: 0,
+      uncertainCents: 0,
+      issueCount: 0
+    });
+    const operations = await testEnv.DB.prepare(
+      "SELECT state, liability_cents AS liabilityCents FROM llm_operations WHERE run_id = ?"
+    )
+      .bind(runId)
+      .all<{ state: string; liabilityCents: number }>();
+    expect(operations.results).toEqual([
+      { state: "settled", liabilityCents: 0 }
+    ]);
+    expect(run?.reservedCents ?? 0).toBe(0);
+    expect(run?.uncertainCents ?? 0).toBe(0);
+    expect(run?.accountingIssueCount ?? 0).toBe(0);
     const evaluated = evidence.filter((e) => e.event === "draft.evaluated");
     expect(evaluated).toHaveLength(2);
     expect(
@@ -352,6 +370,39 @@ describe("draftAndReview (story 3.5)", () => {
     ).toEqual([firstId, secondId].sort());
   });
 
+  it("names cost_policy_invalid on the failed draft and the drafts it stops", async () => {
+    const runId = await insertRun();
+    const firstId = await insertShellDraft(runId, { id: `d:${runId}:01` });
+    const secondId = await insertShellDraft(runId, {
+      id: `d:${runId}:02`,
+      targetEntityId: "st-ny"
+    });
+    await seedConfig(DRAFTER_REVIEWER_ROLES);
+    const provider = fakeProvider();
+    await expect(
+      draftAndReview(testEnv.DB, runId, {
+        ...deps(provider),
+        costPolicy: () => {
+          throw new Error("missing policy");
+        }
+      })
+    ).rejects.toMatchObject({
+      code: "cost_policy_invalid",
+      message: "cost_policy_invalid: policy_lookup"
+    });
+    const drafts = await draftsRepo.listByRun(testEnv.DB, runId);
+    const basis = "cost_policy_invalid: policy_lookup";
+    expect(evalOf(drafts.find((d) => d.id === firstId)!).basis).toBe(basis);
+    expect(evalOf(drafts.find((d) => d.id === secondId)!).basis).toBe(basis);
+    expect(evalOf(drafts.find((d) => d.id === firstId)!).status).toBe(
+      "evals_not_run"
+    );
+    expect(evalOf(drafts.find((d) => d.id === secondId)!).status).toBe(
+      "evals_not_run"
+    );
+    expect(provider.count()).toBe(0);
+  });
+
   it("retains failed-call liability and refuses later sibling dispatch", async () => {
     const runId = await insertRun();
     const failId = await insertShellDraft(runId, {
diff --git a/src/pipeline/agents/draftAndReview.ts b/src/pipeline/agents/draftAndReview.ts
index 98f3b5f..84427f7 100644
--- a/src/pipeline/agents/draftAndReview.ts
+++ b/src/pipeline/agents/draftAndReview.ts
@@ -444,6 +444,14 @@ function isBudgetStopped(err: unknown): boolean {
   return err instanceof GatewayError && err.code === "budget_stopped";
 }
 
+function gatewayBasis(err: unknown): string {
+  if (err instanceof GatewayError && err.code === "cost_policy_invalid")
+    return err.message;
+  if (err instanceof GatewayError)
+    return `Evaluation did not complete: ${err.code}.`;
+  return "Evaluation stopped after an unexpected error.";
+}
+
 function isPerDraftGatewayError(err: unknown): boolean {
   return err instanceof GatewayError && PER_DRAFT_GATEWAY_CODES.has(err.code);
 }
@@ -838,15 +846,17 @@ export async function draftAndReview(
           timestamp,
           threshold,
           guidanceRefs,
-          err instanceof GatewayError
-            ? `Evaluation did not complete: ${err.code}.`
-            : "Evaluation stopped after an unexpected error."
+          gatewayBasis(err)
         );
       } catch {
         persistFailed = true;
       }
       const stopFurther =
         persistFailed || isBudgetStopped(err) || !isPerDraftGatewayError(err);
+      const siblingBasis =
+        err instanceof GatewayError && err.code === "cost_policy_invalid"
+          ? err.message
+          : "Evaluation was skipped after a preceding evaluation stopped the run.";
       if (stopFurther) {
         for (let j = i + 1; j < drafts.length; j++) {
           const remaining = drafts[j]!;
@@ -859,7 +869,7 @@ export async function draftAndReview(
               timestamp,
               threshold,
               NO_GUIDANCE,
-              "Evaluation was skipped after a preceding evaluation stopped the run."
+              siblingBasis
             );
           } catch {
             // Keep attempting siblings, but never checkpoint incomplete readiness.
diff --git a/src/pipeline/ai/deepinfra.test.ts b/src/pipeline/ai/deepinfra.test.ts
index 66bd6d8..2fc0d46 100644
--- a/src/pipeline/ai/deepinfra.test.ts
+++ b/src/pipeline/ai/deepinfra.test.ts
@@ -3,6 +3,7 @@ import { afterEach, describe, expect, it, vi } from "vitest";
 import {
   complete,
   createDeepInfraProvider,
+  DEEPINFRA_CATALOG_USER_AGENT,
   llmProvidersFromEnv
 } from "./gateway";
 import { resolveCostPolicy } from "./costPolicy";
@@ -101,7 +102,10 @@ function http(body: unknown = responseBody(), metadata: unknown = catalog()) {
   );
   const fetcher = vi.fn(async (url: unknown, init?: RequestInit) => {
     if (url === "https://api.deepinfra.com/models/list") {
-      expect(init?.headers).toBeUndefined();
+      const headers = new Headers(init?.headers);
+      expect(headers.get("accept")).toBe("application/json");
+      expect(headers.get("user-agent")).toBe(DEEPINFRA_CATALOG_USER_AGENT);
+      expect(init?.redirect).toBe("error");
       expect(init?.signal).toBeInstanceOf(AbortSignal);
       return Response.json(metadata);
     }
@@ -254,6 +258,7 @@ describe("DeepInfra central gateway", () => {
       expect(headers.get("cf-aig-authorization")).toBe(
         token ? `Bearer ${token}` : null
       );
+      expect(headers.get("user-agent")).toBeNull();
       expect(JSON.parse(init!.body as string)).toEqual({
         model: MODEL,
         messages: [{ role: "user", content: "PRIVATE prompt" }],
@@ -369,6 +374,105 @@ describe("DeepInfra central gateway", () => {
       expect(fetcher).not.toHaveBeenCalled();
     }
   );
+  it("names an HTTP 403 catalog refusal without secrets", async () => {
+    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
+    try {
+      vi.stubGlobal(
+        "fetch",
+        vi.fn(
+          async () =>
+            new Response("bot check Bearer SECRET-KEY", { status: 403 })
+        )
+      );
+      await expect(
+        createDeepInfraProvider(configured)!.preflight!({
+          model: MODEL,
+          policy,
+          now: () => NOW
+        })
+      ).rejects.toMatchObject({
+        code: "cost_policy_invalid",
+        message: "cost_policy_invalid: deepinfra_preflight (http 403)",
+        detail: expect.objectContaining({
+          stage: "deepinfra_preflight",
+          status: 403,
+          bodyPrefix: expect.stringContaining("bearer [redacted]")
+        })
+      });
+      const logged = JSON.stringify(warn.mock.calls);
+      expect(logged).not.toContain("SECRET-KEY");
+      expect(logged).toContain("cost_policy_invalid");
+      expect(warn).toHaveBeenCalledWith(
+        expect.objectContaining({
+          event: "cost_policy_invalid",
+          stage: "deepinfra_preflight",
+          status: 403
+        })
+      );
+    } finally {
+      warn.mockRestore();
+    }
+  });
+  it("names the catalog field that failed", async () => {
+    const input = await setup();
+    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
+    try {
+      http(responseBody(), [{ ...catalog()[0], deprecated: true }]);
+      await expect(complete(deps(), input)).rejects.toMatchObject({
+        code: "cost_policy_invalid",
+        message: "cost_policy_invalid: deepinfra_preflight",
+        detail: expect.objectContaining({
+          stage: "deepinfra_preflight",
+          field: "deprecated"
+        })
+      });
+      expect(JSON.stringify(warn.mock.calls)).not.toContain("PRIVATE");
+    } finally {
+      warn.mockRestore();
+    }
+  });
+  it("records a thrown catalog fetch without secrets", async () => {
+    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
+    try {
+      vi.stubGlobal(
+        "fetch",
+        vi.fn(async () => {
+          throw new TypeError("Bearer SECRET-KEY network down");
+        })
+      );
+      await expect(
+        createDeepInfraProvider(configured)!.preflight!({
+          model: MODEL,
+          policy,
+          now: () => NOW
+        })
+      ).rejects.toMatchObject({
+        code: "cost_policy_invalid",
+        message: "cost_policy_invalid: deepinfra_preflight",
+        detail: expect.objectContaining({
+          stage: "deepinfra_preflight",
+          errorName: "TypeError",
+          errorMessage: expect.stringContaining("bearer [redacted]")
+        })
+      });
+      expect(JSON.stringify(warn.mock.calls)).not.toContain("SECRET-KEY");
+    } finally {
+      warn.mockRestore();
+    }
+  });
+  it("does not relabel revalidation as a catalog failure", async () => {
+    http();
+    await expect(
+      createDeepInfraProvider(configured)!.preflight!({
+        model: MODEL,
+        policy,
+        now: () => policy.validUntil
+      })
+    ).rejects.toMatchObject({
+      code: "cost_policy_invalid",
+      message: "cost_policy_invalid: revalidate_before_inference"
+    });
+  });
   it("bounds the entire metadata body deadline", async () => {
     vi.useFakeTimers();
     const fetcher = vi.fn(async () => ({
diff --git a/src/pipeline/ai/gateway.test.ts b/src/pipeline/ai/gateway.test.ts
index 8620a2e..5c6fc44 100644
--- a/src/pipeline/ai/gateway.test.ts
+++ b/src/pipeline/ai/gateway.test.ts
@@ -804,9 +804,54 @@ describe("bounded provider cost", () => {
     const w = workers();
     await expect(
       complete({ ...w.deps, now: () => COST_POLICIES[0]!.validUntil }, input())
-    ).rejects.toMatchObject({ code: "cost_policy_invalid" });
+    ).rejects.toMatchObject({
+      code: "cost_policy_invalid",
+      message: "cost_policy_invalid: policy_lookup"
+    });
     expect(w.run).not.toHaveBeenCalled();
   });
+  it("names a policy lookup failure and a model mismatch", async () => {
+    await setup();
+    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
+    try {
+      const w = workers();
+      await expect(
+        complete(
+          {
+            ...w.deps,
+            costPolicy: () => {
+              throw new Error("missing policy");
+            }
+          },
+          input()
+        )
+      ).rejects.toMatchObject({
+        code: "cost_policy_invalid",
+        message: "cost_policy_invalid: policy_lookup",
+        detail: expect.objectContaining({
+          stage: "policy_lookup",
+          errorName: "Error",
+          errorMessage: "missing policy"
+        })
+      });
+      await expect(
+        complete(
+          {
+            ...w.deps,
+            costPolicy: () => fixtureCostPolicy("other", "other-model", now)
+          },
+          input()
+        )
+      ).rejects.toMatchObject({
+        code: "cost_policy_invalid",
+        message: "cost_policy_invalid: policy_model_mismatch",
+        detail: expect.objectContaining({ stage: "policy_model_mismatch" })
+      });
+      expect(w.run).not.toHaveBeenCalled();
+    } finally {
+      warn.mockRestore();
+    }
+  });
   it.each([
     undefined,
     { prompt_tokens: NaN, completion_tokens: 1 },
@@ -931,7 +976,10 @@ describe("bounded provider cost", () => {
     vi.stubGlobal("fetch", fetch);
     await expect(
       complete({ db: testEnv.DB, provider: router(), now: () => time }, input())
-    ).rejects.toMatchObject({ code: "cost_policy_invalid" });
+    ).rejects.toMatchObject({
+      code: "cost_policy_invalid",
+      message: "cost_policy_invalid: revalidate_before_inference"
+    });
     expect(fetch).toHaveBeenCalledTimes(1);
     expect(String(fetch.mock.calls[0]?.[0] ?? "")).not.toContain(
       "chat/completions"
@@ -956,9 +1004,45 @@ describe("bounded provider cost", () => {
     vi.stubGlobal("fetch", fetch);
     await expect(
       complete({ db: testEnv.DB, provider: router(), now: () => now }, input())
-    ).rejects.toMatchObject({ code: "cost_policy_invalid" });
+    ).rejects.toMatchObject({
+      code: "cost_policy_invalid",
+      message: "cost_policy_invalid: openrouter_preflight",
+      detail: expect.objectContaining({
+        stage: "openrouter_preflight",
+        field: "pricing.completion"
+      })
+    });
     expect(fetch).toHaveBeenCalledTimes(1);
   });
+  it("names an OpenRouter preflight HTTP failure", async () => {
+    await setup(500, "openrouter", COST_POLICIES[1]!.model);
+    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
+    try {
+      vi.stubGlobal(
+        "fetch",
+        vi.fn(
+          async () => new Response("Bearer SECRET-KEY blocked", { status: 403 })
+        )
+      );
+      await expect(
+        complete(
+          { db: testEnv.DB, provider: router(), now: () => now },
+          input()
+        )
+      ).rejects.toMatchObject({
+        code: "cost_policy_invalid",
+        message: "cost_policy_invalid: openrouter_preflight (http 403)",
+        detail: expect.objectContaining({
+          stage: "openrouter_preflight",
+          status: 403,
+          bodyPrefix: expect.stringContaining("bearer [redacted]")
+        })
+      });
+      expect(JSON.stringify(warn.mock.calls)).not.toContain("SECRET-KEY");
+    } finally {
+      warn.mockRestore();
+    }
+  });
   it("Sonnet refuses 123 cents before even endpoint lookup", async () => {
     await setup(123, "openrouter", COST_POLICIES[1]!.model);
     const fetch = routerFetch();
diff --git a/src/pipeline/ai/gateway.ts b/src/pipeline/ai/gateway.ts
index b0174ae..0176e4e 100644
--- a/src/pipeline/ai/gateway.ts
+++ b/src/pipeline/ai/gateway.ts
@@ -51,16 +51,90 @@ import { GUARDRAIL_RULE_ID, isToolAllowed } from "./actionPolicy";
  *   7. record the call + bump spend; return the result
  */
 
+export const DEEPINFRA_CATALOG_USER_AGENT =
+  "PredictionMarketLitigation/0.1.0 (+https://predictionmarketlitigation.com)";
+
+const DIAGNOSTIC_TEXT_MAX = 180;
+
+export type CostPolicyDetail = {
+  stage: string;
+  errorName?: string;
+  errorMessage?: string;
+  status?: number;
+  bodyPrefix?: string;
+  field?: string;
+};
+
 export class GatewayError extends Error {
   readonly code: GatewayErrorCode;
+  readonly detail?: CostPolicyDetail;
 
-  constructor(code: GatewayErrorCode, message: string) {
+  constructor(
+    code: GatewayErrorCode,
+    message: string,
+    detail?: CostPolicyDetail
+  ) {
     super(message);
     this.name = "GatewayError";
     this.code = code;
+    this.detail = detail;
   }
 }
 
+function diagnosticText(value: string): string {
+  const collapsed = value
+    .replace(/bearer\s+\S+/gi, "bearer [redacted]")
+    .replace(/\s+/g, " ")
+    .trim();
+  return collapsed.length > DIAGNOSTIC_TEXT_MAX
+    ? collapsed.slice(0, DIAGNOSTIC_TEXT_MAX)
+    : collapsed;
+}
+
+function errorFacts(
+  error: unknown
+): Pick<CostPolicyDetail, "errorName" | "errorMessage"> {
+  if (error instanceof Error) {
+    return {
+      errorName: error.name || "Error",
+      errorMessage: diagnosticText(error.message)
+    };
+  }
+  return { errorName: "Error", errorMessage: diagnosticText(String(error)) };
+}
+
+function costPolicyMessage(stage: string, status?: number): string {
+  return status == null
+    ? `cost_policy_invalid: ${stage}`
+    : `cost_policy_invalid: ${stage} (http ${status})`;
+}
+
+function logCostPolicy(detail: CostPolicyDetail): void {
+  console.warn({
+    event: "cost_policy_invalid",
+    stage: detail.stage,
+    ...(detail.errorName ? { errorName: detail.errorName } : {}),
+    ...(detail.errorMessage ? { errorMessage: detail.errorMessage } : {}),
+    ...(detail.status == null ? {} : { status: detail.status }),
+    ...(detail.bodyPrefix ? { bodyPrefix: detail.bodyPrefix } : {}),
+    ...(detail.field ? { field: detail.field } : {})
+  });
+}
+
+function throwCostPolicy(
+  stage: string,
+  extra: Omit<CostPolicyDetail, "stage"> = {},
+  ctor: typeof GatewayError = GatewayError
+): never {
+  const detail: CostPolicyDetail = { stage, ...extra };
+  logCostPolicy(detail);
+  throw new ctor(
+    "cost_policy_invalid",
+    costPolicyMessage(stage, extra.status),
+    detail
+  );
+}
+
 class ProvenPreDispatchRefusal extends GatewayError {}
 
 /**
@@ -305,17 +379,11 @@ export async function complete(
       ),
       now()
     );
-  } catch {
-    throw new GatewayError(
-      "cost_policy_invalid",
-      "Missing, expired, unsupported, or invalid provider cost policy."
-    );
+  } catch (error) {
+    throwCostPolicy("policy_lookup", errorFacts(error));
   }
   if (policy.provider !== mapping.provider || policy.model !== mapping.model)
-    throw new GatewayError(
-      "cost_policy_invalid",
-      "Cost policy does not match the configured model."
-    );
+    throwCostPolicy("policy_model_mismatch");
   const admissionBoundCents = tokenCostCents(
     policy,
     policy.inputTokens,
@@ -650,10 +718,11 @@ export function createWorkersAiProvider(env: Env): LlmProvider | null {
 function revalidateBeforeInference(policy: CostPolicy, now: string): void {
   try {
     validatePolicy(policy, now);
-  } catch {
-    throw new ProvenPreDispatchRefusal(
-      "cost_policy_invalid",
-      "Cost policy expired or became invalid before inference."
+  } catch (error) {
+    throwCostPolicy(
+      "revalidate_before_inference",
+      errorFacts(error),
+      ProvenPreDispatchRefusal
     );
   }
 }
@@ -680,6 +749,43 @@ export function llmProvidersFromEnv(env: Env): LlmProvider[] {
  * only when `OPENROUTER_API_KEY`, `AI_GATEWAY_ID`, and `CLOUDFLARE_ACCOUNT_ID`
  * are all non-empty. Does not call `env.AI.run`.
  */
+function openRouterEndpointField(
+  endpoint: {
+    context_length?: number;
+    supported_parameters?: string[];
+    pricing?: Record<string, unknown>;
+  },
+  inputTokens: number
+): string | null {
+  if (endpoint.context_length !== inputTokens) return "context_length";
+  if (!endpoint.supported_parameters?.includes("max_tokens"))
+    return "supported_parameters";
+  const pricing = endpoint.pricing;
+  if (!pricing || pricing.prompt == null) return "pricing.prompt";
+  if (pricing.completion == null) return "pricing.completion";
+  const limits: Record<string, string> = {
+    prompt: "0.000003",
+    completion: "0.000015",
+    input_cache_read: "0.000006",
+    input_cache_write: "0.000006",
+    input_cache_write_1h: "0.000006",
+    request: "0",
+    image: "0",
+    discount: "0"
+  };
+  for (const [key, value] of Object.entries(pricing)) {
+    if (key === "web_search") continue;
+    if (key === "overrides") {
+      if (!(Array.isArray(value) && value.length === 0))
+        return "pricing.overrides";
+      continue;
+    }
+    if (!(key in limits) || !decimalAtMost(value, limits[key]!))
+      return `pricing.${key}`;
+  }
+  return null;
+}
+
 export function createOpenRouterProvider(env: Env): LlmProvider | null {
   const apiKey = env.OPENROUTER_API_KEY;
   const gatewayId = env.AI_GATEWAY_ID;
@@ -701,11 +807,19 @@ export function createOpenRouterProvider(env: Env): LlmProvider | null {
           `https://openrouter.ai/api/v1/models/${model}/endpoints`,
           { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) }
         );
-        if (!metadata.ok)
-          throw new GatewayError(
-            "cost_policy_invalid",
-            "Endpoint pricing unavailable."
-          );
+        if (!metadata.ok) {
+          let bodyPrefix = "";
+          try {
+            bodyPrefix = diagnosticText(await metadata.text());
+          } catch {
+            bodyPrefix = "";
+          }
+          throwCostPolicy("openrouter_preflight", {
+            ...errorFacts(new Error(`HTTP ${metadata.status}`)),
+            status: metadata.status,
+            ...(bodyPrefix ? { bodyPrefix } : {})
+          });
+        }
         const endpoints = (await metadata.json()) as {
           data?: {
             endpoints?: Array<{
@@ -722,48 +836,22 @@ export function createOpenRouterProvider(env: Env): LlmProvider | null {
             (e) =>
               e.tag === "amazon-bedrock" || e.tag?.startsWith("amazon-bedrock/")
           ) ?? [];
-        const limits: Record<string, string> = {
-          prompt: "0.000003",
-          completion: "0.000015",
-          input_cache_read: "0.000006",
-          input_cache_write: "0.000006",
-          input_cache_write_1h: "0.000006",
-          request: "0",
-          image: "0",
-          discount: "0"
-        };
-        const supported =
-          eligible.length > 0 &&
-          eligible.every((endpoint) => {
-            const pricing = endpoint.pricing;
-            // Search is not requested; cache replacement rates are covered by the input ceiling.
-            const validPrices =
-              pricing &&
-              Object.entries(pricing).every(([key, value]) => {
-                if (key === "web_search") return true;
-                if (key === "overrides")
-                  return Array.isArray(value) && value.length === 0;
-                return key in limits && decimalAtMost(value, limits[key]!);
-              });
-            return (
-              endpoint.context_length === policy.inputTokens &&
-              endpoint.supported_parameters?.includes("max_tokens") &&
-              validPrices &&
-              pricing?.prompt != null &&
-              pricing.completion != null
-            );
+        const field =
+          eligible.length === 0
+            ? "endpoints"
+            : (eligible
+                .map((endpoint) =>
+                  openRouterEndpointField(endpoint, policy.inputTokens)
+                )
+                .find((issue) => issue != null) ?? null);
+        if (field)
+          throwCostPolicy("openrouter_preflight", {
+            field,
+            ...errorFacts(new Error(field))
           });
-        if (!supported)
-          throw new GatewayError(
-            "cost_policy_invalid",
-            "Endpoint pricing, context, or billing tiers cannot enforce the reviewed bound."
-          );
       } catch (error) {
         if (error instanceof GatewayError) throw error;
-        throw new GatewayError(
-          "cost_policy_invalid",
-          "Endpoint pricing could not be validated."
-        );
+        throwCostPolicy("openrouter_preflight", errorFacts(error));
       }
       revalidateBeforeInference(policy, now());
     },
@@ -845,6 +933,87 @@ function catalogDecimal(value: unknown): string | undefined {
   return expanded.replace(/^0+(?=\d)/, "");
 }
 
+function deepInfraCatalogField(
+  catalog: unknown,
+  model: string,
+  policy: CostPolicy
+): string | null {
+  if (!Array.isArray(catalog)) return "catalog";
+  const matches = catalog.filter(
+    (entry) =>
+      entry != null &&
+      typeof entry === "object" &&
+      (entry as { model_name?: unknown }).model_name === model
+  );
+  if (matches.length !== 1 || model !== "zai-org/GLM-5.3-Flash")
+    return "model_name";
+  const row = matches[0] as Record<string, unknown>;
+  if (row.type !== "text-generation") return "type";
+  if (row.reported_type !== "text-generation") return "reported_type";
+  if (row.private !== 0) return "private";
+  if (row.deprecated !== null) return "deprecated";
+  if (row.replaced_by !== null) return "replaced_by";
+  if (row.max_tokens !== policy.inputTokens) return "max_tokens";
+  if (!Array.isArray(row.tags)) return "tags";
+  for (const tag of ["openai", "reasoning", "json"]) {
+    if (!row.tags.includes(tag)) return `tags.${tag}`;
+  }
+  const pricing = row.pricing;
+  if (
+    pricing == null ||
+    typeof pricing !== "object" ||
+    (pricing as { type?: unknown }).type !== "tokens"
+  )
+    return "pricing.type";
+  const prices = pricing as Record<string, unknown>;
+  const limits: Record<string, string> = {
+    cents_per_input_token: "0.000015",
+    cents_per_output_token: "0.00005",
+    rate_per_input_token_cached: "1",
+    discount: "1"
+  };
+  const nullFields = [
+    "discount_ends_at",
+    "short",
+    "full",
+    "table",
+    "rate_per_input_token_cache_write",
+    "rate_per_service_tier_priority",
+    "rate_per_service_tier_flex",
+    "rate_per_explicit_cache_write_token",
+    "explicit_cache_granularity_tokens"
+  ];
+  for (const key of Object.keys(limits)) {
+    if (!(key in prices)) return `pricing.${key}`;
+  }
+  for (const key of nullFields) {
+    if (!(key in prices)) return `pricing.${key}`;
+  }
+  for (const [key, value] of Object.entries(prices)) {
+    if (key === "type") {
+      if (value !== "tokens") return "pricing.type";
+      continue;
+    }
+    if (key === "discount_ends_at") {
+      if (
+        !(
+          value === null ||
+          (typeof value === "string" && Number.isFinite(Date.parse(value)))
+        )
+      )
+        return "pricing.discount_ends_at";
+      continue;
+    }
+    if (key in limits) {
+      if (!decimalAtMost(catalogDecimal(value), limits[key]!))
+        return `pricing.${key}`;
+      continue;
+    }
+    if (!(nullFields.includes(key) && value === null)) return `pricing.${key}`;
+  }
+  return null;
+}
+
 /** Fixed custom provider route. Credentials are captured only in a per-call closure. */
 export function createDeepInfraProvider(env: Env): LlmProvider | null {
   const configured = (value: unknown): boolean =>
@@ -873,75 +1042,60 @@ export function createDeepInfraProvider(env: Env): LlmProvider | null {
           async (signal) => {
             const response = await fetch(
               "https://api.deepinfra.com/models/list",
-              { signal, redirect: "error" }
+              {
+                signal,
+                redirect: "error",
+                headers: {
+                  Accept: "application/json",
+                  "User-Agent": DEEPINFRA_CATALOG_USER_AGENT
+                }
+              }
             );
-            if (!response.ok) throw new Error();
+            if (!response.ok) {
+              let bodyPrefix = "";
+              try {
+                bodyPrefix = diagnosticText(await response.text());
+              } catch {
+                bodyPrefix = "";
+              }
+              const error = new Error(`HTTP ${response.status}`);
+              throw Object.assign(error, {
+                status: response.status,
+                ...(bodyPrefix ? { bodyPrefix } : {})
+              });
+            }
             const catalog: unknown = await response.json();
-            if (!Array.isArray(catalog)) throw new Error();
-            const matches = catalog.filter((m) => m?.model_name === model);
-            if (matches.length !== 1 || model !== "zai-org/GLM-5.3-Flash")
-              throw new Error();
-            const m = matches[0];
-            if (
-              m.type !== "text-generation" ||
-              m.reported_type !== "text-generation" ||
-              m.private !== 0 ||
-              m.deprecated !== null ||
-              m.replaced_by !== null ||
-              m.max_tokens !== policy.inputTokens ||
-              !Array.isArray(m.tags) ||
-              !["openai", "reasoning", "json"].every((tag) =>
-                m.tags.includes(tag)
-              )
-            )
-              throw new Error();
-            const p = m.pricing;
-            if (!p || p.type !== "tokens") throw new Error();
-            const limits: Record<string, string> = {
-              cents_per_input_token: "0.000015",
-              cents_per_output_token: "0.00005",
-              rate_per_input_token_cached: "1",
-              discount: "1"
-            };
-            const nullFields = [
-              "discount_ends_at",
-              "short",
-              "full",
-              "table",
-              "rate_per_input_token_cache_write",
-              "rate_per_service_tier_priority",
-              "rate_per_service_tier_flex",
-              "rate_per_explicit_cache_write_token",
-              "explicit_cache_granularity_tokens"
-            ];
-            if (
-              !Object.keys(limits).every((key) => key in p) ||
-              !nullFields.every((key) => key in p) ||
-              !Object.entries(p).every(([key, value]) => {
-                if (key === "type") return value === "tokens";
-                if (key === "discount_ends_at")
-                  return (
-                    value === null ||
-                    (typeof value === "string" &&
-                      Number.isFinite(Date.parse(value)))
-                  );
-                if (key in limits)
-                  return decimalAtMost(catalogDecimal(value), limits[key]!);
-                return nullFields.includes(key) && value === null;
-              })
-            )
-              throw new Error();
+            const field = deepInfraCatalogField(catalog, model, policy);
+            if (field) {
+              const error = new Error(field);
+              throw Object.assign(error, { field });
+            }
           },
           PROVIDER_TIMEOUT_MS,
           "DeepInfra catalog"
         );
-        revalidateBeforeInference(policy, now());
-      } catch {
-        throw new GatewayError(
-          "cost_policy_invalid",
-          "DeepInfra catalog could not validate the reviewed bound."
-        );
+      } catch (error) {
+        if (error instanceof GatewayError) throw error;
+        const status =
+          typeof (error as { status?: unknown }).status === "number"
+            ? (error as { status: number }).status
+            : undefined;
+        const bodyPrefix =
+          typeof (error as { bodyPrefix?: unknown }).bodyPrefix === "string"
+            ? (error as { bodyPrefix: string }).bodyPrefix
+            : undefined;
+        const field =
+          typeof (error as { field?: unknown }).field === "string"
+            ? (error as { field: string }).field
+            : undefined;
+        throwCostPolicy("deepinfra_preflight", {
+          ...errorFacts(error),
+          ...(status == null ? {} : { status }),
+          ...(bodyPrefix ? { bodyPrefix } : {}),
+          ...(field ? { field } : {})
+        });
       }
+      revalidateBeforeInference(policy, now());
     },
     async prepare(signal) {
       try {
diff --git a/src/pipeline/connectors/courtListener.test.ts b/src/pipeline/connectors/courtListener.test.ts
index ac1302e..077d599 100644
--- a/src/pipeline/connectors/courtListener.test.ts
+++ b/src/pipeline/connectors/courtListener.test.ts
@@ -23,6 +23,7 @@ import {
   docketIdFromUrl,
   entriesUrl,
   entryUrl,
+  firstFetchWindowDays,
   parseEntries,
   reasonForStatus,
   retryAfterMs,
@@ -206,6 +207,28 @@ describe("CourtListener helpers", () => {
     expect(reasonForStatus(404)).toBe("http_error");
   });
 
+  it("uses 7 days unless FIRST_FETCH_WINDOW_DAYS is a positive integer", () => {
+    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
+    try {
+      expect(firstFetchWindowDays(undefined)).toBe(7);
+      expect(firstFetchWindowDays("14")).toBe(14);
+      expect(firstFetchWindowDays(" 3 ")).toBe(3);
+      expect(warn).not.toHaveBeenCalled();
+      for (const raw of ["0", "", "  ", "1.5", "-2", "08", "nope"]) {
+        expect(firstFetchWindowDays(raw)).toBe(7);
+      }
+      expect(warn).toHaveBeenCalledTimes(7);
+      for (const call of warn.mock.calls) {
+        expect(call[0]).toEqual({
+          event: "first_fetch_window_invalid",
+          fallback: 7
+        });
+      }
+    } finally {
+      warn.mockRestore();
+    }
+  });
+
   it("parses Retry-After seconds and HTTP dates and caps them", () => {
     const now = Date.parse("2026-10-10T12:00:00.000Z");
     expect(retryAfterMs(new Headers({ "retry-after": "45" }), now)).toBe(
@@ -531,10 +554,10 @@ describe("CourtListener connector (story 3.21)", () => {
     );
   });
 
-  it("drafts entries on the baseline date and the next day, and not the day before", async () => {
-    const baseline = FURCOLO_TRACKED_SINCE;
-    const dayBefore = "2026-05-20";
-    const nextDay = "2026-05-22";
+  it("drafts entries on the effective cutoff and the next day, and not the day before", async () => {
+    const cutoff = "2026-09-11";
+    const dayBefore = "2026-09-10";
+    const nextDay = "2026-09-12";
     const calls = stubFetch((docketId) =>
       docketId === FURCOLO
         ? {
@@ -545,13 +568,13 @@ describe("CourtListener connector (story 3.21)", () => {
                   id: 88101,
                   entry_number: 1,
                   date_filed: dayBefore,
-                  description: "Day before the baseline."
+                  description: "Day before the cutoff."
                 },
                 {
                   id: 88102,
                   entry_number: 2,
-                  date_filed: baseline,
-                  description: "Filed on the baseline."
+                  date_filed: cutoff,
+                  description: "Filed on the cutoff."
                 },
                 {
                   id: 88103,
@@ -571,13 +594,19 @@ describe("CourtListener connector (story 3.21)", () => {
       ({ url }) => new URL(url).searchParams.get("docket") === FURCOLO
     );
     expect(new URL(furcolo!.url).searchParams.get("date_filed__gte")).toBe(
-      baseline
+      cutoff
     );
     const dates = (await draftsRepo.listByRun(testEnv.DB, runId)).map(
       (draft) => (draft.diff as { occurredAt?: string }).occurredAt
     );
-    expect(dates).toEqual(expect.arrayContaining([baseline, nextDay]));
+    expect(dates).toEqual(expect.arrayContaining([cutoff, nextDay]));
     expect(dates).not.toContain(dayBefore);
+    expect(docketSummary(await fetchedPayload(runId), FURCOLO)).toMatchObject({
+      baseline: { kind: "source_published_at", date: FURCOLO_TRACKED_SINCE },
+      effectiveCutoff: cutoff,
+      skippedOlder: 1,
+      newEntries: 2
+    });
   });
 
   it("omits date_filed__gte when the docket has no baseline", async () => {
@@ -626,7 +655,7 @@ describe("CourtListener connector (story 3.21)", () => {
     });
     const runId = await newRun();
     const result = await runConnector(testEnv.DB, runId, SOURCE, check());
-    expect(result).toEqual({ draftCount: 2, failed: false });
+    expect(result).toEqual({ draftCount: 1, failed: false });
 
     for (const call of calls) {
       const headers = new Headers(call.init?.headers);
@@ -730,7 +759,7 @@ describe("CourtListener connector (story 3.21)", () => {
     );
     const runId = await newRun();
     const result = await runConnector(testEnv.DB, runId, SOURCE, check());
-    expect(result).toEqual({ draftCount: 2, failed: false });
+    expect(result).toEqual({ draftCount: 1, failed: false });
 
     const drafts = await draftsRepo.listByRun(testEnv.DB, runId);
     const pi = drafts.find(
@@ -763,9 +792,9 @@ describe("CourtListener connector (story 3.21)", () => {
     expect(pi?.body).toContain(ENTRIES[0]!.description);
     expect(
       drafts.some((d) => d.targetEntityId === `de-${FURCOLO_CASE}-500`)
-    ).toBe(true);
-    // Undated / text-less rows never become records; the pre-tracking
-    // complaint is history the tracker never claimed to follow.
+    ).toBe(false);
+    // Undated / text-less rows never become records. Entries filed before
+    // the effective cutoff are counted as skippedOlder, not drafted.
     expect(
       drafts.some((d) =>
         ["499", "498", "400"].some(
@@ -783,15 +812,17 @@ describe("CourtListener connector (story 3.21)", () => {
       entries: 5,
       pages: 1,
       truncated: false,
-      newEntries: 2,
-      seen: 1,
-      skippedIncomplete: 2
+      newEntries: 1,
+      seen: 0,
+      skippedIncomplete: 2,
+      effectiveCutoff: "2026-09-11",
+      skippedOlder: 2
     });
     expect(
       (await evidenceRepo.listByRun(testEnv.DB, runId)).filter(
         (e) => e.event === "draft.created"
       )
-    ).toHaveLength(2);
+    ).toHaveLength(1);
   });
 
   it("uses the latest published development as the baseline and skips entries already Drafted (any outcome)", async () => {
@@ -843,6 +874,10 @@ describe("CourtListener connector (story 3.21)", () => {
       newEntries: 0,
       seen: 2
     });
+    expect(docketSummary(payload, FURCOLO)).not.toHaveProperty(
+      "effectiveCutoff"
+    );
+    expect(docketSummary(payload, FURCOLO)).not.toHaveProperty("skippedOlder");
     const furcolo = calls.find(
       ({ url }) => new URL(url).searchParams.get("docket") === FURCOLO
     );
@@ -1115,6 +1150,121 @@ describe("CourtListener connector (story 3.21)", () => {
       ).run();
     }
   });
+
+  it("keeps a 2026-10-11 run to the three 2026-10-05 filings from run 0003", async () => {
+    const runAt = "2026-10-11T15:00:00.000Z";
+    const filings = [
+      ["2026-10-05", 3],
+      ["2026-10-02", 3],
+      ["2026-10-01", 1],
+      ["2026-09-28", 2],
+      ["2026-09-25", 1]
+    ] as const;
+    let id = 91_000;
+    const results = filings.flatMap(([date, count]) =>
+      Array.from({ length: count }, () => {
+        id += 1;
+        return {
+          id,
+          entry_number: id,
+          date_filed: date,
+          description: `Entry filed ${date}.`
+        };
+      })
+    );
+    const calls = stubFetch((docketId) =>
+      docketId === ILLINOIS
+        ? { status: 200, body: { results } }
+        : { status: 200, body: { results: [] } }
+    );
+    const runId = await newRun();
+    const result = await runConnector(
+      testEnv.DB,
+      runId,
+      SOURCE,
+      check(TOKEN, { now: () => runAt })
+    );
+    expect(result).toEqual({ draftCount: 3, failed: false });
+    const dates = (await draftsRepo.listByRun(testEnv.DB, runId)).map(
+      (draft) => (draft.diff as { occurredAt?: string }).occurredAt
+    );
+    expect(dates.filter((date) => date === "2026-10-05")).toHaveLength(3);
+    expect(
+      dates.filter((date) => date != null && date <= "2026-10-02")
+    ).toEqual([]);
+    const illinois = calls.find(
+      ({ url }) => new URL(url).searchParams.get("docket") === ILLINOIS
+    );
+    expect(new URL(illinois!.url).searchParams.get("date_filed__gte")).toBe(
+      "2026-10-04"
+    );
+    expect(docketSummary(await fetchedPayload(runId), ILLINOIS)).toMatchObject({
+      baseline: { kind: "source_published_at", date: "2026-04-02" },
+      effectiveCutoff: "2026-10-04",
+      skippedOlder: 7,
+      newEntries: 3
+    });
+  });
+
+  it("keeps a recent published_at when it is later than the window start", async () => {
+    await testEnv.DB.prepare(
+      "UPDATE sources SET published_at = ? WHERE id = 'src-case-il-docket'"
+    )
+      .bind("2026-09-16")
+      .run();
+    try {
+      const calls = stubFetch((docketId) =>
+        docketId === ILLINOIS
+          ? {
+              status: 200,
+              body: {
+                results: [
+                  {
+                    id: 92001,
+                    entry_number: 1,
+                    date_filed: "2026-09-15",
+                    description: "Day before the published date."
+                  },
+                  {
+                    id: 92002,
+                    entry_number: 2,
+                    date_filed: "2026-09-16",
+                    description: "Filed on the published date."
+                  }
+                ]
+              }
+            }
+          : { status: 200, body: { results: [] } }
+      );
+      const runId = await newRun();
+      const result = await runConnector(testEnv.DB, runId, SOURCE, check());
+      expect(result).toEqual({ draftCount: 1, failed: false });
+      const illinois = calls.find(
+        ({ url }) => new URL(url).searchParams.get("docket") === ILLINOIS
+      );
+      expect(new URL(illinois!.url).searchParams.get("date_filed__gte")).toBe(
+        "2026-09-16"
+      );
+      const dates = (await draftsRepo.listByRun(testEnv.DB, runId)).map(
+        (draft) => (draft.diff as { occurredAt?: string }).occurredAt
+      );
+      expect(dates).toContain("2026-09-16");
+      expect(dates).not.toContain("2026-09-15");
+      expect(
+        docketSummary(await fetchedPayload(runId), ILLINOIS)
+      ).toMatchObject({
+        baseline: { kind: "source_published_at", date: "2026-09-16" },
+        effectiveCutoff: "2026-09-16",
+        skippedOlder: 1
+      });
+    } finally {
+      await testEnv.DB.prepare(
+        "UPDATE sources SET published_at = ? WHERE id = 'src-case-il-docket'"
+      )
+        .bind("2026-04-02")
+        .run();
+    }
+  });
 });
 
 // Story 3.27: exercise the real connector, timeout wrapper, and D1 Evidence
@@ -1212,9 +1362,9 @@ describe("CourtListener credential boundary (story 3.27)", () => {
     ).toHaveLength(1);
     const cutoff = new Map([
       [FURCOLO, "2026-09-12"],
-      [ILLINOIS, "2026-04-02"],
-      ["73242633", "2026-04-24"],
-      ["72237443", "2025-11-28"]
+      [ILLINOIS, "2026-09-11"],
+      ["73242633", "2026-09-11"],
+      ["72237443", "2026-09-11"]
     ]);
     expect(
       calls.every(({ url }) => {
diff --git a/src/pipeline/connectors/courtListener.ts b/src/pipeline/connectors/courtListener.ts
index 70f76f0..193d2da 100644
--- a/src/pipeline/connectors/courtListener.ts
+++ b/src/pipeline/connectors/courtListener.ts
@@ -6,6 +6,7 @@ import {
   isAbortError,
   isTimeoutError
 } from "../../shared/lib/timeouts";
+import { etCalendarDate } from "../../shared/lib/schedule";
 import { IsoDateSchema } from "../../shared/schemas/common";
 import {
   SourceUnavailableError,
@@ -77,7 +78,8 @@ export function entriesUrl(
     order_by: "-date_filed",
     fields: COURTLISTENER_FIELDS
   });
-  // Same inclusive baseline `fetchEntries` already stops on. Never shift it.
+  // Inclusive floor. On a first fetch this is the effective cutoff, which
+  // may be later than `sources.published_at`.
   if (
     filedOnOrAfter != null &&
     IsoDateSchema.safeParse(filedOnOrAfter).success
@@ -205,6 +207,33 @@ export const COURTLISTENER_WAIT_BUDGET_MS = 6 * 60 * 1000;
  * Workflow step timeout and above the generic 60-second connector deadline.
  */
 export const COURTLISTENER_POLL_TIMEOUT_MS = 8 * 60 * 1000;
+/** Calendar days before the ET run date on a first fetch with no stored events. */
+export const DEFAULT_FIRST_FETCH_WINDOW_DAYS = 7;
+
+/**
+ * `FIRST_FETCH_WINDOW_DAYS` when it is a positive integer. Unset uses the
+ * default and does not log. Any other set value logs once and uses the default.
+ */
+export function firstFetchWindowDays(raw: string | undefined): number {
+  if (raw == null) return DEFAULT_FIRST_FETCH_WINDOW_DAYS;
+  const trimmed = raw.trim();
+  if (!/^[1-9]\d*$/.test(trimmed) || !Number.isSafeInteger(Number(trimmed))) {
+    console.warn({
+      event: "first_fetch_window_invalid",
+      fallback: DEFAULT_FIRST_FETCH_WINDOW_DAYS
+    });
+    return DEFAULT_FIRST_FETCH_WINDOW_DAYS;
+  }
+  return Number(trimmed);
+}
+
+/** Subtract calendar days from `YYYY-MM-DD`. UTC date arithmetic, not 24h*N. */
+function calendarDaysBefore(isoDate: string, days: number): string {
+  const [year, month, day] = isoDate.split("-").map(Number);
+  const date = new Date(Date.UTC(year!, month! - 1, day!));
+  date.setUTCDate(date.getUTCDate() - days);
+  return date.toISOString().slice(0, 10);
+}
 
 export type CourtListenerWait = (
   ms: number,
@@ -224,6 +253,11 @@ export interface CourtListenerCheckDeps {
   wait?: CourtListenerWait;
   /** Defaults to `COURTLISTENER_WAIT_BUDGET_MS`. */
   waitBudgetMs?: number;
+  /**
+   * First-fetch window in calendar days. `sourceChecksFromEnv` passes the
+   * parsed `FIRST_FETCH_WINDOW_DAYS`. Omission uses the default of 7.
+   */
+  firstFetchWindowDays?: number;
 }
 
 /**
@@ -689,20 +723,33 @@ async function pollDocket(
     ])
   );
   // Baseline floor: the latest published development, or — before any
-  // exists — the day the docket source was recorded, so the first live Run
-  // never backfills history the tracker never claimed to follow.
+  // exists — the day the docket source was recorded. A first fetch also
+  // stops at the later of that date and the window before the ET run date,
+  // so the tracker does not backfill months of history.
   const baseline: Baseline =
     latest != null
       ? { kind: "docket_events", date: latest }
       : trackedSince != null
         ? { kind: "source_published_at", date: trackedSince }
         : null;
+  const windowDays =
+    deps.firstFetchWindowDays ?? DEFAULT_FIRST_FETCH_WINDOW_DAYS;
+  let fetchOnOrAfter = baseline?.date ?? null;
+  let effectiveCutoff: string | undefined;
+  if (baseline?.kind === "source_published_at") {
+    const runDate = etCalendarDate(
+      new Date(deps.now?.() ?? new Date().toISOString())
+    );
+    const windowStart = calendarDaysBefore(runDate, windowDays);
+    effectiveCutoff = baseline.date > windowStart ? baseline.date : windowStart;
+    fetchOnOrAfter = effectiveCutoff;
+  }
 
   const fetched = await fetchEntries(
     fetchImpl,
     token,
     docketId,
-    baseline?.date ?? null,
+    fetchOnOrAfter,
     pace,
     noteStart,
     nowMs,
@@ -714,6 +761,7 @@ async function pollDocket(
   let latestEntryDate: string | null = null;
   let seenCount = 0;
   let undated = 0;
+  let skippedOlder = 0;
   for (const entry of fetched.entries) {
     const dated = IsoDateSchema.safeParse(entry.dateFiled);
     if (!dated.success || entry.description.length === 0) {
@@ -723,6 +771,10 @@ async function pollDocket(
     if (latestEntryDate == null || dated.data > latestEntryDate) {
       latestEntryDate = dated.data;
     }
+    if (effectiveCutoff != null && dated.data < effectiveCutoff) {
+      skippedOlder += 1;
+      continue;
+    }
     const id = docketEventId(row.case_id, entry.id);
     if (seen.has(id) || (baseline != null && dated.data < baseline.date)) {
       seenCount += 1;
@@ -766,6 +818,7 @@ async function pollDocket(
       newEntries: entities.length,
       seen: seenCount,
       skippedIncomplete: undated,
+      ...(effectiveCutoff == null ? {} : { effectiveCutoff, skippedOlder }),
       ...(fetched.timeouts.length > 0 ? { timeouts: fetched.timeouts } : {})
     }
   };
diff --git a/src/pipeline/workflow/dailyRun.test.ts b/src/pipeline/workflow/dailyRun.test.ts
index ce867ca..b1fafa0 100644
--- a/src/pipeline/workflow/dailyRun.test.ts
+++ b/src/pipeline/workflow/dailyRun.test.ts
@@ -727,7 +727,11 @@ describe("sourceChecksFromEnv (story 3.21)", () => {
         now: () => NOW
       },
       sourceChecksFromEnv(
-        { COURTLISTENER_API_TOKEN: "tok", courtListenerWait: async () => {} },
+        {
+          COURTLISTENER_API_TOKEN: "tok",
+          courtListenerWait: async () => {},
+          now: () => "2026-09-20T16:00:00.000Z"
+        },
         testEnv.DB
       )
     );
diff --git a/src/pipeline/workflow/dailyRun.ts b/src/pipeline/workflow/dailyRun.ts
index 84963c1..e2c6bd7 100644
--- a/src/pipeline/workflow/dailyRun.ts
+++ b/src/pipeline/workflow/dailyRun.ts
@@ -13,6 +13,7 @@ import { type SourceCheck } from "../connectors/connector";
 import {
   COURTLISTENER_SOURCE_NAME,
   createCourtListenerCheck,
+  firstFetchWindowDays,
   type CourtListenerWait
 } from "../connectors/courtListener";
 import { llmProvidersFromEnv, type GatewayDeps } from "../ai/gateway";
@@ -92,9 +93,11 @@ export function gatewayDepsFromEnv(
  * optional on `Env`; absent → `source.skipped { reason: "unconfigured" }`.
  */
 export function sourceChecksFromEnv(
-  env: Pick<Env, "COURTLISTENER_API_TOKEN"> & {
+  env: Pick<Env, "COURTLISTENER_API_TOKEN" | "FIRST_FETCH_WINDOW_DAYS"> & {
     /** Tests inject an instant wait. Production leaves this unset. */
     courtListenerWait?: CourtListenerWait;
+    /** Tests pin the ET run date. Production uses the wall clock. */
+    now?: () => string;
   },
   db: Db
 ): Record<string, SourceCheck> {
@@ -102,7 +105,9 @@ export function sourceChecksFromEnv(
     [COURTLISTENER_SOURCE_NAME]: createCourtListenerCheck({
       db,
       token: env.COURTLISTENER_API_TOKEN,
-      ...(env.courtListenerWait ? { wait: env.courtListenerWait } : {})
+      firstFetchWindowDays: firstFetchWindowDays(env.FIRST_FETCH_WINDOW_DAYS),
+      ...(env.courtListenerWait ? { wait: env.courtListenerWait } : {}),
+      ...(env.now ? { now: env.now } : {})
     })
   };
 }
diff --git a/src/pipeline/workflow/dailyRunRecovery.test.ts b/src/pipeline/workflow/dailyRunRecovery.test.ts
index 53a6286..542b117 100644
--- a/src/pipeline/workflow/dailyRunRecovery.test.ts
+++ b/src/pipeline/workflow/dailyRunRecovery.test.ts
@@ -168,7 +168,8 @@ function harness(
       ...env,
       DB: database,
       COURTLISTENER_API_TOKEN: "local-test-token",
-      courtListenerWait: async () => {}
+      courtListenerWait: async () => {},
+      now: () => "2026-10-08T16:00:00.000Z"
     }
   });
   const checkpoints = new Checkpoints();
diff --git a/src/server.test.ts b/src/server.test.ts
index 8843b81..3cf5c73 100644
--- a/src/server.test.ts
+++ b/src/server.test.ts
@@ -551,7 +551,7 @@ describe("steering cost policy refusal", () => {
     expect(response.status).toBe(503);
     expect(await response.json()).toMatchObject({
       code: "cost_policy_invalid",
-      message: expect.stringContaining("cost policy")
+      message: "cost_policy_invalid: policy_lookup"
     });
     expect(run).not.toHaveBeenCalled();
   });

Do not invoke any skill, and do not spawn subagents of your own — you are the reviewer. Return your findings as text in your final message; do not route them through any findings-reporting tool the host may offer.
