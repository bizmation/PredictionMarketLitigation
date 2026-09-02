import type { Case } from "../../../shared/schemas/caseSchema";
import type { Circuit } from "../../../shared/schemas/circuit";
import type { State } from "../../../shared/schemas/state";
import { formatEtDate } from "../../../shared/lib/dates";
import { PostureSwatch, StatusBadge, UpdatedBadge } from "../../../shared/ui";
import { circuitShortLabel } from "../circuits/circuitView";
import type { BoardSort, BoardSortKey } from "./boardView";
import { isFresh } from "./boardView";

type StateTableProps = {
  rows: State[];
  circuits: Circuit[];
  cases: Case[];
  selectedCode: string | null;
  sort: BoardSort;
  freshness: string | null;
  onSort: (key: BoardSortKey) => void;
  onSelect: (code: string) => void;
};

function ariaSort(
  sort: BoardSort,
  key: BoardSortKey
): "ascending" | "descending" | undefined {
  if (sort.key !== key) return undefined;
  return sort.dir === 1 ? "ascending" : "descending";
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort
}: {
  label: string;
  sortKey: BoardSortKey;
  sort: BoardSort;
  onSort: (key: BoardSortKey) => void;
}) {
  const current = ariaSort(sort, sortKey);
  return (
    <th scope="col" aria-sort={current}>
      <button type="button" onClick={() => onSort(sortKey)}>
        {label}
      </button>
    </th>
  );
}

export function StateTable({
  rows,
  circuits,
  cases,
  selectedCode,
  sort,
  freshness,
  onSort,
  onSelect
}: StateTableProps) {
  return (
    <table className="grid">
      <thead>
        <tr>
          <SortHeader
            label="State"
            sortKey="name"
            sort={sort}
            onSort={onSort}
          />
          <SortHeader
            label="Status"
            sortKey="status"
            sort={sort}
            onSort={onSort}
          />
          <SortHeader
            label="Posture"
            sortKey="posture"
            sort={sort}
            onSort={onSort}
          />
          <th scope="col">Controlling case</th>
          <SortHeader
            label="Updated"
            sortKey="updated"
            sort={sort}
            onSort={onSort}
          />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const circuit = circuits.find((c) => c.id === row.circuitId);
          const controlling = row.controllingCaseId
            ? cases.find((item) => item.id === row.controllingCaseId)
            : undefined;
          return (
            <tr
              key={row.code}
              className="pick"
              aria-selected={selectedCode === row.code}
              onClick={() => onSelect(row.code)}
            >
              <td className="stname">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(row.code);
                  }}
                >
                  {row.name}
                </button>
                {circuit ? (
                  <span className="cite">{circuitShortLabel(circuit)}</span>
                ) : null}
              </td>
              <td>
                <StatusBadge status={row.operationalStatus} />
              </td>
              <td>
                <PostureSwatch posture={row.posture} />
              </td>
              <td>
                {controlling ? (
                  <>
                    <em className="case">{controlling.caption}</em>
                    {controlling.docketNumber ? (
                      <span className="cite">{controlling.docketNumber}</span>
                    ) : null}
                  </>
                ) : (
                  <span className="cite">
                    {row.controllingCaseId
                      ? "Case record not loaded"
                      : "None tracked"}
                  </span>
                )}
              </td>
              <td className="num">
                {formatEtDate(row.updatedAt)}
                {isFresh(row.updatedAt, freshness) ? (
                  <>
                    {" "}
                    <UpdatedBadge />
                  </>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
