import { RUN_SCHEDULE_TIMEZONE } from "../../shared/schemas/vocabulary";

/**
 * Story 3.3 — scheduling-time computation for the daily Run.
 *
 * The cron rule (decided) is dual-UTC crons + an ET-hour guard: crons fire
 * every hour on the hour, and the harness acts only when the current
 * `America/New_York` hour equals the configured run hour (noon ET). This
 * module owns the parts that are NOT the cron expression itself: deriving the
 * next run instant (FR27 storage) and the run-hour/timezone constants.
 */

/** The daily run hour, in the run timezone (America/New_York). */
export const RUN_HOUR_ET = 12;

/** Whether the given instant is at/after the run hour in the run timezone. */
export function isRunTime(now: Date = new Date()): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: RUN_SCHEDULE_TIMEZONE,
      hour: "numeric",
      hour12: false
    }).format(now)
  );
  return hour === RUN_HOUR_ET;
}

/** Offset (ms) of the run timezone from UTC at the given instant. */
export function timezoneOffsetMs(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: RUN_SCHEDULE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(now);
  const get = (t: string) =>
    Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtcMs = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
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
