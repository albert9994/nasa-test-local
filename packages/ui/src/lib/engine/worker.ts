// O1: runs the engine inside a Web Worker so the UI thread never blocks (Comlink).
// The Rust engine (WASM) is loaded here, inside the worker: if anything fails (module missing, no WebAssembly,
// init error) the worker silently falls back to the TypeScript mock, so the app always works.
import * as Comlink from "comlink";
import { mockEngine } from "./mock";
import type { Engine } from "./types";

let impl: Engine = mockEngine;
const ready: Promise<void> = (async () => {
  try {
    const { createWasmEngine } = await import("./wasm");
    impl = await createWasmEngine();
  } catch (err) {
    console.warn("engine-wasm unavailable in the worker, using the TypeScript mock", err);
    impl = mockEngine;
  }
})();

/** Every call waits for the (one-time) WASM start-up, then goes to whichever engine won. */
const engine: Engine = {
  // Comlink awaits promise-valued properties, so the main thread reads the *final* kind ("wasm" or "mock")
  get kind() { return ready.then(() => impl.kind) as unknown as Engine["kind"]; },
  prepareFarm: async (...a) => (await ready, impl.prepareFarm(...a)),
  simulateSeason: async (...a) => (await ready, impl.simulateSeason(...a)),
  simulateRotation: async (...a) => (await ready, impl.simulateRotation(...a)),
  adaptationMargin: async (...a) => (await ready, impl.adaptationMargin(...a)),
  frontier: async (...a) => (await ready, impl.frontier(...a)),
  optimize: async (...a) => (await ready, impl.optimize(...a)),
  pickThree: async (...a) => (await ready, impl.pickThree(...a)),
  marginYear: async (...a) => (await ready, impl.marginYear(...a)),
  marketShock: async (...a) => (await ready, impl.marketShock(...a)),
  quantSimulate: async (...a) => (await ready, impl.quantSimulate(...a)),
  factSheet: async (...a) => (await ready, impl.factSheet(...a)),
  validate: async (...a) => {
    await ready;
    if (!impl.validate) throw new Error("validate is only available in the Rust engine");
    return impl.validate(...a);
  },
};
export type WorkerApi = Engine;
Comlink.expose(engine);
