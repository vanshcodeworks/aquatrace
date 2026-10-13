import { Database, Download, Info, RefreshCw, Sliders, Volume2, VolumeX } from "lucide-react";
import { useState } from "react";
import { api } from "../api/client";
import { usePolling } from "../lib/hooks";
import { useSimulation } from "../store/SimulationContext";
import { useNotifications } from "../store/NotificationContext";
import { Badge, Button, Panel, PanelHeader, Skeleton } from "../components/ui/primitives";
import { INTERVAL_MINUTES } from "../lib/units";

export function Settings() {
  const { state } = useSimulation();
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

  return (
    <div className="space-y-5">
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
