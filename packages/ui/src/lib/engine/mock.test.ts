import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mockEngine as fs } from "./mock";
import { DEFAULT_OPTS, type FarmPack, type Rotation } from "./types";

const pack = (id: string): FarmPack =>
  JSON.parse(readFileSync(join(__dirname, "../../../../../apps/web/public/data/mock/farms", `${id}.json`), "utf8"));
const iowaRot: Rotation = [{ crop: "maize", cover: false }, { crop: "soybean", cover: false }];

describe("mock engine", () => {
  it("Iowa maize–soy: plausible yields and 2012 among the worst years", async () => {
    const h = await fs.prepareFarm(pack("iowa"));
    const r = await fs.simulateRotation(h, iowaRot, DEFAULT_OPTS);
    const maize = r.yieldByCrop.maize!;
    const mean = maize.reduce((a, b) => a + b, 0) / maize.length;
    expect(mean).toBeGreaterThan(7);
    expect(mean).toBeLessThan(13);
    const sorted = [...r.years].sort((a, b) => r.farmNet[r.years.indexOf(a)] - r.farmNet[r.years.indexOf(b)]);
    expect(sorted.slice(0, 4)).toContain(2012);
  });
  it("warming lowers income and the margin is finite", async () => {
    const h = await fs.prepareFarm(pack("iowa"));
    const a = await fs.simulateRotation(h, iowaRot, DEFAULT_OPTS);
    const b = await fs.simulateRotation(h, iowaRot, { ...DEFAULT_OPTS, dT: 3 });
    expect(b.meanNet).toBeLessThan(a.meanNet);
    const m = await fs.adaptationMargin(h, iowaRot, DEFAULT_OPTS);
    expect(m.dT).toBeGreaterThanOrEqual(0);
    expect(m.dT).toBeLessThanOrEqual(6);
  });
  it("optimizer returns three picks for every farm", async () => {
    for (const id of ["iowa", "kansas", "baragan"]) {
      const p = pack(id);
      const h = await fs.prepareFarm(p);
      const base: Rotation = p.meta.rotation.map((c) => ({ crop: c, cover: false }));
      const ranked = await fs.optimize(h, ["maize", "soybean", "wheat", "sorghum", "sunflower", "pea", "fallow"], DEFAULT_OPTS,
        { profit: 3, stability: 3, soil: 2, water: 1 }, base, { equipment: [], sellable: [] });
      const picks = await fs.pickThree(ranked, base);
      expect(picks.length).toBe(3);
    }
  });
});
