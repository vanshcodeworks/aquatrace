import { describe, expect, it } from "vitest";
import { fmtCurrency, fmtLph, fmtLitres, fmtPct, fmtTime } from "./format";

describe("format helpers", () => {
  it("formats litres with m3 above 1000", () => {
    expect(fmtLitres(500)).toBe("500.0 L");
    expect(fmtLitres(2500)).toBe("2.50 m³");
    expect(fmtLitres(null)).toBe("-");
  });

  it("formats lph", () => {
    expect(fmtLph(58.4)).toBe("58.4 L/h");
    expect(fmtLph(null)).toBe("-");
  });

  it("formats currency with symbol", () => {
    expect(fmtCurrency(11.17)).toContain("11.17");
    expect(fmtCurrency(null)).toBe("-");
  });

  it("formats percentages", () => {
    expect(fmtPct(0.156)).toBe("15.6%");
  });

  it("formats time", () => {
    expect(fmtTime("2026-01-15T08:30:00")).toMatch(/08:30|8:30/);
    expect(fmtTime(null)).toBe("-");
  });
});
