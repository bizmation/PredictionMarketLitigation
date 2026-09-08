-- Story 3.1 — Run, Draft & Evidence data model (Epic 3 foundation).
--
-- Durable source of truth for the governed daily loop: every Run attempt
-- (including empty, failed, and budget-stopped ones), the Drafts it packaged,
-- and the public Evidence projection of what happened. Storage and contracts
-- only — no pipeline writes here (3.2+), no gate writes (3.10/3.11).
--
-- Conventions mirror 0001_f1_core.sql: snake_case plural tables, TEXT `id`
-- primary keys, inline enum CHECKs storing vocabulary strings VERBATIM
-- (src/shared/schemas/vocabulary.ts is canonical), `idx_<table>_<cols>`
-- indexes, and the 24-char ISO-UTC GLOB+strftime round-trip timestamp check.
--
-- ── WHY THE ENUM CHECKs ─────────────────────────────────────────────────────
-- Same reasoning as 0001: migrations arrive as raw SQL through `wrangler d1
-- migrations apply`, so Zod is NEVER in the write path. The evidence_events
-- set is deliberately CLOSED per migration (0003 precedent for corrective
-- migrations) — later stories extend it by adding a migration, so the CHECKs
-- stay truthful about what the projection can actually contain today.
--
-- ── SQL AT LEAST AS STRICT AS ZOD ───────────────────────────────────────────
-- The repos map rows to the wire through Zod (Schema.parse), so a row the
-- CHECKs accept but the schema rejects would turn the public read endpoints
-- into 500s. Every wire invariant a raw-SQL writer could violate is therefore
-- also a CHECK: run ids carry their `run-YYYYMMDD-xxxx` shape (split across
-- short GLOBs because D1 caps a single pattern at 50 bytes), currency is 3
-- uppercase letters, cent/seq/confidence columns are true integers, a
-- `running` Run has no completion time, the gate decision trio (outcome,
-- decided_at, decided_by) moves together, and drafts/evidence content is
-- non-empty where the schema demands it.
--
-- ── MONEY ───────────────────────────────────────────────────────────────────
-- Integer cents + ISO currency code, never float dollars (architecture
-- #Spend). `budget_cents` is the per-Run ceiling the gateway (3.2) enforces;
-- NULL means no recorded ceiling yet, which is a displayable empty state, not
-- an unlimited budget.
--
-- ── SECRETS ─────────────────────────────────────────────────────────────────
-- No credential/secret column anywhere. `decided_by` holds the public-safe
-- operator display name (Story 1.4 policy), never an email. Evidence payloads
-- are scrubbed by the projector before insert (Epic 3 write-path rules).
--
-- ── DRAFTS NEVER TOUCH LIVE F1 ──────────────────────────────────────────────
-- Drafts are their own tables with no FK into cases/states/circuits; the
-- affected F1 entity is named by (target_entity_type, target_entity_id) as
-- data, not enforced by reference. `edited_body` + `outcome` make 3.10's
-- edit-then-approve a pure UPDATE — the original `body` is never mutated,
-- preserving the public before/after diff.
--
-- NOTE ON TRANSACTIONS: no explicit BEGIN/PRAGMA. Wrangler pre-splits this
-- file into single statements and runs them through one `db.batch()`, which
-- is already one implicit transaction.

-- ── Runs ────────────────────────────────────────────────────────────────────
--
-- One row per pipeline attempt. `running` is the initial non-terminal state;
-- the terminal statuses are the RunStatusChip vocabulary exactly. Ids are
-- human-readable `run-YYYYMMDD-xxxx` (UTC date + 4 hex, same-day uniqueness)
-- so the public log displays meaningfully. `origin` records WHY the run
-- happened — multiple runs may share a `scheduled_for` date, each with a
-- distinct origin (catch-up supplements, never replaces, the day's record).

CREATE TABLE runs (
  id             TEXT PRIMARY KEY NOT NULL CHECK (
    -- D1 caps any single LIKE/GLOB pattern at 50 bytes, so the
    -- run-YYYYMMDD-xxxx shape is split into short substring checks.
    length(id) = 17
    AND substr(id, 1, 4) = 'run-'
    AND substr(id, 13, 1) = '-'
    AND substr(id, 5, 8) NOT GLOB '*[^0-9]*'
    AND substr(id, 14, 4) NOT GLOB '*[^0-9a-f]*'
  ),
  origin         TEXT NOT NULL CHECK (origin IN ('scheduled','catch-up','manual')),
  mode           TEXT NOT NULL CHECK (mode IN ('hitl','yolo')),
  status         TEXT NOT NULL CHECK (status IN ('running','published','awaiting','empty','failed','stopped','rejected')),
  started_at     TEXT NOT NULL CHECK (
    length(started_at) = 24
    AND started_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', started_at, '+0 seconds') = started_at
  ),
  completed_at   TEXT CHECK (
    completed_at IS NULL OR (
      length(completed_at) = 24
      AND completed_at GLOB '????-??-??T??:??:??.???Z'
      AND strftime('%Y-%m-%dT%H:%M:%fZ', completed_at, '+0 seconds') = completed_at
    )
  ),
  spend_cents    INTEGER NOT NULL DEFAULT 0 CHECK (
    spend_cents = CAST(spend_cents AS INTEGER) AND spend_cents >= 0
  ),
  spend_currency TEXT NOT NULL DEFAULT 'USD' CHECK (spend_currency GLOB '[A-Z][A-Z][A-Z]'),
  budget_cents   INTEGER CHECK (
    budget_cents IS NULL
    OR (budget_cents = CAST(budget_cents AS INTEGER) AND budget_cents >= 0)
  ),
  scheduled_for  TEXT CHECK (
    scheduled_for IS NULL OR (
      length(scheduled_for) = 10
      AND scheduled_for GLOB '????-??-??'
      AND date(scheduled_for, '+0 days') = scheduled_for
    )
  ),
  -- A Run that is still running has not completed; the terminal statuses may
  -- carry a completion time (or legitimately not, while a Run waits at the
  -- gate — `awaiting` is terminal-for-display but the gate may take days).
  CHECK (status <> 'running' OR completed_at IS NULL)
);

CREATE INDEX idx_runs_status ON runs(status);

-- ── Drafts ──────────────────────────────────────────────────────────────────
--
-- Proposed content updates produced during a Run. Publicly visible on `ops.`
-- while pending (NotLiveDraftBanner), but never live F1 until the Approval
-- Gate publishes. `diff_json` is the proposed field diff (shape owned by
-- 3.4/3.11); `eval_summary_json` carries confidence/eval inputs. `outcome` is
-- the gate decision; `decided_at`/`decided_by` freeze who decided and when —
-- the trio moves together, so a decision is never half-recorded.

CREATE TABLE drafts (
  id                 TEXT PRIMARY KEY NOT NULL,
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
  edited_body        TEXT,
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
  CHECK ((outcome IS NULL) = (decided_by IS NULL))
);

CREATE INDEX idx_drafts_run ON drafts(run_id);

-- ── Evidence events ─────────────────────────────────────────────────────────
--
-- Append-oriented public projection rows (not raw vendor logs), written by the
-- Evidence projector. `seq` is a per-run monotonic integer (0-based) supplied
-- by the writer and UNIQUE per run — a duplicated sequence number would
-- corrupt the timeline Evidence detail (3.8) renders in (run_id, seq) order.
-- `payload_json` is scrubbed before insert — secrets never reach this table.

CREATE TABLE evidence_events (
  id           TEXT PRIMARY KEY NOT NULL,
  run_id       TEXT NOT NULL REFERENCES runs(id),
  seq          INTEGER NOT NULL CHECK (seq = CAST(seq AS INTEGER) AND seq >= 0),
  event        TEXT NOT NULL CHECK (event IN ('run.started','run.completed','run.failed','run.stopped','run.empty','source.fetched','source.skipped','draft.created','guardrails.passed','guardrails.failed','gate.awaiting_approval','gate.decided')),
  payload_json TEXT CHECK (payload_json IS NULL OR json_valid(payload_json)),
  created_at   TEXT NOT NULL CHECK (
    length(created_at) = 24
    AND created_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 seconds') = created_at
  )
);

CREATE UNIQUE INDEX idx_evidence_run_seq ON evidence_events(run_id, seq);
