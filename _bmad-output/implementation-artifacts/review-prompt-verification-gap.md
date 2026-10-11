Read the review instructions below completely and follow them.

Review content: the unified diff below. It is the content under review.

diff --git a/_bmad-output/implementation-artifacts/deferred-work.md b/_bmad-output/implementation-artifacts/deferred-work.md
index adb2959..5cbdf45 100644
--- a/_bmad-output/implementation-artifacts/deferred-work.md
+++ b/_bmad-output/implementation-artifacts/deferred-work.md
@@ -338,3 +338,9 @@ Logged after Patrick accepted entry 101 (`de-case-il-cftc-481187548`) as the 3.3
 
 - A published `docket_events` row cannot be cleanly reverted. The Approval Gate has no unpublish path.
 - A rejected entry cannot be redrafted. `seenEventIds` in `src/pipeline/connectors/courtListener.ts` treats an event as seen when a `docket_events` row exists or any draft already points at that id, whatever the draft outcome. A later Run skips it.
+
+## Deferred from: staging DeepInfra budget renewal (2026-10-11)
+
+Patrick ruled at 10:07 AM ET on 2026-10-11, verbatim: "Accept Epic 3 with open items, mark 3.37 and Epic 3 done, apply the recommended action-item changes, and renew the staging DeepInfra budget at $1 for 7 days on V4-Flash." Period `staging-deepinfra-v4flash-20261011` ends at the V4-Flash cost-policy `validUntil` `2026-10-18T00:10:57.000Z`, 18 hours 59 minutes 3 seconds (about 19 hours) short of 7 days. Source: `spec-renew-staging-deepinfra-llm-budget.md`.
+
+- Do a reviewed V4-Flash cost-policy refresh before 2026-10-17. After that `validUntil`, runs fail with `cost_policy_invalid` whatever the budget says.
diff --git a/_bmad-output/implementation-artifacts/spec-renew-staging-deepinfra-llm-budget.md b/_bmad-output/implementation-artifacts/spec-renew-staging-deepinfra-llm-budget.md
new file mode 100644
index 0000000..6f38b91
--- /dev/null
+++ b/_bmad-output/implementation-artifacts/spec-renew-staging-deepinfra-llm-budget.md
@@ -0,0 +1,82 @@
+---
+title: 'Renew the staging DeepInfra LLM budget period'
+type: 'feature'
+created: '2026-10-11'
+status: 'in-review'
+route: 'dispatch'
+baseline_commit: 'f531e4e9a59ff828292dc8c6d29b62724d411a57'
+review_loop_iteration: 0
+context:
+  - '{project-root}/docs/llm-accounting.md'
+  - '{project-root}/src/pipeline/ai/costPolicy.ts'
+---
+
+<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">
+
+## Intent
+
+**Problem:** Staging period `acceptance-3-36-deepinfra-20261004` ends at `2026-10-11T19:10:00.000Z`. After that, `pml-build` has no reviewed DeepInfra budget. Patrick ruled at 10:07 AM ET on 2026-10-11, verbatim: "Accept Epic 3 with open items, mark 3.37 and Epic 3 done, apply the recommended action-item changes, and renew the staging DeepInfra budget at $1 for 7 days on V4-Flash."
+
+**Approach:** One append-only migration inserts `staging-deepinfra-v4flash-20261011` at 100 cents for `deepseek-ai/DeepSeek-V4-Flash`. Start `2026-10-11T19:10:00.000Z` (old end, not earlier). End `2026-10-18T00:10:57.000Z`, `min(start + 7 days, validUntil)` in `COST_POLICIES` (`src/pipeline/ai/costPolicy.ts`). That is 18h 59m 3s (about 19 hours) short of 7 days. After `validUntil`, runs fail with `cost_policy_invalid` until a reviewed V4-Flash refresh.
+
+## Boundaries & Constraints
+
+**Always:** Insert only. Leave the old period unchanged. Bounds are 24-character UTC (`YYYY-MM-DDTHH:mm:ss.sssZ`); start inclusive, end exclusive, so `19:10:00.000Z` belongs only to the new row. Insert only when `gateway_config.id = 'current'` already names `deepseek-ai/DeepSeek-V4-Flash` (staging does; a production catch-up stays on the Workers AI seed and this insert no-ops). Replay is a no-op (`NOT EXISTS` on the new id). Ruling quote and 10:07 AM ET timestamp go in the migration comment and here. Log the refresh in `deferred-work.md` before 2026-10-17.
+
+**Never:** Hand-edit remote D1. Do not update, close, or delete the old period. Do not change `reserve()`, sprint-status, the Epic 3 retro, or any 4.x story. Do not refresh the cost policy here. Do not migrate production `pml`.
+
+## I/O & Edge-Case Matrix
+
+| Scenario | Input / State | Expected Output / Behavior | Error Handling |
+|----------|--------------|---------------------------|----------------|
+| Before handoff | Both periods. `reserve` at `2026-10-11T19:09:59.000Z` | Only `acceptance-3-36-deepinfra-20261004` | N/A |
+| At handoff | Both periods. `reserve` at `2026-10-11T19:10:00.000Z` | Only `staging-deepinfra-v4flash-20261011` | N/A |
+| Replay | V4-Flash gateway. Run the `0025` statements twice | One new row, `cap_cents = 100`, same bounds. Old row unchanged | N/A |
+| Workers AI seed | `0017` seed. Apply `0025` | No new period | N/A |
+
+</frozen-after-approval>
+
+## Code Map
+
+- `src/pipeline/ai/costPolicy.ts` -- V4-Flash `validUntil` `2026-10-18T00:10:57.000Z` (lines 80–94). Do not edit.
+- `migrations/0021_atomic_llm_accounting.sql` -- `llm_periods` checks 24-character timestamps, `cap_cents`, and `provenance`. Update/delete abort. Accounting is a view.
+- `migrations/0024_deepseek_v4_flash_roles.sql` -- no-ops on the Workers AI seed. Staging already applied it; roles name V4-Flash.
+- `src/shared/db/repos/llmAccountingRepo.ts` -- `reserve` attributes `starts_at <= now < ends_at` (period insert near line 124). Reuse it.
+- `src/shared/db/repos/llmAccountingUpgrade.test.ts` -- `UPGRADE_DB` and `applyD1Migrations`. That helper applies only un-applied files.
+- `docs/llm-accounting.md` -- reviewed migration; example SQL is not a decision. Overlaps all apply.
+- `docs/deepinfra-runbook.md` -- the acceptance row was an operator insert. Live `pml-build`: that id, `2026-10-04T19:10:00.000Z`–`2026-10-11T19:10:00.000Z`, cap 100. Tests seed it. The migration must not.
+- `package.json` -- Eng Manager runs `npm run migrate:build` (`pml-build` only). `deploy` and `migrate:remote` target production `pml`.
+
+## Tasks & Acceptance
+
+**Execution:**
+- [x] `migrations/0025_staging_deepinfra_v4flash_period.sql` -- idempotent insert of the new period, V4-Flash role guard, ruling quote, timestamp, and the ~19-hour shortfall -- reviewed provisioning
+- [x] `src/shared/db/repos/stagingLlmPeriod.test.ts` -- workers-pool D1 tests for the matrix (handoff, replay, Workers AI no-op, old row, 100-cent cap)
+- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- append the V4-Flash cost-policy refresh, due before 2026-10-17
+
+**Acceptance Criteria:**
+- Given the V4-Flash `COST_POLICIES` entry, when `0025` inserts the row, then `ends_at` is `2026-10-18T00:10:57.000Z` and `starts_at` is `2026-10-11T19:10:00.000Z`.
+- Given the migration comment and this spec, when either is read, then both contain the 10:07 AM ET ruling quote and the about-19-hour shortfall, after which `cost_policy_invalid` blocks runs until a reviewed refresh.
+- Given `deferred-work.md`, when this lands, then it says to refresh the V4-Flash cost policy before 2026-10-17.
+
+## Implementation Notes
+
+- `migrations/0025_staging_deepinfra_v4flash_period.sql` inserts the row only when `gateway_config` already names `deepseek-ai/DeepSeek-V4-Flash`. `NOT EXISTS` keeps a second execution to one row. Tests seed `acceptance-3-36-deepinfra-20261004` on `UPGRADE_DB`; the migration does not write that row.
+- `npm run check` passed. `npm test` passed: 1645 tests, 6 skipped.
+
+## Spec Change Log
+
+## Review Triage Log
+
+## Design Notes
+
+The role guard matches `0024`. Staging already names V4-Flash, so `migrate:build` inserts the row. Production is on `0004`; a later catch-up leaves the Workers AI seed, so this file does not add a 100-cent cap for every provider. `NOT EXISTS` covers a replay of the SQL. D1 applies `migrations/*.sql` in order and records each name in `d1_migrations` (Cloudflare D1 migrations).
+
+## Verification
+
+**Commands:**
+- `npm run check` -- expected: exit 0
+- `npm test` -- expected: exit 0, including the new period tests
+
+**Manual checks (if no CLI):**
+- Eng Manager applies `npm run migrate:build` on `pml-build` only. Do not run `npm run deploy` or `npm run migrate:remote`.
diff --git a/migrations/0025_staging_deepinfra_v4flash_period.sql b/migrations/0025_staging_deepinfra_v4flash_period.sql
new file mode 100644
index 0000000..3baf7d5
--- /dev/null
+++ b/migrations/0025_staging_deepinfra_v4flash_period.sql
@@ -0,0 +1,40 @@
+-- Renew the staging DeepInfra LLM budget.
+--
+-- Patrick ruled at 10:07 AM ET on 2026-10-11, verbatim:
+-- "Accept Epic 3 with open items, mark 3.37 and Epic 3 done, apply the
+-- recommended action-item changes, and renew the staging DeepInfra budget
+-- at $1 for 7 days on V4-Flash."
+--
+-- One append-only llm_periods row. This does not update or delete
+-- acceptance-3-36-deepinfra-20261004, which ends at
+-- 2026-10-11T19:10:00.000Z. The new period starts at that instant
+-- (inclusive) and ends at the DeepSeek-V4-Flash cost-policy validUntil
+-- 2026-10-18T00:10:57.000Z in src/pipeline/ai/costPolicy.ts. That is
+-- min(start + 7 days, validUntil). Start + 7 days would be
+-- 2026-10-18T19:10:00.000Z, so this window is 18 hours 59 minutes 3 seconds
+-- (about 19 hours) short of 7 days. After validUntil, runs fail with
+-- cost_policy_invalid whatever the budget says, until a reviewed
+-- V4-Flash cost-policy refresh.
+--
+-- The insert runs only when gateway_config id 'current' already names
+-- deepseek-ai/DeepSeek-V4-Flash. Staging pml-build does. A production
+-- catch-up is still the Workers AI seed after 0024, so this file no-ops
+-- there. NOT EXISTS makes a replay of this statement a no-op. D1 records
+-- the file once in d1_migrations.
+-- https://developers.cloudflare.com/d1/reference/migrations/
+
+INSERT INTO llm_periods (id, starts_at, ends_at, cap_cents, provenance)
+SELECT
+  'staging-deepinfra-v4flash-20261011',
+  '2026-10-11T19:10:00.000Z',
+  '2026-10-18T00:10:57.000Z',
+  100,
+  'Patrick 2026-10-11 10:07 AM ET: "Accept Epic 3 with open items, mark 3.37 and Epic 3 done, apply the recommended action-item changes, and renew the staging DeepInfra budget at $1 for 7 days on V4-Flash."'
+WHERE EXISTS (
+  SELECT 1 FROM gateway_config
+  WHERE id = 'current'
+    AND instr(roles_json, 'deepseek-ai/DeepSeek-V4-Flash') > 0
+)
+AND NOT EXISTS (
+  SELECT 1 FROM llm_periods WHERE id = 'staging-deepinfra-v4flash-20261011'
+);
diff --git a/src/shared/db/repos/stagingLlmPeriod.test.ts b/src/shared/db/repos/stagingLlmPeriod.test.ts
new file mode 100644
index 0000000..0e89a4d
--- /dev/null
+++ b/src/shared/db/repos/stagingLlmPeriod.test.ts
@@ -0,0 +1,146 @@
+import { applyD1Migrations, env } from "cloudflare:test";
+import { expect, it } from "vitest";
+import { COST_POLICIES } from "../../../pipeline/ai/costPolicy";
+import { fixtureCostPolicy } from "../../../test/costPolicyFixture";
+import * as accounting from "./llmAccountingRepo";
+
+const OLD_ID = "acceptance-3-36-deepinfra-20261004";
+const NEW_ID = "staging-deepinfra-v4flash-20261011";
+const OLD_START = "2026-10-04T19:10:00.000Z";
+const HANDOFF = "2026-10-11T19:10:00.000Z";
+const BEFORE = "2026-10-11T19:09:59.000Z";
+const RULING =
+  'Patrick 2026-10-11 10:07 AM ET: "Accept Epic 3 with open items, mark 3.37 and Epic 3 done, apply the recommended action-item changes, and renew the staging DeepInfra budget at $1 for 7 days on V4-Flash."';
+
+type Migration = { name: string; queries: string[] };
+type PeriodRow = {
+  id: string;
+  starts_at: string;
+  ends_at: string;
+  cap_cents: number;
+  provenance: string;
+};
+
+function bindings() {
+  return env as unknown as {
+    DB: D1Database;
+    UPGRADE_DB: D1Database;
+    TEST_MIGRATIONS: Migration[];
+  };
+}
+
+function migration0025(): Migration {
+  const found = bindings().TEST_MIGRATIONS.find((entry) =>
+    entry.name.startsWith("0025")
+  );
+  expect(found?.queries.length).toBeGreaterThan(0);
+  return found!;
+}
+
+async function period(db: D1Database, id: string) {
+  return db
+    .prepare(
+      "SELECT id, starts_at, ends_at, cap_cents, provenance FROM llm_periods WHERE id=?"
+    )
+    .bind(id)
+    .first<PeriodRow>();
+}
+
+async function attributed(db: D1Database, operationId: string) {
+  const { results } = await db
+    .prepare(
+      "SELECT period_id FROM llm_operation_periods WHERE operation_id=? ORDER BY period_id"
+    )
+    .bind(operationId)
+    .all<{ period_id: string }>();
+  return results.map((row) => row.period_id);
+}
+
+it("does not insert the renewal on the Workers AI seed", async () => {
+  const db = bindings().DB;
+  expect(
+    bindings().TEST_MIGRATIONS.some((entry) => entry.name.startsWith("0025"))
+  ).toBe(true);
+  const roles = await db
+    .prepare("SELECT roles_json FROM gateway_config WHERE id='current'")
+    .first<{ roles_json: string }>();
+  expect(roles?.roles_json).not.toContain("deepseek-ai/DeepSeek-V4-Flash");
+  expect(await period(db, NEW_ID)).toBeNull();
+});
+
+it("renews the V4-Flash period once and hands off at 19:10:00Z", async () => {
+  const { UPGRADE_DB: db, TEST_MIGRATIONS: migrations } = bindings();
+  const migration = migration0025();
+  const v4 = COST_POLICIES.find(
+    (entry) =>
+      entry.provider === "deepinfra" &&
+      entry.model === "deepseek-ai/DeepSeek-V4-Flash"
+  );
+  expect(v4?.validUntil).toBe("2026-10-18T00:10:57.000Z");
+  await applyD1Migrations(
+    db,
+    migrations.filter((entry) => entry.name < migration.name)
+  );
+  await db
+    .prepare("INSERT INTO llm_periods VALUES (?,?,?,?,?)")
+    .bind(OLD_ID, OLD_START, HANDOFF, 100, "acceptance fixture")
+    .run();
+  const oldBefore = await period(db, OLD_ID);
+  await db
+    .prepare("UPDATE gateway_config SET roles_json=? WHERE id='current'")
+    .bind(
+      JSON.stringify({
+        drafter: {
+          provider: "deepinfra",
+          model: "deepseek-ai/DeepSeek-V4-Flash"
+        }
+      })
+    )
+    .run();
+  await applyD1Migrations(db, [migration]);
+  await db.batch(migration.queries.map((sql) => db.prepare(sql)));
+  await applyD1Migrations(db, [migration]);
+  const created = await period(db, NEW_ID);
+  expect(created).toEqual({
+    id: NEW_ID,
+    starts_at: HANDOFF,
+    ends_at: v4!.validUntil,
+    cap_cents: 100,
+    provenance: RULING
+  });
+  expect(
+    await db
+      .prepare("SELECT COUNT(*) AS n FROM llm_periods WHERE id=?")
+      .bind(NEW_ID)
+      .first<{ n: number }>()
+  ).toEqual({ n: 1 });
+  expect(await period(db, OLD_ID)).toEqual(oldBefore);
+  const runId = "run-20261011-aa01";
+  await db
+    .prepare(
+      "INSERT INTO runs (id,origin,mode,status,started_at,spend_cents,spend_currency,budget_cents) VALUES (?,'manual','hitl','running',?,0,'USD',100)"
+    )
+    .bind(runId, BEFORE)
+    .run();
+  async function reserveAt(now: string, key: string) {
+    const id = crypto.randomUUID();
+    await accounting.reserve(db, {
+      id,
+      runId,
+      role: "drafter",
+      key,
+      fingerprint: "fp",
+      owner: crypto.randomUUID(),
+      bound: 1,
+      budget: 100,
+      policy: fixtureCostPolicy("deepinfra", v4!.model, now),
+      now,
+      awaiting: false
+    });
+    return id;
+  }
+  const beforeId = await reserveAt(BEFORE, "draft:1:drafter");
+  const handoffId = await reserveAt(HANDOFF, "draft:2:drafter");
+  expect(await attributed(db, beforeId)).toEqual([OLD_ID]);
+  expect(await attributed(db, handoffId)).toEqual([NEW_ID]);
+});

Do not invoke any skill, and do not spawn subagents of your own — you are the reviewer. If the instruction file is unreadable, report that exact failure and stop. Return your findings as text in your final message; do not route them through any findings-reporting tool the host may offer.

----- REVIEW INSTRUCTIONS -----

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
