Read the review instructions below completely and follow them.

claims_file (leave unread until your instructions call for it):

---
title: 'Renew the staging DeepInfra LLM budget period'
type: 'feature'
created: '2026-10-11'
status: 'in-review'
route: 'dispatch'
baseline_commit: 'f531e4e9a59ff828292dc8c6d29b62724d411a57'
review_loop_iteration: 0
context:
  - '{project-root}/docs/llm-accounting.md'
  - '{project-root}/src/pipeline/ai/costPolicy.ts'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Staging period `acceptance-3-36-deepinfra-20261004` ends at `2026-10-11T19:10:00.000Z`. After that, `pml-build` has no reviewed DeepInfra budget. Patrick ruled at 10:07 AM ET on 2026-10-11, verbatim: "Accept Epic 3 with open items, mark 3.37 and Epic 3 done, apply the recommended action-item changes, and renew the staging DeepInfra budget at $1 for 7 days on V4-Flash."

**Approach:** One append-only migration inserts `staging-deepinfra-v4flash-20261011` at 100 cents for `deepseek-ai/DeepSeek-V4-Flash`. Start `2026-10-11T19:10:00.000Z` (old end, not earlier). End `2026-10-18T00:10:57.000Z`, `min(start + 7 days, validUntil)` in `COST_POLICIES` (`src/pipeline/ai/costPolicy.ts`). That is 18h 59m 3s (about 19 hours) short of 7 days. After `validUntil`, runs fail with `cost_policy_invalid` until a reviewed V4-Flash refresh.

## Boundaries & Constraints

**Always:** Insert only. Leave the old period unchanged. Bounds are 24-character UTC (`YYYY-MM-DDTHH:mm:ss.sssZ`); start inclusive, end exclusive, so `19:10:00.000Z` belongs only to the new row. Insert only when `gateway_config.id = 'current'` already names `deepseek-ai/DeepSeek-V4-Flash` (staging does; a production catch-up stays on the Workers AI seed and this insert no-ops). Replay is a no-op (`NOT EXISTS` on the new id). Ruling quote and 10:07 AM ET timestamp go in the migration comment and here. Log the refresh in `deferred-work.md` before 2026-10-17.

**Never:** Hand-edit remote D1. Do not update, close, or delete the old period. Do not change `reserve()`, sprint-status, the Epic 3 retro, or any 4.x story. Do not refresh the cost policy here. Do not migrate production `pml`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Before handoff | Both periods. `reserve` at `2026-10-11T19:09:59.000Z` | Only `acceptance-3-36-deepinfra-20261004` | N/A |
| At handoff | Both periods. `reserve` at `2026-10-11T19:10:00.000Z` | Only `staging-deepinfra-v4flash-20261011` | N/A |
| Replay | V4-Flash gateway. Run the `0025` statements twice | One new row, `cap_cents = 100`, same bounds. Old row unchanged | N/A |
| Workers AI seed | `0017` seed. Apply `0025` | No new period | N/A |

</frozen-after-approval>

## Code Map

- `src/pipeline/ai/costPolicy.ts` -- V4-Flash `validUntil` `2026-10-18T00:10:57.000Z` (lines 80–94). Do not edit.
- `migrations/0021_atomic_llm_accounting.sql` -- `llm_periods` checks 24-character timestamps, `cap_cents`, and `provenance`. Update/delete abort. Accounting is a view.
- `migrations/0024_deepseek_v4_flash_roles.sql` -- no-ops on the Workers AI seed. Staging already applied it; roles name V4-Flash.
- `src/shared/db/repos/llmAccountingRepo.ts` -- `reserve` attributes `starts_at <= now < ends_at` (period insert near line 124). Reuse it.
- `src/shared/db/repos/llmAccountingUpgrade.test.ts` -- `UPGRADE_DB` and `applyD1Migrations`. That helper applies only un-applied files.
- `docs/llm-accounting.md` -- reviewed migration; example SQL is not a decision. Overlaps all apply.
- `docs/deepinfra-runbook.md` -- the acceptance row was an operator insert. Live `pml-build`: that id, `2026-10-04T19:10:00.000Z`–`2026-10-11T19:10:00.000Z`, cap 100. Tests seed it. The migration must not.
- `package.json` -- Eng Manager runs `npm run migrate:build` (`pml-build` only). `deploy` and `migrate:remote` target production `pml`.

## Tasks & Acceptance

**Execution:**
- [x] `migrations/0025_staging_deepinfra_v4flash_period.sql` -- idempotent insert of the new period, V4-Flash role guard, ruling quote, timestamp, and the ~19-hour shortfall -- reviewed provisioning
- [x] `src/shared/db/repos/stagingLlmPeriod.test.ts` -- workers-pool D1 tests for the matrix (handoff, replay, Workers AI no-op, old row, 100-cent cap)
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- append the V4-Flash cost-policy refresh, due before 2026-10-17

**Acceptance Criteria:**
- Given the V4-Flash `COST_POLICIES` entry, when `0025` inserts the row, then `ends_at` is `2026-10-18T00:10:57.000Z` and `starts_at` is `2026-10-11T19:10:00.000Z`.
- Given the migration comment and this spec, when either is read, then both contain the 10:07 AM ET ruling quote and the about-19-hour shortfall, after which `cost_policy_invalid` blocks runs until a reviewed refresh.
- Given `deferred-work.md`, when this lands, then it says to refresh the V4-Flash cost policy before 2026-10-17.

## Implementation Notes

- `migrations/0025_staging_deepinfra_v4flash_period.sql` inserts the row only when `gateway_config` already names `deepseek-ai/DeepSeek-V4-Flash`. `NOT EXISTS` keeps a second execution to one row. Tests seed `acceptance-3-36-deepinfra-20261004` on `UPGRADE_DB`; the migration does not write that row.
- `npm run check` passed. `npm test` passed: 1645 tests, 6 skipped.

## Spec Change Log

## Review Triage Log

## Design Notes

The role guard matches `0024`. Staging already names V4-Flash, so `migrate:build` inserts the row. Production is on `0004`; a later catch-up leaves the Workers AI seed, so this file does not add a 100-cent cap for every provider. `NOT EXISTS` covers a replay of the SQL. D1 applies `migrations/*.sql` in order and records each name in `d1_migrations` (Cloudflare D1 migrations).

## Verification

**Commands:**
- `npm run check` -- expected: exit 0
- `npm test` -- expected: exit 0, including the new period tests

**Manual checks (if no CLI):**
- Eng Manager applies `npm run migrate:build` on `pml-build` only. Do not run `npm run deploy` or `npm run migrate:remote`.

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
