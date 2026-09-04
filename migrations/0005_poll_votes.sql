-- Story 2.9 — reader cert poll vote tally (FR44 / UX-DR13).
--
-- The unscientific reader poll. One row per voter token (an HttpOnly cookie set
-- on the first vote), NOT per browser fingerprint and NOT per IP. There is
-- deliberately no IP column, no score, and no FK to cert_signals — the poll is
-- a separate, qualitative-adjacent engagement surface that must never leak back
-- into the qualitative cert gauge.
--
-- `cert` is the primary vote and is first-write-wins; `term` is the optional
-- secondary pick and is also first-write-wins. Both hold PRD glossary strings
-- verbatim, matching src/shared/schemas/vocabulary.ts (POLL_CERT_VALUES /
-- POLL_TERM_VALUES), because Zod is never in the SQL write path.
--
-- NOT IN THIS MIGRATION: donations / correction submissions (Story 4.5), which
-- are separate stories and separate tables.

CREATE TABLE poll_votes (
  id          TEXT PRIMARY KEY NOT NULL,
  voter_token TEXT NOT NULL UNIQUE,
  cert        TEXT NOT NULL CHECK (cert IN ('yes','no')),
  term        TEXT CHECK (term IS NULL OR term IN ('ot26','ot27','ot28','later')),
  created_at  TEXT NOT NULL CHECK (
    length(created_at) = 24
    AND created_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 seconds') = created_at
  ),
  updated_at  TEXT NOT NULL CHECK (
    length(updated_at) = 24
    AND updated_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 seconds') = updated_at
  )
);

CREATE INDEX idx_poll_votes_cert ON poll_votes(cert);
CREATE INDEX idx_poll_votes_term ON poll_votes(term);
