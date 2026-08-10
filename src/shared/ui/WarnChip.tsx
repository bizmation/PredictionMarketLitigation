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

const DEFAULT_DISCLAIMER = "General legal information — not legal advice";

export function WarnChip({ children }: WarnChipProps) {
  // A default parameter only catches `undefined` — explicit `null` or `""`
  // would otherwise blank the mandatory legal disclaimer.
  const content =
    children == null || children === "" ? DEFAULT_DISCLAIMER : children;

  return (
    <span className="warn">
      <span aria-hidden="true">⚠</span>
      {content}
    </span>
  );
}
