import { useEffect, useRef, useState } from "react";
import type { EChartsOption } from "echarts";

import { EmptyState } from "../../../shared/ui";
import { echarts } from "./echartsSetup";
import { hitFromChartParams, type IssueChartHit } from "./issueCharts";

export const CHART_FALLBACK_TITLE = "Chart library did not load";
export const CHART_FALLBACK =
  "The issue tags are still on every case in the record below. This view is a second reading of the same record, never the only one.";

type ChartInstance = ReturnType<typeof echarts.init>;

type ChartInit = (
  el: HTMLDivElement,
  theme?: string | object | null,
  opts?: { renderer: "svg" }
) => ChartInstance | null;

export function bindIssueChart(
  el: HTMLDivElement,
  init: ChartInit,
  onParams: (params: { data?: unknown; name?: string; value?: unknown }) => void
): ChartInstance | null {
  let chart: ChartInstance | null = null;
  try {
    chart = init(el, null, { renderer: "svg" });
    if (!chart) return null;
    chart.on("click", onParams);
    return chart;
  } catch {
    chart?.dispose();
    return null;
  }
}

type IssueChartProps = {
  option: EChartsOption;
  height: number;
  highlightName: string | null;
  onHit: (hit: IssueChartHit) => void;
};

export function IssueChart({
  option,
  height,
  highlightName,
  onHit
}: IssueChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartInstance | null>(null);
  const onHitRef = useRef(onHit);
  const [failed, setFailed] = useState(false);
  onHitRef.current = onHit;

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const chart = bindIssueChart(
      el,
      (node, theme, opts) => echarts.init(node, theme, opts),
      (params) => {
        const hit = hitFromChartParams(params);
        if (hit) onHitRef.current(hit);
      }
    );
    if (!chart) {
      setFailed(true);
      return;
    }
    chartRef.current = chart;
    setFailed(false);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => chartRef.current?.resize(), 160);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(timer);
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || failed) return;
    chart.setOption(option, { notMerge: true });
    chart.dispatchAction({ type: "downplay" });
    if (highlightName) {
      chart.dispatchAction({ type: "highlight", name: highlightName });
    }
  }, [option, highlightName, failed]);

  return (
    <>
      <div ref={hostRef} className="chart" style={{ height }} hidden={failed} />
      <div hidden={!failed}>
        <EmptyState title={CHART_FALLBACK_TITLE} hint={CHART_FALLBACK}>
          Issue tags still exist on the case records below; this chart is not a
          taxonomy of its own.
        </EmptyState>
      </div>
    </>
  );
}
