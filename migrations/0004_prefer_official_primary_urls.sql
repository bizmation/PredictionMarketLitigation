-- Story 2.1 source hardening after 0003 reached production.
--
-- Prefer official court/agency-hosted copies over RECAP mirrors when the same
-- primary record is publicly reachable. The seed remains an August 9, 2026
-- snapshot, so later merits decisions are deliberately not introduced here.

UPDATE sources
   SET url = 'https://www.cftc.gov/media/14506/OGCMassachusettsAmicusBrief071426/download',
       title = 'CFTC amicus brief — Commonwealth v. KalshiEX LLC, SJC-13906',
       published_at = '2026-07-14'
 WHERE id IN ('src-case-ma-sjc', 'src-cir-1-ma');

UPDATE sources
   SET url = 'https://www.govinfo.gov/content/pkg/USCOURTS-mnd-0_26-cv-02661/pdf/USCOURTS-mnd-0_26-cv-02661-0.pdf',
       title = 'D. Minn. consolidated preliminary-injunction order — United States v. Minnesota',
       published_at = '2026-07-27'
 WHERE id IN ('src-case-mn', 'src-st-mn', 'src-sps-mn-kalshi', 'src-sps-mn-poly', 'src-cir-8-mn');

UPDATE sources
   SET url = 'https://ag.ny.gov/sites/default/files/court-filings/kalshiex-llc-v-new-york-state-gaming-commission-et-al-opinion-and-order-2026.pdf',
       title = 'S.D.N.Y. opinion and order denying Kalshi preliminary relief',
       published_at = '2026-07-07'
 WHERE id IN ('src-case-ny-williams', 'src-st-ny', 'src-cir-2-ny');

UPDATE sources
   SET url = 'https://www.wied.uscourts.gov/sites/wied/files/documents/54%20-%20Order%20Denying%20Motions%2C%20Directing%20R16.pdf',
       title = 'E.D. Wis. Dkt. 54 — order denying motions and directing Rule 16 conference',
       published_at = '2026-07-28'
 WHERE id IN ('src-case-wi', 'src-st-wi', 'src-cir-7-wi');

UPDATE sources
   SET url = 'https://www.govinfo.gov/content/pkg/USCOURTS-azd-2_26-cv-01715/pdf/USCOURTS-azd-2_26-cv-01715-2.pdf',
       title = 'D. Ariz. preliminary-injunction order — consolidated Johnson matter',
       published_at = '2026-05-05'
 WHERE id IN ('src-case-az', 'src-st-az', 'src-sps-az-kalshi');

UPDATE sources
   SET url = 'https://www.govinfo.gov/content/pkg/USCOURTS-tnmd-3_26-cv-00034/pdf/USCOURTS-tnmd-3_26-cv-00034-0.pdf',
       title = 'M.D. Tenn. memorandum granting preliminary injunction — KalshiEX LLC v. Orgel',
       published_at = '2026-02-19'
 WHERE id IN ('src-case-tn', 'src-st-tn', 'src-sps-tn-kalshi');

UPDATE sources
   SET url = 'https://www.govinfo.gov/content/pkg/USCOURTS-utd-2_26-cv-00151/pdf/USCOURTS-utd-2_26-cv-00151-0.pdf',
       title = 'D. Utah decision granting summary judgment to Utah — KalshiEX LLC v. Cox',
       published_at = '2026-08-04'
 WHERE id IN ('src-case-ut', 'src-st-ut', 'src-sps-ut-kalshi', 'src-cir-10-ut');

UPDATE sources
   SET url = 'https://www.gaming.nv.gov/siteassets/content/about/press-release/26-oc-00050-order-granting-pltfs-app-for-ex-parte-tro-march-20-2026.pdf',
       title = 'Nevada First Judicial District Court order granting temporary restraining order',
       published_at = '2026-03-20'
 WHERE id = 'src-case-nv-tro';

UPDATE sources
   SET url = 'https://www.michigan.gov/ag/-/media/Project/Websites/AG/releases/2026/June/KalshiEX-Order-Granting-Temporary-Restraining-Order-06-29-2026.pdf?rev=05d9e0f00cb2439ebd67f2a9d4e0796b&hash=99A6D8C726410D2EF201BCFDFC76C972',
       title = 'Michigan Ingham County order granting temporary restraining order',
       published_at = '2026-06-29'
 WHERE id IN ('src-case-mi', 'src-st-mi');
