import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Droplets, Network as NetworkIcon } from "lucide-react";
import { useSimulation } from "../store/SimulationContext";
import { Badge, Panel, PanelHeader } from "../components/ui/primitives";
import { StatusPill } from "../components/ui/StatusPill";
import { NetworkGraph } from "../components/network/NetworkGraph";
import { fmtLph } from "../lib/format";

const LEGEND = [
  { state: "HEALTHY", color: "#34D399" },
  { state: "WATCH", color: "#38BDF8" },
  { state: "WARNING", color: "#FBBF24" },
  { state: "CRITICAL", color: "#FB7185" },
  { state: "OFFLINE", color: "#64748B" },
];

export function WaterNetwork() {
  const { topology, latest } = useSimulation();
  const [selected, setSelected] = useState<string | null>("main_inlet");

  const node = selected && latest ? latest.nodes[selected] : null;

  const totals = useMemo(() => {
    if (!latest) return null;
    const reads = Object.values(latest.nodes);
    const active = reads.filter((r) => r.detector_state === "WARNING" || r.detector_state === "CRITICAL");
    return {
      nodes: reads.length,
      flagged: active.length,
      excess: active.reduce((a, r) => a + r.excess_lph, 0),
    };
  }, [latest]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <Panel className="xl:col-span-3">
          <PanelHeader
            title="Distribution topology"
            subtitle="Click any node to inspect its live reading"
            icon={<NetworkIcon size={15} />}
            right={
              <div className="hidden items-center gap-3 md:flex">
                {LEGEND.map((l) => (
                  <span key={l.state} className="flex items-center gap-1.5 text-[10px] text-muted">
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
              <div className="h-72 animate-pulse rounded-lg bg-line/30" />
            )}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Selected node" subtitle={node?.node_name ?? "None"} icon={<Droplets size={15} />} />
            <div className="space-y-2.5 p-4">
              {node ? (
                <>
                  <StatusPill state={node.detector_state} />
                  <Info label="Type" value={node.node_type.replaceAll("_", " ")} />
                  <Info label="Actual" value={node.actual !== null ? `${node.actual.toFixed(2)} L/15min` : "no reading"} />
                  <Info label="Expected" value={`${node.expected.toFixed(2)} L/15min`} />
                  <Info label="Excess" value={fmtLph(node.excess_lph)} />
                  <Info label="Sensor" value={node.sensor_state} />
                  <Link
                    to={`/monitor?node=${selected}`}
                    className="mt-1 block text-[11px] font-medium text-teal hover:underline"
                  >
                    Open in Live Monitor
                  </Link>
                </>
              ) : (
                <p className="text-xs text-muted">Select a node on the map.</p>
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Network summary" />
            <div className="space-y-2.5 p-4">
              <Info label="Monitored nodes" value={String(totals?.nodes ?? "-")} />
              <Info label="Flagged nodes" value={String(totals?.flagged ?? "-")} />
              <Info label="Total excess" value={fmtLph(totals?.excess ?? 0)} />
              <Badge tone="muted">Unmetered draws (kitchen, laundry) are estimated from exogenous load</Badge>
            </div>
          </Panel>
        </div>
      </div>

      <Panel>
        <PanelHeader title="Node register" subtitle="Every node with its live state" />
        <div className="overflow-x-auto p-1">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[10px]  text-muted">
                <th className="px-3 py-2">Node</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-right">Actual</th>
                <th className="px-3 py-2 text-right">Expected</th>
                <th className="px-3 py-2 text-right">Excess</th>
                <th className="px-3 py-2">State</th>
              </tr>
            </thead>
            <tbody>
              {topology?.nodes.map((n) => {
                const r = latest?.nodes[n.id];
                return (
                  <tr
                    key={n.id}
                    onClick={() => setSelected(n.id)}
                    className="cursor-pointer border-t border-line/40 hover:bg-elevated/60"
                  >
                    <td className="px-3 py-2 font-medium text-ink">{n.name}</td>
                    <td className="px-3 py-2 text-muted">{n.node_type.replaceAll("_", " ")}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-ink">
                      {r?.actual !== null && r?.actual !== undefined ? r.actual.toFixed(2) : "-"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-cyan">
                      {r ? r.expected.toFixed(2) : "-"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-muted">
                      {r ? r.excess_lph.toFixed(1) : "-"}
                    </td>
                    <td className="px-3 py-2">{r ? <StatusPill state={r.detector_state} size="sm" /> : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-mono text-xs text-ink">{value}</span>
    </div>
  );
}
