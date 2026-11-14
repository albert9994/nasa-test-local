// The single place that decides which engine answers. Today: the TypeScript mock (runs on real NASA POWER data).
// When Albert's WASM build lands (A6/A8), add a `wasm` engine here (inside a Web Worker via Comlink, O1)
// and switch the default; the UI does not change because every engine implements the same `Engine` interface (C3).
import { mockEngine } from "./mock";
import type { Engine } from "./types";

let current: Engine = mockEngine;

export function getEngine(): Engine {
  return current;
}
export function setEngine(e: Engine) {
  current = e;
}
export * from "./types";
export { CROPS, cropName, rotationLabel, DEFAULT_SERIES } from "./mock";
