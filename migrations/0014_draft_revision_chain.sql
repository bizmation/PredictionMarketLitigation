-- Story 3.16 — Draft revision chain plus `draft.revised` Evidence.
--
-- D1 cannot ALTER a CHECK in place (0008/0010/0013 precedent). Rebuild
-- `drafts` (0010 pattern) with `parent_draft_id` / `revision_index` and
-- rebuild `evidence_events` (0013 pattern) admitting `draft.revised`.
-- Existing Drafts copy as revision 0 / NULL parent. Restore `idx_drafts_run`
-- and `idx_evidence_run_seq` after rename.
--
-- CHECK: `parent_draft_id IS NULL` iff `revision_index = 0`.
--
-- NOTE ON TRANSACTIONS: no explicit BEGIN/PRAGMA. Wrangler pre-splits this
-- file into single statements and runs them through one `db.batch()`.

CREATE TABLE drafts_new (
  id                 TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  run_id             TEXT NOT NULL REFERENCES runs(id),
  target_entity_type TEXT CHECK (
    target_entity_type IS NULL OR length(trim(target_entity_type)) > 0
  ),
  target_entity_id   TEXT CHECK (
    target_entity_id IS NULL OR length(trim(target_entity_id)) > 0
  ),
  diff_json          TEXT NOT NULL CHECK (json_valid(diff_json)),
  body               TEXT NOT NULL CHECK (length(trim(body)) > 0),
  tier2_only         INTEGER NOT NULL DEFAULT 0 CHECK (tier2_only IN (0,1)),
  confidence         INTEGER CHECK (
    confidence IS NULL
    OR (confidence = CAST(confidence AS INTEGER) AND confidence BETWEEN 0 AND 100)
  ),
  eval_summary_json  TEXT CHECK (eval_summary_json IS NULL OR json_valid(eval_summary_json)),
  outcome            TEXT CHECK (outcome IS NULL OR outcome IN ('approved','edited','rejected')),
  decided_at         TEXT CHECK (
    decided_at IS NULL OR (
      length(decided_at) = 24
      AND decided_at GLOB '????-??-??T??:??:??.???Z'
      AND strftime('%Y-%m-%dT%H:%M:%fZ', decided_at, '+0 seconds') = decided_at
    )
  ),
  decided_by         TEXT CHECK (decided_by IS NULL OR length(trim(decided_by)) > 0),
  edited_body        TEXT CHECK (
    edited_body IS NULL OR length(trim(edited_body)) > 0
  ),
  reject_reason      TEXT CHECK (
    reject_reason IS NULL OR length(trim(reject_reason)) > 0
  ),
  reject_reason_private TEXT CHECK (
    reject_reason_private IS NULL OR length(trim(reject_reason_private)) > 0
  ),
  parent_draft_id    TEXT REFERENCES drafts_new(id) CHECK (
    parent_draft_id IS NULL OR length(trim(parent_draft_id)) > 0
  ),
  revision_index     INTEGER NOT NULL DEFAULT 0 CHECK (
    revision_index = CAST(revision_index AS INTEGER) AND revision_index >= 0
  ),
  created_at         TEXT NOT NULL CHECK (
    length(created_at) = 24
    AND created_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 seconds') = created_at
  ),
  updated_at         TEXT NOT NULL CHECK (
    length(updated_at) = 24
    AND updated_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 seconds') = updated_at
  ),
  CHECK ((outcome IS NULL) = (decided_at IS NULL)),
  CHECK ((outcome IS NULL) = (decided_by IS NULL)),
  CHECK ((target_entity_type IS NULL) = (target_entity_id IS NULL)),
  CHECK (
    outcome <> 'edited'
    OR (edited_body IS NOT NULL AND length(trim(edited_body)) > 0)
  ),
  CHECK (
    (reject_reason IS NULL AND reject_reason_private IS NULL)
    OR outcome = 'rejected'
  ),
  CHECK (
    outcome <> 'rejected'
    OR reject_reason IS NOT NULL
    OR reject_reason_private IS NOT NULL
  ),
  CHECK (
    (parent_draft_id IS NULL AND revision_index = 0)
    OR (parent_draft_id IS NOT NULL AND revision_index > 0)
  )
);

INSERT INTO drafts_new (
  id, run_id, target_entity_type, target_entity_id, diff_json, body, tier2_only,
  confidence, eval_summary_json, outcome, decided_at, decided_by, edited_body,
  reject_reason, reject_reason_private, parent_draft_id, revision_index,
  created_at, updated_at
)
SELECT
  id, run_id, target_entity_type, target_entity_id, diff_json, body, tier2_only,
  confidence, eval_summary_json, outcome, decided_at, decided_by, edited_body,
  reject_reason, reject_reason_private, NULL, 0, created_at, updated_at
FROM drafts;

DROP TABLE drafts;
ALTER TABLE drafts_new RENAME TO drafts;

CREATE INDEX idx_drafts_run ON drafts(run_id);

CREATE TABLE evidence_events_new (
  id           TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  run_id       TEXT NOT NULL REFERENCES runs(id),
  seq          INTEGER NOT NULL CHECK (seq = CAST(seq AS INTEGER) AND seq >= 0),
  event        TEXT NOT NULL CHECK (event IN ('run.started','run.completed','run.failed','run.stopped','run.empty','run.superseded','source.fetched','source.skipped','draft.created','draft.evaluated','draft.revised','guardrails.passed','guardrails.failed','gate.awaiting_approval','gate.decided','yolo.validated','steering.turn','steering.applied')),
  payload_json TEXT CHECK (payload_json IS NULL OR json_valid(payload_json)),
  created_at   TEXT NOT NULL CHECK (
    length(created_at) = 24
    AND created_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 seconds') = created_at
  )
);

INSERT INTO evidence_events_new (id, run_id, seq, event, payload_json, created_at)
SELECT id, run_id, seq, event, payload_json, created_at FROM evidence_events;

DROP TABLE evidence_events;

ALTER TABLE evidence_events_new RENAME TO evidence_events;

CREATE UNIQUE INDEX idx_evidence_run_seq ON evidence_events(run_id, seq);
