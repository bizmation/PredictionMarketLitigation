---
title: 'Story 3.17: Conversational Pipeline Steering'
type: 'feature'
created: '2026-09-17'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
baseline_revision: 558711349fea13a1c94d42e4a84036dee19ba9de
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
warnings:
  - oversized
deferred: []
---

<intent-contract>

## Intent

**Problem:** Source/pipeline config is a hardcoded `POLL_SOURCES` list, so adding a docket to Tier-1 or changing monitoring scope still requires a redeploy.

**Approach:** An explicit `intent: "config"` on the existing steering POST versions `poll_sources` in `pipeline_config_versions`. The next Run reads that list. YOLO/budget/mode/guardrails/allowlist stay refused and publicly logged. Revert is a structured field on the same POST.

## Boundaries & Constraints

**Always:**
- Reuse `POST /api/admin/runs/:runId/steering` (requireOperator). Persist the operator turn first; never roll it back if steward/`complete()` fails. First `steering.applied` stays `{ effect: "none" }`.
- `intent`: `"ask"` | `"revise"` | `"config"`. The operator control sets it. Do not classify from text. Ask and revise paths stay 3.15/3.16.
- Sole steerable key: `poll_sources` (`PollSource[]`: `name`, `url`, `tier: tier1|tier2`). Seed = today's `POLL_SOURCES` (effective version 0 until the first write). "Add a docket to Tier-1" = upsert that URL as `tier1`. "Change monitoring scope" = add/remove entries. "Adjust an escalation category" = change a source's `tier` (3.4 `tier2Only` on packaged Drafts).
- Conversational apply: `intent: "config"` + `content`, no `revertToVersion`. After persist + `denyToolShaped`, `complete({ role: "steward" })` with current effective list as authorized context; steward text must parse as `{ key, value }`. Allowed apply: `{ key: "poll_sources", value: PollSource[] }`. If the instruction asks to change YOLO/budget/mode/guardrails/allowlist, steward returns `{ key: "<forbidden>", value: null }` so code can log refusal. Code validates; then insert version row (`version`, `key`, `prior_value`, `new_value`, `actor`, `created_at`) and Evidence.
- Revert: `intent: "config"` + `key: "poll_sources"` + `revertToVersion` (integer ≥ 0) + `content`. No steward/`complete()`. Version 0 restores the seed list. Writes a new version row (does not delete history).
- Public `GET /api/pipeline-config` (mode parity, no-store): current effective list, current version, history `{ version, key, prior, next, actor, createdAt }`. No `steering_turns` leak.
- Evidence: `config.steered` `{ turnId, key, version, prior, next }` on success, or `{ turnId, refused: true, key, reason }` on governance/unknown-key refusal (no version row). Second `steering.applied` `{ effect: "steered", turnId, key, version }` only on success. Private withholds instruction `content`, never key/version/effect/actor/time/refused.
- Next Run: `monitorAndPackage` loads effective `poll_sources` from D1 (seed if none). `run.started` payload includes `pollSourcesVersion`. In-flight Runs do not re-poll. 3.12 manual trigger is the "next Run" test hook. No wrangler/cron/binding change.
- YOLO threshold, budget, mode, guardrail rules, `ALLOWED_TOOLS`, and FR-17 `INELIGIBLE_REASON_VALUES` / `BAKED_BLOCKERS` are not writable here. Steward allowlist stays `[]`. Config is a code branch, not a steward tool.
- Unconfigured steward or unparseable proposal: turn persists; no version row; result `invalid` (composer must not look successful). Budget-stop during config `complete()`: typed `budget_stopped` + turn body; no version row.

**Never:**
- 3.18 `standing_guidance`, live-F1 publish, seeding `gateway_config`, as-you-type streaming, retroactive privatize, LLM ask-vs-revise-vs-config classification, mutating `sources` (claim attribution), Workflow restart, `afterPackaging` / `autoApproveRun` / `decide` / F1 apply from this path, `surfaces/*` → `pipeline/*`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy steer | Awaiting Run, `intent: "config"`, steward returns valid `poll_sources` adding a tier1 URL | Turn + `steering.turn`; new `pipeline_config_versions` row; `config.steered` + applied `effect: "steered"`; `GET /api/pipeline-config` shows the new list; F1/mode unchanged | N/A |
| Next Run uses it | After happy steer, `POST /api/admin/runs` (3.12) | New Run `run.started.pollSourcesVersion` is the new version; `monitorAndPackage` iterates the steered list, not compile-time-only seed | N/A |
| Revert | `intent: "config"`, `key: "poll_sources"`, `revertToVersion: 0` | New version row whose `new_value` equals seed; list/GET show seed; history retained | N/A |
| Governance refusal | Steward returns `{ key: "mode" }` or `{ key: "budget" }` / allowlist / threshold / guardrails | Turn persisted; no version row; public `config.steered` `refused: true`; `GET /api/mode` and budget unchanged | Fail closed |
| Private instruction | `private: true`, steer succeeds | Public Evidence: no instruction text; key/version/effect/actor/time remain | N/A |
| Ask/revise unchanged | `intent` omitted/`ask`/`revise` | No `pipeline_config_versions` write; 3.15/3.16 behavior | N/A |
| Zero F1 | Happy steer | Entity tables unchanged | Fail closed if any write slips |
| Unconfigured / bad JSON | No steward mapping, or complete() text is not a valid patch | Turn persisted; no version row; `invalid` | Fail closed |
| Budget stop | Ceiling during config `complete()` | Turn persisted; no version row; HTTP 409 `budget_stopped` with turn body | Typed, no 500 |

</intent-contract>

## Code Map

- `migrations/0015_pipeline_config_versions.sql` -- NEW -- `pipeline_config_versions` (`version` INT per `key`, `key` TEXT, `prior_value`/`new_value` TEXT JSON, `actor_display_name`, `created_at` 24-char UTC). Unique `(key, version)`. Rebuild `evidence_events` (0014 pattern) adding `config.steered`.
- `src/shared/schemas/vocabulary.ts:265-284` -- ADD `config.steered`; comment CHECK = 0015.
- `src/shared/schemas/pipelineConfig.ts` -- NEW -- `PollSource` Zod (mirror `sources.ts`), version row DTO, public GET body, forbidden-key list.
- `src/shared/schemas/steering.ts:18-27,40-79` -- ADD `intent` value `"config"`; optional `key`, `revertToVersion` (int ≥ 0). Public turn may add `configVersion: number | null` (null on ask/revise/refusal).
- `src/shared/db/repos/pipelineConfigRepo.ts` -- NEW -- `getEffectivePollSources` (latest `poll_sources` or seed), `listHistory`, `appendVersion`, `revertTo` (reads that version's `new_value`, or seed at 0). Validate-before-insert like `steeringTurnsRepo`.
- `src/pipeline/connectors/sources.ts:1-28` -- KEEP `POLL_SOURCES` as version-0 seed; export a loader used by the repo (do not delete the constant).
- `src/pipeline/workflow/dailyRunSteps.ts:16,79-85,152-165` -- `monitorAndPackage` iterates `getEffectivePollSources(db)` not the static import; `run.started` payload adds `pollSourcesVersion`.
- `src/pipeline/steering/submitTurn.ts:35-48,266-386` -- ADD `config` branch after persist + `denyToolShaped`, parallel to `reviseDraft`. Never call `modeRepo.set`, role-model writes, or `ALLOWED_TOOLS`. Snapshot F1/mode in tests.
- `src/pipeline/agents/StewardAgent.ts` -- ADD config-steer prompt: current list + JSON patch only; forbidden-control asks return `{ key: "<forbidden>", value: null }`; keep governance denial lines.
- `src/pipeline/ai/actionPolicy.ts:37-44` -- READ ONLY steward `[]`.
- `src/pipeline/gate/yoloPolicy.ts:22-29` -- READ ONLY `BAKED_BLOCKERS` (not chat-mutable).
- `src/server.ts:423-493` -- forward new body fields; 409 copy can stay generic ceiling or say config did not apply.
- `src/shared/api/publicRouter.ts:281-284` -- ADD `GET /api/pipeline-config` beside `/api/mode`.
- `src/surfaces/admin/SteeringPanel.tsx:47-70,184-191` -- third `type="button"` "Steer pipeline" sends `intent: "config"`. Fetch `GET /api/pipeline-config` and offer revert of a listed version (`revertToVersion` + `key`). Same `onSubmittingChange` busy wiring.
- `src/surfaces/admin/ApprovalQueue.tsx:354-383,528-536` -- READ ONLY busy/J/K/A/E/R contract; do not remount.
- `src/surfaces/ops/EvidenceDetail.tsx:172-195` -- `stepLabel` includes `config.steered` key, version, refused/reason.
- Tests: `submitTurn.test.ts`, `adminApi`, `publicApi`, `connector.test.ts` (steered list on next package), `SteeringPanel*`, `evidenceDetail`. Pin: seed fallback, next-Run list, revert, refusal, ask/revise unchanged, F1/mode unchanged, empty steward allowlist.
- `_bmad-output/implementation-artifacts/sprint-status.yaml:88` -- backlog → in-progress then done.

## Tasks & Acceptance

**Execution:**
- `migrations/0015_pipeline_config_versions.sql` -- table + `config.steered` CHECK
- `src/shared/schemas/pipelineConfig.ts` / `vocabulary.ts` / `steering.ts` -- DTOs, event, intent, revert fields
- `src/shared/db/repos/pipelineConfigRepo.ts` -- effective list, append, revert, history
- `src/pipeline/steering/submitTurn.ts` + `StewardAgent.ts` -- config branch
- `src/pipeline/workflow/dailyRunSteps.ts` -- next-Run read + `run.started` version
- `src/shared/api/publicRouter.ts` + `src/server.ts` -- public GET + admin POST fields
- `src/surfaces/admin/SteeringPanel.tsx` + `src/surfaces/ops/EvidenceDetail.tsx` -- Steer/revert + public event
- tests + `sprint-status.yaml` -- I/O matrix

**Acceptance Criteria:**
- Given the steering composer on an awaiting Run, when I submit Steer pipeline with an instruction that adds a Tier-1 docket URL, then `GET /api/pipeline-config` and ops. `/runs/:id` show a new `poll_sources` version with actor, time, prior, and next
- Given that version, when I trigger a new Run from admin loop controls, then that Run's Evidence `run.started` cites the new version and `source.skipped` or `source.fetched` names the steered sources, including the new Tier-1 URL
- Given a prior version, when I revert `poll_sources` to it, then the public list matches that prior value and history still contains both writes
- Given a config turn that asks to change YOLO, budget, mode, guardrails, or the allowlist, when I reload ops. Evidence and `GET /api/mode`, then the refusal is on the public record and those controls are unchanged
- Given a successful private config turn, when I open ops. Evidence, then instruction text is withheld and key/version/effect remain
- Given ordinary Submit turn or Revise draft, when I reload `GET /api/pipeline-config`, then the list is unchanged

### Review Findings

2026-09-21 — follow-up review. 4 layers, 27 findings — 0 decision-needed, 4 patch, 0 defer, 23 rejected.

- [x] [Review][Patch] Fenced tool-shaped steward JSON still versions `poll_sources` [src/pipeline/steering/submitTurn.ts:480]
- [x] [Review][Patch] Config `intent` has no test that tool-shaped steward text fails closed [src/pipeline/steering/submitTurn.test.ts:1201]
- [x] [Review][Patch] Revert with a non-`poll_sources` key is untested [src/pipeline/steering/submitTurn.ts:432]
- [x] [Review][Patch] Successful Steer pipeline shows the raw steward JSON in the composer [src/surfaces/admin/SteeringPanel.tsx:310]

#### Rejected

- `low` — Refusal Evidence throw returns `invalid` — only when the `config.steered` insert throws; there is no version row to preserve, and reporting `refused` would claim a public receipt that was not written.
- `false` — Admin composer omits the effective list and history fields — AC1 is `GET /api/pipeline-config` plus ops. `/runs/:id`; both carry version, actor, time, prior, and next, and the panel's specified job is revert buttons.
- `false` — `key` / `revertToVersion` are unconstrained on ask and revise — only the config branch reads them, and a revert whose `key` is not `poll_sources` returns `invalid` before `revertTo`.
- `low` — Empty `poll_sources` can wipe monitoring — not an everyday steward result; `min(1)` would add policy the spec does not state.
- `low` — Identical `new_value` still appends a version — clicking the current version is a misclick; a no-op compare adds a branch for a list that does not change.
- `false` — Shared 409 copy now says “the change did not apply” — the spec allows that generic ceiling; the composer still shows the revision-specific sentence.
- `false` — `pipelineConfigRepo` imports the connector seed loader — the Code Map requires that loader.
- `false` — Any 200 without a numeric `configVersion` is treated as a refusal — a successful steer always returns a number; `null` is the refusal signal, and `invalid` is HTTP 400.
- `false` — Preamble before a markdown fence fails parse — the prompt requires JSON only, and unparseable text is specified to return `invalid`.
- `low` — Admin HTTP suite skips the governance-refusal path — `submitTurn` already asserts `config.steered` refused and `configVersion: null`; the route returns that turn unchanged.
- `false` — Tool-shaped config text writes no refusal Evidence — `denyToolShaped` records `guardrails.failed` before the branch returns `invalid`; `config.steered` is for a parsed forbidden key.
- `false` — `complete()` runs before `denyToolShaped` — `submitTurn` denies tool-shaped operator content before `complete()`; the later call scans the steward reply, same as ask.
- `low` — `run.started` version can disagree with the sources `monitorAndPackage` polls — the window is the gap between those two workflow steps; passing a snapshot adds parameters.
- `low` — A corrupt latest version row reports seed at version 0 — normal writes validate before insert; this is corrupt D1.
- `low` — Spec Change Log is empty — the applied patches are already in the triage log and Auto Run Result; filling the changelog edits this spec.
- `low` — Steward can return an empty `poll_sources` array — same as the empty-list row above.
- `low` — Duplicate source names collide on `evidenceId` — `INSERT OR IGNORE` drops the second event; duplicate names are not an everyday operator path, and a uniqueness refine adds schema policy.
- `low` — Latest-row parse failure falls back to seed — same as the corrupt-row row above.
- `low` — Refusal Evidence failure is remapped to `invalid` — same as the refusal-insert row above.
- `low` — A steer between `ensureRun` and `monitorAndPackage` mismatches version and sources — same as the in-flight re-read row above.
- `low` — A concurrent steer can overwrite a newer full list — two operators steering the same key during one `complete()` is not everyday; the fix is an optimistic-concurrency branch.
- `low` — Success Evidence is best-effort after the version write — tested on purpose so a committed version is not reported as `invalid`; ops. can miss `config.steered` only when that insert throws, and `GET /api/pipeline-config` still shows the row.
- `low` — Governance-refusal Evidence failure surfaces as `invalid` — same as the refusal-insert row above.

## Spec Change Log

## Review Triage Log

### 2026-09-17 — Review pass
- verdicts: 38 findings — high 0, medium 10, low 16, false 12, maybe-false 0
- findings:
  - `[false]` `[reject]` Adding a docket URL does not start live fetches — 3.4 connectors remain stubs; AC allows `source.skipped` or `source.fetched` and tests pin steered names on skip events
  - `[false]` `[reject]` Server never upserts by URL — conversational apply is a full `poll_sources` document after the instruction, as specified
  - `[low]` `[reject]` Duplicate `name`/`url` can collide on `evidenceId` — not an everyday operator path; unique refine is extra schema complexity
  - `[low]` `[reject]` `run.started` version vs later `monitorAndPackage` re-read — packaging window is seconds; in-flight steer during `running` is not everyday and the fix adds parameters
  - `[medium]` `[patch]` Version row can commit then Evidence throw maps to `invalid` — Evidence append is now best-effort after `appendVersion`/`revertTo`; HTTP stays `ok` when the write landed
  - `[low]` `[reject]` Unparsable latest row falls back to seed — corrupt D1, not everyday
  - `[medium]` `[patch]` Fenced steward JSON failed `JSON.parse` — strip leading/trailing markdown fences before parse
  - `[medium]` `[patch]` Governance refusal was HTTP 200 that cleared the composer and showed JSON — config `configVersion: null` now keeps the instruction and shows a calm unchanged/refused message
  - `[medium]` `[patch]` Ops Evidence omitted `prior`/`next` source names — `stepLabel` now summarizes those arrays when present
  - `[low]` `[reject]` Config only writable on an open Run / unknown revert has no refusal Evidence — 3.14 already closes terminal Runs; 3.12 starts the next Run; unknown revert is not everyday
  - `[low]` `[reject]` `url` has no https/max-length check on a public GET — seed URLs are already public strings; length/https guards are extra policy
  - `[false]` `[reject]` `pipelineConfigRepo` imports the seed loader from `pipeline/connectors` — Code Map required that loader; not a defect against this story's specified seed
  - `[false]` `[reject]` Empty spec changelog / sprint-status `done` while in-review — changelog stays empty until a bad_spec loopback; sprint-status `done` is the implementer bookkeeping 3.16 also used
  - `[low]` `[reject]` Concurrent `appendVersion` unique clash — two operators steering the same key at once is not everyday
  - `[medium]` `[patch]` `revertTo` then Evidence throw — grouped with the version-write/Evidence split; same best-effort fix
  - `[medium]` `[patch]` `appendVersion` then Evidence throw — grouped with the version-write/Evidence split; same best-effort fix
  - `[low]` `[reject]` Steward snapshot overwritten by a later write — not an everyday overlapping-steer path
  - `[low]` `[reject]` Steer between `ensureRun` and `monitorAndPackage` — grouped with the in-flight re-read row
  - `[low]` `[reject]` Unparsable latest row — grouped with the seed-fallback row
  - `[low]` `[reject]` Empty `poll_sources` array — not an everyday steward result; min(1) would be extra policy
  - `[low]` `[reject]` Duplicate names in packaging — grouped with the duplicate-name row
  - `[low]` `[reject]` `Poll_Sources` key refused instead of applied — prompt pins `poll_sources`; case folding is extra
  - `[false]` `[reject]` YOLO/budget/mode ask with a complying `poll_sources` reply logs no refusal — specified: code validates the patch, not the instruction text; NL classification is forbidden
  - `[low]` `[reject]` Stale `GET /api/pipeline-config` can paint old revert buttons — not everyday; steer already reloads after 200
  - `[low]` `[reject]` `run.started.pollSourcesVersion` omitted from `stepLabel` — cosmetic; the payload is on the event
  - `[medium]` `[patch]` Ops `/runs/:id` omitted prior/next — grouped with the Evidence `stepLabel` patch
  - `[false]` `[reject]` Refusal only when steward key !== `poll_sources` — grouped with the NL-classification row; specified
  - `[medium]` `[patch]` Revert to listed version ≥1 never checked the restored list — added `revertToVersion: 1` after a steer and asserted public sources match version 1, not seed
  - `[medium]` `[patch]` “Revert to seed” never clicked — mount test clicks it and asserts `revertToVersion: 0` + `key: "poll_sources"`
  - `[medium]` `[patch]` Successful Steer pipeline did not refresh revert controls — after POST, GET returns version 1 + history and the panel shows Revert to seed / Revert to version 1
  - `[false]` `[reject]` Third `intent: "config"` control vs “instruct a config change” on Submit — R1+R5 is a defensible reading; operator control is the 3.16 pattern, not text classification
  - `[false]` `[reject]` Add-docket tests use fake steward JSON rather than live NL — that is the specified conversational apply contract
  - `[low]` `[reject]` Adjust-tier / remove-source untested as distinct actions — extra fixtures; add-tier1 URL covers the AC example
  - `[low]` `[reject]` List versions is GET + revert buttons, not a prior/next/actor table — GET `/api/pipeline-config` already carries that history
  - `[false]` `[reject]` Revert lives on the same POST rather than a separate ops. control — specified structured `revertToVersion`
  - `[false]` `[reject]` Public audit is payload/HTTP rather than a richer ops. list — `config.steered` is on `GET /api/runs/:id`; labels now include prior/next names
  - `[false]` `[reject]` Next Run tested via `ensureRun`/`monitorAndPackage` not loop-control UI — that is the 3.12 write path; matrix expected behavior is covered
  - `[false]` `[reject]` Governance refusal is config-intent only — ask/revise stay 3.15/3.16; 3.14 already denies tool-shaped governance probes

## Design Notes

`poll_sources` is the only chat-writable document. FR-17 escalate *reason codes* stay 3.13 code (`BAKED_BLOCKERS`). Tier on a poll source is the 3.4 escalation classification the AC names. Unknown/forbidden keys refuse; they do not invent detectors.

Steward proposes JSON; code writes. Revert is structured so list→restore does not depend on the LLM. Version 0 is the seed constant, not a D1 row.

## Verification

**Commands:**
- `npm test` -- expected: pass, including config I/O matrix, unchanged ask/revise, empty steward allowlist
- `npm run check` -- expected: exit 0

**Manual checks (if no CLI):**
- `/admin#queue` Steer pipeline → ops. `/runs/:id` shows `config.steered`; `GET /api/pipeline-config` lists the version; trigger a Run → connectors use the new list; revert restores seed; Submit/Revise do not change the list

## Auto Run Result

Status: done

Summary: Explicit **Steer pipeline** on the queue composer versions `poll_sources` in `pipeline_config_versions`. The next Run reads that list. YOLO/budget/mode/guardrails/allowlist stays refused and publicly logged. Structured revert lists versions from `GET /api/pipeline-config`. Ask and revise are unchanged. Live F1 still moves only through the Approval Gate.

Files changed:
- `migrations/0015_pipeline_config_versions.sql` — `pipeline_config_versions` and Evidence `config.steered`
- `src/shared/schemas/pipelineConfig.ts`, `vocabulary.ts`, `steering.ts` — DTOs, event, `intent: "config"`, revert fields
- `src/shared/db/repos/pipelineConfigRepo.ts` — effective list, append, revert, history
- `src/pipeline/steering/submitTurn.ts` + `StewardAgent.ts` — config branch; fenced JSON; Evidence best-effort after version write
- `src/pipeline/workflow/dailyRunSteps.ts` — next-Run read + `run.started.pollSourcesVersion`
- `src/shared/api/publicRouter.ts` + `src/server.ts` — public GET + admin POST fields
- `src/surfaces/admin/SteeringPanel.tsx` + `src/surfaces/ops/EvidenceDetail.tsx` — Steer/revert, calm refusal, prior/next names
- tests + `sprint-status.yaml` + this spec

Review: 4 layers, 38 findings — 0 high, 10 medium. Patches: Evidence best-effort after version write; strip fenced steward JSON; calm refusal in the composer; ops. prior/next names; revert-to-version-1 assertion; Revert to seed click; Steer pipeline refreshes revert controls. Rejected stub fetches, full-list apply, duplicate names, in-flight re-read, corrupt-row fallback, open-Run-only writes, URL policy, shared→pipeline seed loader, changelog/sprint bookkeeping, concurrent/stale steers, empty list, key case, NL classification, stale GET, `pollSourcesVersion` label, third-button vs instruct, fake-JSON apply, extra tier/remove fixtures, list-table UI, and 3.12 UI vs `ensureRun`. No deferrals.

Follow-up review recommended: true — five medium patch entries (version/Evidence split, fenced JSON, composer refusal, ops. prior/next, plus three VG tests). Unverified risk: conversational apply still depends on the steward returning parseable `{ key, value }` JSON (fail-closed when it does not); `/admin#queue` → ops. Evidence was jsdom/HTTP-unit tested, not walked in a live browser.

Patch counts by verdict: high 0, medium 5 entries (Evidence best-effort, fence strip, refusal copy, prior/next labels, plus three VG tests counted in the ten medium finding rows).

Verification: `npm test` — 800 passed. `npm run check` — oxfmt/oxlint/tsc exit 0.
