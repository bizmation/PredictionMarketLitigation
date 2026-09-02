import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from "react";

import type { CaseListItem } from "../../shared/schemas/caseSchema";
import type { Circuit } from "../../shared/schemas/circuit";
import type { State } from "../../shared/schemas/state";
import { useCircuitData } from "./circuits/useCircuitData";
import type { ApexSelection } from "./selection";
import type { StatusFilter } from "./states/boardView";
import { useApexSelection } from "./useApexSelection";

/**
 * Shared F1 lists + URL selection for the heat map and status board.
 *
 * Instantiating `useApexSelection` twice desyncs the two bands. This provider
 * is the one hook. Filter chips stay local — they are not a URL param.
 */

export type ApexF1Value = {
  circuits: Circuit[];
  states: State[];
  cases: CaseListItem[];
  listsReady: boolean;
  selection: ApexSelection;
  commit: (next: ApexSelection) => void;
  statusFilter: StatusFilter;
  setStatusFilter: Dispatch<SetStateAction<StatusFilter>>;
  /** Bumps on every `commit` so a re-select of the same code refetches detail. */
  detailEpoch: number;
};

const ApexF1Context = createContext<ApexF1Value | null>(null);

export function ApexF1Provider({ children }: { children: ReactNode }) {
  const { circuits, states, cases, listsReady } = useCircuitData();
  const stateCodes = useMemo(() => states.map((state) => state.code), [states]);
  const circuitIds = useMemo(
    () => circuits.map((circuit) => circuit.id),
    [circuits]
  );
  const caseIds = useMemo(() => cases.map((row) => row.id), [cases]);
  const { selection, commit: writeSelection } = useApexSelection(
    stateCodes,
    circuitIds,
    caseIds,
    listsReady
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [detailEpoch, setDetailEpoch] = useState(0);
  const commit = useCallback(
    (next: ApexSelection) => {
      writeSelection(next);
      setDetailEpoch((n) => n + 1);
    },
    [writeSelection]
  );

  const value = useMemo<ApexF1Value>(
    () => ({
      circuits,
      states,
      cases,
      listsReady,
      selection,
      commit,
      statusFilter,
      setStatusFilter,
      detailEpoch
    }),
    [
      circuits,
      states,
      cases,
      listsReady,
      selection,
      commit,
      statusFilter,
      detailEpoch
    ]
  );

  return (
    <ApexF1Context.Provider value={value}>{children}</ApexF1Context.Provider>
  );
}

export function useApexF1(): ApexF1Value {
  const value = useContext(ApexF1Context);
  if (!value) {
    throw new Error("useApexF1 must be used inside ApexF1Provider");
  }
  return value;
}

/** Test-only: inject lists and selection without fetching. */
export function ApexF1Stub({
  value,
  children
}: {
  value: ApexF1Value;
  children: ReactNode;
}) {
  return (
    <ApexF1Context.Provider value={value}>{children}</ApexF1Context.Provider>
  );
}
