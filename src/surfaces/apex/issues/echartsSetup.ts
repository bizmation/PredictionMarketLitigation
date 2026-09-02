import * as echarts from "echarts/core";
import {
  BarChart,
  HeatmapChart,
  ScatterChart,
  SunburstChart
} from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";

echarts.use([
  SVGRenderer,
  HeatmapChart,
  ScatterChart,
  BarChart,
  SunburstChart,
  GridComponent,
  TooltipComponent,
  VisualMapComponent,
  LegendComponent
]);

export { echarts };
