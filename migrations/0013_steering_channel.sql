-- Story 3.14 — steering_turns plus evidence/llm_calls CHECK rebuilds.
--
-- Operator steering is a governed channel on a Run: one row per submitted
-- turn, private chosen at insert and never updated, Evidence of
-- `steering.turn` + `steering.applied` on the public timeline.
-- `llm_calls.role` admits `steward` so spend on that Run is attributable.
-- No production `gateway_config` model-id seed — tests INSERT a steward
-- mapping when they need `complete()`.
--
-- D1/SQLite cannot ALTER a CHECK in place (0008/0009/0011/0012 precedent).
-- Rebuild `evidence_events` with the 0012 definition plus `steering.turn`
-- and `steering.applied`; rebuild `llm_calls` with the 0009 definition plus
-- `steward`. Restore indexes after rename.
--
-- NOTE ON TRANSACTIONS: no explicit BEGIN/PRAGMA. Wrangler pre-splits this
-- file into single statements and runs them through one `db.batch()`.

CREATE TABLE steering_turns (
  id                  TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  run_id              TEXT NOT NULL REFERENCES runs(id),
  draft_id            TEXT REFERENCES drafts(id) CHECK (
    draft_id IS NULL OR length(trim(draft_id)) > 0
  ),
  actor_display_name  TEXT NOT NULL CHECK (length(trim(actor_display_name)) > 0),
  role                TEXT NOT NULL CHECK (role = 'steward'),
  content             TEXT NOT NULL CHECK (length(trim(content)) > 0),
  private             INTEGER NOT NULL CHECK (private IN (0,1)),
  created_at          TEXT NOT NULL CHECK (
    length(created_at) = 24
    AND created_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 seconds') = created_at
  )
);

CREATE INDEX idx_steering_turns_run ON steering_turns(run_id);

CREATE TABLE evidence_events_new (
  id           TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  run_id       TEXT NOT NULL REFERENCES runs(id),
  seq          INTEGER NOT NULL CHECK (seq = CAST(seq AS INTEGER) AND seq >= 0),
  event        TEXT NOT NULL CHECK (event IN ('run.started','run.completed','run.failed','run.stopped','run.empty','run.superseded','source.fetched','source.skipped','draft.created','draft.evaluated','guardrails.passed','guardrails.failed','gate.awaiting_approval','gate.decided','yolo.validated','steering.turn','steering.applied')),
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

CREATE TABLE llm_calls_new (
  id          TEXT PRIMARY KEY NOT NULL,
  run_id      TEXT NOT NULL REFERENCES runs(id),
  role        TEXT NOT NULL CHECK (role IN ('orchestrator','drafter','reviewer','yolo','steward')),
  provider    TEXT NOT NULL CHECK (length(trim(provider)) > 0),
  model       TEXT NOT NULL CHECK (length(trim(model)) > 0),
  tokens_json TEXT CHECK (tokens_json IS NULL OR json_valid(tokens_json)),
  cost_cents  INTEGER NOT NULL CHECK (
    cost_cents = CAST(cost_cents AS INTEGER) AND cost_cents >= 0
  ),
  currency    TEXT NOT NULL DEFAULT 'USD' CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
  created_at  TEXT NOT NULL CHECK (
    length(created_at) = 24
    AND created_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 seconds') = created_at
  )
);

INSERT INTO llm_calls_new (
  id, run_id, role, provider, model, tokens_json, cost_cents, currency, created_at
)
SELECT
  id, run_id, role, provider, model, tokens_json, cost_cents, currency, created_at
FROM llm_calls;

DROP TABLE llm_calls;

ALTER TABLE llm_calls_new RENAME TO llm_calls;

CREATE INDEX idx_llm_calls_run ON llm_calls(run_id);
