import { POSTURE_LABELS, PostureSwatch } from "../../../shared/ui";
import type { Circuit } from "../../../shared/schemas/circuit";
import type { State } from "../../../shared/schemas/state";
import type { Posture } from "../../../shared/schemas/vocabulary";
import type { ApexSelection } from "../selection";
import { circStroke, circuitShortLabel, POSTURE_RAMP } from "./circuitView";

type CircuitLegendProps = {
  circuits: Circuit[];
  states: State[];
  selection: ApexSelection;
  mapPostures: ReadonlySet<Posture>;
  onTogglePosture: (posture: Posture | null) => void;
  onSelectCircuit: (circuitId: string | null) => void;
};

function countPosture(states: State[], posture: Posture): number {
  return states.filter((state) => state.posture === posture).length;
}

export function CircuitLegend({
  circuits,
  states,
  selection,
  mapPostures,
  onTogglePosture,
  onSelectCircuit
}: CircuitLegendProps) {
  const allPostures = mapPostures.size === 0;

  return (
    <div className="legend">
      <div className="legrow">
        <span className="lg-label">Posture</span>
        <button
          type="button"
          className="pchip"
          aria-pressed={allPostures}
          title="Show every posture"
          onClick={() => onTogglePosture(null)}
        >
          All <b>{states.length}</b>
        </button>
        {POSTURE_RAMP.map((posture) => (
          <button
            key={posture}
            type="button"
            className="pchip"
            data-posture={posture}
            aria-pressed={!allPostures && mapPostures.has(posture)}
            title={POSTURE_LABELS[posture]}
            onClick={() => onTogglePosture(posture)}
          >
            <PostureSwatch posture={posture} showLabel={false} />
            {POSTURE_LABELS[posture]} <b>{countPosture(states, posture)}</b>
          </button>
        ))}
      </div>
      <div className="legrow">
        <span className="lg-label">Circuit</span>
        <button
          type="button"
          className="cchip"
          aria-pressed={selection.circuit === null}
          onClick={() => onSelectCircuit(null)}
        >
          All
        </button>
        {circuits.map((circuit) => (
          <button
            key={circuit.id}
            type="button"
            className="cchip"
            data-circuit={circuit.id}
            aria-pressed={selection.circuit === circuit.id}
            title={circuit.name}
            onClick={() => onSelectCircuit(circuit.id)}
          >
            <i style={{ borderTopColor: circStroke(circuit.id) }} />
            {circuitShortLabel(circuit)}
          </button>
        ))}
      </div>
    </div>
  );
}
