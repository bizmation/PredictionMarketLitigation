import { surfaceHref } from "../../shared/lib/surface";
import {
  EmptyState,
  LastUpdated,
  SectionBand,
  SiteFooter,
  TopBar,
  TrustBar,
  WarnChip,
  type TopBarLink
} from "../../shared/ui";

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
 * Every band is an EmptyState until its story wires it. That is deliberate:
 * an honest empty state naming its owning story beats a plausible-looking mock
 * that a reader could mistake for a finding.
 */

const REPO_URL = "https://github.com/bizmation/PredictionMarketLitigation";

type ApexShellProps = {
  /** True in local development — routes cross-surface links via ?surface=. */
  dev?: boolean;
};

export function ApexShell({ dev = false }: ApexShellProps) {
  const opsHref = surfaceHref("ops", { dev });

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
        meta={<LastUpdated at="2026-08-10T10:00:00.000Z" />}
      />

      <main>
        <SectionBand
          id="brief"
          kicker="01"
          title="Where this stands"
          why="A plain-language reading of U.S. prediction-market litigation, for people who are not lawyers."
        >
          <EmptyState
            title="No summary published yet"
            hint="The tracker publishes nothing it cannot source."
          >
            The executive summary is written from approved case data, which
            arrives with the litigation data model.
          </EmptyState>
        </SectionBand>

        <SectionBand
          id="circuits"
          kicker="02"
          title="Circuit split"
          why="Which federal circuits have ruled, which way, and where the split actually runs."
        >
          <EmptyState
            title="Map not yet wired"
            hint="Absence of a finding is not a finding of legality."
          >
            The circuit heat map renders real U.S. geography over approved
            posture data. Neither is loaded yet.
          </EmptyState>
        </SectionBand>

        <SectionBand
          id="states"
          kicker="03"
          title="State status board"
          why="Is a given platform legal in a given state today, and what is the controlling authority?"
        >
          <EmptyState
            title="No tracked states yet"
            hint="An untracked state is not a permissive one."
          >
            The status board lists operational status, posture and controlling
            case per state, with a per-platform breakdown.
          </EmptyState>
        </SectionBand>

        <SectionBand
          id="issues"
          kicker="04"
          title="Issue map"
          why="Which legal questions are actually driving outcomes, across every tracked matter."
        >
          <EmptyState
            title="No issues mapped yet"
            hint="Issue tags come from the case record."
          >
            Four views over the issue taxonomy — matrix, emergence, frequency
            and family breakdown — all reading the same approved matters.
          </EmptyState>
        </SectionBand>

        <SectionBand
          id="cases"
          kicker="05"
          title="Case record"
          why="Every tracked matter, its docket, and the primary source behind each event."
        >
          <EmptyState
            title="No cases loaded"
            hint="Every docket event will link to a Tier-1 source."
          >
            The case list and detail view arrive with the litigation data model
            and the case-law seed.
          </EmptyState>
        </SectionBand>

        <SectionBand
          id="entities"
          kicker="06"
          title="Entity ledger"
          why="Per-platform footprint: where each operator stands, and in which matters."
        >
          <EmptyState
            title="No entities loaded"
            hint="Platforms are tracked, not endorsed."
          >
            Each platform's operational footprint and its matter list.
          </EmptyState>
        </SectionBand>

        <SectionBand
          id="cert"
          kicker="07"
          title="Cert signal"
          why="A qualitative reading of Supreme Court review — named factors, no model, no score."
        >
          <EmptyState
            title="No reading published"
            hint="This is a reading, never a probability and never market-derived."
          >
            The signal is a five-step qualitative scale with its factors named
            in full.
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
            Every run, every pending draft, every approval and every rejection —
            including the ones that changed nothing — are published at{" "}
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
