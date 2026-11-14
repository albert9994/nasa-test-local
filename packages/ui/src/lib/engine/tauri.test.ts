import { describe, expect, it, vi } from "vitest";
import { createNativeEngine } from "./tauri";
import { DEFAULT_OPTS, type Engine, type FarmPack } from "./types";

const pack = { meta: { id: "x", name: "x", lat: 0, lon: 0, rotation: [] }, weather: {} } as unknown as FarmPack;

describe("native engine adapter", () => {
  it("reports kind native, forwards to commands and bumps quant paths to 10 000", async () => {
    const invoke = vi.fn(async (cmd: string, _a?: unknown) => (cmd === "prepare_farm" ? 7 : []));
    const e = createNativeEngine(invoke as never);
    expect(e.kind).toBe("native");
    const h = await e.prepareFarm(pack);
    expect(h).toBe("7");
    await e.quantSimulate(h, [], DEFAULT_OPTS, { paths: 1000, fromYear: 2026, toYear: 2050, ssp: "ssp245", cashReserve: 0, seed: 1 }, {});
    const call = invoke.mock.calls.find((c) => c[0] === "quant_simulate")!;
    expect((call[1] as { payload: { p: { paths: number }; handle: number } }).payload.p.paths).toBe(10000);
    expect((call[1] as { payload: { handle: number } }).payload.handle).toBe(7);
  });
  it("falls back to the worker engine when invoke fails", async () => {
    const invoke = vi.fn(async (cmd: string) => { if (cmd === "prepare_farm") return 1; throw new Error("command simulate_rotation not found"); });
    const fb = { kind: "wasm", prepareFarm: vi.fn(async () => "w1"), simulateRotation: vi.fn(async () => ({ meanNet: 5 })) } as unknown as Engine;
    const e = createNativeEngine(invoke as never, async () => fb);
    const h = await e.prepareFarm(pack);
    const r = await e.simulateRotation(h, [], DEFAULT_OPTS);
    expect(r.meanNet).toBe(5);
    expect(fb.prepareFarm).toHaveBeenCalledTimes(1);
    expect(e.kind).toBe("wasm");
  });
});
