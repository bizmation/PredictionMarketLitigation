Conduct a review of CONTENT.
Look for what's missing, not only what's wrong.
Compute your finding floor N from the diff file's size: N = min(floor(sqrt(kB) + 1), 10), where kB is the file's size in kilobytes. State the arithmetic in one line, then find at least N issues to fix or improve.
Output a Markdown list of findings only — no severity, priority, or ranking.
If the content is empty, stop and say so.
If you have zero findings, re-check and keep thinking; do not stop with an empty list.

CONTENT: the unified diff follows inline. Read it — it is the content under review.

===== BEGIN unified diff =====
diff --git a/_bmad-output/implementation-artifacts/deferred-work.md b/_bmad-output/implementation-artifacts/deferred-work.md
index 42f5961..615f706 100644
--- a/_bmad-output/implementation-artifacts/deferred-work.md
+++ b/_bmad-output/implementation-artifacts/deferred-work.md
@@ -241,3 +241,5 @@ Ledger entries above are not edited; this block records where each Epic 3 entry
 ## Pointer for Story 3.37 Create Story (2026-10-10)
 
 - Story 3.37 has no story file yet. Patrick's 2026-10-10 ruling for 3.37 is recorded in `spec-3-36-verify-the-corrected-staging-run-and-gateway.md` under "Scope rulings (2026-10-10)": the revised `run-20261010-0003` draft may close 3.37 on the same Run as 3.36. Approval still needs his named go-ahead on that specific draft after he reads the text. Known gap: once that draft is approved, #64 batch reject refuses the Run (`reject_run_unpublished`); closing 0003 needs a separate follow-up that rejects the remaining undecided heads.
+
+- **Revise failure surfaces as 400 and strands a NULL-eval child (from 0003 entry 170, Oct 10).** `submitTurn` maps `reviseDraft` status `invalid` to HTTP 400 "Revision did not complete" after the turn receipt and child draft are already persisted. The retry then gets 409 from `hasInFlightSuccessor`. Fix: return a 5xx/502-class error for gateway or provider failures, have the UI refresh the draft chain after any revise error, and decide whether a failed revise child should be marked terminal so the parent can be revised again. Doesn't block 3.36.
diff --git a/_bmad-output/implementation-artifacts/spec-deepinfra-fetch-redirect-manual.md b/_bmad-output/implementation-artifacts/spec-deepinfra-fetch-redirect-manual.md
new file mode 100644
index 0000000..97e975a
--- /dev/null
+++ b/_bmad-output/implementation-artifacts/spec-deepinfra-fetch-redirect-manual.md
@@ -0,0 +1,85 @@
+---
+title: 'Use a Workers-legal redirect mode on DeepInfra fetches'
+type: 'bugfix'
+created: '2026-10-10'
+status: 'in-review'
+route: 'dispatch'
+baseline_commit: 'f002b1edd61a5387e89e5899ecb43f61e8277ea8'
+review_loop_iteration: 0
+context:
+  - '{project-root}/_bmad-output/implementation-artifacts/spec-deepinfra-preflight-diagnostics-and-first-fetch-window.md'
+---
+
+<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">
+
+## Intent
+
+**Problem:** On staging `pml-build` (worker `2d5baca`), revising run-20261010-0003 throws `cost_policy_invalid` before reservation. `wrangler tail` shows `deepinfra_preflight` / `TypeError`: `Invalid redirect value, must be one of "follow" or "manual" ("error" won't be implemented since it does not make sense at the edge; use "manual" and check the response status code)`. Workerd rejects `redirect: "error"` before send. Node accepts it, so tests stay green. No `llm_operations` row and $0 spent.
+
+**Approach:** Use `redirect: "manual"` on both DeepInfra fetches. Keep 3xx and opaque-redirect (`status` 0) on the existing fail-closed paths. Pin that with a Workers-shaped stub, a static `src/` check, and redirect tests. Set `env.build.vars.FIRST_FETCH_WINDOW_DAYS` to the string `"3"`. Append the deferred revise note below; do not fix it.
+
+## Boundaries & Constraints
+
+**Always:** Catalog GET (`createDeepInfraProvider` preflight, ~1047) and chat POST (`prepare`, ~1140) use `"manual"`. Catalog `Accept`, `User-Agent`, `signal`, deadline, and diagnostics stay (status, `bodyPrefix`, `field`, `errorName`, `errorMessage`, one `console.warn`). A catalog status 300–399, status 0, or `type === "opaqueredirect"` uses the existing non-OK throw: `cost_policy_invalid: deepinfra_preflight (http <status>)`. Preflight is before `accounting.reserve` (`complete()` ~408, then ~429), so nothing is reserved. A chat response in that set uses `if (!response.ok) throw new Error()` (~1152). The catch (~1176) throws `provider_error` / `DeepInfra gateway request failed.` That is not `ProvenPreDispatchRefusal`, so ~508–523 calls `markUncertain(..., "provider_outcome_unknown")` and does not release or `settle`. The row stays `state='uncertain'` with that issue and the 16-cent admission bound. `accountingForRun` is `totalCents: 16`, `issueCount: 1`. A repeat is `accounting_uncertain`. `env.build.vars` is exactly `{ "FIRST_FETCH_WINDOW_DAYS": "3" }` (string). Top-level, other envs, and `wrangler.test.jsonc` have no `vars`. Append this bullet verbatim and change nothing else in `deferred-work.md`:
+
+- **Revise failure surfaces as 400 and strands a NULL-eval child (from 0003 entry 170, Oct 10).** `submitTurn` maps `reviseDraft` status `invalid` to HTTP 400 "Revision did not complete" after the turn receipt and child draft are already persisted. The retry then gets 409 from `hasInFlightSuccessor`. Fix: return a 5xx/502-class error for gateway or provider failures, have the UI refresh the draft chain after any revise error, and decide whether a failed revise child should be marked terminal so the parent can be revised again. Doesn't block 3.36.
+
+**Never:** No deploy, tail, or Run. No `bmad-code-review`. Do not set `redirect` on OpenRouter (~806). Do not edit `courtListener.ts` (already `"manual"` at 557). Do not change `costPolicy.ts`, `reserve`, `settle`, or `markUncertain`. Do not follow redirects or read `Location`. Do not send the DeepInfra key on the catalog request. Do not set the window on production or the test config. Do not edit other PRs' reject or batch files. Do not fix the revise bug.
+
+## I/O & Edge-Case Matrix
+
+| Scenario | Input / State | Expected Output / Behavior | Error Handling |
+|---|---|---|---|
+| Catalog redirect | 302, or status 0 / `opaqueredirect` | No reserve, no chat POST | `cost_policy_invalid: deepinfra_preflight (http <status>)`; log has `status` |
+| Chat redirect | Catalog ok; POST 302 or status 0 / `opaqueredirect` | `uncertain`, issue `provider_outcome_unknown`, liability 16; not settled or released | `provider_error`, `DeepInfra gateway request failed.` |
+| Illegal mode | Either DeepInfra fetch gets `redirect: "error"` | Stub throws the tail `TypeError` before a response | Catalog: `cost_policy_invalid`, `errorName` `TypeError`, no status. Chat: `provider_error`, then uncertain |
+| Staging window | `env.build` only | `FIRST_FETCH_WINDOW_DAYS` is `"3"` and the only var | No other `vars` object |
+| Existing non-OK | Catalog 403; chat 503 | Unchanged diagnostics and liability | Unchanged |
+
+</frozen-after-approval>
+
+## Code Map
+
+- `src/pipeline/ai/gateway.ts` — Catalog fetch ~1043 (`redirect` 1047, non-OK 1054–1066). Chat fetch ~1138 (`redirect` 1140, `!response.ok` 1152, `provider_error` 1176–1180). `preflight` ~408 is before `reserve` ~429. ~508–523: `ProvenPreDispatchRefusal` releases; any other failure `markUncertain`. OpenRouter fetch ~806 sets no `redirect`.
+- `src/pipeline/ai/deepinfra.test.ts` — `http()` ~99 and assertions at 110, 251, and 926 expect `"error"`. Non-2xx liability is ~902. `courtListener.ts:557` is already `"manual"`; do not edit. `markUncertain` (~200 in `llmAccountingRepo.ts`) is unchanged.
+- `wrangler.jsonc` `env.build` ~204 — no `vars` yet. `wranglerConfig.test.tsx` ~40 bans every `"vars"`; narrow it. `access-env.d.ts` ~60 says there is no vars block; correct the comment. `firstFetchWindowDays` already accepts `"3"`.
+- `vitest.config.ts` — `*.test.ts` is workerd (no fs). Static scan is `src/pipeline/ai/fetchRedirect.test.tsx` in the Node `ui` project. Append `deferred-work.md` only.
+
+## Tasks & Acceptance
+
+**Execution:**
+- [x] `src/pipeline/ai/gateway.ts` -- Both DeepInfra redirects become `"manual"`. 3xx, status 0, and `opaqueredirect` stay on the existing non-OK branches.
+- [x] `src/pipeline/ai/deepinfra.test.ts` -- Shared stub throws the tail `TypeError` when `redirect` is `"error"`, on the catalog URL and the chat POST. Expect `"manual"` at 110, 251, and 926. Add 302 and status-0 / `opaqueredirect` cases for both fetches.
+- [x] `src/pipeline/ai/fetchRedirect.test.tsx` -- Fail if any non-test file under `src/` sets `redirect` to `"error"` or `'error'`.
+- [x] `wrangler.jsonc` -- `env.build.vars` is `{ "FIRST_FETCH_WINDOW_DAYS": "3" }` only.
+- [x] `src/shared/lib/wranglerConfig.test.tsx` -- Allow only that build var. `wrangler.test.jsonc` stays var-free.
+- [x] `src/access-env.d.ts` -- Comment: build sets `"3"`; other environments omit it.
+- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- Append the Boundaries bullet verbatim.
+
+**Acceptance Criteria:**
+- Given non-test files under `src/`, when the static check runs, then none set `redirect` to `"error"`.
+- Given `deferred-work.md`, when this change is read, then the revise bullet is present verbatim and revise behavior is unchanged.
+
+## Implementation Notes
+
+- `npm run check` exit 0. `npm test` exit 0 (1544 passed, 6 skipped).
+- Request docs still list redirect mode `error`. The staging tail is the runtime: workerd throws before send. Both DeepInfra fetches use `manual`. `deepInfraRedirectRefused` keeps 3xx, status 0, and `opaqueredirect` on the existing non-OK branches. A chat failure still `markUncertain`s with `provider_outcome_unknown` and does not release or settle.
+- Status 0 is not valid `ResponseInit`. Those tests use a response-shaped object. The shared `http()` stub throws the tail `TypeError` when `redirect` is `"error"`, so a regression fails the existing success paths as well as the direct stub test.
+- Spec size is about 1900 tokens by characters/4 and about 1340 by words×1.3. The window string and the verbatim deferred note stay in this change because that was the requested scope.
+
+## Spec Change Log
+
+## Review Triage Log
+
+## Design Notes
+
+Request docs retrieved 2026-10-10 (`search_cloudflare_documentation`, `https://developers.cloudflare.com/workers/runtime-apis/request/`) still list `follow`, `error`, and `manual`, and say `manual` returns the 3xx as-is. The tail shows workerd rejects `"error"` before send. Follow the runtime and fail closed on that 3xx. No new error code. Status 0 is not valid `ResponseInit` (200–599); those tests use a response-shaped object, like the unreadable-body catalog test. Wrangler vars are strings. The diagnostics spec forbade a vars block; this request overrides that for `env.build` only. Do not deploy.
+
+## Verification
+
+**Commands:**
+- `npm run check` -- expected: exit 0
+- `npm test` -- expected: exit 0
+
+**Manual checks (if no CLI):**
+- Do not deploy. `git diff` must not touch reject or batch files, OpenRouter, or `courtListener.ts`.
diff --git a/src/access-env.d.ts b/src/access-env.d.ts
index 3f99d33..3bb74cf 100644
--- a/src/access-env.d.ts
+++ b/src/access-env.d.ts
@@ -61,8 +61,9 @@ interface Env {
    * First CourtListener fetch window, in calendar days. Optional Worker var.
    * Unset uses 7. An integer from 1 through 30 is used, including a leading
    * zero. A JSON number from a wrangler var is that integer. Any other set
-   * value falls back to 7 and the log includes it. Not a secret. This repo
-   * has no `vars` block, so the default lives in code until one is set.
+   * value falls back to 7 and the log includes it. Not a secret.
+   * `env.build.vars.FIRST_FETCH_WINDOW_DAYS` is the string "3". Other
+   * environments omit it and use 7.
    */
   FIRST_FETCH_WINDOW_DAYS?: string | number;
 }
diff --git a/src/pipeline/ai/deepinfra.test.ts b/src/pipeline/ai/deepinfra.test.ts
index a367144..9dc41c0 100644
--- a/src/pipeline/ai/deepinfra.test.ts
+++ b/src/pipeline/ai/deepinfra.test.ts
@@ -14,6 +14,8 @@ import { PROVIDER_TIMEOUT_MS } from "../../shared/lib/timeouts";
 const db = (env as Env).DB;
 const NOW = "2026-10-04T19:12:00.000Z";
 const MODEL = "zai-org/GLM-5.3-Flash";
+const WORKERS_REDIRECT_ERROR =
+  'Invalid redirect value, must be one of "follow" or "manual" ("error" won\'t be implemented since it does not make sense at the edge; use "manual" and check the response status code)';
 const policy = resolveCostPolicy("deepinfra", MODEL, NOW);
 const configured = {
   ...env,
@@ -101,13 +103,16 @@ function http(body: unknown = responseBody(), metadata: unknown = catalog()) {
     Response.json(body)
   );
   const fetcher = vi.fn(async (url: unknown, init?: RequestInit) => {
+    if (init?.redirect === "error") {
+      throw new TypeError(WORKERS_REDIRECT_ERROR);
+    }
     if (url === "https://api.deepinfra.com/models/list") {
       const headers = new Headers(init?.headers);
       expect([...headers.keys()].sort()).toEqual(["accept", "user-agent"]);
       expect(headers.get("accept")).toBe("application/json");
       expect(headers.get("user-agent")).toBe(DEEPINFRA_CATALOG_USER_AGENT);
       expect(headers.get("authorization")).toBeNull();
-      expect(init?.redirect).toBe("error");
+      expect(init?.redirect).toBe("manual");
       expect(init?.signal).toBeInstanceOf(AbortSignal);
       return Response.json(metadata);
     }
@@ -248,7 +253,7 @@ describe("DeepInfra central gateway", () => {
       );
       expect(init).toMatchObject({
         method: "POST",
-        redirect: "error"
+        redirect: "manual"
       });
       expect(init!.headers).toBeInstanceOf(Headers);
       const headers = new Headers(init!.headers);
@@ -422,6 +427,104 @@ describe("DeepInfra central gateway", () => {
       warn.mockRestore();
     }
   });
+  it("rejects redirect error before a catalog or chat response", async () => {
+    const { fetcher } = http();
+    for (const url of [
+      "https://api.deepinfra.com/models/list",
+      "https://gateway.ai.cloudflare.com/v1/account/default/custom-deepinfra/v1/openai/chat/completions"
+    ]) {
+      await expect(fetcher(url, { redirect: "error" })).rejects.toThrow(
+        new TypeError(WORKERS_REDIRECT_ERROR)
+      );
+    }
+    expect(fetcher).toHaveBeenCalledTimes(2);
+  });
+  it.each([
+    ["302", 302, () => new Response("moved", { status: 302 })],
+    [
+      "opaque redirect",
+      0,
+      (): Response =>
+        ({
+          ok: true,
+          status: 0,
+          type: "opaqueredirect",
+          json: async () => catalog(),
+          text: async (): Promise<string> => ""
+        }) as Response
+    ]
+  ] as const)(
+    "rejects a catalog %s before reservation",
+    async (_label, status, respond) => {
+      const input = await setup();
+      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
+      const inference = vi.fn();
+      try {
+        vi.stubGlobal(
+          "fetch",
+          vi.fn(async (url: unknown, init?: RequestInit) => {
+            expect(init?.redirect).toBe("manual");
+            if (url === "https://api.deepinfra.com/models/list")
+              return respond();
+            return inference(url, init);
+          })
+        );
+        await expect(complete(deps(), input)).rejects.toMatchObject({
+          code: "cost_policy_invalid",
+          message: `cost_policy_invalid: deepinfra_preflight (http ${status})`,
+          detail: expect.objectContaining({
+            stage: "deepinfra_preflight",
+            status
+          })
+        });
+        expect(inference).not.toHaveBeenCalled();
+        expect(warn).toHaveBeenCalledWith(
+          expect.objectContaining({
+            event: "cost_policy_invalid",
+            stage: "deepinfra_preflight",
+            status
+          })
+        );
+        await expectFree(input.runId);
+      } finally {
+        warn.mockRestore();
+      }
+    }
+  );
+  it("records a Workers redirect TypeError from the catalog with no status", async () => {
+    const input = await setup();
+    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
+    try {
+      vi.stubGlobal(
+        "fetch",
+        vi.fn(async () => {
+          throw new TypeError(WORKERS_REDIRECT_ERROR);
+        })
+      );
+      await expect(complete(deps(), input)).rejects.toMatchObject({
+        code: "cost_policy_invalid",
+        message: "cost_policy_invalid: deepinfra_preflight",
+        detail: expect.objectContaining({
+          stage: "deepinfra_preflight",
+          errorName: "TypeError",
+          errorMessage: WORKERS_REDIRECT_ERROR
+        })
+      });
+      expect(warn).toHaveBeenCalledWith(
+        expect.not.objectContaining({ status: expect.anything() })
+      );
+      expect(warn).toHaveBeenCalledWith(
+        expect.objectContaining({
+          event: "cost_policy_invalid",
+          stage: "deepinfra_preflight",
+          errorName: "TypeError"
+        })
+      );
+      await expectFree(input.runId);
+    } finally {
+      warn.mockRestore();
+    }
+  });
   it("keeps the catalog HTTP status when the error body cannot be read", async () => {
     vi.stubGlobal(
       "fetch",
@@ -923,9 +1026,103 @@ describe("DeepInfra pre-dispatch validation and HTTP failures", () => {
         code: "accounting_uncertain"
       });
       expect(inference).toHaveBeenCalledTimes(1);
-      expect(inference.mock.calls[0]![1]!.redirect).toBe("error");
+      expect(inference.mock.calls[0]![1]!.redirect).toBe("manual");
     }
   );
+  it.each([
+    [
+      "302",
+      (): Response =>
+        ({
+          ok: false,
+          status: 302,
+          type: "default",
+          json: async () => responseBody()
+        }) as Response
+    ],
+    [
+      "opaque redirect",
+      (): Response =>
+        ({
+          ok: true,
+          status: 0,
+          type: "opaqueredirect",
+          json: async () => responseBody()
+        }) as Response
+    ]
+  ] as const)(
+    "keeps an uncertain reservation when the chat fetch is a %s",
+    async (_label, respond) => {
+      const input = await setup();
+      const { inference } = http();
+      let read = false;
+      inference.mockImplementation(async () => {
+        const response = respond();
+        const json = response.json.bind(response);
+        return {
+          ...response,
+          json: async () => {
+            read = true;
+            return json();
+          }
+        } as Response;
+      });
+      await expect(complete(deps(), input)).rejects.toMatchObject({
+        code: "provider_error",
+        message: "DeepInfra gateway request failed."
+      });
+      expect(read).toBe(false);
+      expect(await accountingForRun(db, input.runId)).toMatchObject({
+        totalCents: 16,
+        issueCount: 1
+      });
+      expect(
+        await db
+          .prepare(
+            "SELECT state, issue, liability_cents FROM llm_operations WHERE run_id=?"
+          )
+          .bind(input.runId)
+          .first()
+      ).toEqual({
+        state: "uncertain",
+        issue: "provider_outcome_unknown",
+        liability_cents: 16
+      });
+      expect(
+        await db
+          .prepare("SELECT id FROM llm_calls WHERE run_id=?")
+          .bind(input.runId)
+          .first()
+      ).toBeNull();
+    }
+  );
+  it("keeps an uncertain reservation when the chat fetch throws the Workers redirect TypeError", async () => {
+    const input = await setup();
+    const { inference } = http();
+    inference.mockImplementation(async () => {
+      throw new TypeError(WORKERS_REDIRECT_ERROR);
+    });
+    await expect(complete(deps(), input)).rejects.toMatchObject({
+      code: "provider_error",
+      message: "DeepInfra gateway request failed."
+    });
+    expect(await accountingForRun(db, input.runId)).toMatchObject({
+      totalCents: 16,
+      issueCount: 1
+    });
+    expect(
+      await db
+        .prepare(
+          "SELECT state, issue, liability_cents FROM llm_operations WHERE run_id=?"
+        )
+        .bind(input.runId)
+        .first()
+    ).toEqual({
+      state: "uncertain",
+      issue: "provider_outcome_unknown",
+      liability_cents: 16
+    });
+  });
   it("releases real D1 liability when policy expires after claim and before inference", async () => {
     const input = await setup();
     const { inference } = http();
diff --git a/src/pipeline/ai/fetchRedirect.test.tsx b/src/pipeline/ai/fetchRedirect.test.tsx
new file mode 100644
index 0000000..8f7a8b0
--- /dev/null
+++ b/src/pipeline/ai/fetchRedirect.test.tsx
@@ -0,0 +1,23 @@
+import { readdirSync, readFileSync } from "node:fs";
+import { describe, expect, it } from "vitest";
+
+function walk(dir: string): string[] {
+  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
+    const full = `${dir}/${entry.name}`;
+    return entry.isDirectory() ? walk(full) : [full];
+  });
+}
+
+describe("Workers fetch redirect mode", () => {
+  it("fails if any non-test fetch in src sets redirect to error", () => {
+    const offenders = walk("src").filter((file) => {
+      if (/\.test\.tsx?$/.test(file)) return false;
+      try {
+        return /redirect\s*:\s*["']error["']/.test(readFileSync(file, "utf8"));
+      } catch {
+        return false;
+      }
+    });
+    expect(offenders).toEqual([]);
+  });
+});
diff --git a/src/pipeline/ai/gateway.ts b/src/pipeline/ai/gateway.ts
index 0176e4e..4d2025b 100644
--- a/src/pipeline/ai/gateway.ts
+++ b/src/pipeline/ai/gateway.ts
@@ -1014,6 +1014,19 @@ function deepInfraCatalogField(
   return null;
 }
 
+/**
+ * Workerd rejects redirect mode "error" before send. "manual" returns a 3xx
+ * as-is, and an opaque redirect is status 0. Both are non-OK.
+ */
+function deepInfraRedirectRefused(response: Response): boolean {
+  return (
+    !response.ok ||
+    response.type === "opaqueredirect" ||
+    response.status === 0 ||
+    (response.status >= 300 && response.status < 400)
+  );
+}
+
 /** Fixed custom provider route. Credentials are captured only in a per-call closure. */
 export function createDeepInfraProvider(env: Env): LlmProvider | null {
   const configured = (value: unknown): boolean =>
@@ -1044,14 +1057,14 @@ export function createDeepInfraProvider(env: Env): LlmProvider | null {
               "https://api.deepinfra.com/models/list",
               {
                 signal,
-                redirect: "error",
+                redirect: "manual",
                 headers: {
                   Accept: "application/json",
                   "User-Agent": DEEPINFRA_CATALOG_USER_AGENT
                 }
               }
             );
-            if (!response.ok) {
+            if (deepInfraRedirectRefused(response)) {
               let bodyPrefix = "";
               try {
                 bodyPrefix = diagnosticText(await response.text());
@@ -1137,7 +1150,7 @@ export function createDeepInfraProvider(env: Env): LlmProvider | null {
           try {
             const response = await fetch(url, {
               method: "POST",
-              redirect: "error",
+              redirect: "manual",
               signal,
               headers,
               body: JSON.stringify({
@@ -1149,7 +1162,7 @@ export function createDeepInfraProvider(env: Env): LlmProvider | null {
                 reasoning_effort: "none"
               })
             });
-            if (!response.ok) throw new Error();
+            if (deepInfraRedirectRefused(response)) throw new Error();
             const body = (await response.json()) as {
               id?: unknown;
               model?: unknown;
diff --git a/src/shared/lib/wranglerConfig.test.tsx b/src/shared/lib/wranglerConfig.test.tsx
index 2ce82ae..5f2a9f5 100644
--- a/src/shared/lib/wranglerConfig.test.tsx
+++ b/src/shared/lib/wranglerConfig.test.tsx
@@ -37,17 +37,29 @@ describe("dev bypass cannot be deployed", () => {
     expect(source).not.toContain("ACCESS_DEV_BYPASS");
   });
 
-  it.each(configs)("%s declares no vars block at all", (file) => {
-    // No code currently reads a Wrangler `vars` value (the single-environment
-    // config has nothing left to distinguish via one). The invariant that
-    // matters: nothing dev-only or secret-shaped can become deployable, and
-    // the simplest version of that is "there is no vars block to smuggle
-    // anything into" — narrow this again, deliberately, the day something
-    // legitimately needs one.
-    const source = readFileSync(file, "utf8");
+  it("wrangler.test.jsonc declares no vars block", () => {
+    const source = readFileSync("wrangler.test.jsonc", "utf8");
     expect(source).not.toMatch(/"vars"\s*:/);
   });
 
+  it("wrangler.jsonc vars are only the staging first-fetch window", () => {
+    // Nothing dev-only or secret-shaped may become deployable. The one
+    // legitimate var is the non-secret staging window, and only on env.build.
+    const parsed = ts.parseConfigFileTextToJson(
+      "wrangler.jsonc",
+      readFileSync("wrangler.jsonc", "utf8")
+    );
+    expect(parsed.error).toBeUndefined();
+    const config = parsed.config;
+    expect(config.vars).toBeUndefined();
+    expect(config.env.build.vars).toEqual({ FIRST_FETCH_WINDOW_DAYS: "3" });
+    expect(typeof config.env.build.vars.FIRST_FETCH_WINDOW_DAYS).toBe("string");
+    for (const [name, env] of Object.entries(config.env)) {
+      if (name === "build") continue;
+      expect((env as { vars?: unknown }).vars).toBeUndefined();
+    }
+  });
+
   it(".dev.vars is gitignored", () => {
     const gitignore = readFileSync(".gitignore", "utf8");
     expect(gitignore).toMatch(/^\.dev\.vars\*?$/m);
diff --git a/wrangler.jsonc b/wrangler.jsonc
index 1a0e60e..6fbb7d1 100644
--- a/wrangler.jsonc
+++ b/wrangler.jsonc
@@ -194,7 +194,7 @@
   // concept and `run_worker_first` carries over unchanged.
   //
   // Keys overridden at env level (name, workers_dev, preview_urls, routes,
-  // d1_databases) are exactly the non-inheritable or production-binding ones;
+  // d1_databases, vars) are exactly the non-inheritable or production-binding ones;
   // everything else (main, assets, ai, durable_objects, migrations,
   // observability, compatibility) inherits from the top level. Access on
   // `/admin` is Worker-gated only here — same deliberate asymmetry as `ops.`
@@ -212,6 +212,11 @@
       ],
       "workers_dev": false,
       "preview_urls": false,
+      // String, because Wrangler vars are strings. Set on this environment so
+      // `deploy:build` records the staging first-fetch window instead of wiping it.
+      "vars": {
+        "FIRST_FETCH_WINDOW_DAYS": "3"
+      },
       // `durable_objects` and `ai` are NOT inherited by environments — without
       // these the staging Worker would deploy with no AI binding and no DO
       // (wrangler warns loudly; the deploy would not start).
===== END unified diff =====

Do not invoke any skill, and do not spawn subagents of your own — you are the reviewer. Return your findings as text in your final message; do not route them through any findings-reporting tool the host may offer.
