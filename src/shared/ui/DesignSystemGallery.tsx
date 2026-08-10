import { formatEtDateTime } from "../lib/dates";
import { EmptyState } from "./EmptyState";
import { SectionBand } from "./SectionBand";
import { LastUpdated } from "./LastUpdated";
import { NotLiveDraftBanner } from "./NotLiveDraftBanner";
import { OriginFlag, type RunOrigin } from "./OriginFlag";
import { POSTURE_LABELS, PostureSwatch, type Posture } from "./PostureSwatch";
import { ProvenanceLabel } from "./ProvenanceLabel";
import { RunStatusChip, type RunStatus } from "./RunStatusChip";
import { StatusBadge, type OperationalStatus } from "./StatusBadge";
import { UpdatedBadge } from "./UpdatedBadge";
import { WarnChip } from "./WarnChip";

/**
 * Component reference for the PML trust vocabulary — the in-app recreation of
 * the handoff's "PML Design System" page (UX-DR24: the HTML prototypes are
 * reference only and are never served).
 *
 * This is the verification surface for the design system and the discovery
 * surface for whoever builds the real shells next. It renders every component
 * in every variant, so a visual regression shows up here first.
 */

const POSTURES = Object.keys(POSTURE_LABELS) as Posture[];
const STATUSES: OperationalStatus[] = ["go", "restricted", "banned"];
const RUN_STATUSES: RunStatus[] = [
  "published",
  "awaiting",
  "empty",
  "failed",
  "stopped",
  "rejected"
];
const ORIGINS: RunOrigin[] = ["scheduled", "catch-up", "manual"];

const SAMPLE_AT = "2026-08-09T10:12:00.000Z";

export function DesignSystemGallery() {
  return (
    <div>
      <header className="topbar">
        <div className="wrap">
          <span className="brand">
            Prediction<em>Market</em>Litigation{" "}
            <span className="sub">· design system</span>
          </span>
          <nav className="topnav">
            <a href="#posture">Posture</a>
            <a href="#status">Status</a>
            <a href="#provenance">Provenance</a>
            <a href="#draft">Draft</a>
            <a href="#runs">Runs</a>
            <a href="#empty">Empty</a>
          </nav>
        </div>
      </header>

      <div className="trustbar">
        <div className="wrap">
          <span className="grow">
            Built by AI, governed and approved by a human; corrections welcome.
          </span>
          <ProvenanceLabel kind="human" />
          <span className="sep">·</span>
          <WarnChip />
          <span className="sep">·</span>
          <LastUpdated at={SAMPLE_AT} />
        </div>
      </div>

      <SectionBand
        id="posture"
        kicker="01"
        title="Posture ramp"
        why="One axis, five steps — the darker the fill, the worse for platforms. Never carried by fill alone."
      >
        <table className="grid">
          <thead>
            <tr>
              <th>Swatch + label</th>
              <th>Token class</th>
            </tr>
          </thead>
          <tbody>
            {POSTURES.map((posture) => (
              <tr key={posture}>
                <td>
                  <PostureSwatch posture={posture} />
                </td>
                <td className="muted">.sw.{posture}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionBand>

      <SectionBand
        id="status"
        kicker="02"
        title="Operational status"
        why="Outlined and muted, never a traffic light. Answers “is this platform legal here today?”"
      >
        <div className="filters">
          {STATUSES.map((status) => (
            <StatusBadge key={status} status={status} />
          ))}
          <UpdatedBadge />
        </div>
      </SectionBand>

      <SectionBand
        id="provenance"
        kicker="03"
        title="Provenance"
        why="Who approved this claim, frozen at publish time. Agent approval reads provisional by design."
      >
        <div className="filters">
          <ProvenanceLabel kind="human" />
          <ProvenanceLabel kind="human" detail="P. Bland" />
          <ProvenanceLabel kind="agent" />
          <ProvenanceLabel kind="agent" detail="gate-v2.1" />
        </div>
      </SectionBand>

      <SectionBand
        id="draft"
        kicker="04"
        title="Not live · awaiting approval"
        why="The load-bearing state: a pending draft must be impossible to mistake for published tracker content."
      >
        <NotLiveDraftBanner
          meta={
            <span className="lastupd">
              proposed {formatEtDateTime(SAMPLE_AT)}
            </span>
          }
        >
          <div className="pb">
            <p>
              Proposed change to New Jersey: operational status{" "}
              <StatusBadge status="restricted" /> pending the Third Circuit’s
              ruling on CEA preemption.
            </p>
            <p className="muted">
              Full draft body, proposed F1 diffs, flags and evidence links
              render here on ops.
            </p>
          </div>
        </NotLiveDraftBanner>
      </SectionBand>

      <SectionBand
        id="runs"
        kicker="05"
        title="Run status + origin"
        why="All six outcomes are designed states. An empty or budget-stopped run is evidence, not a gap."
      >
        <table className="grid">
          <thead>
            <tr>
              <th>Status</th>
              <th>Origin</th>
              <th>Provenance</th>
            </tr>
          </thead>
          <tbody>
            {RUN_STATUSES.map((status, i) => (
              <tr key={status}>
                <td>
                  <RunStatusChip status={status} />
                </td>
                <td>
                  <OriginFlag origin={ORIGINS[i % ORIGINS.length]} />
                </td>
                <td>
                  <ProvenanceLabel kind={i % 2 === 0 ? "human" : "agent"} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionBand>

      <SectionBand
        id="empty"
        kicker="06"
        title="Empty states"
        why="A dashed frame, the reason, and what it means for the reader. Never an apology."
      >
        <div className="pb">
          <EmptyState
            title="No material change"
            hint="Empty runs are kept in the log deliberately."
          >
            The run completed and proposed nothing. Sources were checked and
            matched the published record.
          </EmptyState>
          <p />
          <EmptyState
            title="Evals not run"
            hint="An empty eval is not a passing eval."
          >
            This run predates the eval suite. The field is empty rather than
            zero.
          </EmptyState>
          <p />
          <EmptyState
            title="No tracked activity"
            hint="Absence of a finding is not a finding of legality."
          >
            Nothing in this state has been reviewed.
          </EmptyState>
        </div>
      </SectionBand>

      <SectionBand
        id="surfaces"
        kicker="07"
        title="Surfaces and controls"
        why="Stroke, not fill: cards are bordered and unfilled, buttons outlined. Tab through to check the focus ring."
      >
        <div className="filters">
          <button type="button" className="chip" aria-pressed="true">
            All
          </button>
          <button type="button" className="chip" aria-pressed="false">
            Go
          </button>
          <button type="button" className="chip" aria-pressed="false">
            Restricted
          </button>
          <span className="export">
            <button type="button">CSV</button>
            <button type="button">JSON</button>
          </span>
          <button type="button" className="btn btn-primary">
            Primary
          </button>
          <button type="button" className="btn btn-secondary">
            Secondary
          </button>
        </div>
        <div className="panel">
          <div className="ph">
            <strong>Panel header</strong>
            <LastUpdated at={SAMPLE_AT} />
          </div>
          <div className="pb">
            Bordered surface. Numbers set tabular:{" "}
            <span className="num">1,204 · 38 · 06:12</span>
          </div>
        </div>
      </SectionBand>

      <footer className="foot">
        <div className="wrap">
          <span>PML design system · v1</span>
          <span className="muted">
            Recreated in-app from the UX handoff. Tokens are the source of
            truth.
          </span>
        </div>
      </footer>
    </div>
  );
}
