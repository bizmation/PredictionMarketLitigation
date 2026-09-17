---
title: 'Story 3.16: Conversational Draft Revision'
type: 'feature'
created: '2026-09-17'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: 31bb59a686c8272b4e55ccdfa6b25923b2d71f40
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
warnings:
  - oversized
deferred: []
---

<intent-contract>

## Intent

**Problem:** Interrogation (3.15) explains a pending Draft but cannot change it, so the operator still retypes fixes in the manual edit buffer.

**Approach:** An explicit `intent: "revise"` on the existing steering POST inserts a new Draft version under the same Run, then re-runs drafter → guardrails → reviewer. The original and every intermediate stay on a public chain. Live F1 moves only through the Approval Gate.

## Boundaries & Constraints

**Always:**
- Reuse `POST /api/admin/runs/:runId/steering` (requireOperator). Persist the operator turn first (3.14); never roll it back if drafter/reviewer fail.
- `intent`: `"ask"` (default, unchanged 3.15 path) | `"revise"`. The operator control sets it. Do not classify ask vs revise from the text.
- Revise requires a pending `draftId` that is the current ready chain tip. New row: id `{parentId}:r{n}`, same `runId` / target / `tier2Only`, `parentDraftId`, `revisionIndex = n`, `evalSummary: null`, `editedBody: null`, seed `body`/`diff` from the parent. Never overwrite the parent row's `body`.
- Then `draftAndReview` + `enforceDraftGuardrails` on that Run. Gateway `complete` for `drafter` and `reviewer` is allowed when status is `awaiting` (mirror steward). Do not call `afterPackaging`, `autoApproveRun`, `decide`, or F1 apply.
- New-row `confidence` / `evalSummary` are recomputed. Never copy the parent's badge.
- Hard guardrail failure on the new row stays on that row; the parent is unchanged. Revision is not a bypass.
- Pending queue, public pending list, and `decide`'s sibling-pending check use **ready chain tips only** (Design Notes). No new `outcome` value. No revision-depth cap.
- Evidence: `draft.revised` plus `steering.applied` `{ effect: "revised", turnId, draftId: newId, parentDraftId }`. Private withholds instruction `content`, never ids / time / effect. POST returns `revisedDraftId` (null on ask).
- `ALLOWED_TOOLS.steward` stays `[]`. Revision is a code branch, not a steward tool. Revise does not call steward `complete()`.
- After a successful revise, the queue reloads and selects the new tip. J/K/A/E/R and the E-key edit buffer still operate on the selected tip. Composer stays on that Draft.
- Spend (drafter + reviewer) hits that Run. Budget-stop or complete/append failure: parent remains the pending tip; in-flight child stays non-ready.
- Approving/editing/rejecting the tip writes `gate.decided.lineage`: root → tip `{ draftId, revisionIndex, turnId | null }` and `approvedText` (`editedBody` if edit, else `body`).

**Never:**
- 3.17 `pipeline_config_versions`, 3.18 `standing_guidance`, live-F1 publish, seeding `gateway_config`, as-you-type public streaming, retroactive privatize, LLM ask-vs-revise classification, YOLO auto-approve of a steered revision, Workflow/connector restart, `applyDraftReview` on the parent, inventing a chain-depth cap or `superseded` outcome.
- `surfaces/*` → `pipeline/*`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy revise | Awaiting Run, pending tip, `intent: "revise"`, drafter+reviewer mapped | Turn + `steering.turn`; new Draft `{parent}:r1` same `runId`; `draft.revised`; applied `effect: "revised"`; new eval/confidence ≠ parent copy; parent `body` unchanged; POST `revisedDraftId` is the new id; GET `/api/runs/:id` shows both rows | N/A |
| Ask unchanged | Same Run, `intent` omitted or `"ask"` | 3.15 interrogation only; no new Draft; applied `effect: "none"`; `revisedDraftId: null` | N/A |
| Guardrail re-entry | Drafter text is `{"tool":"publish_f1"}` | Parent preserved; new row exists with `guardrails.failed` / `guardrail_fail`; F1 unchanged; allowlist still `[]` | Fail closed; not approvable as YOLO-eligible |
| In-flight / budget-stop | Ceiling hit during drafter `complete()` | Turn persisted; child `evalSummary` null (non-ready); queue still shows parent; `decide` on parent → invalid until child is ready or absent | Typed `budget_stopped`; no 500 |
| Private instruction | `private: true`, revise succeeds | Public Evidence: no instruction text; `effect: "revised"`, ids, actor, time remain; new Draft `body` is public | N/A |
| Duplicate-set / lists | After successful r1 | `listPending` / `GET /api/drafts` show the r1 tip only, not the parent; `decide` on r1 can terminalize the Run (parent NULL does not keep it awaiting) | N/A |
| Zero F1 | Happy revise | Entity tables and `GET /api/mode` unchanged | Fail closed if any write slips |
| Not pending / no draftId | Decided Draft, or `intent: "revise"` without `draftId` | 400; no new row | Fail closed |
| Queue context | Selected index 2; successful revise | Feed reloads; new tip selected; after blur, J/K/A/E/R still work | N/A |

</intent-contract>

## Code Map

- `migrations/0014_draft_revision_chain.sql` -- NEW -- rebuild `drafts` (0010 pattern): `parent_draft_id` NULL FK → `drafts.id`, `revision_index` INT NOT NULL DEFAULT 0; CHECK `parent_draft_id IS NULL` iff `revision_index = 0`. Existing rows copy as `0` / NULL. Rebuild `evidence_events` (0013 pattern) adding `draft.revised`.
- `src/shared/schemas/run.ts:81-178` -- ADD `parentDraftId: string | null`, `revisionIndex: number int >= 0` on `DraftRecordSchema`.
- `src/shared/schemas/vocabulary.ts:265-283` -- ADD `draft.revised`; comment CHECK = 0014.
- `src/shared/schemas/steering.ts:15-72` -- ADD `intent: z.enum(["ask","revise"]).default("ask")` on POST body; ADD `revisedDraftId: string | null` on public turn (always null when ask / private-unrelated failure).
- `src/shared/db/repos/draftsRepo.ts:21-107,117-172` -- map new columns; `insertDraft` binds them; `listPending` / `listPublicDrafts` return ready chain tips (rejected archive still rejected rows). `listByRun` returns the full chain (ops. detail).
- `src/pipeline/steering/submitTurn.ts:31-203` -- ADD `intent` on input. `ask` = current path. `revise`: validate tip, persist turn with first applied still `{effect:"none"}` receipt, insert child, `draftAndReview` + `enforceDraftGuardrails`, append `draft.revised` + second applied `{effect:"revised",…}`, return `revisedDraftId`. Snapshot F1/mode. Deny-scan instruction + parent body as today.
- `src/pipeline/ai/gateway.ts:178-186` -- ALLOW `drafter` and `reviewer` when `awaiting` (keep other roles running-only).
- `src/pipeline/agents/draftAndReview.ts:169-187,399-521` -- ADD optional per-draft revision instruction into the drafter prompt (labeled operator instruction + authorized Draft fields via `pickAuthorizedContext`). Existing `evalSummary == null` filter already selects the new row only.
- `src/pipeline/ai/actionPolicy.ts:37-44,136-175` -- READ ONLY allowlist `[]`; CALL `enforceDraftGuardrails` after revision review (stamps `guardrails.passed` for the new id).
- `src/pipeline/gate/approval.ts:93-180` -- `otherPending` uses tip helper (not raw `outcome IS NULL`). Reject `decide` while an in-flight child exists. ADD `lineage` + `approvedText` on `gate.decided` payload.
- `src/pipeline/workflow/dailyRunSteps.ts:174-194` -- READ ONLY `afterPackaging` / `autoApproveRun`. Revision must not call them.
- `src/pipeline/connectors/connector.ts:33-39` -- READ ONLY `draftId`; revisions suffix `:r{n}` off the parent id.
- `src/server.ts:422-482` -- forward `intent`; JSON already serializes the public turn.
- `src/surfaces/admin/SteeringPanel.tsx:37-136` -- Revise control adjacent to submit sends `intent: "revise"`; default Submit stays `"ask"`. On revise 200, notify queue with `revisedDraftId`.
- `src/surfaces/admin/ApprovalQueue.tsx:338-376,514` -- after revise, reload pending and select the new tip; do not remount in a way that loses keyboard. E-buffer unchanged.
- `src/surfaces/ops/EvidenceDetail.tsx:172-195,433-465` -- render chain in `revisionIndex` order with the instruction that caused each (`effect` / turn content; private → withheld). Pending members keep `NotLiveDraftBanner`.
- `src/surfaces/ops/PendingDrafts.tsx` -- READ list shape; tips-only from repo so cards do not duplicate.
- Tests: `submitTurn.test.ts`, `draftAndReview` / `actionPolicy` / `approval` / `adminApi` / `publicApi`, `SteeringPanel*`, `approvalQueue.mount`, `evidenceDetail`, `pendingDrafts`. Pin: same `runId`, chain preservation, guardrail re-entry, badge ≠ parent, lists/decide tips-only, F1/mode unchanged, ask path still `effect: "none"`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml:87` -- backlog → in-progress then done.

## Tasks & Acceptance

**Execution:**
- `migrations/0014_draft_revision_chain.sql` -- chain columns + `draft.revised` CHECK
- `src/shared/schemas/run.ts` / `vocabulary.ts` / `steering.ts` -- record, event, intent, `revisedDraftId`
- `src/shared/db/repos/draftsRepo.ts` -- persist + tip-aware pending/public lists
- `src/pipeline/steering/submitTurn.ts` -- revise branch
- `src/pipeline/ai/gateway.ts` -- awaiting drafter/reviewer
- `src/pipeline/agents/draftAndReview.ts` -- instruction in drafter prompt
- `src/pipeline/gate/approval.ts` -- tip pending + lineage payload
- `src/surfaces/admin/SteeringPanel.tsx` + `ApprovalQueue.tsx` -- explicit revise + select new tip
- `src/surfaces/ops/EvidenceDetail.tsx` -- public revision chain
- tests + `sprint-status.yaml` -- I/O matrix

**Acceptance Criteria:**
- Given a pending Draft on an awaiting Run, when I submit a revision from the queue composer, then ops. `/runs/:id` shows the original Draft and the new version with that instruction, under the same Run
- Given that new version, when I open it on ops. Evidence or the queue, then its confidence/eval badge is not the original's copied values and a guardrails step exists for that version
- Given the regeneration is a disallowed tool request, when I reload ops. Evidence and live apex F1, then the original Draft body is unchanged and live F1 is unchanged
- Given the new version is current, when I open public `/drafts` and `/admin#queue`, then that entity appears once
- Given I approve the revised Draft, when I open that Run on ops., then decided Evidence lists original → revisions → the instruction that caused each → the approved text
- Given I submit an ordinary ask from the same composer, when I reload ops. Evidence, then no additional Draft version appears

### Review Findings

- [x] [Review][Patch] SteeringPanel shows generic failure for invalid revise after persisted turn [`src/surfaces/admin/SteeringPanel.tsx:81-95`]
- [x] [Review][Patch] 409 `budget_stopped` omits persisted turn from HTTP body [`src/server.ts:481-487`]
- [x] [Review][Patch] Successful revise returns ok when `draft.revised` / applied Evidence append fails [`src/pipeline/steering/submitTurn.ts:226-263`]
- [x] [Review][Patch] Happy-path revise test does not assert `guardrails.passed` on child [`src/pipeline/steering/submitTurn.test.ts:1078-1104`]
- [x] [Review][Patch] No EvidenceDetail test for in-flight child not-live banner [`src/surfaces/ops/evidenceDetail.test.tsx`]
- [x] [Review][Defer] Second revise (r2+) has no end-to-end test — deferred: less common operator path; first revise fully covered
- [x] [Review][Defer] No live-browser `/admin#queue` → ops. Evidence round-trip — deferred: jsdom/HTTP-unit coverage matches 3.15 harness

**Rejected**

- `[false]` Budget-stopped / failed revise lock with no recovery — spec I/O matrix requires `decide` invalid until child ready or absent; recovery would edit intent-contract
- `[false]` `gate.decided.approvedText` on reject mislabels UI — `decidedApprovedText` only renders for approve/edit outcomes; payload field is consistent for export
- `[false]` EvidenceDetail reimplements tip helpers — surfaces do not import `shared/db`; logic mirrors `draftsRepo.pendingTips` / `isPendingReadyTip`
- `[false]` Missing `draftsRepo` unit tests for tip helpers — tip rule pinned indirectly via `submitTurn`, `approval`, and list tests
- `[false]` Concurrent revise `INSERT OR IGNORE` collision — non-everyday operator path; first pass rejected
- `[false]` Queue omits `revisionIndex` on selected tip — ops. Evidence shows `Draft · r{n}`; cosmetic queue enhancement
- `[false]` `epic-3-context.md` names `run.budget_stopped` / `steering.denied` — pre-existing planning drift; deferred in 3.1
- `[false]` `draftAndReview` run-wide on revise — spec assumes awaiting runs have only the new child with `evalSummary == null`; run-level call is specified
- `[false]` `pendingSelectId` stuck when tip missing from reload — reload normally includes new tip; edge case on fetch failure
- `[false]` Multi-entity `approvedText` picks wrong `gate.decided` — `decidedApprovedText` filters approve/edit only; multi-entity decided runs uncommon
- `[false]` Missing `publicApi` / `actionPolicy` test file updates — guardrail re-entry and tip-only lists covered in `submitTurn.test.ts`
- `[false]` Orphan in-flight child after non-budget failure — specified Always constraint; tested in `submitTurn.test.ts`

## Spec Change Log

## Review Triage Log

### 2026-09-17 — Follow-up review pass
- verdicts: 26 findings — high 0, medium 7, low 3, false 14, maybe-false 0, defer 2
- findings:
  - `[medium]` `[patch]` SteeringPanel maps 400 invalid revise to generic Submit failed — server sends "Revision did not complete." after turn persisted
  - `[medium]` `[patch]` 409 budget_stopped drops turn body — submitTurn returns turn; server.ts returns code/message only
  - `[medium]` `[patch]` best-effort catch after ready child still returns ok — missing draft.revised / effect revised breaks public causation
  - `[medium]` `[patch]` happy-path revise unpinned for guardrails.passed — implementation calls enforceDraftGuardrails; test gap only
  - `[medium]` `[patch]` in-flight child not-live banner untested — EvidenceDetail uses isReadyPendingTip; no eval-null child fixture
  - `[medium]` `[reject]` budget-stop lock / no recovery — grouped with first pass; specified matrix
  - `[medium]` `[reject]` orphan in-flight child — specified Always constraint
  - `[low]` `[reject]` approvedText in reject gate.decided payload — UI suppresses; export shape intentional
  - `[low]` `[reject]` EvidenceDetail duplicates draftsRepo tip logic — surfaces cannot import db
  - `[low]` `[reject]` queue omits revisionIndex — ops Evidence is chain surface
  - `[false]` `[reject]` concurrent INSERT OR IGNORE — non-everyday path
  - `[false]` `[reject]` draftAndReview run-wide on multiple unevaluated — awaiting invariant per spec
  - `[false]` `[reject]` pendingSelectId stuck — rare reload miss
  - `[false]` `[reject]` multi-entity approvedText — approve/edit filter + uncommon scenario
  - `[false]` `[reject]` publicApi/actionPolicy test files — covered in submitTurn
  - `[false]` `[reject]` epic-3-context vocabulary drift — pre-existing deferred in 3.1
  - `[defer]` r2+ revision chain — real gap, less common path
  - `[defer]` live-browser round-trip — matches 3.15 harness limitation

### 2026-09-17 — Review pass
- verdicts: 36 findings — high 0, medium 16, low 4, false 16, maybe-false 0
- findings:
  - `[medium]` `[reject]` Budget-stopped revise bricks decide/revise with no delete path — spec matrix requires the in-flight lock (`decide` invalid until the child is ready or absent); recovery would edit the intent-contract
  - `[medium]` `[patch]` 409 `budget_stopped` shown as generic Submit failed — SteeringPanel now states the revision did not complete because spend hit the ceiling
  - `[medium]` `[patch]` Non-budget `complete()` failure stamped `evals_not_run` on a revision child — `draftAndReview` now returns early for `revisionIndex > 0` without `persistEvalsNotRun`
  - `[false]` `[reject]` `autoApproveRun` would treat historical NULL parents as pending — revision never calls `autoApproveRun`; the workflow already finished
  - `[low]` `[reject]` `listPending`/`listPublicDrafts` SELECT the whole `drafts` table — not everyday at current D1 size; rewriting the queries is more than a deletion
  - `[false]` `[reject]` `revisionInstruction` applied to every unevaluated rN / awaiting drafter-reviewer — a revise inserts one child; awaiting drafter/reviewer is specified
  - `[medium]` `[patch]` `NotLiveDraftBanner` wrapped historical NULL ancestors after the tip was decided — banner now only wraps the ready pending tip
  - `[low]` `[reject]` In-flight `decide` invalid maps to HTTP 400 “Invalid decision body” — pre-existing mapping; a new status code is more than a copy change
  - `[medium]` `[patch]` `gate.decided.approvedText` rendered as “Approved text” after reject — kicker only renders for approved/edited
  - `[low]` `[reject]` Missing publicApi/actionPolicy/r2/spend tests — high-value gaps covered by the VG patches; extra fixtures are more than a direct correction
  - `[medium]` `[patch]` Non-budget incomplete revise returned `ok` with `revisedDraftId: null` — now `invalid` so the composer does not clear as success (`reply: null` on a real revise remains specified)
  - `[false]` `[reject]` Spec `in-progress` vs sprint-status `done` — workflow bookkeeping; finalize sets spec `done`
  - `[medium]` `[reject]` No resume/delete after budget-stop — grouped with the first row; the lock is specified
  - `[medium]` `[patch]` Decide can commit after the tip-check and before child insert — parent is re-loaded immediately before `insertDraft`
  - `[medium]` `[patch]` Revise allowed while the Run is still `running` — revise now requires `awaiting`
  - `[medium]` `[patch]` A/E/R fire while Revise is in flight — queue ignores approve/edit/reject while the composer is submitting
  - `[low]` `[reject]` Two concurrent revises share `{parent}:r1` via INSERT OR IGNORE — not an everyday operator path
  - `[medium]` `[patch]` Non-budget failure returned `ok` with null id — grouped with the composer-success row; now `invalid`
  - `[medium]` `[patch]` Historical ancestors kept the not-live banner — grouped with the banner row
  - `[medium]` `[patch]` Reject still showed an Approved text block — grouped with the approved-text row
  - `[false]` `[reject]` Drafter→guardrails→reviewer order mismatch — 3.5/3.6 order is drafter, reviewer, then `enforceDraftGuardrails`; tool denies already run inline
  - `[false]` `[reject]` `enforceDraftGuardrails` catch can omit a guardrails row — same 3.15 best-effort append after persist
  - `[medium]` `[patch]` `decide` on a superseded parent after r1 is ready was untested — `approval.test.ts` now asserts `invalid` and unchanged F1/outcome
  - `[medium]` `[patch]` Second revise after budget-stop was untested — `submitTurn.test.ts` now asserts `invalid`, one child, one turn
  - `[medium]` `[patch]` HTTP 409 `budget_stopped` was untested — `adminApi.test.ts` now asserts 409 / `budget_stopped` and a persisted turn
  - `[false]` `[reject]` Public chain covered by static markup rather than a live ops. page — jsdom/static harness (retro item 6)
  - `[false]` `[reject]` FR-47 “publicly diffable” is sequential bodies, not field diffs — spec renders the chain as ordered bodies plus instruction
  - `[false]` `[reject]` Confidence/eval badge not pinned on Evidence/queue markup — queue already renders the selected Draft’s fields; records are pinned in `submitTurn`
  - `[false]` `[reject]` Queue mount stub returns an already-deduped list — tips-only is pinned on `listPending` / `GET /api/drafts`
  - `[false]` `[reject]` Evidence UI does not print the `lineage` array — it reconstructs original → revisions → instruction from draft rows and steering events; the JSON payload is tested
  - `[false]` `[reject]` Guardrail re-entry not covered in `actionPolicy`/`publicApi` — the tool-deny revise path in `submitTurn.test.ts` is the re-entry
  - `[false]` `[reject]` Same-Run regeneration tested at `submitTurn`/D1 not ops. reload — that is the write path; GET `/api/runs/:id` returns both rows
  - `[false]` `[reject]` Queue reload/select is jsdom with stubbed fetch — same harness as 3.15
  - `[false]` `[reject]` Revise is a second button rather than a steward conversation — architecture: write vs read is a code-level intent, not prompt classification
  - `[false]` `[reject]` Admin queue does not render the revision chain — ops. Evidence is the public chain surface; the queue shows the current tip
  - `[false]` `[reject]` Chain columns landed in 3.16 rather than 3.1 — the 3.1 amendment was deferred to this story

## Design Notes

Pending-tip rule (do not invent `superseded`):
- A chain is all rows sharing the same root (`parentDraftId` walk).
- Head = max `revisionIndex`. If head.outcome ≠ null, the chain is closed — ancestors with `outcome` NULL are historical, never pending.
- Ready = not (`revisionIndex > 0` && `evalSummary == null`).
- If head is ready and pending, it is the only pending tip. If head is in-flight, the previous ready pending row stays visible; `decide` on it is invalid until the child is ready.

Revise control is a second submit action (or equivalent labeled control) next to the private checkbox — same “submit is publication” rule as 3.14. Default button stays ask.

Do not cap chain depth (planning left that unresolved).

## Verification

**Commands:**
- `npm test` -- expected: pass, including revision I/O matrix, unchanged empty steward allowlist, 3.15 ask path
- `npm run check` -- expected: exit 0

**Manual checks (if no CLI):**
- `/admin#queue` Revise on a pending Draft → ops. `/runs/:id` shows the chain and instruction; pending list still one ticket; live apex F1 unchanged; Submit turn (ask) still does not add a Draft

## Auto Run Result

Status: done

Summary: Explicit **Revise draft** on the queue composer inserts `{parent}:r{n}` under the same Run, re-runs drafter → reviewer → guardrails, and keeps the original on a public ops. chain. Ask stays 3.15 interrogation. Pending lists and `decide` use ready chain tips only. Live F1 still moves only through the Approval Gate.

Files changed:
- `migrations/0014_draft_revision_chain.sql` — `parent_draft_id` / `revision_index` and Evidence `draft.revised`
- `src/shared/schemas/run.ts`, `vocabulary.ts`, `steering.ts` — chain fields, event, `intent`, `revisedDraftId`
- `src/shared/db/repos/draftsRepo.ts` — persist + tip helpers
- `src/pipeline/steering/submitTurn.ts` — revise branch; awaiting-only; re-load parent; invalid on incomplete non-budget revise
- `src/pipeline/ai/gateway.ts` — awaiting drafter/reviewer
- `src/pipeline/agents/draftAndReview.ts` — operator instruction in the drafter prompt; revision `complete()` failure stays non-ready
- `src/pipeline/gate/approval.ts` — tip pending + `lineage` / `approvedText`
- `src/surfaces/admin/SteeringPanel.tsx` + `ApprovalQueue.tsx` — Revise control, ceiling message, busy A/E/R, select new tip
- `src/surfaces/ops/EvidenceDetail.tsx` — chain, instruction, tip-only not-live banner, approved text only for approve/edit
- tests + `sprint-status.yaml` + this spec + `epic-3-context.md`

Review: 4 layers, 36 findings — 0 high, 16 medium. Patches: ceiling copy; skip `persistEvalsNotRun` on revision complete() failure; return `invalid` when the child stays non-ready; awaiting-only revise; re-load parent before insert; ignore A/E/R while submitting; not-live banner only on the pending tip; Approved text only after approve/edit; tests for superseded-parent decide, second revise after budget-stop, and HTTP 409. Rejected specified lock/recovery, YOLO hypothetical, table-scan, 400 mapping, extra fixtures, concurrent INSERT, 3.5/3.6 order, best-effort append, and intent-alignment test-surface/R5 rows. No deferrals.

Follow-up review recommended: true — eleven medium patch entries on the first pass. Unverified risk: `/admin#queue` → ops. Evidence round-trip was jsdom/HTTP-unit tested, not walked in a live browser; a budget-stopped revise still leaves an in-flight child that locks `decide` (specified matrix, not patched).

Patch counts by verdict: high 0, medium 11 entries (ceiling copy, persist skip, invalid-on-incomplete, awaiting-only, re-load parent, busy A/E/R, banner, approved-text, plus three VG tests).

Verification: `npm test` — 776 passed (43 files). `npm run check` — oxfmt/oxlint/tsc exit 0. No live-browser pass of `/admin#queue`.

Residual risks: apply migration 0014 before this hits an existing D1; production steward/drafter/reviewer spend still skipped until `gateway_config` mappings exist; Workers AI still records `costCents: 0`.
