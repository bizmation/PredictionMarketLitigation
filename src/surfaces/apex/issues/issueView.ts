import type { CaseListItem } from "../../../shared/schemas/caseSchema";
import type { Posture } from "../../../shared/schemas/vocabulary";
import { POSTURE_CHIP_ORDER } from "../cases/caseView";

export const ISSUE_FAMILY: Record<string, string> = {
  "cea-preemption": "Federal preemption",
  "swap-definition": "Federal preemption",
  "cftc-offensive": "Federal jurisdiction",
  "certiorari-path": "Federal jurisdiction",
  "sports-event-contracts": "State gaming law",
  "state-enforcement": "State gaming law",
  "statutory-ban": "State gaming law",
  geofencing: "Consumer & fiscal"
};

export const FAMILY_ORDER = [
  "Federal preemption",
  "Federal jurisdiction",
  "Indian gaming",
  "State gaming law",
  "Consumer & fiscal"
] as const;

export const POST_HEX: Record<Posture, string> = {
  platform: "#a8dcb9",
  pending: "#e9d59b",
  state: "#e0a583",
  banned: "#b05541",
  untracked: "#f6f5f3"
};

export type IndexedIssue = {
  slug: string;
  label: string;
  family: string;
  cases: CaseListItem[];
  controllingCount: number;
};

export type EmergencePoint = {
  slug: string;
  label: string;
  caseId: string;
  caption: string;
  posture: Posture;
  occurredAt: string;
  isControlling: boolean;
};

export type SunburstNode = {
  name: string;
  slug?: string;
  tag?: boolean;
  leaf?: boolean;
  caseId?: string;
  caption?: string;
  posture?: Posture;
  value?: number;
  itemStyle?: { color: string };
  children?: SunburstNode[];
};

export function familyOf(slug: string): string {
  return ISSUE_FAMILY[slug] ?? "Other";
}

function familyRank(family: string): number {
  const index = (FAMILY_ORDER as readonly string[]).indexOf(family);
  return index === -1 ? FAMILY_ORDER.length : index;
}

export function indexIssues(rows: readonly CaseListItem[]): IndexedIssue[] {
  const map = new Map<string, IndexedIssue>();
  for (const row of rows) {
    for (const tag of row.listIssueTags) {
      const existing = map.get(tag.slug);
      if (!existing) {
        map.set(tag.slug, {
          slug: tag.slug,
          label: tag.label,
          family: familyOf(tag.slug),
          cases: [row],
          controllingCount: tag.isControlling ? 1 : 0
        });
      } else {
        if (!existing.cases.some((matter) => matter.id === row.id)) {
          existing.cases.push(row);
        }
        if (tag.isControlling) existing.controllingCount += 1;
      }
    }
  }
  return [...map.values()].sort((a, b) => {
    const family = familyRank(a.family) - familyRank(b.family);
    if (family !== 0) return family;
    if (b.cases.length !== a.cases.length)
      return b.cases.length - a.cases.length;
    return a.label.localeCompare(b.label);
  });
}

/** Posture columns that appear on at least one tagged case. Empty outcomes omitted. */
export function matrixPostureColumns(rows: readonly CaseListItem[]): Posture[] {
  const tagged = rows.filter((row) => row.listIssueTags.length > 0);
  return POSTURE_CHIP_ORDER.filter((posture) =>
    tagged.some((row) => row.posture === posture)
  );
}

export function yAxisLabels(tags: readonly IndexedIssue[]): string[] {
  return tags
    .map((tag) => tag.label)
    .slice()
    .reverse();
}

export type MatrixCell = {
  value: [number, number, number];
  slug: string;
  name: string;
};

export function matrixCells(
  tags: readonly IndexedIssue[],
  postures: readonly Posture[]
): MatrixCell[] {
  const labels = yAxisLabels(tags);
  const data: MatrixCell[] = [];
  for (const tag of tags) {
    const yi = labels.indexOf(tag.label);
    for (let xi = 0; xi < postures.length; xi++) {
      const posture = postures[xi]!;
      data.push({
        value: [
          xi,
          yi,
          tag.cases.filter((row) => row.posture === posture).length
        ],
        slug: tag.slug,
        name: tag.label
      });
    }
  }
  return data;
}

export function emergencePoints(
  tags: readonly IndexedIssue[]
): EmergencePoint[] {
  const points: EmergencePoint[] = [];
  for (const tag of tags) {
    for (const row of tag.cases) {
      if (row.firstOccurredAt === null) continue;
      const match = row.listIssueTags.find((entry) => entry.slug === tag.slug);
      points.push({
        slug: tag.slug,
        label: tag.label,
        caseId: row.id,
        caption: row.caption,
        posture: row.posture,
        occurredAt: row.firstOccurredAt,
        isControlling: match?.isControlling ?? false
      });
    }
  }
  return points;
}

export function frequencyTags(tags: readonly IndexedIssue[]): IndexedIssue[] {
  return [...tags].sort((a, b) => a.cases.length - b.cases.length);
}

const LEAF_PREFIX =
  /^(KalshiEX LLC|Kalshi Inc\.?|United States|Commonwealth|State of Washington) v\. /;

export function shortCaption(caption: string): string {
  return caption.replace(LEAF_PREFIX, "v. ");
}

const FAM_TINT = ["#e1ad66", "#c9b48c", "#b8a08e", "#c2a26b", "#ad9c85"];

export function sunburstTree(tags: readonly IndexedIssue[]): SunburstNode[] {
  return FAMILY_ORDER.flatMap((family, fi) => {
    const members = tags.filter((tag) => tag.family === family);
    if (members.length === 0) return [];
    return [
      {
        name: family,
        itemStyle: { color: FAM_TINT[fi % FAM_TINT.length]! },
        children: members.map((tag) => ({
          name: tag.label,
          slug: tag.slug,
          tag: true,
          itemStyle: { color: "#f0e6d4" },
          children: tag.cases.map((row) => ({
            name: shortCaption(row.caption),
            value: 1,
            leaf: true,
            caseId: row.id,
            caption: row.caption,
            slug: tag.slug,
            posture: row.posture,
            itemStyle: { color: POST_HEX[row.posture] }
          }))
        }))
      }
    ];
  });
}

export function issueBarCopy(
  selected: IndexedIssue | null,
  tagCount: number,
  matterCount: number
): { empty: boolean; lead: string | null; hint: string } {
  if (!selected) {
    return {
      empty: true,
      lead: null,
      hint: `${tagCount} issue tags across ${matterCount} matters. Select a cell, a mark, a bar or a branch to filter the record below.`
    };
  }
  return {
    empty: false,
    lead: selected.label,
    hint: `${selected.cases.length} matter${selected.cases.length === 1 ? "" : "s"} · controlling in ${selected.controllingCount}`
  };
}
