import { useState } from "react";
import { AlertTriangle, BarChart3, Info, Loader2, Play, Target } from "lucide-react";
import { api } from "../api/client";
import type { BenchmarkLatest } from "../api/types";
import { usePolling } from "../lib/hooks";
import { fmtDateTime } from "../lib/format";
import { Badge, Button, Field, Input, Panel, PanelHeader, Skeleton } from "../components/ui/primitives";

const METRIC_ROWS: { key: string; label: string; pct?: boolean }[] = [
  { key: "precision", label: "Precision", pct: true },
  { key: "recall", label: "Recall", pct: true },
  { key: "f1", label: "F1 score", pct: true },
  { key: "false_positive_rate", label: "False-positive rate", pct: true },
];

function pct(v: number | null | undefined) {
  return v === null || v === undefined ? "-" : `${(v * 100).toFixed(1)}%`;
}

export function Benchmarks() {
  const latest = usePolling(() => api.benchmarkLatest(), 3000);
  const [seeds, setSeeds] = useState("42,43");
  const [days, setDays] = useState(4);
  const [starting, setStarting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const data = latest.data;
  const noRun = !data && !!latest.error;
  const running = data?.status === "RUNNING";

  async function run() {
    setStarting(true);
    setMsg(null);
    try {
      const parsed = seeds
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n));
      if (!parsed.length) {
        setMsg("Provide at least one numeric seed.");
        return;
      }
      await api.runBenchmark(parsed.slice(0, 6), days);
      setMsg("Benchmark started - results appear here when it finishes.");
      latest.refresh();
    } catch (err: any) {
      setMsg(err?.message ?? "Failed to start benchmark.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" />
        <div>
          <p className="text-sm font-semibold text-ink">Simulation benchmarks - not field-validated performance</p>
          <p className="text-xs text-muted">
            Every number below is computed from freshly generated simulated streams. Ground truth comes
            from injected faults, so these results describe the detector on the simulator, not on a real
            building.
          </p>
        </div>
      </div>

      <Panel>
        <PanelHeader
          title="Run a benchmark"
          subtitle="Score the live detector against fixed-threshold and same-hour historical baselines"
          icon={<BarChart3 size={15} />}
          right={
            <Button size="sm" variant="primary" onClick={run} disabled={starting} icon={<Play size={13} />}>
              Run benchmark
            </Button>
          }
        />
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
          <Field label="Seeds" hint="Comma separated, up to 6">
            <Input value={seeds} onChange={(e) => setSeeds(e.target.value)} />
          </Field>
          <Field label="Days per seed" hint="1-14">
            <Input type="number" min={1} max={14} value={days} onChange={(e) => setDays(Number(e.target.value))} />
          </Field>
          <div className="flex items-end">
            {running ? (
              <span className="flex items-center gap-2 text-xs text-warning">
                <Loader2 size={14} className="animate-spin" /> Running...
              </span>
            ) : (
              <span className="text-xs text-muted">
                {data ? `Last run #${data.id} | ${fmtDateTime(data.created_at)}` : "No run yet"}
              </span>
            )}
          </div>
        </div>
        {msg ? <p className="px-4 pb-3 text-[11px] text-teal">{msg}</p> : null}
      </Panel>

      {latest.loading && !data ? (
        <Skeleton className="h-56 w-full" />
      ) : noRun ? (
        <Panel className="p-8 text-center">
          <BarChart3 size={22} className="mx-auto text-muted/60" />
          <p className="mt-2 text-sm font-medium text-ink">No benchmark results yet</p>
          <p className="mt-1 text-xs text-muted">Run a benchmark above to generate honest detection metrics.</p>
        </Panel>
      ) : data?.status === "FAILED" ? (
        <Panel className="p-6">
          <p className="text-sm font-semibold text-critical">Benchmark failed</p>
          <p className="mt-1 text-xs text-muted">{data.error}</p>
        </Panel>
      ) : data?.metrics ? (
        <Results data={data} />
      ) : (
        <Skeleton className="h-56 w-full" />
      )}
    </div>
  );
}

function Results({ data }: { data: BenchmarkLatest }) {
  const m = data.metrics ?? {};
  const at = m.aquatrace ?? {};
  const fixed = m.fixed ?? {};
  const historical = m.historical ?? {};
  const episodes = data.extra?.episodes;
  const perSeed = data.extra?.per_seed ?? [];
  const composition = data.extra?.composition ?? {};

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Episode detection" value={pct(at.episode_detection_rate)} tone="teal" />
        <Stat label="Localisation acc." value={pct(at.localisation_accuracy)} tone="teal" />
        <Stat
          label="Median delay"
          value={at.median_detection_delay_intervals != null ? `${at.median_detection_delay_intervals} int` : "-"}
          tone="warning"
        />
        <Stat label="Expected-use WAPE" value={pct(at.expected_use_wape)} tone="healthy" />
        <Stat
          label="False alarms / day"
          value={at.false_alarms_per_simulated_day != null ? at.false_alarms_per_simulated_day.toFixed(2) : "-"}
          tone="critical"
        />
        <Stat label="Episodes evaluated" value={String(episodes?.total ?? "-")} tone="default" />
      </div>

      <Panel>
        <PanelHeader title="Detector vs baselines" subtitle="Reading-level (node × interval) precision / recall / F1" />
        <div className="overflow-x-auto p-1">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[10px]  text-muted">
                <th className="px-3 py-2">Metric</th>
                <th className="px-3 py-2 text-right text-teal">AquaTrace</th>
                <th className="px-3 py-2 text-right">Fixed threshold</th>
                <th className="px-3 py-2 text-right">Historical hour</th>
              </tr>
            </thead>
            <tbody>
              {METRIC_ROWS.map((r) => (
                <tr key={r.key} className="border-t border-line/40">
                  <td className="px-3 py-2 text-muted">{r.label}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-teal">{pct(at[r.key])}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-ink">{pct(fixed[r.key])}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-ink">{pct(historical[r.key])}</td>
                </tr>
              ))}
              <tr className="border-t border-line/40">
                <td className="px-3 py-2 text-muted">True positives</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-ink">{at.true_positives ?? "-"}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-ink">{fixed.true_positives ?? "-"}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-ink">{historical.true_positives ?? "-"}</td>
              </tr>
              <tr className="border-t border-line/40">
                <td className="px-3 py-2 text-muted">False positives</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-ink">{at.false_positives ?? "-"}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-ink">{fixed.false_positives ?? "-"}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-ink">{historical.false_positives ?? "-"}</td>
              </tr>
              <tr className="border-t border-line/40">
                <td className="px-3 py-2 text-muted">False negatives</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-ink">{at.false_negatives ?? "-"}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-ink">{fixed.false_negatives ?? "-"}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-ink">{historical.false_negatives ?? "-"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Per-seed" subtitle="Reproducibility across seeds" />
          <div className="overflow-x-auto p-1">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px]  text-muted">
                  <th className="px-3 py-2">Seed</th>
                  <th className="px-3 py-2 text-right">Precision</th>
                  <th className="px-3 py-2 text-right">Recall</th>
                  <th className="px-3 py-2 text-right">F1</th>
                  <th className="px-3 py-2 text-right">Episodes</th>
                </tr>
              </thead>
              <tbody>
                {perSeed.map((s: any) => (
                  <tr key={s.seed} className="border-t border-line/40">
                    <td className="px-3 py-2 font-mono text-ink">{s.seed}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-ink">{pct(s.aquatrace?.precision)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-ink">{pct(s.aquatrace?.recall)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-teal">{pct(s.aquatrace?.f1)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-muted">
                      {s.episodes_detected}/{s.episodes_total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Fault composition" subtitle="Episodes by injected fault type" icon={<Target size={15} />} />
          <div className="flex flex-wrap gap-2 p-4">
            {Object.entries(composition).map(([k, v]) => (
              <div key={k} className="rounded-lg border border-line/50 bg-app2 px-3 py-2">
                <p className="text-[10px]  text-muted">{k.replaceAll("_", " ")}</p>
                <p className="font-mono text-sm text-ink">{v as number}</p>
              </div>
            ))}
            {!Object.keys(composition).length ? <p className="text-xs text-muted">No composition data.</p> : null}
          </div>
          {data.extra?.notes ? (
            <div className="border-t border-line/50 p-4">
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted">
                <Info size={12} /> Method notes
              </p>
              <ul className="space-y-1">
                {data.extra.notes.map((n, i) => (
                  <li key={i} className="flex gap-2 text-[11px] text-muted">
                    <span className="text-teal">•</span>
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "teal" | "warning" | "healthy" | "critical" | "default" }) {
  const colors: Record<string, string> = {
    teal: "text-teal",
    warning: "text-warning",
    healthy: "text-healthy",
    critical: "text-critical",
    default: "text-ink",
  };
  return (
    <div className="rounded-xl border border-line/60 bg-panel p-3.5 ">
      <p className="text-[10px]  text-muted">{label}</p>
      <p className={`mt-1 font-mono text-xl font-semibold tabular-nums ${colors[tone]}`}>{value}</p>
    </div>
  );
}
