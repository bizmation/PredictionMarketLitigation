import { PostureSwatch } from "../../../shared/ui";
import type { CaseListItem } from "../../../shared/schemas/caseSchema";
import { FORUM_LABELS, LIFECYCLE_LABELS, partyRoleLabel } from "./caseView";

type CaseListProps = {
  rows: CaseListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  listsReady: boolean;
  total: number;
};

export function CaseList({
  rows,
  selectedId,
  onSelect,
  listsReady,
  total
}: CaseListProps) {
  if (!listsReady) {
    return (
      <div className="empty" style={{ marginTop: "var(--space-4)" }}>
        <b>Loading cases</b>
        <p>
          The published list has not settled yet. That is a retrieval wait, not
          a finding about the litigation.
        </p>
      </div>
    );
  }
  if (total === 0) {
    return (
      <div className="empty" style={{ marginTop: "var(--space-4)" }}>
        <b>No cases published</b>
        <p>Absence of a record is not a finding about the litigation.</p>
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="empty" style={{ marginTop: "var(--space-4)" }}>
        <b>No case matches</b>
        <p>
          Nothing in the record fits those terms. That is a statement about this
          filter, not about the litigation — widen it, or{" "}
          <a href="#trust">tell us what is missing</a>.
        </p>
      </div>
    );
  }

  return (
    <div className="caselist">
      {rows.map((row) => {
        const role = partyRoleLabel(row.entityRoles);
        return (
          <button
            key={row.id}
            type="button"
            className="caseitem"
            data-lifecycle={row.lifecycle}
            aria-pressed={selectedId === row.id}
            onClick={() => onSelect(row.id)}
          >
            <span className="cap">{row.caption}</span>
            <span className="meta num">
              {FORUM_LABELS[row.forum]}
              {" · "}
              {row.court}
              {row.docketNumber ? ` · ${row.docketNumber}` : ""}
            </span>
            <span className="ctag">
              <PostureSwatch posture={row.posture} />
              {role ? <span>{role}</span> : null}
              <span>{LIFECYCLE_LABELS[row.lifecycle]}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
