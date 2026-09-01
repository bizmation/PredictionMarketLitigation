-- Story 2.1 post-review source-fit corrections.
--
-- 0001 and 0002 were applied remotely on 2026-08-31. Do not rewrite them:
-- this migration corrects records whose attached source was primary in form
-- but did not support the exact owning claim.

-- ── Flaherty: separate the Third Circuit merits opinion from SCOTUS timing ──

UPDATE sources
   SET url = 'https://www2.ca3.uscourts.gov/opinarch/251922p.pdf',
       title = 'Third Circuit merits opinion — KalshiEX LLC v. Flaherty, No. 25-1922',
       published_at = '2026-04-06'
 WHERE id IN ('src-case-flaherty', 'src-cir-3-flaherty', 'src-st-nj', 'src-sps-nj-kalshi');

INSERT INTO sources (id, owning_table, owning_id, url, title, tier, published_at)
VALUES (
  'src-case-flaherty-cert',
  'cases',
  'case-flaherty',
  'https://www.supremecourt.gov/docket/docketfiles/html/public/25A1465.html',
  'Supreme Court docket 25A1465 — extensions of time to petition for certiorari',
  'tier1',
  '2026-07-24'
);

UPDATE docket_events
   SET occurred_at = '2026-07-24',
       description = 'Justice Alito extends New Jersey''s certiorari deadline in No. 25A1465 to September 3, 2026; no petition was shown on the docket in the August 9 seed snapshot.',
       source_id = 'src-case-flaherty-cert',
       updated_at = '2026-08-31T19:07:00.000Z'
 WHERE id = 'de-flaherty-ext';

UPDATE sources
   SET url = 'https://storage.courtlistener.com/recap/gov.uscourts.njd.564738/gov.uscourts.njd.564738.21.0.pdf',
       title = 'D.N.J. opinion granting preliminary injunction — KalshiEX LLC v. Flaherty',
       published_at = '2025-04-28'
 WHERE id = 'src-case-flaherty-dnj';

UPDATE cases
   SET lifecycle = 'active',
       filed_at = NULL,
       decided_at = '2025-04-28',
       updated_at = '2026-08-31T19:07:00.000Z'
 WHERE id = 'case-flaherty-dnj';

-- ── Replace records attached to the wrong matter ───────────────────────────

UPDATE sources
   SET url = 'https://www.cftc.gov/media/13626/EnfNedLamontComplaint040226/download',
       title = 'CFTC complaint — United States v. Connecticut',
       published_at = '2026-04-02'
 WHERE id = 'src-st-ct';

UPDATE sources
   SET url = 'https://storage.courtlistener.com/recap/gov.uscourts.azd.1483385/gov.uscourts.azd.1483385.96.0.pdf',
       title = 'D. Ariz. order granting the CFTC preliminary injunction — consolidated Johnson matter',
       published_at = '2026-05-05'
 WHERE id IN ('src-case-az', 'src-st-az', 'src-sps-az-kalshi');

-- The existing Nevada AG source supports the June preliminary injunction.
-- A separate NGCB record supports the March TRO docket event.
INSERT INTO sources (id, owning_table, owning_id, url, title, tier, published_at)
VALUES (
  'src-case-nv-tro',
  'cases',
  'case-nv-kalshi-state',
  'https://www.gaming.nv.gov/siteassets/content/about/press-release/ngcb-granted-tro-against-kalshi.pdf',
  'Nevada Gaming Control Board — temporary restraining order against Kalshi',
  'tier1',
  '2026-03-20'
);

UPDATE docket_events
   SET description = 'Nevada First Judicial District Court issues a temporary restraining order against KalshiEX concerning covered event-contract offerings.',
       source_id = 'src-case-nv-tro',
       updated_at = '2026-08-31T19:07:00.000Z'
 WHERE id = 'de-nv-tro';

-- ── Add docket records where a complaint alone did not prove active status ─

INSERT INTO sources (id, owning_table, owning_id, url, title, tier, published_at)
VALUES
  (
    'src-case-il-docket',
    'cases',
    'case-il-cftc',
    'https://www.courtlistener.com/docket/73133459/united-states-of-america-v-state-of-illinois/',
    'RECAP docket — United States of America v. State of Illinois',
    'tier1',
    '2026-04-02'
  ),
  (
    'src-case-ny-cftc-docket',
    'cases',
    'case-ny-cftc',
    'https://www.courtlistener.com/docket/73242633/united-states-of-america-v-state-of-new-york/',
    'RECAP docket — United States of America v. State of New York',
    'tier1',
    '2026-04-24'
  ),
  (
    'src-case-ri-docket',
    'cases',
    'case-ri-furcolo',
    'https://www.courtlistener.com/docket/73375343/kalshiex-llc-v-mark-furcolo/',
    'RECAP docket — KalshiEX LLC v. Furcolo',
    'tier1',
    '2026-05-21'
  ),
  (
    'src-cir-9-az',
    'circuits',
    'cir-9',
    'https://www.courtlistener.com/docket/73324497/kalshiex-llc-et-al-v-johnson-et-al/',
    'RECAP Ninth Circuit docket 26-2978 — Arizona preliminary-injunction appeal',
    'tier1',
    '2026-05-11'
  );

UPDATE cases
   SET filed_at = '2025-11-28',
       updated_at = '2026-08-31T19:07:00.000Z'
 WHERE id = 'case-nv-assad-9th';

-- Official calendars prove scheduling, not that argument occurred. Keep the
-- fixed August 9 snapshot explicit and do not turn a calendar into an outcome.
UPDATE circuits
   SET summary = 'The official Sixth Circuit calendar listed the consolidated Ohio (Schuler) and Tennessee (Orgel) appeals for July 30, 2026; the August 9 seed snapshot contains no Sixth Circuit merits holding.',
       updated_at = '2026-08-31T19:07:00.000Z'
 WHERE id = 'cir-6';

UPDATE circuits
   SET summary = 'The August 9 seed snapshot tracks the consolidated Nevada appeals and the related Arizona preliminary-injunction appeal; it contains no Ninth Circuit merits holding on the sports-swap question.',
       updated_at = '2026-08-31T19:07:00.000Z'
 WHERE id = 'cir-9';

UPDATE sources
   SET url = 'https://www.cftc.gov/media/13771/ENFAmicusMassachusettsReview042426/download',
       title = 'CFTC amicus brief — Commonwealth v. KalshiEX LLC, SJC-13906',
       published_at = '2026-04-24'
 WHERE id IN ('src-case-ma-sjc', 'src-cir-1-ma');

-- ── Do not infer actual platform availability from legal posture alone ─────

UPDATE states
   SET operational_status = 'unknown',
       operational_status_basis = 'inferred',
       why_note = 'United States v. Illinois (N.D. Ill. No. 1:26-cv-03659) remained pending in the August 9 snapshot. The retained primary records establish the litigation and Illinois enforcement position, but not a current platform-access determination.',
       updated_at = '2026-08-31T19:07:00.000Z'
 WHERE id = 'st-il';

DELETE FROM sources
 WHERE owning_table = 'state_platform_statuses'
   AND owning_id IN ('sps-il-kalshi', 'sps-il-poly');

DELETE FROM state_platform_statuses
 WHERE id IN ('sps-il-kalshi', 'sps-il-poly');

UPDATE states
   SET operational_status = 'unknown',
       operational_status_basis = 'inferred',
       why_note = 'The D. Md. preliminary-injunction denial in KalshiEX LLC v. Martin supports the state-side legal posture. The retained primary records do not establish current platform availability.',
       updated_at = '2026-08-31T19:07:00.000Z'
 WHERE id = 'st-md';

UPDATE states
   SET operational_status = 'unknown',
       operational_status_basis = 'inferred',
       why_note = 'The S.D.N.Y. denied Kalshi preliminary relief in Williams. The retained primary records support that legal posture, but not current statewide platform availability.',
       updated_at = '2026-08-31T19:07:00.000Z'
 WHERE id = 'st-ny';

UPDATE states
   SET operational_status = 'unknown',
       operational_status_basis = 'inferred',
       why_note = 'The S.D. Ohio preliminary-injunction denial in Schuler supports the state-side legal posture. The retained primary records do not establish current platform availability.',
       updated_at = '2026-08-31T19:07:00.000Z'
 WHERE id = 'st-oh';

UPDATE states
   SET operational_status = 'unknown',
       operational_status_basis = 'inferred',
       why_note = 'The D. Utah summary-judgment decision in Cox rejects the asserted preemption theories. The retained primary records do not establish current platform availability.',
       updated_at = '2026-08-31T19:07:00.000Z'
 WHERE id = 'st-ut';

UPDATE states
   SET operational_status = 'unknown',
       operational_status_basis = 'inferred',
       why_note = 'The King County court granted preliminary relief in principle on July 20, 2026, but the operative terms were not final in the August 9 seed snapshot. No current platform-access determination is published.',
       updated_at = '2026-08-31T19:07:00.000Z'
 WHERE id = 'st-wa';

UPDATE states
   SET operational_status = 'unknown',
       operational_status_basis = 'inferred',
       why_note = 'The E.D. Wis. order denied the CFTC preliminary-injunction motion and supports the state-side legal posture. The retained primary records do not establish current platform availability.',
       updated_at = '2026-08-31T19:07:00.000Z'
 WHERE id = 'st-wi';

UPDATE state_platform_statuses
   SET operational_status = 'unknown',
       operational_status_basis = 'inferred',
       note = 'The Nevada Attorney General reported voluntary cessation of the covered offerings; the retained record does not establish that Robinhood was legally enjoined.',
       updated_at = '2026-08-31T19:07:00.000Z'
 WHERE id = 'sps-nv-rh';

UPDATE state_platform_statuses
   SET operational_status = 'unknown',
       operational_status_basis = 'inferred',
       note = 'The Nevada Attorney General reported voluntary cessation of the covered offerings; the retained record does not establish that Crypto.com or NADEX was legally enjoined.',
       updated_at = '2026-08-31T19:07:00.000Z'
 WHERE id = 'sps-nv-nadex';

UPDATE state_platform_statuses
   SET operational_status = 'unknown',
       operational_status_basis = 'inferred',
       note = 'The D. Utah decision supports the state-side legal posture but does not establish current Kalshi availability in Utah.',
       updated_at = '2026-08-31T19:07:00.000Z'
 WHERE id = 'sps-ut-kalshi';

UPDATE state_platform_statuses
   SET operational_status = 'unknown',
       operational_status_basis = 'inferred',
       note = 'Preliminary relief was granted in principle, but operative terms were not final in the August 9 seed snapshot; current Kalshi availability is not published.',
       updated_at = '2026-08-31T19:07:00.000Z'
 WHERE id = 'sps-wa-kalshi';
