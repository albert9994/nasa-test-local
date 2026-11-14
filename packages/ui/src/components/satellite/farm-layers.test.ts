import { describe, expect, it } from "vitest";
import { cropMapFarmAt } from "./farm-layers";

describe("cropMapFarmAt", () => {
  it("finds the farm whose crop map covers a point", () => {
    expect(cropMapFarmAt(42.05, -93.6)).toBe("iowa");
    expect(cropMapFarmAt(44.5, 27.5)).toBe("baragan");
  });
  it("is null elsewhere (no empty layer)", () => {
    expect(cropMapFarmAt(37.95, -100.85)).toBeNull(); // Kansas has no crop map
    expect(cropMapFarmAt(45, 26.2)).toBeNull();
  });
});
