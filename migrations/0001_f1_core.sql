-- Story 2.1 — F1 core schema.
--
-- Revised 2026-08-11 after code review. Revised IN PLACE rather than adding a
-- corrective 0002 because this migration had never been applied remotely; local
-- state is disposable (`.wrangler/state`). Do not do this once a migration has
-- reached production.
--
-- Naming follows architecture.md#Naming-Patterns: snake_case plural tables,
-- snake_case columns, TEXT `id` primary keys, `<entity>_id` foreign keys,
-- `idx_<table>_<cols>` indexes. Enum columns store the PRD glossary strings
-- VERBATIM — the same strings the API returns and the UI renders as CSS classes.
--
-- ── WHY EVERY ENUM COLUMN HAS A CHECK ───────────────────────────────────────
-- The seed arrives as raw SQL through `wrangler d1 migrations apply`, so Zod is
-- NEVER in the write path. Without these constraints `posture='GO'` inserts
-- cleanly, and StatusBadge interpolates the raw string into both the CSS class
-- and the visible text — rendering a wrong legal status to a reader with no
-- error anywhere. The CHECKs are what make src/shared/schemas/vocabulary.ts
-- canonical for D1 in fact rather than in comment.
--
-- ── THE TWO AXES ────────────────────────────────────────────────────────────
--   operational_status  go | restricted | banned | unknown
--                       → can a platform operate there today?
--   posture             untracked | platform | pending | state | banned
--                       → which way did the litigation come out?
-- `banned` is a member of BOTH and means different things in each. A state is
-- routinely operational_status='restricted' with posture='pending'. Never merge
-- these columns and never add a CHECK that assumes one implies the other.
--
-- `unknown` (operational) and `untracked` (posture) are deliberately DIFFERENT
-- words for the two axes' absence values, so the enums overlap on `banned` only.
--
-- NOT IN THIS MIGRATION, deliberately: drafts, runs, evidence_events (Epic 3),
-- poll_votes (Story 2.9), submissions (Story 4.5).
--
-- NOTE ON TRANSACTIONS: no explicit BEGIN/COMMIT. Wrangler pre-splits this file
-- into single statements (`unstable_splitSqlQuery`) and runs them through one
-- `db.batch()`, which is already one implicit transaction. An explicit BEGIN
-- would be split out as its own statement and break that.

-- ── Circuits ────────────────────────────────────────────────────────────────

CREATE TABLE circuits (
  id              TEXT PRIMARY KEY NOT NULL,
  number          INTEGER UNIQUE,           -- NULL for D.C. / Federal Circuit
  name            TEXT NOT NULL CHECK (length(trim(name)) > 0),
  posture         TEXT NOT NULL CHECK (posture IN ('untracked','platform','pending','state','banned')),
  has_split       INTEGER NOT NULL DEFAULT 0 CHECK (has_split IN (0,1)),
  summary         TEXT,
  -- Provenance: circuits carry published claims (posture, has_split) exactly as
  -- states and cases do, so they carry the same attribution columns.
  provenance_kind TEXT NOT NULL CHECK (provenance_kind IN ('human','agent')),
  published_at    TEXT NOT NULL CHECK (
    length(published_at) = 24
    AND published_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', published_at, '+0 seconds') = published_at
  ),
  updated_at      TEXT NOT NULL CHECK (
    length(updated_at) = 24
    AND updated_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 seconds') = updated_at
  )
);

-- ── Entities (prediction-market platforms) ──────────────────────────────────

CREATE TABLE entities (
  id              TEXT PRIMARY KEY NOT NULL,
  slug            TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name            TEXT NOT NULL CHECK (length(trim(name)) > 0),
  role            TEXT,
  provenance_kind TEXT NOT NULL CHECK (provenance_kind IN ('human','agent')),
  published_at    TEXT NOT NULL CHECK (
    length(published_at) = 24
    AND published_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', published_at, '+0 seconds') = published_at
  ),
  updated_at      TEXT NOT NULL CHECK (
    length(updated_at) = 24
    AND updated_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 seconds') = updated_at
  )
);

-- ── Cases ───────────────────────────────────────────────────────────────────
--
-- `caption` is stored exactly as the source writes it, including party order.
-- The UI italicises it; it must not be reformatted here.
--
-- filed_at / decided_at are REAL-WORLD dates, distinct from published_at and
-- updated_at, which are OUR record timestamps. Added on review: Story 2.6's
-- emergence timeline has no other date to work from — the seed gives every row
-- the same survey-coverage published_at, so MIN(published_at) per issue tag
-- would be a flat line. Nullable because plenty of matters in the corpus have
-- no filing date recorded and none have a decision yet.

CREATE TABLE cases (
  id              TEXT PRIMARY KEY NOT NULL,
  caption         TEXT NOT NULL CHECK (length(trim(caption)) > 0),
  court           TEXT NOT NULL CHECK (length(trim(court)) > 0),
  docket_number   TEXT,
  forum           TEXT NOT NULL CHECK (forum IN ('federal-district','federal-appellate','state','agency')),
  lifecycle       TEXT NOT NULL CHECK (lifecycle IN ('active','resolved')),
  posture         TEXT NOT NULL CHECK (posture IN ('untracked','platform','pending','state','banned')),
  circuit_id      TEXT REFERENCES circuits(id),
  filed_at        TEXT CHECK (
    filed_at IS NULL OR (
      length(filed_at) = 10
      AND filed_at GLOB '????-??-??'
      AND date(filed_at, '+0 days') = filed_at
    )
  ),
  decided_at      TEXT CHECK (
    decided_at IS NULL OR (
      length(decided_at) = 10
      AND decided_at GLOB '????-??-??'
      AND date(decided_at, '+0 days') = decided_at
    )
  ),
  provenance_kind TEXT NOT NULL CHECK (provenance_kind IN ('human','agent')),
  published_at    TEXT NOT NULL CHECK (
    length(published_at) = 24
    AND published_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', published_at, '+0 seconds') = published_at
  ),
  updated_at      TEXT NOT NULL CHECK (
    length(updated_at) = 24
    AND updated_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 seconds') = updated_at
  ),
  -- An appellate case with no circuit silently vanishes from the circuit-split
  -- view that exists to show it.
  CHECK (forum <> 'federal-appellate' OR circuit_id IS NOT NULL)
);

CREATE INDEX idx_cases_circuit_id ON cases(circuit_id);
CREATE INDEX idx_cases_lifecycle ON cases(lifecycle);
CREATE INDEX idx_cases_updated_at ON cases(updated_at);
CREATE INDEX idx_cases_filed_at ON cases(filed_at);

-- ── States ──────────────────────────────────────────────────────────────────
--
-- AC6 needs BOTH axes to be able to say "we do not know", and it is the second
-- one that nearly shipped wrong. `posture='untracked'` was always available;
-- `operational_status` was NOT NULL over three affirmative claims, so ~31 states
-- absent from the corpus would have had to be seeded `go` — which pml.css
-- renders GREEN. A green GO badge beside a "No tracked activity" swatch is
-- exactly what AC6 forbids. Hence `unknown`.
--
-- operational_status_basis records HOW we know, which is a separate question
-- from WHETHER. The corpus states an operational status for only three states
-- (NV, IL, MA); everything else is inferred from injunction posture. Seeding
-- inference as fact is the failure mode this whole project exists to avoid, so
-- the distinction is a column rather than a note.

CREATE TABLE states (
  id                        TEXT PRIMARY KEY NOT NULL,
  code                      TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (code GLOB '[A-Za-z][A-Za-z]'),
  name                      TEXT NOT NULL CHECK (length(trim(name)) > 0),
  circuit_id                TEXT REFERENCES circuits(id),
  operational_status        TEXT NOT NULL CHECK (operational_status IN ('go','restricted','banned','unknown')),
  operational_status_basis  TEXT NOT NULL CHECK (operational_status_basis IN ('stated','inferred')),
  posture                   TEXT NOT NULL CHECK (posture IN ('untracked','platform','pending','state','banned')),
  controlling_case_id       TEXT REFERENCES cases(id),
  why_note                  TEXT,
  provenance_kind           TEXT NOT NULL CHECK (provenance_kind IN ('human','agent')),
  published_at              TEXT NOT NULL CHECK (
    length(published_at) = 24
    AND published_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', published_at, '+0 seconds') = published_at
  ),
  updated_at                TEXT NOT NULL CHECK (
    length(updated_at) = 24
    AND updated_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 seconds') = updated_at
  ),
  -- A decided posture with no controlling authority is an unsourced FR2 claim.
  CHECK (posture IN ('untracked','pending') OR controlling_case_id IS NOT NULL),
  -- An unknown operational status cannot have been "stated" by a source.
  CHECK (operational_status <> 'unknown' OR operational_status_basis = 'inferred')
);

CREATE INDEX idx_states_circuit_id ON states(circuit_id);
CREATE INDEX idx_states_operational_status ON states(operational_status);
CREATE INDEX idx_states_posture ON states(posture);
CREATE INDEX idx_states_updated_at ON states(updated_at);

-- Per-platform breakdown (AC1) — "legal for Kalshi, not for Polymarket".
--
-- Surrogate `id` rather than the composite PK it had before review: `sources`
-- is polymorphic by (owning_table, owning_id), so without a single-column key
-- these rows could not be sourced at all. They carry the most legally specific
-- claim the product makes, and FR2 requires every status claim to have a
-- primary source — so they also carry full provenance, like every other
-- claim-bearing table.

CREATE TABLE state_platform_statuses (
  id                       TEXT PRIMARY KEY NOT NULL,
  state_id                 TEXT NOT NULL REFERENCES states(id),
  entity_id                TEXT NOT NULL REFERENCES entities(id),
  operational_status       TEXT NOT NULL CHECK (operational_status IN ('go','restricted','banned','unknown')),
  operational_status_basis TEXT NOT NULL CHECK (operational_status_basis IN ('stated','inferred')),
  note                     TEXT,
  provenance_kind          TEXT NOT NULL CHECK (provenance_kind IN ('human','agent')),
  published_at             TEXT NOT NULL CHECK (
    length(published_at) = 24
    AND published_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', published_at, '+0 seconds') = published_at
  ),
  updated_at               TEXT NOT NULL CHECK (
    length(updated_at) = 24
    AND updated_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 seconds') = updated_at
  ),
  UNIQUE (state_id, entity_id)
);

CREATE INDEX idx_state_platform_statuses_entity_id ON state_platform_statuses(entity_id);

-- ── Sources ─────────────────────────────────────────────────────────────────
--
-- FR2: every status/posture claim links to >= 1 primary source. Polymorphic by
-- (owning_table, owning_id) because one court order is routinely the source for
-- a case, a state and a circuit at once. SQLite cannot declare a polymorphic
-- FK, so owner-existence triggers below enforce the equivalent invariant and
-- the seed-integrity tests pin it.
--
-- `tier` is load-bearing beyond display: Epic 3 makes Tier-2-only findings
-- ineligible for auto-approval, so it has to be right in the seed.

CREATE TABLE sources (
  id           TEXT PRIMARY KEY NOT NULL,
  owning_table TEXT NOT NULL CHECK (owning_table IN ('cases','states','circuits','entities','cert_signals','state_platform_statuses')),
  owning_id    TEXT NOT NULL,
  url          TEXT NOT NULL CHECK (url GLOB 'https://*'),
  title        TEXT NOT NULL CHECK (length(trim(title)) > 0),
  tier         TEXT NOT NULL CHECK (tier IN ('tier1','tier2')),
  published_at TEXT CHECK (
    published_at IS NULL OR (
      length(published_at) = 10
      AND published_at GLOB '????-??-??'
      AND date(published_at, '+0 days') = published_at
    )
  )
);

CREATE INDEX idx_sources_owning_table_owning_id ON sources(owning_table, owning_id);

-- ── Docket events ───────────────────────────────────────────────────────────
-- Story 2.5 renders these reverse-chronologically. `source_id` is NOT NULL
-- because ApexShell already tells readers "Every docket event will link to a
-- Tier-1 source" — the tier half is the repo layer's to enforce.

CREATE TABLE docket_events (
  id              TEXT PRIMARY KEY NOT NULL,
  case_id         TEXT NOT NULL REFERENCES cases(id),
  occurred_at     TEXT NOT NULL CHECK (
    length(occurred_at) = 10
    AND occurred_at GLOB '????-??-??'
    AND date(occurred_at, '+0 days') = occurred_at
  ),
  description     TEXT NOT NULL CHECK (length(trim(description)) > 0),
  source_id       TEXT NOT NULL REFERENCES sources(id),
  provenance_kind TEXT NOT NULL CHECK (provenance_kind IN ('human','agent')),
  published_at    TEXT NOT NULL CHECK (
    length(published_at) = 24
    AND published_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', published_at, '+0 seconds') = published_at
  ),
  updated_at      TEXT NOT NULL CHECK (
    length(updated_at) = 24
    AND updated_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 seconds') = updated_at
  )
);

CREATE INDEX idx_docket_events_case_id_occurred_at ON docket_events(case_id, occurred_at);

CREATE TRIGGER trg_docket_events_tier1_insert
BEFORE INSERT ON docket_events
WHEN NOT EXISTS (
  SELECT 1 FROM sources
   WHERE id = NEW.source_id
     AND owning_table = 'cases'
     AND owning_id = NEW.case_id
     AND tier = 'tier1'
)
BEGIN
  SELECT RAISE(ABORT, 'docket event source must be Tier-1 and owned by its case');
END;

CREATE TRIGGER trg_docket_events_tier1_update
BEFORE UPDATE OF case_id, source_id ON docket_events
WHEN NOT EXISTS (
  SELECT 1 FROM sources
   WHERE id = NEW.source_id
     AND owning_table = 'cases'
     AND owning_id = NEW.case_id
     AND tier = 'tier1'
)
BEGIN
  SELECT RAISE(ABORT, 'docket event source must be Tier-1 and owned by its case');
END;

CREATE TRIGGER trg_sources_preserve_docket_tier
BEFORE UPDATE OF owning_table, owning_id, tier ON sources
WHEN EXISTS (
  SELECT 1 FROM docket_events
   WHERE source_id = OLD.id
     AND (
       NEW.owning_table <> 'cases'
       OR NEW.owning_id <> docket_events.case_id
       OR NEW.tier <> 'tier1'
     )
)
BEGIN
  SELECT RAISE(ABORT, 'referenced docket source must remain Tier-1 and case-owned');
END;

-- ── Issue taxonomy ──────────────────────────────────────────────────────────

CREATE TABLE issue_tags (
  id              TEXT PRIMARY KEY NOT NULL,
  slug            TEXT NOT NULL UNIQUE COLLATE NOCASE,
  label           TEXT NOT NULL CHECK (length(trim(label)) > 0),
  provenance_kind TEXT NOT NULL CHECK (provenance_kind IN ('human','agent')),
  published_at    TEXT NOT NULL CHECK (
    length(published_at) = 24
    AND published_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', published_at, '+0 seconds') = published_at
  ),
  updated_at      TEXT NOT NULL CHECK (
    length(updated_at) = 24
    AND updated_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 seconds') = updated_at
  )
);

CREATE TABLE case_issue_tags (
  case_id         TEXT NOT NULL REFERENCES cases(id),
  issue_tag_id    TEXT NOT NULL REFERENCES issue_tags(id),
  is_controlling  INTEGER NOT NULL DEFAULT 0 CHECK (is_controlling IN (0,1)),
  provenance_kind TEXT NOT NULL CHECK (provenance_kind IN ('human','agent')),
  published_at    TEXT NOT NULL CHECK (
    length(published_at) = 24
    AND published_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', published_at, '+0 seconds') = published_at
  ),
  updated_at      TEXT NOT NULL CHECK (
    length(updated_at) = 24
    AND updated_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 seconds') = updated_at
  ),
  PRIMARY KEY (case_id, issue_tag_id)
);

CREATE INDEX idx_case_issue_tags_issue_tag_id ON case_issue_tags(issue_tag_id);

-- Story 2.5 renders the controlling tag in accent. Two of them would render two
-- accents or an arbitrary one; enforced here rather than left to a repo layer.
CREATE UNIQUE INDEX idx_case_issue_tags_controlling
  ON case_issue_tags(case_id) WHERE is_controlling = 1;

-- ── Join tables ─────────────────────────────────────────────────────────────
-- Many-to-many from the start: a case affects several states, a platform
-- appears in several cases. Stories 2.4–2.7 all depend on this.

CREATE TABLE case_states (
  case_id         TEXT NOT NULL REFERENCES cases(id),
  state_id        TEXT NOT NULL REFERENCES states(id),
  provenance_kind TEXT NOT NULL CHECK (provenance_kind IN ('human','agent')),
  published_at    TEXT NOT NULL CHECK (
    length(published_at) = 24
    AND published_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', published_at, '+0 seconds') = published_at
  ),
  updated_at      TEXT NOT NULL CHECK (
    length(updated_at) = 24
    AND updated_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 seconds') = updated_at
  ),
  PRIMARY KEY (case_id, state_id)
);

CREATE INDEX idx_case_states_state_id ON case_states(state_id);

CREATE TABLE case_entities (
  case_id         TEXT NOT NULL REFERENCES cases(id),
  entity_id       TEXT NOT NULL REFERENCES entities(id),
  role            TEXT NOT NULL CHECK (role IN ('plaintiff','defendant','appellant','appellee','beneficiary','affected','enforcement-target')),
  provenance_kind TEXT NOT NULL CHECK (provenance_kind IN ('human','agent')),
  published_at    TEXT NOT NULL CHECK (
    length(published_at) = 24
    AND published_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', published_at, '+0 seconds') = published_at
  ),
  updated_at      TEXT NOT NULL CHECK (
    length(updated_at) = 24
    AND updated_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 seconds') = updated_at
  ),
  PRIMARY KEY (case_id, entity_id)
);

CREATE INDEX idx_case_entities_entity_id ON case_entities(entity_id);

-- ── Cert signal ─────────────────────────────────────────────────────────────
--
-- Story 2.8: a QUALITATIVE reading on a 5-segment scale, explicitly not a
-- probability and not market-derived. There is deliberately NO numeric score
-- column — adding one later is how a qualitative signal quietly becomes a
-- forecast.
--
-- Singleton by construction. Without the id CHECK, a second row makes "which
-- reading is live?" undefined and Story 2.8 has to guess.

CREATE TABLE cert_signals (
  id              TEXT PRIMARY KEY NOT NULL CHECK (id = 'current'),
  reading         TEXT NOT NULL CHECK (reading IN ('remote','low','elevated','likely','near-certain')),
  factors_json    TEXT NOT NULL CHECK (
    json_valid(factors_json)
    AND json_type(factors_json) = 'array'
    AND json_array_length(factors_json) > 0
  ),
  method_note     TEXT NOT NULL CHECK (length(trim(method_note)) > 0),
  reviewed_at     TEXT NOT NULL CHECK (
    length(reviewed_at) = 10
    AND reviewed_at GLOB '????-??-??'
    AND date(reviewed_at, '+0 days') = reviewed_at
  ),
  approver        TEXT NOT NULL CHECK (length(trim(approver)) > 0),
  provenance_kind TEXT NOT NULL CHECK (provenance_kind IN ('human','agent')),
  published_at    TEXT NOT NULL CHECK (
    length(published_at) = 24
    AND published_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', published_at, '+0 seconds') = published_at
  ),
  updated_at      TEXT NOT NULL CHECK (
    length(updated_at) = 24
    AND updated_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 seconds') = updated_at
  )
);

-- `sources` is intentionally polymorphic, so ordinary foreign keys cannot
-- verify its owner. These triggers make the invariant real for every write.
CREATE TRIGGER trg_sources_owner_insert
BEFORE INSERT ON sources
WHEN
  (NEW.owning_table = 'cases' AND NOT EXISTS (SELECT 1 FROM cases WHERE id = NEW.owning_id))
  OR (NEW.owning_table = 'states' AND NOT EXISTS (SELECT 1 FROM states WHERE id = NEW.owning_id))
  OR (NEW.owning_table = 'circuits' AND NOT EXISTS (SELECT 1 FROM circuits WHERE id = NEW.owning_id))
  OR (NEW.owning_table = 'entities' AND NOT EXISTS (SELECT 1 FROM entities WHERE id = NEW.owning_id))
  OR (NEW.owning_table = 'cert_signals' AND NOT EXISTS (SELECT 1 FROM cert_signals WHERE id = NEW.owning_id))
  OR (NEW.owning_table = 'state_platform_statuses' AND NOT EXISTS (SELECT 1 FROM state_platform_statuses WHERE id = NEW.owning_id))
BEGIN
  SELECT RAISE(ABORT, 'source owner does not exist');
END;

CREATE TRIGGER trg_sources_owner_update
BEFORE UPDATE OF owning_table, owning_id ON sources
WHEN
  (NEW.owning_table = 'cases' AND NOT EXISTS (SELECT 1 FROM cases WHERE id = NEW.owning_id))
  OR (NEW.owning_table = 'states' AND NOT EXISTS (SELECT 1 FROM states WHERE id = NEW.owning_id))
  OR (NEW.owning_table = 'circuits' AND NOT EXISTS (SELECT 1 FROM circuits WHERE id = NEW.owning_id))
  OR (NEW.owning_table = 'entities' AND NOT EXISTS (SELECT 1 FROM entities WHERE id = NEW.owning_id))
  OR (NEW.owning_table = 'cert_signals' AND NOT EXISTS (SELECT 1 FROM cert_signals WHERE id = NEW.owning_id))
  OR (NEW.owning_table = 'state_platform_statuses' AND NOT EXISTS (SELECT 1 FROM state_platform_statuses WHERE id = NEW.owning_id))
BEGIN
  SELECT RAISE(ABORT, 'source owner does not exist');
END;
