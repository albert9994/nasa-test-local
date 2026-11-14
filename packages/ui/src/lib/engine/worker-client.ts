// O1: main-thread side of the engine worker. Implements `Engine` by forwarding every call over Comlink.
import * as Comlink from "comlink";
import type { Engine } from "./types";
import type { WorkerApi } from "./worker";

export async function createWorkerEngine(): Promise<Engine> {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  const api = Comlink.wrap<WorkerApi>(worker);
  // Fail fast (and let the caller fall back) if the worker did not boot. The worker resolves `kind` only after its
  // WASM start-up finished, so this is the engine that will actually answer ("wasm", or "mock" after a fallback).
  const kind = await Promise.race([
    Promise.resolve(api.kind),
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error("engine worker timeout")), 20000)),
  ]);
  const e = api;
  return {
    kind,
    prepareFarm: (...a) => e.prepareFarm(...a),
    simulateSeason: (...a) => e.simulateSeason(...a),
    simulateRotation: (...a) => e.simulateRotation(...a),
    adaptationMargin: (...a) => e.adaptationMargin(...a),
    frontier: (...a) => e.frontier(...a),
    optimize: (...a) => e.optimize(...a),
    pickThree: (...a) => e.pickThree(...a),
    marginYear: (...a) => e.marginYear(...a),
    marketShock: (...a) => e.marketShock(...a),
    quantSimulate: (...a) => e.quantSimulate(...a),
    factSheet: (...a) => e.factSheet(...a),
    validate: (...a) => (e as unknown as Required<Engine>).validate(...a),
  };
}
