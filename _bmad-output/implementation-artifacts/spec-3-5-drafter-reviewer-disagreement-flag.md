---
title: 'Story 3.5: Drafter, Reviewer & Disagreement Flag'
type: 'feature'
created: '2026-09-09'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 7c3a8fab3b01245288c466a164294cb03458b365
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The daily loop packages Drafts from connector stubs with `evalSummary: null` and no model calls. There is no drafter/reviewer pass, so confidence/eval cannot be honest and drafter/reviewer dissent cannot appear on Evidence.

**Approach:** After 3.4 packaging, run one drafter call then one reviewer call per Draft through `gateway.complete({ role })`. Drafter overwrites that Draft's `body`/`diff`. Reviewer returns JSON scores; `confidence` is that integer (or explicit `evals not run` / `eval-fail`). Persist FR17 ineligibility inputs on the Draft. Disagreement is reviewer-declared: flag Evidence iff `disagrees === true` with a short description. No ops UI this story.

## Boundaries & Constraints

**Always:**
- Agents call `gateway.complete({ role: "drafter" | "reviewer", runId, prompt })` only; no ad-hoc SDKs or hardcoded model ids outside `pipeline/ai`
- Empty packaging (`draftCount === 0`) makes zero LLM calls
- Drafts never write live F1; YOLO does not run; HITL remains the default
- Every Draft that exists after this step has an explicit eval status: `ok` | `eval_fail` | `evals_not_run` — never leave `evalSummary` null as a hidden "not run"
- Scoring (readiness m7): reviewer text must parse as `{ confidence: 0-100, citationCompleteness: 0-100, notes: string, disagrees: boolean, disagreement: string }`. Badge = `confidence` (integer). Unparseable / missing `confidence` or `citationCompleteness` → `eval_fail`. `notes` is the public basis
- Disagreement (FR29): flag iff `disagrees === true`. If `disagrees` is true and `disagreement` is empty, that Draft is `eval_fail` (no flag). Missing `disagrees` = false
- FR17 inputs recorded on the Draft (`tier2_only`, `below_threshold`, `eval_fail`, `evals_not_run`); 3.13 consumes them later. Below-threshold uses a versioned constant `AUTO_APPROVE_CONFIDENCE_THRESHOLD = 70` until 3.13 makes it operator-configurable
- `pipeline/*` is server-only; never imported by `surfaces/*`; never imports React
- Workflow retries are idempotent: skip a Draft whose `evalSummary` is already non-null; Evidence ids are deterministic (`INSERT OR IGNORE`)
- Per-Draft gateway/provider errors do not strand Drafts on `failed` — keep the gate path (`awaiting`) and mark that Draft `evals_not_run`. Budget-stop still marks the Run `stopped` (gateway already does)

**Never:**
- No ops/admin UI, badges, or disagreement chrome (3.8 renders the flag; 3.9 renders the badge). Public expose this story is `GET /api/runs/:id` Draft fields + Evidence events
- No guardrails, tool allowlists, scoped identity, or adversarial injection fixtures (3.6)
- No live connector HTTP; do not rewrite 3.4 packaging
- No ChatAgent / `createWorkersAI` migration
- No edits to migrations `0001`–`0007` (new event names go in `0008`)
- No `yolo` role calls

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Empty poll | `monitorAndPackage` returns 0 drafts | No gateway calls; Run completes `empty` as today | N/A |
| Material Drafts, both roles succeed | ≥1 Draft, fake provider returns parseable reviewer JSON | Drafter overwrites `body`/`diff`; `confidence` = reviewer integer; `evalSummary.status = ok`; `draft.evaluated` evidence; Run `awaiting` | N/A |
| Reviewer output unusable | Reviewer text is not valid JSON or lacks `confidence` / `citationCompleteness` | Draft `evalSummary.status = eval_fail`; `ineligible` includes `eval_fail`; still `awaiting` | No throw |
| Budget-stop mid-review | Ceiling hit on a reviewer (or later) call | Gateway marks Run `stopped` + `run.stopped`; remaining Drafts `evals_not_run` | Catch `budget_stopped`; do not call further |
| Provider/config error on one Draft | `provider_error` / `gateway_not_configured` / `role_not_configured` | That Draft `evals_not_run`; other Drafts continue; Run `awaiting` if any Draft exists | Catch per Draft |
| Tier-2 Draft | `tier2Only === true` | `ineligible` includes `tier2_only` even when evals succeed | N/A |
| Disagreement | Reviewer JSON `{ disagrees: true, disagreement: "…" }` | `draft.evaluated` payload + `evalSummary.disagreement` carry flagged + description | N/A |
| Disagrees without description | `{ disagrees: true, disagreement: "" }` | `eval_fail`; no disagreement flag | No throw |
| Step retry | `evalSummary` already set | Skip LLM; no duplicate `draft.evaluated` | N/A |

</frozen-after-approval>

## Code Map

- `src/pipeline/workflow/dailyRun.ts` -- after `monitorAndPackage`, add `step.do("draft-and-review")` before `completeDailyStep`; skip when `draftCount === 0`
- `src/pipeline/workflow/dailyRunSteps.ts` -- `completeDailyStep` / `monitorAndPackage` stay; do not fold LLM into connectors
- `src/pipeline/connectors/connector.ts` -- READ ONLY; keep stub packaging + `evalSummary: null` at insert
- `src/pipeline/ai/gateway.ts` -- reuse `complete` + `createWorkersAiProvider`; inject `GatewayDeps` into the new step (tests: fake `LlmProvider` like `gateway.test.ts:46-68`)
- `src/pipeline/ai/gateway.test.ts` -- `seedConfig` pattern to copy for drafter+reviewer role maps
- `src/shared/db/repos/draftsRepo.ts` -- ADD `applyDraftReview` UPDATE of `body`, `diff_json`, `confidence`, `eval_summary_json`, `updated_at` (validate-before-write). `insertDraft` stays 3.4's create path
- `src/shared/db/repos/evidenceRepo.ts` -- reuse `appendEvent`
- `src/shared/schemas/vocabulary.ts` -- add `draft.evaluated` to `EVIDENCE_EVENT_VALUES` (must match 0008 CHECK)
- `src/shared/schemas/run.ts` -- pin `EvalSummarySchema`: `{ status: ok|eval_fail|evals_not_run, basis: string, citationCompleteness: 0-100|null, disagreement: { flagged, description|null }, ineligible: ("tier2_only"|"below_threshold"|"eval_fail"|"evals_not_run")[] }`; `DraftRecordSchema.evalSummary` uses it (nullable only pre-review)
- `migrations/0006_run_draft_evidence.sql` -- DO NOT EDIT; `confidence` / `eval_summary_json` already exist (L131-135)
- `migrations/0008_draft_evaluated.sql` -- NEW — recreate `evidence_events.event` CHECK including `draft.evaluated` (0003-style table rebuild if D1 cannot ALTER CHECK)
- `src/shared/api/publicRouter.ts` -- READ ONLY; `GET /api/runs/:id` already returns Draft `confidence`/`evalSummary`
- `src/pipeline/agents/` -- NEW module: `draftAndReview(db, runId, gatewayDeps)` orchestrates per-Draft drafter→reviewer; prompts stay in this module, not in the workflow

## Tasks & Acceptance

**Execution:**
- [x] `migrations/0008_draft_evaluated.sql` -- NEW -- admit `draft.evaluated` on `evidence_events.event` -- FR29/FR24 Evidence write
- [x] `src/shared/schemas/vocabulary.ts` + `run.ts` -- event string + pin `EvalSummarySchema` -- public contract
- [x] `src/shared/db/repos/draftsRepo.ts` -- ADD `applyDraftReview` -- persist drafter overwrite + eval in one UPDATE
- [x] `src/pipeline/agents/draftAndReview.ts` -- NEW -- per Draft: skip if `evalSummary` set; `complete({ role: "drafter" })` then reviewer; apply review; `draft.evaluated` evidence; catch per-Draft gateway errors as `evals_not_run`; stop further calls on `budget_stopped` -- the generation seam
- [x] `src/pipeline/workflow/dailyRun.ts` + `dailyRunSteps.ts` -- new durable `draft-and-review` step; empty runs never call it -- durability / no spend on empty days
- [x] `src/pipeline/agents/draftAndReview.test.ts` -- NEW -- Vitest + D1 + fake provider: I/O matrix (empty/no-call, success overwrite, eval-fail, budget-stop remainder, per-Draft error keeps awaiting, tier2 ineligible, disagreement flag, retry skip) -- the I/O matrix

**Acceptance Criteria:**
- Given a Run with no Drafts, when the daily workflow runs, then no `gateway.complete` occurs and the Run completes `empty`
- Given packaged Drafts and configured drafter/reviewer models, when `draft-and-review` runs, then each Draft's body/diff is the drafter output, `confidence`/`evalSummary` are set, and `draft.evaluated` is on Evidence
- Given a reviewer JSON with `disagrees: true` and a description, when evaluated, then Evidence carries the disagreement flag plus that description
- Given Tier-2-only, below-threshold, eval-fail, or evals-not-run, when the Draft is persisted, then `evalSummary.ineligible` lists that reason
- Given the reviewer cannot be scored, when the step finishes, then the badge state is explicit `evals not run` or `eval-fail`, never a blank `evalSummary`

### Review Findings

Code review of `7c3a8fa..aa4780e` (2026-09-10). Layers: Blind Hunter, Edge Case Hunter, Verification Gap, Acceptance Auditor.

- [x] [Review][Patch] Persist `draft.evaluated` and the Draft UPDATE atomically so a Workflow retry cannot freeze a stale FR29 payload [`src/pipeline/agents/draftAndReview.ts:164-193`]
- [x] [Review][Patch] If persist throws in the per-Draft catch, still stamp remaining Drafts `evals_not_run` and rethrow [`src/pipeline/agents/draftAndReview.ts:283-306`]
- [x] [Review][Patch] Drive `DailyRunWorkflow.run` sequencing from tests so omitting `draft-and-review` or the empty `afterPackaging` call fails [`src/pipeline/workflow/dailyRun.ts:72-116`]
- [x] [Review][Patch] Pin `afterPackaging` zero-draft + connector failure as `failed`, not `empty` [`src/pipeline/workflow/dailyRun.test.ts:324-335`]
- [x] [Review][Patch] Assert `draft.evaluated` on eval_fail and evals_not_run persist paths [`src/pipeline/agents/draftAndReview.test.ts:229-352`]

Rejected:
- `false` 0008 drops 0006's non-empty evidence id CHECK (blind+edge+acceptance) — at the 3.5 baseline, 0006 was `id TEXT PRIMARY KEY NOT NULL` with no trim CHECK; 0008 matches that rebuild. The CHECK on current working-tree 0006 is later uncommitted work.
- `false` persist should not write `draft.evaluated` for `evals_not_run` — persist is the evaluation record; `evalSummary.status` on the Draft distinguishes not-run; the spec's public expose is Draft fields plus this event.
- `low` `draft.evaluated` payload omits status/ineligible/confidence — GET already returns `evalSummary` on Drafts; adding payload fields is new public surface 3.8 can join.
- `false` `eval_fail` from empty disagreement still stores reviewer `confidence` — `ineligibleFor` needs that integer for `below_threshold`; `evalSummary.status` is already `eval_fail`.
- `false` `run_not_found` / `unknown_role` in the per-Draft continue set — `unknown_role` is not thrown by this caller; extra continue codes keep `awaiting` instead of stranding on `failed`.
- `low` `GatewayDeps.provider` is non-nullable so production casts `createWorkersAiProvider` — `complete()` already throws `gateway_not_configured` when the provider is missing.
- `false` GET `/api/runs/:id` never round-trips `EvalSummary` — the router already maps through `DraftRecordSchema`; no failing round-trip was shown.
- `low` no repo tests for `applyDraftReview` / `getById` — those writes are exercised through `draftAndReview.test.ts`.
- `false` one fixture omits both scorer fields — `ReviewerOutputSchema` fails the same way if either field is missing.
- `low` no drafter-success + reviewer `role_not_configured` case — same per-Draft catch as the tested `provider_error` path; catch persist keeps the in-memory overwrite.
- `low` `EvalSummarySchema` does not encode comment-level invariants — only this writer exists; refinements add complexity without a bad row.
- `false` `parseDrafter` accepts `diff: {}` — empty record matches the stated JSON shape.
- `low` `vocabulary.test.ts` does not pin `draft.evaluated` — that file never pinned `EVIDENCE_EVENT_VALUES`; 0008's CHECK is the DDL pin.
- `false` combined ineligible reasons untested — `ineligibleFor` pushes independent flags; each reason is covered.
- `low` below-threshold asserts `toBe(69)` instead of `THRESHOLD - 1` — the input already uses the constant; a threshold change fails the test loudly.
- `false` `disagrees: false` drops a description / whitespace-only description untested — spec flags iff `disagrees === true`; whitespace is trimmed into the same empty-description branch as `""`.
- `low` production `gatewayDepsFromEnv` omits `now` / `newId` — persist vs `llm_calls` timestamps are different events; they are not required to match.
- `false` empty reviewer `notes` stored as `ok` with blank basis — `notes` is a valid JSON string; the spec did not add a non-empty fail mode.

## Implementation Notes

- Wired `draft-and-review` as its own Workflow `step.do` in `dailyRun.ts` (not folded into connectors). Empty packaging still completes inside `run-daily-step` and never enters the LLM step. `completeDailyStep` is skipped when the Run is already `stopped`.
- `dailyRunSteps.ts` unchanged: `monitorAndPackage` / `completeDailyStep` stay the 3.4 contract.
- Scoring method (m7): reviewer JSON `{ confidence, citationCompleteness, notes, disagrees, disagreement }`; badge is the integer; unparseable → `eval_fail`.
- Crash window between gateway return and `applyDraftReview` can double-call on retry (accepted in Design Notes).

## Spec Change Log

## Review Triage Log

| # | Source | Verdict | Evidence / disposition |
|---|--------|---------|------------------------|
| 1 | blind+edge | medium | persist UPDATEs then appends `draft.evaluated`. Crash/throw after UPDATE leaves `evalSummary` set so retry skips and Evidence is never written. Real at `draftAndReview.ts` persist. → patch (append event first). |
| 2 | blind+edge | medium | Non-gateway throw mid-loop skips remaining Drafts (`evalSummary` stays null) then `finishFailed`. Always-rule wants an explicit status after this step. Whitespace-only drafter `body` is one trigger (`min(1)` then D1 trim CHECK). → patch. |
| 3 | blind+vgap | medium | `DailyRunWorkflow.run` sequencing (skip LLM on empty; review then complete only if still `running`) is never executed under test. Deleting the step would keep helper tests green. → patch (extract + `dailyRun.test.ts`). |
| 4 | blind | low | Budget-stop after a parseable drafter persists overwritten body + `evals_not_run`. Matrix does not require rollback. Reject: extra rollback complexity; not everyday. |
| 5 | blind | low | `EvalSummarySchema` does not encode comment-level invariants. Only this writer exists. Reject: refinements add complexity without a demonstrated bad row. |
| 6 | blind | low | `publicApi.test.ts` still uses `eval_summary_json` NULL. GET already maps via Zod; new shape is covered through `draftsRepo`. Reject. |
| 7 | blind+vgap | medium | Missing `disagrees` is specified as false but every fixture includes the key. → patch (one test). Other B7 cases: `role_not_configured` shares the per-Draft catch (`false` unique defect); `disagrees: null` and later-draft budget-stop are low/unexercised and rejected. |
| 8 | vgap | medium | `confidence === 70` untested; `<` vs `<=` would still pass 69/72. → patch. |
| 9 | blind | false | Markdown-fenced JSON is not valid JSON; matrix maps that to `eval_fail`. Working as specified. |
| 10 | blind | false | `applyDraftReview` without `eval_summary_json IS NULL` is the spec's orchestrator skip, not a second writer. |
| 11 | blind | false | Overwriting the packaging shell is the frozen Approach ("Drafter overwrites body/diff"). |
| 12 | blind | low | Empty `notes` → `basis: ""` with `ok`. Reject: valid JSON string; tightening would add a new fail mode the spec did not ask for. |
| 13 | blind | false | `dailyRunSteps.ts` unchanged is recorded in Implementation Notes; the durable step lives in `dailyRun.ts`. |
| 14 | blind | low | `as LlmProvider` hides `null`; `complete()` already throws `gateway_not_configured`. Reject. |
| 15 | edge | false | `finishFailed` after budget-stop: `draftAndReview` swallows `budget_stopped` and returns; `completeRun` also no-ops unless status is `running`. Catch does not run on the happy budget-stop path. |
| 16 | edge | false | Unparseable drafter keeping the shell is Design Notes, not an AC miss for the success path. |

## Design Notes

- Connector stub `body` is a packaging shell. After this story the Draft `body` column is the drafter's original agent text (schema comment on `DraftRecordSchema`); operator edits still go to `editedBody` later.
- Public badge UI is 3.9; this story only fills the fields 3.1 already serializes.
- `llm_calls` remains the per-call spend Evidence; do not add `llm.*` evidence events.
- Crash between gateway return and `applyDraftReview` can double-call on Workflow retry; skip-if-`evalSummary`-set covers the success path. Accept the crash window.
- Drafter text is JSON `{ "body": string, "diff": { "<field>": { "from": unknown, "to": unknown } } }` (same `diff` shape as 3.4). Unparseable drafter output → do not overwrite body/diff; still call reviewer; if the shell body remains, evaluation continues.
- Reviewer success example: `{"confidence":72,"citationCompleteness":90,"notes":"Tier-1 docket event supports the operationalStatus change.","disagrees":false,"disagreement":""}`
- Flagged example: `{"confidence":40,"citationCompleteness":30,"notes":"Drafter overstates the holding.","disagrees":true,"disagreement":"Reviewer does not agree the posture flipped."}`

## Verification

**Commands:**
- `npm test` -- expected: all suites pass incl. `pipeline/agents/draftAndReview.test.ts`
- `npm run check` -- expected: exit 0 (oxfmt + oxlint + tsc)
