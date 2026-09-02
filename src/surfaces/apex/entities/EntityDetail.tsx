import {
  EmptyState,
  PostureSwatch,
  ProvenanceLabel,
  StatusBadge
} from "../../../shared/ui";
import type {
  EntityFootprint,
  EntityListItem
} from "../../../shared/schemas/entity";
import type { OperationalStatus } from "../../../shared/schemas/vocabulary";
import { CASE_POSTURE_CHIP, LIFECYCLE_LABELS } from "../cases/caseView";
import { groupFootprint, roleTagLabel } from "./entityView";

type EntityDetailProps = {
  item: EntityListItem;
  onOpenCase: (caseId: string) => void;
  onOpenState: (code: string) => void;
};

const LEDGER_ROWS: Array<{
  status: Exclude<OperationalStatus, "unknown">;
  label: OperationalStatus;
}> = [
  { status: "go", label: "go" },
  { status: "restricted", label: "restricted" },
  { status: "banned", label: "banned" }
];

function StateNames({
  rows,
  onOpenState
}: {
  rows: readonly EntityFootprint[];
  onOpenState: (code: string) => void;
}) {
  if (rows.length === 0) {
    return <span className="none">none</span>;
  }
  return (
    <>
      {rows.map((row, index) => (
        <span key={row.stateCode}>
          {index > 0 ? ", " : null}
          <button type="button" onClick={() => onOpenState(row.stateCode)}>
            {row.stateName}
          </button>
        </span>
      ))}
    </>
  );
}

export function EntityDetail({
  item,
  onOpenCase,
  onOpenState
}: EntityDetailProps) {
  const grouped = groupFootprint(item);
  const active = item.matters.filter(
    (matter) => matter.lifecycle === "active"
  ).length;
  const hasFootprint = item.footprint.length > 0;
  const hasMatters = item.matters.length > 0;

  return (
    <div className="ent">
      <div>
        <div className="kicker">Entity</div>
        <h3>{item.name}</h3>
        {item.role ? <div className="et">{item.role}</div> : null}
        <div className="eprov">
          <ProvenanceLabel kind={item.provenanceKind} />
        </div>
        {hasFootprint ? (
          <>
            <div className="kicker" style={{ marginTop: "var(--space-6)" }}>
              Operational footprint · {item.footprint.length} published state
              {item.footprint.length === 1 ? " row" : " rows"}
            </div>
            <table className="ledger">
              <tbody>
                {LEDGER_ROWS.map((row) => (
                  <tr key={row.status}>
                    <td>
                      <StatusBadge status={row.label} />
                    </td>
                    <td className="sts">
                      <StateNames
                        rows={grouped[row.status]}
                        onOpenState={onOpenState}
                      />
                    </td>
                  </tr>
                ))}
                {grouped.unknown.length > 0 ? (
                  <tr>
                    <td>
                      <StatusBadge status="unknown" />
                    </td>
                    <td className="sts">
                      <StateNames
                        rows={grouped.unknown}
                        onOpenState={onOpenState}
                      />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            <p className="efootnote">
              Status is per state and per platform, taken from the published
              operational record. Untracked states are omitted. Absence of a row
              is not a finding of legality.
            </p>
            {item.footprint
              .filter((row) => row.note)
              .map((row) => (
                <p key={row.stateCode} className="plat-note">
                  {row.stateName}: {row.note}
                </p>
              ))}
          </>
        ) : (
          <EmptyState
            title="No operational footprint is published for this platform"
            hint="Absence of a row is not a finding of legality."
          >
            The other states are untracked. That is a gap in the published
            record, not a finding that the platform can operate there.
          </EmptyState>
        )}
      </div>
      <div>
        <div className="kicker">
          Matters · {item.matters.length} · {active} active
        </div>
        {hasMatters ? (
          <ul className="matters">
            {item.matters.map((matter) => (
              <li key={matter.caseId}>
                <div className="mrow">
                  <span className="mcap">{matter.caption}</span>
                  <span className="mmeta num">
                    {matter.court}
                    {matter.docketNumber ? ` · ${matter.docketNumber}` : ""}
                  </span>
                  <span
                    className={
                      matter.role === "plaintiff" ? "rtag plaintiff" : "rtag"
                    }
                  >
                    {roleTagLabel(matter.role)}
                  </span>
                  <span className="rtag">
                    {LIFECYCLE_LABELS[matter.lifecycle]}
                  </span>
                  <span
                    className="ctag"
                    style={{ marginTop: 0 }}
                    aria-label={CASE_POSTURE_CHIP[matter.posture]}
                  >
                    <PostureSwatch posture={matter.posture} showLabel={false} />
                    {CASE_POSTURE_CHIP[matter.posture]}
                  </span>
                </div>
                <button
                  type="button"
                  className="link"
                  onClick={() => onOpenCase(matter.caseId)}
                >
                  Open case record
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No matters are linked to this platform"
            hint="That is a gap in the published join, not a finding that the platform faces no litigation."
          >
            Linked matters appear here when a published case names this
            platform.
          </EmptyState>
        )}
      </div>
    </div>
  );
}
