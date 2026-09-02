import { useEffect, useMemo, useState } from "react";

import { useApexF1 } from "../ApexF1Context";
import {
  clearedIssueSelection,
  selectionForCase,
  selectionForIssue
} from "../selection";
import { CaseDetailPanel } from "./CaseDetail";
import { CaseFiltersBar } from "./CaseFilters";
import { CaseList } from "./CaseList";
import {
  caseMatches,
  emptyCaseFilters,
  togglePosture,
  uniqueAffectedCodes,
  uniqueCircuitIds,
  uniqueIssueTags,
  type CaseFilters
} from "./caseView";
import { useCaseDetail } from "./useCaseDetail";

export function CaseBoard() {
  const {
    cases,
    circuits,
    states,
    selection,
    commit,
    listsReady,
    filtersEpoch
  } = useApexF1();
  const [filters, setFilters] = useState<CaseFilters>(emptyCaseFilters);
  const [caseEpoch, setCaseEpoch] = useState(0);
  const { detail, status: detailStatus } = useCaseDetail(
    selection.case,
    caseEpoch
  );

  useEffect(() => {
    setFilters(emptyCaseFilters());
  }, [filtersEpoch]);

  const merged: CaseFilters = {
    ...filters,
    issue: selection.issue ?? "all"
  };

  const stateNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const state of states) map.set(state.code, state.name);
    return map;
  }, [states]);

  const rows = useMemo(
    () =>
      cases.filter((row) =>
        caseMatches(
          row,
          { ...filters, issue: selection.issue ?? "all" },
          stateNames
        )
      ),
    [cases, filters, selection.issue, stateNames]
  );
  const selected = cases.find((row) => row.id === selection.case) ?? null;

  function select(id: string) {
    commit(selectionForCase(id, selection));
    setCaseEpoch((n) => n + 1);
  }

  useEffect(() => {
    if (!selection.case) return;
    document
      .getElementById("case-detail")
      ?.scrollIntoView({ block: "nearest" });
  }, [selection.case]);

  return (
    <>
      <CaseFiltersBar
        filters={merged}
        visible={rows.length}
        total={cases.length}
        issueOptions={uniqueIssueTags(cases)}
        stateCodes={uniqueAffectedCodes(cases)}
        states={states}
        circuitIds={uniqueCircuitIds(cases)}
        circuits={circuits}
        onSearch={(q) => setFilters((current) => ({ ...current, q }))}
        onIssue={(issue) =>
          commit(
            issue === "all"
              ? { ...selection, issue: null }
              : selectionForIssue(issue, selection)
          )
        }
        onState={(state) => setFilters((current) => ({ ...current, state }))}
        onCircuit={(circuit) =>
          setFilters((current) => ({ ...current, circuit }))
        }
        onTogglePosture={(posture) =>
          setFilters((current) => ({
            ...current,
            postures: togglePosture(current.postures, posture)
          }))
        }
        onClear={() => {
          setFilters(emptyCaseFilters());
          commit(clearedIssueSelection(selection));
        }}
      />
      <div className="cases">
        <CaseList
          rows={rows}
          selectedId={selection.case}
          onSelect={select}
          listsReady={listsReady}
          total={cases.length}
        />
        <CaseDetailPanel
          selected={selected}
          circuits={circuits}
          states={states}
          selection={selection}
          commit={commit}
          detail={detail}
          detailStatus={detailStatus}
        />
      </div>
    </>
  );
}
