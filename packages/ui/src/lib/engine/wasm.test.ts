import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createWasmEngine } from "./wasm";
import { DEFAULT_OPTS, type FarmPack, type Rotation } from "./types";

const dir = join(__dirname, "../../../../engine-wasm");
const wasmFile = join(dir, "fieldshift_wasm_bg.wasm");
const built = existsSync(join(dir, "fieldshift_wasm.js")) && existsSync(wasmFile) && readFileSync(wasmFile).length > 1000;

const pack = (id: string): FarmPack =>
  JSON.parse(readFileSync(join(__dirname, "../../../../../apps/web/public/data/mock/farms", `${id}.json`), "utf8"));
const rot: Rotation = [{ crop: "maize", cover: false }, { crop: "soybean", cover: false }];

// Runs against the real wasm-pack output; skipped when `pnpm wasm` has not been run (CI builds it first).
describe.skipIf(!built)("wasm engine adapter", () => {
  it("answers like the Rust engine: Iowa yields, 2012, margin, quant", async () => {
    const e = await createWasmEngine(readFileSync(wasmFile));
    expect(e.kind).toBe("wasm");
    const h = await e.prepareFarm(pack("iowa"));
    const r = await e.simulateRotation(h, rot, DEFAULT_OPTS);
    const maize = r.yieldByCrop.maize!;
    const soy = r.yieldByCrop.soybean!;
    const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
    expect(mean(maize)).toBeGreaterThan(9);
    expect(mean(maize)).toBeLessThan(12);
    expect(mean(soy)).toBeGreaterThan(3);
    expect(mean(soy)).toBeLessThan(3.8);
    expect(r.worstYear).toBe(2012);

    const m = await e.adaptationMargin(h, rot, DEFAULT_OPTS);
    expect(m.dT).toBeGreaterThan(0);
    const fr = await e.frontier(h, rot, DEFAULT_OPTS);
    expect(fr.grid.length).toBe(11);
    const my = await e.marginYear(h, rot, DEFAULT_OPTS, []);
    expect(["number", "object", "string"]).toContain(typeof my.year);

    const t0 = performance.now();
    const q = await e.quantSimulate(h, [rot], DEFAULT_OPTS, {
      paths: 1000, fromYear: 2026, toYear: 2050, ssp: "ssp245", cashReserve: 500, seed: 42,
    });
    const ms = performance.now() - t0;
    expect(q[0].years.length).toBe(25);
    expect(q[0].cvar95).toBeLessThanOrEqual(q[0].var95);
    expect(q[0].mcSe!.meanAnnual).toBeGreaterThan(0);
    expect(ms).toBeLessThan(2000);
    console.info(`wasm quant 1000 paths x 25 y x 1 rotation: ${ms.toFixed(0)} ms`);
    const four: Rotation[] = [
      rot,
      [{ crop: "wheat", cover: false }, { crop: "sorghum", cover: false }],
      [{ crop: "maize", cover: false }, { crop: "soybean", cover: false }, { crop: "wheat", cover: false }],
      [{ crop: "sunflower", cover: false }, { crop: "pea", cover: false }],
    ];
    const t1 = performance.now();
    const q4 = await e.quantSimulate(h, four, DEFAULT_OPTS, {
      paths: 1000, fromYear: 2026, toYear: 2050, ssp: "ssp245", cashReserve: 500, seed: 42,
    });
    const ms4 = performance.now() - t1;
    expect(q4.length).toBe(4);
    console.info(`wasm quant 1000 paths x 25 y x 4 rotations: ${ms4.toFixed(0)} ms`);
    expect(ms4).toBeLessThan(1500);
  });

  it("validates against observed yields and CO2 changes wheat", async () => {
    const e = await createWasmEngine(readFileSync(wasmFile));
    const h = await e.prepareFarm(pack("iowa"));
    const rep = await e.validate!(h, { crops: { maize: { years: { "2011": 10.5, "2012": 6.5, "2013": 10.8, "2014": 11.5 } } } });
    expect(rep.maize.n).toBe(4);
    expect(rep.maize.rmse).toBeGreaterThan(0);
    const wheat = (o: typeof DEFAULT_OPTS) =>
      e.simulateRotation(h, [{ crop: "wheat", cover: false }], o).then((r) => r.meanNet);
    expect(await wheat({ ...DEFAULT_OPTS, co2ppm: 550 })).toBeGreaterThan(await wheat(DEFAULT_OPTS));
  });
});
