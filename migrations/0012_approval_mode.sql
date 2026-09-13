-- Story 3.13 — approval mode singleton, mode_audit, and `yolo.validated`.
--
-- `approval_mode` is a singleton (`id='current'`) the same way
-- `gateway_config` is: there is one live gate mode and one integer threshold
-- (0–100, same scale as Draft `confidence`). Launch seed is HITL / 70.
-- Mode is global, not per-Run, so the audit trail cannot live on
-- `evidence_events` (`run_id` is NOT NULL).
--
-- D1/SQLite cannot ALTER a CHECK constraint in place (0008/0009/0011
-- precedent). Rebuild `evidence_events` with the 0011 definition plus
-- `yolo.validated`, copy rows, then restore the unique (run_id, seq) index.
--
-- NOTE ON TRANSACTIONS: no explicit BEGIN/PRAGMA. Wrangler pre-splits this
-- file into single statements and runs them through one `db.batch()`.

CREATE TABLE approval_mode (
  id         TEXT PRIMARY KEY NOT NULL CHECK (id = 'current'),
  mode       TEXT NOT NULL CHECK (mode IN ('hitl','yolo')),
  threshold  INTEGER NOT NULL CHECK (
    threshold = CAST(threshold AS INTEGER) AND threshold BETWEEN 0 AND 100
  ),
  version    INTEGER NOT NULL CHECK (
    version = CAST(version AS INTEGER) AND version >= 1
  ),
  updated_at TEXT NOT NULL CHECK (
    length(updated_at) = 24
    AND updated_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 seconds') = updated_at
  )
);

INSERT INTO approval_mode (id, mode, threshold, version, updated_at)
VALUES ('current', 'hitl', 70, 1, '2026-09-13T00:00:00.000Z');

CREATE TABLE mode_audit (
  id                  TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  created_at          TEXT NOT NULL CHECK (
    length(created_at) = 24
    AND created_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 seconds') = created_at
  ),
  actor_display_name  TEXT NOT NULL CHECK (length(trim(actor_display_name)) > 0),
  kind                TEXT NOT NULL CHECK (kind IN ('mode','threshold')),
  prior_json          TEXT NOT NULL CHECK (
    json_valid(prior_json) AND json_type(prior_json) = 'object'
  ),
  next_json           TEXT NOT NULL CHECK (
    json_valid(next_json) AND json_type(next_json) = 'object'
  )
);

CREATE INDEX idx_mode_audit_created ON mode_audit(created_at);

CREATE TABLE evidence_events_new (
  id           TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  run_id       TEXT NOT NULL REFERENCES runs(id),
  seq          INTEGER NOT NULL CHECK (seq = CAST(seq AS INTEGER) AND seq >= 0),
  event        TEXT NOT NULL CHECK (event IN ('run.started','run.completed','run.failed','run.stopped','run.empty','run.superseded','source.fetched','source.skipped','draft.created','draft.evaluated','guardrails.passed','guardrails.failed','gate.awaiting_approval','gate.decided','yolo.validated')),
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
