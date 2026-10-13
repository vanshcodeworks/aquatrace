import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  Box,
  Droplets,
  Gauge,
  IndianRupee,
  Layers,
  Network as NetworkIcon,
  Radio,
  ShieldAlert,
  Users,
} from "lucide-react";
import { DigitalTwin3D } from "../components/twin/DigitalTwin3D";
import { NetworkGraph } from "../components/network/NetworkGraph";
import { useSimulation } from "../store/SimulationContext";
import { Badge, Kpi, Panel, PanelHeader } from "../components/ui/primitives";
import { StatusPill } from "../components/ui/StatusPill";
import { fmtCurrency, fmtLph } from "../lib/format";

const LEGEND = [
  { state: "HEALTHY", color: "#10b981" },
  { state: "WATCH", color: "#38bdf8" },
  { state: "WARNING", color: "#f59e0b" },
  { state: "CRITICAL", color: "#ef4444" },
  { state: "OFFLINE", color: "#94a3b8" },
];

export function DigitalTwinPage() {
  const { latest, state: simState, topology } = useSimulation();
  const [viewMode, setViewMode] = useState<"3d" | "2d">("3d");
  const [selected, setSelected] = useState<string | null>("main_inlet");

  const nodes = latest?.nodes ? Object.values(latest.nodes) : [];
  const abnormalNodes = nodes.filter(
    (n) => n.detector_state === "WARNING" || n.detector_state === "CRITICAL",
  );
  const totalExcess = abnormalNodes.reduce((acc, n) => acc + (n.excess_lph || 0), 0);
  const inletFlow = latest?.nodes?.main_inlet?.actual ? latest.nodes.main_inlet.actual * 4 : 180;
  const tankLevel = simState?.tank_level_pct ?? 78;

  const node = selected && latest ? latest.nodes[selected] : null;

  const totals = useMemo(() => {
    if (!latest) return null;
    const reads = Object.values(latest.nodes);
    const active = reads.filter(
      (r) => r.detector_state === "WARNING" || r.detector_state === "CRITICAL",
    );
    return {
      nodes: reads.length,
      flagged: active.length,
      excess: active.reduce((a, r) => a + r.excess_lph, 0),
    };
  }, [latest]);

  return (
    <div className="space-y-4">
      {/* Header summary + view toggle */}
      <div className="flex flex-col gap-3 border-b border-slate-200/80 pb-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">
              Spatial digital twin
            </h1>
            <Badge tone="teal">{viewMode === "3d" ? "3D building model" : "Pipe topology"}</Badge>
            <Badge tone={abnormalNodes.length > 0 ? "critical" : "healthy"}>
              {abnormalNodes.length > 0 ? `${abnormalNodes.length} anomalies` : "Optimal balance"}
            </Badge>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
              <Users size={11} className="text-blue-600" />
              {Math.round(simState?.occupancy?.occupied_rooms ?? 0)} rooms |{" "}
              {Math.round(simState?.occupancy?.guests ?? 0)} guests
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            One surface for the physical building model and the hydraulic distribution graph.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              onClick={() => setViewMode("3d")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                viewMode === "3d"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Box size={14} />
              3D building
            </button>
            <button
              onClick={() => setViewMode("2d")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                viewMode === "2d"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <NetworkIcon size={14} />
              Pipe topology
            </button>
          </div>
          <Link to="/incidents">
            <button className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700">
              <ShieldAlert size={14} />
              Incident desk
            </button>
          </Link>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Kpi
          label="Inlet supply"
          value={inletFlow.toFixed(0)}
          unit="L/h"
          tone="teal"
          icon={<Droplets size={14} />}
          hint="Municipal main intake"
        />
        <Kpi
          label="Roof tank reserve"
          value={tankLevel.toFixed(0)}
          unit="%"
          tone={tankLevel < 30 ? "critical" : tankLevel < 50 ? "warning" : "healthy"}
          icon={<Gauge size={14} />}
          hint="Overhead storage level"
        />
        <Kpi
          label="Abnormal nodes"
          value={String(abnormalNodes.length)}
          tone={abnormalNodes.length > 0 ? "critical" : "healthy"}
          icon={<AlertTriangle size={14} />}
          hint={abnormalNodes.length > 0 ? "Downstream anomalies" : "All nodes nominal"}
        />
        <Kpi
          label="Excess loss flow"
          value={totalExcess.toFixed(1)}
          unit="L/h"
          tone={totalExcess > 0 ? "critical" : "healthy"}
          icon={<Activity size={14} />}
          hint="Above P90 expected band"
        />
        <Kpi
          label="Est. cost impact"
          value={fmtCurrency(totalExcess * 24 * 0.15).replace("\u20b9", "")}
          unit="\u20b9 / day"
          tone={totalExcess > 0 ? "critical" : "healthy"}
          icon={<IndianRupee size={14} />}
          hint="At \u20b9150 / kL tariff"
        />
      </div>

      {/* Primary view */}
      {viewMode === "3d" ? (
        <DigitalTwin3D />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
          <Panel className="xl:col-span-3">
            <PanelHeader
              title="Distribution topology"
              subtitle="Click any node to inspect its live reading"
              icon={<NetworkIcon size={15} />}
              right={
                <div className="hidden items-center gap-3 md:flex">
                  {LEGEND.map((l) => (
                    <span key={l.state} className="flex items-center gap-1.5 text-[10px] text-slate-500">
                      <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />
                      {l.state.charAt(0) + l.state.slice(1).toLowerCase()}
                    </span>
                  ))}
                </div>
              }
            />
            <div className="p-3">
              {topology ? (
                <NetworkGraph topology={topology} selectedId={selected} onSelect={setSelected} />
              ) : (
                <div className="h-72 animate-pulse rounded-xl bg-slate-100" />
              )}
            </div>
          </Panel>

          <div className="space-y-4">
            <Panel>
              <PanelHeader
                title="Selected node"
                subtitle={node?.node_name ?? "None"}
                icon={<Droplets size={15} />}
              />
              <div className="space-y-2.5 p-4">
                {node ? (
                  <>
                    <StatusPill state={node.detector_state} />
                    <Info label="Type" value={node.node_type.replaceAll("_", " ")} />
                    <Info
                      label="Actual"
                      value={node.actual !== null ? `${node.actual.toFixed(2)} L/15m` : "no reading"}
                    />
                    <Info label="Expected" value={`${node.expected.toFixed(2)} L/15m`} />
                    <Info label="Excess" value={fmtLph(node.excess_lph)} />
                    <Info label="Sensor" value={node.sensor_state} />
                  </>
                ) : (
                  <p className="text-xs text-slate-500">Select a node on the graph.</p>
                )}
              </div>
            </Panel>

            <Panel>
              <PanelHeader title="Network summary" />
              <div className="space-y-2.5 p-4">
                <Info label="Monitored nodes" value={String(totals?.nodes ?? "-")} />
                <Info label="Flagged nodes" value={String(totals?.flagged ?? "-")} />
                <Info label="Total excess" value={fmtLph(totals?.excess ?? 0)} />
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* Bottom architectural & hydraulic summary */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel>
          <PanelHeader
            title="Building architecture"
            subtitle="Hill hotel structural specs"
            icon={<Layers size={14} />}
          />
          <div className="space-y-2.5 p-4 text-xs">
            <Row label="Footprint area" value="22.0m x 10.0m (220 m2/floor)" />
            <Row label="Levels monitored" value="3 floors + roof + plant room" />
            <Row label="Guest units" value="12 suites across Wings A and B" />
            <Row label="Facilities" value="Restaurant, kitchen and laundry" />
            <Row label="Plumbing topology" value="Dual gravity and pressurised risers" />
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Sensor network mapping"
            subtitle="Spatial telemetry to backend IDs"
            icon={<Radio size={14} />}
          />
          <div className="space-y-2 p-4 text-xs">
            {[
              { twin: "S1", name: "Inlet meter", backend: "main_inlet", type: "DN50 CPVC" },
              { twin: "S2", name: "Rooftop tank", backend: "tank", type: "Ultrasonic beam" },
              { twin: "S3", name: "Wing A riser", backend: "wing_a", type: "DN32 copper" },
              { twin: "S4", name: "Wing B riser", backend: "wing_b", type: "DN32 copper" },
              { twin: "S5", name: "Kitchen supply", backend: "kitchen", type: "DN25 stainless" },
              { twin: "S6", name: "Laundry facility", backend: "laundry", type: "DN32 CPVC" },
              { twin: "S7", name: "Floor 2 endpoint", backend: "floor_b2", type: "DN20 PEX-A" },
            ].map((s) => (
              <div
                key={s.twin}
                className="flex items-center justify-between border-b border-slate-100 py-1 last:border-0"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-blue-600">{s.twin}</span>
                  <span className="text-slate-800">{s.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-slate-500">{s.type}</span>
                  <span className="font-mono text-[10px] text-slate-400">[{s.backend}]</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="At a glance"
            subtitle="What this view is for"
            icon={<Activity size={14} />}
          />
          <div className="space-y-2.5 p-4 text-xs leading-relaxed text-slate-500">
            <p>
              The 3D building model shows where water physically moves through the property. The pipe
              topology shows how the metered branches relate hydraulically, so a downstream leak can
              be traced to its isolation valve.
            </p>
            <p>
              Every reading is simulated. Confidence scores are heuristic evidence, not calibrated
              probabilities.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-mono text-slate-800">{value}</span>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="font-mono text-xs text-slate-800">{value}</span>
    </div>
  );
}
