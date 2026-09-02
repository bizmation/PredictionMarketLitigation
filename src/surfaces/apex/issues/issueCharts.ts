import type { EChartsOption } from "echarts";

import type { Posture } from "../../../shared/schemas/vocabulary";
import { POSTURE_LABELS } from "../../../shared/ui";
import { CASE_POSTURE_CHIP } from "../cases/caseView";
import {
  emergencePoints,
  frequencyTags,
  matrixCells,
  POST_HEX,
  sunburstTree,
  yAxisLabels,
  type IndexedIssue,
  type MatrixCell
} from "./issueView";

export const CH_FONT = {
  fontFamily: "Lora, Georgia, serif",
  fontSize: 11,
  color: "#605d5d"
};

export const CH_TIP = {
  backgroundColor: "#f3f2f2",
  borderColor: "#605d5d",
  borderWidth: 1,
  padding: [8, 11] as [number, number],
  extraCssText: "box-shadow:0 3px 10px rgba(45,43,43,.16);border-radius:0",
  textStyle: {
    fontFamily: "Lora, Georgia, serif",
    fontSize: 12,
    color: "#201f1d"
  }
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function chartHead(title: string, sub?: string): string {
  return (
    `<div style="font-family:'Cormorant Garamond',serif;font-size:16px;margin-bottom:2px">${escapeHtml(title)}</div>` +
    (sub
      ? `<div style="font-size:11px;color:#605d5d">${escapeHtml(sub)}</div>`
      : "")
  );
}

export type IssueChartHit = {
  kind: "tag" | "case";
  slug?: string;
  caseId?: string;
};

type HitPayload = {
  slug?: string;
  leaf?: boolean;
  caseId?: string;
  tag?: boolean;
  value?: [number, number, number] | number;
};

export function hitFromChartParams(params: {
  data?: unknown;
  name?: string;
  value?: unknown;
}): IssueChartHit | null {
  const data = (params.data ?? {}) as HitPayload;
  if (data.leaf && typeof data.caseId === "string") {
    return { kind: "case", caseId: data.caseId, slug: data.slug };
  }
  if (typeof data.slug === "string") {
    return { kind: "tag", slug: data.slug };
  }
  return null;
}

const axisLabel = (selectedLabel: string | null) => ({
  ...CH_FONT,
  fontSize: 11.5,
  width: 175,
  overflow: "truncate" as const,
  color: (value?: string | number) =>
    String(value ?? "") === selectedLabel ? "#7d5411" : "#444141"
});

export function matrixOption(
  tags: readonly IndexedIssue[],
  postures: readonly Posture[],
  selectedLabel: string | null
): EChartsOption {
  const labels = yAxisLabels(tags);
  const data = matrixCells(tags, postures);
  const max = Math.max(1, ...data.map((cell) => cell.value[2]));
  const bySlug = new Map(tags.map((tag) => [tag.slug, tag]));
  return {
    animation: false,
    backgroundColor: "transparent",
    grid: { left: 190, right: 28, top: 34, bottom: 74 },
    tooltip: {
      ...CH_TIP,
      formatter: (p: { data: MatrixCell }) => {
        const cell = p.data;
        const tag = bySlug.get(cell.slug);
        const posture = postures[cell.value[0]];
        if (!tag || !posture) return "";
        const list = tag.cases.filter((row) => row.posture === posture);
        return (
          chartHead(tag.label, POSTURE_LABELS[posture]) +
          (list.length
            ? list.map((row) => "· " + escapeHtml(row.caption)).join("<br>")
            : "<span style='color:#7d7979'>No matter on this issue has come out this way.</span>")
        );
      }
    },
    xAxis: {
      type: "category",
      position: "top",
      data: postures.map((posture) => CASE_POSTURE_CHIP[posture]),
      axisLine: { show: false },
      axisTick: { show: false },
      splitArea: { show: false },
      axisLabel: { ...CH_FONT, fontSize: 11.5, color: "#201f1d" }
    },
    yAxis: {
      type: "category",
      data: labels,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: axisLabel(selectedLabel)
    },
    visualMap: {
      min: 0,
      max,
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: 8,
      itemWidth: 11,
      itemHeight: 130,
      text: ["more", "none"],
      textStyle: CH_FONT,
      inRange: { color: ["#f8f4f4", "#ffe3bf", "#e1ad66", "#a06f24"] }
    },
    series: [
      {
        type: "heatmap",
        data,
        label: {
          show: true,
          formatter: (p: { data: MatrixCell }) =>
            p.data.value[2] ? String(p.data.value[2]) : "",
          fontFamily: "Lora, Georgia, serif",
          fontSize: 11.5,
          color: (p: { data: MatrixCell }) =>
            p.data.value[2] > max * 0.55 ? "#f8f4f4" : "#201f1d"
        },
        itemStyle: { borderColor: "#f3f2f2", borderWidth: 2 },
        emphasis: { itemStyle: { borderColor: "#b68235", borderWidth: 2 } }
      }
    ]
  } as unknown as EChartsOption;
}

export function timelineOption(
  tags: readonly IndexedIssue[],
  selectedLabel: string | null
): EChartsOption {
  const labels = yAxisLabels(tags);
  const pts = emergencePoints(tags).map((point) => ({
    value: [point.occurredAt, labels.indexOf(point.label)],
    slug: point.slug,
    name: point.label,
    caseId: point.caseId,
    cap: point.caption,
    posture: point.posture,
    primary: point.isControlling,
    when: point.occurredAt
  }));
  return {
    animation: false,
    backgroundColor: "transparent",
    grid: { left: 190, right: 28, top: 22, bottom: 44 },
    tooltip: {
      ...CH_TIP,
      formatter: (p: { data: (typeof pts)[number] }) =>
        chartHead(p.data.cap, p.data.name) +
        `<div style="font-size:11px;color:#605d5d">First on the docket ${p.data.when} · ${POSTURE_LABELS[p.data.posture]}` +
        (p.data.primary ? " · controlling issue" : "") +
        "</div>"
    },
    xAxis: {
      type: "time",
      axisLine: { lineStyle: { color: "#d7d3d3" } },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: "#eae7e7" } },
      axisLabel: { ...CH_FONT, formatter: "{yyyy}-{MM}" }
    },
    yAxis: {
      type: "category",
      data: labels,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: "#eae7e7" } },
      axisLabel: axisLabel(selectedLabel)
    },
    series: [
      {
        type: "scatter",
        data: pts,
        symbolSize: 12,
        itemStyle: {
          color: (p: { data: (typeof pts)[number] }) =>
            POST_HEX[p.data.posture],
          borderColor: "#605d5d",
          borderWidth: 0.8,
          opacity: (p: { data: (typeof pts)[number] }) =>
            !selectedLabel || p.data.name === selectedLabel ? 1 : 0.22
        },
        emphasis: { itemStyle: { borderColor: "#b68235", borderWidth: 2 } }
      }
    ]
  } as unknown as EChartsOption;
}

export function stripOption(
  tags: readonly IndexedIssue[],
  postures: readonly Posture[],
  selectedLabel: string | null
): EChartsOption {
  const ordered = frequencyTags(tags);
  return {
    animation: false,
    backgroundColor: "transparent",
    grid: { left: 190, right: 28, top: 34, bottom: 30 },
    legend: {
      top: 4,
      right: 8,
      itemWidth: 11,
      itemHeight: 11,
      itemGap: 14,
      textStyle: CH_FONT,
      icon: "rect"
    },
    tooltip: {
      ...CH_TIP,
      trigger: "item",
      formatter: (p: { name: string; seriesName: string; value: number }) =>
        chartHead(p.name, p.seriesName) +
        `<span class="num">${p.value}</span> matter${p.value === 1 ? "" : "s"}`
    },
    xAxis: {
      type: "value",
      minInterval: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: "#eae7e7" } },
      axisLabel: CH_FONT
    },
    yAxis: {
      type: "category",
      data: ordered.map((tag) => tag.label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: axisLabel(selectedLabel)
    },
    series: postures.map((posture) => ({
      name: CASE_POSTURE_CHIP[posture],
      type: "bar" as const,
      stack: "n",
      barWidth: 13,
      data: ordered.map((tag) => ({
        value: tag.cases.filter((row) => row.posture === posture).length,
        slug: tag.slug,
        name: tag.label
      })),
      itemStyle: {
        color: POST_HEX[posture],
        borderColor: "#605d5d",
        borderWidth: 0.6
      },
      emphasis: {
        focus: "none" as const,
        itemStyle: { borderColor: "#b68235", borderWidth: 1.6 }
      }
    }))
  } as unknown as EChartsOption;
}

export function sunburstOption(
  tags: readonly IndexedIssue[],
  selectedLabel: string | null
): EChartsOption {
  const data = sunburstTree(tags).map((family) => ({
    ...family,
    children: family.children?.map((tag) => ({
      ...tag,
      itemStyle: {
        color: "#f0e6d4",
        borderColor: tag.name === selectedLabel ? "#b68235" : "#f3f2f2",
        borderWidth: tag.name === selectedLabel ? 2.4 : 1.4
      }
    }))
  }));
  return {
    animation: false,
    backgroundColor: "transparent",
    tooltip: {
      ...CH_TIP,
      trigger: "item",
      formatter: (p: {
        name: string;
        data: {
          leaf?: boolean;
          caption?: string;
          posture?: Posture;
          slug?: string;
          tag?: boolean;
          value?: number;
        };
        value?: number;
      }) => {
        if (p.data.leaf && p.data.caption && p.data.posture) {
          const tag = tags.find((entry) => entry.slug === p.data.slug);
          return chartHead(
            p.data.caption,
            POSTURE_LABELS[p.data.posture] + " · " + (tag?.label ?? "")
          );
        }
        if (p.data.tag) {
          const tag = tags.find((entry) => entry.slug === p.data.slug);
          return chartHead(p.name, `${tag?.cases.length ?? 0} matters`);
        }
        return chartHead(p.name, `${p.value ?? 0} issue tags raised`);
      }
    },
    series: [
      {
        type: "sunburst",
        data,
        radius: ["15%", "86%"],
        center: ["50%", "51%"],
        sort: null,
        nodeClick: false,
        itemStyle: { borderColor: "#f3f2f2", borderWidth: 1.4 },
        label: {
          ...CH_FONT,
          fontSize: 10,
          color: "#444141",
          minAngle: 8,
          rotate: "radial",
          overflow: "truncate",
          width: 96
        },
        levels: [
          {},
          {
            r0: "15%",
            r: "44%",
            label: { rotate: "tangential", fontSize: 11, width: 88 }
          },
          { r0: "44%", r: "76%", label: { fontSize: 10, width: 104 } },
          { r0: "76%", r: "86%", label: { show: false } }
        ],
        emphasis: {
          focus: "ancestor",
          itemStyle: { borderColor: "#b68235", borderWidth: 2 }
        }
      }
    ]
  } as unknown as EChartsOption;
}
