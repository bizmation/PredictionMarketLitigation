-- Story 3.5 — admit `draft.evaluated` on evidence_events.event.
--
-- D1/SQLite cannot ALTER a CHECK constraint in place (0003 precedent: later
-- stories extend a closed enum by adding a migration so the CHECK stays
-- truthful). Rebuild the table with the 0006 definition plus the new event,
-- copy rows, then restore the unique (run_id, seq) index.
--
-- NOTE ON TRANSACTIONS: no explicit BEGIN/PRAGMA. Wrangler pre-splits this
-- file into single statements and runs them through one `db.batch()`.

CREATE TABLE evidence_events_new (
  id           TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  run_id       TEXT NOT NULL REFERENCES runs(id),
  seq          INTEGER NOT NULL CHECK (seq = CAST(seq AS INTEGER) AND seq >= 0),
  event        TEXT NOT NULL CHECK (event IN ('run.started','run.completed','run.failed','run.stopped','run.empty','source.fetched','source.skipped','draft.created','draft.evaluated','guardrails.passed','guardrails.failed','gate.awaiting_approval','gate.decided')),
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
