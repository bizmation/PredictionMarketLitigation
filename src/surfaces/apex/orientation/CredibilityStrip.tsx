const REPO_URL = "https://github.com/bizmation/PredictionMarketLitigation";

type CredibilityStripProps = {
  opsHref: string;
};

/**
 * Numbered claims + founder card + repo, with links to the public governance record.
 */
export function CredibilityStrip({ opsHref }: CredibilityStripProps) {
  return (
    <div className="about">
      <div className="wrap">
        <span className="lbl">
          About
          <br />
          this page
        </span>
        <div className="goal">
          <i aria-hidden="true">1</i>
          <div>
            <b>Sourced from the case record</b>
            <span>
              A record of U.S. prediction-market litigation — posture,
              operational status and a primary source for every tracked state.
              Claims here are curated from the case record, not written once and
              left to age.
            </span>
          </div>
        </div>
        <div className="goal">
          <i aria-hidden="true">2</i>
          <div>
            <b>Open-source governance, in public</b>
            <span>
              Built in the open and mapped to the nine-layer AI governance
              framework. The governance record lives on{" "}
              <a href={opsHref} rel="noopener">
                ops.
              </a>{" "}
              This page is the sourced seed; proposed changes appear on ops.,
              labelled not live.
            </span>
          </div>
        </div>
        <div className="founder">
          <div>
            <span className="lbl">Founder</span>
            <div className="name">Patrick Bland</div>
            <div className="role">Practising attorney &amp; CTO</div>
          </div>
          <span className="plate" aria-hidden="true">
            <span className="lettermark">PB</span>
          </span>
        </div>
        <div className="gh">
          <a
            className="btn btn-secondary"
            href={REPO_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            Source on GitHub ↗
          </a>
          <a href={`${opsHref}#layers`}>The nine layers ↗</a>
        </div>
      </div>
    </div>
  );
}
