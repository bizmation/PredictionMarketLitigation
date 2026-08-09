import type { ReactNode } from "react";

/**
 * Warn chip — the not-legal-advice affordance that rides in the trust bar and
 * anywhere a reader might mistake tracked litigation for counsel.
 *
 * This is product UI, not footer chrome (FR/UX thesis): it sits in the bar at
 * the top of the page, not buried at the bottom.
 *
 * The leading glyph is decorative — the words carry the meaning, so it is
 * hidden from assistive technology rather than announced as "warning sign".
 */

type WarnChipProps = {
  children?: ReactNode;
};

export function WarnChip({
  children = "General legal information — not legal advice"
}: WarnChipProps) {
  return (
    <span className="warn">
      <span aria-hidden="true">⚠</span>
      {children}
    </span>
  );
}
