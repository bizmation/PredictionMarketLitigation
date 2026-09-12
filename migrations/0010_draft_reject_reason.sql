-- Story 3.10 -- reject-reason columns (FR14 storage).
--
-- D1 cannot ALTER a CHECK in place (0008 precedent), and 0010 adds both
-- columns AND cross-field CHECKs, so `drafts` is rebuilt (0009 pattern):
-- copy rows, drop, rename, restore `idx_drafts_run`. The FK to `runs`
-- carries over unchanged.
--
-- PRIVACY CONTRACT (story 3.10 intent):
--   reject_reason          = the PUBLIC portion -- rides DraftRecord.rejectReason
--                            and the gate.decided Evidence payload.
--   reject_reason_private  = the PRIVATE portion -- never enters any public
--                            wire shape, Evidence payload, or log.
-- Both columns are optional storage, but a rejection requires at least one of
-- the two, and reasons only ever appear on a rejected row. No decided Draft
-- can exist in D1 before this story (the decision path lands with it), so
-- pending rows copy over unchanged.

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
  )
);

INSERT INTO drafts_new (
  id, run_id, target_entity_type, target_entity_id, diff_json, body, tier2_only,
  confidence, eval_summary_json, outcome, decided_at, decided_by, edited_body,
  reject_reason, reject_reason_private, created_at, updated_at
)
SELECT
  id, run_id, target_entity_type, target_entity_id, diff_json, body, tier2_only,
  confidence, eval_summary_json, outcome, decided_at, decided_by, edited_body,
  NULL, NULL, created_at, updated_at
FROM drafts;

DROP TABLE drafts;
ALTER TABLE drafts_new RENAME TO drafts;

CREATE INDEX idx_drafts_run ON drafts(run_id);
