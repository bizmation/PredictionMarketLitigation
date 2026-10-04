---
title: '3.33 — Make Run admission and dispatch failures explicit'
type: 'bugfix'
created: '2026-10-04'
status: 'done'
baseline_revision: 'df369a9928328676b31b6143dfeb525ef4aa88bb'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: [oversized]
deferred:
  - summary: >-
      Reconcile pre-existing competing legacy active Runs only after verifying historical Workflow and paid-work outcomes.
    evidence: |-
      Multiple historical active rows are preserved and refuse new admission; baseline had no operator cancellation/reconciliation surface for this conflict. Automatically choosing or discarding one would invent execution certainty. Resolve any actual conflicting history with verified platform/accounting evidence before resuming it; populated upgrade and competing-row refusal are tested.
    location: >-
      src/shared/db/repos/runAdmissionRepo.ts:attachLegacy
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Scheduled dispatch silently treats any creation error as a duplicate, while operator admission races across origins. This can lose a Run without evidence or allow concurrent active work for one date.

**Approach:** Give all trigger paths one atomic durable admission authority, stable Run/Workflow identities, and explicit dispatch/recovery states. Confirm instance existence instead of guessing from error messages, and fence stale work before it can perform paid effects.

## Boundaries & Constraints

**Always:** At most one admitted active Run per date across scheduled/manual/catch-up; same-request retries retain identity. Permit sequential same-date Runs after safe terminal completion, preserving supersede confirmation for published history. Preserve exact-Run source snapshots/packages, budget/mode stamps, sealed Drafts, Approval Gate, stable paid operation identities and accounting liability. Unknown dispatch outcomes retain ownership and expose a scrubbed, actionable recovery path. Release must not overlap unresolved paid work; terminal Run status alone is insufficient. Stale Workflow replay must not start fresh source/provider work after ownership moves. Evidence describes actual admission/dispatch outcomes and never logs credentials/raw provider exceptions. All new dispatches pin the exact Run.

**Never:** Infer duplicate from arbitrary exception text, automatically expire uncertain claims based only on time, blindly release uncertain paid liability, erase historical Runs to satisfy uniqueness, silently change pricing, perform paid calls/deployment/remote migrations, or advance 3.34. Preserve noon-ET scheduling/DST and scheduled trigger dedup independently from date exclusivity. Hosted deployment acceptance remains later work.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Concurrent origins | Scheduled, manual and catch-up race for one date | Exactly one admitted Run/instance proceeds; losers get explicit conflict or same-identity retry | Real-D1 race, no duplicate provider dispatch |
| Same-origin retry | Concurrent/repeated trigger of admitted work | Stable Run/instance, idempotent recovery, no duplicate execution | Do not return started solely because a row exists |
| Normal schedule | Off-hour twin, noon ET, later repeat | Off-hour does nothing; noon admits once; scheduled repeat preserves trigger identity | Scheduled failure is durable and surfaced |
| Before dispatch | Missing binding or interruption before submission | Durable identified failure/pending state with safe recovery | No permanent unexplained claim; no fabricated started result |
| Unknown create | Generic rejection, response loss after accepted create, lookup failure | Scrubbed evidence and explicit uncertainty; retain ownership, recover same identity | Arbitrary already-exists text is not confirmation |
| Confirmed instance | Same durable instance positively confirmed by get/status | Reconcile actual active/terminal state without allocating a new Run | Unknown/errored/terminated status never masquerades as running success |
| Interrupted receipt | D1 write fails before/after dispatch state/evidence commit | Retry reconstructs durable state without a second active workload | Do not report success before required persistence |
| Release/retry | Awaiting gate; terminal with unresolved paid work; safely completed terminal | Awaiting/unresolved work blocks new admission; safe terminal permits sequential Run | Existing accounting reconciliation resolves paid uncertainty; preserve supersede rule |
| Stale work | Old instance delayed/replayed after ownership moves | No fresh connector/provider workload or mutation of sealed decisions | Fresh checks outside cached checkpoints plus atomic paid-effect fencing |
| Legacy state | Existing active/terminal Runs, possibly competing historical rows | Preserve history, do not admit over unresolved legacy active work | Explicit visible conflict/recovery instead of migration failure or silent deletion |
| Operator visibility | Dispatch unresolved/failed response and reload | Authenticated API/UI retains Run ID, truthful status and usable retry/check action | No false “not started” on uncertainty; unauthorized actions remain denied |

</intent-contract>

## Code Map

- `src/pipeline/workflow/dailyRun.ts` — kickDailyRun currently has no DB admission and catches all create errors; startOperatorRun reads then inserts and marks every create exception failed. DailyRunCreateBinding exposes only create despite installed get/status capabilities. DailyRunWorkflow.run needs live ownership checks outside cached attach/package/review steps.
- `src/pipeline/workflow/dailyRunSteps.ts` — ensureRun atomically creates Run/source snapshot when needed; preserve it and exact-ID behavior. stopped/awaiting recovery can still perform durable work, so status is not a sufficient release proof.
- `src/shared/db/repos/runsRepo.ts`, `runPackagesRepo.ts` — existing Run insertion statements, exact-ID queries and immutable source snapshots. Add a focused admission repository and additive migration after 0022; avoid a naive unique index on legacy active rows.
- `src/shared/db/repos/llmAccountingRepo.ts`, `src/pipeline/ai/gateway.ts` — reserve already checks Run status; dispatch needs admission safety if old work can outlive ownership. Preserve existing atomic accounting/result replay, and never release uncertain operations automatically.
- `src/server.ts` — admin POST /api/admin/runs around 373 collapses dispatch errors into generic 500; scheduled around 649 currently passes only binding/time. Add authenticated same-Run dispatch recovery through the existing admin surface and return safe actionable details.
- `src/server.ts:91` (`OperatorRunBodySchema`), `src/shared/schemas/run.ts`, `src/surfaces/admin/LoopControls.tsx` — request/schema/UI integration; UI currently falsely says not started on any non-OK response. Keep keyboard/access behavior and expose Run-specific recovery without triggering unrelated new work.
- `src/pipeline/workflow/dailyRunRecovery.test.ts` — production entrypoint with deterministic checkpoints/local D1, source registry and fake providers. Keep 38 recovery scenarios, updating admission setup without weakening identity isolation.
- `src/pipeline/workflow/dailyRun.test.ts`, `src/server.test.ts`, `src/surfaces/admin/loopControls.mount.test.tsx`, `src/shared/db/repos/llmAccountingRepo.test.ts` — reuse trigger/API/mounted UI/accounting fixtures; add focused admission tests.
- `env.d.ts:14592–14711` — installed Workflow get/status/create types. Official reference: https://developers.cloudflare.com/workflows/build/workers-api/ documents ID uniqueness during retention and positive get/status inspection, but no stable duplicate exception code. Do not treat a negative lookup/timeout as proof that delayed creation cannot occur.
- Canonical read-only requirements: `epics.md` Story 3.33 and retrospective R10/R11. Existing 3.32 code is the baseline, not its historical Code Map descriptions.

## Tasks & Acceptance

**Execution:**
- `migrations/0023_*.sql`, `src/shared/db/repos/runAdmissionRepo.ts` — implement atomic date ownership, stable dispatch identity/state and safe lifecycle/recovery; preserve existing history and snapshots.
- `src/pipeline/workflow/dailyRun.ts`, `dailyRunSteps.ts` — route all trigger paths through admission, preserve scheduled idempotency, classify confirmed versus uncertain creation and fence stale entrypoints/callbacks.
- `src/shared/db/repos/llmAccountingRepo.ts`, `src/pipeline/ai/gateway.ts` — enforce the admission fence at atomic paid admission/dispatch where required, retain existing operation recovery and liabilities.
- `src/server.ts`, `src/shared/schemas/run.ts`, `src/surfaces/admin/LoopControls.tsx` — expose authenticated identified recovery and honest failure/uncertainty state, with public scrubbed Evidence through existing projection.
- `src/pipeline/workflow/*test.ts`, relevant repo/API/mounted UI tests — execute all matrix states with deterministic barriers, injected storage/create failures and fake provider counters. Verify migration against populated legacy state if it changes/backfills existing rows.

**Acceptance Criteria:**
- Given concurrent requests through scheduled and authenticated operator paths, when they target one date, then persisted admission and executing Workflow/paid effects show one admitted active workload.
- Given dispatch interruption or uncertain submission, when the operator inspects and retries that Run, then API/UI and public Evidence truthfully identify its state and recovery never allocates competing work.
- Given terminal completion and settled work, when a later same-date request is admitted and old checkpoints replay, then sequential work succeeds while old effects remain fenced and original history/snapshots are unchanged.

## Spec Change Log

### 2026-10-04 — Review repair 1

B3/B4/B7 exposed missing execution details outside the unchanged intent-contract. Re-derive code with these constraints and all pass-1 patch regressions:

- Legacy entry/creation must use the atomic date authority. A delayed legacy attach cannot insert a competing running orphan. Preserve durable retirement when ownership transfers so legacy callbacks cannot regain effects after replacement release. Preserve safe historical replay and exact identity, without erasing history.
- Source lifetime cannot escape admission: propagate cancellation/deadline and check ownership before actual connector requests, including pages and sibling dockets. Cancel siblings on early failure. Late completion cannot resume fresh requests or writes after fencing. Reuse existing connector request boundary and timeout utilities; Promise.race alone does not stop work.
- Persist unresolved manual request ID and original ET date across remount/reload. Retry the same request and clear only an explicit known outcome or Run-specific resolved/confirmed action. Handle storage failure truthfully.
- Direct corrections: filter safely finished/settled terminal admissions from active recovery history; surface scrubbed scheduled outcomes; preserve legacy scheduled dedup without fabricated new-instance confirmation; idempotent same-Run resolution. Also parent inspection found unavailable recording can overwrite concurrent submission: make that transition conditional on its actual prior pending state.
- Tests must execute material production Workflow under concurrent-origin admission with fake provider counters and deterministic source/provider barriers. Losing/stale work cannot perform fresh effects, including legacy and timed-out pagination. Exercise real dispatched/uncertain/issue accounting transitions and reconciliation against both release paths. Add completed and legacy scheduled repeats, midnight/remount recovery, lost resolution response, positive public dispatch Evidence, and completed-history filtering.

KEEP: Atomic D1 date uniqueness and Run/source snapshot admission batch; fixed stable instance IDs; positive inspection rather than exception-text inference; distinct run.dispatch vocabulary and populated Evidence migration; uncertain ownership retention/no time expiry; immutable source journals/config; budget/mode snapshots; all 38 existing 3.32 recovery cases; paid reservation/dispatch fences; supersede confirmation; authenticated identified recovery and scrubbed errors. No paid calls, deployment, remote migration, or pricing refresh.

Known-bad states avoided: legacy running orphan, retired legacy work becoming eligible again, background polling after transfer, and reload/midnight allocating another logical request. Correct prior implementation may be reused as scaffolding from `/tmp/pml-333-before-rederive.patch`, but derive revised behavior from this spec.

## Review Triage Log

### 2026-10-04 — Review pass 1
- verdicts: 21 findings — high 1, medium 17, low 1, false 2, maybe-false 0
- findings:
  - `[medium]` `[patch]` B1 completed history accumulates — listActive includes every unreleased past date; hide safely finished terminal settled history.
  - `[medium]` `[patch]` B2 legacy insertion race — ensureRun transaction lacks date ownership assertion after preflight; it can insert a running orphan. Add atomic insertion assertion.
  - `[medium]` `[bad_spec]` B3 legacy fence can revive — An already executing legacy callback can outlive a terminal display transition; released successors no longer fence it. Specify permanent retirement and atomic legacy entry.
  - `[high]` `[bad_spec]` B4 timed-out connector continues — observe uses Promise.race without cancelling SourceCheck; CourtListener pagination/siblings continue after finish permits transfer. Specify cancellation and request-level fences.
  - `[medium]` `[patch]` B5 cron drops outcomes — server.scheduled discards explicit conflict/supersede results. Surface fixed scrubbed scheduled outcome/date/identity.
  - `[medium]` `[patch]` B6 upgraded scheduled dedup lost — Terminal legacy scheduled Runs lack new request keys and allow repeat admission. Preserve historical trigger identity without inventing instance confirmation.
  - `[medium]` `[bad_spec]` B7 reload loses unresolved identity — useRef disappears on remount; a response-lost Run completing before reload allows a duplicate click. Persist unresolved identity with safe clearing.
  - `[medium]` `[patch]` B8 midnight retry mismatch — UI omits scheduledFor, server recomputes date and rejects retained key. Pin original ET date.
  - `[low]` `[patch]` B9 resolution not idempotent — released=0 rejects repeated successful resolution after response loss. Return same persisted result without another receipt.
  - `[medium]` `[patch]` B10 race stops at create — Binding counts submissions but no paid execution. Execute material winner/loser/stale Workflows with fake providers.
  - `[medium]` `[patch]` E1 legacy running orphan — Independently verified same transaction gap as B2; atomic assertion needed.
  - `[medium]` `[patch]` E2 midnight retry conflict — Independently verified same date mismatch as B8; pin date and key.
  - `[medium]` `[patch]` E3 legacy scheduled replay — Independently verified same missing legacy request identity as B6.
  - `[medium]` `[patch]` I1 execution vs create counts — Descriptive gap is real; execute material winner and assert provider effects.
  - `[medium]` `[patch]` I2 in-flight work simulated by flags — Current tests call enter/finish directly; add deterministic executing source/provider barriers.
  - `[medium]` `[patch]` I3 stale test empty path only — Add material paid replay after ownership transfer.
  - `[false]` `[reject]` I4 separate API and UI tests — No 3.33 requirement mandates a connected browser/server harness; real endpoint and mounted client contracts are covered, broader orchestration is later.
  - `[medium]` `[patch]` I5 public receipt assertion absent — Public endpoint test only excludes secret; add positive run.dispatch receipt and identity assertion.
  - `[false]` `[reject]` I6 build status incomplete — Review diff correctly says in-review/in-progress; finalization follows review and no completion is claimed.
  - `[medium]` `[patch]` G1 completed scheduled retry unverified — Trust filed test/search evidence: active repeat would pass with random key. Complete Workflow and repeat, asserting original identity.
  - `[medium]` `[patch]` G2 unresolved liability release unverified — Trust filed test/search evidence: only reserved is covered. Exercise dispatched/uncertain/issues and real reconciliation against resolve and replacement.
- B3/B4/B7 route to spec repair/re-derivation. Re-derivation applied all lower patch entries; verified by 1357 passing full tests and 190 passing focused matrix tests. The unchanged 38 recovery scenarios still run, with five new atomic source-write race scenarios. Parent/implementation follow-up also made all source persistence ownership checks transactional. Backup: Git ref `refs/codex/3-33-review-pass1-backup` and `/tmp/pml-333-before-rederive.patch`.


### 2026-10-04 — Review pass 2
- verdicts: 19 findings — high 3, medium 9, low 1, false 6, maybe-false 0
- findings:
  - `[high]` `[patch]` B1 cached legacy attachment bypasses ownership — Cached attach-run skips ensureRun; enter updates zero rows for absent admission. Acquire legacy ownership in the live entry path, including pinned payloads, before effects.
  - `[medium]` `[defer]` B2 competing legacy active history lacks automatic recovery — Pre-existing overlapping active legacy rows have no safe cancellation/reconciliation API in baseline either. Preserve explicit refusal rather than inventing which historical workload can be discarded; separately reconcile such historical conflicts using verified platform/accounting evidence. This story tests non-destructive refusal.
  - `[medium]` `[patch]` B3 external request keys collide with internal identities — Operator schema permits scheduled-/legacy- keys and admit infers legacy mode from key text. Namespace external keys independently and explicitly identify legacy admission internally.
  - `[medium]` `[patch]` B4 concurrent tabs overwrite pending identity — localStorage shares a single slot across tabs; read-then-write can lose an unresolved request. Use tab-local sessionStorage, which retains reload/remount identity while isolating tabs, with regression coverage.
  - `[medium]` `[patch]` B5 Cancel clears another pending record — Cancel reads whichever record currently exists instead of its dialog identity. Clear only the captured confirmation request, and remove confirmation controls once submission starts.
  - `[low]` `[reject]` B6 malformed saved data requires browser repair — Corrupted external storage is explicitly refused before dispatch; a new repair UI for an uncommon corrupted record adds branches/public surface and could discard an uncertain identity. Existing message identifies storage recovery; no silent deletion.
  - `[medium]` `[patch]` B7 active recovery uses N+1 reads — listActive issues two additional reads per unresolved admission. Consolidate safe projection in one SQL query; do not hide unresolved work with an arbitrary limit. Existing full Run history pagination is a separate pre-existing concern.
  - `[medium]` `[patch]` B8 late inspection overwrites stronger evidence — record unconditionally replaces state/status; stale unknown/running can overwrite confirmed/terminal and response reports observed running. Preserve known confirmation/terminal monotonically and derive response from persisted receipt.
  - `[medium]` `[patch]` B9 supersede receipt preflight can become stale — published?.id is read before admission; awaiting sibling may publish before batch. Validate the predecessor inside transaction so stale confirmation cannot commit misleading evidence.
  - `[false]` `[reject]` B10 omitted keys allegedly promise retry identity — Omitting a key is an explicit fresh-request fallback for legacy one-shot callers; HTTP POST body equality is not request identity. The shipped UI persists and sends a key; keyed API regression proves retries. Add explanatory type/API comment as documentation, not a new retry guarantee.
  - `[high]` `[patch]` E1 pinned legacy operator payload skips claim — Independently verified: pinned branch enters without attachLegacy and UPDATE affects zero rows; same fix as B1 plus competing legacy fixtures must refuse effects.
  - `[medium]` `[patch]` E2 legacy inspection uses synthetic instance ID — Legacy claim persists legacy-run ID while actual historical Workflow identity differs. Pass actual event.instanceId through live attachment; use known historical naming only for helper fallback, never fabricate confirmation.
  - `[high]` `[patch]` E3 uncertain supersede retains Cancel — After a supersede POST loses response, confirming remains true; Cancel deletes the key. End confirmation before submission and retain uncertain identity, tested across subsequent retry.
  - `[medium]` `[patch]` G1 matching request cleanup after recovery untested — Trust filed search/mutation evidence: unrelated-record preservation and initial-success tests do not cover resolve cleanup. Add mounted matching resolve/confirmed cleanup and next fresh submission.
  - `[false]` `[reject]` I1 diff cannot prove workflow invocation — Tool execution and review records establish workflow use; repository diff is not expected to encode invocation provenance. No product defect demonstrated.
  - `[false]` `[reject]` I2 concurrency enters shared helpers — Authenticated HTTP handlers and cron delegate to the same tested admission authority without intervening admission state. Real endpoint tests cover those adapters and material Workflow race covers authority/effects; no divergent behavior shown.
  - `[false]` `[reject]` I3 native platform behavior unexercised — Tests explicitly use real production method/local D1 with deterministic checkpoints and fake paid providers; native Workflow-service and hosted acceptance are later 3.34/3.36/3.37, not claimed here.
  - `[false]` `[reject]` I4 client/server tested separately — carried: prior I4 rejects a mandatory connected browser/server harness; separate real endpoint and mounted contract tests remain valid and now include positive public receipts.
  - `[false]` `[reject]` I5 review state is not completed delivery — carried: prior I6; review-stage status is correct while finalization is pending, with no claim that merge/deployment already occurred.
- Grouping after individual verdicts: B1/E1 share missing live legacy attachment; B5/E3 share confirmation cancellation safety; all other surviving patch entries are independent. All nine grouped patches applied and verified: B1/E1 live legacy acquisition; B3 explicit namespaced identity; B4 tab-local persistence; B5/E3 captured confirmation lifecycle; B7 single-query projection; B8 monotonic receipts and truthful fresh inspection; B9 transactional predecessor assertion; E2 actual Workflow identity; G1 matching recovery cleanup. Final focused suite passes 206 tests, including all new regressions; full suite passes 1373 tests. Formatting/lint/types pass after correcting a test-only inferred UUID type.

## Design Notes

Model admission separately from Run display status. Persist intent before external submission, use one durable instance identity, and make uncertainty inspectable/recoverable. A creation rejection plus failed lookup is not proof of absence. Recovery must have a safe way forward through positive confirmation or explicit fenced resolution; an unbounded silent lock is not completion. Do not add time-based liability release. Shared policy and existing accounting reconciliation remain authoritative. Prefer one small repository rather than duplicate origin-specific admission logic.

## Verification

**Commands:**
- `npx vitest run <affected test files> --reporter=verbose` — all matrix cases execute and pass with deterministic local effects.
- `npm test` — full regression suite passes, no new skips.
- `npm run check` — formatting, lint and TypeScript pass.
- `git diff --check` — no whitespace errors.

## Auto Run Result

Story 3.33 is implemented and locally verified. All origins share atomic date admission, stable request/Workflow identity and persisted dispatch evidence. Uncertain submission retains ownership and exposes authenticated check/retry or safe fenced closure. Workflow entry, source requests/writes and paid dispatch enforce current ownership. UI retries retain their original request/date through reload, while confirmation and recovery clear only the matching request.

### Files changed

- `migrations/0023_run_admission.sql` — admission/retirement authority and history-preserving dispatch Evidence vocabulary migration.
- `src/shared/db/repos/runAdmissionRepo.ts` — atomic admission, lifecycle, legacy attachment, monotonic receipts and recovery projection.
- `src/pipeline/workflow/dailyRun.ts` — shared trigger dispatch, positive inspection, identified recovery and live Workflow ownership.
- `src/pipeline/workflow/dailyRunSteps.ts` — atomic legacy creation/attachment and transactional source-write fencing.
- `src/pipeline/connectors/connector.ts` — optional cancellation and request-boundary ownership context.
- `src/pipeline/connectors/courtListener.ts` — deadline/sibling cancellation and per-request fencing.
- `src/shared/db/repos/draftsRepo.ts` — atomic optional ownership guard on Draft insertion.
- `src/shared/db/repos/llmAccountingRepo.ts` — admission ownership in paid reservation and dispatch transactions.
- `src/server.ts` — authenticated dispatch recovery, explicit trigger responses and scrubbed scheduled outcomes.
- `src/shared/schemas/run.ts` — validated dispatch recovery projection.
- `src/shared/schemas/vocabulary.ts` — public run.dispatch event vocabulary.
- `src/surfaces/admin/LoopControls.tsx` — honest dispatch state, tab-local durable identity and matching recovery controls.
- `src/pipeline/workflow/runAdmission.test.ts` — material concurrent Workflow, interrupted dispatch, legacy, paid-liability and stale-work regressions.
- `src/pipeline/workflow/dailyRun.test.ts` — shared-admission schedule/identity contracts while preserving DST behavior.
- `src/pipeline/workflow/dailyRunRecovery.test.ts` — preserve 38 replay cases and add five atomic source-write transfer races.
- `src/shared/db/repos/runAdmissionUpgrade.test.ts` — populated legacy/Evidence migration preservation.
- `src/shared/db/repos/llmAccountingUpgrade.test.ts` — accounting upgrade compatibility with admission migration.
- `src/server.test.ts` — explicit authenticated recovery, idempotent closure, public receipts and cron outcome contracts.
- `src/shared/api/adminApi.test.ts` — identified dispatch response contract.
- `src/surfaces/admin/loopControls.mount.test.tsx` — 19 mounted tests including reload, midnight, tab isolation and uncertain supersede recovery.
- This spec — intent, execution repair, complete review triage and verification evidence.
- `sprint-status.yaml` — story completion and linked corrective-action evidence.
- `epic-3-context.md` — implementation handoff and remaining operational acceptance boundary.

### Review outcome

Two complete four-layer review passes produced 40 individually classified findings: 30 resolved through re-derivation/patches, one pre-existing medium issue deferred, and nine rejected. Pass 2 patched nine root-cause entries: high 2, medium 7, low 0. All fixes and regression outcomes are recorded above.

Rejected findings and reasons: pass 1 I4 and pass 2 I4 require an unrequested connected browser/server harness despite real endpoint and mounted contract coverage; pass 1 I6 and pass 2 I5 mistake correct review-stage status for a delivery defect. Pass 2 B6 would add a repair UI for uncommon externally corrupted storage, risking uncertain identity deletion; existing behavior explicitly refuses dispatch. B10 incorrectly equates omitted request keys with a retry guarantee; one-shot callers intentionally create fresh requests, while keyed callers/UI retain identity. I1 expects invocation provenance in a product diff despite actual workflow records. I2 shows no divergence between adapters and the tested shared authority. I3 asks for native hosted acceptance explicitly reserved for subsequent stories.

Follow-up review recommendation: **false**. Although the patch-count threshold is met, there is no specific remaining unverified repair risk: deterministic regressions exercise each patched boundary, parent inspection covered the full final implementation and both repair deltas, and focused/full verification passes. The historical conflict deferral and future hosted acceptance are explicitly separated below.

### Verification

- `npm test`: **1373 passed, 58 files, no skips**. Final subsequent edit only changes test fixture inference; the affected suite was rerun successfully.
- `npx vitest run src/pipeline/workflow/runAdmission.test.ts src/pipeline/workflow/dailyRun.test.ts src/pipeline/workflow/dailyRunRecovery.test.ts src/server.test.ts src/shared/db/repos/runAdmissionUpgrade.test.ts src/shared/db/repos/llmAccountingRepo.test.ts src/shared/db/repos/llmAccountingUpgrade.test.ts src/surfaces/admin/loopControls.mount.test.tsx --reporter=verbose`: **206 passed, 8 files, no skips**, after all repairs.
- `npm run check`: **passed** (formatting, lint, TypeScript).
- `git diff --check`: **passed**.
- Matrix coverage: concurrent origins and same-origin retry use real local D1 admission plus material production Workflow/fake provider barriers; normal schedule covers DST/off-hour/completed and legacy repeats; before-dispatch/unknown-create/confirmed-instance/interrupted-receipt cover exact identity, positive inspection, terminal states and transaction interruptions. Release/retry exercises reserved/dispatched/uncertain/issue liabilities and reconciliation. Stale work covers cached checkpoints, real CourtListener pagination/siblings, atomic writes and paid dispatch. Legacy state covers populated migration, pinned/unpinned actual instance attachment, permanent retirement and non-destructive conflicting-history refusal. Operator visibility covers authenticated endpoint/public receipts and 19 mounted UI cases.

### Residual risks and scope

Pre-existing competing active legacy Runs remain preserved and explicitly blocked until historical Workflow/paid-work outcomes are verified; no automatic destructive reconciliation is invented. Local tests execute the production method with deterministic checkpoint/binding fixtures and fake providers; native Workflow-service and hosted acceptance remain 3.34/3.36/3.37. No deployment, remote migration, paid inference or pricing refresh occurred. Epic 3 operational acceptance remains rejected and Epic 4 blocked pending the remaining corrective stories.
