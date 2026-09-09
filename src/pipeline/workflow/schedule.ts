import { RUN_SCHEDULE_TIMEZONE } from "../../shared/schemas/vocabulary";

/**
 * Story 3.3 — scheduling-time computation for the daily Run.
 *
 * The cron rule is dual-UTC crons + an ET-hour guard: Wrangler fires
 * `0 16 * * *` and `0 17 * * *` (noon ET is 16:00Z under EDT or 17:00Z under
 * EST). The harness acts only when the current `America/New_York` hour equals
 * the configured run hour (noon ET). This module owns the parts that are NOT
 * the cron expression itself: the ET-hour guard, the ET calendar date for
 * `scheduled_for`, and the next-run instant (FR27 computation; storage is 3.7).
 */

/** The daily run hour, in the run timezone (America/New_York). */
export const RUN_HOUR_ET = 12;

const zoneParts = (now: Date, extra: Intl.DateTimeFormatOptions = {}) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: RUN_SCHEDULE_TIMEZONE,
    hourCycle: "h23",
    ...extra
  }).formatToParts(now);

const part = (parts: Intl.DateTimeFormatPart[], type: string): number =>
  Number(parts.find((p) => p.type === type)?.value ?? 0);

/** Whether the given instant is in the noon-ET hour in the run timezone. */
export function isRunTime(now: Date = new Date()): boolean {
  const hour = part(zoneParts(now, { hour: "numeric" }), "hour");
  return hour === RUN_HOUR_ET;
}

/** `YYYY-MM-DD` calendar date in America/New_York at the given instant. */
export function etCalendarDate(now: Date = new Date()): string {
  const parts = zoneParts(now, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

/** Offset (ms) of the run timezone from UTC at the given instant. */
export function timezoneOffsetMs(now: Date = new Date()): number {
  const parts = zoneParts(now, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const asUtcMs = Date.UTC(
    part(parts, "year"),
    part(parts, "month") - 1,
    part(parts, "day"),
    part(parts, "hour"),
    part(parts, "minute"),
    part(parts, "second")
  );
  return asUtcMs - now.getTime();
}

/**
 * The next noon-ET instant strictly after `now`, as an ISO-8601 UTC string.
 * DST-correct by construction: derive "now" as ET wall-clock time via the zone
 * offset, snap to the current wall-clock day, place noon, then advance a day
 * when noon has already passed. The final UTC instant is wall-clock noon minus
 * the (DST-aware) zone offset.
 */
export function nextRunAtUtc(now: Date = new Date()): string {
  const oneDay = 86_400_000;
  const hour = 3_600_000;
  const offset = timezoneOffsetMs(now);
  const wall = now.getTime() + offset;
  const wallDayStart = wall - (((wall % oneDay) + oneDay) % oneDay);
  let noonWall = wallDayStart + RUN_HOUR_ET * hour;
  if (noonWall <= wall) noonWall += oneDay;
  const noonOffset = timezoneOffsetMs(new Date(noonWall - offset));
  return new Date(noonWall - noonOffset).toISOString();
}
