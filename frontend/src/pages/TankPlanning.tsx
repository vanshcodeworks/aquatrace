import { useMemo } from "react";
import { Droplets, Gauge, Info, Timer, TrendingDown } from "lucide-react";
import { api } from "../api/client";
import { usePolling } from "../lib/hooks";
import { Badge, Kpi, Panel, PanelHeader, Skeleton } from "../components/ui/primitives";

export function TankPlanning() {
  const tank = usePolling(() => api.tank(), 4000);
  const d = tank.data;

  const levelPct = d?.level_pct ?? 0;
  const reservePct = d?.reserve_pct ?? 0;

  const projection = useMemo(() => {
    if (!d || !d.avg_consumption_lph || d.avg_consumption_lph <= 0) return [];
    const points: { hour: number; pct: number }[] = [];
    let volume = d.current_volume_litres;
    for (let h = 0; h <= 24; h += 1) {
      points.push({ hour: h, pct: Math.max(0, (volume / d.capacity_litres) * 100) });
      volume -= d.avg_consumption_lph;
      if (volume <= 0) {
        points.push({ hour: h + 1, pct: 0 });
        break;
      }
    }
    return points;
  }, [d]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-1">
          <PanelHeader title="Tank level" subtitle="Rooftop storage (simulated)" icon={<Droplets size={15} />} />
          <div className="flex items-center gap-6 p-5">
            <div className="relative h-52 w-24 shrink-0 overflow-hidden rounded border border-line bg-app2">
              <div
                className="absolute bottom-0 left-0 right-0 bg-teal/60 transition-all duration-700"
                style={{ height: `${Math.min(100, Math.max(0, levelPct))}%` }}
              />
              <div
                className="absolute left-0 right-0 border-t border-dashed border-warning/80"
                style={{ bottom: `${reservePct}%` }}
              />
            </div>
            <div className="flex-1 space-y-2">
              <div>
                <p className="text-[10px]  text-muted">Current level</p>
                <p className="font-mono text-3xl font-semibold tabular-nums text-teal">
                  {d ? levelPct.toFixed(1) : "-"}
                  <span className="text-base text-muted">%</span>
                </p>
              </div>
              <div className="text-xs text-muted">
                <p>
                  Volume{" "}
                  <span className="font-mono text-ink">
                    {d ? `${d.current_volume_litres.toLocaleString(undefined, { maximumFractionDigits: 0 })} L` : "-"}
                  </span>
                </p>
                <p>
                  Capacity{" "}
                  <span className="font-mono text-ink">
                    {d ? `${d.capacity_litres.toLocaleString()} L` : "-"}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-4 rounded bg-warning/80" />
                <span className="text-[11px] text-muted">Reserve at {reservePct}%</span>
              </div>
              {d && levelPct <= reservePct ? (
                <Badge tone="critical">Below reserve threshold</Badge>
              ) : (
                <Badge tone="healthy">Above reserve</Badge>
              )}
            </div>
          </div>
        </Panel>

        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <Kpi
              label="Avg consumption"
              value={d?.avg_consumption_lph != null ? d.avg_consumption_lph.toFixed(0) : "-"}
              unit="L/h"
              icon={<TrendingDown size={14} />}
              hint={`Over ${d?.sample_intervals ?? 0} intervals`}
            />
            <Kpi
              label="Hours to reserve"
              value={d?.hours_to_reserve != null ? d.hours_to_reserve.toFixed(1) : "-"}
              unit="h"
              tone={d?.hours_to_reserve != null && d.hours_to_reserve < 6 ? "critical" : "healthy"}
              icon={<Timer size={14} />}
              hint="At current average draw"
            />
            <Kpi
              label="Reserve volume"
              value={d ? (d.reserve_volume_litres / 1000).toFixed(1) : "-"}
              unit="m³"
              tone="warning"
              icon={<Gauge size={14} />}
              hint={`${reservePct}% of capacity`}
            />
            <Kpi
              label="Refill modelled"
              value={d?.simplified ? "No" : "Yes"}
              tone={d?.simplified ? "warning" : "healthy"}
              icon={<Info size={14} />}
              hint="Constant inflow not modelled"
            />
          </div>

          <Panel>
            <PanelHeader title="Level projection" subtitle="Client-side estimate assuming the current average draw continues" right={<Badge tone="muted">estimate</Badge>} />
            <div className="p-4">
              {projection.length ? (
                <div className="flex h-40 items-end gap-1">
                  {projection.map((p) => (
                    <div key={p.hour} className="group relative flex-1">
                      <div
                        className="w-full rounded-t bg-teal/50 transition-all group-hover:bg-teal"
                        style={{ height: `${Math.max(2, p.pct * 1.4)}px` }}
                        title={`+${p.hour}h -> ${p.pct.toFixed(1)}%`}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <Skeleton className="h-40 w-full" />
              )}
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Model & assumptions" subtitle="What the tank planner does and does not account for" icon={<Info size={15} />} />
          <div className="space-y-2 p-4 text-[11px] leading-relaxed text-muted">
            <p>{d?.note ?? "Tank state is derived from the simulated network demand."}</p>
            {d?.assumptions ? (
              <ul className="space-y-1">
                {Object.entries(d.assumptions).map(([k, v]) => (
                  <li key={k} className="flex justify-between gap-3">
                    <span>{k.replaceAll("_", " ")}</span>
                    <span className="font-mono text-ink">{String(v)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Why this matters" />
          <div className="space-y-3 p-4 text-xs leading-relaxed text-muted">
            <p>
              Rising consumption from an undetected leak accelerates the drop below the reserve
              threshold. AquaTrace converts the live excess-flow reading into a rate so operators can
              plan refills and prioritise the leak that removes the largest draw.
            </p>
            <p>
              Because the tank is not metered, its level is an estimated balance of inflows and outflows,
              clearly marked as simplified wherever continuous inflow is not modelled.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
