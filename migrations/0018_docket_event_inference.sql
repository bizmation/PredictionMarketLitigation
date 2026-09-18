-- Story 3.21 — first live connector: `docket_events` gains the drafter's
-- classification as two nullable columns.
--
-- `kind` is the closed docket-entry vocabulary the LLM classifies into and
-- `favors` names the side the ruling helps (`platform` | `state` | `none`).
-- Both are NULL on every seed row (Patrick curated those by hand, no
-- inference was recorded) and NULL on any connector row whose inference the
-- operator stripped at the gate. The CHECK vocabularies mirror
-- src/shared/schemas/docketInference.ts exactly — the schema module is
-- canonical; this file must change with it.
--
-- ADD COLUMN, not a rebuild: the Tier-1 triggers (0001:279-318) and
-- `idx_docket_events_case_id_occurred_at` stay intact. No `evidence_events`
-- rebuild either — every new payload (`inference`, `statePatch`,
-- `acceptedFields`) rides existing event names.
--
-- NOTE ON TRANSACTIONS: no explicit BEGIN/PRAGMA. Wrangler pre-splits this
-- file into single statements and runs them through one `db.batch()`.

ALTER TABLE docket_events ADD COLUMN kind TEXT CHECK (
  kind IS NULL OR kind IN (
    'filing', 'appearance', 'scheduling', 'motion-filed', 'brief',
    'procedural-order', 'hearing', 'tro-granted', 'tro-denied', 'pi-granted',
    'pi-denied', 'stay-granted', 'stay-denied', 'mtd-granted', 'mtd-denied',
    'sj-granted', 'sj-denied', 'judgment', 'dismissal-with-prejudice',
    'dismissal-without-prejudice', 'voluntary-dismissal', 'opinion-affirmed',
    'opinion-reversed', 'remand', 'mandate', 'notice-of-appeal', 'settlement',
    'other'
  )
);

ALTER TABLE docket_events ADD COLUMN favors TEXT CHECK (
  favors IS NULL OR favors IN ('platform', 'state', 'none')
);
