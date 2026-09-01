import type { Posture } from "../../../shared/schemas/vocabulary";

/**
 * Reader-facing circuit numerals from the seed `number` column — not seed ids.
 * 2d/3d follow the courts' own abbreviation, not "2nd"/"3rd".
 */
export function circuitShortLabel(circuit: {
  id: string;
  number: number | null;
}): string {
  if (circuit.number === 1) return "1st";
  if (circuit.number === 2) return "2d";
  if (circuit.number === 3) return "3d";
  if (circuit.number !== null) return `${circuit.number}th`;
  if (circuit.id === "cir-dc") return "D.C.";
  if (circuit.id === "cir-fed") return "Fed.";
  return circuit.id;
}

export const POSTURE_RAMP: readonly Posture[] = [
  "untracked",
  "platform",
  "pending",
  "state",
  "banned"
];

/** Identity hues keyed to seed ids. Fed. uses the neutral stroke, not a hue. */
const CIRC_HUE: Record<string, number> = {
  "cir-1": 28,
  "cir-2": 55,
  "cir-3": 82,
  "cir-4": 128,
  "cir-5": 160,
  "cir-6": 195,
  "cir-7": 235,
  "cir-8": 268,
  "cir-9": 300,
  "cir-10": 335,
  "cir-11": 8,
  "cir-dc": 66,
  "cir-fed": 0
};

export function circStroke(circuitId: string): string {
  if (circuitId === "cir-fed") return "var(--color-neutral-700)";
  const hue = CIRC_HUE[circuitId];
  return `oklch(0.48 0.13 ${hue != null ? hue : 82})`;
}

export function maxUpdatedAt(
  rows: ReadonlyArray<{ updatedAt: string }>
): string | null {
  let max: string | null = null;
  for (const row of rows) {
    if (!max || row.updatedAt > max) max = row.updatedAt;
  }
  return max;
}
