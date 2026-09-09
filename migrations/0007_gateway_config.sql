-- Story 3.2 — AI Gateway, Budget Envelope & Role→Model Config (Epic 3).
--
-- Two concerns: the versioned role→model config (a singleton row, decided) and
-- the per-call spend ledger (`llm_calls`) behind budget accounting. Both are
-- server-internal pipeline plumbing — there is NO public surface here (the
-- Approval Gate owns 3.10, Evidence detail owns 3.8).
--
-- ── ROLE→MODEL CONFIG IS A SINGLETON ────────────────────────────────────────
-- Same singleton-by-construction pattern as cert_signals (0001): the id CHECK
-- makes "which config is live?" undefined rather than ambiguous, and each change
-- bumps `version` in place rather than appending a per-version row — the
-- audited-change record is the version counter plus the caller's evidence event.
-- `roles_json` is a JSON object mapping each admitted gateway role (the four
-- strings from src/shared/schemas/vocabulary.ts #GATEWAY_ROLE_VALUES) to its
-- `{ provider, model }`; the closed value-set lives in the JSON, not in a CHECK,
-- because D1 cannot enumerate the keys of a JSON object — the Zod parse in
-- src/shared/db/repos/roleModelsRepo.ts is what rejects an unknown role key.
--
-- ── MONEY ───────────────────────────────────────────────────────────────────
-- Integer cents + ISO currency code, never float dollars. `default_budget_cents`
-- is the fallback ceiling the gateway enforces when a Run carries no
-- `budget_cents` (Design Notes); NULL here means "no recorded default", which
-- the gateway reads as fail-closed (deny) rather than unlimited.
--
-- ── llm_calls ───────────────────────────────────────────────────────────────
-- One row per completed gateway call: role/provider/model/tokens/spend for
-- Evidence. `cost_cents` is zero-dollar for the Workers AI binding until a paid
-- provider lands, but every call is recorded regardless so budget accounting is
-- real even at zero cost. `tokens_json` is NULL when the provider exposes no
-- usage (Workers AI does not universally), a designed empty state, never a
-- missing-key.
--
-- NOTE ON TRANSACTIONS: no explicit BEGIN/PRAGMA. Wrangler pre-splits this file
-- into single statements and runs them through one db.batch() (0006 note).

CREATE TABLE gateway_config (
  id                  TEXT PRIMARY KEY NOT NULL CHECK (id = 'current'),
  version             INTEGER NOT NULL DEFAULT 0 CHECK (
    version = CAST(version AS INTEGER) AND version >= 0
  ),
  roles_json          TEXT NOT NULL CHECK (
    json_valid(roles_json) AND json_type(roles_json) = 'object'
  ),
  default_budget_cents INTEGER CHECK (
    default_budget_cents IS NULL
    OR (default_budget_cents = CAST(default_budget_cents AS INTEGER)
        AND default_budget_cents >= 0)
  ),
  updated_at          TEXT NOT NULL CHECK (
    length(updated_at) = 24
    AND updated_at GLOB '????-??-??T??:??:??.???Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 seconds') = updated_at
  )
);

CREATE TABLE llm_calls (
  id          TEXT PRIMARY KEY NOT NULL,
  run_id      TEXT NOT NULL REFERENCES runs(id),
  role        TEXT NOT NULL CHECK (role IN ('orchestrator','drafter','reviewer','yolo')),
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

CREATE INDEX idx_llm_calls_run ON llm_calls(run_id);
