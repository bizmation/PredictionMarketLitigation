/**
 * Date formatting for reader-facing surfaces.
 *
 * On the wire and in D1, timestamps are ISO 8601 UTC with `Z`
 * (architecture #Format-Patterns). Presentation is Eastern Time, because the
 * daily Run is scheduled at noon ET and every published timestamp a reader
 * compares against it should be in the same clock.
 *
 * "ET" is used as the label in both EDT and EST — the offset is handled by the
 * IANA zone, and the reader does not need to track which half of the year it is.
 */

const ET_ZONE = "America/New_York";

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: ET_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

const DATE_ONLY = new Intl.DateTimeFormat("en-GB", {
  timeZone: ET_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric"
});

const INVALID_DATE_LABEL = "Unknown date";

/** `2026-08-09T10:12:00.000Z` → `9 Aug 2026, 06:12 ET` */
export function formatEtDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return INVALID_DATE_LABEL;
  return `${DATE_TIME.format(date)} ET`;
}

/** `2026-08-09T10:12:00.000Z` → `9 Aug 2026` */
export function formatEtDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return INVALID_DATE_LABEL;
  return DATE_ONLY.format(date);
}

/**
 * Date-only ISO (`YYYY-MM-DD`) → ET calendar label without a TZ shift.
 * `new Date("YYYY-MM-DD")` is UTC midnight, which is the previous day in ET.
 */
export function formatIsoDate(isoDate: string): string {
  return formatEtDate(`${isoDate}T12:00:00.000Z`);
}
