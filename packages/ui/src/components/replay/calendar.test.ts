import { describe, expect, it } from "vitest";
import { axisDays, doyOf, fmtDate, startDay } from "./calendar";

describe("replay calendar", () => {
  it("spans Oct 1 of the previous year to Dec 31", () => {
    expect(axisDays(2012)).toBe(458);
    expect(fmtDate(2012, 0)).toBe("Oct 1, 2011");
    expect(fmtDate(2012, axisDays(2012) - 1)).toBe("Dec 31, 2012");
  });
  it("aligns winter crops (autumn) and spring crops on one axis", () => {
    expect(startDay(2012, 285)).toBe(12); // Oct 13 of the previous year
    expect(fmtDate(2012, startDay(2012, 119))).toBe("Apr 29, 2012");
  });
  it("maps axis days to day of year", () => {
    expect(doyOf(2012, 10)).toBeNull();
    expect(doyOf(2012, 92)).toBe(1);
  });
});
