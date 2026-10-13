import React from "react";
import type { DetectorState } from "../../api/types";

const MAP: Record<DetectorState, { label: string; color: string; text: string }> = {
  HEALTHY: { label: "Healthy", color: "#5b9e77", text: "text-ink" },
  WATCH: { label: "Watch", color: "#6f9dc0", text: "text-ink" },
  WARNING: { label: "Warning", color: "#c39a4a", text: "text-warning" },
  CRITICAL: { label: "Critical", color: "#c35d5d", text: "text-critical" },
  STALE: { label: "Stale", color: "#5f6873", text: "text-muted" },
  OFFLINE: { label: "Offline", color: "#5f6873", text: "text-muted" },
};

export function StatusPill({
  state,
  pulse = false,
  size = "md",
}: {
  state: DetectorState;
  pulse?: boolean;
  size?: "sm" | "md";
}) {
  const cfg = MAP[state] ?? MAP.HEALTHY;
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${size === "sm" ? "text-[10.5px]" : "text-[11.5px]"} ${cfg.text}`}
    >
      <span
        className={`inline-block ${size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2"} rounded-sm ${
          pulse && state === "CRITICAL" ? "animate-pulse" : ""
        }`}
        style={{ backgroundColor: cfg.color }}
      />
      {cfg.label}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const s = severity.toUpperCase();
  const map: Record<string, { label: string; color: string; text: string }> = {
    CRITICAL: { label: "Critical", color: "#c35d5d", text: "text-critical" },
    WARNING: { label: "Warning", color: "#c39a4a", text: "text-warning" },
    WATCH: { label: "Watch", color: "#6f9dc0", text: "text-ink" },
  };
  const cfg = map[s] ?? { label: s, color: "#5f6873", text: "text-muted" };
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${cfg.text}`}>
      <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: cfg.color }} />
      {cfg.label}
    </span>
  );
}
