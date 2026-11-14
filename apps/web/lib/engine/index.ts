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

export type EngineVia = "main thread" | "web worker";
let via: EngineVia = "main thread";
export function engineVia(): EngineVia {
  return via;
}

let booting: Promise<EngineVia> | null = null;
/** Moves the engine into a Web Worker when the browser supports it; falls back to the main-thread mock on any error. Idempotent. */
export function useWorkerEngine(): Promise<EngineVia> {
  if (!booting) {
    booting = (async () => {
      if (typeof window === "undefined" || typeof window.Worker === "undefined") return via;
      try {
        const { createWorkerEngine } = await import("./worker-client");
        setEngine(await createWorkerEngine());
        via = "web worker";
      } catch (err) {
        console.warn("engine worker unavailable, using main-thread engine", err);
        setEngine(mockEngine);
        via = "main thread";
      }
      return via;
    })();
  }
  return booting;
}
export * from "./types";
export { CROPS, cropName, rotationLabel, DEFAULT_SERIES } from "./mock";
