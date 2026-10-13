import { Link } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Brain,
  Database,
  Download,
  Droplets,
  FlaskConical,
  Gauge,
  Info,
  Network,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Sliders,
  StepForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useState } from "react";
import { api } from "../api/client";
import { usePolling } from "../lib/hooks";
import { useSimulation } from "../store/SimulationContext";
import { useNotifications } from "../store/NotificationContext";
import { Badge, Button, Panel, PanelHeader, Skeleton } from "../components/ui/primitives";
import { INTERVAL_MINUTES } from "../lib/units";
import { fmtDateTime } from "../lib/format";

export function Settings() {
  const { state, actionPending, start, pause, step, reset, setSpeed, runDemo } = useSimulation();
  const health = usePolling(() => api.health(), 15000);
  const ai = usePolling(() => api.aiStatus(), 12000);
  const { soundEnabled, setSoundEnabled } = useNotifications();
  const [retraining, setRetraining] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function retrain() {
    setRetraining(true);
    setMsg(null);
    try {
      await api.retrain();
      setMsg("Retrain started in the background.");
    } catch {
      setMsg("Retrain failed.");
    } finally {
      setRetraining(false);
    }
  }

  const detector = ai.data?.detector ?? {};
  const running = state?.status === "RUNNING";

  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader
          title="Playback and simulation control"
          subtitle="Drive the simulated clock from the settings console"
          icon={<Play size={15} />}
          right={
            <Badge tone={running ? "healthy" : state?.status === "PAUSED" ? "warning" : "muted"}>
              {state?.status ?? "-"}
            </Badge>
          }
        />
        <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-4">
            <p className="text-[11px] font-medium text-slate-400">Simulated clock</p>
            <p className="mt-1 font-mono text-lg font-bold text-slate-900">
              {fmtDateTime(state?.sim_time ?? null)}
            </p>
            <p className="mt-1.5 text-[11px] text-slate-500">
              Scenario <span className="font-medium text-slate-700">{state?.scenario ?? "-"}</span>
              {" | "}seed <span className="font-mono text-slate-700">{state?.seed ?? "-"}</span>
            </p>
          </div>
          <div className="space-y-3 lg:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              {running ? (
                <Button variant="primary" onClick={pause} disabled={actionPending} icon={<Pause size={14} />}>
                  Pause
                </Button>
              ) : (
                <Button variant="primary" onClick={start} disabled={actionPending} icon={<Play size={14} />}>
                  Run
                </Button>
              )}
              <Button variant="secondary" onClick={step} disabled={actionPending || running} icon={<StepForward size={14} />}>
                Step
              </Button>
              <Button variant="secondary" onClick={() => reset()} disabled={actionPending} icon={<RotateCcw size={14} />}>
                Reset
              </Button>
              <Button variant="secondary" onClick={runDemo} disabled={actionPending} icon={<FlaskConical size={14} />}>
                Run guided demo
              </Button>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-600">Speed</p>
              <div className="flex gap-2">
                {[1, 5, 15, 60].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                      state?.speed === s
                        ? "border-blue-300 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Runtime" subtitle="Backend and simulation status" icon={<Info size={15} />} />
          <div className="space-y-2 p-4">
            <Row label="API base URL" value={api.baseUrl} mono />
            <Row label="Backend status" value={health.data?.status ?? "-"} />
            <Row label="Version" value={health.data?.version ?? "-"} mono />
            <Row label="Data mode" value={<Badge tone="teal">{health.data?.data_mode ?? "SIMULATED"}</Badge>} />
            <Row label="Database" value={health.data?.db ?? "-"} mono />
            <Row label="Interval" value={`${INTERVAL_MINUTES} minutes`} />
            <Row label="Sim clock" value={state?.status ?? "-"} />
            <Row label="Scenario" value={state?.scenario ?? "-"} />
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Model"
            subtitle="Expected-use model metadata"
            icon={<Database size={15} />}
            right={
              <Button size="sm" variant="secondary" onClick={retrain} disabled={retraining} icon={<RefreshCw size={13} />}>
                {retraining ? "Retraining..." : "Retrain"}
              </Button>
            }
          />
          <div className="space-y-2 p-4">
            <Row label="Model" value={ai.data?.model.model_name ?? "-"} mono />
            <Row label="Fitted" value={<Badge tone={ai.data?.model.fitted ? "healthy" : "warning"}>{ai.data?.model.fitted ? "Yes" : "Fallback"}</Badge>} />
            <Row label="Samples" value={ai.data?.model.n_samples?.toLocaleString() ?? "-"} mono />
            <Row label="Retrain state" value={ai.data?.retrain?.running ? "Running" : "Idle"} />
            {ai.data?.model.fallback_reason ? (
              <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] text-warning">
                {ai.data.model.fallback_reason}
              </p>
            ) : null}
            {msg ? <p className="text-[11px] text-teal">{msg}</p> : null}
            <div>
              <p className="mb-1.5 mt-2 text-[11px] font-medium  text-muted">Features</p>
              <div className="flex flex-wrap gap-1.5">
                {ai.data?.model.features?.map((f) => (
                  <span key={f} className="rounded-md border border-line/60 bg-app2 px-2 py-0.5 font-mono text-[10px] text-muted">
                    {f}
                  </span>
                )) ?? <Skeleton className="h-5 w-40" />}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Detection parameters" subtitle="Active thresholds for the anomaly detector" icon={<Sliders size={15} />} />
          <div className="space-y-2 p-4">
            {["persistence_readings", "recovery_readings", "band_tolerance_pct", "min_excess_lph", "critical_excess_pct", "cusum_threshold", "mass_balance_tolerance_pct"].map(
              (k) => (
                <Row key={k} label={k.replaceAll("_", " ")} value={detector[k] !== undefined ? String(detector[k]) : "-"} mono />
              ),
            )}
            <div className="mt-3 border-t border-line/50 pt-3">
              <p className="mb-1.5 text-[11px] font-medium  text-muted">Pipeline stages</p>
              <ul className="space-y-1">
                {(detector.pipeline as string[] | undefined)?.map((p, i) => (
                  <li key={i} className="flex gap-2 text-[11px] text-muted">
                    <span className="text-teal">{i + 1}.</span>
                    {p}
                  </li>
                )) ?? <li className="text-[11px] text-muted">Loading...</li>}
              </ul>
            </div>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Notifications" subtitle="Operator alerts" icon={soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />} />
            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-ink">Sound alerts</p>
                  <p className="text-[11px] text-muted">Play a tone when a critical alert is raised.</p>
                </div>
                <Button size="sm" variant={soundEnabled ? "primary" : "secondary"} onClick={() => setSoundEnabled(!soundEnabled)}>
                  {soundEnabled ? "On" : "Off"}
                </Button>
              </div>
              <p className="text-[11px] text-muted">
                In-app notifications are raised automatically for new critical readings, offline sensors
                and recoveries.
              </p>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Data export" subtitle="Download simulated telemetry and incidents" icon={<Download size={15} />} />
            <div className="flex flex-wrap gap-2 p-4">
              <a href={api.exportTelemetryUrl(state?.session_id)} download>
                <Button size="sm" variant="secondary" icon={<Download size={13} />}>
                  Telemetry CSV
                </Button>
              </a>
              <a href={api.exportIncidentsUrl("csv")} download>
                <Button size="sm" variant="secondary" icon={<Download size={13} />}>
                  Incidents CSV
                </Button>
              </a>
              <a href={api.exportIncidentsUrl("json")} download>
                <Button size="sm" variant="secondary" icon={<Download size={13} />}>
                  Incidents JSON
                </Button>
              </a>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Units & data policy" icon={<Info size={15} />} />
            <div className="space-y-2 p-4 text-[11px] leading-relaxed text-muted">
              <p>
                Flow is reported in litres per {INTERVAL_MINUTES}-minute interval. One interval equals
                {" "}
                {60 / INTERVAL_MINUTES} L/h, and conversions are always labelled so a value is never
                shown with two meanings.
              </p>
              <p>
                All telemetry in AquaTrace is generated by the built-in simulator. No real sensors,
                building systems or personal data are used. Confidence values are heuristic evidence
                scores, not calibrated probabilities.
              </p>
            </div>
          </Panel>
        </div>
      </div>
      <Panel>
        <PanelHeader
          title="Diagnostics and advanced tools"
          subtitle="Model, benchmarks and planning screens used for audits and demos"
          icon={<Sliders size={15} />}
        />
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { to: "/ai", label: "AI engine", desc: "Model, detector pipeline and localisation", icon: Brain },
            { to: "/benchmarks", label: "Benchmarks", desc: "Detector metrics against baselines", icon: BarChart3 },
            { to: "/monitor", label: "Live monitor", desc: "Node readings against the expected band", icon: Activity },
            { to: "/network", label: "Pipe topology", desc: "Distribution graph and node register", icon: Network },
            { to: "/tank", label: "Tank planning", desc: "Reserve coverage and refill planning", icon: Droplets },
          ].map((l) => {
            const Icon = l.icon;
            return (
              <Link
                key={l.to}
                to={l.to}
                className="group flex items-start gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 transition hover:border-blue-300 hover:bg-blue-50/50"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-blue-600 shadow-xs">
                  <Icon size={15} />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-slate-800 group-hover:text-blue-700">
                    {l.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                    {l.desc}
                  </span>
                </span>
              </Link>
            );
          })}
          <div className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-400 shadow-xs">
              <Gauge size={15} />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-slate-800">Calibration</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                Detection thresholds are configured above and applied to the live detector.
              </span>
            </span>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs capitalize text-muted">{label}</span>
      <span className={`text-xs text-ink ${mono ? "font-mono" : ""} max-w-[60%] truncate text-right`}>{value}</span>
    </div>
  );
}
