import { useState } from "react";

import { formatEtDate } from "../../../shared/lib/dates";
import type { Posture } from "../../../shared/schemas/vocabulary";
import { useApexF1 } from "../ApexF1Context";
import {
  toggleCircuitLayer,
  selectedCircuitLayers,
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

  const layers = selectedCircuitLayers(selection);
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
    commit(selectionForState(code, states, selection));
  }

  function selectCircuit(circuitId: string | null) {
    commit(toggleCircuitLayer(selection, circuitId));
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
      <p className="map-selection-help">
        Toggle circuits to compare several at once. Selecting a layer keeps you
        on the map.{" "}
        <span aria-live="polite">
          {layers.length === 0
            ? "All circuits shown."
            : `${layers.length} circuit ${layers.length === 1 ? "layer" : "layers"} selected.`}
        </span>
      </p>
      {layers.includes("cir-fed") && (
        <p className="map-selection-help">
          The Federal Circuit has nationwide subject-matter jurisdiction, so it
          has no separate geographic outline.
        </p>
      )}
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
          selectedCircuitIds={layers}
          onSelect={(id) => selectCircuit(id)}
        />
      </div>
    </>
  );
}
