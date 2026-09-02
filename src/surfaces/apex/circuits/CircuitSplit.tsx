import { useState } from "react";

import { formatEtDate } from "../../../shared/lib/dates";
import type { Posture } from "../../../shared/schemas/vocabulary";
import { useApexF1 } from "../ApexF1Context";
import {
  clearCircuitSelection,
  selectionForCircuit,
  selectionForState
} from "../selection";
import { CircuitIndex } from "./CircuitIndex";
import { CircuitLegend } from "./CircuitLegend";
import { CircuitMap } from "./CircuitMap";
import { maxUpdatedAt } from "./circuitView";

export function CircuitSplit() {
  const { circuits, states, cases, selection, commit, statusFilter } =
    useApexF1();
  const [mapPostures, setMapPostures] = useState<Set<Posture>>(new Set());
  const [showCirc, setShowCirc] = useState(true);

  const freshness = maxUpdatedAt([...states, ...circuits]);

  function togglePosture(posture: Posture | null) {
    if (posture === null) {
      setMapPostures(new Set());
      return;
    }
    setMapPostures((prev) => {
      const next = new Set(prev);
      if (next.has(posture)) next.delete(posture);
      else next.add(posture);
      return next;
    });
  }

  function selectState(code: string) {
    commit(selectionForState(code, states));
  }

  function selectCircuit(circuitId: string | null) {
    if (circuitId === null) {
      commit(clearCircuitSelection(selection));
      return;
    }
    commit(selectionForCircuit(circuitId, states, selection));
  }

  return (
    <>
      <CircuitLegend
        circuits={circuits}
        states={states}
        selection={selection}
        mapPostures={mapPostures}
        onTogglePosture={togglePosture}
        onSelectCircuit={selectCircuit}
      />
      <div className="f1">
        <div className="mapcard">
          <div className="caphead">
            <span className="kicker">Controlling posture by state</span>
            <button
              type="button"
              className="chip"
              aria-pressed={showCirc}
              onClick={() => setShowCirc((on) => !on)}
            >
              Circuit overlay
            </button>
            {freshness ? (
              <span className="num map-fresh">
                Updated {formatEtDate(freshness)}
              </span>
            ) : null}
          </div>
          <CircuitMap
            states={states}
            circuits={circuits}
            cases={cases}
            selection={selection}
            mapPostures={mapPostures}
            statusFilter={statusFilter}
            showCirc={showCirc}
            onSelectState={selectState}
            onSelectCircuit={(id) => selectCircuit(id)}
          />
        </div>
        <CircuitIndex
          circuits={circuits}
          selectedCircuitId={selection.circuit}
          onSelect={(id) => selectCircuit(id)}
        />
      </div>
    </>
  );
}
