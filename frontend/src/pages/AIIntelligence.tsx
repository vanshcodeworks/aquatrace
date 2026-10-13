import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Brain, Cpu, GitBranch, Layers, RefreshCw, ShieldCheck, Target } from "lucide-react";
import { api } from "../api/client";
import { usePolling } from "../lib/hooks";
import { useSimulation } from "../store/SimulationContext";
import { fmtDateTime, fmtLph, fmtPct } from "../lib/format";
import { Badge, Button, Panel, PanelHeader, Skeleton } from "../components/ui/primitives";

const PIPELINE = [
  { icon: <Layers size={15} />, title: "Exogenous features", body: "Occupancy, meals, laundry load, hour, day-of-week and node identity only. Recent-actual lags are deliberately excluded." },
  { icon: <Cpu size={15} />, title: "Expected-use model", body: "LightGBM quantile regression predicts the P10/P50/P90 flow band for every node at each interval." },
  { icon: <Target size={15} />, title: "Detector", body: "Band exceedance plus persistence, CUSUM drift and burst checks turn residuals into HEALTHY/WATCH/WARNING/CRITICAL states." },
  { icon: <GitBranch size={15} />, title: "Localisation", body: "The deepest abnormal node is reported, so one leak maps to one incident even if parents also shift." },
  { icon: <ShieldCheck size={15} />, title: "Diagnosis", body: "Rules combine magnitude, timing, laundry ratios and parent mass-balance to name the most likely cause." },
];

export function AIIntelligence() {
  const { latest, topology } = useSimulation();
  const ai = usePolling(() => api.aiStatus(), 12000);
  const history = usePolling(() => api.history("main_inlet", 64), 4000);
  const [retraining, setRetraining] = useState(false);
  const [retrainMsg, setRetrainMsg] = useState<string | null>(null);

  const residualData = useMemo(
    () =>
      (history.data?.series ?? []).map((s: any) => ({
        t: fmtDateTime(s.sim_time).split(", ").pop() ?? "",
        residual: s.residual,
      })),
    [history.data],
  );

  const flagged = useMemo(() => {
    if (!latest) return [];
    return Object.values(latest.nodes)
      .filter((n) => n.detector_state === "WARNING" || n.detector_state === "CRITICAL")
      .sort((a, b) => b.excess_lph - a.excess_lph);
  }, [latest]);

  async function handleRetrain() {
    setRetraining(true);
    setRetrainMsg(null);
    try {
      await api.retrain();
      setRetrainMsg("Retrain triggered. Model metadata will refresh shortly.");
    } catch {
      setRetrainMsg("Retrain request failed.");
    } finally {
      setRetraining(false);
    }
  }

  const model = ai.data?.model;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Expected-use model"
            subtitle="Supervised regression of normal demand from exogenous drivers"
            icon={<Brain size={15} />}
            right={
              <Button size="sm" variant="secondary" onClick={handleRetrain} disabled={retraining} icon={<RefreshCw size={13} />}>
                {retraining ? "Retraining..." : "Retrain"}
              </Button>
            }
          />
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
            <Metric label="Model" value={model?.model_name ?? "-"} mono={false} />
            <Metric label="Fitted" value={model?.fitted ? "Yes" : "Fallback"} />
            <Metric label="Rows" value={model?.n_samples?.toLocaleString() ?? "-"} />
            <Metric
              label="Train WAPE"
              value={model?.train_metrics?.wape !== undefined ? fmtPct(model.train_metrics.wape) : "-"}
            />
          </div>
          {retrainMsg ? (
            <p className="px-4 pb-3 text-[11px] text-teal">{retrainMsg}</p>
          ) : null}
          {model?.fallback_reason ? (
            <p className="mx-4 mb-4 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] text-warning">
              {model.fallback_reason}
            </p>
          ) : null}
          <div className="border-t border-line/50 px-4 py-3">
            <p className="mb-2 text-[11px] font-medium  text-muted">Feature set</p>
            <div className="flex flex-wrap gap-1.5">
              {model?.features?.map((f) => (
                <span key={f} className="rounded-md border border-line/60 bg-app2 px-2 py-0.5 font-mono text-[10px] text-muted">
                  {f}
                </span>
              )) ?? <Skeleton className="h-5 w-40" />}
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Data mode" icon={<ShieldCheck size={15} />} />
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">Source</span>
              <Badge tone="teal">{ai.data?.data_mode ?? "-"}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">Retrain status</span>
              <Badge tone={ai.data?.retrain?.running ? "warning" : "muted"}>
                {ai.data?.retrain?.running ? "Running" : "Idle"}
              </Badge>
            </div>
            <p className="rounded-lg border border-line/50 bg-app2 p-3 text-[11px] leading-relaxed text-muted">
              {ai.data?.note ??
                "All telemetry is generated by the built-in simulator. No real sensors, building systems or personal data are used anywhere in AquaTrace."}
            </p>
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Detection pipeline"
          subtitle="How a raw reading becomes a diagnosed incident"
          icon={<GitBranch size={15} />}
        />
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3 xl:grid-cols-5">
          {PIPELINE.map((s, i) => (
            <div key={s.title} className="rounded-lg border border-line/50 bg-app2 p-3">
              <div className="flex items-center gap-2 text-teal">
                {s.icon}
                <span className="text-[10px] font-semibold  text-muted">Step {i + 1}</span>
              </div>
              <p className="mt-2 text-xs font-semibold text-ink">{s.title}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Main inlet residuals"
            subtitle="Actual minus expected (L/interval); zero line is the healthy baseline"
          />
          <div className="p-3">
            {residualData.length ? (
              <div style={{ width: "100%", height: 240 }}>
                <ResponsiveContainer>
                  <BarChart data={residualData} margin={{ top: 8, right: 12, bottom: 4, left: -10 }}>
                    <XAxis dataKey="t" tick={{ fill: "#94A3B8", fontSize: 10 }} tickLine={false} minTickGap={24} />
                    <YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} tickLine={false} axisLine={false} width={44} />
                    <ReferenceLine y={0} stroke="#334155" />
                    <Tooltip
                      contentStyle={{ background: "#101F32", border: "1px solid #26384D", borderRadius: 8, fontSize: 11 }}
                      labelStyle={{ color: "#94A3B8" }}
                    />
                    <Bar dataKey="residual" name="Residual (L/15min)">
                      {residualData.map((d, i) => (
                        <Cell key={i} fill={d.residual > 0 ? "#FB7185" : "#38BDF8"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Skeleton className="h-[240px] w-full" />
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Live localisation"
            subtitle="Deepest abnormal node wins - one leak, one incident"
            icon={<Target size={15} />}
          />
          <div className="space-y-2 p-4">
            {flagged.length ? (
              flagged.map((n) => {
                const def = topology?.nodes.find((x) => x.id === n.node_id);
                const chain: string[] = [];
                let cur = def?.parent_id ?? null;
                while (cur) {
                  const p = topology?.nodes.find((x) => x.id === cur);
                  if (!p) break;
                  chain.unshift(p.name);
                  cur = p.parent_id;
                }
                return (
                  <div key={n.node_id} className="rounded-lg border border-line/50 bg-app2 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-ink">{n.node_name}</span>
                      <Badge tone={n.detector_state === "CRITICAL" ? "critical" : "warning"}>{n.detector_state}</Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-muted">
                      Excess {fmtLph(n.excess_lph)} | depth {chain.length} in the distribution tree
                    </p>
                    {chain.length ? (
                      <p className="mt-1 font-mono text-[10px] text-muted">
                        {chain.join(" / ")} / <span className="text-critical">{n.node_name}</span>
                      </p>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <p className="py-6 text-center text-xs text-muted">
                No abnormal nodes - localisation is idle. Inject a fault in the Simulation Lab to see it
                resolve to the deepest affected node.
              </p>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Metric({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-line/50 bg-app2 px-3 py-2.5">
      <p className="text-[10px]  text-muted">{label}</p>
      <p className={`mt-1 text-sm font-semibold text-ink ${mono ? "font-mono tabular-nums" : ""}`}>{value}</p>
    </div>
  );
}
