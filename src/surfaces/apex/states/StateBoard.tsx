import { useEffect, useMemo, useState } from "react";

import { useApexF1 } from "../ApexF1Context";
import { maxUpdatedAt } from "../circuits/circuitView";
import { selectionForCase, selectionForState } from "../selection";
import {
  DEFAULT_BOARD_SORT,
  filterByStatus,
  nextBoardSort,
  sortBoardRows,
  trackedStates,
  type BoardSortKey
} from "./boardView";
import { StateDetailPanel } from "./StateDetail";
import { StateFilters } from "./StateFilters";
import { StateTable } from "./StateTable";
import { useStateDetail } from "./useStateDetail";

export function StateBoard() {
  const {
    states,
    circuits,
    cases,
    selection,
    commit,
    statusFilter,
    setStatusFilter,
    detailEpoch
  } = useApexF1();
  const [sort, setSort] = useState(DEFAULT_BOARD_SORT);
  const { detail, status: detailStatus } = useStateDetail(
    selection.state,
    detailEpoch
  );

  const tracked = useMemo(() => trackedStates(states), [states]);
  const rows = useMemo(
    () => sortBoardRows(filterByStatus(tracked, statusFilter), sort),
    [tracked, statusFilter, sort]
  );
  const freshness = maxUpdatedAt(states);
  const selected =
    states.find((state) => state.code === selection.state) ?? null;

  function select(code: string) {
    commit(selectionForState(code, states));
  }

  function onSort(key: BoardSortKey) {
    setSort((current) => nextBoardSort(current, key));
  }

  useEffect(() => {
    if (!selection.state) return;
    document
      .getElementById("state-detail")
      ?.scrollIntoView({ block: "nearest" });
  }, [selection.state]);

  return (
    <>
      <StateFilters
        filter={statusFilter}
        visible={rows.length}
        tracked={tracked.length}
        onChange={setStatusFilter}
      />
      <div className="board">
        <div>
          <StateTable
            rows={rows}
            circuits={circuits}
            cases={cases}
            selectedCode={selection.state}
            sort={sort}
            freshness={freshness}
            onSort={onSort}
            onSelect={select}
          />
          <p className="board-note">
            Select a row to see that state's status and posture sourced in the
            panel. States with no tracked activity are absent from this table
            rather than shown as neutral — absence is not a finding.
          </p>
        </div>
        <StateDetailPanel
          selected={selected}
          circuits={circuits}
          cases={cases}
          detail={detail}
          detailStatus={detailStatus}
          freshness={freshness}
          onOpenCase={() => {
            if (selected?.controllingCaseId) {
              commit(selectionForCase(selected.controllingCaseId, selection));
            }
          }}
        />
      </div>
    </>
  );
}
