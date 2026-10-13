import type {
  AIStatus,
  BenchmarkLatest,
  Incident,
  IncidentDetail,
  LatestTelemetry,
  NetworkTopology,
  Recommendation,
  Scenario,
  SimulationState,
  TankStatus,
  TimelineEvent,
} from "./types";

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = 12000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      ...init,
    });
    if (!res.ok) {
      let detail = `${res.status} ${res.statusText}`;
      try {
        const body = await res.json();
        if (body?.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
      } catch {
        /* ignore */
      }
      throw new ApiError(detail, res.status);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  baseUrl: BASE_URL,
  health: () => request<{ status: string; data_mode: string; model_name: string; version: string; db: string }>("/api/health"),
  network: () => request<NetworkTopology>("/api/network"),
  state: () => request<SimulationState>("/api/simulation/state"),
  scenarios: () => request<{ scenarios: Scenario[] }>("/api/simulation/scenarios"),
  latest: () => request<LatestTelemetry>("/api/telemetry/latest"),
  history: (node: string, limit = 240) =>
    request<{ node_id: string; series: any[]; unit: string }>(`/api/telemetry/history?node=${encodeURIComponent(node)}&limit=${limit}`),
  start: () => request<SimulationState>("/api/simulation/start", { method: "POST" }),
  pause: () => request<SimulationState>("/api/simulation/pause", { method: "POST" }),
  resume: () => request<SimulationState>("/api/simulation/resume", { method: "POST" }),
  stop: () => request<SimulationState>("/api/simulation/stop", { method: "POST" }),
  step: () => request<LatestTelemetry>("/api/simulation/step", { method: "POST" }),
  setSpeed: (speed: number) =>
    request<SimulationState>("/api/simulation/speed", { method: "POST", body: JSON.stringify({ speed }) }),
  setOccupancy: (payload: { occupied_rooms?: number | null; guests_per_room?: number | null; auto?: boolean }) =>
    request<SimulationState>("/api/simulation/occupancy", { method: "POST", body: JSON.stringify(payload) }),
  reset: (payload: { seed?: number; scenario?: string } = {}) =>
    request<SimulationState>("/api/simulation/reset", { method: "POST", body: JSON.stringify(payload) }),
  selectScenario: (payload: { scenario: string; node_id?: string | null; intensity_lph?: number }) =>
    request<SimulationState>("/api/simulation/scenario", { method: "POST", body: JSON.stringify(payload) }),
  injectFault: (payload: Record<string, unknown>) =>
    request<{ ok: boolean; fault: any }>("/api/simulation/inject-fault", { method: "POST", body: JSON.stringify(payload) }),
  removeFault: (payload: { fault_db_id?: number; node_id?: string }) =>
    request<{ ok: boolean; removed: number }>("/api/simulation/remove-fault", { method: "POST", body: JSON.stringify(payload) }),
  runLeakDemo: () => request<{ status: string; scenario: string; speed: number }>("/api/simulation/run-leak-demo", { method: "POST" }),
  remediation: () => request<{ removed: number }>("/api/simulation/simulate-remediation", { method: "POST" }),
  timeline: () => request<{ events: TimelineEvent[] }>("/api/simulation/timeline"),
  incidents: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return request<{ items: Incident[]; total: number }>(`/api/incidents${q ? `?${q}` : ""}`);
  },
  incident: (id: number) => request<IncidentDetail>(`/api/incidents/${id}`),
  incidentAction: (id: number, action: string, note?: string) =>
    request<Incident>(`/api/incidents/${id}/${action}`, { method: "POST", body: JSON.stringify({ note }) }),
  recommendations: () => request<{ items: Recommendation[] }>("/api/recommendations"),
  tank: () => request<TankStatus>("/api/tank/status"),
  aiStatus: () => request<AIStatus>("/api/ai/status"),
  retrain: () => request<{ ok: boolean }>("/api/ai/retrain", { method: "POST" }),
  runBenchmark: (seeds: number[], days: number) =>
    request<{ ok: boolean; run_id: number }>("/api/benchmarks/run", { method: "POST", body: JSON.stringify({ seeds, days }) }),
  benchmarkLatest: () => request<BenchmarkLatest>("/api/benchmarks/latest"),
  exportTelemetryUrl: (sessionId?: number) =>
    `${BASE_URL}/api/export/telemetry${sessionId ? `?session_id=${sessionId}` : ""}`,
  exportIncidentsUrl: (format: "csv" | "json" = "csv") => `${BASE_URL}/api/export/incidents?format=${format}`,
};
