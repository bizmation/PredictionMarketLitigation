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
   * Drop the visible label ONLY where the surrounding element already names the
   * posture to assistive technology — a map region whose aria-label reads
   * "New Jersey, pending — skeptical", say. The swatch is then purely
   * decorative and is hidden, so the posture is never announced twice and never
   * left as an unlabelled colour. Anywhere else, keep the label.
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
