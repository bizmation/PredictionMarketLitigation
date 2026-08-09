import type { ReactNode } from "react";

/**
 * Not-live draft wrapper — the single most load-bearing state in the product.
 *
 * UX-DR5: a pending Draft must be visually impossible to confuse with published
 * tracker content. The diagonal ticket edge (.draft::before) and the explicit
 * words carry it together — colour alone would fail for a reader who cannot see
 * it, and the whole trust thesis collapses if a proposal reads as a finding.
 *
 * The banner text is fixed on purpose. Do not soften it, shorten it, or make it
 * a prop: every pending-draft surface on ops. and in the admin queue says the
 * same six words.
 */

export const NOT_LIVE_LABEL = "Not live · awaiting approval";

type NotLiveDraftBannerProps = {
  /** The draft body — full text, proposed diffs, flags, evidence links. */
  children: ReactNode;
  /** Optional context beside the label, e.g. "proposed 9 Aug 2026, 06:12 ET". */
  meta?: ReactNode;
};

export function NotLiveDraftBanner({
  children,
  meta
}: NotLiveDraftBannerProps) {
  return (
    <div className="draft">
      <div className="draftbanner">
        <strong>{NOT_LIVE_LABEL}</strong>
        {meta}
      </div>
      {children}
    </div>
  );
}
