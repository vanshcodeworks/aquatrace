import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bell, Pause, Play, RotateCcw, StepForward } from "lucide-react";
import { NAV } from "../../lib/nav";
import { useSimulation } from "../../store/SimulationContext";
import { useNotifications } from "../../store/NotificationContext";
import { fmtDateTime } from "../../lib/format";
import { Button } from "../ui/primitives";

const SPEEDS = [1, 5, 15, 60];

export function Header() {
  const { state, actionPending, start, pause, step, reset, setSpeed } = useSimulation();
  const { notifications } = useNotifications();
  const location = useLocation();
  const nav = NAV.find((n) => n.to === location.pathname) ?? NAV[0];
  const [bellOpen, setBellOpen] = useState(false);

  const running = state?.status === "RUNNING";
  const alerts = notifications.filter(
    (n) => n.severity === "critical" || n.severity === "warning",
  );

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-line bg-app2 px-4">
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 className="truncate text-[13px] font-semibold text-ink">{nav.title}</h1>
        <span className="hidden truncate text-[12px] text-dim lg:block">{nav.subtitle}</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 md:flex">
          <span className="text-[11px] text-dim">Sim time</span>
          <span className="font-mono text-[12px] text-ink">
            {fmtDateTime(state?.sim_time ?? null)}
          </span>
          <span className="text-[11px] text-dim">|</span>
          <span className="text-[11px] text-muted">{state?.status ?? "-"}</span>
        </div>

        <div className="flex items-center gap-1">
          {running ? (
            <Button size="sm" variant="secondary" onClick={pause} disabled={actionPending} icon={<Pause size={13} />}>
              Pause
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={start} disabled={actionPending} icon={<Play size={13} />}>
              Run
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={step}
            disabled={actionPending || running}
            title="Advance one 15-minute interval"
            icon={<StepForward size={13} />}
          >
            Step
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => reset()}
            disabled={actionPending}
            title="Reset simulation"
            icon={<RotateCcw size={13} />}
          >
            <span className="sr-only">Reset</span>
          </Button>
        </div>

        <div className="hidden items-center overflow-hidden rounded border border-line sm:flex">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`h-7 px-2 font-mono text-[11px] transition-colors ${
                state?.speed === s
                  ? "bg-elevated text-ink"
                  : "text-dim hover:bg-elevated/60 hover:text-muted"
              }`}
            >
              {s}x
            </button>
          ))}
        </div>

        <div className="relative">
          <button
            aria-label="Alerts"
            onClick={() => setBellOpen((v) => !v)}
            className="relative flex h-7 w-7 items-center justify-center rounded border border-line text-muted hover:text-ink"
          >
            <Bell size={14} />
            {alerts.length > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-critical px-1 font-mono text-[9px] font-semibold text-[#0b0e11]">
                {alerts.length}
              </span>
            ) : null}
          </button>
          {bellOpen ? (
            <div className="absolute right-0 top-9 z-50 w-80 rounded border border-line bg-panel">
              <div className="flex items-center justify-between border-b border-line px-3 py-2">
                <span className="text-[12px] font-medium text-ink">Alerts</span>
                <span className="text-[10px] text-dim">{notifications.length} total</span>
              </div>
              {notifications.length === 0 ? (
                <p className="px-3 py-3 text-[12px] text-muted">No alerts.</p>
              ) : (
                <ul className="max-h-72 divide-y divide-line overflow-y-auto">
                  {notifications.slice(0, 12).map((n) => (
                    <li key={n.id} className="px-3 py-2">
                      <p className="text-[11px] font-medium text-ink">{n.title}</p>
                      <p className="text-[11px] text-muted">{n.message}</p>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                to="/incidents"
                onClick={() => setBellOpen(false)}
                className="block border-t border-line px-3 py-2 text-[11px] text-teal hover:bg-elevated"
              >
                Open incidents
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
