import type { PollCert, PollTerm } from "../../../shared/schemas/poll";

/**
 * Reader poll view helpers (Story 2.9). Pure — no `window`, no fetch, no
 * localStorage. Term labels are hand-copied so zod stays off the client bundle
 * (same rule as certView.ts's CERT_SCALE).
 */

export const POLL_TERMS: ReadonlyArray<readonly [PollTerm, string]> = [
  ["ot26", "OT 2026"],
  ["ot27", "OT 2027"],
  ["ot28", "OT 2028"],
  ["later", "Later or never"]
];

// Derived, so the labels exist in exactly one hand-maintained place.
const TERM_LABELS: Record<PollTerm, string> = Object.fromEntries(
  POLL_TERMS
) as Record<PollTerm, string>;

export const CERT_LABELS: Record<PollCert, string> = {
  yes: "They grant",
  no: "They deny"
};

export function termLabel(term: PollTerm): string {
  return TERM_LABELS[term];
}

/** Rounded whole percent; 0% for an empty tally (never divide by zero). */
export function percent(n: number, total: number): number {
  return total === 0 ? 0 : Math.round((n / total) * 100);
}

/**
 * Whole percents that sum to exactly 100 (largest remainder). Rounding each
 * row independently can display a 99% or 101% column (e.g. 1/8 + 7/8); bars
 * of one tally should not. Zero rows for an empty tally.
 */
export function percentSplit(counts: readonly number[]): number[] {
  const total = counts.reduce((sum, n) => sum + n, 0);
  if (total === 0) return counts.map(() => 0);
  const raw = counts.map((n) => (n / total) * 100);
  const out = raw.map((value) => Math.floor(value));
  let left = 100 - out.reduce((sum, floor) => sum + floor, 0);
  const byRemainder = raw
    .map((value, index) => [value - Math.floor(value), index] as const)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, index] of byRemainder) {
    if (left <= 0) break;
    out[index]! += 1;
    left -= 1;
  }
  return out;
}

export function formatVoteCount(n: number): string {
  return n.toLocaleString("en-US");
}
