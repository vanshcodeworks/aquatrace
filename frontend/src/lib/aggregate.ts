import type { DetectorState, NodeReading } from "../api/types";

const RANK: Record<DetectorState, number> = {
  CRITICAL: 5,
  WARNING: 4,
  WATCH: 3,
  OFFLINE: 2,
  STALE: 1,
  HEALTHY: 0,
};

export function worstState(reads: NodeReading[]): DetectorState {
  return reads.reduce<DetectorState>(
    (acc, r) => (RANK[r.detector_state] > RANK[acc] ? r.detector_state : acc),
    "HEALTHY",
  );
}

export function sum(values: (number | null | undefined)[]): number {
  return values.reduce<number>((acc, v) => acc + (v ?? 0), 0);
}

export function sumExcessLph(reads: NodeReading[]): number {
  return reads
    .filter((r) => r.detector_state === "WARNING" || r.detector_state === "CRITICAL")
    .reduce((acc, r) => acc + (r.excess_lph ?? 0), 0);
}

export function countByState(reads: NodeReading[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of reads) out[r.detector_state] = (out[r.detector_state] ?? 0) + 1;
  return out;
}

export function meterReads(nodes: Record<string, NodeReading>): NodeReading[] {
  return Object.values(nodes).filter((r) => r.sensor_state !== "UNMETERED" && r.actual !== null);
}

export function stateRank(s: DetectorState): number {
  return RANK[s] ?? 0;
}
