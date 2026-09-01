import type { ApexKpis } from "../../../shared/schemas/kpi";

type ExecutiveBriefProps = {
  kpis: ApexKpis | null;
};

/**
 * Plain-language explainer for non-lawyers. Docket statistics are interpolated
 * from the KPI payload so they cannot contradict the row above.
 */
export function ExecutiveBrief({ kpis }: ExecutiveBriefProps) {
  const moved =
    kpis === null
      ? "The KPI row shows how many tracked states were updated in the published window."
      : `${kpis.changedIn30Days} of the ${kpis.statesTracked} tracked states were updated in the published window.`;
  const appeals =
    kpis === null
      ? null
      : `${kpis.appealsPending} ${kpis.appealsPending === 1 ? "appeal is" : "appeals are"} pending.`;

  return (
    <>
      <div className="explain">
        <div>
          <p className="q">
            A federally licensed exchange now sells contracts on who wins
            Sunday&apos;s game. Forty-eight states call that a bet. Congress
            never said which one is right.
          </p>
          <h3>What a prediction market is</h3>
          <p>
            You buy a contract that pays out if a stated event happens — a
            candidate wins, inflation lands above a number, a team covers.
            Kalshi, Polymarket US, Crypto.com and Robinhood Derivatives run
            these as federally regulated exchanges, licensed by the Commodity
            Futures Trading Commission the same way a soybean futures market is
            licensed.
          </p>
          <h3>What changed</h3>
          <ul className="blist">
            <li>
              <strong>The contracts moved to sports.</strong> For most of their
              history these markets tracked economic events, and nobody
              objected. In early 2025 the platforms began listing contracts on
              sporting events.
            </li>
            <li>
              <strong>Gaming regulators saw a sportsbook.</strong> A contract
              that pays out when the Titans win is a sports bet under any state
              definition — and sports betting is licensed, taxed and policed
              state by state.
            </li>
            <li>
              <strong>Nobody can point to a statute that resolves it.</strong>{" "}
              The state laws predate the federal one by a century, and the
              federal one never mentions sports.
            </li>
          </ul>
          <h3>The legal question, in one sentence</h3>
          <p>
            The Commodity Exchange Act gives the CFTC “exclusive jurisdiction”
            over swaps and futures traded on federally licensed exchanges.
          </p>
          <ul className="blist">
            <li>
              <strong>The platforms say</strong> that language preempts state
              gambling law: if the CFTC licensed the market, no state may shut
              it down.
            </li>
            <li>
              <strong>The states say</strong> Congress wrote that statute to
              regulate financial derivatives after the 2008 crisis, not to strip
              states of a police power they have held for a century — and that a
              bet on a football game is not a swap in any meaningful sense.
            </li>
          </ul>
        </div>
        <div>
          <h3>How the states are enforcing</h3>
          <p>
            By every tool they have, often several at once in the same state.
          </p>
          <ul className="blist">
            <li>
              <strong>Cease-and-desist orders.</strong> Gaming boards order the
              platforms to stop, on penalty of unlicensed-gaming charges.
            </li>
            <li>
              <strong>State-court suits.</strong> Attorneys general sue at home,
              where platforms have repeatedly failed to move the case into
              federal court.
            </li>
            <li>
              <strong>Criminal charges.</strong> Arizona filed twenty
              misdemeanor counts — the first criminal prosecution of a
              CFTC-registered operator.
            </li>
            <li>
              <strong>Statutes and taxes.</strong> Minnesota passed an outright
              ban; Kentucky wrote a 14.25% excise tax and barred licensed
              sportsbooks from dealing with the platforms.
            </li>
            <li>
              <strong>Tribal claims.</strong> Tribes have sued under the Indian
              Gaming Regulatory Act, arguing the contracts cut into exclusivity
              they paid for.
            </li>
            <li>
              <strong>And the federal government pushing back.</strong> Since
              April 2026 the CFTC has sued states in its own name.
            </li>
          </ul>
          <h3>Why this tracker exists</h3>
          <ul className="blist">
            <li>
              <strong>The answer depends on the courthouse.</strong> One
              appellate ruling says preempted; final judgments and denials in
              several districts say otherwise.
            </li>
            <li>
              <strong>The published window moved.</strong> {moved}
            </li>
            <li>
              <strong>Compliance needs the order, not the headline.</strong>{" "}
              Each tracked status in the seed is sourced to a primary ruling;
              the state board that will surface those links is not wired yet.
            </li>
          </ul>
        </div>
      </div>

      <div className="tl">
        <div>
          <div className="yr">2023–24</div>
          <p>
            Kalshi beats the CFTC over election contracts in federal court. The
            agency drops its appeal. Election markets go live.
          </p>
        </div>
        <div>
          <div className="yr">Early 2025</div>
          <p>
            Sports event contracts launch. Nevada, then a wave of other gaming
            regulators, issue cease-and-desist orders.
          </p>
        </div>
        <div>
          <div className="yr">Late 2025</div>
          <p>
            Maryland becomes the first federal court to side with a state.
            Nevada dissolves its own earlier injunction: these are not swaps.
          </p>
        </div>
        <div>
          <div className="yr">Apr 2026</div>
          <p>
            The Third Circuit rules for Kalshi in <em>Flaherty</em> — still the
            only federal appellate decision on the merits.
          </p>
        </div>
        <div>
          <div className="yr">Spring 2026</div>
          <p>
            The CFTC starts suing states. Arizona charges Kalshi criminally.
            Minnesota bans prediction markets outright.
          </p>
        </div>
        <div>
          <div className="yr">Summer 2026</div>
          <p>
            Utah enters final judgment for the state; New York and Wisconsin
            deny relief; Minnesota&apos;s ban is enjoined.
            {appeals ? ` ${appeals}` : ""}
          </p>
        </div>
      </div>
    </>
  );
}
