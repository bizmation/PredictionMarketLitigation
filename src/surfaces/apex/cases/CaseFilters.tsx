import type { Circuit } from "../../../shared/schemas/circuit";
import type { State } from "../../../shared/schemas/state";
import type { Posture } from "../../../shared/schemas/vocabulary";
import {
  CASE_POSTURE_CHIP,
  POSTURE_CHIP_ORDER,
  filtersAreClear,
  sortCircuitIds,
  type CaseFilters
} from "./caseView";

type IssueOption = { slug: string; label: string };

type CaseFiltersProps = {
  filters: CaseFilters;
  visible: number;
  total: number;
  issueOptions: IssueOption[];
  stateCodes: string[];
  states: State[];
  circuitIds: string[];
  circuits: Circuit[];
  onSearch: (q: string) => void;
  onIssue: (issue: string) => void;
  onState: (state: string) => void;
  onCircuit: (circuit: string) => void;
  onTogglePosture: (posture: Posture) => void;
  onClear: () => void;
};

export function CaseFiltersBar({
  filters,
  visible,
  total,
  issueOptions,
  stateCodes,
  states,
  circuitIds,
  circuits,
  onSearch,
  onIssue,
  onState,
  onCircuit,
  onTogglePosture,
  onClear
}: CaseFiltersProps) {
  return (
    <div className="casebar">
      <input
        className="srch"
        type="search"
        placeholder="Search caption, court, docket number, issue tag or state…"
        aria-label="Search cases"
        value={filters.q}
        onChange={(event) => onSearch(event.target.value)}
      />
      <select
        aria-label="Filter by issue tag"
        value={filters.issue}
        onChange={(event) => onIssue(event.target.value)}
      >
        <option value="all">All issue tags</option>
        {issueOptions.map((tag) => (
          <option key={tag.slug} value={tag.slug}>
            {tag.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter by state"
        value={filters.state}
        onChange={(event) => onState(event.target.value)}
      >
        <option value="all">All states</option>
        {stateCodes.map((code) => (
          <option key={code} value={code}>
            {states.find((state) => state.code === code)?.name ?? code}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter by circuit"
        value={filters.circuit}
        onChange={(event) => onCircuit(event.target.value)}
      >
        <option value="all">All circuits</option>
        {sortCircuitIds(circuitIds, circuits).map((id) => (
          <option key={id} value={id}>
            {circuits.find((circuit) => circuit.id === id)?.name ?? id}
          </option>
        ))}
      </select>
      <div className="casechips">
        {POSTURE_CHIP_ORDER.map((posture) => (
          <button
            key={posture}
            type="button"
            className="chip"
            aria-pressed={filters.postures.has(posture)}
            onClick={() => onTogglePosture(posture)}
          >
            {CASE_POSTURE_CHIP[posture]}
          </button>
        ))}
        <button
          type="button"
          className="chip"
          aria-pressed={filtersAreClear(filters)}
          onClick={onClear}
        >
          Clear
        </button>
      </div>
      <span id="case-count" className="num">
        {visible} of {total} cases
      </span>
    </div>
  );
}
