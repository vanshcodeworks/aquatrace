import { describe, expect, it } from "vitest";
import type { NodeReading } from "../api/types";
import { countByState, sumExcessLph, worstState } from "./aggregate";

function reading(id: string, state: NodeReading["detector_state"], excess = 0): NodeReading {
  return {
    node_id: id,
    node_name: id,
    node_type: "FLOOR",
    actual: 10,
    expected: 10,
    lower: 8,
    upper: 12,
    residual: 0,
    residual_pct: 0,
    excess_lph: excess,
    sensor_state: "OK",
    detector_state: state,
    persist_count: 0,
    mass_balance_ok: true,
    mass_balance_pct: 0,
    evidence: [],
  };
}

describe("aggregate helpers", () => {
  it("finds the worst state", () => {
    const reads = [reading("a", "HEALTHY"), reading("b", "WARNING"), reading("c", "WATCH")];
    expect(worstState(reads)).toBe("WARNING");
  });

  it("sums excess only for flagged nodes", () => {
    const reads = [
      reading("a", "CRITICAL", 50),
      reading("b", "WARNING", 8),
      reading("c", "HEALTHY", 999),
    ];
    expect(sumExcessLph(reads)).toBe(58);
  });

  it("counts states", () => {
    const reads = [reading("a", "HEALTHY"), reading("b", "HEALTHY"), reading("c", "CRITICAL")];
    expect(countByState(reads)).toEqual({ HEALTHY: 2, CRITICAL: 1 });
  });
});
