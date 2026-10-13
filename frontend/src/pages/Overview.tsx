import { Link } from "react-router-dom";
import { useMemo } from "react";
import {
  Activity,
  AlertOctagon,
  Brain,
  Droplets,
  Gauge,
  IndianRupee,
  Waves,
} from "lucide-react";
import { api } from "../api/client";
import { usePolling } from "../lib/hooks";
import { useSimulation } from "../store/SimulationContext";
import { fmtCurrency, fmtDateTime, fmtLph, fmtPct } from "../lib/format";
import { meterReads, sum, sumExcessLph, worstState } from "../lib/aggregate";
import { intervalToLph } from "../lib/units";
import { Panel, PanelHeader, Kpi, Button, EmptyState, Badge, Skeleton } from "../components/ui/primitives";
import { StatusPill } from "../components/ui/StatusPill";
import { ActualVsExpected } from "../components/charts/ActualVsExpected";
import { NetworkGraph } from "../components/network/NetworkGraph";
import { IncidentCard } from "../components/incidents/IncidentCard";

export function Overview() {
  const { latest, topology, state } = useSimulation();
  const incidents = usePolling(() => api.incidents({ limit: "50" }), 4000);
  const history = usePolling(() => api.history("main_inlet", 96), 4000);
  const ai = usePolling(() => api.aiStatus(), 15000);

  const reads = useMemo(() => (latest ? Object.values(latest.nodes) : []), [latest]);
  const meters = useMemo(() => (latest ? meterReads(latest.nodes) : []), [latest]);
  const worst = reads.length ? worstState(reads) : "HEALTHY";
  const excessLph = sumExcessLph(meters);
  const totalActual = sum(meters.map((r) => r.actual));

  const open = useMemo(
    () => (incidents.data?.items ?? []).filter((i) => !["RESOLVED", "FALSE_POSITIVE"].includes(i.status)),
    [incidents.data],
  );
  const criticalCount = open.filter((i) => i.severity === "CRITICAL").length;
  const lostToday = sum((incidents.data?.items ?? []).map((i) => i.excess_volume_litres));
  const costToday = sum((incidents.data?.items ?? []).map((i) => i.estimated_cost));

  const chartData = useMemo(
    () =>
      (history.data?.series ?? []).map((s: any) => ({
        t: fmtDateTime(s.sim_time).split(", ").pop() ?? "",
        actual: s.actual,
        expected: s.expected,
        lower: s.lower,
        upper: s.upper,
      })),
    [history.data],
  );

  return (
    <div className="space-y-5">
      {state?.demo_active ? (
        <div className="flex items-center gap-3 rounded border border-teal/40 bg-teal/10 px-4 py-3">
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink">Demo scenario running</p>
            <p className="text-xs text-muted">
              A pipe leak was injected into the simulator. Watch the anomaly propagate from the
              sensor reading through detection to a diagnosed incident.
            </p>
          </div>
          <Link to="/simulation">
            <Button size="sm" variant="primary">
              Simulation Lab
            </Button>
          </Link>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="System state"
          value={worst.charAt(0) + worst.slice(1).toLowerCase()}
          tone={worst === "CRITICAL" ? "critical" : worst === "WARNING" ? "warning" : "healthy"}
          icon={<Gauge size={14} />}
          hint="Worst node state across the network"
        />
        <Kpi
          label="Open incidents"
          value={String(open.length)}
          tone={criticalCount > 0 ? "critical" : open.length > 0 ? "warning" : "healthy"}
          icon={<AlertOctagon size={14} />}
          hint={`${criticalCount} critical`}
        />
        <Kpi
          label="Excess flow"
          value={fmtLph(excessLph).split(" ")[0]}
          unit="L/h"
          tone={excessLph > 0 ? "warning" : "healthy"}
          icon={<Waves size={14} />}
          hint="Above expected across flagged nodes"
        />
        <Kpi
          label="Live inflow"
          value={totalActual.toFixed(0)}
          unit="L/15min"
          tone="teal"
          icon={<Droplets size={14} />}
          hint={`≈ ${(intervalToLph(totalActual) ?? 0).toFixed(0)} L/h at main inlet`}
        />
        <Kpi
          label="Water lost"
          value={lostToday >= 1000 ? `${(lostToday / 1000).toFixed(2)}` : lostToday.toFixed(0)}
          unit={lostToday >= 1000 ? "m³" : "L"}
          tone={lostToday > 0 ? "warning" : "healthy"}
          icon={<Activity size={14} />}
          hint="Cumulative excess volume in incidents"
        />
        <Kpi
          label="Est. cost"
          value={fmtCurrency(costToday).replace("\u20b9", "")}
          unit="\u20b9"
          tone={costToday > 0 ? "critical" : "healthy"}
          icon={<IndianRupee size={14} />}
          hint="At configured tariff"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Main inlet - actual vs expected"
            subtitle="Measured flow against the AI expected band (P10-P90)"
            right={<Badge tone="teal">L / 15 min</Badge>}
          />
          <div className="p-3">
            {history.loading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : chartData.length ? (
              <ActualVsExpected data={chartData} height={260} unit="L / 15 min" />
            ) : (
              <EmptyState
                title="No history yet"
                message="Start the simulation to accumulate telemetry and see the expected band."
                icon={<Activity size={22} />}
              />
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Network state"
            subtitle="Live detector state per node"
            right={<StatusPill state={worst} pulse={worst === "CRITICAL"} size="sm" />}
          />
          <div className="p-3">
            {topology ? (
              <NetworkGraph topology={topology} compact />
            ) : (
              <Skeleton className="h-64 w-full" />
            )}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Active incidents"
            subtitle={incidents.loading ? "Loading..." : `${open.length} open`}
            icon={<AlertOctagon size={15} />}
            right={
              <Link to="/incidents">
                <Button size="sm" variant="ghost">
                  View all
                </Button>
              </Link>
            }
          />
          <div className="space-y-2 p-3">
            {incidents.loading ? (
              <>
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </>
            ) : open.length ? (
              open.slice(0, 4).map((i) => <IncidentCard key={i.id} incident={i} />)
            ) : (
              <EmptyState
                title="All clear"
                message="No open incidents. The detector is monitoring every node for persistent excess flow."
                icon={<Activity size={22} />}
              />
            )}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="AI engine" subtitle={ai.data?.model.model_name} icon={<Brain size={15} />} />
            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Model fitted</span>
                <Badge tone={ai.data?.model.fitted ? "healthy" : "warning"}>
                  {ai.data?.model.fitted ? "Yes" : "Fallback"}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Training samples</span>
                <span className="font-mono tabular-nums text-ink">
                  {ai.data?.model.n_samples?.toLocaleString() ?? "-"}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Train WAPE</span>
                <span className="font-mono tabular-nums text-ink">
                  {ai.data?.model.train_metrics?.wape !== undefined
                    ? fmtPct(ai.data.model.train_metrics.wape)
                    : "-"}
                </span>
              </div>
              {ai.data?.model.fallback_reason ? (
                <p className="rounded-md border border-warning/30 bg-warning/10 px-2 py-1.5 text-[11px] text-warning">
                  {ai.data.model.fallback_reason}
                </p>
              ) : null}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Recommended actions" subtitle="Prioritised by cost impact" icon={<AlertOctagon size={15} />} />
            <div className="space-y-2 p-3">
              <RecommendationsPreview />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function RecommendationsPreview() {
  const recs = usePolling(() => api.recommendations(), 5000);
  if (recs.loading) return <Skeleton className="h-16 w-full" />;
  const items = recs.data?.items ?? [];
  if (!items.length) {
    return <p className="px-1 py-2 text-xs text-muted">No actions required right now.</p>;
  }
  return (
    <>
      {items.slice(0, 3).map((r) => (
        <div key={r.incident_id} className="rounded-lg border border-line/50 bg-app2 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink">{r.node_name}</span>
            <Badge tone={r.severity === "CRITICAL" ? "critical" : "warning"}>{r.severity}</Badge>
          </div>
          <p className="mt-1 text-[11px] text-muted">{r.action}</p>
          <p className="mt-1 text-[10px] text-teal">{fmtLph(r.excess_flow_lph)} excess</p>
        </div>
      ))}
      <Link
        to="/incidents"
        className="block text-center text-[11px] font-medium text-teal hover:underline"
      >
        Go to incident response
      </Link>
    </>
  );
}
