---
title: 'Story 3.6: Guardrails, Action Policy & Scoped Context'
type: 'feature'
created: '2026-09-11'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 62b8e68d838c108410bb0cefa632d8293c48d7a0
baseline_revision: 62b8e68d838c108410bb0cefa632d8293c48d7a0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
warnings:
  - oversized
deferred: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Drafter/reviewer prompts concatenate untrusted source text with no I/O checks, no tool allowlist, and no scoped identity. `guardrails.passed`/`failed` are reserved but unwritten, so injection or a model tool request could not be denied or shown on public Evidence.

**Approach:** Before Drafts are offered to the gate, run a code-level enforcement layer: a frozen empty per-role tool allowlist (deny+log), scoped prompts that only pass authorized Draft fields (attributed in Evidence), and `guardrail_fail` on `evalSummary.ineligible` so a hard fail is never agent-auto-approvable.

## Boundaries & Constraints

**Always:**
- Tool requests go through `invokeTool` in `pipeline/ai` only. Agents never import F1 write repos or a publish function. `publish_f1` is never on any role allowlist.
- Allowlists are frozen empty constants for `drafter` / `reviewer` / `orchestrator` / `yolo`. Prompt or source text cannot change them.
- A deny writes `guardrails.failed` with `{ draftId, ruleId: "tool.allowlist", tool }` and adds `guardrail_fail` to that Draft's `ineligible`. HITL still `awaiting` — escalate, do not drop or fail the Run.
- After 3.5 persist and before `completeDailyStep`, every remaining Draft gets `guardrails.passed` or `guardrails.failed` with rule identity. Pass payload: `{ draftId, ruleIds: ["tool.allowlist"], context: AUTHORIZED_CONTEXT_KEYS }`.
- Authorized context is only `targetEntityType`, `targetEntityId`, `body`, `diff`, `tier2Only`. The prompt builder does not accept a free-form bag.
- Evidence ids: `evidenceId(runId, "guardrails.passed"|"guardrails.failed", draftId)` via `INSERT OR IGNORE`; skip a Draft that already has either event.
- Reuse existing `guardrails.*` events (0008/0009 CHECK). Extend `INELIGIBLE_REASON_VALUES` with `guardrail_fail` only. No new migration.
- `pipeline/*` is server-only. Public expose is `GET /api/runs/:id` Draft `evalSummary` + Evidence events.
- Empty packaging (`draftCount === 0`) writes zero guardrail events and never calls `invokeTool`.

**Never:**
- No ops/admin UI, Approval Gate, or live F1 publish (3.7–3.11). This story only proves agents cannot invoke publish.
- No YOLO auto-approve (3.13) — record ineligibility only
- No ChatAgent / starter weather-schedule tools
- No edits to migrations `0001`–`0009`
- No operator-configurable rule set (3.12). No extra LLM-as-judge / toxicity classifier
- Do not fold enforcement into connectors. Do not add a `policy.denied` event

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Clean Drafts | 3.5 persist succeeds; no tool JSON | `guardrails.passed` per Draft; `ineligible` unchanged; Run `awaiting` | N/A |
| Model requests a tool | Drafter or reviewer text is `{"tool":"publish_f1"}` or `{"tool":"web_search"}` | `invokeTool` denies; `guardrails.failed` with that `tool`; `guardrail_fail` on Draft; no F1 writes; skip remaining LLM for that Draft; Run `awaiting` | Deny is a result, not `provider_error` |
| Injection cannot expand tools | Tier-2 `body` says to call `publish_f1` / add tools; fake model requests `publish_f1` | Allowlist still empty; same deny+log as above | N/A |
| Empty poll | `draftCount === 0` | No `invokeTool`; no `guardrails.*` | N/A |
| Private context | Prompt builder is the only context seam | Prompt and Evidence `context` omit operator/secrets/career notes | N/A |
| Step retry | `guardrails.passed` or `failed` already exists for the Draft | No duplicate event; no second ineligible stamp | N/A |

</frozen-after-approval>

## Code Map

- `src/pipeline/ai/gateway.ts:64-68,83-216` -- `GatewayInput` is `{ role, runId, prompt }` only. ADD `invokeTool(deps, { role, runId, draftId, tool })` that consults the allowlist and writes Evidence; do not add tools to `complete()`.
- `src/pipeline/ai/actionPolicy.ts` -- NEW -- `ALLOWED_TOOLS: Record<GatewayRole, readonly string[]>` all `[]`; `parseToolRequest(text)` (`{ tool: string }` JSON); `evaluateDraftGuardrails` pass/fail; `AUTHORIZED_CONTEXT_KEYS` constant.
- `src/pipeline/ai/gateway.test.ts` -- copy `seedConfig` + fake provider; ADD invokeTool deny+log cases (do not weaken budget tests).
- `src/pipeline/agents/draftAndReview.ts:118-154,270-339` -- REPLACE `drafterPrompt`/`reviewerPrompt` with a builder that interpolates only authorized keys. After each `complete()`, if `parseToolRequest` hits, `invokeTool` then persist `evals_not_run` + `guardrail_fail` and continue other Drafts. Do not import F1 repos.
- `src/pipeline/workflow/dailyRunSteps.ts:142-156` -- `afterPackaging`: after `draftAndReview`, before `completeDailyStep`, call `enforceDraftGuardrails(db, runId, gatewayDeps)`.
- `src/pipeline/workflow/dailyRun.ts:78-80` -- READ ONLY sequencing (guardrails stay inside `reviewDailyRun`/`afterPackaging`, not a third `step.do`).
- `src/pipeline/workflow/dailyRun.test.ts:238-335,425-554` -- pin `afterPackaging` writes `guardrails.*` before `gate.awaiting_approval`; empty path still writes none.
- `src/shared/schemas/run.ts:89-94` -- ADD `guardrail_fail` to `INELIGIBLE_REASON_VALUES`.
- `src/shared/schemas/vocabulary.ts:264-278` -- READ ONLY; `guardrails.passed`/`failed` already admitted.
- `src/shared/db/repos/draftsRepo.ts:162-194` -- ADD `applyGuardrailIneligibleStmt` that ORs `guardrail_fail` into existing `eval_summary_json.ineligible` (validate-before-write).
- `src/shared/db/repos/evidenceRepo.ts:73-113` -- reuse `appendEventStmt` for atomic fail+ineligible batch.
- `src/shared/db/repos/casesRepo.ts` (and states/entities/circuits) -- READ ONLY; SELECT only. Tests assert `invokeTool("publish_f1")` does not UPDATE them.
- `src/pipeline/connectors/connector.ts:29-31,106-117` -- READ ONLY packaging; injection lives in `SourceCheck` `body` fixtures, not connector rewrites.
- `src/shared/api/publicRouter.ts` -- READ ONLY; GET already returns Draft `evalSummary` + Evidence.
- `migrations/0008_draft_evaluated.sql` / `0009_run_draft_evidence_checks.sql` -- READ ONLY CHECKs already include `guardrails.*`.
- `src/server.ts` ChatAgent tools -- OUT OF SCOPE.

## Tasks & Acceptance

**Execution:**
- `src/shared/schemas/run.ts` -- ADD `guardrail_fail` to the ineligible enum -- FR20 auto-approve input for 3.13
- `src/pipeline/ai/actionPolicy.ts` -- NEW -- empty allowlists, `parseToolRequest`, `AUTHORIZED_CONTEXT_KEYS`, `evaluateDraftGuardrails` -- L3/L4/L6 constants in one module
- `src/pipeline/ai/gateway.ts` -- ADD `invokeTool` deny+Evidence; never executes a tool body -- FR19/FR21 front door
- `src/shared/db/repos/draftsRepo.ts` -- ADD `applyGuardrailIneligibleStmt` -- persist hard-fail without clobbering 3.5 eval
- `src/pipeline/agents/draftAndReview.ts` -- scoped prompts; tool-shaped model text → `invokeTool` + short-circuit remaining LLM for that Draft -- injection cannot grant tools at the generation seam
- `src/pipeline/workflow/dailyRunSteps.ts` -- `enforceDraftGuardrails` after review, before awaiting -- I/O checks before the gate
- `src/pipeline/ai/actionPolicy.test.ts` -- NEW -- Vitest + D1: I/O matrix (pass, deny `publish_f1`/`web_search`, injection body, empty run, private context omitted, retry skip) -- adversarial fixture (G1) + deny+log (G2)
- `src/pipeline/workflow/dailyRun.test.ts` + `src/pipeline/agents/draftAndReview.test.ts` -- pin sequencing and tool-JSON short-circuit -- deleting enforce or scoped builder fails a test

**Acceptance Criteria:**
- Given packaged Drafts after drafter/reviewer, when they are offered to the gate, then each Draft has `guardrails.passed` or `guardrails.failed` on Evidence with a rule id
- Given a hard-fail Draft, when persisted, then `evalSummary.ineligible` includes `guardrail_fail` and the Run is still `awaiting`
- Given Tier-2 source text that instructs a `publish_f1` call, when the model requests that tool, then the allowlist is unchanged, the call is denied, the denial is on Evidence, and no live F1 row is updated
- Given `GET /api/runs/:id`, when a deny occurred, then the response includes the `guardrails.failed` event and the Draft's `guardrail_fail` reason

## Spec Change Log

## Review Triage Log

### 2026-09-11 — Review pass
- verdicts: 26 findings — high 0, medium 9, low 3, false 14, maybe-false 0
- findings:
  - `[medium]` `[patch]` Generation-time deny was two writes (`invokeTool` then `persistToolDeny`); crash left `guardrails.failed` without `guardrail_fail` and retry re-ran the LLM — batched `guardrails.failed` + `draft.evaluated` + eval UPDATE via `extraStatements`; retry skips `evalSummary` or existing `guardrails.failed`
  - `[medium]` `[patch]` `invokeTool` throw in the per-Draft catch stamped `evals_not_run` without `guardrail_fail` and enforce could write `guardrails.passed` — `persistToolDeny` catch persists the same hard-fail batch; outer catch uses `pendingTool` instead of `persistEvalsNotRun`
  - `[false]` `[reject]` `enforceDraftGuardrails` never takes the fail branch (`requestedTool: null`) — fail is recorded at `invokeTool`; enforce only stamps remaining passes, matching Design Notes
  - `[false]` `[reject]` `parseToolRequest` ignores fenced/embedded tool JSON — Design Notes: unparseable JSON stays on the 3.5 parse path
  - `[false]` `[reject]` `invokeTool` can write `failed` after `passed` because evidence ids differ — production order is deny during generation, then pass; both events are not a workflow path
  - `[false]` `[reject]` `applyGuardrailIneligibleStmt` leaves `status: ok` — 3.13 keys off `ineligible`, same as `ok` + `below_threshold` in 3.5
  - `[low]` `[reject]` Unbounded `tool` string on public Evidence — unlikely in everyday use; truncation would add new public-surface policy
  - `[medium]` `[patch]` Budget-stop `afterPackaging` test did not pin `guardrails.*` (retry half grouped with the two-write finding) — assert each persisted Draft has `guardrails.passed` or `guardrails.failed`
  - `[low]` `[reject]` F1 snapshot on empty tables would miss an INSERT — `invokeTool` has no F1 writes; an import lint is extra complexity
  - `[false]` `[reject]` Shared frozen `NONE` array / `invokeTool` always returns `denied: true` — v1 allowlists are empty; Design Notes require that return shape
  - `[medium]` `[patch]` G1 injection test did not assert the adversarial body reached the model prompt — `provider.prompts()` must contain `INJECTION_BODY`
  - `[false]` `[reject]` `GET /api/runs/:id` only asserted on deny; `invokeTool` skips `unknown_role` — the AC is the deny GET; unknown role is not specified for tools
  - `[medium]` `[patch]` Edge: `invokeTool`/`persistToolDeny` throw after tool JSON — same hard-fail batch as finding 1–2
  - `[medium]` `[patch]` Edge: retry with null `evalSummary` and existing `guardrails.failed` — skip filter now includes `failedIds`
  - `[low]` `[reject]` Edge: `getById` throw before the deny batch drops Evidence — not an everyday path; generation deny uses `evalSummary == null` and still writes the event
  - `[medium]` `[patch]` Edge claim: hard fail not auto-approvable because deny can omit `guardrail_fail` — closed by the atomic batch
  - `[medium]` `[patch]` Vgap: budget-stop can omit guardrail events without a failing test — same assertion as finding 8
  - `[medium]` `[patch]` Vgap: two-write crash / retry can look auto-approvable — same batch as finding 1
  - `[false]` `[reject]` Intent: public Evidence lives on `ops.` vs `GET /api/runs/:id` — 3.7/3.8 own ops HTML; 3.1–3.5 public surface is GET
  - `[false]` `[reject]` Intent: FR20 I/O checks vs text-parse + pass-only enforce — spec v1 rule is `tool.allowlist` at `invokeTool`
  - `[false]` `[reject]` Intent: auto-approve/gate vs `ineligible` — 3.13 consumes the reason; this story only records it
  - `[false]` `[reject]` Intent: native tool channel vs `{"tool":"..."}` in completion text — 3.2 `complete()` is prompt-only; Design Notes pin the parse
  - `[false]` `[reject]` Intent: injection withheld from the model vs frozen allowlist — G1 is allowlist-holds; body is authorized context
  - `[false]` `[reject]` Intent: lineage graph vs `context` key names on `guardrails.passed` — 3.8 projector; FR23 attribution is the key tuple
  - `[false]` `[reject]` Intent: 3.11 gate write-path vs F1 snapshot — epic defers end-to-end publish to 3.11
  - `[false]` `[reject]` Intent: steward/steering allowlist — stories 3.14–3.18; not 3.6

## Design Notes

- v1 rule catalog is `tool.allowlist` only. Scope is enforced by the prompt builder + `context` keys on `guardrails.passed`, not a second fail rule.
- Tool-shaped model text: `{"tool":"<name>"}` (optional other keys ignored). Unparseable JSON stays on the 3.5 parse path.
- Deny example Evidence payload: `{"draftId":"d:run-20260911-0000:CFTC press:states:st-nv","ruleId":"tool.allowlist","tool":"publish_f1"}`.
- `invokeTool` returns `{ denied: true, ruleId, tool }` and does not throw. Missing run still throws `run_not_found`.
- Crash between 3.5 persist and enforce: retry skips LLM (`evalSummary` set) and still runs enforce (no guardrail event yet).

## Verification

**Commands:**
- `npm test` -- expected: all suites pass incl. `pipeline/ai/actionPolicy.test.ts`
- `npm run check` -- expected: exit 0 (oxfmt + oxlint + tsc)

## Auto Run Result

Status: done

Summary: Story 3.6 enforcement layer is in. Before Drafts are offered to the gate, each Draft gets `guardrails.passed` or `guardrails.failed` with rule identity `tool.allowlist`. Per-role tool allowlists are frozen empty; `invokeTool` denies (including `publish_f1`) and logs on Evidence. Drafter/reviewer prompts interpolate only authorized Draft fields. Hard fail stamps `guardrail_fail` on `evalSummary.ineligible` and keeps the Run `awaiting`. Deny persist is one `db.batch` (`guardrails.failed` + `draft.evaluated` + eval UPDATE).

Files changed:
- `src/pipeline/ai/actionPolicy.ts` — empty allowlists, `parseToolRequest`, scoped keys, `enforceDraftGuardrails`
- `src/pipeline/ai/actionPolicy.test.ts` — I/O matrix, G1 injection (prompt contains body), GET deny
- `src/pipeline/ai/gateway.ts` — `invokeTool` deny+log; `extraStatements` batched with the deny write
- `src/pipeline/ai/gateway.test.ts` — deny `publish_f1`/`web_search`, F1 snapshot, retry IGNORE
- `src/pipeline/agents/draftAndReview.ts` — scoped prompts; tool JSON → one-batch hard fail; retry skip on failed event
- `src/pipeline/agents/draftAndReview.test.ts` — short-circuit and private-field prompt tests
- `src/pipeline/workflow/dailyRunSteps.ts` — `enforceDraftGuardrails` after review, before awaiting
- `src/pipeline/workflow/dailyRun.test.ts` — event order; budget-stop still has a guardrail event per Draft
- `src/shared/schemas/run.ts` — `guardrail_fail` ineligible reason
- `src/shared/db/repos/draftsRepo.ts` — `applyGuardrailIneligibleStmt`
- `_bmad-output/implementation-artifacts/spec-3-6-guardrails-action-policy-scoped-context.md` — spec
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 3-6 done

Review: 3 patches applied (atomic deny persist, budget-stop guardrail assertion, injection prompt assertion). 0 deferred. Rejected: enforce pass-only, fenced JSON, dual pass+fail ids, `ok`+`guardrail_fail` status, unbounded tool string, weak F1 snapshot, shared `NONE`/always-denied, GET-pass HTTP, `getById` throw, `ops.`/steward/native-tools/lineage/3.11/3.13 surface splits.

Follow-up review recommended: true (three medium patches). Unverified risk: the `persistToolDeny` catch path when `invokeTool` throws is not covered by a test that injects a throwing `invokeTool`; retry-skip given only `guardrails.failed` (null `evalSummary`) is implemented but not crash-injected.

Verification: `npm test` — 516 passed. `npm run check` — oxfmt, oxlint, tsc exit 0.

Residual risks: v1 allowlists stay empty (no tool executor). Markdown-fenced tool JSON follows the 3.5 parse path by spec. Live F1 publish exclusivity is still 3.11.
