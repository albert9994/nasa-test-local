// Native engine adapter for the desktop app (V2-B2).
// Every `Engine` method becomes a Tauri command that runs `fieldshift-core` in Rust (see apps/desktop/src-tauri/src/native.rs).
// The commands only exist when the app is built with `--features native-engine`; otherwise `engine_info` returns an error and
// `useNativeEngine()` resolves to false, so the UI keeps the TypeScript engine (Web Worker). No Tauri npm package is imported
// here: we call the invoke bridge Tauri injects, so the website bundle never pulls Tauri in.
import type { Engine } from "./types";
import { setEngine } from "./index";
import { isTauri } from "@/lib/store/farm-storage";

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

function bridge(): Invoke | null {
  if (!isTauri()) return null;
  const w = window as unknown as { __TAURI_INTERNALS__?: { invoke?: Invoke } };
  return w.__TAURI_INTERNALS__?.invoke ?? null;
}

export interface NativeEngineInfo { name: string; version: string; threads?: number }

/** Builds an `Engine` that forwards every call to the matching Rust command (snake_case). */
export function createNativeEngine(invoke: Invoke): Engine {
  const call = <T>(cmd: string, payload: Record<string, unknown>) => invoke<T>(cmd, { payload });
  return {
    kind: "wasm", // "native" is not in the shared Engine["kind"] union yet; same contract as the WASM build
    prepareFarm: (pack) => call("prepare_farm", { pack }),
    simulateSeason: (handle, crop, year, opts, trace) => call("simulate_season", { handle, crop, year, opts, trace }),
    simulateRotation: (handle, rot, opts, traceYear) => call("simulate_rotation", { handle, rot, opts, traceYear }),
    adaptationMargin: (handle, rot, opts) => call("adaptation_margin", { handle, rot, opts }),
    frontier: (handle, rot, opts) => call("frontier", { handle, rot, opts }),
    optimize: (handle, pool, opts, w, baseline, c) => call("optimize", { handle, pool, opts, w, baseline, c }),
    pickThree: (ranked, baseline) => call("pick_three", { ranked, baseline }),
    marginYear: (handle, rot, opts, series) => call("margin_year", { handle, rot, opts, series }),
    marketShock: (handle, rot, opts, shock) => call("market_shock", { handle, rot, opts, shock }),
    quantSimulate: (handle, rots, opts, p) => call("quant_simulate", { handle, rots, opts, p }),
    factSheet: (handle, rot, opts, picks) => call("fact_sheet", { handle, rot, opts, picks }),
  };
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
        return true;
      } catch {
        return false; // feature `native-engine` is off (or the core failed to start): keep the TS engine
      }
    })();
  }
  return probed;
}
