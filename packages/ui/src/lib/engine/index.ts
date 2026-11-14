// The single place that decides which engine answers. In the browser the engine lives in a Web Worker (Comlink, O1) and
// is the Rust engine compiled to WASM (`wasm.ts`, loaded inside the worker); if the WASM cannot load, the worker falls
// back to the TypeScript mock (runs on real NASA POWER data). Every engine implements the same `Engine` interface (C3),
// so the UI does not change. `getEngine().kind` says which one answers ("wasm" | "mock" | "server").
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
export { createWasmEngine } from "./wasm";
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
