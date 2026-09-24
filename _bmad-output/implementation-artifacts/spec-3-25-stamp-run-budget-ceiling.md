---
title: 'Stamp the budget ceiling onto each new Run'
type: 'bugfix'
created: '2026-09-24'
status: 'done'
baseline_revision: 96b9215b36a57809faff9e7f856958ef33c3b32b
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      Restore the explicit 3.23–3.25-before-3.22 deployment sequence in the generated Epic 3 context.
    evidence: |-
      Context regeneration replaced the explicit sequence with a general dependency paragraph. The approved 2026-09-23 sprint change proposal still states the order, but future agents relying solely on the cached context could miss it. Review policy defers edits to agent-context files.
    location: >-
      _bmad-output/implementation-artifacts/epic-3-context.md: Cross-Story Dependencies
    severity: low
---

<intent-contract>

## Intent

**Problem:** Production Run creation stores a null budget even when gateway configuration supplies a ceiling. The public run log and detail show spend without the ceiling, and the fallback budget can change during an existing Run.

**Approach:** Snapshot the configured default onto each newly created scheduled, catch-up, or manual Run. Display its recorded ceiling on the public Run list and detail, and retain the gateway's existing priority for the Run's own budget.

## Boundaries & Constraints

**Always:** Read the configured value, not a hard-coded 500. Preserve a zero ceiling. Existing or retried Runs keep their recorded budget, including null. When configuration is absent or its budget is null, new Runs retain null; preserve existing gateway fallback and fail-closed behavior. Show numeric ceilings as USD with a visible “Budget ceiling” label; show null as “Not recorded”, never zero or unlimited. Both insertion paths must snapshot before any provider call.

**Never:** Backfill historical Runs, migrate schema, change role/model configuration, alter spend accounting or gateway admission policy, deploy, or include Story 3.24 changes. Story 3.22 owns staging hostname/deployment work.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| New Run | Config default 500; scheduled, manual, catch-up origins | Production insertion persists 500; public list/detail API returns 500 and UI displays $5.00 as Budget ceiling | No error expected |
| Later config edit | Existing Run 500; config becomes 900 | Retry keeps 500; new Run gets 900; public data for old Run stays 500 | No error expected |
| Historical null | Existing Run has null; config now 500 | Retry preserves null; public UI says Not recorded | No error expected |
| Zero ceiling | Config default 0 | New Run stores 0; public UI shows $0.00; gateway refuses before provider invocation | budget_stopped |
| Missing budget | Config absent or default null | New Run stores null, public UI says Not recorded; existing gateway denial applies when no budget is available | gateway_not_configured on a valid provider/model call with no ceiling |
| Ceiling reached | New Run snapshots 500; recorded spend reaches 500; config later 900 | Gateway refuses next call, records stopped state/evidence, invokes no provider | budget_stopped |

</intent-contract>

## Code Map

- `src/pipeline/workflow/dailyRunSteps.ts:51` — `ensureRun` scheduled insertion and Workflow re-entry; only `!existing` inserts. Replace null budget using `defaultBudgetCents`; resolve before the insert race catch so config failures are not swallowed.
- `src/pipeline/workflow/dailyRun.ts:119` — `startOperatorRun` pre-inserts manual/catch-up Runs; early returns preserve existing running rows. Snapshot for the insert, not on retry.
- `src/pipeline/config/modelRoles.ts:31` — existing `defaultBudgetCents(db)` reads validated gateway configuration and returns number/null. Reuse; update its comment if needed.
- `src/pipeline/ai/gateway.ts:219` — existing `run.budgetCents ?? defaultBudgetCents(db)` and ledger comparison already enforce stored budgets, including zero. Keep policy intact.
- `src/shared/db/repos/runsRepo.ts` — insertion and public projections already carry budgetCents; no schema/repository API change required.
- `src/surfaces/ops/RunLog.tsx:156,190` — table currently has Spend only; add Budget ceiling column/cell using `formatUsdCents` for non-null values.
- `src/surfaces/ops/EvidenceDetail.tsx:693` — spend summary currently has Spend/Tokens/Steps; add Budget ceiling with identical null semantics.
- Tests: `src/pipeline/workflow/dailyRun.test.ts` has both creation seams and Workflow stubs. `gatewaySeed.test.ts:134` incorrectly expects null on newly created seeded Run. `src/pipeline/ai/gateway.test.ts` provides fake provider, config, and ledger fixtures; its existing missing-budget tests should remain.
- `src/shared/api/publicApi.test.ts:905` covers public list/detail with real Worker fetch; first empty-list test must remain first. `src/shared/api/adminApi.test.ts:1093` exercises operator creation over HTTP. `src/surfaces/ops/runLog.test.tsx` and `evidenceDetail.test.tsx` accept injected data for rendered user-visible checks. Tests share D1 state within files; use unique dates and restore changed config where needed.

## Tasks & Acceptance

**Execution:**
- [x] `src/pipeline/workflow/dailyRunSteps.ts`, `dailyRun.ts`, `src/pipeline/config/modelRoles.ts` — reuse configured budget lookup at new-row insertion; retain retry semantics.
- [x] `src/surfaces/ops/RunLog.tsx`, `EvidenceDetail.tsx` — display recorded budget distinctly from spend and historical null.
- [x] `src/pipeline/workflow/dailyRun.test.ts`, `gatewaySeed.test.ts`, `src/pipeline/ai/gateway.test.ts` — verify matrix creation/retry/enforcement cases with real D1 and fake providers.
- [x] `src/shared/api/publicApi.test.ts`, optionally `adminApi.test.ts`, and the two ops render suites — verify production-created budgets through public HTTP responses and user-visible rendering for 500, zero, and null.

**Acceptance Criteria:**
- Given a 500-cent configured default, when each supported origin creates a Run, then public Run list/detail responses report 500 and the rendered list/detail show Budget ceiling $5.00.
- Given an existing Run and a later config change, when it resumes or is read publicly, then its stored budget is unchanged while a new Run receives the new default.
- Given recorded spend at a Run's own ceiling, when the gateway receives another call after the config ceiling increases, then it refuses before provider invocation and records the stopped outcome.
- Given historical null budgets or a new zero ceiling, when readers view the public list/detail, then null is Not recorded and zero is $0.00.

## Spec Change Log

## Review Triage Log

### 2026-09-24 — Review pass
- verdicts: 12 findings — high 0, medium 1, low 6, false 5, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind Hunter: malformed role configuration can prevent Run creation — normal configuration writes validate role mappings and migrations provide valid rows; the claim requires out-of-band database corruption. Propagating invalid configuration is intentional fail-closed behavior, not a demonstrated reachable regression.
  - `[medium]` `[patch]` Blind Hunter: the fourth summary statistic can overflow narrow screens — `.spend` has no wrap and four items plus gaps exceed narrow panel widths; add flex wrapping.
  - `[low]` `[patch]` Blind Hunter: budget-change scheduled retry test always provides an id — add the normal date/origin retry and assert both identity and unchanged budget.
  - `[low]` `[reject]` Blind Hunter: no competing-insertion budget test — existing inserts are keyed and never update a winning row; deterministic orchestration of two config reads and an insert race adds substantial fixture machinery for an uncommon path beyond the existing sequential retry coverage.
  - `[low]` `[reject]` Blind Hunter: matrix resides in one mutable-config test — current cases are bounded, restore config in finally, and all execute successfully; independent case fixtures would add restructuring without an observed everyday failure.
  - `[low]` `[reject]` Blind Hunter: execution checklist is unchecked — this is build-spec finalization metadata; workflow rejects findings whose fix edits this spec. Checklist is synchronized during finalization.
  - `[low]` `[defer]` Blind Hunter: regenerated epic context omits explicit deployment sequence — confirmed; original approved proposal retains the order. Agent-context repair is deferred under review policy.
  - `[false]` `[reject]` Intent auditor: source diff cannot establish commit/push/PR sequencing — repository actions separately establish it: Story 3.24 is pushed in PR #39, whose CI passes, before Story 3.25 completion.
  - `[false]` `[reject]` Intent auditor: added spec alone cannot establish Story 3.25's original scope — the existing epics.md Story 3.25 and approved 2026-09-23 proposal independently require snapshots, public list/detail visibility, unchanged historical budgets, and per-Run enforcement.
  - `[false]` `[reject]` Intent auditor: HTTP and rendered component checks are separate from a deployed browser journey — local application change is the requested surface; Story 3.22 owns deployment, and this task neither claims nor requires a deployed journey.
  - `[false]` `[reject]` Intent auditor: fake-provider tests establish local rather than live-provider execution — the changed behavior is pre-provider admission and stored data; production gateway code executes in these tests, with zero provider calls proving refusal. No provider behavior was changed.
  - `[low]` `[defer]` Intent auditor: context rewrite broadens documentation beyond budget behavior — regeneration is mandatory when planning artifacts are newer; its lost sequencing constraint shares the prior context finding and deferred item.

Edge Case Hunter returned no findings. Verification Gap Reviewer returned no gaps.

## Verification

- `npm run check` — formatting, lint, TypeScript pass.
- `npm test` — full suite passes, including every matrix row and public surface/API checks; no live provider requests.

## Auto Run Result

Status: done.

New scheduled, manual, and catch-up Runs snapshot the configured budget; retries preserve it. Public list/detail display the stored ceiling, including zero, and distinguish historical nulls. Gateway admission policy is unchanged.

Files changed:
- `src/pipeline/workflow/dailyRun.ts` — snapshot the default on operator insertion.
- `src/pipeline/workflow/dailyRunSteps.ts` — snapshot the default on scheduled insertion; preserve re-entry.
- `src/pipeline/config/modelRoles.ts` — document snapshot and historical fallback use.
- `src/surfaces/ops/RunLog.tsx` — display a Budget ceiling table column.
- `src/surfaces/ops/EvidenceDetail.tsx` — display Budget ceiling in the summary.
- `src/shared/ui/pml.css` — wrap summary statistics at narrow widths.
- `src/pipeline/workflow/dailyRun.test.ts` — real D1 origin/budget/retry matrix, including scheduled date lookup.
- `src/pipeline/workflow/gatewaySeed.test.ts` — expect the seeded 500-cent snapshot.
- `src/pipeline/ai/gateway.test.ts` — verify snapshotted zero/exhausted budgets and null fail-closed admission.
- `src/shared/api/publicApi.test.ts` — expose production-created budgets via public list/detail after config edits.
- `src/surfaces/ops/runLog.test.tsx` and `evidenceDetail.test.tsx` — distinguish numeric, zero, and null budgets from spend.
- Epic context — regenerated as required because planning artifacts were newer.
- Sprint status and this spec — record review readiness and build result.

Review: two patch groups (medium 1, low 1), one deferred context-documentation group, and eight rejected findings with individual reasons in the triage log. No high findings. Follow-up review recommended: false; no specific unresolved implementation risk remains.

Verification: `npm run check` passed. After the review patches, `npm test` passed 48 files / 1,024 tests, exit 0. `git diff --check` passed. Matrix audit: creation/default changes/historical null/missing config covered by the all-origin D1 matrix; public API and render cases cover 500/0/null; real gateway tests cover zero and exhausted snapshots after config increase and missing-ceiling refusal. Every covering suite ran and passed.

Residuals: no deployment or live provider calls were performed. The cached-context sequencing omission is recorded in the single deferred list; the authoritative approved sprint proposal retains the 3.23–3.25-before-3.22 order. Story 3.24 remains isolated in PR #39.
