import React from "react";
import { createRoot, Root } from "react-dom/client";
import { ChartsToolkitDemo } from "./demo";
import { FanChart } from "./FanChart";
import { HeatmapChart } from "./HeatmapChart";
import { MultiLineChart } from "./MultiLineChart";
import { ScatterChart } from "./ScatterChart";
import {
  FanChartProps,
  HeatmapChartProps,
  MultiLineChartProps,
  ScatterChartProps,
} from "./types";

export * from "./types";
export * from "./theme";
export { MultiLineChart } from "./MultiLineChart";
export { HeatmapChart } from "./HeatmapChart";
export { ScatterChart } from "./ScatterChart";
export { FanChart } from "./FanChart";
export { ChartsToolkitDemo } from "./demo";

const mountedRoots = new WeakMap<HTMLElement, Root>();

function mountIntoSlot(el: HTMLElement, node: React.ReactElement): void {
  let root = mountedRoots.get(el);
  if (!root) {
    root = createRoot(el);
    mountedRoots.set(el, root);
  }
  root.render(node);
}

export function renderMultiLineChart(el: HTMLElement, data: MultiLineChartProps): void {
  mountIntoSlot(el, React.createElement(MultiLineChart, data));
}

export function renderHeatmapChart(el: HTMLElement, data: HeatmapChartProps): void {
  mountIntoSlot(el, React.createElement(HeatmapChart, data));
}

export function renderScatterChart(el: HTMLElement, data: ScatterChartProps): void {
  mountIntoSlot(el, React.createElement(ScatterChart, data));
}

export function renderFanChart(el: HTMLElement, data: FanChartProps): void {
  mountIntoSlot(el, React.createElement(FanChart, data));
}

export function renderChartsDemo(el: HTMLElement): void {
  mountIntoSlot(el, React.createElement(ChartsToolkitDemo, {}));
}
