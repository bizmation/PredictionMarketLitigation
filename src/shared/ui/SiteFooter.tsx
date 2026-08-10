import type { ReactNode } from "react";

import type { TopBarLink } from "./TopBar";

/**
 * Site footer — the hairline close, carrying the cross-surface links again.
 *
 * Repeated at the bottom because a reader who has scrolled the whole apex
 * long-scroll should not have to scroll back up to find ops.
 */

type SiteFooterProps = {
  /** Left-hand identity line, e.g. "PredictionMarketLitigation · v1". */
  label: ReactNode;
  links?: TopBarLink[];
  /** Optional closing note, pushed to the right. */
  note?: ReactNode;
};

export function SiteFooter({ label, links = [], note }: SiteFooterProps) {
  return (
    <footer className="foot">
      <div className="wrap">
        <span>{label}</span>
        {links.map((link, i) => (
          <a
            key={`${link.href}-${i}`}
            href={link.href}
            className={link.external ? "ext" : undefined}
          >
            {link.label}
          </a>
        ))}
        {note ? <span className="muted">{note}</span> : null}
      </div>
    </footer>
  );
}
