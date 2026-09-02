import type {
  CaseDetail,
  CaseListItem
} from "../../../shared/schemas/caseSchema";
import type { Circuit } from "../../../shared/schemas/circuit";
import type { State } from "../../../shared/schemas/state";
import { formatIsoDate } from "../../../shared/lib/dates";
import {
  EmptyState,
  POSTURE_LABELS,
  ProvenanceLabel
} from "../../../shared/ui";
import {
  selectionForCircuit,
  selectionForState,
  type ApexSelection
} from "../selection";
import { FORUM_LABELS } from "./caseView";
import type { CaseDetailLoad } from "./useCaseDetail";

type CaseDetailPanelProps = {
  selected: CaseListItem | null;
  circuits: Circuit[];
  states: State[];
  selection: ApexSelection;
  commit: (next: ApexSelection) => void;
  detail: CaseDetail | null;
  detailStatus: CaseDetailLoad["status"];
};

export function CaseDetailPanel({
  selected,
  circuits,
  states,
  selection,
  commit,
  detail,
  detailStatus
}: CaseDetailPanelProps) {
  if (!selected) {
    return (
      <aside id="case-detail" className="detail">
        <EmptyState
          title="Select a case from the list."
          hint="Absence of a match is not a finding about the litigation."
        >
          The panel carries the docket, issue tags, and the Tier-1 source behind
          each event.
        </EmptyState>
      </aside>
    );
  }

  const liveDetail = detail && detail.id === selected.id ? detail : null;
  const liveStatus =
    detail && detail.id !== selected.id ? "loading" : detailStatus;
  const circuit = circuits.find((item) => item.id === selected.circuitId);
  const affected =
    liveDetail?.states.map((link) => link.state) ??
    selected.affectedStateCodes
      .map((code) => states.find((state) => state.code === code))
      .filter((state): state is State => Boolean(state));
  const tags = liveDetail?.issueTags ?? [];
  const events = liveDetail?.docketEvents ?? [];

  return (
    <aside id="case-detail" className="detail">
      <div className="dhead">
        <div className="kicker">Case record</div>
        <h3>{selected.caption}</h3>
        <div className="dhead-meta">
          <span className={`forum ${selected.forum}`}>
            {FORUM_LABELS[selected.forum]}
          </span>
          <span className="num">
            {selected.court}
            {selected.docketNumber ? ` · ${selected.docketNumber}` : ""}
          </span>
          <ProvenanceLabel kind={selected.provenanceKind} />
        </div>
      </div>
      <div className="dbody">
        <p>
          Posture: <strong>{POSTURE_LABELS[selected.posture]}</strong>
          {affected.length > 0 ? (
            <>
              {" · Affects "}
              {affected.map((state, index) => (
                <span key={state.code}>
                  {index > 0 ? ", " : null}
                  <a
                    href="#states"
                    onClick={() =>
                      commit(selectionForState(state.code, states))
                    }
                  >
                    {state.name}
                  </a>
                </span>
              ))}
            </>
          ) : null}
          {circuit && selected.circuitId ? (
            <>
              {" · "}
              <a
                href="#circuits"
                onClick={() =>
                  commit(
                    selectionForCircuit(selected.circuitId!, states, selection)
                  )
                }
              >
                {circuit.name}
              </a>
            </>
          ) : null}
        </p>

        {liveStatus === "success" && tags.length > 0 ? (
          <>
            <div className="kicker" style={{ marginTop: "var(--space-6)" }}>
              Issues on this record
            </div>
            <div className="itag-row">
              {tags.map((assignment) => (
                <span
                  key={assignment.tag.id}
                  className={assignment.isControlling ? "itag primary" : "itag"}
                >
                  {assignment.tag.label}
                </span>
              ))}
            </div>
          </>
        ) : null}

        <div className="kicker" style={{ marginTop: "var(--space-6)" }}>
          Docket — most recent first
        </div>
        <div aria-live="polite">
          {liveStatus === "loading" || liveStatus === "idle" ? (
            <p>Loading docket…</p>
          ) : liveStatus === "error" ? (
            <EmptyState
              title="Docket could not be loaded."
              hint="The list still shows the published caption and posture."
            >
              The request for this case's detail failed. That is a retrieval
              problem, not a finding about the litigation.
            </EmptyState>
          ) : events.length === 0 ? (
            <EmptyState
              title="No docket events published"
              hint="That is a gap in this record, not a finding."
            >
              Nothing is invented here to fill the timeline.
            </EmptyState>
          ) : (
            <ul className="docket">
              {events.map((event) => (
                <li key={event.id}>
                  <span className="d num">
                    {formatIsoDate(event.occurredAt)}
                  </span>
                  <br />
                  {event.description}
                  <br />
                  <a href={event.source.url} target="_blank" rel="noopener">
                    {event.source.title} ↗
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        {liveStatus === "success" ? (
          <p className="docket-note">
            Every event above links to a Tier-1 source. Trade-press reports are
            used as leads only and never appear as the citation of record.
          </p>
        ) : null}

        <div className="detail-actions">
          <a className="btn btn-ghost" href="#trust">
            Report an error
          </a>
        </div>
      </div>
    </aside>
  );
}
