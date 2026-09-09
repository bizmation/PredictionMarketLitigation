---
title: 'Story 3.2: AI Gateway, Budget Envelope & Role→Model Config'
type: 'feature'
created: '2026-09-08'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: df4b43191e03e4c5d3fba955c20bdd172f680eb9
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Model calls are reachable today through one hardcoded path (`ChatAgent` -> `workersai(…)`, `src/server.ts:65-70`), with no gateway, no role routing, no spend account, and no budget. Nothing downstream (workflow 3.3, drafting 3.4-3.5, autonomous 3.13) can call an LLM without re-introducing ad-hoc providers.

**Approach:** Build the single locked gateway module `src/pipeline/ai/gateway.ts` exposing `gateway.complete({ role, … })`, backed by a versioned role→model config in D1 (migration `0007`), a per-Run spend ledger, and a hard per-Run budget ceiling that marks the Run `stopped` and stops further paid calls when exceeded. Every call records role/provider/model/tokens/spend for Evidence. No ad-hoc provider SDKs or hardcoded model ids outside the gateway.

## Boundaries & Constraints

**Always:**
- Single code path: agents call `gateway.complete({ role })` only; no `createWorkersAI`/`streamText` outside `pipeline/ai` (architecture.md:525, 388)
- Money is integer cents + ISO currency code; never float dollars
- Secrets live in Worker secrets (`wrangler secret put`), read as `env.*`, never in `vars`, never in prompts or public artifacts (wranglerConfig.test asserts no `vars` block)
- `surfaces/*` never import `pipeline/*`; `pipeline/*` never imports React (architecture.md:518-521)
- Run status vocabulary: `stopped` is the D1 value; "budget-stopped" is a UI label only. Evidence event is `run.stopped`
- DB snake_case / JSON camelCase boundary; repos map via `Schema.parse`; prepared `?` binds only
- Migration 0007 adds the config table(s): snake_case plural, TEXT `id` PK, inline enum CHECKs matching `vocabulary.ts` verbatim; no `BEGIN`/`PRAGMA`

**Never:**
- No POST/mutation API exposing the gateway or spend — this is server-internal pipeline plumbing; the Approval Gate (3.10) and Evidence detail (3.8) own the public surface later
- No migration edits to `0001`–`0006`
- No hardcoded model id outside the config table/seed
- No direct `env.AI` binding calls from outside `pipeline/ai`
- Provider for 3.2 is the existing Workers AI binding (`env.AI`) — decided; spend is zero-dollar until a paid provider (OpenRouter via AI Gateway, later story) is wired. The gateway still enforces the ceiling and records calls, so budget accounting is real even at zero cost.
- Role→model config is a singleton (`id = 'current'`) row with a version counter — decided; each change appends a `gateway.config_changed` evidence event (evidencing the audited-change requirement via the epic's existing evidence pathway) rather than a per-version table.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Under budget | `complete({ role })` when spend < ceiling | Model response returned; spend row appended; total `spend_cents` incremented | N/A |
| Budget hit mid-run | call would push spend over ceiling | Call refused *before* invoking the provider; Run marked `stopped`; evidence `run.stopped` written | Gateway throws typed `budget_stopped` error |
| Unknown role | `complete({ role: 'nope' })` | Rejected; no provider call, no spend row | Typed `unknown_role` error |
| Unconfigured role | role present in vocab, no model mapped | Rejected; no provider call | Typed `role_not_configured` error |
| Provider error | OpenRouter/WorkersAI returns error | Surface to caller; no spend row written (or row marked failed) | Typed provider error |
| No provider secret | `env` lacks the provider key | Gateway refuses; explicit config error | Typed `gateway_not_configured` error |

</frozen-after-approval>

## Code Map

- `src/server.ts:65-70` -- the ONLY existing model call (hardcoded `@cf/moonshotai/kimi-k2.7-code` via `createWorkersAI`); NOT our target to move now (ChatAgent stays as-is; gateway is the NEW path). Note the import pattern to disallow elsewhere.
- `wrangler.jsonc:33` -- `"ai": { "binding": "AI", "remote": true }` (Workers AI binding); `:234` -- reserved placeholder "Story 3.2 — AI Gateway binding/credentials via Worker secrets"
- `migrations/0006_run_draft_evidence.sql` -- conventions + the `stopped` status CHECK (L74) + `spend_cents`/`budget_cents` columns (L87-94) + `run.stopped` event (L174)
- `migrations/0001_f1_core.sql:417-418` -- singleton config precedent (`cert_signals`, `CHECK (id = 'current')`)
- `src/shared/db/repos/certSignalRepo.ts:30-39` -- singleton repo read pattern (`WHERE id = 'current'`)
- `src/shared/db/repos/runsRepo.ts` -- insertRun exists; NO mutate function yet — 3.2 needs a repo UPDATE to mark a Run `stopped` + bump `spend_cents`
- `src/shared/schemas/vocabulary.ts` -- add `GATEWAY_ROLE_VALUES` next to `RUN_*` value-sets (strings match the 0007 CHECK)
- `src/shared/schemas/run.ts` -- EvidenceEvent shape (reuse for spend events) + RunSummary (spend fields)
- `src/shared/api/respond.ts`, `publicRouter.ts` -- NOT touched (no public gateway surface this story)
- `src/shared/lib/wranglerConfig.test.tsx:160-169` -- pins the `ai` binding; any new binding/secret-shaped change must keep this green

## Tasks & Acceptance

**Execution:**
- [ ] `src/pipeline/ai/gateway.ts` -- NEW -- `gateway.complete({ role, runId, prompt/messages })`: resolves model from config, enforces budget ceiling before the provider call, delegates to the provider (see Q1), records role/provider/model/tokens/spend, returns result; throws typed errors (`unknown_role`, `role_not_configured`, `budget_stopped`, provider) -- RATIONALE: the single locked code path
- [ ] `src/pipeline/config/modelRoles.ts` -- NEW -- load/validate role→model config from the D1 config table (see Q2); resolve `role` → `{ provider, model }` -- RATIONALE: versioned config, no hardcoded ids
- [ ] `src/shared/db/repos/roleModelsRepo.ts` -- NEW -- read the config (singleton or versioned, per Q2); `setRoleModel` writes a version + audit event -- RATIONALE: config source of truth
- [ ] `migrations/0007_gateway_config.sql` -- config table per Q2 + spend ledger table (`llm_calls`: id, run_id, role, provider, model, tokens, cost_cents, currency, created_at) + a `run_spend`/mutate path support -- RATIONALE: versioned config + per-call Evidence row
- [ ] `src/shared/db/repos/llmCallsRepo.ts` -- NEW -- `recordCall`, `totalSpendForRun` -- RATIONALE: spend accounting + budget enforcement reads
- [ ] `src/shared/db/repos/runsRepo.ts` -- ADD `markStopped(db, runId)` (UPDATE status → `stopped` + completed_at) and `bumpSpend(db, runId, cents)` -- RATIONALE: budget-stop side effect + spend accrual
- [ ] `src/shared/schemas/gateway.ts` -- NEW -- strict schemas: `GatewayRole`, `RoleModelConfig`, `LlmCallRecord`, `GatewayError` codes -- RATIONALE: canonical contracts
- [ ] `src/pipeline/ai/gateway.test.ts` -- NEW -- Vitest over the D1 fixtures: unknown role, unconfigured role, budget-stop before call, spend accrual, provider-error passthrough, no-vars/no-secret-in-bundle invariants -- RATIONALE: the I/O matrix

**Acceptance Criteria:**
- Given a role→model config row, when `gateway.complete({ role })` runs under budget, then a model call is made through the single gateway path and a spend row records role/provider/model/tokens/cost
- Given a Run whose spend has reached its ceiling, when another `complete` is attempted, then the call is refused before the provider, the Run is marked `stopped`, and `run.stopped` evidence is written
- Given a role not configured, when `complete({ role })` is called, then a typed `role_not_configured` error is returned and no provider call or spend row occurs
- Given no provider secret is present, when the gateway initializes, then it fails closed with a typed `gateway_not_configured` error

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Source | Verdict | Evidence / disposition |
|---|--------|---------|------------------------|
| 1 | blind+edge+vgap | medium | Budget overshoot: `spend >= budget` checks recorded ledger spend only; a call's own (post-hoc) cost isn't refused pre-call. Zero-dollar this story (Workers AI cost 0). → defer to 3.4 paid provider; documented. |
| 2 | edge | medium | `markStopped` on an already-terminal Run (no `running` guard) + non-idempotent budget-stop (duplicate `run.stopped` events). → patch (idempotency guard). |
| 3 | blind | low | `run not found` → `role_not_configured` — wrong code; collides with the real unconfigured-role case. → patch (add `run_not_found`). |
| 4 | blind+edge | medium | `setRoleModel` non-atomic read-modify-write: concurrent changes clobber version + lose mappings. No concurrent callers until 3.3. → defer (3.3), but make the version bump atomic in SQL now. → included in patch. |
| 5 | blind+edge+vgap | medium | Audited-change requirement: version counter bump only; `gateway.config_changed` evidence event absent AND not in the closed `EVIDENCE_EVENT_VALUES` (frozen "Always" vs frozen "Never" conflict). → decision needed (see below). |
| 6 | blind | low | Currency hardcoded `USD`; bumpSpend ignores `run.spend_currency`. USD-only this story. → defer. |
| 7 | blind+vgap | low | Gateway writes `evidence_events` via raw SQL, bypassing the repo (projector-owns-writes convention). No secrets in the payload today. → defer (3.8 projector). |
| 8 | blind | low | `provider_error` message stringifies the raw error (vendor strings). Server-internal only, no secret path, no public gateway surface. → reject. |
| 9 | vgap | medium | Fail-closed "both ceilings null → gateway_not_configured" path untested. → patch (test). |
| 10 | vgap | low | `unknown_role` test title claims "without touching storage" but only asserts rejection. → patch (strengthen assertion). |
| 11 | blind | low | Evidence payload `{reason}` shape untyped; generic-failure-stop reuse unverified. → defer with the projector story (3.8). |

## Design Notes

- Budget source: the Run row's `budget_cents` (nullable). When null, fall back to a default ceiling from the config table (see Q2 resolution); the ceiling is always integer cents.
- `run.stopped` is also the generic failure-stop event; budget-stop reuses it (the `stopped` status value) rather than a new enum member — matches the 3.1 closed set.

## Verification

**Commands:**
- `npm run migrate:local` -- expected: `0007_gateway_config.sql` applies clean
- `npm test` -- expected: all suites pass incl. the new `pipeline/ai/gateway.test.ts`
- `npm run check` -- expected: exit 0 (oxfmt + oxlint + tsc)
