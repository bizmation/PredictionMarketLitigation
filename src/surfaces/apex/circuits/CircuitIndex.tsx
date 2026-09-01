import { POSTURE_LABELS, PostureSwatch } from "../../../shared/ui";
import type { Circuit } from "../../../shared/schemas/circuit";
import { circuitShortLabel } from "./circuitView";

type CircuitIndexProps = {
  circuits: Circuit[];
  selectedCircuitId: string | null;
  onSelect: (circuitId: string) => void;
};

export function CircuitIndex({
  circuits,
  selectedCircuitId,
  onSelect
}: CircuitIndexProps) {
  const tracked = circuits.filter(
    (circuit) => circuit.posture !== "untracked"
  ).length;

  return (
    <div className="circuits">
      <div className="caphead">
        <span className="kicker">Courts of appeals</span>
        <span className="num index-count">
          {tracked} of {circuits.length} with tracked activity
        </span>
      </div>
      {circuits.map((circuit) => {
        const trackedRow = circuit.posture !== "untracked";
        const label = circuitShortLabel(circuit);
        return (
          <button
            key={circuit.id}
            type="button"
            className="crow"
            data-circuit={circuit.id}
            data-posture={circuit.posture}
            aria-pressed={selectedCircuitId === circuit.id}
            aria-label={`${label} ${circuit.name}, ${POSTURE_LABELS[circuit.posture]}`}
            onClick={() => onSelect(circuit.id)}
          >
            <span className="cnum">{label}</span>
            <span className="cbody">
              <span className="cname">{circuit.name}</span>
              <br />
              <span className={trackedRow ? "ccase" : "cnone"}>
                {trackedRow && circuit.summary
                  ? circuit.summary
                  : "No tracked activity"}
              </span>
            </span>
            <PostureSwatch posture={circuit.posture} showLabel={false} />
          </button>
        );
      })}
    </div>
  );
}
