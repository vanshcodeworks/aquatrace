import { Link } from "react-router-dom";
import type { Incident } from "../../api/types";
import { fmtCurrency, fmtDateTime, fmtLph } from "../../lib/format";
import { SeverityBadge } from "../ui/StatusPill";

export function IncidentCard({ incident, compact = false }: { incident: Incident; compact?: boolean }) {
  return (
    <Link
      to={`/incidents?id=${incident.id}`}
      className="block border border-line bg-panel px-3 py-2.5 transition-colors hover:border-line-strong hover:bg-elevated"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <SeverityBadge severity={incident.severity} />
          <span className="truncate text-[12.5px] font-medium text-ink">{incident.node_name}</span>
          <span className="truncate text-[11px] text-muted">
            {incident.cause.replaceAll("_", " ")}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3 font-mono text-[11px]">
          <span className={incident.excess_flow_lph > 0 ? "text-critical" : "text-muted"}>
            {fmtLph(incident.excess_flow_lph)}
          </span>
          <span className="text-teal">{fmtCurrency(incident.estimated_cost)}</span>
        </div>
      </div>
      {!compact ? (
        <div className="mt-1.5 flex items-center justify-between gap-3 text-[10.5px] text-dim">
          <span>{incident.status.replaceAll("_", " ")}</span>
          <span className="font-mono">{fmtDateTime(incident.created_sim_time)}</span>
        </div>
      ) : null}
    </Link>
  );
}
