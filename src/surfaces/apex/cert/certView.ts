import type { CertReading } from "../../../shared/schemas/vocabulary";

/**
 * Qualitative scale — same order as `CERT_READING_VALUES`. Duplicated here so
 * the client bundle does not pull zod from vocabulary.ts.
 */
export const CERT_SCALE = [
  "remote",
  "low",
  "elevated",
  "likely",
  "near-certain"
] as const satisfies readonly CertReading[];

const READING_LABELS: Record<CertReading, string> = {
  remote: "Remote",
  low: "Low",
  elevated: "Elevated",
  likely: "Likely",
  "near-certain": "Near-certain"
};

export function readingLabel(reading: CertReading): string {
  return READING_LABELS[reading];
}

/** Filled segments on the five-step scale. Callers pass a validated reading. */
export function scaleFilledCount(reading: CertReading): number {
  return CERT_SCALE.indexOf(reading) + 1;
}
