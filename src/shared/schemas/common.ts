import { z } from "zod";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;

function isRealUtcDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0
): boolean {
  const value = new Date(0);
  value.setUTCFullYear(year, month - 1, day);
  value.setUTCHours(hour, minute, second, millisecond);
  return (
    value.getUTCFullYear() === year &&
    value.getUTCMonth() === month - 1 &&
    value.getUTCDate() === day &&
    value.getUTCHours() === hour &&
    value.getUTCMinutes() === minute &&
    value.getUTCSeconds() === second &&
    value.getUTCMilliseconds() === millisecond
  );
}

/** Canonical `Date#toISOString()` form — real UTC instant with milliseconds. */
export const IsoUtcSchema = z.string().refine((value) => {
  const match = ISO_UTC.exec(value);
  return (
    match !== null &&
    isRealUtcDate(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6]),
      Number(match[7])
    )
  );
}, "Expected a real ISO-8601 UTC timestamp (YYYY-MM-DDTHH:mm:ss.sssZ)");

/** Real calendar date (filed_at, occurred_at, reviewed_at). */
export const IsoDateSchema = z.string().refine((value) => {
  const match = ISO_DATE.exec(value);
  return (
    match !== null &&
    isRealUtcDate(Number(match[1]), Number(match[2]), Number(match[3]))
  );
}, "Expected a real ISO date (YYYY-MM-DD)");

/** D1 INTEGER 0/1 → boolean at the Zod boundary. */
export const BoolIntSchema = z
  .union([z.literal(0), z.literal(1), z.boolean()])
  .transform((v) => v === true || v === 1);
