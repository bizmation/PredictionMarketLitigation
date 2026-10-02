---
title: '3.31 — Reserve and settle paid calls atomically'
type: feature
created: '2026-10-02'
status: done
baseline_revision: 146c4b72b487c032866f8bb6c6ef2c1f628482ff
review_loop_iteration: 0
followup_review_recommended: false
context:
  - /home/patrick/GitHub/PredictionMarketLitigation/_bmad-output/implementation-artifacts/epic-3-context.md
warnings:
  - oversized
deferred:
  - summary: >-
      Verify accounting query scalability with representative retained history.
    evidence: |-
      Blind review found repeated timestamp scans and an unindexed reconciliation operation lookup. No representative data volume or query-cost evidence establishes an actual D1 limit failure. Query plans and realistic retained-history measurements would settle the claimed impact; no speculative indexing rewrite is included.
    location: >-
      migrations/0021_atomic_llm_accounting.sql; src/shared/db/repos/runsRepo.ts
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** Concurrent calls can admit against the same balance. Provider timeouts, checkpoint loss, and separate ledger/Run writes can lose liability or cause duplicate charges.

**Approach:** Atomically reserve each bounded logical call, persist dispatch/result state, replay durable results without another inference, and settle or reconcile against one authoritative accounting source. Enforce all configured Run and period ceilings and show outstanding liability honestly.

## Boundaries & Constraints

**Always:** Preserve the approved 3.30 policy and 500-cent seed. Include outstanding reservations in available balance. Stable identity must come from the business operation, not a fresh provider-attempt UUID or mutable prompt hash alone. Record attempt/outcome evidence before paid dispatch. Unknown outcome retains liability until evidenced reconciliation; cancellation is not proof of no charge. Settlement and repeated reconciliation are idempotent. Public totals must agree with enforcement while retaining estimated/reported/unknown distinctions and private steering redaction.

**Never:** Deploy, call paid providers for tests, mutate live budgets/configuration, automatically refresh pricing timestamps, silently raise bounds, invent historical charges, expose stored private prompts/completions, or treat accounting repair as Draft evaluation/publication authorization. Packaging/config replay remains 3.32; trigger admission remains 3.33; full Workflow acceptance and staging remain 3.34–3.37.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Last Run balance | Two distinct calls fit separately but not together | At most one dispatch; winner liability reserved atomically | Loser budget_stopped; no extra provider call |
| Shared periods | Different Runs share explicit applicable period limits | Every matching period and Run ceiling enforced atomically | No partial reservation when any limit refuses |
| Duplicate/replay | Same logical call, same request, pending or completed | Pending refuses redispatch; completed returns stored result without charge | Changed request under same identity conflicts |
| Pre-dispatch interruption | Reservation persisted; dispatch status not committed | Liability retained; recovery never creates two dispatch owners | Proven never-dispatched reservation may be safely resumed or explicitly released |
| Dispatch/response loss | Dispatch may have occurred, timeout or process loss | Durable uncertain/in-flight liability retained; no blind retry | Reconciliation required; no inferred no-charge |
| Settlement interruption | Provider returned; write fails midway or response is lost | Entire settlement rolls back or fully commits once; replay observes durable state | No double ledger entry or dropped liability |
| Successful settlement | Valid usage/result, repeated same settlement | Ledger/result/reservation state and displayed accounting agree | Conflicting settlement refuses |
| Reconciliation | Named operator, expected version, evidence of charge/no-charge | Atomic idempotent correction with retained receipt, original attempt history | Stale/conflicting/unauthorized request cannot release funds |
| Over-bound anomaly | Observed charge exceeds bound | Preserve full observed amount; block further affected Run/period dispatch until explicit resolution | No clipping or automatic cap increase |
| Public projection | Pending, uncertain, settled and legacy records | Enforcement amount, reserved/uncertain liability and costs agree on list/detail/UI | No private completion/prompt leakage |
| Production caller retry | Draft stage or steering submission retried after lost response | Same durable operation identity; no repeat paid inference | New intentional operation receives new identity |

</intent-contract>

## Code Map

- `src/pipeline/ai/gateway.ts` — complete currently checks SUM(llm_calls), dispatches, inserts then bumps Run separately. Provider factories have free OpenRouter metadata preflight mixed into complete; Workers ignores AbortSignal. Preserve caps, reviewed routing, expiry and usage validation.
- `src/pipeline/ai/costPolicy.ts` — reviewed version and exact math; expires 2026-10-03T14:01:49Z. Use fixed clocks in tests; do not silently refresh.
- `src/shared/db/repos/llmCallsRepo.ts`, `runsRepo.ts` — call ledger and cached totals. Legacy estimates must remain intact. All new accounting reads/writes need one common authority.
- `src/shared/db/repos/gateAssertions.ts`, `src/pipeline/gate/approval.ts` — reuse D1 batch/conditional SQL plus CHECK assertion pattern; `src/pipeline/gate/atomicGate.test.ts` shows rollback injection.
- `src/pipeline/agents/draftAndReview.ts` — drafter/reviewer complete calls around lines 674/716; persisted draft.id plus role/purpose provides replay identity, including revision children. Persisted drafter output must feed replayed reviewer work.
- `src/pipeline/steering/submitTurn.ts` — ask/config calls around 180/464; turn receipt precedes inference, but incoming submissions allocate random turn IDs around 780. `src/shared/schemas/steering.ts`, `src/surfaces/admin/SteeringPanel.tsx`, and `src/server.ts` own request/body/client retry boundaries.
- `src/pipeline/workflow/dailyRun.ts` — attach/package/review checkpoints; do not rework packaging in this story.
- `src/shared/schemas/gateway.ts`, `src/shared/schemas/run.ts`, `src/shared/api/publicRouter.ts` — public contracts and list/detail accounting; avoid inconsistent multi-query snapshots.
- `src/surfaces/ops/EvidenceDetail.tsx`, `RunLog.tsx`, `src/surfaces/admin/LoopControls.tsx` — honest monetary labels/guards and liability visibility.
- `migrations/0020_provider_cost_policy.sql` — preceding migration. New schema belongs in 0021; no edits to prior migration history.

## Tasks & Acceptance

**Execution:**
1. `migrations/0021_atomic_llm_accounting.sql` (new), `src/shared/schemas/gateway.ts`, `src/shared/db/repos/llmAccountingRepo.ts` (new) — durable logical operations, state/version/ownership, bound/policy, immutable period attribution, private replay result, and reconciliation receipts. Implement atomic reserve/dispatch claim/settle/reconcile and common accounting queries.
2. `src/shared/db/repos/llmCallsRepo.ts`, `runsRepo.ts` — integrate the authority without double-counting settled operations and held reservations; preserve legacy estimates and conservatively preserve any stored Run amount greater than its old ledger sum as an explicit legacy adjustment, not a fabricated provider charge. Keep cached totals atomically consistent if retained.
3. `src/pipeline/ai/gateway.ts` — require stable logical-call identity, validate request fingerprint, atomically acquire funds/dispatch ownership, retain uncertain liability and replay completed result. Split definitive free preflight from paid dispatch where needed so only proven pre-dispatch failures release safely. Capture available provider request IDs; do not assume undocumented idempotency.
4. `src/pipeline/agents/draftAndReview.ts`, `src/pipeline/steering/submitTurn.ts` — pass business identities and consume durable replay results. Identity is Run + persisted Draft + role/purpose or Run + persisted steering turn + purpose. Different revised Drafts and intentional steering turns remain distinct.
5. `src/shared/schemas/steering.ts`, `src/surfaces/admin/SteeringPanel.tsx`, `src/server.ts`, steering persistence — carry a stable client request ID through retry and persist deduplication before side effects. The same ID with changed payload conflicts. Preserve a key across ambiguous submission failure, including client recovery; a new intentional submission gets a new key. Never persist private message text in browser storage. Completed requests return their stored authorized result; in-flight/uncertain requests refuse duplicate execution. Maintain compatibility only where it cannot bypass paid-call deduplication; legacy requests without a retry key may be refused before paid inference with a useful error.
6. `src/server.ts`, `src/shared/schemas/gateway.ts`, `src/shared/db/repos/llmAccountingRepo.ts`, `docs/llm-accounting.md` (new) — expose an Access-protected operator reconciliation POST with strict body, expected version, operator identity, and evidence reference. Document concrete request/response examples and period provisioning; no live reconciliation/provisioning is performed. Keep this outside chat mutation.
7. `src/shared/api/publicRouter.ts`, `src/shared/schemas/run.ts`, accounting projections, existing Evidence/RunLog/LoopControls surfaces — render held/uncertain liability separately, while total budget accounting comes from the same authority used for admission. Exclude private replay data from public responses. Show meaningful reconciliation/anomaly state and receipts with safe evidence references.
8. `src/pipeline/ai/gateway.test.ts`, `src/shared/db/repos/llmAccountingRepo.test.ts` (new), `src/pipeline/agents/draftAndReview.test.ts`, `src/pipeline/steering/submitTurn.test.ts`, `src/shared/api/adminApi.test.ts`, `publicApi.test.ts`, `src/server.test.ts`, `src/surfaces/admin/SteeringPanel.mount.test.tsx`, existing accounting surface tests — cover every matrix row against real local D1 and deterministic providers. Add actual caller replay and authenticated reconciliation/API tests, not repository-only proxies.

**Acceptance Criteria:**
- Given concurrent calls competing for one remaining bound, when they reach actual gateway dispatch, then at most one provider call occurs and public accounting includes its reservation immediately.
- Given overlapping Runs and multiple configured periods, when admission or settlement crosses a period boundary, then all caps and the original reservation attribution remain enforced atomically.
- Given interruption before/after dispatch, response receipt, settlement, or returned replay, when the same operation resumes, then it cannot incur a second unaccounted charge or lose retained liability.
- Given a settled operation and identical retry, when the production drafter/reviewer or steering path re-enters, then it recovers the private result without another provider request; changed identity payload is rejected.
- Given an unknown charge or over-bound observation, when an authorized operator reconciles with evidence, then state/ledger/totals/receipt change atomically once and unverified liability is not silently released.
- Given public list/detail/operator UI reads, when operations are pending, uncertain, settled or legacy, then displayed accounting agrees with enforcement and no private prompt/completion is disclosed.

## Design Notes

### Accounting and period contract

One operation owns one persisted attempt unless an explicitly evidenced reconciliation authorizes a later attempt; the minimal implementation may keep the reconciled logical operation terminal and require a new intentional business operation. Never use timeout-based takeover to resend a potentially paid request. Before dispatch, commit ownership; only its owner invokes inference. A reservation still present after an ambiguous D1 response is not permission to resend. A stored completed response can be replayed even after pricing expires because replay makes no new charge. A fingerprint mismatch blocks reuse; it must not silently create a new logical call. Private results remain server-side and must follow existing steering privacy rules.

No period configuration exists today. Support explicit immutable `[startsAt, endsAt)` UTC period rows with nonnegative integer-cent caps and an audit/provenance identifier; seed no active period and change no live limit. All periods matching admission time apply, not merely one selected bucket. Ledger/reservations remain attributable to their original windows after a window closes; overlapping periods cannot be bypassed by parallel Runs. Document append-only provisioning with deliberate boundaries, not a guessed daily/monthly dollar policy. Historical ledger amounts inside a configured interval count; do not discard old spend when a period is provisioned. Preserve existing Run ceilings; absence of a configured period introduces no invented extra allowance or unlimited Run budget.

Retain at least the original liability for any dispatched or uncertain operation. Successful measured/estimated settlement follows 3.30 accounting semantics. Missing, malformed, non-text or over-bound outcomes retain durable issues. Timeout/abort/HTTP failure are uncertain unless a verified provider contract proves no dispatch/charge; default conservatively. A result persisted with settlement is replayable; if charge is reconciled but result unavailable, return a typed non-replayable outcome without paid retry.

### Reconciliation contract

Use a narrowly scoped authenticated route such as `POST /api/admin/llm-calls/:id/reconcile`. Require expected persisted version, stable reconciliation request ID, decision (`confirmed_charge` or `confirmed_no_charge`), original USD amount when charged, nonempty operator evidence/reference and note. Actor comes from Access, never client assertions. Persist before/after accounting and attribution in an append-only receipt. Identical repeat is idempotent; changed body for the same key or stale state conflicts. Evidence is a human attestation with provenance, not an automatic provider verification claim. It never proves a completion body or evaluation result. No-charge release is an explicit operator decision, never inferred from error or elapsed time. Unresolved over-bound issues block the affected Run and all original shared periods; explicit operator reconciliation may resolve the issue, but cannot raise ceilings or conceal the actual amount. Numeric exhausted caps continue to refuse even after reconciliation. A late provider return cannot overwrite a newer reconciled state.

### Platform evidence checked 2026-10-02

Cloudflare D1 documents that batch statements form a transaction and a failing statement rolls the sequence back: https://developers.cloudflare.com/d1/worker-api/d1-database/ . Use existing assertion conventions, not dynamic BEGIN across network calls.

OpenRouter exposes generation lookup by known generation ID: https://openrouter.ai/docs/api/api-reference/generations/get-request-&-usage-metadata-for-a-generation . This does not establish idempotent POST replay or prove no charge when an ID/response is lost. No provider-idempotency guarantee was established for the current adapters, so explicit reconciliation is the safe default. Verify relevant current provider capabilities during implementation; no paid calls are authorized.

## Spec Change Log

## Review Triage Log

### 2026-10-02 — Review pass
- verdicts: 19 findings — high 2, medium 8, low 3, false 5, maybe-false 1
- Review execution: all four layers launched; edge/gap first reads failed with the known bubblewrap error and were resumed using the working read-only escalation. One transient agent-capacity rejection delayed the retry; no layer was skipped.
- findings (layer completion order; each report classified before grouping):
  - `[false]` `[reject]` I1 process cannot be proved by product diff — workflow snapshot, implementation handoff, parent diff read and check logs independently establish the process; an in-review diff is not the final workflow disposition.
  - `[false]` `[reject]` I2 newly written contract may differ from original story — checked canonical epics.md Story 3.31 lines 1087–1097; reservations, stable retry identity, atomic settlement, uncertain liability, over-bound handling and requested concurrency/interruption checks match.
  - `[false]` `[reject]` I3 broad automatic recovery differs from conservative pending refusal — canonical 3.31 explicitly permits reconciliation of uncertain outcomes and forbids blind paid retries. Automatic continuation of all ambiguous mutations is not promised; the separately reported recoverable completed-request gap is classified below.
  - `[false]` `[reject]` I4 no deployed provider/executing Workflow/browser-to-server run — canonical corrective sequencing assigns executing Workflow and staging acceptance to 3.34 and 3.36–3.37. This story's named gateway, caller, API and mounted surfaces are exercised locally.
  - `[false]` `[reject]` I5 completion status is intermediate — review intentionally runs before finalization; done/commit/PR/merge remain required after fixes, not evidence of an abandoned build.
  - `[medium]` `[patch]` B1 completed steering request loses retry response at final result UPDATE — executeTurn commits durable output/effect receipts before the separate request result write. Recover only provably completed results from those existing records, without rerunning effects or paid calls; ambiguous unfinished submissions still refuse.
  - `[high]` `[patch]` B2 observed over-bound response disappears on settlement rollback — current rollback leaves only the original reservation and no issue marker. On a demonstrated settlement failure preserve available response/request/charge evidence and at least the observed liability under the existing owner/version guard; do not imply durable persistence when D1 itself is unavailable.
  - `[medium]` `[patch]` B3 late provider response is discarded — withAbortableDeadline races an adapter that may ignore cancellation. Retain available late response evidence and any higher liability without overwriting a newer reconciliation or authorizing another paid attempt.
  - `[medium]` `[patch]` B4 adapter policy refusal after claim creates false uncertain charge — both adapter expiry guards precede their paid invocation. Distinguish that proven local pre-dispatch refusal and safely release only that reservation.
  - `[medium]` `[patch]` B5 receipts omit newly provisioned enforced periods — period accounting includes operation timestamps, but reconcile selects only frozen attribution rows. Include the actual applicable period union and transactional before/after amounts in the receipt.
  - `[medium]` `[patch]` B6 legacy anomaly reconciliation overwrites original provenance — migrated operations have no settlement snapshot and the receipt captures only old amount. Preserve the original safe ledger fields before updating the charge/source/issue.
  - `[low]` `[reject]` B7 unavailable browser storage prevents submission — storage exceptions reach the existing submission error handling before paid dispatch. This is an uncommon browser restriction; an in-memory fallback would add complexity and lose the promised recovery identity after reload, so the proposed fallback is not added.
  - `[low]` `[patch]` B8 fetched operation/receipt fields bypass the UI guard — malformed nonarrays or malformed rendered values can reach map/render. Extend existing response validation and mounted malformed-response coverage directly.
  - `[maybe-false]` `[defer]` B9 accounting queries may exhaust D1 limits as history grows — scans exist, but no representative volume/cost establishes the claimed failure. Deferred as medium unverified pending query-plan and retained-history measurement.
  - `[low]` `[patch]` B10 documented reconciliation version is not rendered — Evidence shows ID/state/issue only, while the API already supplies version, bound, liability and provider ID. Display those existing values and verify them in the mounted surface.
  - `[medium]` `[patch]` G1 no populated 0021 upgrade regression — trusted gap evidence: all migrations run before fixtures, so deleting the legacy backfill would pass existing checks. Add an isolated real-D1 upgrade test for cached totals above/equal/below ledger and admission against preserved totals.
  - `[high]` `[patch]` E1 a new over-bound issue between reserve and claim does not prevent dispatch — claim currently asserts only state/owner/version. Add the existing Run/original-period anomaly checks inside the claim transaction and test the interleaving.
  - `[medium]` `[patch]` E2 identical concurrent request can stop its own Run — early budget read can observe its duplicate's reservation after the initial identity read. Re-resolve that identity before a budget refusal based on the later accounting snapshot and preserve atomic admission checks.
  - `[medium]` `[patch]` E3 completed steering retry conflicts after result write loss — same root cause and repair as B1; preserve a separate finding row and cover the actual final request write failure.
- Grouped repairs: 11 entries (high 2, medium 7, low 2); B1/E3 share one root cause. One unverified performance item deferred; six findings rejected. Each repair uses existing surfaces and demonstrated states; no additional public operation or automatic uncertain-work takeover is introduced.

### 2026-10-02 — Parent repair audit
- `[medium]` `[patch]` P1 recovered steering response could be overwritten by a late original executor — verified separate conditional recovery and unconditional original UPDATE. Both paths now share a first-writer result commit and return the stored winner; a paused reply-receipt failure test passed.
- `[high]` `[patch]` P2 issue-free reconciliation can leave numeric balances above ceilings before claim — the claim issue guards alone do not reject that state, or a newly provisioned period below already-held liability. Extend the claim's existing transaction to check current totals against actual Run/applicable-period caps without adding the bound twice. This refines E1's dispatch-admission repair and does not introduce a new public surface.

## Verification

- `npm test` — all applicable local real-D1, gateway, actual caller/API and mounted UI tests pass, including every matrix row and deterministic interruption/race tests.
- `npm run check` — formatting, lint and TypeScript pass.
- `git diff --check` — clean.

Preserve existing 3.30 cost-policy and honest-label regressions, changing only expectations invalidated by reservations (timeouts must now retain liability). Inject failures at accounting boundaries and assert both persisted totals and dispatch counts. Do not enlarge budgets to pass tests. No remote migration or live provider experiment is part of verification.

### Implementation verification — 2026-10-02

Independent parent verification: `npm test` passed 54 files / 1,240 tests; `npm run check`, `git diff --check`, and cached diff checks passed. Read the entire 3,995-line staged diff. Matrix audit: gateway dispatch race/shared-period/replay tests cover last balance, shared periods and duplicate identity; real-D1 repository tests cover reservation/dispatch/settlement interruption, idempotent settlement, reconciliation and over-bound retention; API/public provenance and mounted accounting tests cover public projection/privacy; actual Draft checkpoint replay and steering duplicate/pending/browser recovery tests cover production callers. All covering files ran without skips.

## Auto Run Result

Status: done

Implemented atomic bounded reservations against Run and every applicable configured period, durable dispatch ownership, private completed-result replay, retained uncertain/late/failed-settlement liability, idempotent settlement and evidenced operator reconciliation. Stable Draft/steering identities prevent repeated paid work; public list/detail/operator UI use the accounting authority and distinguish held/uncertain amounts. Migration 0021 preserves legacy balances and original anomaly provenance. No active period was seeded.

### Review result

All four review layers completed. The 19 layer findings were individually classified before grouping: high 2, medium 8, low 3, false 5, maybe-false 1. Eleven repair groups were applied (high 2, medium 7, low 2); B1/E3 shared the completed-steering recovery defect. Parent repair audits P1 and P2 strengthened the existing steering and dispatch groups, rather than introducing separate features. All fixes are verified by precise interruption/interleaving or mounted/API tests. The six rejected findings and reasons are retained individually in the triage log (I1–I5, B7). B9 remains the single deferred medium-unverified performance claim, pending representative history/query-cost evidence.

Patches verified: completed steering recovery and first-writer response agreement; retained observed/late provider evidence and higher liability; proven local pre-dispatch release; claim-time anomaly and numeric ceiling rechecks; duplicate identity re-resolution; complete original reconciliation provenance and period totals; populated migration upgrade coverage; typed fetched operation/receipt validation and useful operator details.

Follow-up review recommended: false. Although patched group counts meet the initial numerical trigger, no specific unverified risk remains in the repaired paths after targeted regressions, full suite and parent diff inspection. The separately deferred scalability claim is not evidence of an unverified repair.

### Verification

- Final `npm test`: 55 files, 1,267 tests passed, no skips.
- `npm run check`: formatting, lint and TypeScript passed.
- `git diff --check` and cached checks passed.
- Parent read the complete initial 3,995-line diff, the complete repair diff, the added isolated real-D1 upgrade test, and final numeric claim changes. Matrix audit remains satisfied; tests execute production gateway/callers, authenticated API, local D1 and mounted UI with deterministic external effects.
- No deployment, remote migration, paid provider invocation, live period provisioning or reconciliation performed.

### Residual limits

A terminated worker or unavailable D1 cannot guarantee capture of a late response or a second evidence write. The previously committed reservation remains and the same logical call cannot redispatch; unresolved outcomes require evidence-backed operator reconciliation. Browser recovery requires session storage. Some unfinished mutations without durable completion proof deliberately remain conflicts. The approved 3.30 pricing policy still expires at 2026-10-03T14:01:49.000Z; no pricing refresh or budget increase was performed. Full executing-Workflow and staging/live acceptance remain stories 3.34 and 3.36–3.37.

### Files changed

- `_bmad-output/implementation-artifacts/spec-3-31-reserve-and-settle-paid-calls-atomically.md` — Story contract, individual review verdicts, verification and completion evidence.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Story completion tracking.
- `docs/llm-accounting.md` — Operator reconciliation, period provisioning and recovery-limit documentation.
- `migrations/0021_atomic_llm_accounting.sql` — Durable operations, immutable attribution/receipts, accounting authority and legacy backfill.
- `src/pipeline/agents/draftAndReview.test.ts` — Regression coverage for retry identity, accounting, upgrade, authorization, privacy or mounted UI at this surface.
- `src/pipeline/agents/draftAndReview.ts` — Stable Draft call identity and safe checkpoint replay.
- `src/pipeline/ai/gateway.test.ts` — Regression coverage for retry identity, accounting, upgrade, authorization, privacy or mounted UI at this surface.
- `src/pipeline/ai/gateway.ts` — Atomic admission/claim/settlement, durable replay and uncertain response handling.
- `src/pipeline/projector/evidence.test.ts` — Regression coverage for retry identity, accounting, upgrade, authorization, privacy or mounted UI at this surface.
- `src/pipeline/steering/submitTurn.test.ts` — Regression coverage for retry identity, accounting, upgrade, authorization, privacy or mounted UI at this surface.
- `src/pipeline/steering/submitTurn.ts` — Persistent submission identity, proven completion recovery and first-writer results.
- `src/pipeline/workflow/gatewaySeed.test.ts` — Regression coverage for retry identity, accounting, upgrade, authorization, privacy or mounted UI at this surface.
- `src/server.test.ts` — Regression coverage for retry identity, accounting, upgrade, authorization, privacy or mounted UI at this surface.
- `src/server.ts` — Authenticated reconciliation and required steering retry keys.
- `src/shared/api/adminApi.test.ts` — Regression coverage for retry identity, accounting, upgrade, authorization, privacy or mounted UI at this surface.
- `src/shared/api/publicApi.test.ts` — Regression coverage for retry identity, accounting, upgrade, authorization, privacy or mounted UI at this surface.
- `src/shared/api/publicRouter.ts` — Consistent transactional public accounting snapshot.
- `src/shared/db/repos/llmAccountingRepo.test.ts` — Regression coverage for retry identity, accounting, upgrade, authorization, privacy or mounted UI at this surface.
- `src/shared/db/repos/llmAccountingRepo.ts` — Atomic accounting transitions, numeric/anomaly guards and reconciliation receipts.
- `src/shared/db/repos/llmAccountingUpgrade.test.ts` — Regression coverage for retry identity, accounting, upgrade, authorization, privacy or mounted UI at this surface.
- `src/shared/db/repos/llmCallsRepo.ts` — Ledger statements and common accounting reads.
- `src/shared/db/repos/runsRepo.ts` — Authoritative Run totals and public snapshots.
- `src/shared/schemas/gateway.ts` — Typed operation errors and strict reconciliation input.
- `src/shared/schemas/run.ts` — Liability, operation and receipt response contracts.
- `src/shared/schemas/steering.ts` — Stable request ID input contract.
- `src/surfaces/admin/LoopControls.tsx` — Held and uncertain accounting display.
- `src/surfaces/admin/SteeringPanel.mount.test.tsx` — Regression coverage for retry identity, accounting, upgrade, authorization, privacy or mounted UI at this surface.
- `src/surfaces/admin/SteeringPanel.tsx` — Opaque browser recovery keys and explicit new-submission action.
- `src/surfaces/ops/EvidenceDetail.tsx` — Validated accounting detail, reconciliation evidence and operator fields.
- `src/surfaces/ops/RunLog.tsx` — Held and uncertain amounts alongside total accounting.
- `src/surfaces/ops/accounting.mount.test.tsx` — Regression coverage for retry identity, accounting, upgrade, authorization, privacy or mounted UI at this surface.
- `vitest.config.ts` — Isolated local D1 database for populated upgrade verification.
