---
title: '3.32 — Recover durable packages and pin consumed configuration'
type: 'bugfix'
created: '2026-10-03'
status: 'done'
baseline_revision: '55c250d7e4fcaadd5d645152e370cd6bbc3b05b2'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** A packaging retry can label a material Run empty because connector deduplication hides its already persisted Drafts. Source configuration can change after attach, making the recorded version disagree with the consumed list.

**Approach:** Recover the exact Run's durable package and source outcomes, and freeze the actual source configuration with its version at attach. Resume interrupted packaging and review without duplicating Drafts, paid work, or publication.

## Boundaries & Constraints

**Always:** Preserve exact Run/Draft identity, global connector deduplication, failure evidence, evaluation readiness/sealing, 3.31 accounting identities and the Approval Gate. A source snapshot includes the validated actual poll-source list and recorded version, including version 0. Later edits affect later Runs. Material with partial source failure proceeds to review with failure evidence; zero material with failure is failed; only completed successful no-material collection is empty. Unexpected persistence/checkpoint interruption remains replayable. Completion receipts must reflect an actual durable transition. Existing terminal decisions remain sealed.

**Never:** Count another Run's Drafts, treat early fetched evidence as completed packaging, silently substitute current settings for unprovable historical configuration, swallow interruption into empty success, make paid/live calls, deploy, refresh pricing, or perform remote migrations. Run admission/dispatch changes (3.33), broad Workflow service coverage (3.34), late-arrival policy, failed-revision recovery, and freezing unrelated model/guidance/case configuration are outside scope.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Durable material | Draft stored, packaging checkpoint lost | Same Run and Draft recovered and reviewed; never empty | Retry unfinished work without duplicate identity |
| Partial writes | Several entities, interruption after an insert before evidence/completion | Resume remaining entities; complete truthful creation/source evidence once | No early fetched receipt may skip missing entities |
| Run isolation | Only another Run has persisted Drafts, including same date/origin | Current Run never counts/reviews them or substitutes its identity | Invalid/missing attached identity fails explicitly |
| Pinned config | Change list/name/URL/tier/version after attach and again before replay | Original Run consumes original snapshot and reports its version; next Run consumes newest | Cover version 0; reject invalid durable snapshot |
| Snapshot race/legacy | Competing attach or old Run missing snapshot | First durable snapshot wins; recover only provable historical config | Unprovable configuration is explicit refusal, never fabricated provenance |
| Partial failure | Material source plus failed sibling, checkpoint lost | Review material; retain failure details and consumed source identity | Preserve generic failed result and connector exception evidence |
| Total failure | No material, all sources fail, including fetched failed result | Remains failed on replay; no run.empty receipt | Failure cannot become empty after dedup/retry |
| True empty | Completed sources return no material | Empty once, zero paid calls | Nonfailure skips remain nonfailure |
| Review/publication replay | Checkpoint lost after durable review or YOLO publication | Same evaluation/paid operations/charges/decision/publication; no extra provider calls | Pending/uncertain accounting never retries paid effects blindly |

</intent-contract>

## Code Map

- `src/pipeline/workflow/dailyRun.ts` — `DailyRunWorkflow.run` near 223 coordinates attach/package/review; current malformed-ID fallback can choose a different same-origin Run. Preserve exact attached identity and terminal replay behavior.
- `src/pipeline/workflow/dailyRunSteps.ts` — `ensureRun` records only version; `monitorAndPackage` rereads effective config and counts fresh returns. `packageDailyRun/reviewDailyRun` swallow persistence exceptions; `finishEmpty/finishAwaiting` can append receipts after a declined transition.
- `src/pipeline/connectors/connector.ts` — deterministic Draft IDs/INSERT OR IGNORE; fetched receipt precedes insert and creation evidence. Generic `SourceItem.failed` currently is not persisted. Need durable completion distinct from fetched evidence.
- `src/pipeline/connectors/courtListener.ts` — `seenEventIds` near 233 deduplicates all Runs/published events; KEEP this behavior while recovering this Run separately.
- `src/shared/db/repos/draftsRepo.ts`, `evidenceRepo.ts`, `pipelineConfigRepo.ts` — reuse exact `listByRun`, validated source lists and immutable nonzero config history. Version 0 alone cannot reconstruct an old compiled seed. Add a focused snapshot/package repository and additive migration after 0021 if needed.
- `src/pipeline/projector/evidence.ts` — `appendStmt` supports scrubbed evidence in D1 batches; reread winning persisted values after first-write races.
- `src/pipeline/agents/draftAndReview.ts` — exact-Run queries, sealed/evaluated skips and stable paid operation keys already support recovery. KEEP 3.28/3.31 authority; inspect but avoid unrelated redesign.
- `src/pipeline/workflow/dailyRun.test.ts`, `vitest.config.ts`, `wrangler.test.jsonc` — current tests cover helpers, not entrypoint; local workerd/D1 available, Workflow binding omitted. Add focused `DailyRunWorkflow.run` execution with deterministic checkpoint-loss harness and injected external effects while keeping actual orchestration/repos/connectors/review/accounting/gate.
- `_bmad-output/planning-artifacts/epics.md` Story 3.32 and `epic-3-retro-2026-09-22.md` R8/R9 are read-only source requirements. Story 3.31 implementation is the baseline.

## Tasks & Acceptance

**Execution:**
- `migrations/0022_*.sql`, `src/shared/db/repos/*` — persist immutable Run source snapshot and durable per-source package completion/outcomes; preserve legacy evidence truthfully and exact-Run recovery.
- `src/pipeline/connectors/connector.ts` — make Draft/creation evidence atomic or safely repairable, persist explicit failure outcomes, and finish source packaging only after intended writes complete. Retries must not lose later entities.
- `src/pipeline/workflow/dailyRunSteps.ts`, `dailyRun.ts` — use snapshot, recover durable material/evidence, classify aggregate correctly and make transition receipts truthful; allow persistence interruptions to replay.
- `src/pipeline/workflow/dailyRun.test.ts` and focused connector/repository tests — execute every matrix row, including real entrypoint checkpoint loss, D1 persisted state and fake-provider counters. Test both HITL recovery and YOLO publication replay with real gate/accounting behavior.

**Acceptance Criteria:**
- Given lost packaging/review checkpoints, when the actual Workflow entrypoint reexecutes against local D1, then its stable Run reaches the correct review/terminal state and persisted identity, provider count, accounting and publication remain idempotent.
- Given source settings edited after attach, when packaging and replay execute, then durable source/evidence records identify the actual frozen inputs and later Runs consume later settings.
- Given a failed package or failed sibling, when replay occurs, then public evidence preserves failure provenance and no false empty receipt is emitted.

## Spec Change Log

## Review Triage Log

### 2026-10-03 — Review pass
- verdicts: 17 findings — high 1, medium 10, low 0, false 6, maybe-false 0
- findings (layer return order; individual verdicts assigned before grouping):
  - `[medium]` `[patch]` Blind 1: connector D1 interruption becomes durable source failure — CourtListener listDockets/pollDocket perform D1 reads; observe catches them as generic errors. Added SourcePersistenceError around CourtListener D1 reads and rethrow in observe; five executing-entrypoint read-fault regressions pass.
  - `[medium]` `[patch]` Blind 2: duplicate source names accepted before snapshot rejects — PollSourcesSchema/appendVersion accept the state, while snapshot validation blocks subsequent Runs. Moved uniqueness into shared PollSourcesSchema; the rejected-history-write regression passes.
  - `[false]` `[reject]` Blind 3: arbitrary runConnector inputs bypass the snapshot — production monitorAndPackage first requires a validated snapshot and iterates only its sources; no production caller supplies absent/mismatched inputs. Direct connector unit tests intentionally exercise the lower-level adapter without a Workflow attach. No observed runtime provenance bypass.
  - `[false]` `[reject]` Blind 4: wrong observation version accepted — the production writer derives version from the immutable Run snapshot; replayed observation and snapshot cannot be changed by application writes. The alleged wrong-version state requires external SQL corruption, not a demonstrated application path.
  - `[false]` `[reject]` Blind 5: malformed entities strand collection — production CourtListener validates entries and constructs the EntityChange shape internally, including nonempty body and typed fields; no reachable malformed entity was demonstrated. Loud rejection of a violated internal typed contract is not a verified source-failure regression.
  - `[medium]` `[patch]` Blind 6: no executing CourtListener dedup recovery regression — checkpoint cases replace SourceCheck. Added actual CourtListener/registry with deterministic HTTP and D1; same-Run recovery and other-Run dedup regression passes.
  - `[medium]` `[patch]` Blind 7: first-write race uses identical candidates — different candidates are tested only after a winner exists. Added a controlled losing-insert race; persisted winner and run.started version/list agree after resume.
  - `[medium]` `[patch]` Blind 8: observation/completion interruption boundaries untested — tests cover Draft/evaluation gaps, not the new journal commits. Added four before/after-commit cases; all retain entities, creation receipts and generic failure outcomes.
  - `[medium]` `[patch]` Blind 9: transition receipt rollback untested — declined transitions are covered but receipt insertion failure inside the D1 batch is not. Added a D1 trigger that aborts receipt insertion inside the batch; rollback and one-receipt retry both pass.
  - `[false]` `[reject]` Intent historical recovery: legacy refusal differs from the broadest reading — original R9 means old attach version cannot establish consumed inputs. Explicit refusal preserves truthful provenance; inventing it would contradict canonical intent. Completed legacy Runs remain sealed.
  - `[false]` `[reject]` Intent native Workflow service coverage — Story 3.34 separately owns runtime/service coverage. This story executes the production method and durable D1 effects and explicitly does not claim hosted service acceptance.
  - `[medium]` `[patch]` Intent source consumption/dedup surface — same missing actual-connector regression as Blind 6; added the actual source-registry/CourtListener regression through production orchestration.
  - `[false]` `[reject]` Intent operator UI projection — the changed provenance is stored in existing public Evidence payloads; API/UI projection is unchanged, and canonical 3.32 does not request a presentation change. Existing public evidence regressions run in the full suite.
  - `[medium]` `[patch]` Intent later-Run consumption — current test asserts only the new snapshot. Both version-0 and nonzero cases now execute later-Run packaging and assert newest source inputs/receipt version.
  - `[medium]` `[patch]` Gap 1: winning snapshot reread is unprotected by different-candidate tests — preverified mutation demonstration: returning the losing candidate passes existing tests. Same applied, passing race test as Blind 7.
  - `[high]` `[patch]` Edge 1: budget-stopped replay skips unfinished readiness — gateway commits stopped before draft evaluation/guardrail writes; new afterPackaging early return prevents their retry. Stopped Runs now reuse evaluation/guardrail recovery. Four first/later readiness/guardrail fault cases retain stopped status, sealed sibling decisions and zero new paid calls.
  - `[medium]` `[patch]` Edge 2: accepted duplicate source names block attach — same shared-schema inconsistency as Blind 2; shared-schema rejection now precedes persistence and is regression tested.
- Grouped repairs: eight entries (one high, seven medium). All use existing internal surfaces and demonstrated states; no intent/spec changes or deferred findings.
- Parent verification finding: `[high]` `[patch]` draftAndReview swallowed a later sibling readiness write failure after budget stop. Set persistFailed in that catch so the checkpoint cannot complete; the later-readiness entrypoint test passes. This belongs to the existing stopped-readiness repair group and is additional to the 17 layer findings.
- Review startup: the first edge reviewer read failed on the known bubblewrap environment; retried with elevated read-only access. Platform concurrency temporarily delayed the gap launch. All four layers completed; none skipped.

## Design Notes

A fetched receipt is an observation, not a package commit. Durable source completion must follow all intended writes; incomplete sources can resume while exact-Run Drafts independently establish materiality. Store the actual snapshot, not merely a version pointing to mutable compiled defaults. Prefer D1 atomic batches for logically indivisible artifacts. Legacy Runs lacking a provable snapshot must fail explicitly without inventing historical consumption. The focused step harness executes the production Workflow method; it does not claim real hosted Workflow-service acceptance.

## Verification

**Commands:**
- `npx vitest run <changed test files>` — targeted scenarios pass without paid external effects.
- `npm test` — full suite passes with no new skips.
- `npm run check` — formatting, lint and TypeScript pass.
- `git diff --check` — no whitespace errors.

## Auto Run Result

Status: done. Story 3.32 recovers durable exact-Run packages and failure evidence, pins actual source configuration/version at attach, preserves paid/publication identity and retries incomplete stopped-Run readiness. Completed source observations are reused; incomplete journals drain original entities. Transition receipts commit atomically with their Run status.

### Files changed

- `migrations/0022_run_packages.sql` — additive immutable snapshot and source-observation/completion tables; no remote application.
- `src/shared/db/repos/runPackagesRepo.ts` — validated winning snapshots, provable legacy recovery/refusal, durable failure query.
- `src/shared/schemas/pipelineConfig.ts` — shared unique source-name invariant.
- `src/shared/db/repos/pipelineConfigRepo.ts` — reject invalid current configuration instead of claiming seed provenance.
- `src/shared/db/repos/runsRepo.ts` — statement-form Run insertion for atomic attach.
- `src/shared/db/repos/evidenceRepo.ts` — prior-transition guard for transactional receipts.
- `src/pipeline/projector/evidence.ts` — preserve scrubbing through the receipt guard.
- `src/pipeline/connectors/connector.ts` — first-observation journal, repairable Draft/evidence writes, explicit failure outcomes and completion.
- `src/pipeline/connectors/courtListener.ts` — typed replayable internal storage errors.
- `src/pipeline/agents/draftAndReview.ts` — propagate unfinished later-sibling readiness persistence.
- `src/pipeline/workflow/dailyRunSteps.ts` — immutable attach, durable exact-Run counts, truthful atomic completion, stopped/awaiting recovery.
- `src/pipeline/workflow/dailyRun.ts` — strict attached/package identity and narrow external-effect test seams.
- `src/pipeline/workflow/dailyRunRecovery.test.ts` — 38 local-D1 production-entrypoint scenarios covering every matrix row and review repair.
- `src/pipeline/workflow/dailyRun.test.ts` — existing helper fixtures satisfy explicit attach/snapshot contracts.
- `src/pipeline/connectors/connector.test.ts` — snapshot fixtures and expanded evidence assertions.
- `src/pipeline/connectors/courtListener.test.ts` — allow added provenance fields in existing skip assertion.
- `src/pipeline/steering/submitTurn.test.ts` — five fixtures create new Runs without pretending an absent explicit ID was already attached.
- `spec-3-32-recover-durable-packages-and-pin-consumed-configuration.md` — plan, immutable intent, individual triage and completion evidence.
- `sprint-status.yaml` — Story 3.32 done; shared replay/admission corrective action remains open for 3.33.
- `epic-3-context.md` — implementation handoff and remaining acceptance boundaries.

### Review and verification

Four mandated layers completed. Seventeen findings: high 1, medium 10, false 6; grouped into eight applied repairs (one high, seven medium), no deferred items. Parent verified one additional high finding in the same stopped-readiness group. All six rejected findings and their individual refutations are recorded above: unreachable production snapshot bypass, externally corrupted observation version, undemonstrated malformed internal entity, unprovable historical provenance, separately scoped native-service coverage, and unchanged UI projection.

Follow-up review recommended: false. Numeric patch-volume trigger was met, but no specific unverified repair risk remains after complete repair-diff inspection and focused/full verification. This does not claim hosted-service or operational acceptance.

- Initial full suite found three legacy fixture failures under the strict explicit-attach contract; corrected five fixture calls without weakening assertions or runtime safeguards. Affected steering/recovery tests passed (88).
- Final focused verification: 38 recovery tests, 48 agent tests and 114 existing workflow/connector tests passed.
- Final `npm test`: 56 files, **1,305 tests passed**, no skips.
- Final `npm run check`: formatting, lint and TypeScript passed. `git diff --check` passed.
- Matrix audit: durable material and partial writes; exact-Run isolation; configuration 0/nonzero changes and later consumption; competing snapshots and legacy refusal; partial/total failure; true empty; review/publication/uncertain-accounting replay all have executed passing entrypoint or focused D1 assertions.

Residual limits: the harness executes the actual Workflow method with local checkpoint/fault injection; native hosted service acceptance remains 3.34. Active legacy work with unprovable source inputs is explicitly refused. Pricing was not refreshed; no paid calls, deployment or remote migrations occurred. Epic 3 operational acceptance remains rejected through 3.37, and the shared replay/admission action awaits 3.33.
