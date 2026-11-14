import { describe, expect, it } from "vitest";
import { MESSAGES } from "./messages";
import { reasonText } from "./reasons";

describe("engine reason codes", () => {
  it("renders worst-year reasons in Romanian and English", () => {
    const rc = { code: "drought", crop: "maize", stressDays: 22 };
    expect(reasonText("ro", "EUR", rc, "worst", "en text")).toBe("porumb: secetă (22 zile de stres hidric)");
    expect(reasonText("en", "EUR", rc, "worst", "x")).toBe("maize: drought (22 stress days)");
    expect(reasonText("ro", "EUR", { code: "heat_flowering", crop: "wheat", days: 14 }, "worst", "x")).toContain("14 zile de caniculă");
  });
  it("falls back to the English text for an unknown or missing code", () => {
    expect(reasonText("ro", "EUR", { code: "brand_new" }, "rule", "English reason")).toBe("English reason");
    expect(reasonText("ro", "EUR", undefined, "rule", "English reason")).toBe("English reason");
  });
  it("formats money in the chosen currency and localises rule vars", () => {
    const s = reasonText("ro", "USD", { code: "over_budget", cost: 300, budget: 250 }, "rule", "x");
    expect(s).toContain("300") ; expect(s).toContain("USD");
    expect(reasonText("ro", "EUR", { code: "not_sellable", crop: "pea" }, "rule", "x")).toContain("mazăre");
  });
  it("has a RO and EN text for every rule code the engine emits", () => {
    for (const code of ["continuous_maize","back_to_back_maize","legume_before_cereal","sunflower_back_to_back","sunflower_every_2","sunflower_every_3","pea_continuous","pea_every_2","bare_fallow_slope","fallow_uneconomic","all_cereal","grass_back_to_back","gaec7_violation","gaec7_qualifies","drought_escape","missing_equipment_no_budget","missing_equipment","groundwater_decline","not_sellable","cover_protects_slope","bare_wide_row_slope","acidic_ph","alkaline_ph","over_budget"]) {
      for (const l of ["en", "ro"] as const) expect(MESSAGES.reasons[l][`rule_${code}`], `${l}:${code}`).toBeTruthy();
    }
  });
});
