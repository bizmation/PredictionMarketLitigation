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

export type Posture = "untracked" | "platform" | "pending" | "state" | "banned";

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
