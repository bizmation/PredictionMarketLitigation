import { surfaceHref } from "../../shared/lib/surface";
import {
  EmptyState,
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
import { CircuitSplit } from "./circuits/CircuitSplit";
import { CredibilityStrip } from "./orientation/CredibilityStrip";
import { ExecutiveBrief } from "./orientation/ExecutiveBrief";
import { KpiRow } from "./orientation/KpiRow";
import { Masthead } from "./orientation/Masthead";
import { useOrientation } from "./orientation/useOrientation";
import { StateBoard } from "./states/StateBoard";

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
 * Remaining tracker bands are EmptyState until their stories wire them. That
 * is deliberate: an honest empty state naming its owning story beats a
 * plausible-looking mock that a reader could mistake for a finding.
 */

const REPO_URL = "https://github.com/bizmation/PredictionMarketLitigation";

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
          {/* Story 2.9 inserts #poll here, between KPI and #brief */}
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
            kicker="04"
            title="Issue map"
            why="Which legal questions are actually driving outcomes, across every tracked matter."
          >
            <EmptyState
              title="Issue views not yet wired"
              hint="Issue tags come from the case record."
            >
              Story 2.6 renders matrix, emergence, frequency, and family views
              from the approved case issue tags.
            </EmptyState>
          </SectionBand>

          <SectionBand
            id="cases"
            kicker="Case record"
            title="Cases"
            why="One record per case, one posture per case. If a state and a circuit disagree on screen, that is a data error — report it."
          >
            <CaseBoard />
          </SectionBand>
        </ApexF1Provider>

        <SectionBand
          id="entities"
          kicker="06"
          title="Entity ledger"
          why="Per-platform footprint: where each operator stands, and in which matters."
        >
          <EmptyState
            title="Entity view not yet wired"
            hint="Platforms are tracked, not endorsed."
          >
            Story 2.7 renders each seeded platform's operational footprint and
            matter list.
          </EmptyState>
        </SectionBand>

        <SectionBand
          id="cert"
          kicker="07"
          title="Cert signal"
          why="A qualitative reading of Supreme Court review — named factors, no model, no score."
        >
          <EmptyState
            title="Signal view not yet wired"
            hint="This is a reading, never a probability and never market-derived."
          >
            The qualitative seed reading is available through the API; Story 2.8
            renders its five-step scale and named factors.
          </EmptyState>
        </SectionBand>

        <SectionBand
          id="trust"
          kicker="08"
          title="Corrections"
          why="Every published claim carries a primary source. Tell us where one is wrong."
        >
          <EmptyState
            title="Correction form not yet open"
            hint="Corrections queue for operator review before anything is filed publicly."
          >
            Submissions become a tracked correction with a reference you can
            follow.
          </EmptyState>
        </SectionBand>

        <SectionBand
          id="ops"
          kicker="09"
          title="How this is governed"
          why="The pipeline that maintains this tracker publishes its own record, in full, next door."
        >
          <EmptyState
            title="The governance record lives on ops."
            hint="No login required."
          >
            The daily pipeline is not live yet. When it is, every run, draft,
            approval and rejection will be published at{" "}
            <a href={opsHref} rel="noopener">
              ops.predictionmarketlitigation.com
            </a>
            , alongside the nine-layer explainer and the build journal.
          </EmptyState>
        </SectionBand>
      </main>

      <SiteFooter
        label="PredictionMarketLitigation"
        links={[
          { href: opsHref, label: "ops.", external: true },
          { href: REPO_URL, label: "Repo", external: true }
        ]}
        note="General legal information — not legal advice."
      />
    </div>
  );
}
