---
title: 'Story 3.4: Source Monitoring & Draft Packaging'
type: 'feature'
created: '2026-09-08'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 7e7e03359d33d4359628439b0ed0b565819048a0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The daily workflow (3.3) runs but never looks at the world — its `run-daily-step` goes straight to `finishEmpty`. There is no connector that consults sources, no packaging that turns material changes into Drafts, and no way to distinguish "nothing changed" from "nobody looked."

**Approach:** Add a `pipeline/connectors/` module (Tier-1/Tier-2, stubs acceptable if they record skip reasons) and a packaging step: connectors emit source items labeled by tier with reasons, material changes become Drafts naming affected F1 entities with proposed diffs, and the Run package carries Drafts (0..N) + Evidence + mode. Drafts never touch live F1. Partial connector failure is explicit on the Run, never masked.

## Boundaries & Constraints

**Always:**
- Every ingested/skipped item is labeled Tier-1 or Tier-2 with a reason (FR9); tier strings are the existing `SOURCE_TIER_VALUES` = `tier1 | tier2` (matches the `sources` table CHECK)
- Material changes produce Drafts naming the affected F1 entity (`target_entity_type` + `target_entity_id`) with a proposed `diff_json`, `body`, `tier2_only`, and confidence/`evalSummary` (FR10)
- Drafts never write live F1 tables (structurally impossible — they live only in `drafts`)
- The Run package = Drafts (0..N) + Evidence + mode inputs (FR11); the gate (3.10) consumes it later
- Partial connector failure is recorded explicitly on the Run (a `run.failed` evidence event naming the failed connector); it is never marked `empty`/clean when a connector errored
- Evidence writes use `evidenceRepo.appendEvent`; draft writes use a new `draftsRepo.insertDraft` (validate-before-INSERT, mirroring the 3.2/3.3 pattern); no migration — the closed event set already has `source.fetched` / `source.skipped` / `draft.created`
- `pipeline/*` is server-only: never imported by `surfaces/*`, never imports React

**Never:**
- No live HTTP fetches in this story's default path (the connectors ship as recording stubs that log skip reasons — see Open Question 1 for the real-fetch decision)
- No mutation of `0001`–`0007` (none needed)
- No gateway/model call — source monitoring is model-free; drafting is 3.5
- No new "sources to poll" table yet — the poll list is a hardcoded seed constant in `pipeline/connectors/` (a registry table is premature; revisit when the list outgrows a constant)
- Connectors ship as recording stubs (decided): each connector records `source.skipped` with a "not wired" reason; no live HTTP fetch this story. The plumbing is the deliverable; real fetches ride in behind the litigation research later.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Connector runs, no material change | stub connector(s) return zero material items | `source.skipped` evidence per connector; Run completes `empty` (`run.empty` with `drafts: 0`) | N/A |
| Material change found | connector returns a source item with affected entities + diff | `source.fetched` evidence; one Draft per affected entity (`draft.created`); Run completes `awaiting` (not `empty`) | N/A |
| Tier-2-only item | item tier = tier2 | Draft recorded with `tier2_only: 1` | N/A |
| One connector errors, others succeed | connector A throws; B/C succeed | `run.failed` evidence naming A; Run marked `failed` (never `empty`/clean) | connector error caught per-connector |
| All connectors skip cleanly | every connector returns zero items, zero errors | Run completes `empty`, evidence states zero drafts | N/A |

</frozen-after-approval>

## Code Map

- `src/shared/db/repos/draftsRepo.ts` -- read-only (`listByRun`); 3.4 adds `insertDraft` (15 columns, mirror `runsRepo.insertRun` validate-before-INSERT at runsRepo.ts:48-68)
- `src/shared/db/repos/evidenceRepo.ts` -- `appendEvent` (evidenceRepo.ts:57-96) reuse for `source.fetched`/`source.skipped`/`draft.created`
- `src/shared/schemas/vocabulary.ts` -- `SOURCE_TIER_VALUES = ["tier1","tier2"]` already exists; `EVIDENCE_EVENT_VALUES` already has the three events needed
- `src/shared/db/repos/sourcesRepo.ts` -- `listSourcesForOwner` read-only; the `sources` table is claim-attribution, NOT a poll registry — 3.4 does not reuse it for the poll list
- `src/pipeline/workflow/dailyRun.ts:28-32` -- `step.do("run-daily-step")` currently finds run + `finishEmpty`; 3.4 inserts `monitorSources` + `packageDrafts` before it, and flips empty→awaiting when drafts exist
- `src/pipeline/workflow/dailyRunSteps.ts` -- `ensureRun`/`finishEmpty` contract; add a `monitorAndPackage` step function here (or a sibling module) that returns `{ drafts, failedConnectors }`
- `src/pipeline/ai/gateway.ts` -- the server-only module precedent (imports `shared/*` only, never surfaces); `pipeline/connectors/` follows the same rule

## Tasks & Acceptance

**Execution:**
- [ ] `src/pipeline/connectors/sources.ts` -- NEW -- hardcoded `POLL_SOURCES` constant: Tier-1/Tier-2 source descriptors (name, url, tier) seeded from the known court/agency sources -- the poll list
- [ ] `src/pipeline/connectors/connector.ts` -- NEW -- `runConnector(source, db, runId): Promise<{ draftCount, failed }>`; a stub connector records `source.skipped` with a `not wired` reason (or `source.fetched` per Q1); per-connector try/catch records `run.failed` naming the connector and returns `failed: true` without throwing
- [ ] `src/shared/db/repos/draftsRepo.ts` -- ADD `insertDraft(db, input)` -- validate-before-INSERT; outcome/decided_at/decided_by/edited_body NULL; returns the parsed DraftRecord
- [ ] `src/pipeline/connectors/packageDrafts.ts` -- NEW -- turn source items into Drafts: one Draft per affected F1 entity with `{ entity_type, entity_id, diff, body, tier2_only, confidence }`; writes `draft.created` evidence; returns the created ids
- [ ] `src/pipeline/workflow/dailyRunSteps.ts` -- ADD `monitorAndPackage(db, runId)` -- runs all connectors, collects drafts + failures, emits `run.failed` evidence when any connector failed, returns `{ draftCount, anyFailure }`
- [ ] `src/pipeline/workflow/dailyRun.ts` -- replace the `run-daily-step` body: call `monitorAndPackage`; complete the Run `awaiting` when drafts exist else `empty`; `failed` when anyFailure -- the source-monitoring seam
- [ ] `src/pipeline/connectors/connector.test.ts` -- NEW -- Vitest over D1 fixtures: stub skip path, material-change→Draft path, tier2_only flag, partial-failure (one connector throws, others succeed), all-skip→empty -- the I/O matrix

**Acceptance Criteria:**
- Given a stub connector returning no material items, when the daily step runs, then `source.skipped` evidence is written and the Run completes `empty`
- Given a connector returning a material change, when packaged, then one Draft per affected entity is created with `draft.created` evidence and the Run completes `awaiting`
- Given one connector erroring while others succeed, when the step runs, then `run.failed` evidence names the failed connector and the Run is marked `failed` (never clean)
- Given a Tier-2-only change, when packaged, then the Draft carries `tier2_only: true`

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

- `diff_json` shape (3.4 owns it, nothing pins it): an object `{ <field>: { from, to } }` per entity, e.g. `{"operationalStatus":{"from":"go","to":"restricted"}}` — matching the one illustrative fixture in publicApi.test.ts:912, generalized.
- Connector errors are caught and recorded, never thrown — the workflow must always produce a Run outcome (the "silence is never mistaken for didn't-look" rule).
- The poll list is a hardcoded constant, not a table: it is small and stable, and a registry table is premature until the source count grows or ops needs to edit it live.

## Verification

**Commands:**
- `npm test` -- expected: all suites pass incl. `pipeline/connectors/connector.test.ts`
- `npm run check` -- expected: exit 0 (oxfmt + oxlint + tsc)
