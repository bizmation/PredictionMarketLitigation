import type {
  EntityFootprint,
  EntityListItem
} from "../../../shared/schemas/entity";
import type {
  CaseEntityRole,
  OperationalStatus
} from "../../../shared/schemas/vocabulary";
import { partyRoleLabel } from "../cases/caseView";

export type EntityMetrics = {
  total: number;
  plaintiff: number;
  defendant: number;
  appellate: number;
};

export type GroupedFootprint = {
  go: EntityFootprint[];
  restricted: EntityFootprint[];
  banned: EntityFootprint[];
  unknown: EntityFootprint[];
};

export function entityMetrics(item: EntityListItem): EntityMetrics {
  let plaintiff = 0;
  let defendant = 0;
  let appellate = 0;
  for (const matter of item.matters) {
    if (matter.role === "plaintiff") plaintiff += 1;
    if (matter.role === "defendant") defendant += 1;
    if (matter.forum === "federal-appellate") appellate += 1;
  }
  return {
    total: item.matters.length,
    plaintiff,
    defendant,
    appellate
  };
}

export function groupFootprint(item: EntityListItem): GroupedFootprint {
  const grouped: GroupedFootprint = {
    go: [],
    restricted: [],
    banned: [],
    unknown: []
  };
  for (const row of item.footprint) {
    grouped[row.operationalStatus].push(row);
  }
  return grouped;
}

export function roleTagLabel(role: CaseEntityRole): string {
  return partyRoleLabel([role]) ?? role;
}

export function footprintBarSegments(
  grouped: GroupedFootprint
): Array<{ status: Exclude<OperationalStatus, "unknown">; count: number }> {
  return (
    [
      ["go", grouped.go.length],
      ["restricted", grouped.restricted.length],
      ["banned", grouped.banned.length]
    ] as const
  )
    .filter(([, count]) => count > 0)
    .map(([status, count]) => ({ status, count }));
}
