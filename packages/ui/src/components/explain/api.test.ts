import { describe, expect, it } from "vitest";
import { parseDone, RateLimitError } from "./api";

describe("parseDone", () => {
  it("reads a replaced final event", () => {
    const d = parseDone({ done: true, replaced: true, text: "Clean text.", usedNumbers: [3, "2.1"], unsupported: ["Bad one."] });
    expect(d).toEqual({ usedNumbers: [3, "2.1"], replaced: true, text: "Clean text.", unsupported: ["Bad one."] });
  });
  it("ignores replaced without text", () => {
    expect(parseDone({ done: true, replaced: true, text: "  " }).replaced).toBeUndefined();
  });
  it("plain done keeps only used numbers", () => {
    expect(parseDone({ done: true, usedNumbers: [1] })).toEqual({ usedNumbers: [1] });
  });
  it("rate limit error is distinguishable", () => {
    expect(new RateLimitError()).toBeInstanceOf(Error);
    expect(new RateLimitError().name).toBe("RateLimitError");
  });
});
