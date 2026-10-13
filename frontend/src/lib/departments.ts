import type { NodeReading } from "../api/types";

export interface DeptSummary {
  key: "rooms" | "laundry" | "kitchen";
  name: string;
  blurb: string;
  nodeIds: string[];
  actualLph: number;
  expectedLph: number;
  excessLph: number;
  sharePct: number;
  status: "ok" | "watch" | "alert";
  recommendation: string;
  dailySaving: number;
}

const TARIFF_PER_KL = 150;

const DEFS: {
  key: DeptSummary["key"];
  name: string;
  blurb: string;
  nodeIds: string[];
  recommendation: (excess: number) => string;
}[] = [
  {
    key: "rooms",
    name: "Rooms & Housekeeping",
    blurb: "Guest wings, bathrooms and in-room fixtures",
    nodeIds: ["wing_a", "wing_b", "floor_a1", "floor_a2", "floor_b1", "floor_b2"],
    recommendation: (excess) =>
      excess > 0
        ? "Continuous draw above the expected band. Isolate the branch valve and check toilet flapper valves in the affected suite before other fixtures."
        : "Room draw is within the expected occupancy band. No action needed.",
  },
  {
    key: "laundry",
    name: "Laundry Operations",
    blurb: "Commercial front-load washers and linen turnover",
    nodeIds: ["laundry"],
    recommendation: (excess) =>
      excess > 0
        ? "Draw is above baseline. Run washers at rated load, consolidate part-loads into full batches and check inlet valves for pass-through."
        : "Wash loads are within the rated-capacity baseline.",
  },
  {
    key: "kitchen",
    name: "Kitchen & F&B",
    blurb: "Prep sinks, scullery and combi-steamers",
    nodeIds: ["kitchen"],
    recommendation: (excess) =>
      excess > 0
        ? "Excess draw detected. Inspect the pre-rinse spray station and combi-steamer supply during off-peak lulls."
        : "Kitchen draw is nominal for the current meal schedule.",
  },
];

function lph(value: number | null | undefined): number {
  return (value ?? 0) * 4;
}

export function departmentSummaries(nodes: Record<string, NodeReading>): DeptSummary[] {
  const totalActual = DEFS.flatMap((d) => d.nodeIds)
    .map((id) => nodes[id])
    .filter(Boolean)
    .reduce((acc, r) => acc + lph(r.actual), 0);

  return DEFS.map((def) => {
    const reads = def.nodeIds.map((id) => nodes[id]).filter(Boolean);
    const actualLph = reads.reduce((acc, r) => acc + lph(r.actual), 0);
    const expectedLph = reads.reduce((acc, r) => acc + lph(r.expected), 0);
    const excessLph = reads.reduce((acc, r) => acc + (r.excess_lph ?? 0), 0);
    const hasAlert = reads.some((r) => r.detector_state === "CRITICAL" || r.detector_state === "WARNING");
    const hasWatch = reads.some((r) => r.detector_state === "WATCH");

    return {
      key: def.key,
      name: def.name,
      blurb: def.blurb,
      nodeIds: def.nodeIds,
      actualLph,
      expectedLph,
      excessLph,
      sharePct: totalActual > 0 ? (actualLph / totalActual) * 100 : 0,
      status: hasAlert ? "alert" : hasWatch ? "watch" : "ok",
      recommendation: def.recommendation(excessLph),
      dailySaving: (excessLph * 24 * TARIFF_PER_KL) / 1000,
    } satisfies DeptSummary;
  });
}

export { TARIFF_PER_KL };
