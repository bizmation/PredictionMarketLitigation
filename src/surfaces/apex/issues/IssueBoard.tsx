import { useMemo } from "react";

import { useApexF1 } from "../ApexF1Context";
import {
  clearedIssueSelection,
  selectionForCase,
  selectionForIssue,
  type ApexSelection
} from "../selection";
import { IssueBar } from "./IssueBar";
import { IssueChart } from "./IssueChart";
import {
  matrixOption,
  stripOption,
  sunburstOption,
  timelineOption,
  type IssueChartHit
} from "./issueCharts";
import { indexIssues, matrixPostureColumns } from "./issueView";

function jumpToCases(): void {
  const url = `${window.location.pathname}${window.location.search}#cases`;
  window.history.replaceState(null, "", url);
}

export function selectionFromIssueHit(
  hit: IssueChartHit,
  current: ApexSelection
): ApexSelection | null {
  if (hit.kind === "case" && hit.caseId) {
    return selectionForCase(hit.caseId, {
      ...current,
      issue: hit.slug ?? current.issue
    });
  }
  if (hit.kind === "tag" && hit.slug) {
    return selectionForIssue(hit.slug, current);
  }
  return null;
}

export function IssueBoard() {
  const { cases, listsReady, selection, commit, resetLocalFilters } =
    useApexF1();
  const tags = useMemo(() => indexIssues(cases), [cases]);
  const postures = useMemo(() => matrixPostureColumns(cases), [cases]);
  const selected = tags.find((tag) => tag.slug === selection.issue) ?? null;
  const highlightName = selected?.label ?? null;

  function onHit(hit: IssueChartHit) {
    const next = selectionFromIssueHit(hit, selection);
    if (!next) return;
    commit(next);
    if (hit.kind === "case") jumpToCases();
  }

  function onJump(caseId: string) {
    commit(selectionForCase(caseId, selection));
    jumpToCases();
  }

  function onClear() {
    commit(clearedIssueSelection(selection));
    resetLocalFilters();
  }

  const matrix = useMemo(
    () => matrixOption(tags, postures, highlightName),
    [tags, postures, highlightName]
  );
  const timeline = useMemo(
    () => timelineOption(tags, highlightName),
    [tags, highlightName]
  );
  const strip = useMemo(
    () => stripOption(tags, postures, highlightName),
    [tags, postures, highlightName]
  );
  const sunburst = useMemo(
    () => sunburstOption(tags, highlightName),
    [tags, highlightName]
  );

  return (
    <>
      {!listsReady ? (
        <div className="issuebar">
          <span className="kicker">Loading issue tags</span>
          <span className="issuehint">
            The published list has not settled yet. That is a retrieval wait,
            not a finding about the litigation.
          </span>
        </div>
      ) : (
        <IssueBar
          selected={selected}
          tagCount={tags.length}
          matterCount={cases.length}
          onJump={onJump}
          onClear={onClear}
        />
      )}
      <div className="chartcard">
        <div className="ch">
          <span className="kicker">Issue × posture</span>
          <span className="note">
            How each issue has actually come out. Depth of tone is the count,
            not the outcome — the outcome is the column.
          </span>
        </div>
        <IssueChart
          option={matrix}
          height={520}
          highlightName={highlightName}
          onHit={onHit}
        />
      </div>
      <div className="chartcard">
        <div className="ch">
          <span className="kicker">When each issue entered the record</span>
          <span className="note">
            One mark per matter, placed at its first docket event. Colour is
            that matter&apos;s posture today.
          </span>
        </div>
        <IssueChart
          option={timeline}
          height={460}
          highlightName={highlightName}
          onHit={onHit}
        />
      </div>
      <div className="chartcard">
        <div className="ch">
          <span className="kicker">Frequency, split by posture</span>
          <span className="note">
            Preemption is pleaded almost everywhere; the state-law theories are
            where the losses are.
          </span>
        </div>
        <IssueChart
          option={strip}
          height={430}
          highlightName={highlightName}
          onHit={onHit}
        />
      </div>
      <div className="chartcard">
        <div className="ch">
          <span className="kicker">Issue families</span>
          <span className="note">
            The vocabulary itself: five families, the tags inside each, and one
            segment per matter on the outer ring — hover a segment to name it.
          </span>
        </div>
        <IssueChart
          option={sunburst}
          height={640}
          highlightName={highlightName}
          onHit={onHit}
        />
      </div>
    </>
  );
}
