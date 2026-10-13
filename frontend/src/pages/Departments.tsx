import { useMemo } from "react";
import { Building2, Droplets, IndianRupee, PieChart, Utensils, Waves, WashingMachine } from "lucide-react";
import { useSimulation } from "../store/SimulationContext";
import { departmentSummaries, TARIFF_PER_KL } from "../lib/departments";
import { fmtCurrency, fmtLph } from "../lib/format";
import { Badge, EmptyState, Kpi, Panel, PanelHeader } from "../components/ui/primitives";

const ICONS = {
  rooms: Building2,
  laundry: WashingMachine,
  kitchen: Utensils,
} as const;

const TONE = {
  ok: { badge: "healthy" as const, bar: "bg-emerald-500", label: "Within band" },
  watch: { badge: "warning" as const, bar: "bg-amber-500", label: "Watch" },
  alert: { badge: "critical" as const, bar: "bg-red-500", label: "Above band" },
};

export function Departments() {
  const { latest } = useSimulation();

  const depts = useMemo(
    () => (latest ? departmentSummaries(latest.nodes) : []),
    [latest],
  );

  const totals = useMemo(() => {
    if (!latest) return { intakeLph: 0, excessLph: 0, dailySaving: 0 };
    const reads = Object.values(latest.nodes);
    const intakeLph = reads.reduce((acc, r) => acc + (r.actual ?? 0) * 4, 0);
    const excessLph = reads.reduce((acc, r) => acc + (r.excess_lph ?? 0), 0);
    return {
      intakeLph,
      excessLph,
      dailySaving: (excessLph * 24 * TARIFF_PER_KL) / 1000,
    };
  }, [latest]);

  if (!latest) {
    return (
      <Panel>
        <EmptyState
          title="Waiting for telemetry"
          message="Start or step the simulation to compute departmental consumption and savings."
          icon={<PieChart size={22} />}
        />
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Department savings</h1>
        <p className="text-xs text-slate-500">
          Consumption broken down by hotel department, with the specific action that recovers each
          litre. Savings are estimated at the {fmtCurrency(TARIFF_PER_KL)} per kL tariff.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Total intake"
          value={totals.intakeLph.toFixed(0)}
          unit="L/h"
          tone="teal"
          icon={<Droplets size={16} />}
          hint="Sum of metered department draw"
        />
        <Kpi
          label="Excess draw"
          value={totals.excessLph.toFixed(1)}
          unit="L/h"
          tone={totals.excessLph > 0 ? "critical" : "healthy"}
          icon={<Waves size={16} />}
          hint={totals.excessLph > 0 ? "Above expected band" : "All departments nominal"}
        />
        <Kpi
          label="Recoverable today"
          value={fmtCurrency(totals.dailySaving).replace("\u20b9", "")}
          unit="\u20b9 / day"
          tone={totals.dailySaving > 0 ? "warning" : "healthy"}
          icon={<IndianRupee size={16} />}
          hint="If flagged draw is isolated today"
        />
        <Kpi
          label="Recoverable this month"
          value={fmtCurrency(totals.dailySaving * 30).replace("\u20b9", "")}
          unit="\u20b9 / 30d"
          tone={totals.dailySaving > 0 ? "warning" : "healthy"}
          icon={<IndianRupee size={16} />}
          hint="Projected at current rate"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {depts.map((d) => {
          const Icon = ICONS[d.key];
          const tone = TONE[d.status];
          return (
            <Panel key={d.key} className="flex flex-col">
              <PanelHeader
                title={d.name}
                subtitle={d.blurb}
                icon={<Icon size={15} />}
                right={<Badge tone={tone.badge}>{tone.label}</Badge>}
              />
              <div className="flex flex-1 flex-col gap-4 p-5">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-slate-500">Live draw</p>
                    <p className="font-mono text-2xl font-bold text-slate-900">
                      {d.actualLph.toFixed(0)}
                      <span className="ml-1 text-xs font-medium text-slate-400">L/h</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-slate-500">Share of intake</p>
                    <p className="font-mono text-lg font-semibold text-blue-600">
                      {d.sharePct.toFixed(1)}%
                    </p>
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
                    <span>Expected {d.expectedLph.toFixed(0)} L/h</span>
                    <span>
                      {d.excessLph > 0 ? `+${d.excessLph.toFixed(1)} L/h excess` : "No excess"}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${tone.bar} transition-all duration-500`}
                      style={{ width: `${Math.min(100, d.sharePct)}%` }}
                    />
                  </div>
                </div>

                <div className="mt-auto rounded-xl border border-slate-200/80 bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Recommendation
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{d.recommendation}</p>
                  {d.dailySaving > 0 ? (
                    <p className="mt-2 text-xs font-semibold text-amber-600">
                      Estimated recovery: {fmtCurrency(d.dailySaving)} / day
                    </p>
                  ) : null}
                </div>
              </div>
            </Panel>
          );
        })}
      </div>

      <Panel>
        <PanelHeader
          title="Node readings by department"
          subtitle="Every metered fixture group with its live reading"
          icon={<PieChart size={15} />}
        />
        <div className="overflow-x-auto p-1">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[11px] font-semibold text-slate-400">
                <th className="px-3 py-2">Node</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-right">Actual</th>
                <th className="px-3 py-2 text-right">Expected</th>
                <th className="px-3 py-2 text-right">Excess</th>
                <th className="px-3 py-2 text-right">State</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(latest.nodes).map((r) => (
                <tr key={r.node_id} className="border-t border-slate-100 hover:bg-slate-50/70">
                  <td className="px-3 py-2 font-medium text-slate-800">{r.node_name}</td>
                  <td className="px-3 py-2 text-slate-500">{r.node_type.replaceAll("_", " ")}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-800">
                    {r.actual !== null && r.actual !== undefined ? `${r.actual.toFixed(2)} L/15m` : "unmetered"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-blue-600">
                    {r.expected.toFixed(2)} L/15m
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${
                      r.excess_lph > 0 ? "text-red-600 font-semibold" : "text-slate-500"
                    }`}
                  >
                    {fmtLph(r.excess_lph)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-600">
                    {r.detector_state.charAt(0) + r.detector_state.slice(1).toLowerCase()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
