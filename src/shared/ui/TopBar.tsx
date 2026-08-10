import type { ReactNode } from "react";

/**
 * Sticky top bar — brand plus primary navigation, on all three surfaces.
 *
 * Shared on purpose: the surfaces differ only in brand text and link set, and
 * those are props. A per-surface fork would let the chrome drift, and the
 * cross-surface links are what make governance discoverable from the product
 * (UX-DR7).
 *
 * All classes come from pml.css (Story 1.2) — nothing new is styled here.
 */

export type TopBarLink = {
  href: string;
  label: string;
  /** Leaves this surface — renders the ↗ affordance via `.ext`. */
  external?: boolean;
  /** The section/surface currently being viewed. */
  current?: boolean;
};

type TopBarProps = {
  /** Brand mark. `.brand em` is the accent word; `.brand .sub` the qualifier. */
  brand: ReactNode;
  links: TopBarLink[];
};

export function TopBar({ brand, links }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="wrap">
        <div className="brand">{brand}</div>
        <nav className="topnav" aria-label="Primary">
          {links.map((link, i) => (
            <a
              key={`${link.href}-${i}`}
              href={link.href}
              className={link.external ? "ext" : undefined}
              aria-current={link.current ? "page" : undefined}
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
