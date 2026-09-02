import type { StatusFilter } from "./boardView";

const CHIPS: ReadonlyArray<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "go", label: "Go" },
  { id: "restricted", label: "Restricted" },
  { id: "banned", label: "Banned" }
];

type StateFiltersProps = {
  filter: StatusFilter;
  visible: number;
  tracked: number;
  onChange: (filter: StatusFilter) => void;
};

export function StateFilters({
  filter,
  visible,
  tracked,
  onChange
}: StateFiltersProps) {
  return (
    <div className="filters">
      <span className="kicker">Status</span>
      {CHIPS.map((chip) => (
        <button
          key={chip.id}
          type="button"
          className="chip"
          aria-pressed={filter === chip.id}
          onClick={() => onChange(chip.id)}
        >
          {chip.label}
        </button>
      ))}
      <span className="num rowcount">
        {visible} of {tracked} tracked states
      </span>
    </div>
  );
}
