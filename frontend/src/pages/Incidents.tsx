import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertOctagon,
  CheckCheck,
  Clock,
  Droplets,
  GitBranch,
  IndianRupee,
  Loader2,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { api } from "../api/client";
import type { Incident, IncidentDetail } from "../api/types";
import { usePolling } from "../lib/hooks";
import { fmtCurrency, fmtDateTime, fmtLph } from "../lib/format";
import { Badge, Button, EmptyState, Panel, PanelHeader, Select, Skeleton } from "../components/ui/primitives";
import { SeverityBadge, StatusPill } from "../components/ui/StatusPill";
import { ActualVsExpected } from "../components/charts/ActualVsExpected";

const STATUS_TONE: Record<string, "critical" | "warning" | "healthy" | "muted" | "teal"> = {
  OPEN: "critical",
  ACKNOWLEDGED: "warning",
  IN_PROGRESS: "teal",
  RESOLVED: "healthy",
  FALSE_POSITIVE: "muted",
};

export function Incidents() {
  const [params, setParams] = useSearchParams();
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const list = usePolling(
    () => api.incidents({ ...(severity ? { severity } : {}), ...(status ? { status } : {}), limit: "80" }),
    4000,
    [severity, status],
  );

  const selectedId = params.get("id") ? Number(params.get("id")) : null;
  const detail = usePolling(
    () => (selectedId ? api.incident(selectedId) : Promise.resolve(null)),
    4000,
    [selectedId],
  );

  useEffect(() => {
    if (!selectedId && list.data?.items?.length) {
      setParams({ id: String(list.data.items[0].id) }, { replace: true });
    }
  }, [list.data, selectedId, setParams]);

  const items = list.data?.items ?? [];
  const current = detail.data ?? null;

  async function act(action: string) {
    if (!selectedId) return;
    setBusy(true);
    try {
      await api.incidentAction(selectedId, action);
      await detail.refresh?.();
    } finally {
      setBusy(false);
    }
  }

  const chartData = useMemo(
    () =>
      (current?.supporting_readings ?? []).map((r) => ({
        t: fmtDateTime(r.sim_time).split(", ").pop() ?? "",
        actual: r.actual,
        expected: r.expected,
        lower: r.lower,
        upper: r.upper,
      })),
    [current],
  );

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
      <Panel className="xl:col-span-2">
        <PanelHeader
          title="Incidents"
          subtitle={`${items.length} shown | ${list.data?.total ?? 0} total`}
          icon={<ShieldAlert size={15} />}
        />
        <div className="flex gap-2 border-b border-line/50 px-3 py-2">
          <Select value={severity} onChange={(e) => setSeverity(e.target.value)} className="flex-1 text-xs">
            <option value="">All severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="WARNING">Warning</option>
            <option value="WATCH">Watch</option>
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="flex-1 text-xs">
            <option value="">All statuses</option>
            <option value="OPEN">Open</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="FALSE_POSITIVE">False positive</option>
          </Select>
        </div>
        <div className="max-h-[620px] space-y-1 overflow-y-auto p-2">
          {list.loading ? (
            <>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </>
          ) : items.length ? (
            items.map((inc) => <IncidentRow key={inc.id} inc={inc} active={inc.id === selectedId} onClick={() => setParams({ id: String(inc.id) })} />)
          ) : (
            <EmptyState
              title="No incidents"
              message="The detector has not raised any incidents matching these filters yet."
              icon={<ShieldAlert size={22} />}
            />
          )}
        </div>
      </Panel>

      <div className="xl:col-span-3">
        {current ? (
          <IncidentDetailView
            inc={current}
            chartData={chartData}
            busy={busy}
            onAction={act}
          />
        ) : (
          <Panel className="flex h-full min-h-[400px] items-center justify-center">
            <EmptyState
              title="Select an incident"
              message="Choose an incident from the list to view its diagnosis, timeline and supporting readings."
              icon={<AlertOctagon size={22} />}
            />
          </Panel>
        )}
      </div>
    </div>
  );
}

function IncidentRow({ inc, active, onClick }: { inc: Incident; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
        active ? "border-teal/50 bg-teal/10" : "border-transparent hover:bg-elevated"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SeverityBadge severity={inc.severity} />
          <span className="text-xs font-semibold text-ink">{inc.node_name}</span>
        </div>
        <Badge tone={STATUS_TONE[inc.status] ?? "muted"}>{inc.status.replaceAll("_", " ")}</Badge>
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
        <span>{inc.cause.replaceAll("_", " ")}</span>
        <span className="font-mono">{fmtLph(inc.excess_flow_lph)}</span>
      </div>
      <p className="mt-0.5 text-[10px] text-muted">{fmtDateTime(inc.created_sim_time)}</p>
    </button>
  );
}

function IncidentDetailView({
  inc,
  chartData,
  busy,
  onAction,
}: {
  inc: IncidentDetail;
  chartData: any[];
  busy: boolean;
  onAction: (a: string) => void;
}) {
  const diagnosis = inc.evidence?.diagnosis;
  const localisation = inc.evidence?.localisation;

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title={inc.node_name}
          subtitle={`Incident #${inc.id} | ${inc.cause.replaceAll("_", " ")}`}
          right={<Badge tone={STATUS_TONE[inc.status] ?? "muted"}>{inc.status.replaceAll("_", " ")}</Badge>}
        />
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          <DetailStat label="Excess flow" value={fmtLph(inc.excess_flow_lph)} tone="critical" icon={<Droplets size={12} />} />
          <DetailStat
            label="Excess volume"
            value={inc.excess_volume_litres >= 1000 ? `${(inc.excess_volume_litres / 1000).toFixed(2)} m³` : `${inc.excess_volume_litres.toFixed(1)} L`}
            tone="warning"
          />
          <DetailStat label="Est. cost" value={fmtCurrency(inc.estimated_cost)} tone="teal" icon={<IndianRupee size={12} />} />
          <DetailStat label="Duration" value={`${inc.duration_minutes.toFixed(0)} min`} tone="muted" icon={<Clock size={12} />} />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line/50 px-4 py-3">
          <Button size="sm" variant="secondary" onClick={() => onAction("acknowledge")} disabled={busy} icon={<CheckCheck size={13} />}>
            Acknowledge
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onAction("in-progress")} disabled={busy} icon={<Loader2 size={13} />}>
            In progress
          </Button>
          <Button size="sm" variant="primary" onClick={() => onAction("resolve")} disabled={busy} icon={<CheckCheck size={13} />}>
            Resolve
          </Button>
          <Button size="sm" variant="danger" onClick={() => onAction("false-positive")} disabled={busy} icon={<XCircle size={13} />}>
            False positive
          </Button>
          <span className="ml-auto text-[10px] text-muted">
            Confidence {Math.round(inc.confidence * 100)}% | {inc.confidence_type.replaceAll("_", " ")}
          </span>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Diagnosis" subtitle={diagnosis?.label?.replaceAll("_", " ") ?? "-"} icon={<AlertOctagon size={15} />} />
          <div className="space-y-2 p-4">
            <ul className="space-y-1.5">
              {(diagnosis?.evidence ?? inc.evidence?.diagnosis?.evidence ?? []).map((e, i) => (
                <li key={i} className="flex gap-2 text-[11px] text-muted">
                  <span className="text-teal">•</span>
                  {e}
                </li>
              ))}
              {!diagnosis?.evidence?.length ? <li className="text-[11px] text-muted">No evidence recorded.</li> : null}
            </ul>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Localisation" subtitle="Deepest abnormal node" icon={<GitBranch size={15} />} />
          <div className="space-y-2 p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">Primary node</span>
              <span className="font-medium text-ink">{localisation?.primary_node ?? inc.node_id}</span>
            </div>
            {localisation?.path?.length ? (
              <p className="font-mono text-[10px] text-muted">
                {localisation.path.join(" -> ")}
              </p>
            ) : null}
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">Evidence quality</span>
              <Badge tone={localisation?.evidence_quality === "high" ? "healthy" : localisation?.evidence_quality === "lower" ? "warning" : "muted"}>
                {localisation?.evidence_quality ?? "-"}
              </Badge>
            </div>
            {localisation?.note ? <p className="text-[11px] text-muted">{localisation.note}</p> : null}
            {localisation?.unevaluated?.length ? (
              <p className="text-[10px] text-muted">Unevaluated (no meter): {localisation.unevaluated.join(", ")}</p>
            ) : null}
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Supporting readings" subtitle="Two hours before and six hours after detection" right={<Badge tone="teal">L / 15 min</Badge>} />
        <div className="p-3">
          {chartData.length ? (
            <ActualVsExpected data={chartData} height={240} unit="L / 15 min" />
          ) : (
            <Skeleton className="h-[240px] w-full" />
          )}
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Incident timeline" subtitle={`${inc.timeline.length} events`} />
        <div className="p-4">
          <ol className="relative space-y-3 border-l border-line/60 pl-5">
            {inc.timeline.map((e, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="relative"
              >
                <span className="absolute -left-[27px] top-1 h-2.5 w-2.5 rounded-full border border-line bg-teal/60" />
                <p className="text-[11px] font-medium text-ink">{e.event_type.replaceAll("_", " ")}</p>
                <p className="text-[11px] text-muted">{e.message}</p>
                <p className="text-[10px] text-muted/70">{fmtDateTime(e.sim_time)}</p>
              </motion.li>
            ))}
            {!inc.timeline.length ? <li className="text-xs text-muted">No events recorded.</li> : null}
          </ol>
        </div>
      </Panel>
    </div>
  );
}

function DetailStat({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: "critical" | "warning" | "teal" | "muted";
  icon?: React.ReactNode;
}) {
  const colors: Record<string, string> = {
    critical: "text-critical",
    warning: "text-warning",
    teal: "text-teal",
    muted: "text-ink",
  };
  return (
    <div className="rounded-lg border border-line/50 bg-app2 px-3 py-2.5">
      <p className="flex items-center gap-1 text-[10px]  text-muted">
        {icon}
        {label}
      </p>
      <p className={`mt-1 font-mono text-base font-semibold tabular-nums ${colors[tone]}`}>{value}</p>
    </div>
  );
}
