import type { Case } from "../../../shared/schemas/caseSchema";
import type { Circuit } from "../../../shared/schemas/circuit";
import type { State, StateDetail } from "../../../shared/schemas/state";
import { formatEtDate } from "../../../shared/lib/dates";
import {
  EmptyState,
  PostureSwatch,
  ProvenanceLabel,
  StatusBadge,
  UpdatedBadge
} from "../../../shared/ui";
import { isFresh } from "./boardView";
import type { DetailLoad } from "./useStateDetail";

const UNTRACKED_COPY =
  "Nothing in this state has been reviewed. Absence of a finding is not a finding of legality — no case, order or enforcement action is being tracked here.";

type StateDetailPanelProps = {
  selected: State | null;
  circuits: Circuit[];
  cases: Case[];
  detail: StateDetail | null;
  detailStatus: DetailLoad["status"];
  freshness: string | null;
  onOpenCase?: () => void;
};

function controllingCopy(
  controlling: Case | undefined,
  controllingCaseId: string | null
) {
  if (controlling) {
    return (
      <>
        <em>{controlling.caption}</em>
        {controlling.docketNumber ? `, ${controlling.docketNumber}` : ""}
      </>
    );
  }
  if (controllingCaseId) return "Case record not loaded";
  return "None tracked";
}

export function StateDetailPanel({
  selected,
  circuits,
  cases,
  detail,
  detailStatus,
  freshness,
  onOpenCase
}: StateDetailPanelProps) {
  if (!selected) {
    return (
      <aside id="state-detail" className="detail">
        <EmptyState
          title="Select a state on the map or in the table."
          hint="Absence of a finding is not a finding of legality."
        >
          The panel answers whether a platform can take the order in that state
          today, with the controlling authority and a primary source.
        </EmptyState>
      </aside>
    );
  }

  if (selected.posture === "untracked") {
    return (
      <aside id="state-detail" className="detail">
        <div className="dhead">
          <div className="kicker">State detail · is it legal here?</div>
          <h3>{selected.name}</h3>
          <div className="dhead-meta">
            <StatusBadge status="unknown" />
            <PostureSwatch posture={selected.posture} />
          </div>
        </div>
        <div className="dbody">
          <p>{UNTRACKED_COPY}</p>
          <div className="detail-actions">
            <a className="btn btn-ghost" href="#trust">
              Report an error
            </a>
          </div>
        </div>
      </aside>
    );
  }

  const circuit = circuits.find((item) => item.id === selected.circuitId);
  const controlling = selected.controllingCaseId
    ? cases.find((item) => item.id === selected.controllingCaseId)
    : undefined;
  const liveDetail = detail && detail.code === selected.code ? detail : null;
  const liveStatus =
    detail && detail.code !== selected.code ? "loading" : detailStatus;
  const platforms = liveDetail?.platformStatuses ?? [];
  const sources = liveDetail?.sources ?? [];
  const hasTier1 = sources.some((source) => source.tier === "tier1");
  const showUpdated = isFresh(selected.updatedAt, freshness);

  return (
    <aside id="state-detail" className="detail">
      <div className="dhead">
        <div className="kicker">State detail · is it legal here?</div>
        <h3>{selected.name}</h3>
        <div className="dhead-meta">
          <StatusBadge status={selected.operationalStatus} />
          <PostureSwatch posture={selected.posture} />
          {showUpdated ? <UpdatedBadge /> : null}
        </div>
      </div>
      <div className="dbody">
        <dl>
          <dt>Circuit</dt>
          <dd>{circuit?.name ?? "None tracked"}</dd>
          <dt>Controlling</dt>
          <dd>{controllingCopy(controlling, selected.controllingCaseId)}</dd>
          <dt>Updated</dt>
          <dd className="num">{formatEtDate(selected.updatedAt)}</dd>
          <dt>Provenance</dt>
          <dd>
            <ProvenanceLabel kind={selected.provenanceKind} />
          </dd>
        </dl>
        {selected.whyNote ? <p>{selected.whyNote}</p> : null}

        <div className="kicker plat-kicker">By platform</div>
        <div aria-live="polite">
          {liveStatus === "loading" || liveStatus === "idle" ? (
            <p>Loading per-platform breakdown…</p>
          ) : liveStatus === "error" ? (
            <EmptyState
              title="Per-platform breakdown could not be loaded."
              hint="The table still shows the published state-wide status."
            >
              The request for this state's detail failed. That is a retrieval
              problem, not a finding of legality.
            </EmptyState>
          ) : platforms.length === 0 ? (
            <EmptyState
              title="No per-platform breakdown published"
              hint="That is a gap in this record, not a finding of legality."
            >
              The state-wide operational status still applies.
            </EmptyState>
          ) : (
            <>
              <table className="plat">
                <thead>
                  <tr>
                    <th>Platform</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {platforms.map((row) => (
                    <tr key={row.id}>
                      <td>{row.entity.name}</td>
                      <td>
                        <StatusBadge status={row.operationalStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {platforms
                .filter((row) => row.note)
                .map((row) => (
                  <p key={row.id} className="plat-note">
                    {row.entity.name}: {row.note}
                  </p>
                ))}
            </>
          )}
        </div>

        <div className="srcline">
          <span className="kicker">Primary sources</span>
          <br />
          <div aria-live="polite">
            {liveStatus === "loading" ||
            liveStatus === "idle" ? null : liveStatus === "error" ? (
              <EmptyState
                title="Sources could not be loaded."
                hint="Do not treat a missing panel as a missing citation."
              >
                Retry selecting the state. Claims stay unpublished without a
                Tier-1 source on the record.
              </EmptyState>
            ) : !hasTier1 ? (
              <EmptyState
                title="No Tier-1 source on this record"
                hint="A tracked claim without a primary source is a data gap."
              >
                Nothing is invented here to fill the cell.
              </EmptyState>
            ) : (
              sources.map((source) => (
                <a
                  key={source.id}
                  href={source.url}
                  target="_blank"
                  rel="noopener"
                >
                  {source.title}
                </a>
              ))
            )}
          </div>
        </div>

        <div className="detail-actions">
          {selected.controllingCaseId ? (
            <a className="btn btn-secondary" href="#cases" onClick={onOpenCase}>
              Open case record
            </a>
          ) : null}
          <a className="btn btn-ghost" href="#trust">
            Report an error
          </a>
        </div>
      </div>
    </aside>
  );
}
