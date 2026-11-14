import { describe, expect, it } from "vitest";
import { parseNumber } from "./number-input";

describe("parseNumber", () => {
  it("reads plain and RO-style decimals", () => {
    expect(parseNumber("150")).toBe(150);
    expect(parseNumber("12,5")).toBe(12.5);
    expect(parseNumber(" 1 250 ")).toBe(1250);
    expect(parseNumber("-3.2")).toBe(-3.2);
  });
  it("treats empty or half-typed text as no value", () => {
    for (const s of ["", " ", "-", ".", ",", "-."]) expect(parseNumber(s)).toBeNull();
  });
});
