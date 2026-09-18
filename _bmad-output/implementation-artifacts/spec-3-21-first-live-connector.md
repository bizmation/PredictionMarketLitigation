---
title: 'Story 3.21: First Live Connector'
type: 'feature'
created: '2026-09-18'
status: 'done'
review_loop_iteration: 0
baseline_commit: 95812b13d73aaf5b08b584457bb1232147272b2a
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
warnings:
  - oversized
deferred: []
---

<intent-contract>

## Intent

**Problem:** Every source is a stub, so the daily Run is always `empty`; the drafter, reviewer and Approval Gate have never seen real content, the seeded model config has never been exercised, and the apex charts' deterministic state (`cases.lifecycle` / `posture`) can only change by hand.

**Approach:** Poll CourtListener's v4 `docket-entries` API for the seed cases that carry a `courtlistener.com/docket/<id>/` Tier-1 source. Each new entry becomes one Draft with two parts: **(1) the record** — a deterministic, connector-authored `docket_events` row with its Tier-1 `sources` row, which the LLM cannot alter; **(2) the inference** — the drafter classifies the entry into a closed vocabulary (`kind`, `favors`) with confidence and a quoted basis, the reviewer scores it, and **code** derives any `cases` state patch from a fixed transition table. The operator accepts or strips the inference per field in the queue; the gate publishes the record plus whatever was accepted. The full reasoning is public Evidence.

## Boundaries & Constraints

**Always:**
- Source: `GET https://www.courtlistener.com/api/rest/v4/docket-entries/?docket=<id>&order_by=-date_filed&limit=20&fields=id,entry_number,date_filed,description` with `Authorization: Token <COURTLISTENER_API_TOKEN>` (per-Worker secret, already set on `pml-build`; typed on `Env` as optional). Dockets = every case whose Tier-1 `sources.url` matches `courtlistener.com/docket/<id>/`. Calls run inside the 3.19 60 s connector deadline via `fetchWithTimeout`; one request per docket per Run.
- New = `date_filed` later than the case's latest `docket_events.occurred_at`, or same day with an unseen `entry_number`; a CourtListener entry whose id already appears in a Draft for that case (any outcome) is skipped. Draft id embeds the entry id, so re-Runs are idempotent.
- Failure is typed: token absent → `source.skipped { reason: "unconfigured" }`; `401/403` → `"http_401"`/`"http_403"`; `429` → `"http_429"`; `5xx` → `"http_5xx"`; network → `"network"`; each with `failed: true` so a zero-draft all-skipped day is `failed`, never `empty`. Unknown throws stay `run.failed { reason: "error" }`. `source.fetched` payload records `docketIds`, `fetchedAt`, and per docket the `latestEntryDate` seen — RECAP data is crowd-sourced and may lag PACER; Evidence must never imply currency beyond that.
- Draft `targetEntityType = "docket_events"`, `targetEntityId = "de-<caseId>-<entryId>"`. `diff` (record part, verbatim, LLM read-only): `caseId`, `occurredAt` (= `date_filed`), `description` (clerk text verbatim), `sourceUrl` (`https://www.courtlistener.com/docket/<id>/?entry=<n>` … the entry's canonical CourtListener URL), `entryNumber`. `tier2Only = false`.
- Inference part, in `diff.inference` (LLM-authored, schema-validated): `kind` ∈ **`filing | appearance | scheduling | motion-filed | brief | procedural-order | hearing | tro-granted | tro-denied | pi-granted | pi-denied | stay-granted | stay-denied | mtd-granted | mtd-denied | sj-granted | sj-denied | judgment | dismissal-with-prejudice | dismissal-without-prejudice | voluntary-dismissal | opinion-affirmed | opinion-reversed | remand | mandate | notice-of-appeal | settlement | other`**; `favors` ∈ `platform | state | none`; `confidence` 0–1; `basis` (≤ 400 chars quoting the entry). Out-of-vocabulary output → the inference is dropped and `guardrails.failed { ruleId: "inference.vocabulary" }` is recorded; the record part still proceeds.
- **Deterministic state patch — code, not LLM — from `(kind, favors)`:**
  | kind group | favors | `lifecycle` | `posture` | `decided_at` |
  |---|---|---|---|---|
  | procedural: `filing`, `appearance`, `scheduling`, `motion-filed`, `brief`, `procedural-order`, `hearing`, `notice-of-appeal`, `stay-granted`, `stay-denied`, `other` | any | — | — | — |
  | interim merits: `tro-granted`, `tro-denied`, `pi-granted`, `pi-denied`, `mtd-granted`, `mtd-denied`, `sj-denied`, `opinion-affirmed`, `opinion-reversed` | `platform` / `state` | — | `platform` / `state` | — |
  | interim merits | `none` | — | — | — |
  | dispositive on the merits: `judgment`, `sj-granted`, `dismissal-with-prejudice`, `settlement` | `platform` / `state` | `resolved` | `platform` / `state` | `= occurredAt` |
  | dispositive on the merits | `none` | `resolved` | — | `= occurredAt` |
  | resolves without merits: `dismissal-without-prejudice`, `voluntary-dismissal`, `remand`, `mandate` | any | `resolved` | — | `= occurredAt` |
  `favors` names the side the ruling helps, not the movant: a denied platform PI favors `state`; the LLM states this explicitly and it is the field reviewers check hardest. Appellate opinions move posture on the appellate row; the row resolves at `mandate`.
  `banned` and `untracked` are never produced by the table (finality is a human judgment). Identity fields (`caption`, `court`, `docketNumber`, `forum`, `circuitId`, `filedAt`) are never patched. The derived patch is written to `diff.statePatch` as `{ field: { from, to } }` with the current row values as `from`.
- Drafter prompt carries the verbatim entry, the case caption/court/current lifecycle+posture, the party roles from `case_entities`, and (3.18) in-force guidance; it returns only the inference JSON. The reviewer receives the same inputs plus the drafter's inference and returns `confidence`, `citationCompleteness`, `notes`, `disagrees`/`disagreement` as today. Drafter/reviewer cannot change `diff` outside `diff.inference`.
- Queue: the card shows the record (verbatim text + Tier-1 link) above the inference (`kind`, `favors`, confidence, basis, reviewer notes/disagreement) and the derived `statePatch` as per-field **Accept / Strip** controls (default: accepted when `confidence ≥ threshold` and no reviewer disagreement; otherwise stripped). Approve publishes the record + accepted fields via the existing decide/edit path; stripping everything is a clean record-only publish. Reject rejects both.
- Gate (`f1Apply`) gains an insert target for `docket_events`: one batch = `INSERT sources` (Tier-1, owned by the case) → `INSERT docket_events` (with `kind`, `favors` when accepted) → `UPDATE cases` for accepted `statePatch` fields → `cases.updated_at` bump. Provenance stamped by the gate as today.
- Migration `0018`: `docket_events` gains nullable `kind` and `favors` columns with the CHECK vocabularies above (seed rows stay null). `evidence_events` is not rebuilt.
- Evidence: `draft.created` (connector) carries the record; `draft.evaluated` carries the full inference, the derived `statePatch`, reviewer verdict, and `guidance` refs; `gate.decided` carries `acceptedFields` / `strippedFields`. ops. `/runs/:id` renders inference and stripped-vs-accepted so readers see the reasoning and the override.
- FR-17: any Draft whose `statePatch` touches `posture` or `lifecycle` is ineligible for YOLO auto-approve; a record-only Draft (no patch, or all stripped by policy) is eligible under the existing rules.
- Remaining `poll_sources` stay `stubCheck` (`"not wired"`). Registry keyed on the exact source name `"CourtListener"`, wired once in `dailyRun.ts` next to `gatewayDepsFromEnv`.

**Never:** PACER / RECAP Fetch (paid); scraping HTML; market data; proposing `banned`/`untracked` or identity-field changes; cascading case posture to `states`/`circuits` (follow-up); an accuracy dashboard surface (follow-up — the Evidence carries the data); retries/backoff; connector state tables; committing the token; `surfaces/*` → `pipeline/*` imports.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Routine entry | "NOTICE of Appearance…" for Furcolo | Draft: record + `inference { kind: appearance, favors: none }`, `statePatch: {}`; queue shows record only; approve → `docket_events` row, `cases` untouched | N/A |
| Interim ruling | "ORDER granting Motion for Preliminary Injunction… enjoined…" | `inference { kind: pi-granted, favors: platform, confidence }`; `statePatch { posture: pending→platform }`; not YOLO-eligible; approve with field accepted → event row + `cases.posture = platform`; strip → event row only | N/A |
| Dispositive | "JUDGMENT entered in favor of Plaintiff. Case closed." | `kind: judgment, favors: platform`; `statePatch { lifecycle: active→resolved, posture: →platform, decidedAt: null→date }` | N/A |
| Dismissal without prejudice | "ORDER dismissing without prejudice" | `statePatch { lifecycle: →resolved, decidedAt }`, posture unchanged | N/A |
| Out-of-vocabulary inference | drafter returns `kind: "weird"` | inference dropped; `guardrails.failed { ruleId: "inference.vocabulary" }`; Draft is record-only, still publishable | Fail closed on inference only |
| Reviewer disagrees | reviewer `disagrees: true` | fields default to Stripped; disagreement text on the card and on Evidence | N/A |
| Already seen | entry id has a prior Draft (approved or rejected) | no new Draft; `source.fetched` counts it as seen | N/A |
| Token missing | no `COURTLISTENER_API_TOKEN` | `source.skipped { reason: "unconfigured" }`, `failed: true`; Run continues; other sources unaffected | Fail closed |
| 401 / 429 / 5xx / network | API response | `source.skipped { reason: "http_401" \| "http_429" \| "http_5xx" \| "network" }`, `failed: true` | Fail closed |
| Slow API | response after 60 s | 3.19 `source.skipped { reason: "timeout" }` | N/A |
| Gate insert | approve record-only Draft | `sources` row (Tier-1, owned by case) then `docket_events` row in one batch; trigger satisfied; `cases.updated_at` bumped | `UnpublishableError` if case missing |
| Zero F1 leak | any Draft before approve | `docket_events`/`cases`/`sources` unchanged | Fail closed |
| Other sources | CFTC / SCOTUS / news | still `source.skipped { reason: "not wired" }` | N/A |

</intent-contract>

## Code Map

- `src/pipeline/connectors/connector.ts:11-25,47-169` -- `EntityChange { type, id, diff, body, confidence? }`, `SourceCheck`, `runConnector`; 3.19 `withDeadline` wraps `check`; `DeadlineError` → `source.skipped { reason: "timeout" }`; other throws → `run.failed { reason: "error" }` (pinned `connector.test.ts:157`); `[]` → `"not wired"` iff `check === stubCheck`. ADD a typed `SourceUnavailableError { reason }` handled beside `DeadlineError` → `source.skipped { reason }`, `failed: true`. Let `SourceItem` carry an optional `fetched` summary the connector writes into `source.fetched` (`docketIds`, `fetchedAt`, per-docket `latestEntryDate`).
- `src/pipeline/connectors/sources.ts:5-26` -- `POLL_SOURCES`; key the registry on the exact name `"CourtListener"` (3.17 makes names operator-editable; unknown → stub).
- `src/pipeline/connectors/courtListener.ts` -- NEW -- `createCourtListenerCheck({ token, fetchImpl?, db })`: resolve dockets from `sources` (`url GLOB 'https://www.courtlistener.com/docket/*'`, `owning_table='cases'`, `tier='tier1'`); per docket `GET …/docket-entries/?docket=<id>&order_by=-date_filed&limit=20&fields=id,entry_number,date_filed,description` with `Authorization: Token …` via `fetchWithTimeout` (`src/shared/lib/timeouts.ts:110-144`, shorter than 60 s); newness against `docket_events.occurred_at` (`casesRepo.ts:219` reads them) and prior Drafts for that case (`draftsRepo.listByRun`-style query on `target_entity_id LIKE 'de-<caseId>-%'`); build `EntityChange { type: "docket_events", id: "de-<caseId>-<entryId>", diff: { caseId, occurredAt, description, sourceUrl, entryNumber, context: { caption, court, lifecycle, posture, parties } }, body }`. `context` is connector-authored, LLM read-only, and lives inside `diff` so it is already authorized context (`actionPolicy.ts:17-33`; no policy change, `actionPolicy.test.ts:253,282,434` untouched).
- `src/pipeline/workflow/dailyRun.ts:76-83,219-221` -- `gatewayDepsFromEnv` pattern; ADD `sourceChecksFromEnv(env, db)` and pass to `packageDailyRun`. `server.ts` untouched for the trigger. `src/access-env.d.ts:28-40` -- ADD `COURTLISTENER_API_TOKEN?: string`.
- `src/shared/schemas/docketInference.ts` -- NEW -- `DOCKET_EVENT_KIND_VALUES` (29), `FAVORS_VALUES`, `InferenceSchema { kind, favors, confidence 0–1, basis ≤400 }`, `deriveStatePatch(kind, favors, current: { lifecycle, posture, decidedAt }, occurredAt)` implementing the frozen transition table (pure, unit-tested per row), `StatePatchSchema` (only `lifecycle`/`posture`/`decidedAt`).
- `src/pipeline/agents/draftAndReview.ts:51-56,92-100,181-238,372-428,493-497,248-286` -- `DrafterOutputSchema` `.passthrough()`; L493-497 overwrites `body`+`diff` wholesale — BRANCH on `draft.targetEntityType === "docket_events"`: drafter prompt sub-branch returns inference JSON only; parse with `InferenceSchema`; `diff = { ...draft.diff, inference, statePatch }`; never replace record keys. Out-of-vocab → drop inference, append `guardrails.failed { draftId, ruleId: "inference.vocabulary" }` (note L452-459 treats any `guardrails.failed` draftId as skip-on-retry — write it via the same batch as `draft.evaluated`, not before). Reviewer sub-branch sees record + inference; `scoreReviewer` unchanged. `persist` payload adds `inference`, `statePatch`, `reviewer { confidence, disagrees, disagreement }`. `EvalSummary` is `.strict()` (`run.ts:133-146`) — inference stays in `diff`.
- `src/pipeline/gate/yoloPolicy.ts:22-45,53-81` -- `isPostureFlip` reads top-level `diff.posture`; EXTEND to `diff.statePatch?.posture`; ADD `lifecycle_change` to `INELIGIBLE_REASON_VALUES` (`run.ts:107-115`) and `BAKED_BLOCKERS`; `reasonsFor` serves both `autoApproveRun` and `ineligibleFor`. `yoloPolicy.test.ts:103,232` pin `posture_flip`.
- `src/pipeline/gate/f1Apply.ts:27,37-91,97-118,134-182` -- `DiffSchema` strict `{field:{from,to}}` rejects nested keys → special-case `docket_events` at L141 BEFORE the parse: `applyDocketEventStmts(db, draft, acceptedFields)` returning `D1PreparedStatement[]`: `SELECT` case row (→ `UnpublishableError` if missing) → `INSERT sources` (id `src-de-<caseId>-<entryId>`, `owning_table='cases'`, `tier='tier1'`, `url=sourceUrl`, `title`, `published_at=occurredAt`) → `INSERT docket_events` (`kind`/`favors` only when the inference exists and any field was accepted; else null) → `UPDATE cases` for accepted `statePatch` fields (`TARGETS.cases.fields` names) + `updated_at`. Keep the `EXISTS (SELECT 1 FROM drafts WHERE id=? AND outcome IS NULL)` guard (L179) on every statement.
- `src/pipeline/gate/approval.ts:35-86,167-184,212-227,255` -- `DecideInputSchema` `edit` carries `editedBody` only; ADD optional `acceptedFields: string[]` to `approve` and `edit` arms (default = all `statePatch` keys); `applyF1Stmt` becomes an array, `draftStmtIndex = stmts.length` (the L255 retry guard depends on it); `gate.decided` payload adds `acceptedFields`, `strippedFields`. `src/server.ts:63-75,233-255` -- `DecisionBodySchema` arms gain `acceptedFields`.
- `migrations/0018_docket_event_inference.sql` -- NEW -- `ALTER TABLE docket_events ADD COLUMN kind TEXT CHECK (kind IS NULL OR kind IN (…29…))`; same for `favors` (`platform|state|none`). No rebuild (keeps triggers `0001:279-318` and index L277 intact); seed rows stay null. `publicApi.test.ts:539-553,641-650` read `docket_events` by explicit columns — unaffected. `casesRepo.ts:267-268` explicit SELECT — extend to read `kind`/`favors` for the public case detail.
- `src/shared/db/repos/casesRepo.ts:246-407` -- `getCaseById` already joins `case_entities` (`entity.role` DCM/FCM = platform side; `ce.role` plaintiff/defendant…) and returns caption/court/lifecycle/posture — reuse for the connector's `context`.
- `src/surfaces/admin/ApprovalQueue.tsx:76-106,138-193,235-237,304-377,389-421` -- `QueueDiff` renders every top-level `diff` key via `asChange` (nested keys would render as "—"); BRANCH on `targetEntityType === "docket_events"` to a `DocketEventCard` (record: verbatim text + Tier-1 link; inference: kind/favors/confidence/basis + reviewer notes/disagreement; `statePatch` rows with Accept/Strip `<button>`s). `accepted` state reset with `setEditing(false)` in J/K handlers; `approveAction` spreads `acceptedFields` into approve and edit bodies. Defaults: accepted iff `confidence ≥ threshold/100` and `!reviewer.disagrees`. Buttons are not input/textarea so the keyboard guard (L392) is unaffected.
- `src/surfaces/ops/EvidenceDetail.tsx:259-291,392-400,574-604,631-677` -- `stepLabel` adds `kind`, `favors`, `acceptedFields`/`strippedFields` summaries; the draft block renders inference + statePatch for `docket_events` Drafts. `src/surfaces/apex/cases/CaseDetail.tsx` -- developments list shows `kind`/`favors` chips when present.
- Tests: `connector.test.ts` (unconfigured/401/429/5xx/network/timeout → typed skips; new-entry detection; already-seen skip; `source.fetched` summary), `courtListener.test.ts` (fixture JSON, `vi.stubGlobal("fetch")` per `src/server.test.ts:203,298`), `docketInference.test.ts` (every transition-table row; `banned`/`untracked` never produced; identity fields never patched), `draftAndReview.test.ts` (inference-only parse, record keys untouched, out-of-vocab → `guardrails.failed`, `draft.evaluated` payload), `yoloPolicy.test.ts` (statePatch posture/lifecycle blockers), `approval.test.ts` + `f1Apply.test.ts` (insert batch order, trigger satisfied, accepted vs stripped fields, retry guard), `adminApi.test.ts` (decision body `acceptedFields`), `approvalQueue.mount.test.tsx` (card, Accept/Strip, keyboard parity), `evidenceDetail.test.tsx`, `publicApi.test.ts` (case detail shows kind/favors), `gatewaySeed`/`dailyRun` (registry wiring; other sources still "not wired").
- `docs/deploy-runbook.md` secrets table -- ADD `COURTLISTENER_API_TOKEN` (set on `pml-build` 2026-09-18; `pml` at cutover). `_bmad-output/implementation-artifacts/sprint-status.yaml:93` -- backlog → in-progress → done.

## Tasks & Acceptance

**Execution:**
- [x] `migrations/0018_docket_event_inference.sql` -- `kind`/`favors` columns via ADD COLUMN with CHECKs
- [x] `src/shared/schemas/docketInference.ts` -- vocabularies, `InferenceSchema`, `StatePatchSchema`, `deriveStatePatch` + row-by-row tests
- [x] `src/pipeline/connectors/courtListener.ts` + `connector.ts` + `sources.ts` -- live check, typed skips, newness, `source.fetched` summary, registry (`sources.ts` needed no change — the registry is keyed on its existing `"CourtListener"` name from `dailyRun.ts`)
- [x] `src/pipeline/workflow/dailyRun.ts` + `src/access-env.d.ts` -- `sourceChecksFromEnv`, token typing
- [x] `src/pipeline/agents/draftAndReview.ts` -- docket_events branch: inference-only drafter, reviewer inputs, vocabulary guardrail, Evidence payload
- [x] `src/pipeline/gate/yoloPolicy.ts` + `src/shared/schemas/run.ts` -- statePatch blockers (`posture_flip`, `lifecycle_change`)
- [x] `src/pipeline/gate/f1Apply.ts` + `approval.ts` + `src/server.ts` -- insert target batch, `acceptedFields`, `gate.decided` fields
- [x] `src/surfaces/admin/ApprovalQueue.tsx` -- `DocketEventCard`, Accept/Strip, decision body
- [x] `src/surfaces/ops/EvidenceDetail.tsx` + `src/surfaces/apex/cases/CaseDetail.tsx` + `casesRepo.ts` -- public inference/override rendering, kind/favors on developments (+ `PendingDrafts.tsx` branch so the public pending page shows classification + derived patch instead of dashes)
- [x] tests + `docs/deploy-runbook.md` -- I/O matrix (`sprint-status.yaml` stays `in-progress` until review)

**Acceptance Criteria:**
- Given the token is set and a docket has an entry newer than the case's latest development, when a Run polls CourtListener, then ops. shows `source.fetched` with docket ids and per-docket latest dates, and one `draft.created` per new entry with the clerk's text verbatim and the CourtListener URL
- Given that Draft, when drafter and reviewer run, then `draft.evaluated` carries `inference { kind, favors, confidence, basis }`, the derived `statePatch`, and the reviewer verdict; an out-of-vocabulary answer yields a record-only Draft plus `guardrails.failed { ruleId: "inference.vocabulary" }`
- Given the queue card, when I strip `posture` and approve, then `docket_events` gains the row (with `kind`/`favors`) and its Tier-1 `sources` row, `cases.posture` is unchanged, and `gate.decided` lists `strippedFields: ["posture"]`; when I accept it, `cases.posture` changes and the apex case page shows both the development and the new chip
- Given a Draft whose `statePatch` touches `posture` or `lifecycle`, when Autonomous mode is on, then it is never auto-approved; a record-only Draft follows the existing YOLO rules
- Given the token is absent, invalid, rate-limited, or the API is down, when the Run polls, then the Run completes with `source.skipped { reason }` naming the cause and the other sources still stubbed as `"not wired"`
- Given the seed data and no live token in tests, when the full suite runs, then every transition-table row, every typed skip, the insert batch order, and the Accept/Strip round-trip are covered

## Implementation Notes

Implemented 2026-09-18 on `story/3-21-first-live-connector`. `npm run check` exit 0; `npm test` 48 files / 969 tests, exit 0 (baseline before this story: 46 / 886).

- **Vocabulary is 28 kinds, not 29.** The spec's `kind` list enumerates 28 values (11 procedural + 9 interim + 4 dispositive + 4 resolves-without-merits, each kind in exactly one group); the "(29)" in the Code Map is a miscount. `docketInference.test.ts` pins 28 and the one-group invariant.
- **`acceptedFields` covers `kind` / `favors` as well as `statePatch` keys.** The intent ("the operator accepts or strips the inference per field") and AC3 ("strip `posture` … `docket_events` gains the row *with* `kind`/`favors`") only reconcile if the classification is itself strippable. So the acceptable set is `["kind","favors", ...statePatch keys]`; `kind`/`favors` land on the row only when accepted; default all-accepted iff drafter confidence ≥ threshold/100 and no reviewer disagreement, else all-stripped.
- **`gate.decided` gains `acceptedFields` / `strippedFields` only for `docket_events` decisions.** Four 3.10 tests pin the update-target payload with `toEqual`; the override is public where one exists and the pinned shapes are untouched.
- **Out-of-vocabulary also stamps `guardrail_fail`** on the Draft's `ineligible` (beside the `guardrails.failed { ruleId: "inference.vocabulary" }` event, same batch as `draft.evaluated`). "Hard fails block auto-approve" is an epic-level FR; the record-only Draft is still human-publishable. The legacy `{body, diff}` drafter shape on a docket Draft is treated the same way — record keys are never replaced.
- **`from` values come from the live `cases` row** at review time (not the packaging snapshot), so a re-run or revision derives against what the row says now; the packaging `context` still carries the snapshot for the prompt.
- **Newness** = `date_filed ≥ latest published occurred_at` (or no developments yet) AND no `docket_events` row / prior Draft (any outcome) whose id embeds the entry id. Undated or text-less RECAP rows are skipped and counted as `skippedIncomplete` in the `source.fetched` docket summary. `limit=20` per docket per Run as specified; the four seed dockets carry no `docket_events` yet, so the first live Run can produce up to 80 Drafts (each an LLM drafter+reviewer pair). The idempotent Draft id means a re-Run never duplicates them.
- **Per-request deadline** `SOURCE_FETCH_TIMEOUT_MS = 12 s` added to `timeouts.ts` (the one home for deadlines) so four serial docket requests fit inside the 60 s connector deadline; a per-request `TimeoutError` maps to `source.skipped { reason: "timeout" }`, matching the I/O matrix. Any single docket failure fails the whole source (one `source.skipped`), never the Run.
- **Record-only publish bumps `cases.updated_at`** (a new development is a change to the case row; the list orders by it); `provenance_kind` / `published_at` on the case are stamped only when an accepted `statePatch` field actually changes it.
- **`sourceUrl`** is the case's stored docket URL (which keeps CourtListener's slug) plus `?entry=<n>`; unnumbered entries link the docket page.
- **`DocketEventSchema`** gains `kind` / `favors` as optional-nullable on the wire (the repo always emits them); `DevelopmentSchema` (apex feed) is unchanged.
- **CourtListener envelope** confirmed from the v4 PACER-data docs (`{ next, previous, results }`, `Authorization: Token …`); no Context7 entry was needed — no library API changed here.
- Deferred as spec'd: cascading posture to `states`/`circuits`; an accuracy dashboard; retries/backoff.

## Spec Change Log

- 2026-09-18 — Code Map "(29)" kinds corrected to 28 in implementation (see Implementation Notes); `acceptedFields` includes `kind`/`favors`; `PendingDrafts.tsx` added to the surface list.
- 2026-09-18 (review fixes) — **Newness baseline rule:** when a case has no `docket_events` yet (`MAX(occurred_at)` is null), the baseline floor is the CourtListener docket page's `sources.published_at` for that case — the date tracking began — so only entries with `date_filed >= published_at` are new and the first live Run never backfills history the tracker never claimed to follow. Each docket's `source.fetched` summary records `baseline: { kind: "docket_events" | "source_published_at", date }` (or `null` when neither exists). Also: dockets poll concurrently; a per-docket 404 / other 4xx / malformed body is isolated as `dockets[].error` while auth/rate-limit/5xx/network/timeout still skip the source; pages follow `next` while the oldest entry is on/after the baseline, capped at 5 (`truncated: true`); zero configured dockets → `source.skipped { reason: "no_dockets" }`; `favors` couples with `kind` and `decidedAt` with `lifecycle` (queue toggles as units, gate refuses a half); the gate refuses a `statePatch` whose `from` no longer matches the live row and refuses `acceptedFields` on update targets; `decidedAt` changes join `lifecycle_change`; `deriveStatePatch` never moves a `banned` posture; YOLO passes the queue's default `acceptedFields`.

## Review Triage Log

### 2026-09-18 — Review pass
- verdicts: 33 findings — high 0, medium 12, low 16, false 4, maybe-false 0 (VG: 4 patch, 1 defer)
- findings:
  - `[medium]` `[patch]` YOLO auto-approve passes no `acceptedFields`, so every inference field publishes under agent provenance even when confidence < threshold or the reviewer disagrees; `decidedAt`-only patches are also YOLO-eligible (BH, EC×2, VG) — apply the queue's default policy in `autoApproveRun` and add `decidedAt` to the lifecycle blocker; add the YOLO docket test (VG)
  - `[medium]` `[patch]` `statePatch.from` never checked at the gate; a second same-case Draft overwrites live state blindly (BH, EC) — compare `from` to the live row in the existing case SELECT and raise `UnpublishableError("stale state patch")`
  - `[medium]` `[patch]` One 404/malformed docket fails the whole source; serial 12 s fetches exceed the 60 s deadline at ≥5 dockets (BH×2, EC) — poll dockets concurrently, isolate per-docket 4xx/malformed into the summary, escalate only auth/429/5xx/network
  - `[medium]` `[patch]` Only the first page (20) is read; older new entries are lost forever once a newer one publishes (BH, EC×2) — follow `next` while the page's oldest entry is still newer than the baseline, cap at 5 pages, record `truncated`
  - `[medium]` `[patch]` First live Run backfills up to 80 historical entries (no baseline when a case has no `docket_events`) — baseline floor = the CourtListener `sources.published_at` (when tracking began) when no development exists; recorded in the Spec Change Log as the empty-baseline rule the intent left undefined
  - `[low]` `[patch]` Zero configured dockets reads as "no material change" — `SourceUnavailableError("no_dockets")`
  - `[low]` `[patch]` Real timeout and `malformed` paths untested; `hang` fixture unused — add both through `runConnector`
  - `[low]` `[patch]` 0018 CHECK vocabulary can drift from `DOCKET_EVENT_KIND_VALUES` — test inserts every value
  - `[medium]` `[patch]` Per-field stripping can publish incoherent state (`favors` without `kind`; `lifecycle` without `decidedAt`) (BH, EC) — couple the pairs in `acceptableFields`, the gate, and the card toggles
  - `[low]` `[patch]` `E` on a docket card edits nothing published — card hint: edited text is a public note, the record stays verbatim
  - `[low]` `[patch]` Unrelated `wrangler` bump in `package.json`/lockfile — revert
  - `[low]` `[patch]` Evidence payload spreads let connector keys clobber `source`/`tier`/`reason`/`itemCount`; RECAP note never rendered on ops. (BH, EC) — spread first, render `note`
  - `[false]` `[reject]` Runbook still says 0017 / matrix "60 s" / Code Map names `f1Apply.test.ts` / test count 969 — runbook records deployed state (3.19 precedent); the rest are spec edits
  - `[low]` `[patch]` `LIKE` pattern from `caseId` unescaped — add `ESCAPE`
  - `[low]` `[patch]` Case-owned URL matching the GLOB but not the docket regex is silently unpolled — record `unmatched` in the summary
  - `[low]` `[reject]` Unparseable drafter JSON logged under the vocabulary ruleId — both are "inference failed"; a second ruleId is extra vocabulary
  - `[medium]` `[patch]` Derived patch can move a hand-set `banned` posture — never propose a posture change when current is `banned` (finality is human-only; `untracked` may move)
  - `[low]` `[patch]` `acceptedFields` on an update-target Draft is silently ignored — `UnpublishableError`
  - `[medium]` `[patch]` Queue Accept/Strip state keyed by position; after a decision the next Draft inherits the previous overrides — key by draft id
  - `[medium]` `[patch]` VG: `acceptedFields: []` (the default-stripped approve) never exercised at decide, wire, or keypress level — add all three
  - `[medium]` `[patch]` VG: server `edit` arm forwarding of `acceptedFields` untested on the wire — add
  - `[low]` `[patch]` VG: `AdminShell` `threshold` prop observationally dead in tests — mount with threshold 85 / confidence 0.75 → Stripped
  - `[low]` `[defer]` VG: `DailyRunWorkflow.run` → `packageDailyRun(…, sourceChecksFromEnv)` has no executing test — no Workflow-entrypoint harness; the manual `Run now` check is the stated verification

## Design Notes

The LLM classifies; code decides. `deriveStatePatch` is a pure function of `(kind, favors, current row, occurredAt)`, so the transition table is reviewed once and tested row by row, and "accuracy" has a definition: did the operator accept the classification. `context` rides inside `diff` so the 3.6 authorized-context policy needs no new key. The gate insert runs `sources` → `docket_events` → `cases` in one D1 batch so the Tier-1 trigger is satisfied and a retry re-applies nothing (the `outcome IS NULL` guard). `banned` never appears in the table: finality (mandate + cert window) is the operator's call, made by hand.

## Verification

**Commands:**
- `npm test` -- expected: pass (connector fixtures via stubbed `fetch`; unconfigured/401/429 → `source.skipped`; new entries → Drafts; gate applies the chosen target)
- `npm run check` -- expected: exit 0

**Manual checks (if no CLI):**
- Set `COURTLISTENER_API_TOKEN` on `pml-build`; `/admin#loop` Run now → ops. `/runs/:id` shows `source.fetched` for CourtListener and `draft.created` rows; approve one → live F1 on `build.*` shows the development with provenance

## Auto Run Result

Status: draft (rewritten 2026-09-18 after Patrick chose the hybrid record + inference model)
Prior blocking condition: intent gap — (1) whether a docket entry becomes a `docket_events` insert (gate widening) or a `cases` field update (LLM inference); (2) acknowledgment that a CourtListener API token (Patrick's account) is required for the live proof. Investigation preserved in Code Map; branch `story/3-21-first-live-connector` created from main `95812b1`, no code changed.
