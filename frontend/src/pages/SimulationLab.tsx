import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Ban,
  FlaskConical,
  Info,
  Pause,
  Play,
  RotateCcw,
  StepForward,
  Trash2,
  Wrench,
  Zap,
} from "lucide-react";
import { api } from "../api/client";
import { usePolling } from "../lib/hooks";
import { useSimulation } from "../store/SimulationContext";
import { fmtDateTime, fmtLph } from "../lib/format";
import { Badge, Button, Field, Input, Panel, PanelHeader, Select, Skeleton } from "../components/ui/primitives";

const FAULT_TYPES = [
  { id: "pipe_leak", label: "Pipe leak", flow: true },
  { id: "running_cistern", label: "Running cistern", flow: true },
  { id: "open_tap", label: "Open tap", flow: true },
  { id: "laundry_inefficiency", label: "Laundry inefficiency", flow: true },
  { id: "high_demand", label: "High demand (legitimate)", flow: false },
  { id: "sensor_missing", label: "Sensor missing", flow: false },
  { id: "sensor_drift", label: "Sensor drift", flow: false },
];

export function SimulationLab() {
  const { state, topology, scenarios, actionPending, start, pause, step, reset, setSpeed, selectScenario, injectFault, removeFault, runDemo, remediation } =
    useSimulation();
  const timeline = usePolling(() => api.timeline(), 4000);

  const [scenario, setScenario] = useState("hidden_leak");
  const [nodeId, setNodeId] = useState("floor_b2");
  const [intensity, setIntensity] = useState(60);
  const [onset, setOnset] = useState("sudden");
  const [duration, setDuration] = useState(360);
  const [intermittent, setIntermittent] = useState(false);
  const [seed, setSeed] = useState(42);

  const [faultType, setFaultType] = useState("pipe_leak");
  const [customIntensity, setCustomIntensity] = useState(50);

  const selectedScenario = scenarios.find((s) => s.id === scenario);
  const nodeOptions = useMemo(() => topology?.nodes ?? [], [topology]);
  const faultMeta = FAULT_TYPES.find((f) => f.id === faultType);

  function pickScenario(id: string) {
    setScenario(id);
    const s = scenarios.find((x) => x.id === id);
    if (s) {
      if (s.default_node) setNodeId(s.default_node);
      if (s.default_intensity_lph) setIntensity(s.default_intensity_lph);
    }
  }

  const running = state?.status === "RUNNING";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Scenario"
            subtitle="Reproducible, scripted faults with a documented expectation"
            icon={<FlaskConical size={15} />}
            right={
              <Button size="sm" variant="primary" onClick={runDemo} disabled={actionPending}>
                Run guided demo
              </Button>
            }
          />
          <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
            <Field label="Scenario">
              <Select value={scenario} onChange={(e) => pickScenario(e.target.value)} className="w-full">
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Target node">
              <Select value={nodeId} onChange={(e) => setNodeId(e.target.value)} className="w-full">
                {nodeOptions.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Intensity (L/h)" hint="Excess flow added at the node">
              <Input type="number" min={0} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} />
            </Field>
            <Field label="Onset">
              <Select value={onset} onChange={(e) => setOnset(e.target.value)} className="w-full">
                <option value="sudden">Sudden</option>
                <option value="gradual">Gradual ramp</option>
              </Select>
            </Field>
            <Field label="Duration (minutes)">
              <Input type="number" min={1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </Field>
            <Field label="Intermittent" hint="Bursts on a repeating cycle">
              <Select value={intermittent ? "yes" : "no"} onChange={(e) => setIntermittent(e.target.value === "yes")} className="w-full">
                <option value="no">Continuous</option>
                <option value="yes">Intermittent bursts</option>
              </Select>
            </Field>
          </div>

          {selectedScenario ? (
            <div className="mx-4 mb-3 rounded-lg border border-line/50 bg-app2 p-3">
              <p className="text-[11px] font-semibold text-ink">{selectedScenario.label}</p>
              <p className="mt-0.5 text-[11px] text-muted">{selectedScenario.description}</p>
              <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-teal">
                <Info size={12} className="mt-0.5 shrink-0" />
                Expected: {selectedScenario.expected}
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-t border-line/50 px-4 py-3">
            <Button
              variant="primary"
              onClick={() => selectScenario(scenario, nodeId, intensity)}
              disabled={actionPending}
              icon={<Zap size={14} />}
            >
              Apply scenario
            </Button>
            <Button variant="secondary" onClick={() => reset(seed)} disabled={actionPending} icon={<RotateCcw size={14} />}>
              Reset (seed {seed})
            </Button>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Playback & seed" subtitle="Control simulated time" />
          <div className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              {running ? (
                <Button variant="secondary" onClick={pause} disabled={actionPending} icon={<Pause size={14} />}>
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
            </div>
            <Field label="Speed">
              <div className="flex gap-2">
                {[1, 5, 15, 60].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                      state?.speed === s ? "border-teal bg-teal/15 text-teal" : "border-line bg-elevated text-muted hover:text-ink"
                    }`}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Seed" hint="Same seed reproduces the same run">
              <div className="flex gap-2">
                <Input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
                <Button variant="secondary" onClick={() => reset(seed)} disabled={actionPending}>
                  Apply
                </Button>
              </div>
            </Field>
            <div className="rounded-lg border border-line/50 bg-app2 p-3 text-[11px] text-muted">
              <p>
                Clock <span className="font-mono text-ink">{fmtDateTime(state?.sim_time ?? null)}</span>
              </p>
              <p className="mt-1">
                Scenario <span className="font-medium text-ink">{state?.scenario ?? "-"}</span>
              </p>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel>
          <PanelHeader title="Custom fault injection" subtitle="Directly attach a raw fault to a node" icon={<Zap size={15} />} />
          <div className="space-y-3 p-4">
            <Field label="Fault type">
              <Select value={faultType} onChange={(e) => setFaultType(e.target.value)} className="w-full">
                {FAULT_TYPES.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Node">
              <Select value={nodeId} onChange={(e) => setNodeId(e.target.value)} className="w-full">
                {nodeOptions.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Intensity (L/h)" hint={faultMeta?.flow ? "Excess flow" : "Not a flow fault - may be ignored"}>
              <Input type="number" min={0} value={customIntensity} onChange={(e) => setCustomIntensity(Number(e.target.value))} />
            </Field>
            <Button
              variant="danger"
              className="w-full"
              disabled={actionPending}
              onClick={() =>
                injectFault({
                  fault_type: faultType,
                  node_id: nodeId,
                  intensity_lph: customIntensity,
                  onset,
                  duration_minutes: duration,
                  intermittent,
                })
              }
              icon={<Zap size={14} />}
            >
              Inject fault
            </Button>
          </div>
        </Panel>

        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Active faults"
            subtitle={`${state?.active_faults?.length ?? 0} attached`}
            icon={<Wrench size={15} />}
            right={
              <Button size="sm" variant="secondary" onClick={remediation} disabled={actionPending} icon={<Wrench size={13} />}>
                Simulate remediation
              </Button>
            }
          />
          <div className="space-y-2 p-3">
            {state?.active_faults?.length ? (
              state.active_faults.map((f, i) => (
                <motion.div
                  key={`${f.id ?? f.node_id}-${i}`}
                  layout
                  className="flex items-center justify-between gap-3 rounded-lg border border-line/50 bg-app2 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge tone={f.active ? "critical" : "muted"}>{f.active ? "Active" : "Scheduled"}</Badge>
                      <span className="truncate text-xs font-semibold text-ink">{f.node_name}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {f.fault_type.replaceAll("_", " ")} | {fmtLph(f.intensity_lph)} | {f.onset}
                      {f.intermittent ? " | intermittent" : ""}
                    </p>
                    <p className="text-[10px] text-muted/80">
                      {fmtDateTime(f.start_sim_time)} to {f.end_sim_time ? fmtDateTime(f.end_sim_time) : "until removed"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={actionPending}
                    onClick={() => removeFault(f.id ? { fault_db_id: f.id } : { node_id: f.node_id })}
                    icon={<Trash2 size={13} />}
                    title="Remove fault"
                  >
                    <span className="sr-only">Remove</span>
                  </Button>
                </motion.div>
              ))
            ) : (
              <div className="flex flex-col items-center gap-1 py-8 text-center">
                <Ban size={20} className="text-muted/60" />
                <p className="text-xs text-muted">No faults attached. The system is running normally.</p>
              </div>
            )}
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Event log" subtitle="Chronological simulator events" />
        <div className="max-h-72 overflow-y-auto p-3">
          {timeline.loading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <ul className="space-y-1.5">
              {(timeline.data?.events ?? [])
                .slice()
                .reverse()
                .map((e, i) => (
                  <li key={i} className="flex items-start gap-3 rounded-md border border-line/40 bg-app2 px-3 py-1.5">
                    <span className="font-mono text-[10px] text-muted">{fmtDateTime(e.sim_time)}</span>
                    <Badge tone="muted">{e.event_type.replaceAll("_", " ")}</Badge>
                    <span className="text-[11px] text-ink">{e.message}</span>
                  </li>
                ))}
              {!timeline.data?.events?.length ? <li className="text-xs text-muted">No events yet.</li> : null}
            </ul>
          )}
        </div>
      </Panel>
    </div>
  );
}
