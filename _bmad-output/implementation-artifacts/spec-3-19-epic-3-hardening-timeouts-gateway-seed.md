---
title: 'Story 3.19: Epic 3 Hardening — Timeouts, Gateway Seed & Deferred Closure'
type: 'chore'
created: '2026-09-17'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: f0db9234ec284e94f30c98de76a812157ba32a16
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
warnings:
  - oversized
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The governed loop cannot run for real: `gateway_config` is empty on every environment so every `complete()` fails closed, and no fetch, provider call, or connector has a deadline, so one slow court site or model call hangs a Run or blanks a page. Six timeout deferrals and 24 review entries have accumulated with no home.

**Approach:** Implement the decisions in `sprint-change-proposal-2026-09-17.md` §4.1: one shared client timeout helper and one server deadline helper applied at every call site; migration `0017` seeding Workers AI role→model config with a 500¢ budget plus a `runs(started_at)` index; warnings plus a failing-batch test helper for the four best-effort Evidence catches; an r2 revise test; a visible "Donations open soon" state; and the ledger dispositions already recorded.

## Boundaries & Constraints

**Always:**
- Timeout values are code constants in one module: `CLIENT_GET_TIMEOUT_MS = 15_000`, `ADMIN_POST_TIMEOUT_MS = 30_000`, `CONNECTOR_TIMEOUT_MS = 60_000`, `PROVIDER_TIMEOUT_MS = 60_000`, and (decided by Patrick 2026-09-18 at review) `STEERING_POST_TIMEOUT_MS = 2 * PROVIDER_TIMEOUT_MS + 10_000` for the steering composer POST only, so the client deadline always exceeds the worst-case server path (revise = drafter + reviewer).
- Client: `fetchWithTimeout(input, init, ms)` in `src/shared/lib/` combines the caller's optional `signal` with `AbortSignal.timeout(ms)` via `AbortSignal.any`. Every surface fetch in `src/surfaces/**` (ops, admin, apex hooks, shells) goes through it; no hand-rolled deadline. A timeout rejects with `TimeoutError`, which existing hooks must not swallow as an unmount `AbortError` — it lands in the hook's error state (designed error/empty state, never chrome-only). Unmount abort behavior is unchanged.
- Server: `withDeadline(promise, ms, label)` in `src/shared/lib/` (`Promise.race` + timer cleared in `finally`). Applied in `gateway.ts` around `provider.complete` so every provider (fakes included) is covered; a deadline is a typed `GatewayError("provider_error")` — per-Draft `evals_not_run`, never a budget stop, never a Run failure by itself. Applied in `connector.ts` around `check(source)`: a timeout appends `source.skipped { reason: "timeout", … }` and returns `failed: true`; existing 3.4 Run rules then apply (drafts → `awaiting`; zero drafts + any failure → `failed`, never `empty`).
- Migration `0017`: `INSERT … ON CONFLICT(id) DO NOTHING` a `gateway_config` row `id='current'`, `version=1`, `default_budget_cents=500`, `roles_json` mapping all five roles (`orchestrator`, `drafter`, `reviewer`, `yolo`, `steward`) to `{ "provider": "workersai", "model": "@cf/meta/llama-3.3-70b-instruct-fp8-fast" }`; plus `CREATE INDEX idx_runs_started_at ON runs(started_at)`. No `evidence_events` rebuild. Update the `RoleModelMapSchema` comment that says production does not seed a steward id.
- Existing tests that assert "unconfigured" behavior keep asserting it by explicitly upserting `{}` / `provider: null` (already the pattern). Do not weaken any assertion; a test that assumed an empty table adapts by seeding the state it needs.
- Best-effort Evidence: all four empty catches in `submitTurn.ts` (config revert, config apply, guidance revoke, guidance record) log `console.warn("steering.evidence_lost", { runId, turnId, event })`. Test helper `src/test/failingDb.ts` exports `failBatchAfter(db, n)` (Proxy over `D1Database`; the nth `batch()` throws, others pass through, `apply` on the real target). One test each for config apply and guidance record: version row present, HTTP-level result `ok`, warning emitted, no `config.steered` / `guidance.recorded` row.
- r2 revise: end-to-end case revising `…:r1` after its eval landed → child `…:r1:r2`, chain preserved, `draft.revised` Evidence, prior tips not decided, F1 unchanged.
- Donations: `DONATE_URL` stays a single constant. When it is not an `http(s)` URL, "Buy me a coffee" and "Support the project" render as non-link text with a visible "donations open soon" note and `aria-disabled`; when it is a URL, the anchors render as today.
- `deferred-work.md` dispositions block (2026-09-17) already records every Epic 3 entry; this story's Implementation Notes cite it — no further ledger edits unless review defers something new.

**Never:**
- New Evidence vocabulary, wrangler/cron/binding changes, OpenRouter wiring or provider matching (3.20), a real connector (3.21), retries, backoff, or per-source timeout overrides, `messages`-shaped gateway input, changing the 3.4 Run-status rules, mutating the Epic 2 apex hooks' data contracts, or a donation service choice (Epic 2 item 7). `surfaces/*` → `pipeline/*` imports.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Client GET hangs | `GET /api/runs/:id` never resolves (fake timers) | After 15 s the hook reaches its error state with a designed message; chrome + error visible, not blank | `TimeoutError` → error branch |
| Client unmount | Component unmounts mid-fetch | Aborts as today; no error state, no timer leak | `AbortError` swallowed |
| Admin POST hangs | `POST …/steering` or `/api/admin/runs` or decision POST hangs | After 30 s: notice/error shown, busy flag cleared, keyboard controls re-enabled | `TimeoutError` → notice |
| Provider hangs | Fake provider never resolves during `draftAndReview` | After 60 s that Draft is `evals_not_run` with `draft.evaluated`; other Drafts continue; Run not stopped | `provider_error` |
| Steward hangs | Fake provider hangs on an `ask` (or `config`) turn | Turn persisted; no 500; `ask` → `ok` with `reply: null` (3.14 contract, decided by Patrick 2026-09-17); `config` → `invalid`, no version row | `provider_error` → existing mapping |
| Connector hangs | `SourceCheck` never resolves | After 60 s `source.skipped { reason: "timeout" }`, `failed: true`; sibling sources still polled | Timer cleared |
| All sources time out, zero drafts | Every check hangs | Run `failed` (not `empty`), per-source `source.skipped` timeout rows | 3.4 rule |
| Seed resolves roles | Fresh D1 with `0017`, no test seeding | `draftAndReview` and `submitTurn ask` resolve `workersai` models; no `role_not_configured`; budget ceiling 500 | N/A |
| Seed is idempotent | `0017` on a DB whose `gateway_config` row already exists | Existing row untouched (`DO NOTHING`) | N/A |
| Evidence batch fails after row | `failBatchAfter` throws on the Evidence batch | Version/guidance row present; result `ok`; `console.warn` once; no Evidence row | Best-effort |
| r2 revise | Revise r1 after eval | `…:r1:r2` inserted; r1 not decided; `draft.revised` on r2; F1 unchanged | N/A |
| Donations placeholder | `DONATE_URL = "#coffee"` | Both CTAs render as text + "donations open soon", no `href`, `aria-disabled` | N/A |
| Ask/revise/config/guidance unchanged | Any steering intent within deadline | 3.15–3.18 behavior identical | N/A |

</frozen-after-approval>

## Code Map

- `src/shared/lib/timeouts.ts` -- NEW -- the four constants + `fetchWithTimeout` + `withDeadline`. `AbortSignal.timeout`/`any` are in TS 6 `lib.dom`, Node 24, jsdom 30 (timer-driven, so `vi.useFakeTimers()` controls it).
- Client GET sites (all have effect-scoped `AbortController`, swallow `AbortError` by name): `src/surfaces/ops/EvidenceDetail.tsx:706-740` (per-poll controller), `PendingDrafts.tsx:95-115`, `RunLog.tsx:86-106`, `ModeTransparency.tsx:31`, `OpsShell.tsx:69`, `src/surfaces/admin/LoopControls.tsx:107-153` (one controller reused across polls — per-call timeout must not abort the shared controller), `ApprovalQueue.tsx:238-258`, `ModeControls.tsx:47,83`, `useAdminSession.ts:42`, `src/surfaces/useApprovalMode.ts:30`, apex hooks `useCircuitData.ts:109`, `useOrientation.ts:61`, `useCertSignal.ts:71`, `usePoll.ts:58`, `useStateDetail.ts:77`, `useCaseDetail.ts:99`, `useEntityLedger.ts:114`.
- Admin POST sites (no signal today): `LoopControls.tsx:160`, `ApprovalQueue.tsx:277` (`postDecision`, catch at 309 sets a notice), `SteeringPanel.tsx:134,148` (best-effort GETs → 15 s), `:180` (`postSteering` → 30 s; callers handle errors — timeout must clear `submitting`/busy).
- `src/pipeline/ai/gateway.ts:189-198` -- wrap `provider.complete` with `withDeadline(…, PROVIDER_TIMEOUT_MS, mapping.provider)`; keep the `provider_error` mapping. `:292-316` `createWorkersAiProvider` name `"workersai"` (seed provider string). `:40-42` comment update.
- `src/pipeline/agents/draftAndReview.ts:68-74` -- READ ONLY `PER_DRAFT_GATEWAY_CODES` already includes `provider_error` → `persistEvalsNotRun`.
- `src/pipeline/connectors/connector.ts:42-61,75-88` -- wrap `check(source)` at L51; add the timeout branch before the empty-array skip; reason strings are free-form.
- `migrations/0017_gateway_seed_runs_index.sql` -- NEW -- seed + index; DDL shape from `0007:37-54`; `runs` rebuilt in `0009:13-177`, only `idx_runs_status` exists.
- `src/shared/db/repos/roleModelsRepo.ts:37-66` -- READ ONLY; `gateway.test.ts:693-716` asserts `firstVersion + 1` (relative, safe).
- Test seeds are all upserts (`gateway.test.ts:90-104`, `draftAndReview.test.ts:112-126`, `submitTurn.test.ts:75-104`, `dailyRun.test.ts:365,554`, `adminApi.test.ts:1789+`, `publicApi.test.ts:1741`); unconfigured tests upsert `{}` (`submitTurn.test.ts:500-510,756,1551`, `adminApi.test.ts:1970-1980`, `gateway.test.ts:185-194`). Migrations are discovered dynamically (`vitest.config.ts` `readD1Migrations`).
- `src/pipeline/steering/submitTurn.ts:429-431,489-491,626-628,671-673` -- the four catches. `src/server.ts` uses `console.error` for `admin_api.error`; use `console.warn` here.
- `src/test/failingDb.ts` -- NEW -- Proxy helper; `Db = D1Database` (`src/shared/db/client.ts:8`); tests pass `testEnv.DB` directly.
- `src/pipeline/steering/submitTurn.test.ts:844-921` -- first-revise fixture (`insertRun("awaiting")`, `insertDraft(runId, id, EVAL_OK)`, `seedDrafterReviewer`, `scriptedProvider` needs 4 texts for r2); acceptance rules `submitTurn.ts:209-219,716-734`, `draftsRepo.ts:77-82,112-155` (child id appends `:r2` to the parent id; r1 must have `evalSummary != null` and no outcome).
- `src/surfaces/apex/ApexShell.tsx:49,202-204,248` -- `DONATE_URL`, trust CTA, footer link; pinned by `src/surfaces/shells.test.tsx:248,269`.
- Tests to add/extend: `src/shared/lib/timeouts.test.ts` (new), `gateway.test.ts` (provider deadline), `connector.test.ts` (timeout skip + all-timeout failed), `draftAndReview.test.ts` (hung provider → evals_not_run, siblings continue), `submitTurn.test.ts` (steward hang, r2, failing-batch guidance), `dailyRun.test.ts` (no-seed run resolves 0017 roles), mount tests with fake timers for one ops GET, one admin POST, SteeringPanel busy reset; `shells.test.tsx` donations.
- `_bmad-output/implementation-artifacts/sprint-status.yaml:91` -- backlog → in-progress → done.

## Tasks & Acceptance

**Execution:**
- [x] `src/shared/lib/timeouts.ts` -- constants, `fetchWithTimeout`, `withDeadline` + unit tests
- [x] client GET/POST call sites (ops, admin, apex hooks, shells) -- route through `fetchWithTimeout`; TimeoutError → error state; busy flags reset
- [x] `src/pipeline/ai/gateway.ts` + `src/pipeline/connectors/connector.ts` -- provider deadline, connector timeout skip
- [x] `migrations/0017_gateway_seed_runs_index.sql` -- seed row + index; schema comment update
- [x] `src/pipeline/steering/submitTurn.ts` + `src/test/failingDb.ts` -- warnings + failing-batch tests
- [x] `src/pipeline/steering/submitTurn.test.ts` -- r2 revise case
- [x] `src/surfaces/apex/ApexShell.tsx` -- donations-open-soon state + test
- [x] tests + `sprint-status.yaml` -- I/O matrix

**Acceptance Criteria:**
- Given a fresh D1 with `0017` applied and no test seeding, when a manual Run packages a fake connector's Draft, then drafter and reviewer resolve `workersai` models and the Run reaches `awaiting` with `draft.evaluated`
- Given any hung fetch, provider call, or connector, when its deadline passes, then the outcome is the existing typed one (`source.skipped` reason, `provider_error` → `evals_not_run`, or a designed client error state) and nothing stays `running`, busy, or chrome-only
- Given the four best-effort Evidence catches, when the Evidence batch throws after the row landed, then the operator sees `ok`, the row exists, and a warning names the lost event
- Given r1 reviewed and pending, when I revise it, then `…:r1:r2` exists with the full chain and live F1 is unchanged
- Given `DONATE_URL` is a placeholder, when I view the trust band and footer, then both CTAs say donations open soon and are not dead links
- Given `npm run deploy:build`, when `0017` applies, then `GET /api/mode` is unchanged and a manual Run on `build.*` drafts (verified manually, recorded in the runbook)

## Implementation Notes

**Landed (2026-09-17, branch `story/3-19-epic-3-hardening-timeouts-gateway-seed`, baseline `f0db923`).**

- `src/shared/lib/timeouts.ts` — the four constants plus `STEERING_POST_TIMEOUT_MS` (steering POST only), `fetchWithTimeout` (feature-detects `AbortSignal.any`), `withDeadline`, `DeadlineError`, `isTimeoutError`/`isAbortError`. Unit tests in `timeouts.test.ts` (10).
- Client: every `fetch` in `src/surfaces/**` (26 sites, incl. `CircuitMap` geo JSON and the public poll vote POST) now goes through `fetchWithTimeout`; `grep -rn "fetch(" src/surfaces` finds none outside tests. GETs 15 s, admin POSTs 30 s. New designed states: `LoopControls` and `ApprovalQueue` get a `timedOut` view (EmptyState + Retry) instead of misreporting a hung GET as "re-authentication needed"; a timed-out `Run now` / decision / steering POST shows a specific notice (`RUN_TIMEOUT_NOTICE`, `DECISION_TIMEOUT_NOTICE`, `STEERING_TIMEOUT_MESSAGE`) and clears busy. Hooks with a fail-closed default (`useApprovalMode`, `ModeTransparency`, `ModeControls` GET, `OpsShell` schedule, `useAdminSession`, `useOrientation`, `useCircuitData`) keep it on timeout; detail hooks land in their existing `error` status. Unmount abort unchanged (tested: `EvidenceDetail` unmount mid-fetch leaves no timer and no error).
- Server: `gateway.ts` wraps `provider.complete` in `withDeadline(…, PROVIDER_TIMEOUT_MS, mapping.provider)` inside the existing `provider_error` mapping. `connector.ts` wraps `check(source)`; a `DeadlineError` appends `source.skipped { source, tier, reason: "timeout", timeoutMs }` and returns `failed: true`. Tests: gateway (2), connector (3: one hung sibling → drafts still `awaiting`; all hung → `failed` not `empty`; no timer left after a fast check), `draftAndReview` (hung drafter → that Draft `evals_not_run`, sibling `ok`, Run `awaiting`, no `run.stopped`), `submitTurn` (steward hang on ask and on config).
- `migrations/0017_gateway_seed_runs_index.sql` — seed + `idx_runs_started_at`. `RoleModelMapSchema` comment updated. Covered by the new `src/pipeline/workflow/gatewaySeed.test.ts` (6): seed shape, index exists, idempotence, no-seed manual Run drafts + reviews on `workersai` and reaches `awaiting` with `draft.evaluated`, steward ask resolves the seeded model, 500-cent ceiling enforced.
- `submitTurn.ts` — the four catches call `warnEvidenceLost` → `console.warn("steering.evidence_lost", { runId, turnId, event })`. `src/test/failingDb.ts` exports `failBatchAfter(db, n)` (Proxy, nth `batch()` rejects, everything else `apply`ed on the real target). Tests: config apply and guidance record with `failBatchAfter(db, 2)` (batch 1 = turn receipt) — version/guidance row present, `ok`, exactly one warning, no `config.steered` / `guidance.recorded` / `steering.applied` effect row; plus a pass-through test for the helper.
- r2 revise test (`submitTurn.test.ts` "story 3.19" block): `…:r1:r2` inserted with `parentDraftId = …:r1`, `revisionIndex 2`, lineage root→r1→r2, only r2 is a pending tip, two `draft.revised` rows, F1 snapshot unchanged.
- Donations: `ApexShell` exports `isDonateUrlLive` / `DONATIONS_OPEN_SOON`; while `DONATE_URL` is not `http(s)://…`, the trust CTA is `<span class="btn btn-ghost donate-soon" aria-disabled="true">` and the footer entry is a `SiteFooter` link with `disabled: true, hint` rendered as `<span class="foot-soon" aria-disabled="true">`. `SiteFooter` gained the optional `disabled`/`hint` fields (`SiteFooterLink`); small CSS in `pml.css`. `shells.test.tsx` pins both states and the live-URL branch.
- Ledger: no new deferrals; every Epic 3 entry is already dispositioned in `deferred-work.md` § "Dispositions: sprint-change-proposal-2026-09-17".

**Verification (run locally, exit codes read, not summaries):** `npm test` → 45 files / 875 tests passed, exit 0 (baseline before this story: 43 / 838, exit 0). `npm run check` → exit 0 after `oxfmt --write` on five new test files.

**Doc lookups that changed a decision (CLAUDE.md rule):**
- Vitest 4 fake timers (Context7 `/vitest-dev/vitest`, `docs/api/vi.md` + `docs/config/faketimers.md`): `vi.useFakeTimers` wraps the global timer functions (`setTimeout`, `setInterval`, `Date`, …). `AbortSignal.timeout` is not on that list, and a probe in both Vitest projects (jsdom 30 and workerd) confirmed the signal never aborts under `advanceTimersByTimeAsync`. The Code Map line claiming it is "timer-driven, so `vi.useFakeTimers()` controls it" is wrong; see Spec Change Log #1.
- Cloudflare Vitest integration (Cloudflare docs MCP, `workers/testing/vitest-integration/isolation-and-concurrency` and `known-issues`; vitest-pool-workers 0.20.3 with vitest 4.1): **storage isolation is per test file, not per test** — confirmed by a probe (a `gateway_config` upsert in one `it` is visible in the next). Consequence: the "fresh D1 with 0017, no test seeding" case cannot sit in `dailyRun.test.ts` (whose earlier tests upsert `gateway_config`); it lives in the new `gatewaySeed.test.ts`, which never writes that table. Also from `known-issues`: fake timers do not apply to KV/R2/cache simulators (D1 is unaffected, and the server-side timeout tests interleave D1 I/O with `advanceTimersByTimeAsync` successfully).
- Workers AI (Cloudflare docs, model page for `llama-3.3-70b-instruct-fp8-fast`, and the coordinator's confirmation): `@cf/meta/llama-3.3-70b-instruct-fp8-fast` is a current text-generation model; `prompt` is a required string; the response carries `response` (string) and `usage.prompt_tokens` / `usage.completion_tokens` — exactly what `createWorkersAiProvider` reads, so the seed's model id and the provider adapter agree. The docs list per-token unit pricing ($0.293/M in, $2.253/M out); the gateway's `costCents: 0` for this provider is therefore a known gap for 3.20, not something 3.19 changes (noted in the migration header).
- D1 migrations (Cloudflare docs `d1/reference/migrations`): wrangler applies top-level `.sql` files in order and records them in `d1_migrations`; statement splitting behaves as the 0006/0016 headers describe. SQLite `INSERT … ON CONFLICT(id) DO NOTHING` and `CREATE INDEX` need no D1-specific handling; the idempotence test re-runs the seed statement against the seeded row.

**Not done / needs a human:**
- AC "Given `npm run deploy:build`, when `0017` applies …" — not run from this session (no deploy). The runbook row for `pml-build` still says migrations `0001`–`0016`; update it and record the manual `/admin#loop` Run on `build.*` after deploying.
- `sprint-status.yaml` stays `in-progress` until review + the deploy check above.

## Spec Change Log

1. **`fetchWithTimeout` mechanism (Boundaries "Client" bullet).** Implemented the deadline as a `setTimeout` that aborts an internal `AbortController` with a `DOMException("…", "TimeoutError")`, combined with the caller's `signal` via `AbortSignal.any`, and additionally raced against the fetch promise — instead of `AbortSignal.timeout(ms)`. Observable contract is as specified (rejects with `TimeoutError`; caller abort still surfaces as `AbortError`; the caller's controller is never aborted by the deadline), but the timer is now controllable by `vi.useFakeTimers()`, which `AbortSignal.timeout` is not (see Implementation Notes). Frozen intent untouched; this is the "how".
2. **I/O matrix row "Steward hangs" says result `invalid`.** For an `ask` turn the existing 3.14/3.15 outcome for a steward `provider_error` is `ok` with `reply: null` (pinned by "returns ok when steward complete throws after persist"), and the Boundaries say 3.15–3.18 behavior is unchanged. A hung steward on `ask` therefore returns `ok`/`reply null` (turn persisted, no 500, no `llm_calls` row, Run untouched); on `config` it returns `invalid` with no version row. Both are tested. Flagging for the human: if `invalid` on `ask` is really wanted, that is a 3.15 behavior change, not a hardening.
3. **No-seed role-resolution test location.** Spec lists `dailyRun.test.ts`; it is in the new `src/pipeline/workflow/gatewaySeed.test.ts` because storage isolation is per file (see Implementation Notes).
4. **Public poll vote POST** (`usePoll.ts:94`, not in the Code Map) uses `CLIENT_GET_TIMEOUT_MS` (15 s): it is a public, single-row write and the `inFlight` latch must not stay stuck; `ADMIN_POST_TIMEOUT_MS` is reserved for admin mutations.

## Review Triage Log

**Round 1 (2026-09-18) — 15 findings, all fixed; per-file tests green, `tsc`/`oxlint`/`oxfmt` clean.**

1. `AbortSignal.any` unguarded → `combineSignals` feature-detects; fallback forwards the caller's abort onto the internal controller (already-aborted honoured). Test deletes `AbortSignal.any` and proves timeout, caller abort, and pre-aborted signal.
2. Steering POST 30 s < server 60 s×2 → `STEERING_POST_TIMEOUT_MS = 2 * PROVIDER_TIMEOUT_MS + 10_000` (130 s), used by `postSteering` only; message derives the seconds from the constant; mount test advances to it.
3. `EvidenceDetail` poll tick aborted the live request → `inFlight` flag skips the tick; one `AbortController` per effect; unmount unchanged. Two tests: hung first GET → "Evidence unavailable"; hung later poll → times out, is never aborted by ticks, held timeline kept (3.8 held-detail rule — the review's "designed error state" for a *later* poll would contradict "keeps the held timeline when a later poll fails"), polling resumes.
4. `ModeControls` hung POST → `MODE_TIMEOUT_NOTICE` + `resync` re-fetch of `GET /api/mode`; test pins 29 999 ms disabled / 30 000 ms re-enabled + second GET reveals the server-applied change.
5. `LOOP_TIMEOUT_NOTICE` cleared (only that notice) on a successful poll; test added.
6. `ApprovalQueue` reload timeout with a loaded queue → `QUEUE_TIMEOUT_NOTICE`, view kept, cleared on next successful load; test added.
7. Connector timeout row stamped at deadline time, not check start.
8. `warnEvidenceLost` payload is `{ runId, turnId, events: [<event>, "steering.applied"] }`.
9. Config **revert** and guidance **revoke** failing-batch cases added (n = 2 via `batchCalls()`).
10. Placeholder CTAs: `role="link" aria-disabled="true"`; live branch is a plain `<a href>` (no `target`/`rel`/`external`). oxlint's `jsx-a11y/prefer-tag-over-role` fires on `role="link"` for any non-`<a>`, and an href-less `<a role="link">` trips `anchor-is-valid` + `no-redundant-roles`, so the two spans carry a scoped `oxlint-disable`/`enable` (same precedent as `CircuitMap`/`ApprovalQueue`).
11. `0017`: `CREATE INDEX IF NOT EXISTS`; header names the PRIMARY KEY as the conflict target.
12. `gatewaySeed.test.ts` steward case creates its own Run (passes under `-t`).
13. New `src/surfaces/apex/hooks.timeout.mount.test.tsx`: `usePoll` hung vote POST releases `inFlight` (second `vote()` posts); `useCaseDetail` hung GET → `error`; `useCircuitData` hung GETs → `listsReady` true with empty lists.

### 2026-09-18 — Review pass
- verdicts: 33 findings — high 0, medium 9, low 18, false 3, maybe-false 0 (3 pre-verified VG gaps filed as patch, 2 as defer)
- findings:
  - `[medium]` `[patch]` `AbortSignal.any` called synchronously with no feature-detect; on Safari < 17.4 / Chrome < 116 every hook throws from `useEffect` and unmounts the shell (BH, EC) — guard `typeof AbortSignal.any === "function"`, else forward the caller's abort onto the internal controller
  - `[medium]` `[patch]` Client steering POST 30 s < server steward 60 s (revise up to 120 s): slow successful turns reported as timeouts, inviting duplicates (BH, EC) — Patrick decided `STEERING_POST_TIMEOUT_MS = 2×PROVIDER + 10 s` for the composer only; frozen constants line amended by the human
  - `[low]` `[defer]` `withDeadline` never cancels the underlying `env.AI.run` / `SourceCheck` (no `AbortSignal` on the provider/connector seams) — real, but the fix widens both seams; 3.20 (provider signal) and 3.21 (connector signal) own it
  - `[low]` `[patch]` `aria-disabled` on a role-less `<span>` is not valid ARIA 1.2 — use `role="link"` + `aria-disabled="true"` (APG disabled-link pattern) so the frozen `aria-disabled` requirement holds and AT honours it; adjust the markup pin
  - `[low]` `[patch]` Live-URL trust anchor gained `target="_blank" rel=…` and `external: true`; frozen block says anchors render as today — delete the additions
  - `[medium]` `[patch]` `ModeControls` POST timeout snaps the slider back with no notice and no re-fetch, so a server-applied change can show stale (BH, EC×2, VG) — add `MODE_TIMEOUT_NOTICE`, re-fetch `/api/mode`, and the hung-POST mount test
  - `[medium]` `[patch]` VG: `LOOP_TIMEOUT_NOTICE` later-poll branch untested (BH, VG) — add the running-Run poll-hang test; also clear the notice when a later poll succeeds (EC)
  - `[low]` `[patch]` `source.skipped { reason: "timeout" }` stamped with the pre-check timestamp, 60 s early — capture `createdAt` inside the deadline branch
  - `[false]` `[reject]` Spec Change Log #2 stale / Code Map claims `AbortSignal.timeout` is fake-timer driven — fixes edit this build's spec; the frozen row was amended by the human and the Change Log entry records the pre-decision state; Code Map is the planning artifact the Implementation Notes already correct
  - `[false]` `[reject]` Status fields disagree; runbook still says 0016 — `sprint-status` moves at step 5; the runbook records deployed state, which is 0016 until `deploy:build` runs after merge (3.17/3.18 precedent)
  - `[low]` `[patch]` `CREATE INDEX` without `IF NOT EXISTS` makes 0017 non-rerunnable and would roll back the seed with it; header credits the CHECK instead of the PRIMARY KEY (BH, EC) — add `IF NOT EXISTS`, fix the sentence
  - `[low]` `[patch]` `gatewaySeed.test.ts` steward-ask case depends on the prior test's Run; fails under `-t` (BH, EC, VG confirmed) — create its own Run
  - `[low]` `[reject]` `timeouts.test.ts` lacks pre-aborted-signal and late-rejection cases — both paths already behave (combined signal aborts immediately; `Promise.race` absorbs the late rejection); tests for non-defects
  - `[medium]` `[patch]` VG: `ModeControls` hung-POST busy reset unverified — grouped with the ModeControls notice patch
  - `[medium]` `[patch]` VG: `usePoll` vote POST `inFlight` latch release on timeout unverified — add a `renderHook` test under fake timers
  - `[medium]` `[patch]` VG: apex hooks / boards adopt `fetchWithTimeout` with no hung-fetch test — add one detail-hook case (`useCaseDetail` → `error`) and one board case (`useCircuitData`/`CircuitMap` → `failed`/`ready`)
  - `[low]` `[defer]` VG: `PendingDrafts` / `RunLog` hung-GET untested — one-line repeats of the `EvidenceDetail` ops pattern; ledger
  - `[medium]` `[patch]` VG: `warnEvidenceLost` on config revert and guidance revoke unexercised — two `failBatchAfter` tests, count batches with `batchCalls()`
  - `[low]` `[defer]` VG: 0017 idempotence test runs its own SQL, not the migration's text — D1 applies each migration once; ledger with the `env.TEST_MIGRATIONS` re-apply recipe
  - `[low]` `[reject]` Headers-then-stalled body escapes the deadline (timer cleared on headers) — Workers return buffered JSON; keeping the timer through body consumption changes the helper contract
  - `[medium]` `[patch]` `EvidenceDetail` 4 s poll aborts the in-flight request, so during a live Run a hung GET is swallowed as `AbortError` every 4 s and the 15 s deadline never fires (EC; verified at `EvidenceDetail.tsx:713-715`) — skip a poll tick while a load is in flight instead of aborting it
  - `[low]` `[patch]` `LOOP_TIMEOUT_NOTICE` persists after a later poll succeeds and overwrites `RUN_TIMEOUT_NOTICE` — grouped with the LoopControls patch
  - `[medium]` `[patch]` `ApprovalQueue` reload GET timeout after a decision replaces a loaded queue with the timed-out EmptyState — keep the loaded view and show a notice when `status === "ready"` (mirror LoopControls)
  - `[low]` `[defer]` Sequential per-source/per-Draft deadlines can exceed the Workflow step default (Cloudflare docs: 10 min, 5 exponential retries) with 10+ hung sources; the step failure path never marks the Run `failed` (EC×2) — 4 seed sources today; 3.21 owns step `timeout` config / parallel connectors; ledger
  - `[low]` `[reject]` A connector's inner `DeadlineError` is mislabeled as the 60 s connector timeout — no real connectors yet; label check is extra
  - `[low]` `[patch]` Evidence-lost warning names only `config.steered` / `guidance.recorded` while the batch also carried `steering.applied` — warn with `events: [...]`
  - `[false]` `[reject]` Live-URL `ApexShell` branch untested — unreachable while `DONATE_URL` is a constant placeholder; the `target`/`rel` additions are removed by the patch above

## Design Notes

Timeouts map onto outcomes the vocabulary already has — a hung connector is a `source.skipped` reason, a hung model is a `provider_error` — so the migration is seed + index only and `evidence_events` is not rebuilt. Connector timeouts count as `failed: true` so a day where every source hangs is an honest `failed` Run, not an `empty` one that reads as "no news" (refines §4.1 "never fails the Run": sibling Drafts still reach the gate). The deadline wraps the gateway's provider seam rather than `env.AI.run` so fakes and 3.20's OpenRouter provider inherit it.

## Verification

**Commands:**
- `npm test` -- expected: pass, including timeout matrix under fake timers, no-seed role resolution, failing-batch cases, r2 revise
- `npm run check` -- expected: exit 0

**Manual checks (if no CLI):**
- `npm run deploy:build` applies `0017`; `/admin#loop` Run now → ops. `/runs/:id` shows `draft.evaluated` with `workersai` `llm_calls`; apex trust band shows "donations open soon"
