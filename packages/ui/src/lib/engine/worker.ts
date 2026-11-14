// O1: runs the engine inside a Web Worker so the UI thread never blocks (Comlink).
// Today it exposes the TypeScript mock; swap the import for the WASM engine when it lands.
import * as Comlink from "comlink";
import { mockEngine } from "./mock";
import type { Engine } from "./types";

const engine: Engine = mockEngine;
export type WorkerApi = Engine;
Comlink.expose(engine);
