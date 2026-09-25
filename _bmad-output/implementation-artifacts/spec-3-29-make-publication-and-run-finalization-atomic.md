---
title: 'Make publication and Run finalization atomic'
type: 'bugfix'
created: '2026-09-25'
status: 'done'
baseline_revision: 84edfaea4e6a393dc07436568b30d1ea382d0d37
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: [oversized]
deferred:
  - summary: >-
      Benchmark correlated recursive chain-head checks for large historical Runs.
    evidence: |-
      The new guard and finalizer reconstruct chains in correlated SQL. No representative volume timing establishes an actual user-visible slowdown; profile large Runs and inspect query plans before selecting an optimization.
    location: >-
      src/shared/db/repos/draftsRepo.ts:currentHeadSql; src/shared/db/repos/runsRepo.ts:finalizeDecidedRunStmt
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** Eligibility and canonical prior values can change between gate reads and writes. Simultaneous sibling decisions can leave a Run awaiting after all its Drafts are decided, while revision insertion can race publication.

**Approach:** Make each decision an atomic eligibility, publication, receipt, and finalization operation. Serialize revision admission against decisions and reject stale canonical updates without partial effects.

## Boundaries & Constraints

**Always:** Recheck persisted readiness and current chain head within the same transaction as F1 writes. Validate the Draft snapshot used to prepare publication. A successful decision seals original/edited text and lineage, records exactly one decision receipt, and applies only accepted fields. Compare expected prior values for every changed canonical field; a missing target or stale value aborts all writes, including sources/docket events and receipts. Preserve null and boolean semantics. Reject stale changes even when their proposed value happens to equal the new live value.

After every decision, derive completion from current persisted chain heads and outcomes. Historical ancestors do not keep a Run pending. Concurrent last-sibling decisions produce one correct completion receipt: published if any accepted publication exists, otherwise rejected. Preserve non-awaiting Run terminal states, including stopped Runs whose completed explicit not-run Drafts remain human-reviewable. Retries never duplicate or overwrite publication, provenance, actor, or completion evidence.

Revision insertion and parent decisions must share an atomic eligibility boundary: approval-first refuses a child; child-first blocks the ancestor. Only the request that inserts a child may evaluate it or claim revision success. Losing attempts return an explicit conflict with no false success receipt. UI conflict handling refreshes state and keeps edits attached to their Draft identity.

**Never:** Use unsupported interactive D1 transactions or post-commit checks as a substitute for rollback. Do not weaken 3.28 readiness/sealing, bypass authentication or YOLO exclusions, deploy, apply remote migrations, call paid providers, or approve live content. Budget accounting, Workflow replay/admission, failed-revision recovery, and staging acceptance remain later work.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Decision retry | Concurrent requests for one ready Draft | One publication/decision; losing request changes nothing | Already decided/conflict |
| Sibling completion | Two remaining heads decided concurrently | Last commit finalizes once using all committed outcomes | No false awaiting state |
| Generic stale patch | Canonical field differs from diff.from at commit | No F1, decision, or receipt changes | Explicit stale conflict |
| Docket stale patch | Accepted case field changes before commit | No source/event/case/provenance/decision writes | Explicit stale conflict |
| Revision race | Parent decision versus child insertion, either ordering | Exactly one wins; loser never evaluates or claims success | Readiness/conflict |
| Snapshot race | Draft readiness or prepared payload changes before batch | Old payload never publishes | Conflict; no partial effects |
| Late failure | Later statement violates a constraint | Entire batch rolls back | Safe error; no success evidence |
| Stopped not-run | Completed explicit not-run with prior-value match | Human approve/edit/reject works; Run stays stopped | Existing policy |

</intent-contract>

## Code Map

- `src/pipeline/gate/approval.ts:140`: `decide` reads readiness/siblings, builds F1 before decision, and calculates finalization from stale snapshots. Keep validation, human/agent provenance, acceptedFields, and frozen lineage.
- `src/pipeline/gate/f1Apply.ts`: generic TARGETS covers states/cases/circuits/entities/cert_signals; `bindValue` normalizes has_split and factors_json. Generic updates ignore from; docket accepted statePatch checks are read-time only. Case-owned source precedes docket event due existing triggers.
- `src/shared/db/repos/draftsRepo.ts`: readiness projection and pendingTips from 3.28; insertDraft ignores insert ownership, applyDecisionStmt only checks null outcome. Keep root packaging behavior; introduce a dedicated conditional revision insertion path.
- `src/shared/lib/draftReadiness.ts`: authoritative readiness facts: non-running existing Run, summary, nonblank explicit-not-run reason, evaluated/guardrail receipts, and revised receipt for children. SQL guards must agree.
- `src/shared/db/repos/runsRepo.ts:280`: terminalAwaitingRunStmt accepts a precomputed status; replace gate usage with database-derived completion.
- `src/pipeline/steering/submitTurn.ts:218`: reviseDraft checks then inserts without ownership. Keep persisted attempted turn/audit but block losing insertion before evaluation and revision success receipts.
- `src/shared/db/repos/evidenceRepo.ts`, `src/pipeline/projector/evidence.ts`: deterministic receipt IDs and ordered per-Run seq. Make gate completion receipts conditional on successful atomic transitions.
- `src/server.ts`, `src/surfaces/admin/ApprovalQueue.tsx`, `SteeringPanel.tsx`: surface specific conflict messages while preserving scoped edits and existing 3.28 readiness conflicts.
- `src/test/failingDb.ts`, `src/test/reviewedDraft.ts`: reuse forwarding real-D1 proxy and reviewed fixtures. `src/test/setup.ts`, `wrangler.test.jsonc`, migrations: tests run actual D1 schema and constraints.

## Tasks & Acceptance

**Execution:**
- [x] `src/shared/db/repos/` and, if needed, `migrations/0019_gate_assertions.sql` — implement a small transaction guard that fails the actual D1 batch on a false predicate; prove rollback, avoiding interactive transactions.
- [x] `src/shared/db/repos/draftsRepo.ts`, `src/shared/lib/draftReadiness.ts` — provide transaction-time current-head/readiness/snapshot guards and conditional revision insertion with explicit ownership.
- [x] `src/pipeline/gate/f1Apply.ts` — enforce normalized, null-safe expected-prior predicates for generic fields and accepted docket statePatch fields; make missing targets/stale fields abort the whole batch.
- [x] `src/pipeline/gate/approval.ts`, `src/shared/db/repos/runsRepo.ts`, `src/shared/db/repos/evidenceRepo.ts` — compose decision, publication, receipts and database-derived finalization atomically; preserve stopped and other terminal states.
- [x] `src/pipeline/steering/submitTurn.ts`, `src/server.ts`, admin surfaces — stop losing revision attempts before model work; expose stale conflicts with refresh and retained Draft-owned edits.
- [x] `src/pipeline/gate/approval.test.ts` and new adjacent atomic-gate tests — real-D1 deterministic barriers for each matrix race, including both revision orderings, duplicate decisions, mixed/all-rejected siblings, generic/docket CAS and late failure. Cover all generic target normalization families. Repair stale fixtures with truthful prior values.
- [x] `src/pipeline/steering/submitTurn.test.ts`, `src/shared/api/adminApi.test.ts`, queue/steering mounted suites — verify actual revision/gate requests and UI conflicts, no losing provider invocation, canonical/public Evidence consistency and retained edits.

**Acceptance Criteria:**
- Given concurrent authenticated decisions, when HTTP responses settle, then canonical F1 and public Run Evidence show exactly one winning decision per Draft and a correct single Run completion.
- Given stale generic or docket proposals, when an operator decides them, then HTTP reports conflict, persisted publication/receipt state is unchanged, and the queue explains refresh without transferring unsent edits.
- Given decision/revision interleaving, when both operations settle, then only the winning path can change the chain or publication and the loser emits no successful revision receipt or model call.
- Given completed explicit not-run or rejected-only Runs, when normal decisions complete, then existing human-review and terminal-status behavior is preserved.

## Spec Change Log

## Review Triage Log

### 2026-09-25 — Review pass
- verdicts: 18 findings — high 1, medium 10, low 0, false 6, maybe-false 1
- findings:
  - `[medium]` `[patch]` B1 factor JSON ordering — SQLite json() preserves object key order, causing false canonical conflicts; compare structured prior data, then guard its exact stored representation.
  - `[false]` `[reject]` B2 unresolved chains — missing parents are prevented by FK; supported root/revision writers create acyclic same-Run chains. No reachable orphan/cycle writer was identified; manual corruption is not demonstrated runtime state.
  - `[false]` `[reject]` B3 stale lineage — production has no lineage-field or evidence UPDATE/DELETE; parent/index and deterministic revision receipts are immutable once present. New descendants are blocked by the transaction head guard.
  - `[maybe-false]` `[defer]` B4 recursive-query cost — no representative slowdown demonstrated; unverified medium risk needs volume/query-plan benchmark, recorded in frontmatter.
  - `[false]` `[reject]` B5 prepared helper replay — public decide retries return already_decided before preparing F1; stale internal prepared batches fail closed without any mutation. The required retry invariant does not require successful execution of stale internal statements.
  - `[medium]` `[patch]` B6 duplicate docket publication classification — competing source/event identifiers yield a uniqueness error classified invalid; add transaction target-absence assertions and a duplicate-publication race test.
  - `[medium]` `[patch]` B7 authenticated revision conflict — service-level races do not exercise server conflict mapping; add HTTP admission-race and no-success-effects coverage.
  - `[medium]` `[patch]` B8 omitted snapshot fields — extend deterministic mutation cases for identity/confidence/tier/edit/parent/index guards.
  - `[medium]` `[patch]` B9 stopped-Run transition — add awaiting-to-stopped barrier case preserving human not-run publication and existing stop evidence.
  - `[false]` `[reject]` I1 workflow invocation evidence — a mid-review source diff cannot show orchestration; renderer, step execution, and verification are present in the task record and completion is still underway.
  - `[false]` `[reject]` I2 persisted-boundary alignment — descriptive positive finding; real-D1 barriers exercise the expected transaction surface.
  - `[medium]` `[patch]` I3 revision HTTP surface — same verified gap as B7; grouped with its HTTP test patch.
  - `[medium]` `[patch]` I4 integrated operator surface — backend and UI tests may be separate, but actual queue-to-panel conflict wiring needs coverage; grouped with V2.
  - `[false]` `[reject]` I5 completion bookkeeping — expected during review; final status, checklist, CI and reconciliation are scheduled workflow completion steps, not an implementation defect.
  - `[medium]` `[patch]` V1 evaluated sibling guardrails — pre-verified scoped guardrail test cannot distinguish unscoped behavior with a null-summary sibling; add evaluated sibling without guardrail evidence.
  - `[medium]` `[patch]` V2 mounted queue conflict refresh — pre-verified callback-only test misses actual queue reload wiring; mount queue and return a changed head after steering conflict.
  - `[medium]` `[patch]` E1 factor ordering — same verified structural JSON comparison defect as B1; grouped with its patch.
  - `[high]` `[patch]` E2 Draft JSON representation — schema parsing changes evaluation key order, so unchanged legacy rows can fail all decisions; retain exact source JSON for the snapshot or compare semantically without weakening concurrent mutation detection.

Reviewer execution limitation: the platform refused new context-free reviewer slots. The edge layer reused an idle prior-story reviewer, verification reused the investigation agent, and the intent layer ran after the blind layer in that reviewer. All four instructed layers completed before triage; no layer was skipped.

## Design Notes

D1 batch is transactional and a failed statement rolls back the entire sequence: https://developers.cloudflare.com/d1/worker-api/d1-database/. A zero-row UPDATE alone is not a failure. Prefer a named SQL assertion mechanism verified with Miniflare; a local schema-only assertion table/trigger is acceptable if needed. Do not apply it remotely in this story. Execute-time checks must protect every side effect; deriving receipt text from a stale JavaScript sibling snapshot is insufficient.

Use deterministic barriers immediately before real batch/conditional-insert execution, not mocked database results. Reuse 3.28 receipt fixtures without fabricating legacy completion. Existing tests hardcode prior values against seeded F1; strict CAS requires truthful isolated fixtures, not weakened expectations.

## Verification

Run targeted real-D1 gate/steering/API and mounted UI tests, then `npm run check`, `npm test`, `git diff --check`, and required PR CI. After merge, mark 3.29 done and reconcile the shared gate-safety corrective action using evidence from 3.28 and 3.29. Other Epic 3 acceptance actions stay open.


## Auto Run Result

Status: done.

Implemented atomic readiness/snapshot checks, canonical prior-value comparison, decision and receipt ownership, persisted-state Run finalization, and conditional child admission. Revision callers evaluate only their owned child. API/UI conflicts preserve Draft-scoped input and refresh current state.

Review: 18 reports; eight unique patch groups applied (one high, seven medium), one unverified medium performance concern deferred, six findings rejected with reasons recorded individually above. Duplicate reports retain separate triage rows. Applied fixes cover structured factor equality, original-row JSON snapshot capture, duplicate docket identities, authenticated revision conflicts, guarded snapshot fields, stopped-Run interleaving, evaluated/unevaluated sibling isolation, and actual mounted queue refresh.

Follow-up review recommended: false. The high snapshot-representation defect and medium patches were re-read independently and verified with unchanged-representation and real-mutation tests, real-D1 races, HTTP and mounted integration tests. No specific patch-related risk remains unverified; the deferred large-Run performance concern is outside this recommendation calculation.

Verification: `npm run check` passed; `npm test` passed 1154 tests across 50 files; `git diff --check` passed. Review patches first passed 238 affected-suite tests and 36 focused snapshot tests. Every matrix row has executed passing coverage in atomicGate, draftReadiness, steering, API or mounted UI suites. Required PR CI run `36147854656` passed 1148 tests with 6 environment-dependent skips across 50 files for implementation commit `0d6c39b8c785405d8575255cd208f55a8fba0bd3`. PR: https://github.com/bizmation/PredictionMarketLitigation/pull/45. Sprint story and shared gate-safety action are reconciled; overall Epic 3 acceptance remains rejected.

Residual risks: migration 0019 must accompany the eventual staging deployment; no remote migration or deployment was performed. Historical large-Run query cost needs measurement. Budget/replay/admission and live acceptance remain later corrective stories.

Files changed:
- `_bmad-output/implementation-artifacts/spec-3-29-make-publication-and-run-finalization-atomic.md` — Story specification, review record, and sprint tracking.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Story specification, review record, and sprint tracking.
- `migrations/0019_gate_assertions.sql` — Named CHECK assertion makes false guards roll back D1 batches.
- `src/pipeline/agents/draftAndReview.test.ts` — Regression/race coverage and truthful canonical-prior fixtures.
- `src/pipeline/agents/draftAndReview.ts` — Scope revision work to its owned Draft.
- `src/pipeline/ai/actionPolicy.ts` — Scope revision work to its owned Draft.
- `src/pipeline/gate/approval.test.ts` — Regression/race coverage and truthful canonical-prior fixtures.
- `src/pipeline/gate/approval.ts` — Atomic gate batch and explicit conflict mapping.
- `src/pipeline/gate/atomicGate.test.ts` — Regression/race coverage and truthful canonical-prior fixtures.
- `src/pipeline/gate/f1Apply.ts` — Canonical field CAS and docket identity guards.
- `src/pipeline/gate/yoloPolicy.test.ts` — Regression/race coverage and truthful canonical-prior fixtures.
- `src/pipeline/projector/evidence.ts` — Completion receipt derived from the successful Run transition.
- `src/pipeline/steering/submitTurn.test.ts` — Regression/race coverage and truthful canonical-prior fixtures.
- `src/pipeline/steering/submitTurn.ts` — Owned child evaluation and losing-admission conflicts.
- `src/pipeline/workflow/dailyRun.test.ts` — Regression/race coverage and truthful canonical-prior fixtures.
- `src/server.ts` — Authenticated conflict responses.
- `src/shared/api/adminApi.test.ts` — Regression/race coverage and truthful canonical-prior fixtures.
- `src/shared/db/repos/draftReadiness.test.ts` — Regression/race coverage and truthful canonical-prior fixtures.
- `src/shared/db/repos/draftsRepo.ts` — Persisted snapshot guards, current heads, and conditional revision ownership.
- `src/shared/db/repos/evidenceRepo.ts` — Completion receipt derived from the successful Run transition.
- `src/shared/db/repos/gateAssertions.ts` — Prepared assertion statement builder.
- `src/shared/db/repos/runsRepo.ts` — Transaction-time completion from persisted heads/outcomes.
- `src/surfaces/admin/ApprovalQueue.tsx` — Conflict refresh and Draft-scoped operator state.
- `src/surfaces/admin/SteeringPanel.mount.test.tsx` — Regression/race coverage and truthful canonical-prior fixtures.
- `src/surfaces/admin/SteeringPanel.tsx` — Conflict refresh and Draft-scoped operator state.
- `src/surfaces/admin/approvalQueue.mount.test.tsx` — Regression/race coverage and truthful canonical-prior fixtures.
- `src/test/failingDb.ts` — Deterministic barriers around real D1 operations.
