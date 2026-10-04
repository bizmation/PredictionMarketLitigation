-- Separate durable admission from the operator-facing lifecycle. Legacy history
-- remains intact and is checked transactionally when new ownership is acquired.
CREATE TABLE run_admissions (
 run_id TEXT PRIMARY KEY REFERENCES runs(id),
 scheduled_for TEXT NOT NULL,
 request_id TEXT NOT NULL UNIQUE,
 instance_id TEXT NOT NULL UNIQUE,
 state TEXT NOT NULL CHECK(state IN ('pending','submitting','confirmed','uncertain','unavailable','resolved')),
 instance_status TEXT,
 entered INTEGER NOT NULL DEFAULT 0 CHECK(entered IN (0,1)),
 finished INTEGER NOT NULL DEFAULT 0 CHECK(finished IN (0,1)),
 released INTEGER NOT NULL DEFAULT 0 CHECK(released IN (0,1))
);
CREATE UNIQUE INDEX run_admissions_active_date ON run_admissions(scheduled_for) WHERE released=0;

-- A legacy callback stays retired even after its successor releases ownership.
CREATE TABLE run_retirements (run_id TEXT PRIMARY KEY REFERENCES runs(id));

-- Preserve all historical Evidence while admitting truthful dispatch receipts.
CREATE TABLE evidence_events_new (
  id           TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  run_id       TEXT NOT NULL REFERENCES runs(id),
  seq          INTEGER NOT NULL CHECK (seq = CAST(seq AS INTEGER) AND seq >= 0),
  event        TEXT NOT NULL CHECK (event IN ('run.started','run.completed','run.failed','run.stopped','run.empty','run.superseded','source.fetched','source.skipped','draft.created','draft.evaluated','draft.revised','guardrails.passed','guardrails.failed','gate.awaiting_approval','gate.decided','yolo.validated','steering.turn','steering.applied','config.steered','guidance.recorded','guidance.revoked','run.dispatch')),
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
