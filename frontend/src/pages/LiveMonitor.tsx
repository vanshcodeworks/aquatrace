import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Activity, Gauge, Info, RefreshCw } from "lucide-react";
import { api } from "../api/client";
import { usePolling } from "../lib/hooks";
import { useSimulation } from "../store/SimulationContext";
import { fmtDateTime, fmtLph } from "../lib/format";
import { Badge, Button, EmptyState, Panel, PanelHeader, Skeleton } from "../components/ui/primitives";
import { StatusPill } from "../components/ui/StatusPill";
import { ActualVsExpected } from "../components/charts/ActualVsExpected";

export function LiveMonitor() {
  const { latest, topology } = useSimulation();
  const [params, setParams] = useSearchParams();
  const selected = params.get("node") ?? "main_inlet";
  const [autoRefresh, setAutoRefresh] = useState(true);

  const history = usePolling(
    () => api.history(selected, 96),
    autoRefresh ? 2500 : 60000,
    [selected, autoRefresh],
  );

  const node = latest?.nodes[selected];
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

  const orderedNodes = useMemo(() => {
    if (!topology || !latest) return [];
    return topology.nodes
      .map((n) => ({ def: n, reading: latest.nodes[n.id] }))
      .filter((x) => x.reading);
  }, [topology, latest]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <Panel className="xl:col-span-1">
          <PanelHeader title="Nodes" subtitle={`${orderedNodes.length} monitored`} icon={<Gauge size={15} />} />
          <div className="max-h-[560px] space-y-1 overflow-y-auto p-2">
            {orderedNodes.map(({ def, reading }) => {
              const active = def.id === selected;
              return (
                <button
                  key={def.id}
                  onClick={() => setParams({ node: def.id })}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                    active ? "bg-teal/12 ring-1 ring-teal/40" : "hover:bg-elevated"
                  }`}
                >
                  <div className="min-w-0">
                    <p className={`truncate text-xs font-medium ${active ? "text-teal" : "text-ink"}`}>
                      {def.name}
                    </p>
                    <p className="text-[10px]  text-muted">
                      {def.node_type.replaceAll("_", " ")}
                    </p>
                  </div>
                  <StatusPill state={reading.detector_state} size="sm" pulse={reading.detector_state === "CRITICAL"} />
                </button>
              );
            })}
            {!orderedNodes.length ? <Skeleton className="h-40 w-full" /> : null}
          </div>
        </Panel>

        <div className="space-y-4 xl:col-span-3">
          <Panel>
            <PanelHeader
              title={node?.node_name ?? "Node"}
              subtitle={node ? `Sensor ${node.sensor_state}` : "Awaiting telemetry"}
              icon={<Activity size={15} />}
              right={
                <div className="flex items-center gap-2">
                  <Badge tone="muted">{latest ? fmtDateTime(latest.sim_time) : "-"}</Badge>
                  <Button
                    size="sm"
                    variant={autoRefresh ? "primary" : "ghost"}
                    onClick={() => setAutoRefresh((v) => !v)}
                    icon={<RefreshCw size={13} />}
                  >
                    {autoRefresh ? "Live" : "Paused"}
                  </Button>
                </div>
              }
            />
            {node ? (
              <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
                <ReadingStat label="Actual" value={node.actual !== null ? `${node.actual.toFixed(2)}` : "-"} unit="L/15min" tone="ink" />
                <ReadingStat label="Expected" value={`${node.expected.toFixed(2)}`} unit="L/15min" tone="cyan" />
                <ReadingStat
                  label="Band"
                  value={`${node.lower.toFixed(1)}-${node.upper.toFixed(1)}`}
                  unit="L/15min"
                  tone="muted"
                />
                <ReadingStat
                  label="Excess"
                  value={`${node.excess_lph.toFixed(1)}`}
                  unit="L/h"
                  tone={node.excess_lph > 0 ? "critical" : "healthy"}
                />
              </div>
            ) : (
              <div className="p-4">
                <Skeleton className="h-16 w-full" />
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHeader
              title="Reading history"
              subtitle="Actual flow against the AI expected band"
              right={<Badge tone="teal">L / 15 min</Badge>}
            />
            <div className="p-3">
              {history.loading ? (
                <Skeleton className="h-[280px] w-full" />
              ) : chartData.length ? (
                <ActualVsExpected data={chartData} height={280} unit="L / 15 min" />
              ) : (
                <EmptyState title="No history" message="Play the simulation to collect readings." icon={<Activity size={22} />} />
              )}
            </div>
          </Panel>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel>
              <PanelHeader title="Detector reasoning" subtitle="Computed from the live detector state machine" icon={<Info size={15} />} />
              <div className="space-y-2 p-4">
                {node ? (
                  <>
                    <Row label="Detector state" value={<StatusPill state={node.detector_state} />} />
                    <Row label="Residual" value={<span className="font-mono text-xs text-ink">{fmtLph(node.excess_lph)}</span>} />
                    <Row
                      label="Residual %"
                      value={<span className="font-mono text-xs text-ink">{(node.residual_pct * 100).toFixed(1)}%</span>}
                    />
                    <Row label="Persistence" value={<span className="font-mono text-xs text-ink">{node.persist_count} intervals</span>} />
                    <Row
                      label="Parent mass balance"
                      value={<Badge tone={node.mass_balance_ok ? "healthy" : "warning"}>{node.mass_balance_ok ? "OK" : "Mismatch"}</Badge>}
                    />
                    <div className="mt-3 border-t border-line/50 pt-3">
                      <p className="mb-1 text-[11px] font-medium  text-muted">Evidence</p>
                      <ul className="space-y-1">
                        {node.evidence?.length ? (
                          node.evidence.map((e, i) => (
                            <li key={i} className="flex gap-2 text-[11px] text-muted">
                              <span className="text-teal">•</span>
                              {e}
                            </li>
                          ))
                        ) : (
                          <li className="text-[11px] text-muted">Reading within expected band.</li>
                        )}
                      </ul>
                    </div>
                  </>
                ) : (
                  <Skeleton className="h-40 w-full" />
                )}
              </div>
            </Panel>

            <Panel>
              <PanelHeader
                title="Exogenous context"
                subtitle="Inputs driving the expected-use model (no recent-actual lags)"
              />
              <div className="space-y-2 p-4">
                {latest?.features ? (
                  <>
                    <Row label="Occupancy" value={<span className="font-mono text-xs text-ink">{latest.features.occupancy_rooms ?? "-"} rooms</span>} />
                    <Row label="Meals served" value={<span className="font-mono text-xs text-ink">{latest.features.meals_served ?? "-"}</span>} />
                    <Row label="Laundry load" value={<span className="font-mono text-xs text-ink">{latest.features.laundry_kg ?? "-"} kg</span>} />
                    <Row label="Day of week" value={<span className="font-mono text-xs text-ink">{latest.features.dow ?? "-"}</span>} />
                    <Row label="Hour" value={<span className="font-mono text-xs text-ink">{latest.features.hour ?? "-"}</span>} />
                    <p className="mt-3 border-t border-line/50 pt-3 text-[11px] leading-relaxed text-muted">
                      Because the model uses only exogenous features, a leak cannot be absorbed into
                      its own expectation - the residual stays visible until the fault is removed.
                    </p>
                  </>
                ) : (
                  <Skeleton className="h-40 w-full" />
                )}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReadingStat({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  tone: "ink" | "cyan" | "muted" | "critical" | "healthy";
}) {
  const colors: Record<string, string> = {
    ink: "text-ink",
    cyan: "text-cyan",
    muted: "text-muted",
    critical: "text-critical",
    healthy: "text-healthy",
  };
  return (
    <div className="rounded-lg border border-line/50 bg-app2 px-3 py-2.5">
      <p className="text-[10px]  text-muted">{label}</p>
      <p className={`mt-1 font-mono text-lg font-semibold tabular-nums ${colors[tone]}`}>{value}</p>
      <p className="text-[10px] text-muted">{unit}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted">{label}</span>
      {value}
    </div>
  );
}
