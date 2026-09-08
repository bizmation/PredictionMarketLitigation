---
title: 'Story 3.1: Run, Draft & Evidence Data Model'
type: 'feature'
created: '2026-09-08'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 601999bdcacdacdefc538bec7de1a0d787a0d7f2
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The governed daily loop has no durable record: Runs, Drafts, and Evidence exist nowhere, so `ops.` transparency, the Approval Gate, and every later pipeline story (3.2–3.13) have no source of truth.

**Approach:** Add `runs`, `drafts`, and `evidence_events` to D1 (migration `0006_run_draft_evidence.sql`), their Zod contracts in `src/shared/schemas/run.ts` (+ vocabulary value-sets matching the SQL CHECKs verbatim), thin repos, and read-only public endpoints (`GET /api/runs`, `GET /api/runs/:id`) returning the list envelope. No pipeline, no agents, no writes from the API — storage and contracts only.

## Boundaries & Constraints

**Always:**
- Enum strings are the Epic 1 chip vocabulary verbatim: `RunStatus` = `published | awaiting | empty | failed | stopped | rejected` (plus `running` as the initial non-terminal state, recorded decision), `RunOrigin` = `scheduled | catch-up | manual` — Zod value-sets and SQL CHECKs must match exactly (house rule: Zod is never in the SQL write path)
- Money is integer cents + ISO currency code; never float dollars (architecture #Spend)
- DB snake_case / JSON camelCase boundary; repos map via `Schema.parse`
- Timestamps use the 24-char ISO-UTC GLOB+strftime round-trip constraint from `0001_f1_core.sql:53-62`
- Run ids are human-readable: `run-YYYYMMDD-xxxx` (UTC date + 4 hex from `crypto.randomUUID()` for same-day uniqueness) — decided; matches the F1 seed's readable-id house style and displays meaningfully in the public log
- New tables mirror `0001` conventions: snake_case plural tables, `id TEXT PRIMARY KEY NOT NULL`, inline enum CHECKs, `idx_<table>_<cols>` indexes, no `BEGIN`/`PRAGMA` (wrangler splits + `db.batch()` is the transaction)
- No credential/secret column anywhere; nothing secret is publicly projected

**Never:**
- No pipeline code, workflow orchestration, or agent wiring (`src/pipeline/` starts in 3.2/3.3)
- No POST/mutation API on runs/drafts/evidence — the Approval Gate (3.10/3.11) owns writes
- No drafts/evidence admin or ops UI, no `RunStatusChip` changes beyond what exists
- No migration edits to `0001`–`0005`
- No Draft writes touching live F1 tables (structurally impossible here: drafts are their own tables)

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| No runs yet | `GET /api/runs` on empty DB | 200 `{items: []}`, no `nextCursor`, `cache-control: public, max-age=60` | N/A |
| Runs exist | `GET /api/runs` after fixture inserts | 200 `{items: [...]}` newest-first by `startedAt`, camelCase, no snake_case keys anywhere in serialized body | N/A |
| Known run | `GET /api/runs/:id` | 200 run detail: run fields + `drafts` + `evidence` arrays (may be empty) | N/A |
| Unknown run | `GET /api/runs/run-nope` | Envelope 404 `{code: "not_found"}` | jsonError |
| Wrong method | `POST /api/runs` | Envelope 405, `allow: GET, HEAD` | jsonError |

</frozen-after-approval>

## Code Map

- `migrations/0001_f1_core.sql` -- conventions to mirror (enums L47, timestamps L53-62, JSON checks L420-424, reserved-names comment L33-34)
- `migrations/0005_poll_votes.sql` -- newest migration example (current file count → new file is `0006`)
- `src/shared/schemas/vocabulary.ts` -- add `RUN_ORIGIN_VALUES`, `RUN_STATUS_VALUES`, `RUN_MODE_VALUES`, `EVIDENCE_EVENT_VALUES` next to `POLL_CERT_VALUES` (L196)
- `src/shared/schemas/run.ts` -- NEW: `RunSummarySchema`, `RunDetailSchema`, `DraftRecordSchema`, `EvidenceEventSchema` (strict, camelCase; mirror `poll.ts` structure)
- `src/shared/db/repos/runsRepo.ts` -- NEW: `insertRun` (test fixture + future pipeline use), `listRuns`, `getRunById`
- `src/shared/db/repos/draftsRepo.ts`, `src/shared/db/repos/evidenceRepo.ts` -- NEW: `listByRun`
- `src/shared/api/publicRouter.ts` -- add `/api/runs` + `/api/runs/:id` routes in the GET/HEAD section (regex detail route pattern at L220-226)
- `src/shared/api/publicApi.test.ts` -- add `describe("run records (story 3.1)")` after the poll describe; fixtures inserted via repos, first test asserts the empty state (in-file order matters)
- `src/shared/ui/RunStatusChip.tsx` -- READ ONLY: the status/origin vocabulary this story must match verbatim
- `src/test/apply-migrations.ts` -- picks up `0006` automatically via `TEST_MIGRATIONS`; no change needed

## Tasks & Acceptance

**Execution:**
- [x] `migrations/0006_run_draft_evidence.sql` -- create `runs` (id TEXT PK; origin/mode/status enum CHECKs; started_at/completed_at 24-char ISO-UTC; spend_cents INT NOT NULL DEFAULT 0 CHECK >= 0; spend_currency TEXT NOT NULL DEFAULT 'USD'; budget_cents INT nullable CHECK >= 0; scheduled_for 10-char date nullable), `drafts` (id TEXT PK; run_id REFERENCES runs(id); target_entity_type/target_entity_id TEXT nullable; diff_json TEXT NOT NULL CHECK json_valid; body TEXT NOT NULL; tier2_only INTEGER CHECK IN (0,1) DEFAULT 0; confidence INTEGER nullable CHECK BETWEEN 0 AND 100; eval_summary_json TEXT nullable CHECK json_valid; outcome TEXT CHECK IN ('approved','edited','rejected') nullable; decided_at ISO-UTC nullable; decided_by TEXT nullable; edited_body TEXT nullable; created_at/updated_at), `evidence_events` (id TEXT PK; run_id REFERENCES runs(id); seq INTEGER NOT NULL; event CHECK IN dot.case set; payload_json TEXT nullable CHECK json_valid; created_at) -- plus `idx_runs_status`, `idx_drafts_run`, `idx_evidence_run_seq` -- RATIONALE: durable source of truth for the whole epic
- [x] `src/shared/schemas/vocabulary.ts` -- add the four value-sets (strings match CHECKs exactly) -- single source shared by Zod + tests
- [x] `src/shared/schemas/run.ts` -- strict DTOs incl. nullable fields mapped to null on the wire -- canonical API contracts
- [x] `src/shared/db/repos/runsRepo.ts` + `draftsRepo.ts` + `evidenceRepo.ts` -- insertRun (fixture use), listRuns (ORDER BY started_at DESC), getRunById, listByRun -- prepared `?` binds only; snake→camel via Schema.parse
- [x] `src/shared/api/publicRouter.ts` -- `GET /api/runs` → `jsonList`; `GET /api/runs/:id` → `jsonOk` detail (run + drafts + evidence); unknown id → `notFound()` -- the story's public read stubs
- [x] `src/shared/api/publicApi.test.ts` -- story 3.1 describe: empty list, list after fixtures (newest-first, camelCase, no snake_case), detail 200 shape, detail 404 envelope, 405 -- pins the I/O matrix

**Acceptance Criteria:**
- Given the F1 schema from 2.1, when migrations apply, then `runs`/`drafts`/`evidence_events` exist with the enum CHECKs matching `vocabulary.ts` verbatim and no secret-bearing columns
- Given a Run, Draft, and Evidence fixtures inserted via repos, when `GET /api/runs` and `GET /api/runs/:id` are called, then responses are Zod-valid camelCase with `drafts`/`evidence` arrays and newest-first ordering
- Given an unknown run id, when fetched, then the response is the documented envelope 404

## Implementation Notes

## Spec Change Log

- 2026-09-08 (implementation): `RUN_MODE_VALUES` was required by the Code Map but never pinned by the frozen sections. Resolved as `hitl | yolo` from the PRD glossary ("Human-in-the-Loop mode (default)" / "Autonomous mode ('YOLO')") and the architecture's locked orchestration pattern (`waitForApproval (HITL) OR YOLO agent`); recorded here and documented in `vocabulary.ts`. If Patrick prefers different strings, it is a one-line vocabulary change plus the 0006 CHECK (pre-production, disposable local state).

## Review Triage Log

| # | Source | Verdict | Evidence / disposition |
|---|--------|---------|------------------------|
| 1 | blind | low | `run.budget_stopped`→`run.stopped` mapping "undocumented" — rejected: the closed set + rationale live in the vocabulary comment and Design Notes; the epic-context name was illustrative. |
| 2 | blind | low | No `UNIQUE(run_id, seq)` — real; repo comment even names the duplicate case. → patch (0006). |
| 3 | blind+edge | medium | `spend_currency`/run-id format Zod-only, no SQL CHECK — verified: raw-SQL writer can persist values the wire regex rejects; read path then 500s. → patch (0006 GLOB CHECKs). |
| 4 | blind+edge | medium | No cross-field pairing CHECKs (`running`+`completed_at`, `outcome`↔`decided_at/by`) — verified SQL-legal. → patch (0006). |
| 5 | blind | low | No index for 3.9/3.10's `outcome IS NULL` query — defer: index belongs to the story that introduces the query. |
| 6 | blind+edge | low | No LIMIT on `listRuns` — defer: every house list endpoint is unpaginated by design (retro fragility family, item 4). |
| 7 | blind | low | 404 message interpolates raw pre-decode `m[1]` — verified; one-word fix to echo the decoded `id`. → patch. |
| 8 | blind | low | Order-fragility half rejected (documented house style); cross-run leakage half real but cheap: fixtures give only one run drafts, so a dropped `WHERE run_id` passes. → patch (assertion). |
| 9 | blind+edge+vgap | medium | `insertRun` persists then parses its input — verified: input the CHECKs accept but Zod rejects (fractional cents, lowercase currency, bad id) leaves a poisoned row and throws. → patch (validate before INSERT). |
| 10 | blind | false | sprint-status date format — the `MM-DD-YYYY` stamp is the sync script's documented format. |
| 11 | blind | false | Spec status/verification "not evidenced in diff" — build-loop mechanics; status transitions are the workflow's own state machine. |
| 12 | edge+vgap | low | One bad row 500s the whole list (no safeParse skip) — real but the deliberate parse-all/fail-closed house pattern; deferred family (retro item 4). → defer. |
| 13 | edge+vgap | medium | Fractional `spend_cents`/`budget_cents`/`confidence` pass SQL `>=0`/`BETWEEN`, fail Zod `.int()` at read — verified. → patch (int-cast CHECKs). |
| 14 | edge | low | Cents beyond 2^53 — same CHECK line as #13; included there. |
| 15 | edge+vgap | medium | `seq` carries no CHECK (negative/fractional SQL-legal, Zod rejects at read) — verified. → patch. |
| 16 | edge+vgap | medium | Empty-string `body`/`target_entity_*`/`decided_by` pass SQL, fail Zod `min(1)` at read — verified. → patch. |
| 17 | edge | medium | `running` + non-null `completed_at` SQL-legal — verified; public log would show completion on an in-flight Run. → patch. |
| 18 | edge | high | `outcome` set with NULL `decided_at`/`decided_by` SQL-legal — verified; a gate decision without frozen approver/time is a provenance hole on a provenance-first product. → patch. |
| 19 | edge+vgap | medium | Alignment test never loops `DRAFT_OUTCOME_VALUES` against the `drafts.outcome` CHECK — verified (all fixtures leave outcome NULL); drift would surface in 3.10's write path. → patch. |
| 20 | vgap | medium | Malformed encoded run id → 400 branch untested (cases sibling is pinned) — pre-verified by the layer's tracing. → patch. |
| 21 | vgap | medium | 0006 timestamp CHECKs tested accept-side only; a loosened strftime clause ships green — pre-verified. → patch (reject-side assertion). |
| 22 | vgap | low | Alignment UPDATEs assert `.resolves` without `meta.changes` — 0-row UPDATE passes; add changes assertions. → patch. |

## Design Notes

- Evidence `event` CHECK set for this story: `run.started`, `run.completed`, `run.failed`, `run.stopped`, `run.empty`, `source.fetched`, `source.skipped`, `draft.created`, `guardrails.passed`, `guardrails.failed`, `gate.awaiting_approval`, `gate.decided`. Later stories extend by migration (0003 precedent) — the set is deliberately closed per migration so CHECKs stay truthful.
- `evidence_events.seq` is a per-run monotonic integer (0-based) supplied by the writer and UNIQUE per run (`UNIQUE(run_id, seq)`); the composite `(run_id, seq)` ordering is what Evidence detail (3.8) renders.
- `edited_body` + outcome columns make 3.10's edit-then-approve a pure UPDATE — the original `body` is never mutated, preserving the public before/after diff.
- `RunStatusChip`'s rendered labels (e.g. `empty` → "no material change") are a UI concern and stay in the component; the DB/API vocabulary is the raw enum strings, unchanged.

## Verification

**Commands:**
- `npm run migrate:local` -- expected: `0006_run_draft_evidence.sql` applies clean
- `npm test` -- expected: all suites pass including the new story 3.1 describe (415 → ~421)
- `npm run check` -- expected: exit 0 (oxfmt + oxlint + tsc)
