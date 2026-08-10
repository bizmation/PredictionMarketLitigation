import { surfaceHref } from "../../shared/lib/surface";
import {
  EmptyState,
  ProvenanceLabel,
  SectionBand,
  SiteFooter,
  TopBar,
  TrustBar,
  WarnChip,
  type TopBarLink
} from "../../shared/ui";

/**
 * ops. — the public governance record. No login, ever.
 *
 * This surface is the trust thesis made inspectable: every run the pipeline
 * takes, every draft awaiting approval, every approval and rejection, the
 * nine-layer explainer, and the build journal. It is the canonical home for
 * the explainer and the journal — apex links here and never hosts them (AC6).
 *
 * The trust bar leads with the inverse of apex's: nothing here is live tracker
 * content. A reader who lands on a pending draft must not mistake a proposal
 * for a finding.
 */

const REPO_URL = "https://github.com/bizmation/PredictionMarketLitigation";

type OpsShellProps = {
  /** True in local development — routes cross-surface links via ?surface=. */
  dev?: boolean;
};

export function OpsShell({ dev = false }: OpsShellProps) {
  const apexHref = surfaceHref("apex", { dev });

  const links: TopBarLink[] = [
    { href: "#runs", label: "Run log" },
    { href: "#drafts", label: "Pending drafts" },
    { href: "#mode", label: "Mode" },
    { href: "#layers", label: "Nine layers" },
    { href: "#journal", label: "Journal" },
    { href: apexHref, label: "Tracker", external: true },
    { href: REPO_URL, label: "Repo", external: true }
  ];

  return (
    <div>
      <TopBar
        brand={
          <>
            ops.<em>PredictionMarketLitigation</em>
          </>
        }
        links={links}
      />

      <TrustBar
        warn={<WarnChip>Nothing here is live tracker content</WarnChip>}
        message="Runs and drafts are AI-produced and gate-controlled. Corrections welcome."
        meta="Next run — not yet scheduled"
        provenance={<ProvenanceLabel kind="human" detail="Gate: HITL" />}
      />

      <SectionBand
        id="runs"
        kicker="01"
        title="Run log"
        why="Every run the pipeline has taken — including the ones that changed nothing."
      >
        <EmptyState
          title="No runs yet"
          hint="Empty runs will be kept in this log deliberately."
        >
          The daily run has not been built yet. When it is, published, awaiting,
          empty, failed, budget-stopped and rejected runs all appear here, each
          linking to its evidence.
        </EmptyState>
      </SectionBand>

      <SectionBand
        id="drafts"
        kicker="02"
        title="Pending drafts"
        why="Read the full text of anything awaiting approval, before it is live."
      >
        <EmptyState
          title="No drafts awaiting approval"
          hint="Pending drafts are public here before they are published anywhere."
        >
          Each pending draft will show its full body, the changes it proposes,
          any flags, and a link into its evidence — wrapped so it can never be
          mistaken for published tracker content.
        </EmptyState>
      </SectionBand>

      <SectionBand
        id="mode"
        kicker="03"
        title="Approval mode"
        why="Whether a human is approving each change right now, and the audit trail of that setting."
      >
        <EmptyState
          title="Mode transparency not yet wired"
          hint="The default is, and will remain, human-in-the-loop."
        >
          This band will show whether autonomous mode is enabled, the current
          auto-approve threshold, and every mode change with its timestamp.
        </EmptyState>
      </SectionBand>

      <SectionBand
        id="layers"
        kicker="04"
        title="Nine layers of governance"
        why="The framework this system is built to demonstrate, and where PML actually sits against it."
      >
        <EmptyState
          title="Explainer not yet built"
          hint="Shipped spine and phase-in will be labelled separately — no overclaiming."
        >
          Gateway · Guardrails · Action policy · Orchestration · Identity and
          scoped context · Observability · Evals · Lineage and provenance · GRC.
        </EmptyState>
      </SectionBand>

      <SectionBand
        id="journal"
        kicker="05"
        title="Build journal"
        why="First-person posts on what was built, what broke, and what that cost."
      >
        <EmptyState
          title="No posts yet"
          hint="Copies published elsewhere are not the source of truth; this is."
        >
          Milestone-triggered posts, navigable by layer and by fault line, each
          able to attach the run evidence it describes.
        </EmptyState>
      </SectionBand>

      <SiteFooter
        label="ops.PredictionMarketLitigation"
        links={[
          { href: apexHref, label: "Tracker", external: true },
          { href: REPO_URL, label: "Repo", external: true }
        ]}
        note="The litigation is the subject; the governance is the message."
      />
    </div>
  );
}
