---
title: '3.34 — Test the executing DailyRunWorkflow'
type: 'chore'
created: '2026-10-04'
status: 'done'
baseline_revision: '4f6a8696b5898af5fc3823b9078e69f7e9398106'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Existing orchestration tests call the production method through handcrafted checkpoint objects and fake dispatch bindings. They cannot prove the native Workflow runtime forwards the source registry and invokes Draft review.

**Approach:** Add a local native Workflow binding/runtime integration suite that executes the inherited production run method, actual internal helpers and real migrated D1, replacing only external source/provider effects with deterministic fixtures. Demonstrate that the tests detect removed registry forwarding and removed review dispatch.

## Boundaries & Constraints

**Always:** Use the installed Cloudflare test runtime and real Workflow checkpoints/binding, admission, accounting and gate. Assert persisted evaluated ready/awaiting Drafts, accounting and the public Evidence response. Preserve existing detailed checkpoint-loss/safety tests and distinguish native restart evidence from synthetic lost-checkpoint schedules. Exercise meaningful native concurrency schedules from admission, bounded reservation and approval readiness. Use fixture pricing valid for deterministic tests without changing production policy. Dispose every native introspector and isolate fixture state. Include the suite in required CI. Restore production source after each deliberate mutation and demonstrate green restoration. Preserve Story 3.35 and all earlier UI behavior.

**Never:** Replace run/package/review/internal persistence with stubs, substitute whole native step bodies/results as proof of their execution, claim Object.create plus handcrafted step.do is native binding coverage, perform paid calls/remote migrations/editorial approvals, refresh production pricing, or treat these local tests as hosted 3.36/3.37 acceptance. Do not add the Workflow as a Durable Object class or weaken security/cost policy to simplify tests.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Material | Deterministic material source and bounded successful provider | Native run persists package, evaluated ready awaiting Draft, settled calls, matching public Evidence; canonical F1 unchanged before approval | No external network/paid work |
| Empty | Successful source without changes | Empty Run, no Draft or paid effects, truthful source/completion Evidence | Not failure |
| All-source failure | All configured sources fail | Failed Run with source failures, no false empty or published status | Scrubbed public receipts |
| Partial failure | Material source plus failed source | Material review persists alongside failure Evidence | Do not discard useful package |
| Budget stop | Insufficient frozen allowance | Stopped Run, bounded admitted effects, no unpaid/unknown accounting disguised as success | Preserve reason and Draft readiness truth |
| Replay | Native repeat/restart of material persisted work | Same Run/package identity, no duplicate Draft/review charge/publication | Existing precise lost-checkpoint tests remain separate |
| Admission concurrency | Competing origins for same date while native source/provider work is held | One actual native workload; losers conflict; public identity retained | No stubbing admission authority |
| Paid concurrency | Two real native workloads compete for configured shared bounded capacity | Atomic reservations prevent overspend; provider counters/persisted liability agree | No accounting stub |
| Readiness concurrency | Native reviewer held, authenticated gate attempt before completion, then completion/decision | Premature decision refused; completed eligible artifact can be decided exactly once and remains sealed | No gate stub |
| Mutation detection | Temporarily remove source registry forwarding or review dispatch | Focused native material test fails for missing persisted/public behavior, not an unrelated setup error | Always restore source and rerun green |

</intent-contract>

## Code Map

- `src/pipeline/workflow/dailyRun.ts:283` — production run; protected sourceChecks/gatewayDeps are external dependency seams. Native checkpoints attach-run, run-daily-step, draft-and-review; keep these real.
- `src/pipeline/workflow/dailyRunRecovery.test.ts:43–187` and `runAdmission.test.ts:90–118` — existing synthetic checkpoint fixtures, valid fixture costPolicy and source/provider responses. Preserve their distinct fault coverage.
- `wrangler.test.jsonc:56`, `vitest.config.ts` — historical Workflow omission comment requires actual installed-runtime feasibility probe. Local workflow binding may use a test-only export inheriting run and overriding only external-effect dependencies. If wrapper/export conflict remains, use a narrowly isolated worker project/config rather than changing production exports or tests to helper-only coverage.
- Installed `@cloudflare/vitest-pool-workers` 0.20.3 provides `introspectWorkflowInstance`, `introspectWorkflow`, waitForStepResult/status, disableRetryDelays and dispose. Its wrapper invokes the actual exported class. Official reference: https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/ ; installed declarations govern actual signatures. Do not upgrade dependencies speculatively.
- `src/shared/api/publicRouter.ts:322` — public Run Evidence route; assert returned Drafts/evaluations and receipts after execution.
- `src/pipeline/agents/draftAndReview.test.ts:1516`, `src/pipeline/gate/atomicGate.test.ts`, `src/pipeline/ai/gateway.test.ts:1246`, `src/pipeline/workflow/runAdmission.test.ts:183` — existing deterministic barriers and real gate/accounting/admission safety scenarios.
- `src/test/failingDb.ts` — real-D1 interruption/barrier proxies, not substitute databases.
- `.github/workflows/ci.yml`, `package.json` — required verify job currently runs npm test (all src/**/*.test.ts); register isolated native suite if necessary and reproducible mutation verification.

## Tasks & Acceptance

**Execution:**
- `wrangler.test.jsonc`, `vitest.config.ts`, optional narrowly scoped `src/test/*` runtime fixture entrypoint — first prove native binding boot with inherited production run, then expose only deterministic external effects and barriers without remote bindings.
- `src/pipeline/workflow/dailyRun.native.test.ts` — implement all matrix paths with actual local D1/runtime and public API assertions. Keep scenarios deterministic and clean up native handles.
- `scripts/verify-workflow-mutations.*`, `package.json`, `.github/workflows/ci.yml` as needed — reproducible two-mutant detection with unconditional restoration and explicit expected-failure evidence; ensure normal native suite runs in required CI.
- This spec and sprint/context records — record actual platform limitations, mutation results, matrix coverage and verification without claiming hosted acceptance.

**Acceptance Criteria:**
- Given a material public-source fixture, when the Workflow binding executes the production run, then persisted ready awaiting Drafts and their public Evidence prove source forwarding, review dispatch and truthful accounting.
- Given concurrency barriers and replay, when real native workloads run against the actual admission/accounting/gate, then the invariants in the matrix hold without replacing those implementations.
- Given either deliberate orchestration mutation, when the focused native test runs, then its persisted/public assertions fail; after restoration the full suite passes and required CI includes native execution coverage.

## Spec Change Log

## Review Triage Log

### 2026-10-04 — Review pass
- Four context-free layers ran; the fourth started after a slot became available. Verification-gap reported no gaps. Findings below preserve reporting order (blind, intent, edge).
- verdicts: 13 findings — high 0, medium 3, low 5, false 5, maybe-false 0
- findings:
  - `[low]` `[reject]` B1: Native admission schedule starts competitors after the owner enters collection, so it does not independently cover simultaneous first claims. This is an incremental coverage limitation, not a missing owner-exclusion assertion: `runAdmission.test.ts` already races all three origins with real admission/D1. Another native schedule adds fixture complexity beyond a direct correction; the native held-work integration plus existing atomic admission race cover the everyday regression risk.
  - `[low]` `[reject]` B2: Native paid schedule starts the contender after a reservation commits. The existing `llmAccountingRepo.test.ts` simultaneous real-D1 reserve test proves one winner across overlapping periods, while this test proves native dispatch respects that liability. Adding pre-commit interception would add database instrumentation beyond the external fixtures; negligible additional everyday coverage does not justify that complexity.
  - `[medium]` `[patch]` B3: Separate authentication and gate calls miss route identity forwarding. Signed POSTs now pass through the production Worker decision route; assertions cover premature refusal, named approval, duplicate refusal and sealed replay.
  - `[medium]` `[patch]` B4: Budget cases omitted public stop reasons and shared-period Draft evaluation truth. The shared stopped assertion now verifies `run.stopped` / `budget_stopped`, one undecided ready Draft, and explicit budget-based `evals_not_run` for all stopped cases.
  - `[low]` `[patch]` B5: First disposal failure could skip other handles/global restoration. Cleanup now settles all handles, always unstubs globals, then reports aggregate failures.
  - `[low]` `[patch]` B6: CI full verification preceded deliberate mutations. Reordered existing steps so the full suite runs on restored source after mutation verification, with no duplicate full run.
  - `[false]` `[reject]` I1: Review snapshot is not recorded completion. This was correctly `in-review` during review; finalization records completion only after verification and delivery evidence.
  - `[false]` `[reject]` I2: Native test subclass does not prove hosted production binding configuration. Canonical epics.md explicitly requires a test-compatible binding/runtime; inherited production run and real checkpoints satisfy that surface. Hosted verification is 3.36/3.37.
  - `[false]` `[reject]` I3: Public handler assertions do not exercise rendered/deployed Evidence. Canonical 3.34 asks for persisted Drafts/public Evidence; actual handler responses are parsed and compared to persisted records. It does not require a UI/deployed route check.
  - `[medium]` `[patch]` I4: Authentication and gate were separately exercised. Same route-coverage defect as B3; repaired through signed production Worker requests and public identity assertions.
  - `[false]` `[reject]` I5: Completed native restart is not native mid-checkpoint loss. The test explicitly claims restart only, proves re-entry into the actual package checkpoint, preserves package identity, and retains existing precise synthetic checkpoint-loss tests. Canonical 3.34 requires replay, not an unavailable native fault-injection mechanism.
  - `[false]` `[reject]` I6: Intent alone/diff cannot establish prior scope or passing commands. Canonical epics.md lines 1121–1130 establishes scope; parent independently ran the commands and inspected their output. No missing implementation follows from the auditor's evidence boundary.
  - `[low]` `[patch]` E1: Disposal failure skips cleanup. Same defect as B5, fixed by all-settled cleanup and unconditional global restoration.

## Verification

- `npx vitest run src/pipeline/workflow/dailyRun.native.test.ts --reporter=verbose` — every native matrix case executes and passes, without skipped cases.
- Mutation verification command implemented in `package.json` — both deliberate defects fail the targeted persisted/public assertions; original source restored and green rerun recorded.
- `npm test` — full suite passes without new skips.
- `npm run check` — formatting, lint and TypeScript pass.
- `git diff --check` — no whitespace errors.


## Auto Run Result

Implemented nine local native Workflow scenarios using the inherited production `DailyRunWorkflow.run`, native checkpoints, migrated D1, real admission/accounting and the authenticated production approval route. Only external source/provider effects and fixture pricing/time are substituted. Production orchestration is unchanged.

Files changed:
- `../../src/pipeline/workflow/dailyRun.native.test.ts` — all nine scenario tests, persisted/public assertions, real signed decision requests and restart identity checks.
- `../../src/test/nativeWorkflow.ts` — test-only subclass overriding external dependency seams.
- `../../wrangler.native-test.jsonc` and `../../vitest.config.ts` — isolated native runtime project with real Workflow and D1 bindings.
- `../../wrangler.test.jsonc` — explains separation from the existing Agent wrapper project.
- `../../scripts/verify-workflow-mutations.mjs` and `../../package.json` — reproducible targeted mutations, expected assertion checks, unconditional restoration and restored native reruns.
- `../../.github/workflows/ci.yml` — required mutation verification followed by full restored-source tests.
- This spec, sprint status and Epic 3 context — verification and delivery handoff.

Review: four layers completed, 13 individual findings logged. Four patch groups applied (two medium, two low); zero deferred. Two low incremental native-race coverage suggestions were rejected because real-D1 simultaneous atomic races already run in the required suite and adding native interception exceeds a direct correction. Five intent-boundary observations were rejected with canonical-scope or verification evidence recorded above. Follow-up review recommended: false; no specific unverified repair risk remains after signed-route, stop-receipt and restored-source verification.

Parent verification after repairs:
- Native matrix: all nine named tests pass, no skips in ordinary suite runs. Material, empty, all-source failure, partial failure, budget stop, native replay, held-source admission, shared-period paid admission, and held-review authenticated decision map to the first nine matrix rows.
- `npm run test:workflow-mutations`: each deliberately broken implementation exits 1 at its expected persisted-behavior assertion. Both restorations pass all nine native tests. The focused mutant runs intentionally filter the other eight cases; restored runs have no skips. This covers matrix row ten.
- `npm test`: 1,419 tests in 62 files pass on restored source after both mutations.
- `npm run check`: formatting, lint and TypeScript pass.
- `git diff --check`: clean; production dailyRun.ts has no diff.

Residual limits: local native restart is not hosted service acceptance or precise commit/checkpoint-loss injection; retained synthetic tests cover the latter. Shared external barriers poll in their own request context because cross-request Promise resolution stalled local workerd I/O during development. No paid inference, remote migration, pricing refresh or real editorial approval occurred. Stories 3.36 and 3.37 remain operational acceptance work.
