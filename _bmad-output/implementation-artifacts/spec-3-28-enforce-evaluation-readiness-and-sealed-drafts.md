---
title: 'Enforce evaluation readiness and sealed Drafts'
type: 'bugfix'
created: '2026-09-24'
status: 'done'
route: 'dispatch'
baseline_commit: 2f7e009fec60a7783f4daf5669ff9b2e1c15b7e3
baseline_revision: 2f7e009fec60a7783f4daf5669ff9b2e1c15b7e3
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Root Drafts with null evaluations are currently approvable. Evaluation can subsequently overwrite decided content. Queue and Evidence displays confuse unfinished evaluation with a completed, explicitly recorded not-run result.

**Approach:** Derive readiness from persisted evaluation and completion evidence; expose unavailable Drafts without offering decisions. Make evaluator writes conditional so a decision seals the artifact. Preserve completed explicit `evals_not_run` for human review.

## Boundaries & Constraints

**Always:** Distinguish pending evaluation, completed evaluation (including explicit not-run with a nonempty reason), and legacy unavailable evidence. Null never means complete. Readiness requires a summary, recorded guardrail completion, and completed revision receipt for revised Drafts; a running Run remains unavailable to decisions. Missing legacy evidence stays unavailable; do not manufacture summaries, receipts or timestamps. A stopped Run's completed not-run Draft remains human-reviewable. YOLO still excludes not-run and all existing escalation categories.

Show the latest undecided chain head, including unavailable heads; never offer its superseded ancestor. Separate visibility from eligibility. Block approve/edit/reject and revision on unavailable Drafts in server routes and keyboard/click handlers. Preserve read-only history and unrelated steering controls.

Evaluator body/diff/confidence/summary writes may only complete eligible undecided, unevaluated rows; concurrent duplicate results cannot replace a completed result. Guardrail stamping cannot mutate decided rows. A losing write must not leave a contradictory evaluation receipt. Preserve original/edited text and frozen publication lineage.

**Never:** Deploy, use paid models, mutate remote data, backfill fabricated evaluation evidence, change budgets, or implement 3.29's sibling finalization/revision-insertion/field-CAS repairs. Failed-revision recovery remains deferred; display incompleteness honestly without implying a retry is running.

## I/O & Edge-Case Matrix

| Scenario | State | Expected behavior | Error |
|---|---|---|---|
| Processing | Root evaluation paused; Run running | Visible pending/in-progress state; no A/E/R request or F1 write | Server readiness conflict |
| Revision | Child incomplete; parent evaluated | Child visible with unavailable actions; ancestor blocked | Readiness conflict |
| Explicit not-run | Completed summary with reason and guardrail completion | Human review allowed; YOLO excluded | Existing policy |
| Legacy | Null/missing completion evidence | Evaluation unavailable; history readable; no fabricated results | Readiness conflict |
| Late evaluator | Result prepared before another result/decision wins | Sealed fields and receipts unchanged | Explicit no-op/conflict |

</frozen-after-approval>

## Code Map

- `src/shared/db/repos/draftsRepo.ts`: `isDraftReady` incorrectly special-cases roots; `pendingTips` also controls visibility; review/guardrail UPDATEs currently lack outcome guards.
- `src/shared/schemas/run.ts`: DraftRecord/EvalSummary projection; reuse `draft.evaluated`, `guardrails.passed/failed`, and `draft.revised` evidence.
- `src/pipeline/agents/draftAndReview.ts`: guard selection, `persist` and `persistToolDeny` writes/receipts together.
- `src/pipeline/ai/actionPolicy.ts`, `ai/gateway.ts`: final guardrail evidence and ineligible stamping. `workflow/dailyRunSteps.ts` finishes review before Run completion; `steering/submitTurn.ts` completes revisions after guardrails. Preserve this ordering.
- `src/pipeline/gate/approval.ts`, `src/server.ts`: enforce readiness and return a distinct readiness conflict; retain ordinary already-decided semantics.
- `src/shared/api/publicRouter.ts`, `src/surfaces/admin/ApprovalQueue.tsx`, `SteeringPanel.tsx`, `src/surfaces/ops/PendingDrafts.tsx`, `EvidenceDetail.tsx`: align feeds, guards and controls.

## Tasks & Acceptance

**Execution** (paths resolved from Code Map):
- [x] Schema/repository and new `src/shared/lib/draftReadiness.ts`: derive lifecycle from stored facts; separate visible heads and eligible tips without a migration.
- [x] Evaluator, action policy and gateway: condition every mutation and completion receipt at execution; preserve safe retries.
- [x] Gate, server, revision and workflow: enforce readiness and preserve explicit not-run review.
- [x] Public router and listed surfaces: align runtime guards, labels, accessible explanations, click/keyboard eligibility and readiness-conflict messages; retain unsent edits.
- [x] Test paused-provider/conditional-write races with real D1; cover revision, legacy, not-run and visibility in evaluator/gate/steering/API suites; update fixture receipts.
- [x] Extend `src/surfaces/admin/approvalQueue.mount.test.tsx` and render suites: unavailable actions, completion, human not-run controls.

**Acceptance Criteria:**
- Given paused evaluation, when HTTP and UI decisions are attempted, then no F1/decision write occurs; completion enables eligible review only after required receipts.
- Given a decided Draft, when a prebuilt evaluator or guardrail statement executes, then all sealed fields remain identical and no conflicting completion evidence appears.
- Given legacy and explicit not-run fixtures, when projected and reviewed, then legacy gaps stay unavailable while completed not-run remains human-reviewable and YOLO-ineligible.
- Given an unfinished revision, when queue, pending band and Evidence render, then all agree on its unavailable state and no ancestor becomes actionable.

## Implementation Notes

Implemented persisted readiness projection, guarded evaluator writes/receipts, visible unavailable heads, API conflicts and UI controls. Matrix coverage: `src/shared/db/repos/draftReadiness.test.ts` covers all five rows; paused-provider coverage in `draftAndReview.test.ts`, HTTP coverage in `adminApi.test.ts`, mounted action/transition/edit coverage in `approvalQueue.mount.test.tsx`, and revision history rendering in `evidenceDetail.test.tsx`. Final local verification after review fixes: 1107 tests across 49 files; format/lint/TypeScript and diff checks pass. Eight unique patch groups addressed (including two duplicate findings), two pre-existing issues and one unverified performance concern recorded in deferred work.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence and route |
|---|---|---|
| B1 pending refresh | medium | Queue fetch depends only on reload/mount; disabled actions leave completion stale. Patch: explicit refresh control and fetched transition test. |
| B2 edit ownership | high | Index selection and global edit state survive a conflict replacing the head. Patch: bind retained edits to Draft identity; never apply them to replacement. |
| B3 contradictory guardrails | medium | Baseline actionPolicy already preloads recorded IDs and inserts pass without statement-time absence check; gateway can deny concurrently. Defer pre-existing audit race. |
| B4 serialized CAS | high | Parsed summary serialization need not equal stored valid JSON; failure evidence can outlive a skipped stamp. Patch: compare original raw JSON. |
| B5 explicit no-op | false | Execution-time SQL predicates explicitly produce no-op writes and receipts; private persistence has no caller depending on an applied result. Sealing/race tests verify the observable no-op. |
| B6 ancestor label | medium | All null-outcome ancestors get Awaiting review despite head-only eligibility. Patch: historical label for non-head ancestors. |
| B7 stopped revision control | medium | Baseline permits stopped Draft decisions but revision server requires awaiting; UI previously offered revisions on those same roots. Defer pre-existing distinction between decision and revision eligibility. |
| B8 receipt query cost | maybe-false | Reads add correlated receipt lookups but run_id index bounds them; no representative timing demonstrates user-visible slowdown. Defer unverified medium performance risk pending volume/query-plan benchmark. |
| B9 privacy regression | low | Scoped-builder test still checks allowed body and excludes private fields; changed integration test now skips decided rows. Patch an eligible integration fixture to retain the old end-to-end assertion. |
| B10 not-run publication coverage | medium | New stopped fixture only rejects; approve/edit publication remains unverified for that state. Patch parameterized publication tests. |
| E1 edit ownership | high | Same verified replacement-head state as B2; grouped into that patch. |
| E2 serialized CAS | high | Same raw-versus-reserialized comparison as B4; grouped into that patch. |
| V1 evaluation receipt coverage | medium | Pre-verified missing independent evaluated-receipt condition. Patch deletion-only case with no decision/F1 writes. |
| V2 explicit not-run Evidence | medium | Pre-verified missing rendered not-run reason assertion. Patch distinctive summary/reason case. |

All three layers completed. The platform refused another context-free reviewer at its thread limit; the verification layer reused an idle reviewer whose prior work concerned unrelated planning documents, with only the diff and verification instructions supplied for this review.


## Verification

2026-09-25: `npm test` passed 1107 tests/49 files; `npm run check` and `git diff --check` passed. Review patches also passed 132 targeted tests before full verification. CI pending PR creation.

Run targeted tests, `npm run check`, `npm test`, and `git diff --check`; require passing CI. Medium cross-layer footprint, no intent gaps or irreversibles. Gate-safety action stays open until 3.29.
