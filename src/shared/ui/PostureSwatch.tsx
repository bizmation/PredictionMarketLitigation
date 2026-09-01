/**
 * Posture ramp — one axis, five steps, darker = worse for platforms.
 *
 * UX-DR2: the fill NEVER travels alone. Every swatch ships paired with its
 * label, because a colour a reader has to decode is not evidence. `untracked`
 * is near-white with a dashed edge for the same reason — absence of a finding
 * must not read as a neutral finding.
 *
 * Renders as a fragment (swatch + label) with no wrapper element, so callers
 * own the layout — the ramp appears inside table cells, map legends, circuit
 * rows and case metadata lines, each with its own spacing.
 */

// The values live in shared/schemas/vocabulary.ts, which is canonical for the
// D1 column, the JSON on the wire, and the CSS class below (architecture
// #Enforcement-Guidelines). Story 2.1 moved them there; this file used to
// declare its own union, and two definitions that can drift is a data bug
// waiting for the first migration.
//
// `import type` is deliberate: it is erased at build, so the schema module's
// zod dependency never reaches the client bundle.
import type { Posture } from "../schemas/vocabulary";

export type { Posture };

/**
 * Reader-facing copy for each step. Keyed by the canonical enum, so adding a
 * posture without adding its label is a type error rather than a rendered
 * `undefined` — see vocabulary.test.ts, which pins the membership.
 */
export const POSTURE_LABELS: Record<Posture, string> = {
  untracked: "No tracked activity",
  platform: "Decided for platform",
  pending: "Pending — skeptical",
  state: "Decided for state",
  banned: "Banned"
};

type PostureSwatchProps = {
  /**
   * Escape hatch — drop the visible label ONLY when the calling context
   * already gives the posture an accessible name elsewhere (e.g. a map
   * region whose own `aria-label` already reads "New Jersey, pending —
   * skeptical"). The swatch then renders `aria-hidden` and is purely
   * decorative.
   *
   * Contract: the caller MUST supply that accessible name on an ancestor
   * element. If nothing does, the posture becomes an unlabelled colour —
   * exactly what UX-DR2 forbids ("the fill NEVER travels alone"). There is
   * no call site yet; this exists for Epic 2's map/circuit-split work.
   * Anywhere else, leave `showLabel` at its default.
   */
  showLabel?: boolean;
  posture: Posture;
};

export function PostureSwatch({
  posture,
  showLabel = true
}: PostureSwatchProps) {
  if (!showLabel) {
    return <span className={`sw ${posture}`} aria-hidden="true" />;
  }

  return (
    <>
      <span className={`sw ${posture}`} aria-hidden="true" />{" "}
      {POSTURE_LABELS[posture]}
    </>
  );
}
