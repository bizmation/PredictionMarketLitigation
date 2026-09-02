import type { ReactNode } from "react";
import { EmptyState } from "../../../shared/ui";
import { formatEtDate, formatIsoDate } from "../../../shared/lib/dates";
import type { ApexKpis } from "../../../shared/schemas/kpi";
import type { Development } from "../../../shared/schemas/development";

type MastheadProps = {
  opsHref: string;
  kpis: ApexKpis | null;
  developments: Development[];
  children?: ReactNode;
};

/**
 * H1, bottom line, CTAs, meta, Latest developments.
 * Integers in the bottom line are dropped; the Flaherty deadline matches the seed.
 * KPI row (and later the poll) render as `children` inside the same header.
 */
export function Masthead({
  opsHref,
  kpis,
  developments,
  children
}: MastheadProps) {
  const asOf = kpis ? formatEtDate(kpis.freshness) : null;

  return (
    <div className="wrap">
      <header className="masthead">
        <div className="mast-grid">
          <div>
            <div className="kicker">
              U.S. Federal &amp; State Litigation · Tracker F1
            </div>
            <h1>Where prediction-market litigation actually stands.</h1>
            <p className="bottomline">
              The Third Circuit — still the only federal appellate merits
              holding — says the federal exchange licence wins. District courts
              have gone the other way. Nothing is settled, and the Supreme Court
              has not been asked yet — New Jersey&apos;s certiorari deadline is
              3 September 2026.
            </p>
            <div className="cta">
              <a className="btn btn-primary" href="#states">
                Check a state
              </a>
              <a className="btn btn-secondary" href="#brief">
                What this fight is about
              </a>
              <a className="btn btn-ghost" href={opsHref} rel="noopener">
                See the receipts
              </a>
            </div>
            <dl className="mast-meta">
              <dt>Headline anchor</dt>
              <dd>
                <em>KalshiEX LLC v. Flaherty</em>, 172 F.4th 220 (3d Cir. 2026)
              </dd>
              <dt>Pending drafts</dt>
              <dd>
                <a href={opsHref} rel="noopener">
                  No pending drafts yet — the daily pipeline is not live
                </a>
              </dd>
              <dt>Approval gate</dt>
              <dd>HITL (human in the loop) · Autonomous mode off</dd>
            </dl>
          </div>
          <div className="latest">
            <div className="lh">
              <span className="live">Latest developments</span>
              {asOf ? <span className="num">as of {asOf}</span> : null}
            </div>
            {developments.length === 0 ? (
              <EmptyState
                title="No docket events to show yet"
                hint="The feed lists published docket events, newest first."
              >
                Nothing has loaded from the case record.
              </EmptyState>
            ) : (
              <ul className="feed">
                {developments.map((item) => (
                  <li key={item.id}>
                    <a href={`?case=${encodeURIComponent(item.caseId)}#cases`}>
                      <span className="fd">
                        {formatIsoDate(item.occurredAt)} · {item.court}
                      </span>
                      <span className="ft">{item.description}</span>
                      <span className="fc">{item.caption}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {children}
      </header>
    </div>
  );
}
