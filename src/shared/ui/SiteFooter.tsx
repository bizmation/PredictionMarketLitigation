import type { ReactNode } from "react";

import type { TopBarLink } from "./TopBar";

/**
 * Site footer — the hairline close, carrying the cross-surface links again.
 *
 * Repeated at the bottom because a reader who has scrolled the whole apex
 * long-scroll should not have to scroll back up to find ops.
 */

export type SiteFooterLink = TopBarLink & {
  /**
   * Story 3.19 — a destination that is not open yet. Renders as non-link
   * text with `role="link" aria-disabled="true"` (the APG disabled-link
   * pattern) and `hint` visible beside the label, so a placeholder never
   * ships as a dead anchor.
   */
  disabled?: boolean;
  hint?: string;
};

type SiteFooterProps = {
  /** Left-hand identity line, e.g. "PredictionMarketLitigation · v1". */
  label: ReactNode;
  links?: SiteFooterLink[];
  /** Optional closing note, pushed to the right. */
  note?: ReactNode;
};

export function SiteFooter({ label, links = [], note }: SiteFooterProps) {
  return (
    <footer className="foot">
      <div className="wrap">
        <span>{label}</span>
        {links.map((link, i) =>
          link.disabled ? (
            /* oxlint-disable jsx-a11y/prefer-tag-over-role -- APG disabled-link pattern; an <a> without href trips anchor-is-valid */
            <span
              key={`${link.href}-${i}`}
              className="foot-soon"
              role="link"
              aria-disabled="true"
            >
              {link.label}
              {link.hint ? <span className="muted"> · {link.hint}</span> : null}
            </span>
          ) : (
            /* oxlint-enable jsx-a11y/prefer-tag-over-role */
            <a
              key={`${link.href}-${i}`}
              href={link.href}
              className={link.external ? "ext" : undefined}
            >
              {link.label}
            </a>
          )
        )}
        {note ? <span className="muted">{note}</span> : null}
      </div>
    </footer>
  );
}
