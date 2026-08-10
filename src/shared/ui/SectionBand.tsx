import type { ReactNode } from "react";

/**
 * A page band — the long-scroll section unit used on every surface.
 *
 * Numbered kicker, title, and a right-aligned "why" line that tells the reader
 * what question this band answers. The `.sec-head` grid collapses to one column
 * at 940px and the why-line left-aligns (UX-DR22) — handled entirely by
 * pml.css, so nothing here needs a media query.
 *
 * The `id` is the in-page anchor the top nav links to.
 */

type SectionBandProps = {
  id?: string;
  /** Two-digit index, e.g. "04". Set tabular by `.kicker`. */
  kicker: string;
  title: string;
  /** What question this band answers for the reader. */
  why: string;
  children: ReactNode;
};

export function SectionBand({
  id,
  kicker,
  title,
  why,
  children
}: SectionBandProps) {
  return (
    <section className="band" id={id}>
      <div className="wrap">
        <div className="sec-head">
          <div>
            <div className="kicker">{kicker}</div>
            <h2>{title}</h2>
          </div>
          <p className="why">{why}</p>
        </div>
        {children}
      </div>
    </section>
  );
}
