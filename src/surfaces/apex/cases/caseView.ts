import type { CaseListItem } from "../../../shared/schemas/caseSchema";
import type { Circuit } from "../../../shared/schemas/circuit";
import type {
  CaseEntityRole,
  CaseLifecycle,
  Forum,
  Posture
} from "../../../shared/schemas/vocabulary";

export const FORUM_LABELS: Record<Forum, string> = {
  "federal-district": "Federal district",
  "federal-appellate": "Federal appellate",
  state: "State court",
  agency: "Agency"
};

export const CASE_POSTURE_CHIP: Record<Posture, string> = {
  untracked: "Untracked",
  platform: "For platform",
  pending: "Pending",
  state: "For state",
  banned: "Banned"
};

export const LIFECYCLE_LABELS: Record<CaseLifecycle, string> = {
  active: "Active",
  resolved: "Resolved"
};

export const POSTURE_CHIP_ORDER: ReadonlyArray<Posture> = [
  "platform",
  "pending",
  "state",
  "banned",
  "untracked"
];

export type CaseFilters = {
  q: string;
  postures: ReadonlySet<Posture>;
  issue: string;
  state: string;
  circuit: string;
};

export function emptyCaseFilters(): CaseFilters {
  return {
    q: "",
    postures: new Set(),
    issue: "all",
    state: "all",
    circuit: "all"
  };
}

export function filtersAreClear(filters: CaseFilters): boolean {
  return (
    filters.q.trim() === "" &&
    filters.postures.size === 0 &&
    filters.issue === "all" &&
    filters.state === "all" &&
    filters.circuit === "all"
  );
}

function titleRole(role: CaseEntityRole): string {
  return role
    .split("-")
    .map((word, index) =>
      index === 0 ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : word
    )
    .join(" ");
}

export function partyRoleLabel(
  roles: readonly CaseEntityRole[]
): string | null {
  const unique: CaseEntityRole[] = [];
  for (const role of roles) {
    if (!unique.includes(role)) unique.push(role);
  }
  if (unique.length === 0) return null;
  const hasPlaintiff = unique.includes("plaintiff");
  const hasDefendant = unique.includes("defendant");
  if (hasPlaintiff && hasDefendant) return "Both";
  if (hasPlaintiff) return "Plaintiff";
  if (hasDefendant) return "Defendant";
  return unique.map(titleRole).join(" / ");
}

export function uniqueIssueTags(
  rows: readonly CaseListItem[]
): Array<{ slug: string; label: string }> {
  const bySlug = new Map<string, string>();
  for (const row of rows) {
    for (const tag of row.listIssueTags) {
      if (!bySlug.has(tag.slug)) bySlug.set(tag.slug, tag.label);
    }
  }
  return [...bySlug.entries()]
    .map(([slug, label]) => ({ slug, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function uniqueAffectedCodes(rows: readonly CaseListItem[]): string[] {
  const codes = new Set<string>();
  for (const row of rows) {
    for (const code of row.affectedStateCodes) codes.add(code);
  }
  return [...codes].sort((a, b) => a.localeCompare(b));
}

export function uniqueCircuitIds(rows: readonly CaseListItem[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.circuitId) ids.add(row.circuitId);
  }
  return [...ids];
}

export function sortCircuitIds(
  ids: readonly string[],
  circuits: readonly Circuit[]
): string[] {
  const byId = new Map(circuits.map((row) => [row.id, row]));
  return [...ids].sort((a, b) => {
    const left = byId.get(a);
    const right = byId.get(b);
    const leftNumber = left?.number;
    const rightNumber = right?.number;
    if (
      leftNumber != null &&
      rightNumber != null &&
      leftNumber !== rightNumber
    ) {
      return leftNumber - rightNumber;
    }
    if (leftNumber != null && rightNumber == null) return -1;
    if (leftNumber == null && rightNumber != null) return 1;
    return (left?.name ?? a).localeCompare(right?.name ?? b);
  });
}

export function caseMatches(
  row: CaseListItem,
  filters: CaseFilters,
  stateNames: ReadonlyMap<string, string> = new Map()
): boolean {
  if (
    filters.issue !== "all" &&
    !row.listIssueTags.some((tag) => tag.slug === filters.issue)
  ) {
    return false;
  }
  if (
    filters.state !== "all" &&
    !row.affectedStateCodes.includes(filters.state)
  ) {
    return false;
  }
  if (filters.circuit !== "all" && row.circuitId !== filters.circuit) {
    return false;
  }
  if (filters.postures.size > 0 && !filters.postures.has(row.posture)) {
    return false;
  }
  const q = filters.q.trim().toLowerCase();
  if (!q) return true;
  const names = row.affectedStateCodes
    .map((code) => stateNames.get(code) ?? "")
    .join(" ");
  const haystack = [
    row.caption,
    row.court,
    row.docketNumber ?? "",
    ...row.listIssueTags.map((tag) => `${tag.label} ${tag.slug}`),
    ...row.affectedStateCodes,
    names
  ]
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((token) => haystack.includes(token));
}

export function togglePosture(
  postures: ReadonlySet<Posture>,
  posture: Posture
): Set<Posture> {
  const next = new Set(postures);
  if (next.has(posture)) next.delete(posture);
  else next.add(posture);
  return next;
}
