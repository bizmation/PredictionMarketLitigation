---
title: 'Story 3.18: Standing Corrections & Durable Guidance'
type: 'feature'
created: '2026-09-17'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 32974ed8ebfc0098ade4843ebd20fe99950e645e
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
warnings:
  - oversized
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A correction issued on one Run (a 3.16 revise instruction) is forgotten by the next Run, so the drafter repeats the same mistake and the loop is merely supervised, not improving.

**Approach:** An explicit `intent: "guidance"` on the existing steering POST records the operator's text as a versioned, attributed `standing_guidance` item; edits and revokes are new versions of the same item. In-force items are injected into the *drafter* prompt only, snapshotted on `run.started`, and attributed per Draft. Public `GET /api/standing-guidance` plus `guidance.recorded` / `guidance.revoked` Evidence make every item and every change public.

## Boundaries & Constraints

**Always:**
- Reuse `POST /api/admin/runs/:runId/steering` (requireOperator). Persist the operator turn first (`persistTurnReceipt`); never roll it back. `intent` values: `"ask"` | `"revise"` | `"config"` | `"guidance"`. The operator control sets it; never classify from text. Ask/revise/config paths stay 3.15/3.16/3.17.
- Guidance is structured: no steward `complete()`. New item: `intent: "guidance"` + `content` (the guidance text). Edit: add `guidanceItemId`; content is the new text. Revoke: `guidanceItemId` + `revoke: true`; content is the public reason. Every write inserts a new `standing_guidance` version row (`item_id`, `version` ≥ 1 per item, `content`, `status: active|revoked`, `actor_display_name`, `source_turn_id`, `created_at`, `revoked_at`). History is never deleted or updated in place. In-force = latest version per item with `status = active`.
- Guidance is public authorized context: a `private: true` guidance turn is refused as `invalid` with a calm message (the turn is still persisted). `denyToolShaped` still runs on the turn.
- Cap (decided 2026-09-17): `STANDING_GUIDANCE_CAP = 12` in-force items and `STANDING_GUIDANCE_MAX_CHARS = 600` per item, code constants in `src/shared/schemas/standingGuidance.ts`, exposed on the public GET. A new item over the cap, or content over the length, is `invalid` (turn persisted, no version row). Edits and revokes are always allowed.
- Drafter only: `draftAndReview` loads in-force guidance once per call and passes it to `buildScopedPrompt("drafter", …)` as a `"Standing guidance:"` block after the revision-instruction block. The reviewer prompt, `ALLOWED_TOOLS`, `pickAuthorizedContext`, action policy, YOLO threshold, budget, mode, and guardrail rules are untouched; a tool-shaped drafter reply is still denied. Both daily and 3.16 revise paths get guidance through `draftAndReview`.
- Evidence: `guidance.recorded` `{ turnId, itemId, version, content, actor }` and `guidance.revoked` `{ turnId, itemId, version, reason, actor }` on the steering Run, plus second `steering.applied` `{ effect: "guidance", turnId, itemId, version }`. `run.started` payload adds `guidanceInForce: [{ itemId, version }]` snapshot. `draft.evaluated` payload adds `guidance: [{ itemId, version }]` = items in that Draft's drafter prompt. Evidence writes after the version row are best-effort (3.17 pattern); HTTP stays `ok` when the row landed.
- Public readability (decided 2026-09-17): the public GET plus `guidance.*` Evidence on `/runs/:id` are the ops. surface (3.17 parity); no separate ops. list page. `GET /api/standing-guidance` (mode parity, no-store): `{ cap, maxChars, inForce: [...], history: [...] }` with `itemId`, `version`, `status`, `content`, `actor`, `createdAt`, `revokedAt`, `sourceTurnId`. No `steering_turns` leak.
- Admin panel: fourth composer control **Record guidance** (`intent: "guidance"`); an in-force list fetched from the public GET with count/cap, per-item **Edit** (prefills composer + `guidanceItemId`) and **Revoke** (sends `revoke: true` with the composer text as reason). Same `onSubmittingChange` busy wiring; J/K/A/E/R untouched.
- Migration `0016`: `standing_guidance` table + `evidence_events` rebuild (0015 pattern) admitting `guidance.recorded`, `guidance.revoked`.
- Regression fixture: guidance recorded on Run N; Run N+1 drafter prompt contains it and `run.started.guidanceInForce` lists it; Run N's own earlier drafter prompt did not; after revoke, Run N+2 excludes it and `guidance.revoked` is public.

**Never:**
- Steward `complete()` on guidance turns, LLM classification of intent, guidance in the reviewer/steward/YOLO prompts, guidance as a tool or allowlist entry, in-place UPDATE/DELETE of guidance rows, retroactive re-draft of existing Drafts when guidance changes, live-F1 publish, `afterPackaging` / `autoApproveRun` / `decide` from this path, review-cadence timers or expiry, `surfaces/*` → `pipeline/*` imports, wrangler/cron/binding changes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Record | Awaiting Run, `intent: "guidance"`, content ≤ max, in-force < cap | Turn + `steering.turn`; `standing_guidance` v1 row; `guidance.recorded` + applied `effect: "guidance"`; GET lists it in force | N/A |
| Next Run uses it | After record, 3.12 `POST /api/admin/runs` | `run.started.guidanceInForce` has `{ itemId, version: 1 }`; drafter prompt contains the text under "Standing guidance:"; reviewer prompt does not; `draft.evaluated.guidance` lists it | N/A |
| Edit | `guidanceItemId` + new content | v2 row `active`; GET in-force shows v2 text, history has v1 and v2; `guidance.recorded` version 2 | N/A |
| Revoke | `guidanceItemId` + `revoke: true` + reason | New row `status: revoked`, `revoked_at` set; GET in-force omits it; `guidance.revoked` public; next Run's prompt and `guidanceInForce` exclude it | N/A |
| Cap reached | In-force count == cap, new item | Turn persisted; no row; `invalid` with calm "cap reached, revoke or edit" message | Fail closed |
| Too long | content > max chars | Turn persisted; no row; `invalid` | Fail closed |
| Private guidance | `private: true` | Turn persisted (private); no row; `invalid` "guidance is public authorized context" | Fail closed |
| Unknown item | `guidanceItemId` not found | Turn persisted; `invalid` | Fail closed |
| Containment | Guidance text asks to grant a tool / raise threshold / change mode; drafter echoes a tool request | Drafter tool request denied as today; `ALLOWED_TOOLS`, `GET /api/mode`, threshold unchanged; guidance never in reviewer prompt | Fail closed |
| Ask/revise/config unchanged | `intent` omitted/`ask`/`revise`/`config` | No `standing_guidance` write | N/A |
| Zero F1 | Any guidance write | Entity tables unchanged | Fail closed |

</frozen-after-approval>

## Code Map

- `migrations/0016_standing_guidance.sql` -- NEW -- `standing_guidance` (`id` PK, `item_id`, `version` INT ≥1, `content`, `status IN ('active','revoked')`, `actor_display_name`, `source_turn_id` NULL, `created_at` 24-char, `revoked_at` NULL 24-char; UNIQUE `(item_id, version)`). Rebuild `evidence_events` per `0015:35-55` adding `guidance.recorded`, `guidance.revoked`.
- `src/shared/schemas/vocabulary.ts:265-285` -- ADD both events; CHECK comment = 0016. `vocabulary.test.ts` parity.
- `src/shared/schemas/standingGuidance.ts` -- NEW -- `STANDING_GUIDANCE_CAP`, `STANDING_GUIDANCE_MAX_CHARS`, `StandingGuidanceVersionSchema`, `PublicStandingGuidanceSchema`. Mirror `pipelineConfig.ts:62-97`.
- `src/shared/schemas/steering.ts:21-30,49-88` -- ADD intent `"guidance"`, optional `guidanceItemId`, `revoke` (boolean); `PublicSteeringTurn` adds `guidanceItemId: string | null`, `guidanceVersion: number | null`; extend `toPublicSteeringTurn`.
- `src/shared/db/repos/standingGuidanceRepo.ts` -- NEW -- `listInForce`, `listHistory`, `getPublic`, `nextVersion(itemId)`, `appendVersion` (validate-before-insert, `?` binds), `revoke`. Follow `pipelineConfigRepo.ts:20-51,113-164`. Item id = `sg:${newId()}`.
- `src/pipeline/steering/submitTurn.ts:51-66,489-641` -- ADD `guidance` branch beside `steerPipelineConfig` (L384): private → invalid; cap/length; edit/revoke; Evidence best-effort; second `steering.applied`. Reuse `persistTurnReceipt`, `denyToolShaped`, `evidenceId(..., "guidance")`.
- `src/pipeline/agents/draftAndReview.ts:169-215,410-444` -- `buildScopedPrompt` gains `guidance?: readonly string[]` used only in the drafter branch; `draftAndReview` loads `standingGuidanceRepo.listInForce` once and passes texts; `persist` (L225-261) adds `guidance: [{itemId, version}]` to `draft.evaluated`.
- `src/pipeline/ai/actionPolicy.ts:17-44` -- READ ONLY (`ALLOWED_TOOLS`, `AUTHORIZED_CONTEXT_KEYS`); do not add guidance here.
- `src/pipeline/workflow/dailyRunSteps.ts:81-87` -- `ensureRun` `run.started` payload adds `guidanceInForce`.
- `src/server.ts:423-506` -- forward `guidanceItemId`, `revoke`.
- `src/shared/api/publicRouter.ts:283-290` -- ADD `GET /api/standing-guidance` via `jsonNoStore`.
- `src/surfaces/admin/SteeringPanel.tsx:82-94,163-222,308-355` -- fourth button, in-force list + Edit/Revoke, count/cap line, calm invalid messages.
- `src/surfaces/ops/EvidenceDetail.tsx:219-248` -- `stepLabel` handles `itemId`/`version`/`content`/`reason`; `guidanceInForce` count on `run.started`.
- Tests: `submitTurn.test.ts` (matrix + regression fixture across Runs via `ensureRun`/`monitorAndPackage`/`afterPackaging`), `draftAndReview.test.ts` (prompt placement, reviewer exclusion, tool deny with guidance), `adminApi.test.ts`, `publicApi.test.ts` (no-store), `SteeringPanel.mount.test.tsx`, `evidenceDetail.test.tsx`, `dailyRun.test.ts` (`guidanceInForce`).
- `_bmad-output/implementation-artifacts/sprint-status.yaml:89` -- backlog → in-progress → done.

## Tasks & Acceptance

**Execution:**
- [x] `migrations/0016_standing_guidance.sql` -- table + Evidence CHECK rebuild -- durable, append-only history
- [x] `src/shared/schemas/standingGuidance.ts` / `vocabulary.ts` / `steering.ts` -- constants, DTOs, events, intent fields
- [x] `src/shared/db/repos/standingGuidanceRepo.ts` -- in-force, history, append, revoke, public projection
- [x] `src/pipeline/steering/submitTurn.ts` -- guidance branch (record/edit/revoke, cap, private refusal, Evidence)
- [x] `src/pipeline/agents/draftAndReview.ts` + `src/pipeline/workflow/dailyRunSteps.ts` -- drafter injection, per-Draft attribution, `run.started` snapshot
- [x] `src/shared/api/publicRouter.ts` + `src/server.ts` -- public GET + admin POST fields
- [x] `src/surfaces/admin/SteeringPanel.tsx` + `src/surfaces/ops/EvidenceDetail.tsx` -- Record/Edit/Revoke + public labels
- [x] tests + `sprint-status.yaml` -- I/O matrix + regression fixture

**Acceptance Criteria:**
- Given the composer on an awaiting Run, when I Record guidance, then `GET /api/standing-guidance` lists it in force with version, actor, time, and ops. `/runs/:id` shows `guidance.recorded`
- Given an in-force item, when I trigger the next Run from loop controls, then that Run's `run.started` lists the item in `guidanceInForce` and each Draft's `draft.evaluated` attributes it
- Given an item, when I Edit or Revoke it, then history retains every version, the in-force list reflects the change, and the change is a public Evidence event
- Given guidance whose text asks for a tool, a threshold change, or a mode change, when the next Run drafts, then tools are still denied and `GET /api/mode` is unchanged
- Given the cap is reached, when I Record another item, then the composer shows a calm cap message and nothing is written
- Given ordinary Submit, Revise draft, or Steer pipeline, when I reload `GET /api/standing-guidance`, then it is unchanged

## Implementation Notes

- 2026-09-17 — Implemented per Code Map. Decisions made where the spec was silent:
  - An edit or a second revoke of an already-revoked item is refused as `invalid` ("already revoked; record a new item"). Reinstating through edit would bypass the cap and muddy the v1 → … → revoked lineage; a new item is the honest path.
  - `revoke` without `guidanceItemId` is `invalid` (unknown item), turn persisted.
  - Per-item length (`STANDING_GUIDANCE_MAX_CHARS`) applies to edit text and revoke reasons as well as new items; only the cap is new-item-only.
  - `draft.evaluated.guidance` is the in-force list loaded once at the start of `draftAndReview`. Drafts stamped `evals_not_run` after a budget stop (never given a drafter prompt) carry `guidance: []`; a Draft whose drafter call threw still carries the list because the prompt was built with it.
  - Every `draft.evaluated` now carries `guidance` (possibly `[]`); four exact-payload assertions in `draftAndReview.test.ts` were updated to include it.
  - Composer: **Revoke** with an empty composer shows a calm prompt to type the public reason rather than silently doing nothing. **Edit** switches the fourth button to "Save guidance edit" with a "Cancel edit" control.
  - `listInForce` orders by each item's first `created_at` then `item_id`, so the drafter sees a stable numbered list.
- Verification: `npm run check` exit 0; `npx vitest run` 43 files / 833 tests passed, exit 0 (baseline before the story: 800).

## Spec Change Log

## Review Triage Log

### 2026-09-17 — Review pass
- verdicts: 34 findings — high 0, medium 3, low 27, false 4, maybe-false 0
- findings:
  - `[false]` `[reject]` `run.started.guidanceInForce` diverges from the live `listInForce` re-read in `draftAndReview` (BH, EC×2) — by design: the frozen block defines `run.started` as the at-start snapshot and `draft.evaluated.guidance` as the per-Draft authoritative record; a revise on Run N after a record is exactly the case where they legitimately differ and both are on Evidence; 3.17 rejected the analogous `run.started` version vs later re-read
  - `[low]` `[reject]` Cap/version not atomic under two concurrent guidance POSTs (BH, EC) — single operator; 3.17 rejected the same `appendVersion` unique clash; fix is a batch/`INSERT…SELECT` rewrite
  - `[low]` `[reject]` Guidance gated by the Draft-pending check and by an open Run; no UI path with an empty queue (BH, EC×2) — the frozen block chose the steering POST on an open Run (3.17 parity: "3.12 starts the next Run"); the queue selects pending Drafts only; fix adds intent-specific branching or a new route
  - `[low]` `[reject]` Schema accepts `guidanceItemId`/`revoke` on other intents and `revoke` without an id persists a turn (BH, EC) — same optional-field pattern as 3.17 `key`/`revertToVersion`; the UI never sends them; matrix row "Unknown item → turn persisted; invalid" is the specified behavior; fix adds a `superRefine`
  - `[medium]` `[patch]` Edit mode leaks: `editingItemId` survives an ask/revise/config submit, and Revoke on item B while editing A sends A's text as B's public reason (BH, EC×2) — reset the pin on every successful submit; refuse Revoke of a different item while editing with a calm message
  - `[low]` `[reject]` No client-side guard for private + Record guidance — frozen block specifies server refusal with the turn persisted; the composer shows the calm message
  - `[low]` `[patch]` `idx_standing_guidance_item` duplicates the `UNIQUE (item_id, version)` autoindex — delete it (0016 is unreleased)
  - `[low]` `[reject]` Public `history` unbounded; panel fetches then discards it — operator-paced growth under a 12-item cap; 3.17 history is likewise unbounded; fix adds a query param
  - `[low]` `[patch]` Multi-line guidance renders as an unnumbered continuation in the drafter block — collapse internal whitespace when rendering each item; add a multi-line test
  - `[low]` `[reject]` `appendVersion`/`revoke` DB errors surface as 400 "Guidance did not apply." — identical to 3.17's `revertTo`/`appendVersion` handling; D1 outage is not everyday
  - `[low]` `[reject]` `countInForce` Zod-parses every row; a malformed row under-counts — corrupt D1, not everyday; 3.17 rejected the corrupt-row fallback
  - `[false]` `[reject]` Code Map promises `vocabulary.test.ts` parity not in the diff — CHECK↔enum parity is verified by the `publicApi.test.ts:1128` sweep (confirmed by VG); a spec edit is not a patch
  - `[low]` `[patch]` `sprint-status.yaml` header comment and field disagree on `last_updated` — align (bookkeeping, applied by the orchestrator); spec status is workflow-managed and moves to done in step 5
  - `[low]` `[reject]` Empty `catch` around guidance Evidence hides a lost `guidance.*` receipt — best-effort after the row is the frozen design (3.17 pattern); discoverability rides the VG defer entry below
  - `[low]` `[patch]` Duplicate `../connectors/connector` import in `submitTurn.test.ts` — merge
  - `[medium]` `[patch]` VG: `denyToolShaped` on a guidance turn is unverified — add a tool-shaped guidance turn test asserting `guardrails.failed` on the turn and an unchanged allowlist
  - `[medium]` `[patch]` VG: in-force ordering never observed with >1 item — extend `publicApi.test.ts` with two active items where the older is edited after the newer exists; assert `inForce` order
  - `[low]` `[patch]` VG: edit pin not verified to clear on selection change — mount test enters edit mode, rerenders with a new `draftId`, asserts the label/banner reset
  - `[low]` `[defer]` VG: best-effort Evidence after the version row has no partial-failure test — repo has no DB fault-injection harness; 3.17's identical catch is untested the same way
  - `[low]` `[reject]` Budget stop after a prior Draft attributes guidance to a Draft whose drafter call was refused pre-provider — budget stops are not everyday; the Draft is `evals_not_run` so no drafter output is shown; fix adds a sent-flag
  - `[low]` `[reject]` Composer text discarded when Edit is clicked — a confirm dialog is extra UI; the prefilled text is visible before Save
  - `[low]` `[reject]` Mount-time GET can race the post-submit reload — not everyday; 3.17 rejected the stale GET
  - `[low]` `[patch]` "takes effect on the next Run" omits that a Revise draft on the current Run already sees new guidance — copy change in the three messages and the test string
  - `[low]` `[reject]` A row that fails `StandingGuidanceVersionSchema` vanishes while `nextVersion` still counts it — only reachable by lowering the constant below stored content; not everyday
  - `[low]` `[reject]` No-op edit with identical content appends a version — extra guard; harmless history row
  - `[false]` `[reject]` AC "nothing is written" at cap vs persisted turn + receipt Evidence — the frozen matrix row states "Turn persisted; no row"; the AC's "nothing" is the guidance row, as the test pins
  - `[false]` `[reject]` Observation: a tool-shaped guidance turn is denied then still recorded — the frozen containment row accepts this (drafter echo is denied; `denyToolShaped` receipts the turn), consistent with 3.15

## Design Notes

Guidance is operator text, not steward output, so there is no LLM in the write path and no parse failure mode. Versions per item (not global) keep edit/revoke lineage readable: `sg:abc` v1 → v2 → v3 (revoked). "Influenced" is attributed honestly as "present in the drafter prompt" — the same standard `guardrails.passed.context` already uses; the system does not claim to know what the model weighed.

## Verification

**Commands:**
- `npm test` -- expected: pass, including guidance I/O matrix, N→N+1 regression fixture, reviewer exclusion, containment
- `npm run check` -- expected: exit 0

**Manual checks (if no CLI):**
- `/admin#queue` Record guidance → ops. `/runs/:id` shows `guidance.recorded`; trigger a Run → `run.started` lists it; Revoke → next Run excludes it; Submit/Revise/Steer do not change `GET /api/standing-guidance`
