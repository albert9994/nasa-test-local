import { describe, expect, it } from "vitest";
import { currentCrop, stageOn } from "./phenology";

describe("phenology", () => {
  it("spring crops flower in July and are fallow in winter", () => {
    expect(stageOn("maize", new Date(2026, 6, 10))).toBe("flowering");
    expect(stageOn("soybean", new Date(2026, 0, 10))).toBe("fallow");
  });
  it("winter wheat is dormant in January, flowers in May", () => {
    expect(stageOn("wheat", new Date(2026, 0, 10))).toBe("fallow");
    expect(stageOn("wheat", new Date(2026, 4, 10))).toBe("flowering");
    expect(stageOn("wheat", new Date(2026, 10, 14))).toBe("emergence");
  });
  it("fallow stays fallow", () => expect(stageOn("fallow", new Date(2026, 6, 1))).toBe("fallow"));
  it("currentCrop reads steps or plain crop ids", () => {
    expect(currentCrop([{ crop: "maize", cover: false }])).toBe("maize");
    expect(currentCrop(["wheat", "maize"])).toBe("wheat");
    expect(currentCrop([])).toBeNull();
  });
});
