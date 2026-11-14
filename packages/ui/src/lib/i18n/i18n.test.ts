import { describe, expect, it } from "vitest";
import { MESSAGES } from "./messages";
import { translate } from "./index";

describe("i18n", () => {
  it("every namespace has the same keys in ro and en", () => {
    for (const [ns, d] of Object.entries(MESSAGES)) {
      expect(Object.keys(d.ro).sort(), ns).toEqual(Object.keys(d.en).sort());
    }
  });
  it("interpolates vars", () => {
    expect(translate("ro", "common.badYearsOutOf", { n: 3, total: 25 })).toBe("3 ani proști din 25");
  });
});

describe("i18n usage", () => {
  it("every literal t(\"ns.key\") used in components exists in RO and EN", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f) && !/\.test\./.test(f)) files.push(p); } };
    walk(join(__dirname, "../../components/field"));
    for (const d of ["hero", "inputs", "replay", "explain", "app"]) walk(join(__dirname, "../../components", d));
    const missing: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/\bt\(\s*"([a-zA-Z]+)\.([A-Za-z0-9_]+)"/g)) {
        const [, ns, key] = m;
        for (const l of ["en", "ro"] as const) if (!(key in (MESSAGES[ns]?.[l] ?? {}))) missing.push(`${l}:${ns}.${key} (${f.split("/").pop()})`);
      }
    }
    expect(missing).toEqual([]);
  });
});
