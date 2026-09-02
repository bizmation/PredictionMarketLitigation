import { CASE_POSTURE_CHIP, POSTURE_CHIP_ORDER } from "../cases/caseView";
import { issueBarCopy, type IndexedIssue } from "./issueView";

type IssueBarProps = {
  selected: IndexedIssue | null;
  tagCount: number;
  matterCount: number;
  onJump: (caseId: string) => void;
  onClear: () => void;
};

export function IssueBar({
  selected,
  tagCount,
  matterCount,
  onJump,
  onClear
}: IssueBarProps) {
  const copy = issueBarCopy(selected, tagCount, matterCount);
  if (!selected || copy.empty) {
    return (
      <div className="issuebar">
        <span className="kicker">Nothing selected</span>
        <span className="issuehint">{copy.hint}</span>
      </div>
    );
  }

  const counts = POSTURE_CHIP_ORDER.map((posture) => ({
    posture,
    n: selected.cases.filter((row) => row.posture === posture).length
  })).filter((entry) => entry.n > 0);

  return (
    <div className="issuebar">
      <div>
        <div className="fam">{selected.family}</div>
        <div className="lead">{selected.label}</div>
      </div>
      <div className="issuehint">
        {copy.hint}
        <br />
        {counts.map((entry, i) => (
          <span key={entry.posture}>
            {i > 0 ? " · " : null}
            <span className="num">{entry.n}</span>{" "}
            {CASE_POSTURE_CHIP[entry.posture].toLowerCase()}
          </span>
        ))}
      </div>
      <div className="issuematters">
        {selected.cases.map((row) => (
          <button key={row.id} type="button" onClick={() => onJump(row.id)}>
            {row.caption}
          </button>
        ))}
      </div>
      <button className="chip" type="button" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}
