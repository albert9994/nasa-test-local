import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isPrithvi, parseCropMap, parseCropMeta, parseHlsSeries, yearsOf } from "./parse";

// The committed layer files must keep parsing with the same parsers the UI uses.
const root = resolve(__dirname, "../../../../../apps/web/public/data/layers");
const read = (farm: string, f: string) => {
  const p = resolve(root, farm, f);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : undefined;
};

describe.each(["iowa", "baragan"])("committed layers: %s", (farm) => {
  it("crop map + meta parse and are labelled honestly", () => {
    const raw = read(farm, "cropmap.json");
    if (!raw) return; // layer not generated: UI renders nothing
    const map = parseCropMap(raw);
    const meta = parseCropMeta(read(farm, "cropmap_meta.json"));
    expect(map?.features.length).toBeGreaterThan(100);
    expect(meta).not.toBeNull();
    if (isPrithvi(meta)) expect(meta?.model).toContain("Prithvi-EO-2.0");
    else expect(meta?.model).toBeNull();
    expect(meta?.dates.length).toBe(4);
  });
  it("HLS series parses and is chronological", () => {
    const raw = read(farm, "hls_ndvi.json");
    if (!raw) return;
    const s = parseHlsSeries(raw);
    expect(s && s.dates.length > 100).toBe(true);
    expect(s && [...s.dates].sort()).toEqual(s?.dates);
    expect(s && yearsOf(s).length).toBeGreaterThanOrEqual(5);
    expect(Math.max(...(s?.ndvi.filter((v): v is number => v != null) ?? [0]))).toBeLessThanOrEqual(1);
  });
});
