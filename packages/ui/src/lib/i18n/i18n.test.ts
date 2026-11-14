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
