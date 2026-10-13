import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertOctagon,
  ArrowRight,
  CheckCircle2,
  Droplets,
  Gauge,
  IndianRupee,
  Layers,
  ShieldCheck,
} from "lucide-react";
import { api } from "../api/client";
import { usePolling } from "../lib/hooks";
import { useSimulation } from "../store/SimulationContext";
import { fmtCurrency } from "../lib/format";
import { meterReads, sum, sumExcessLph, worstState } from "../lib/aggregate";
import { Badge, Kpi, Panel, PanelHeader } from "../components/ui/primitives";
import { DigitalTwin3D } from "../components/twin/DigitalTwin3D";

const TARIFF = 150;

export function Overview() {
  const { latest, state } = useSimulation();
  const incidents = usePolling(() => api.incidents({ limit: "50" }), 4000);

  const reads = useMemo(() => (latest ? Object.values(latest.nodes) : []), [latest]);
  const meters = useMemo(() => (latest ? meterReads(latest.nodes) : []), [latest]);
  const worst = reads.length ? worstState(reads) : "HEALTHY";
  const excessLph = sumExcessLph(meters);
  const totalActualLph = sum(meters.map((r) => r.actual)) * 4;
  const expectedLph = (latest?.nodes?.main_inlet?.expected ?? 0) * 4;

  const open = useMemo(
    () =>
      (incidents.data?.items ?? []).filter(
        (i) => !["RESOLVED", "FALSE_POSITIVE"].includes(i.status),
      ),
    [incidents.data],
  );
  const isHealthy = worst === "HEALTHY" && open.length === 0;

  const tankPct = state?.tank_level_pct ?? 82;
  const tankL = Math.round(tankPct * 500);
  const bufferHrs = tankL / Math.max(1, totalActualLph || 180);

  return (
    <div className="space-y-6">
      {/* Executive KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi
          label="Water security"
          value={worst === "CRITICAL" ? "Leak alert" : worst === "WARNING" ? "Warning" : "Optimal"}
          tone={worst === "CRITICAL" ? "critical" : worst === "WARNING" ? "warning" : "healthy"}
          icon={<ShieldCheck size={16} />}
          hint={isHealthy ? "All sensors nominal" : "Inspect flagged zone"}
        />
        <Kpi
          label="Live intake"
          value={totalActualLph.toFixed(0)}
          unit="L/h"
          tone="teal"
          icon={<Droplets size={16} />}
          hint={expectedLph > 0 ? `Model expects ${expectedLph.toFixed(0)} L/h` : "Municipal booster intake"}
        />
        <Kpi
          label="Overhead storage"
          value={`${Math.round(tankPct)}%`}
          unit={`${tankL.toLocaleString()} L`}
          tone={tankPct < 30 ? "critical" : tankPct < 50 ? "warning" : "teal"}
          icon={<Gauge size={16} />}
          hint={`${bufferHrs.toFixed(1)} h emergency buffer`}
        />
        <Kpi
          label="Excess flow"
          value={excessLph.toFixed(1)}
          unit="L/h"
          tone={excessLph > 0 ? "critical" : "healthy"}
          icon={<Activity size={16} />}
          hint={excessLph > 0 ? "Above P90 band" : "Zero excess draw"}
        />
        <Kpi
          label="Active loss cost"
          value={fmtCurrency(excessLph * 24 * (TARIFF / 1000)).replace("\u20b9", "")}
          unit="\u20b9 / day"
          tone={excessLph > 0 ? "critical" : "healthy"}
          icon={<IndianRupee size={16} />}
          hint={`At ${fmtCurrency(TARIFF)} / kL`}
        />
      </div>

      {/* Hero: twin beside dispatch */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Layers size={15} className="text-blue-600" />
              <h2 className="text-sm font-bold text-slate-700">Interactive digital twin</h2>
              <span className="text-xs text-slate-400">Drag to orbit, scroll to zoom, click a pin</span>
            </div>
            <Link
              to="/twin"
              className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              Open spatial twin
              <ArrowRight size={12} />
            </Link>
          </div>
          <DigitalTwin3D compact showInspector={false} />
        </div>

        <div className="lg:col-span-2">
          <Panel className="flex h-full flex-col">
            <PanelHeader
              title="Active alerts & dispatch"
              subtitle="Front desk action desk"
              icon={<AlertOctagon size={15} />}
            />
            <div className="max-h-[500px] flex-1 space-y-3 overflow-y-auto p-4">
              {open.length > 0 ? (
                open.slice(0, 4).map((inc) => (
                  <div key={inc.id} className="rounded-xl border border-red-200 bg-red-50/50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-red-700">{inc.node_name}</span>
                      <Badge tone="critical">{inc.severity.replaceAll("_", " ")}</Badge>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-red-900">
                      Continuous draw exceeding the expected band by +{inc.excess_flow_lph.toFixed(0)} L/h.
                      Suspected leaking fixture or flapper valve.
                    </p>
                    {inc.recommendation ? (
                      <p className="mt-1 text-[11px] text-red-700/80">{inc.recommendation}</p>
                    ) : null}
                    <Link to={`/incidents?id=${inc.id}`}>
                      <button className="mt-2 w-full rounded-lg bg-red-600 py-2 text-xs font-semibold text-white transition hover:bg-red-700">
                        Dispatch maintenance
                      </button>
                    </Link>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 text-center">
                  <CheckCircle2 size={22} className="mx-auto mb-1.5 text-emerald-500" />
                  <p className="text-xs font-bold text-emerald-800">No active incidents</p>
                  <p className="mt-0.5 text-[11px] text-emerald-600">
                    Continuous monitoring across every inline meter.
                  </p>
                </div>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
