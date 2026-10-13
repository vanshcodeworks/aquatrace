import { describe, expect, it } from "vitest";
import { intervalToLph, lphToInterval } from "./units";

describe("unit conversion", () => {
  it("converts litres per interval to litres per hour", () => {
    expect(intervalToLph(1)).toBe(4);
    expect(intervalToLph(14.6)).toBeCloseTo(58.4, 5);
  });

  it("round-trips", () => {
    expect(lphToInterval(intervalToLph(25) as number)).toBeCloseTo(25, 6);
  });

  it("passes through null", () => {
    expect(intervalToLph(null)).toBeNull();
    expect(lphToInterval(undefined)).toBeNull();
  });
});
