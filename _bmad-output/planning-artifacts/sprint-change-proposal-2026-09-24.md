---
project: PredictionMarketLitigation
date: 2026-09-24
workflow: bmad-correct-course
status: approved
mode: batch
scope: moderate
approach: direct-adjustment
epic: 3
baseline_commit: c630094aa235e9425f4fbd18ffde2a2ec842b084
---

# Epic 3 corrective change proposal

## 1. Issue summary

Epic 3's 25 original stories are implemented and merged, but the resumed retrospective rejected operational acceptance. Individual story completion and passing tests did not establish safe behavior across approval, evaluation, concurrent spending, and Workflow replay. The tests did not execute the actual Workflow entrypoint, and staging evidence did not demonstrate a new material Run through approval to published F1.

This is a correction to implementation and verification of existing requirements. The trigger is the 2026-09-24 reassessment in `../implementation-artifacts/epic-3-retro-2026-09-22.md`, particularly R1–R12 and R15–R18. Story 3.22's staging deployment exposed the distinction between accessible screens and observed pipeline acceptance; it did not cause all these defects.

Concrete examples from that review:

- A root Draft with null evaluation could be approved before evaluation, and a later evaluator update could change a decided Draft (R1).
- Concurrent gate decisions could strand Run status, publish a superseded parent, or overwrite a newer field value (R2–R4).
- Concurrent paid calls could pass the same remaining-budget check; unbounded output and separate accounting writes undermined the cap and displayed spend (R5–R7).
- Replay after Draft persistence could report a material Run as empty; configuration receipts could name a version different from the consumed configuration (R8–R9).
- Dispatch failures were treated as duplicates, cross-origin Run admission was non-atomic, and a foreign pagination destination could receive connector authorization (R10–R12). The latter is a code-path finding, not evidence of an observed credential leak.

The prior deployment and green CI remain valid evidence for what they checked. They do not close these findings. Nine existing actions remain open or in progress.

## 2. Impact analysis

**Epic 3:** Reopen the epic for corrective work, retain 3.1–3.25 as done, and add 12 bounded stories, 3.26–3.37. Twelve stories cover nine actions because gate safety, budget safety, and Workflow safety each need two distinct implementation units. This preserves history rather than retroactively rewriting completed stories.

**Epic 4:** Retain all seven planned stories and their scope. Add an entry dependency on accepted Epic 3 corrective evidence. No other epic is invalidated; no new epic is needed. Epic 4 implementation waits for this gate.

**Requirements:** Existing PRD FR8, FR10–12, FR14–15, FR17, FR19–20, FR22, FR24–25 already demand the relevant outcomes. No reduction in MVP scope or platform change is proposed. Multiple sequential Runs per date remain allowed. Completed `evals_not_run` with an explicit reason remains eligible for human review; evaluation in progress is distinct. YOLO remains constrained by the original escalation requirements.

**Code and data:** Approval repository and F1 publication need atomic guards; gateway calls need bounded reservations and idempotent settlement; Workflow packaging needs durable replay/config handling; admission needs a shared active-date claim; connector pagination needs credential boundaries. Schema changes may be needed for evaluation state, reservations, and active admission. Each build must validate migration compatibility and actual D1/Workflows behavior before choosing SQL or runtime mechanisms.

**UI:** Existing queue, pending band, masthead, and Evidence screens need truthful readiness, conflict, pending-count, and cost states. No new major screen or navigation redesign is required.

**Deployment:** Continue using the existing pml-build Worker/D1 and build/ops-build hosts. Production remains on its existing configuration. `npm run deploy` is prohibited; the scoped staging process is `npm run deploy:build`. A later staging release must identify the exact merged commit and deployed version.

**Document inputs:** PRD at `prds/prd-PML-2026-06-18/prd.md`, `epics.md`, `architecture.md`, `ux-brief-pack.md`, sprint status, resumed retrospective, and the prior August 9, September 17, and September 23 change proposals. No root AGENTS.md or standalone planning spec was found. Approved steering requirements F9/FR46–50 are in the August proposal but absent from the base PRD; reconcile their canonical location without inventing new scope.

## 3. Recommended approach

| Option | Effort | Risk | Assessment |
|---|---|---|---|
| Direct adjustment | High overall; bounded stories below | Medium after targeted regression coverage | Recommended. Repairs the failed invariants while retaining useful merged work. |
| Broad rollback | High | High | Not recommended. Reverting staging/copy/budget snapshots does not fix the older concurrency and replay defects, and loses useful observability. |
| Reduce/redefine MVP | Medium planning effort; defects remain | High | Not recommended. Removing approval, spend caps, or durable replay would weaken core requirements rather than satisfy them. |

The change scope is **moderate** because it reorganizes the backlog within the existing product and architecture. Implementation effort is substantial. Epic 4 moves behind the corrective work and staging acceptance; no calendar promise is made without sizing the implementation specs and resolving the provider cost policy. The highest uncertainty is enforcement of a conservative provider cost bound and transactional behavior under the deployed runtime.

Recommended execution is sequential 3.26 → 3.37. Dependencies below also identify which prerequisites are technical. Do not execute live paid acceptance before all relevant safety fixes and orchestration tests pass.

## 4. Detailed changes

### A. New stories in epics.md

**OLD:** No corrective stories after 3.25; nine actions exist only in action tracking.

**NEW:** Append the following story definitions to Epic 3 before Epic 4. Each is approved for the backlog, not already implemented. Acceptance criteria are requirements for its build spec. Each implementation story includes targeted regression evidence, review, passing required CI, and a merged PR before it is marked done.

#### 3.26 — Reconcile canonical Epic 3 planning

As a maintainer, I can find all approved Epic 3 requirements in canonical planning documents.

Effort: Low. Dependencies: none. Covers R17.

- Replace the 3.14–3.21 placeholder in epics.md with eight full story entries, preserving the approved criteria from the August 9 and September 17 proposals and their implementation specs. Resolve differences through explicit accepted decisions, not inferred implementation behavior.
- Reconcile the approved F9/FR46–50 steering amendment into the PRD and its traceability, and link its existing UX additions. Preserve approved scope.
- Add the corrective stories and the architecture/UX amendments below; keep authoritative status tokens `awaiting`, `stopped`, and `run.stopped` consistent.
- Verify every 3.1–3.37 ID appears once in canonical epic planning and sprint tracking after approved backlog application. Record source references and any unresolved document discrepancy.

#### 3.27 — Constrain connector pagination credentials

As an operator, connector pagination cannot forward credentials to an unintended destination.

Effort: Low. Dependencies: 3.26 for planning. Covers R12.

- Validate the initial and every next-page URL against the configured exact HTTPS API origin before attaching authorization. Resolve permitted relative links safely.
- Prevent automatic redirects from forwarding authorization to foreign origins; validate redirect destinations if redirects are supported.
- Reject foreign, downgraded, malformed, and deceptive URLs with scrubbed evidence. Never include tokens in errors or public receipts.
- Tests cover valid same-origin pagination, relative next links, hostile next links, and cross-origin redirects, asserting the unauthorized destination receives no credential-bearing request.

#### 3.28 — Enforce evaluation readiness and sealed Drafts

As a reviewer, I can act only on a completed, eligible Draft and my decided artifact remains immutable.

Effort: Medium. Dependencies: 3.26. Covers R1.

- Persist/derive an unambiguous evaluation lifecycle. A null summary during processing cannot mean ready. Safely classify legacy rows without fabricating completed evaluations.
- Gate routes enforce readiness server-side. Completed explicit `evals_not_run` with its reason remains human-reviewable under FR24; YOLO eligibility remains stricter.
- Evaluator writes conditionally target eligible undecided Drafts. Evaluation and decision races cannot mutate a sealed artifact.
- Pause evaluation in an integration test, attempt approval, then release evaluation. Assert no early F1 write and no post-decision mutation. Test explicit not-run and legacy states.
- Queue/pending views display evaluation in progress and unavailable actions accessibly.

#### 3.29 — Make publication and Run finalization atomic

As a reviewer, concurrent decisions cannot publish stale or superseded content or strand a completed Run.

Effort: High. Dependencies: 3.28. Covers R2–R4.

- Validate current pending outcome, readiness, and latest eligible revision tip at the same atomic boundary as decision and publication. Revision insertion and approval share a consistent concurrency rule.
- Compare expected prior values for every changed field, for both docket and generic updates. One mismatch aborts the entire publication, including decision, F1 writes, and publication receipts.
- Derive final Run state from current committed sibling outcomes, including simultaneous final decisions. Repeating a decision cannot duplicate publication.
- Deterministic tests overlap sibling decisions, parent approval/child insertion, and competing field updates; verify all-or-nothing state and receipts.
- Conflicts return actionable refresh guidance; the UI preserves unsent reviewer edits. Validate the transactional mechanism using the actual database interface rather than relying only on a mocked batch.

#### 3.30 — Define and enforce bounded provider cost

As an operator, each admitted paid request has a conservative, explainable cost bound.

Effort: Medium. Dependencies: 3.26. Covers R6; contract prerequisite for 3.31.

- Replace the input-only heuristic as the admission authority. Document supported provider/model pricing inputs, units, version/effective provenance, input bound, output limit, and conservative integer-cent rounding.
- Set a provider-enforced output limit. Include all supported billable dimensions in the bound; fail closed for unsupported pricing or a request whose maximum liability cannot be bounded.
- Distinguish estimated/reserved amounts from measured provider cost in internal records and public projections. Do not label a heuristic as an actual charge.
- Preserve the existing configured ceiling, including the 500-cent seed; do not increase budgets to make tests pass. Patrick reviews the concrete cost policy as part of this story's spec.
- Deterministic tests cover maximum output, rounding, insufficient remaining budget, stale/unknown pricing, and provider usage discrepancies. Verify current provider capabilities from primary documentation during implementation.

#### 3.31 — Reserve and settle paid calls atomically

As an operator, concurrent calls and retries cannot spend the same available budget twice or understate Run spend.

Effort: High. Dependencies: 3.30. Covers R5, R7.

- Atomically reserve the bounded liability before dispatch against every configured Run/period ceiling. Available balance accounts for outstanding reservations.
- Use stable logical-call identities and persist attempt/outcome evidence. Retries after checkpoint or response loss cannot blindly issue another paid call; use provider idempotency where supported or explicitly reconcile an uncertain outcome.
- Settle ledger, reservation, and Run display totals atomically, or derive display totals from one authoritative accounting source. Repeated settlement is idempotent.
- A failed/unknown provider outcome cannot blindly release reserved funds when a charge may have occurred. Define reconciliation and explicit over-bound anomaly behavior; stop further paid dispatch on an unresolved cap breach.
- Test two calls competing for the last budget, overlapping Runs sharing a period limit, interruption at every accounting boundary, duplicate settlement, and uncertain provider completion. Assert public totals agree with the enforcement authority.

#### 3.32 — Recover durable packages and pin consumed configuration

As an operator, Workflow replay preserves material work and truthful source provenance.

Effort: Medium. Dependencies: 3.28, 3.31. Covers R8–R9.

- On replay, recover this Run's persisted Drafts and evidence before deciding material/empty status. Drafts from another Run cannot be mistaken for this Run's package.
- Inject interruption after Draft insertion and before the Workflow checkpoint; replay must review the persisted Draft, retain its identity, and avoid duplicate paid work/publication.
- Pin the source configuration consumed by packaging, including its recorded version. Changes after attach apply to a later Run; receipts must identify the actual consumed configuration.
- Test configuration changes between attach and packaging and during replay. Preserve partial/all-source failure evidence; no failed package is silently relabeled empty.

#### 3.33 — Make Run admission and dispatch failures explicit

As an operator, competing triggers cannot start duplicate active work or silently lose a dispatch.

Effort: Medium. Dependencies: 3.26. Covers R10–R11.

- Establish atomic active-date admission shared by scheduled, manual, and catch-up paths. At most one admitted active Run per date proceeds; sequential Runs on the same date remain allowed by FR8.
- Define claim lifecycle and recovery after failed dispatch or interruption. Do not leave an unexplained permanent lock or start a second active provider workload.
- Recognize only confirmed duplicate-instance errors as duplicates. Other creation errors produce durable, scrubbed failure evidence and an actionable result/retry path.
- Concurrent-origin and injected-create-failure tests prove one admitted active instance, visible failures, safe retries, and later same-date admission after terminal completion.

#### 3.34 — Test the executing DailyRunWorkflow

As a maintainer, regression tests fail when real orchestration stops forwarding sources or dispatching review.

Effort: Medium. Dependencies: 3.27–3.33. Covers R15.

- Invoke `DailyRunWorkflow.run` through a test-compatible Workflow binding/runtime with real internal helpers and database persistence, replacing only external provider/source effects with deterministic fixtures.
- Cover material, empty, all-source failure, partial failure, budget stop, and replay paths. Assert persisted evaluated awaiting Drafts and public Evidence, not just helper return values.
- Exercise the concurrency failure schedules from the safety stories without replacing the actual admission/accounting/gate implementation with stubs.
- Demonstrate that removing registry forwarding or draft-review dispatch makes the relevant test fail; restore code after the check. Add this suite to required CI.

#### 3.35 — Drive apex pending copy from public Draft data

As a reader, the masthead reflects the pending Drafts I can inspect.

Effort: Low. Dependencies: 3.28. Covers R16 / existing action 13 remainder.

- Derive count and definition of pending from the same public data/eligibility contract as the pending band. Avoid independent inconsistent counts.
- Render loading, zero, positive, error, and stale states honestly; a failed fetch cannot display an asserted zero.
- After approval/rejection/revision, refresh or invalidate both surfaces consistently. Test transitions, singular/plural copy, and accessible status announcements.
- Preserve the copy cleanup already delivered by 3.24; close action 13 only when the live count is verified.

#### 3.36 — Verify the corrected staging Run and gateway

As an operator, I have deployment-specific evidence that the corrected runtime and paid gateway work.

Effort: Medium, operational. Dependencies: 3.26–3.35 merged and required CI green. Covers existing action 17 remainder / R18.

- Deploy the merged corrective commit through the staging process; record commit, Worker version, migrations, target hosts, and time. Verify production behavior remains unchanged.
- Record a new post-deployment Run, frozen budget/source config, public Evidence, and authenticated OpenRouter gateway success. Document the actual successful route and status without tokens or credential-bearing headers.
- Before a paid call, establish the authorized staging budget and cost policy. Planning approval alone is not an instruction to incur unspecified charges.
- A pre-deploy Run, empty static screen, or fabricated fixture is insufficient. If credentials, provider availability, or budget block execution, record the precise blocker and leave this story/action incomplete.

#### 3.37 — Prove the live governed loop and reassess Epic 3

As Patrick, I can trace a real docket change from source through named approval to published staging F1.

Effort: Medium, operational. Dependencies: 3.36. Covers live acceptance action / R18.

- Use a real material docket event through the corrected staging connector and gateway. Capture Run, source, Draft/revision, evaluation outcome, and public Evidence identifiers.
- Present the actual candidate for the named reviewer's decision. Record authenticated approval of that candidate, exactly one F1 publication, final Run state, and matching public lineage. Approval of this plan is not approval of unknown legal content.
- Assert canonical F1 is unchanged before approval and matches the approved artifact afterward. Verify relevant tracker/ops views and accounting consistency.
- Reuse the same Run for 3.36 and 3.37 when it satisfies both sets of criteria; do not duplicate paid work for reporting. An empty Run cannot satisfy this material acceptance story.
- Run a fresh/resumed Epic 3 retrospective against the final merged and deployed state. Close the nine actions only with linked evidence. Mark Epic 3 done and release Epic 4's entry gate only if acceptance succeeds; retain any new blockers visibly otherwise.

### B. Existing action mapping

Each row identifies the existing action; do not create replacement actions or close one just because its story was planned.

| Existing action ID | Proposed stories | Closure evidence |
|---|---|---|
| epic-3-cc-item-1-backfill-epics-md-stories-3-14-to-3-21 | 3.26 | Canonical entries reconciled to approved sources |
| epic-3-retro-item-13-retire-apex-copy-that-says-the-daily-pip | 3.35 | Live count and honest loading/error behavior |
| epic-3-retro-item-17-deploy-current-main-to-pml-build-after-t | 3.36 | Corrected deployment plus new Run and authenticated gateway success |
| epic-3-retro-gate-transaction-safety | 3.28, 3.29 | Readiness, immutability, concurrency and atomic-publication regressions |
| epic-3-retro-paid-budget-accounting-safety | 3.30, 3.31 | Approved bound policy and concurrent/idempotent accounting evidence |
| epic-3-retro-workflow-replay-admission-safety | 3.32, 3.33 | Replay/config and cross-origin admission/failure evidence |
| epic-3-retro-connector-pagination-origin | 3.27 | Destination and redirect credential-boundary tests |
| epic-3-retro-executing-workflow-regression | 3.34 | Entrypoint execution and regression sensitivity in CI |
| epic-3-retro-live-governed-loop-acceptance | 3.37 | Real material Draft → named decision → staging F1 → public Evidence |

R13 (late RECAP arrival/backfill policy) and R14 (failed-revision retry/abandon policy) retain their explicit deferred dispositions. They are not silently added to these stories or declared fixed. Revisit if new acceptance evidence makes either a blocker.

### C. Sprint tracking and epic acceptance

**OLD:** `epic-3: done`; 3.1–3.25 done; `epic-3-retrospective: done`; nine unresolved actions.

**NEW upon approval:** `epic-3: in-progress`; keep 3.1–3.25 done; insert 3.26–3.37 as `backlog` using the titles above. Keep the completed retrospective record and its rejected verdict intact, with an explicit note that retrospective completion does not mean epic acceptance. Add story mappings to the existing action notes without changing their current closure status. Add Epic 4's acceptance dependency in epic context/planning.

**Rationale:** Tracking must show remaining implementation without erasing completed work or overwriting historical acceptance evidence. Builds promote stories using the normal BMAD lifecycle. 3.37 supplies the final acceptance disposition.

### D. PRD amendment

**Location:** FR19 / FR22 / FR24 implementation acceptance notes, plus approved F9 reconciliation in 3.26.

**OLD:** These requirements specify budget ceilings, durable retries, and evaluation or explicit not-run evidence, without an explicit cross-story acceptance clause.

**NEW proposed note:** “Epic 3 acceptance requires server-enforced evaluation readiness and immutable decided Drafts; atomic eligibility, state comparison, publication and completion; conservative reservation of paid liability with consistent accounting; replay preserving material work and consumed configuration; and observed staging lineage from a real source through named approval to F1. Explicit completed evals_not_run remains human-reviewable under FR24. Multiple sequential Runs per date remain permitted under FR8.”

**Rationale:** Clarify verification of existing promises; no new feature or relaxed gate. Preserve original requirement text.

### E. Architecture amendment

**Location:** Add dated corrective invariants under data consistency, gateway, and Workflow execution, cross-linked from the existing component descriptions.

**OLD:** Existing descriptions rely on durable steps, centralized gateway checks, and sole-gate F1 publication without specifying all concurrent boundaries identified in the retro.

**NEW:** “Approval and revision changes must share an atomic eligibility boundary. Every accepted field update compares its expected previous value at publication. A decided Draft is immutable. Paid dispatch requires durable bounded reservation; settlement and public totals share an authoritative accounting source. Unknown paid outcomes retain conservative liability until reconciled. Workflow replay recovers persisted Run artifacts and consumes pinned configuration. All Run origins share active-date admission. Connector credentials are attached only after validating the destination, including redirects.”

Implementing stories record concrete schema/transaction decisions and validate them against the actual platform. Update the existing pipeline sequence diagram to show claim → pinned config/package recovery → reserve/call/settle → evaluation completion → guarded decision/F1 commit; mark retry boundaries. This is an amendment to the existing Cloudflare stack, not a new orchestration platform.

### F. UX amendment

**Location:** B1/B2 Run and Evidence, B3 pending Drafts, C1 review queue, and apex masthead behavior.

**OLD:** Existing screen contracts show status, spend, evaluation badges, and decisions but do not fully distinguish the newly identified intermediate/conflict states; masthead lacks a live count contract.

**NEW:** “Evaluation in progress is visible and decision controls are unavailable until the server reports eligibility. Completed explicit evals_not_run shows its reason and permits authorized human review. Stale or superseded decisions explain the conflict, offer refresh, and preserve unsent edits. Cost projections distinguish reserved/estimated liability from recorded spend. Pending count shares its source with the pending band and represents loading, error and stale states without asserting zero.”

Keep current screen hierarchy and accessibility conventions. No new wireframe is needed; annotate the existing screens with these states and transitions.

## 5. Implementation handoff and success criteria

**Scope:** Moderate backlog reorganization; high total implementation effort.

- **Product Owner / planning role:** Apply approved story definitions and status/action mappings; reconcile canonical planning through 3.26. Keep deferred decisions and original completion history visible.
- **Developer role:** Build 3.27–3.35 with focused failure/concurrency tests, appropriate migrations, reviews, and required CI. Commit, push, create PRs, and merge in the authorized repository workflow. Each story's evidence must refer to its actual merged change.
- **Architect role within the affected builds:** Validate transaction semantics and provider cost enforcement; record bounded technical decisions. Escalate an unachievable invariant rather than substituting a weaker claim.
- **Agent + Patrick:** Execute 3.36–3.37 with explicit cost-policy/budget scope and the named decision on the actual Draft. These can share operational evidence.
- **Retrospective role:** Reassess acceptance on the final state, retain the prior rejected result as history, and identify any remaining blockers.

Success means all nine action rows have evidence-backed closure, all new implementation changes are merged with passing required checks, the corrected staging deployment has a verified material governed loop, and the retrospective accepts Epic 3. Merely creating stories, reaching a zero pending count, deploying successfully, or passing helper tests is insufficient.

Approval of this proposal authorizes applying the backlog/document changes and handing off this corrective sequence. No code, infrastructure, paid call, or content publication has been performed by this proposal-writing step.

## 6. Workflow checklist and approval record

- [x] 1.1–1.3: Trigger, problem and evidence identified from the resumed retrospective and current action ledger.
- [x] 2.1–2.5: Epic 3 remains viable; corrective stories added in proposal; Epic 4 dependency explicit; no new or obsolete epic.
- [x] 3.1–3.4: PRD, architecture, UX, data/runtime, tests, deployment and tracking impacts analyzed. Optional root AGENTS.md and standalone planning spec absent.
- [x] 4.1–4.4: Direct adjustment selected; rollback and MVP reduction evaluated and rejected with effort/risk rationale.
- [x] 5.1–5.5: Issue, impacts, approach, specific edits, MVP implications and role handoff documented.
- [x] 6.1–6.2: Nine actions mapped; proposed IDs/dependencies and historical status distinction checked.
- [x] 6.3: Patrick explicitly approved on 2026-09-24: “Yes approve”.
- [x] 6.4: Applied 3.26–3.37 to epics.md and sprint-status; reopened Epic 3 and added Epic 4 acceptance dependency. Existing action states retained.
- [x] 6.5: Recorded Product Owner/Developer handoff and operational/retrospective responsibilities in epic-3-context.md; next build is 3.26.

Mode: batch. Approval: Patrick, 2026-09-24 (“Yes approve”). Applied the canonical corrective backlog, sprint/action mappings, acceptance dependency, and PRD/architecture/UX normative amendments. Historical story/F9 reconciliation remains the implementation work of 3.26. All new stories remain backlog; no corrective implementation, paid calls, deployment or content publication occurred during this planning handoff. Correct Course workflow complete; workflow.on_complete resolved empty.


### Story 3.26 reconciliation record — 2026-09-24

The canonical backfill is implemented: epics.md now defines 3.14–3.21 alongside 3.1–3.37; PRD F9/FR46–50, epic coverage, and UX B8/C4 are integrated. Original approved acceptance text is retained, with later implementation decisions and corrective supersession explicitly annotated. Source-parity and uniqueness checks pass. This closes the document gap only; the rejected retrospective and other eight corrective actions remain unchanged. Review/merge completion is recorded by the story build and sprint tracking.
