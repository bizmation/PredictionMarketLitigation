import { surfaceHref } from "../../shared/lib/surface";
import {
  LastUpdated,
  ProvenanceLabel,
  SectionBand,
  SiteFooter,
  TopBar,
  TrustBar,
  WarnChip,
  type TopBarLink
} from "../../shared/ui";
import { ApexF1Provider } from "./ApexF1Context";
import { CaseBoard } from "./cases/CaseBoard";
import { CertBoard } from "./cert/CertBoard";
import { CircuitSplit } from "./circuits/CircuitSplit";
import { EntityBoard } from "./entities/EntityBoard";
import { IssueBoard } from "./issues/IssueBoard";
import { CredibilityStrip } from "./orientation/CredibilityStrip";
import { ExecutiveBrief } from "./orientation/ExecutiveBrief";
import { KpiRow } from "./orientation/KpiRow";
import { Masthead } from "./orientation/Masthead";
import { useOrientation } from "./orientation/useOrientation";
import { StateBoard } from "./states/StateBoard";
import { PollPanel } from "./poll/PollPanel";

/**
 * Apex — the litigation intelligence tracker.
 *
 * v1 apex is ONE long-scroll page, not per-state or per-case routes: the
 * section order below is the handoff's, and selection deep-links via URL params
 * in Epic 2. [Source: architecture.md#Frontend-routing-clarification]
 *
 * IA boundary (AC6): the nine-layer explainer and the canonical build journal
 * live on ops. ONLY. Apex links to ops.; it never hosts them. The tracker is
 * the product and the governance record is the receipt — collapsing them would
 * dissolve the separation the whole two-site split exists to make.
 *
 * Every apex band is wired as of Story 2.10 — the last EmptyState is gone.
 * Until a band's owning story wires it, it renders an honest EmptyState
 * naming that story, never a plausible-looking mock a reader could mistake
 * for a finding.
 */

const REPO_URL = "https://github.com/bizmation/PredictionMarketLitigation";

// FR39 — donations at launch. The real target is an open question (see the
// story's Open Question 1); this is a clearly-marked placeholder, not a live
// Ko-fi / Buy Me a Coffee / GitHub Sponsors URL.
const DONATE_URL = "#coffee";

type ApexShellProps = {
  /** True in local development — routes cross-surface links via ?surface=. */
  dev?: boolean;
};

export function ApexShell({ dev = false }: ApexShellProps) {
  const opsHref = surfaceHref("ops", { dev });
  const { kpis, developments } = useOrientation();

  const links: TopBarLink[] = [
    { href: "#brief", label: "Overview" },
    { href: "#circuits", label: "Circuit split" },
    { href: "#states", label: "States" },
    { href: "#issues", label: "Issues" },
    { href: "#cases", label: "Cases" },
    { href: "#entities", label: "Entities" },
    { href: "#cert", label: "Cert signal" },
    { href: "#correct", label: "Corrections" },
    { href: opsHref, label: "ops.", external: true },
    { href: REPO_URL, label: "Repo", external: true }
  ];

  return (
    <div>
      <TopBar
        brand={
          <>
            Prediction<em>Market</em>Litigation
          </>
        }
        links={links}
      />

      <TrustBar
        warn={<WarnChip />}
        message="Built by AI, governed and approved by a human; corrections welcome."
        meta={kpis ? <LastUpdated at={kpis.freshness} /> : undefined}
        provenance={<ProvenanceLabel kind="human" />}
      />

      <main>
        <CredibilityStrip opsHref={opsHref} />
        <Masthead opsHref={opsHref} kpis={kpis} developments={developments}>
          <KpiRow kpis={kpis} />
          <PollPanel />
        </Masthead>

        <SectionBand
          id="brief"
          kicker="The situation"
          title="What this fight is about"
          why="Written for readers who are not lawyers. Every claim below is carried in the case records further down, each with a primary source."
        >
          <ExecutiveBrief kpis={kpis} />
        </SectionBand>

        <ApexF1Provider>
          <SectionBand
            id="circuits"
            kicker="Heat map"
            title="The circuit split"
            why="Geography and doctrine disagree. The map colors states by the posture that controls them; the index colors the courts of appeals. Select either — the other follows."
          >
            <CircuitSplit />
          </SectionBand>

          <SectionBand
            id="states"
            kicker="Status board"
            title="State by state"
            why="Operational status answers the compliance question — can this platform take the order in this state today. Posture answers where the law is heading. They are not the same field, and they can disagree."
          >
            <StateBoard />
          </SectionBand>

          <SectionBand
            id="issues"
            kicker="A2b · Issue map"
            title="What is actually being litigated"
            why="Every matter carries a controlling issue and its secondary issues, drawn from a fixed vocabulary. Click anything below: the panel names the matters, and the case record further down filters to match."
          >
            <IssueBoard />
          </SectionBand>

          <SectionBand
            id="cases"
            kicker="Case record"
            title="Cases"
            why="One record per case, one posture per case. If a state and a circuit disagree on screen, that is a data error — report it."
          >
            <CaseBoard />
          </SectionBand>

          <SectionBand
            id="entities"
            kicker="A3b · Entity record"
            title="Platforms and parties"
            why="The same order can reach one platform and not another. This view reads the record the other way round — by who is actually bound."
          >
            <EntityBoard />
          </SectionBand>
        </ApexF1Provider>

        <SectionBand
          id="cert"
          kicker="A4 · Qualitative signal"
          title="Certiorari likelihood"
          why="Qualitative only. No market-derived number ships in v1 — the space below the reading is deliberately held open for one, with its methodology and its reflexivity caveat."
        >
          <CertBoard />
        </SectionBand>

        <SectionBand
          id="trust"
          kicker="A5 / A6 · Provenance"
          title="How this page is made"
          why="Every published claim carries a primary source, and the machinery that maintains it is open to inspection."
        >
          <div className="trust">
            <div>
              <div className="disclaimer">
                <p>
                  <strong>Not legal advice.</strong> This site publishes general
                  legal information about pending litigation. Reading it creates
                  no attorney-client relationship, and nothing here is a
                  substitute for counsel licensed in your jurisdiction.
                </p>
                <p>
                  <strong>Built by AI, approved by a human.</strong> Every claim
                  on this page is a seeded, human-curated record. The autonomous
                  pipeline and its Approval Gate ship in Epic 3 and are not live
                  yet.
                </p>
                <p>
                  <strong>Drafts are not here.</strong> Proposed changes will
                  live in full on <a href={opsHref}>ops.</a>, labelled not live,
                  once the pipeline ships.
                </p>
              </div>
              <div className="trust-ctas">
                <a className="btn btn-primary" href={opsHref}>
                  See the receipts on ops.
                </a>
                <a
                  className="btn btn-secondary"
                  href={REPO_URL}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Public repository
                </a>
                <a className="btn btn-ghost" href={DONATE_URL}>
                  Buy me a coffee
                </a>
              </div>
              <p className="bizmation">Powered by Bizmation.</p>
            </div>

            <div className="corr" id="correct">
              <div className="kicker">A6 · Report a discrepancy</div>
              <h3>Corrections welcome</h3>
              <p>
                Submissions are not open yet — corrections will be queued for
                operator review before anything is filed publicly.
              </p>
            </div>
          </div>
        </SectionBand>

        <SectionBand
          id="ops"
          kicker="The other half of the system"
          title="ops.predictionmarketlitigation.com"
          why="Transparency and governance live on ops., not here."
        >
          <div className="opslink">
            <p>
              The run log, full evidence for every run, the pending drafts in
              full text, the current approval mode and its audit trail, and the
              nine-layer governance explainer will all live on{" "}
              <a href={opsHref}>ops.</a> — no login. The daily pipeline is not
              live yet; when it is, every run and draft will be published there,
              labelled not live.
            </p>
            <a className="btn btn-primary" href={opsHref}>
              Open ops. ↗
            </a>
          </div>
        </SectionBand>
      </main>

      <SiteFooter
        label="PredictionMarketLitigation"
        links={[
          { href: opsHref, label: "ops.", external: true },
          { href: REPO_URL, label: "Repository", external: true },
          { href: "#correct", label: "Corrections" },
          { href: DONATE_URL, label: "Support the project" }
        ]}
        note="General legal information — not legal advice."
      />
    </div>
  );
}
