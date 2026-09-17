-- Story 3.18 — versioned, revocable `standing_guidance` plus
-- `guidance.recorded` / `guidance.revoked` Evidence.
--
-- `standing_guidance` is append-only. Each operator write (record, edit,
-- revoke) inserts the next integer `version` for that `item_id`; history is
-- never deleted or updated in place. In-force = latest version per item
-- whose `status` is `active`. `revoked_at` is set only on `revoked` rows.
-- Unique `(item_id, version)`.
--
-- D1 cannot ALTER a CHECK in place (0008/0010/0013/0014/0015 precedent).
-- Rebuild `evidence_events` (0015 pattern) admitting `guidance.recorded` and
-- `guidance.revoked`. Restore `idx_evidence_run_seq` after rename.
--
-- NOTE ON TRANSACTIONS: no explicit BEGIN/PRAGMA. Wrangler pre-splits this
-- file into single statements and runs them through one `db.batch()`.

CREATE TABLE standing_guidance (
  id                  TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  item_id             TEXT NOT NULL CHECK (length(trim(item_id)) > 0),
  version             INTEGER NOT NULL CHECK (
    version = CAST(version AS INTEGER) AND version >= 1
  ),
  content             TEXT NOT NULL CHECK (length(trim(content)) > 0),
  status              TEXT NOT NULL CHECK (status IN ('active','revoked')),
  actor_display_name  TEXT NOT NULL CHECK (length(trim(actor_display_name)) > 0),
  source_turn_id      TEXT,
  created_at          TEXT NOT NULL CHECK (
    length(created_at) = 24
    AND created_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 seconds') = created_at
  ),
  revoked_at          TEXT CHECK (
    revoked_at IS NULL
    OR (
      length(revoked_at) = 24
      AND revoked_at GLOB '????-??-??T??:??:??.???Z'
      AND strftime('%Y-%m-%dT%H:%M:%fZ', revoked_at, '+0 seconds') = revoked_at
    )
  ),
  CHECK ((status = 'revoked') = (revoked_at IS NOT NULL)),
  UNIQUE (item_id, version)
);

CREATE TABLE evidence_events_new (
  id           TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  run_id       TEXT NOT NULL REFERENCES runs(id),
  seq          INTEGER NOT NULL CHECK (seq = CAST(seq AS INTEGER) AND seq >= 0),
  event        TEXT NOT NULL CHECK (event IN ('run.started','run.completed','run.failed','run.stopped','run.empty','run.superseded','source.fetched','source.skipped','draft.created','draft.evaluated','draft.revised','guardrails.passed','guardrails.failed','gate.awaiting_approval','gate.decided','yolo.validated','steering.turn','steering.applied','config.steered','guidance.recorded','guidance.revoked')),
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
