Read the following review instructions completely and follow them. They are the contents of review-prompts/verification-gap.md, inlined because this session has no shared filesystem.

===== BEGIN review-prompts/verification-gap.md =====
# Verification Gap Review

**Goal:** Find changed behavior that could break without reliable verification catching it. Ask one question — "if the behavior this change is supposed to produce broke where it's actually used, would verification fail?" Do not hunt for correctness bugs, but report genuine problems you notice while tracing verification.

The main verification gap shapes are:

1. **Regression gap:** the changed code regresses where it's used, and no test covering that use would fail.
2. **Missing-adoption gap:** a place that should now use the new behavior doesn't; it handles the same case its own way, or not at all, and no test would flag the omission.
3. **Broken-verification gap:** a test appears to cover the changed behavior, but would not actually protect it because it is skipped, flaky, not run in the normal verification path, or too weak to observe the regression.

## Evidence Rules

- Read a test before claiming what it covers, runs, asserts, or misses.
- Before claiming no test exists, search the whole repo by the symbol under test and by import references; expected file locations are not enough.
- Never assert what you did not verify. If a finding cannot be grounded, drop it.
- In a finding, say what you actually checked — "none of the tests I read cover this" — and show how far you looked. Say a test doesn't exist anywhere only when the symbol/import-reference search actually shows that.
- Do not assign severity, confidence, priority, or ranking.

## Review Sequence

### Step 1: Screen for behavioral change

Screen each part of the change separately. If a part is non-behavioral, skip it. Call a part non-behavioral only when the changed code does not alter return values, thrown errors, caller-visible side effects, or observable state (including iteration order and emitted messages). Once a part meets that test, move on; do not inspect callers or tests for extra confirmation.

Common non-behavioral examples: formatting, comments, whitespace; pure renames; trivial getters/setters and pass-throughs; type-only or compiler-enforced changes with no runtime effect; etc.

Only outcomes produced by deterministic code are worth automatically testing; tests are useless on static source text and brittle on LLM output. Skip those parts.

If every part is skipped, output the clean result (see Output Format).

### Step 2: Find the behavior that changed

Identify what behavior changed compared to the previous version: output, side effect, branch, error path, schema/event shape, config default, validation/authorization rule, external contract, etc. If the change affects more than one behavior, handle each separately.

Treat broad-impact changes as behavioral even when no single changed line looks important: dependency, toolchain, build/config, data-file, etc.

### Step 3: Trace where that behavior is used

Trace the changed behavior to the places that observe it. Start with direct callers and registered entry points (routes, commands, DI), contract consumers (schemas, events, APIs, database readers), and reverse-dependency info if already available.

Follow a path only while the changed behavior is reachable and unverified. Stop when a test at that boundary would fail, the consumer does not observe the changed behavior, or the next hop is guesswork (dynamic dispatch, reflection, outside-repo consumers, etc.). Prefer the nearest observable boundary, often one to three hops away, especially across contract, integration, or service edges. If there are more than five similar consumers, group obvious repeats and check representative paths; expand only when a consumer observes the behavior differently.

### Step 4: Qualify the consumer, then check its test

For each consumer, name the smallest realistic regression this consumer would observe: invert the branch, drop the default, omit the field, return the old error code, skip the integration call, etc. This is the Demonstration. If no such regression exists, drop the path; untested downstream code is not a finding.

A `Missing-adoption gap` qualifies not by the adoption failure alone but by a supersession signal: the change gives clear evidence the new behavior is meant to replace the local one — PR intent, naming or docs, a replaced sibling site, deleted duplicate logic, or a test defining the new rule — and the local site shares the same observable contract. Without a supersession signal and a shared observable contract, it is a refactor suggestion, not a verification-gap finding. Once both hold, check whether any test for that site would flag the non-adoption; missing coverage of the non-adoption is the gap itself, not a disqualifier.

Find and read the relevant test. Ask whether the Demonstration would make an assertion fail.

- If yes, the behavior is verified. No finding.
- For a regression-style Demonstration: if no test runs the path, the test is skipped/flaky/not run normally, or the test runs the code without checking the changed result, report a `Regression gap` or `Broken-verification gap`.
- For a qualifying Missing-adoption case: if none of the site tests you found assert it adopts the new behavior, report a `Missing-adoption gap`.

A test counts only if it runs normally and an assertion observes the changed output, branch, or contract. These do not count: no execution; source-text assertions that match a file's wording instead of running it; success/no-throw/snapshot-only checks; mock/log-call checks; human-only checks; tests that mock away the integration; e2e tests that pass through without checking the changed output; stale assertions or fixtures.

For example, `expect(x ?? DEFAULT).toBe(DEFAULT)` passes when `x` is missing.

Common patterns:

- **Caller-path gap** — helper test covers the branch, but caller values skip it.
- **Contract drift** — payload/schema/event changes must be verified at the consumer.
- **Migration compatibility** — tests only create new-format rows or fresh schemas.
- **Phantom exception** — handled partial-failure path has no test.
- **Missing-adoption gap** — sibling site should use the new rule/helper and does not.
- **Removed verification** — deleted test or weakened assertion leaves behavior unpinned; removing a source-text assertion is not this, since it never counted.

### Step 5: Confirm each finding is real

Before writing a finding, re-open the specific tests or search results the finding relies on. Verify the Demonstration would not make any test you checked fail, or that the absence claim is backed by the symbol/import-reference search. Do not claim more than you verified; drop any finding you cannot ground.

Explain why the test misses the bug using what the test sets up and checks.

Do not report: compiler/type-checker-enforced cases; behavior already verified by an integration, contract, or e2e test; implementation-detail or mock-only tests; low coverage or a missing test file by itself; legacy untested code the change did not affect.

Report genuine problems you noticed while tracing verification, even if they are not verification gaps. Put them under `Other findings` in the output. This permits reporting what you already reached, not extra hunting. A claim that code misbehaves is a defect, not a gap — it goes under `Other findings` for standard triage, however you found it.

## OUTPUT FORMAT

Emit each verification-gap finding as one block. No general advice, no severity or confidence. Triage trusts a gap finding as filed and does not re-verify it, so each block must stand on its own evidence.

```markdown
### <one-line title naming the gap>

- **Changed surface:** the exact behavior or contract that changed — `file:line`.
- **Impacted consumer or site:** named concretely with `file:line` (e.g. "the `createInvoice` mutation used by the billing dashboard at `billing/dashboard.ts:88`," not "callers of this function").
- **Existing test evidence:**
  - `Regression gap`: what the relevant test actually asserts, with `file:line`; or, if none, the symbol/import-reference searches run and their result.
  - `Missing-adoption gap`: tests for the impacted site, and whether any assert it adopts the new behavior.
  - `Broken-verification gap`: the apparent test or verification path, and why it does not count.
- **Missing verification:** the precise assertion or check that's absent.
- **Demonstration:**
  - `Regression gap` / `Broken-verification gap`: the concrete regression that would ship undetected, and why the tests you checked would not fail.
  - `Missing-adoption gap`: the case the site mishandles by not adopting the new behavior, and that none of the tests you read assert adoption.
- **Consequence:** the concrete thing that ships wrong — a regression the checked evidence would not catch, or a site that should use the new behavior and doesn't.
- **Disposition:** `patch` — name the test to add, fit to the repo's own way of verifying (don't impose a generic test pyramid) — or `defer` when the gap is real but not worth closing as part of this change, with one sentence of why.
```

If you noticed genuine non-gap problems while tracing verification, append:

```markdown
## Other findings

- <description only; no severity, confidence, priority, or ranking>
```

When you find no verification gaps and no other findings, output exactly this single line, not an empty response:

`No verification gaps found.`

## CONTENT SOURCE

"Review content:" in the message that launched you gives the content itself or a path to read it from. Read the file when it is a path; either way that is the content under review, and this instruction file never is. If no content is supplied, or the file it points to is missing, empty, or unreadable, say exactly that and stop — never report a clean review for content you could not read.
===== END review-prompts/verification-gap.md =====

Review content: the unified diff follows inline. Read it — it is the content under review.

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

Do not invoke any skill, and do not spawn subagents of your own — you are the reviewer. If the instruction file is unreadable, report that exact failure and stop. Return your findings as text in your final message; do not route them through any findings-reporting tool the host may offer.
