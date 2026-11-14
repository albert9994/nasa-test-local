// Native engine adapter for the desktop app (V2-B2).
// Every `Engine` method becomes a Tauri command that runs `fieldshift-core` in Rust (see apps/desktop/src-tauri/src/native.rs).
// The commands exist when the app is built with the default cargo feature `native-engine`; without it `engine_info` returns an error and
// `useNativeEngine()` resolves to false, so the UI keeps the TypeScript engine (Web Worker). No Tauri npm package is imported
// here: we call the invoke bridge Tauri injects, so the website bundle never pulls Tauri in.
import type { Engine, FarmPack } from "./types";
import { mockEngine } from "./mock";
import { loadQuantParams } from "./quant-params";
import { setEngine, setEngineVia } from "./index";
import { isTauri } from "@/lib/store/farm-storage";

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

function bridge(): Invoke | null {
  if (!isTauri()) return null;
  const w = window as unknown as { __TAURI_INTERNALS__?: { invoke?: Invoke } };
  return w.__TAURI_INTERNALS__?.invoke ?? null;
}

export interface NativeEngineInfo { kind?: "native"; name: string; version: string; threads?: number }

/** Quant paths the native engine runs by default (WASM keeps the UI's 1 000). */
export const NATIVE_QUANT_PATHS = 10_000;
const INVOKE_BROKEN = /not allowed|not found|unknown command|unknown engine|ipc|invoke|channel closed|__TAURI/i;

/**
 * Builds an `Engine` that forwards every call to the matching Rust command (snake_case, same JSON as the WASM build).
 * If a call fails, it is retried on `fallback` (the WASM/TS worker engine, created lazily) after re-preparing the farm there;
 * when the failure looks like a broken bridge (not a core validation error) the native engine is dropped for good.
 */
export function createNativeEngine(invoke: Invoke, fallback?: () => Promise<Engine>): Engine {
  const call = <T>(cmd: string, payload: Record<string, unknown>) => invoke<T>(cmd, { payload });
  const packs = new Map<string, FarmPack>();
  const fbHandles = new Map<string, Promise<string>>();
  let fb: Promise<Engine> | null = null;
  let dead = false;
  const getFb = () => (fb ??= (fallback ?? defaultFallback)());
  const fbHandle = (h: string) => {
    let p = fbHandles.get(h);
    if (!p) {
      const pack = packs.get(h);
      if (!pack) return Promise.reject(new Error("unknown farm handle"));
      p = getFb().then((e) => e.prepareFarm(pack));
      fbHandles.set(h, p);
    }
    return p;
  };
  /** Native first; on error, the same call on the fallback engine (its error wins if both fail). */
  async function run<T>(h: string | null, native: () => Promise<T>, other: (e: Engine, fh: string) => Promise<T>): Promise<T> {
    if (!dead) {
      try { return await native(); } catch (err) {
        if (INVOKE_BROKEN.test(String(err))) dead = true;
        console.warn("native engine call failed, using the fallback engine", err);
      }
    }
    const e = await getFb();
    return other(e, h == null ? "" : await fbHandle(h));
  }
  const self: Engine = {
    get kind() { return dead && fb ? "wasm" : "native"; },
    async prepareFarm(pack) {
      try {
        if (dead) throw new Error("native engine disabled");
        const h = String(await call<number>("prepare_farm", { pack }));
        packs.set(h, pack);
        return h;
      } catch (err) {
        if (INVOKE_BROKEN.test(String(err))) dead = true;
        const e = await getFb();
        const h = await e.prepareFarm(pack);
        packs.set(h, pack); fbHandles.set(h, Promise.resolve(h));
        return h;
      }
    },
    simulateSeason: (h, crop, year, opts, trace) =>
      run(h, () => call("simulate_season", { handle: Number(h), crop, year, opts, trace }), (e, fh) => e.simulateSeason(fh, crop, year, opts, trace)),
    simulateRotation: (h, rot, opts, traceYear) =>
      run(h, () => call("simulate_rotation", { handle: Number(h), rot, opts, traceYear }), (e, fh) => e.simulateRotation(fh, rot, opts, traceYear)),
    adaptationMargin: (h, rot, opts) =>
      run(h, () => call("adaptation_margin", { handle: Number(h), rot, opts }), (e, fh) => e.adaptationMargin(fh, rot, opts)),
    frontier: (h, rot, opts) =>
      run(h, () => call("frontier", { handle: Number(h), rot, opts }), (e, fh) => e.frontier(fh, rot, opts)),
    optimize: (h, pool, opts, w, baseline, c) =>
      run(h, () => call("optimize", { handle: Number(h), pool, opts, w, baseline, c }), (e, fh) => e.optimize(fh, pool, opts, w, baseline, c)),
    pickThree: (ranked, baseline) =>
      run(null, () => call("pick_three", { ranked, baseline }), (e) => e.pickThree(ranked, baseline)),
    marginYear: (h, rot, opts, series) =>
      run(h, () => call("margin_year", { handle: Number(h), rot, opts, series }), (e, fh) => e.marginYear(fh, rot, opts, series)),
    marketShock: (h, rot, opts, shock) =>
      run(h, () => call("market_shock", { handle: Number(h), rot, opts, shock }), (e, fh) => e.marketShock(fh, rot, opts, shock)),
    quantSimulate: (h, rots, opts, p, qp) =>
      run(h, async () => call("quant_simulate", {
        handle: Number(h), rots, opts,
        // the native engine is fast enough for 10 000 paths; the UI's WASM default is 1 000
        p: { ...p, paths: Math.max(p.paths, NATIVE_QUANT_PATHS) },
        quantParams: qp ?? (await loadQuantParams()),
      }), (e, fh) => e.quantSimulate(fh, rots, opts, p, qp)),
    factSheet: (h, rot, opts, picks) =>
      run(h, () => call("fact_sheet", { handle: Number(h), rot, opts, picks }), (e, fh) => e.factSheet(fh, rot, opts, picks)),
    validate: (h, observed, opts) =>
      run(h, () => call("validate", { handle: Number(h), observed, opts }), async (e, fh) => {
        if (!e.validate) throw new Error("validate is only available in the Rust engine");
        return e.validate(fh, observed, opts);
      }),
    score: (h, rot, opts, w, c) =>
      run(h, () => call("score", { handle: Number(h), rot, opts, w, c }), async () => { throw new Error("score is only available natively"); }),
  };
  return self;
}

async function defaultFallback(): Promise<Engine> {
  try {
    const { createWorkerEngine } = await import("./worker-client");
    return await createWorkerEngine();
  } catch {
    return mockEngine;
  }
}

let probed: Promise<boolean> | null = null;
export let nativeInfo: NativeEngineInfo | null = null;

/**
 * Switches the app to the native Rust engine when (and only when) we run inside Tauri and `engine_info` succeeds.
 * Resolves to true if the native engine is now active. Idempotent; never throws.
 */
export function useNativeEngine(): Promise<boolean> {
  if (!probed) {
    probed = (async () => {
      const invoke = bridge();
      if (!invoke) return false;
      try {
        nativeInfo = await invoke<NativeEngineInfo>("engine_info");
        setEngine(createNativeEngine(invoke));
        setEngineVia("native");
        return true;
      } catch {
        return false; // feature `native-engine` is off (or the core failed to start): keep the TS engine
      }
    })();
  }
  return probed;
}
