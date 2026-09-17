-- Story 3.17 — versioned `poll_sources` plus `config.steered` Evidence.
--
-- `pipeline_config_versions` is append-only. Version 0 is the compile-time
-- seed in `POLL_SOURCES`, not a D1 row. Each write (steer or revert) inserts
-- the next integer `version` for that `key`; history is never deleted.
-- Unique `(key, version)`.
--
-- D1 cannot ALTER a CHECK in place (0008/0010/0013/0014 precedent). Rebuild
-- `evidence_events` (0014 pattern) admitting `config.steered`. Restore
-- `idx_evidence_run_seq` after rename.
--
-- NOTE ON TRANSACTIONS: no explicit BEGIN/PRAGMA. Wrangler pre-splits this
-- file into single statements and runs them through one `db.batch()`.

CREATE TABLE pipeline_config_versions (
  key                 TEXT NOT NULL CHECK (key = 'poll_sources'),
  version             INTEGER NOT NULL CHECK (
    version = CAST(version AS INTEGER) AND version >= 1
  ),
  prior_value         TEXT NOT NULL CHECK (
    json_valid(prior_value) AND json_type(prior_value) = 'array'
  ),
  new_value           TEXT NOT NULL CHECK (
    json_valid(new_value) AND json_type(new_value) = 'array'
  ),
  actor_display_name  TEXT NOT NULL CHECK (length(trim(actor_display_name)) > 0),
  created_at          TEXT NOT NULL CHECK (
    length(created_at) = 24
    AND created_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 seconds') = created_at
  ),
  PRIMARY KEY (key, version)
);

CREATE TABLE evidence_events_new (
  id           TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  run_id       TEXT NOT NULL REFERENCES runs(id),
  seq          INTEGER NOT NULL CHECK (seq = CAST(seq AS INTEGER) AND seq >= 0),
  event        TEXT NOT NULL CHECK (event IN ('run.started','run.completed','run.failed','run.stopped','run.empty','run.superseded','source.fetched','source.skipped','draft.created','draft.evaluated','draft.revised','guardrails.passed','guardrails.failed','gate.awaiting_approval','gate.decided','yolo.validated','steering.turn','steering.applied','config.steered')),
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
