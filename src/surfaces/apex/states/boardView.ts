import { POSTURE_RAMP } from "../circuits/circuitView";
import type { State } from "../../../shared/schemas/state";
import type {
  OperationalStatus,
  Posture
} from "../../../shared/schemas/vocabulary";

/**
 * Board filter/sort helpers — pure, no `window`.
 *
 * Operational status is the filter axis. Posture is an independent sort key.
 * Do not collapse `banned` across the two enums.
 */

export type StatusFilter = "all" | "go" | "restricted" | "banned";

export type BoardSortKey = "name" | "status" | "posture" | "updated";

export type BoardSort = {
  key: BoardSortKey;
  dir: 1 | -1;
};

export const DEFAULT_BOARD_SORT: BoardSort = { key: "name", dir: 1 };

const STATUS_ORDER: Record<OperationalStatus, number> = {
  go: 0,
  restricted: 1,
  banned: 2,
  unknown: 3
};

const POSTURE_ORDER = Object.fromEntries(
  POSTURE_RAMP.map((posture, index) => [posture, index])
) as Record<Posture, number>;

export function trackedStates(states: readonly State[]): State[] {
  return states.filter((state) => state.posture !== "untracked");
}

export function filterByStatus(
  rows: readonly State[],
  filter: StatusFilter
): State[] {
  if (filter === "all") return [...rows];
  return rows.filter((row) => row.operationalStatus === filter);
}

export function rowMatchesStatusFilter(
  row: { operationalStatus?: string } | undefined,
  filter: StatusFilter
): boolean {
  if (filter === "all") return true;
  return row?.operationalStatus === filter;
}

export function nextBoardSort(
  current: BoardSort,
  key: BoardSortKey
): BoardSort {
  if (current.key === key) {
    return { key, dir: current.dir === 1 ? -1 : 1 };
  }
  return { key, dir: 1 };
}

export function sortBoardRows(
  rows: readonly State[],
  sort: BoardSort
): State[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    let cmp = 0;
    if (sort.key === "name") cmp = a.name.localeCompare(b.name);
    else if (sort.key === "status") {
      cmp =
        STATUS_ORDER[a.operationalStatus] - STATUS_ORDER[b.operationalStatus];
    } else if (sort.key === "posture") {
      cmp = POSTURE_ORDER[a.posture] - POSTURE_ORDER[b.posture];
    } else {
      cmp = a.updatedAt.localeCompare(b.updatedAt);
    }
    if (cmp === 0) cmp = a.name.localeCompare(b.name);
    return cmp * sort.dir;
  });
  return copy;
}

/** 30 UTC days before a published freshness stamp — same arithmetic as kpisRepo. */
export function windowStartUtc(freshness: string): string {
  const start = new Date(freshness);
  start.setUTCDate(start.getUTCDate() - 30);
  return start.toISOString();
}

export function isFresh(updatedAt: string, freshness: string | null): boolean {
  if (!freshness) return false;
  const start = new Date(freshness);
  if (Number.isNaN(start.getTime())) return false;
  return updatedAt >= windowStartUtc(freshness);
}
