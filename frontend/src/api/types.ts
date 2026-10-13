export type SimStatus = "RUNNING" | "PAUSED" | "STOPPED";
export type DetectorState =
  | "HEALTHY"
  | "WATCH"
  | "WARNING"
  | "CRITICAL"
  | "STALE"
  | "OFFLINE";

export interface NodeReading {
  node_id: string;
  node_name: string;
  node_type: string;
  actual: number | null;
  expected: number;
  lower: number;
  upper: number;
  residual: number | null;
  residual_pct: number;
  excess_lph: number;
  sensor_state: string;
  detector_state: DetectorState;
  persist_count: number;
  mass_balance_ok: boolean;
  mass_balance_pct: number;
  evidence: string[];
}

export interface LatestTelemetry {
  sim_time: string;
  status: SimStatus;
  speed: number;
  unit: string;
  interval_minutes: number;
  features: {
    occupancy_rooms?: number;
    meals_served?: number;
    laundry_kg?: number;
    dow?: number;
    hour?: number;
  };
  nodes: Record<string, NodeReading>;
}

export interface ActiveFault {
  id: number | null;
  node_id: string;
  node_name: string;
  fault_type: string;
  intensity_lph: number;
  onset: string;
  intermittent: boolean;
  start_sim_time: string;
  end_sim_time: string | null;
  active: boolean;
}

export interface SimulationState {
  status: SimStatus;
  speed: number;
  scenario: string;
  seed: number;
  sim_time: string;
  data_source: string;
  session_id: number;
  model_name: string;
  active_faults: ActiveFault[];
  tank_level_pct: number;
  demo_active: boolean;
}

export interface Scenario {
  id: string;
  label: string;
  description: string;
  expected: string;
  default_node: string | null;
  default_intensity_lph: number;
  fault_type: string | null;
}

export interface Incident {
  id: number;
  session_id: number;
  node_id: string;
  node_name: string;
  severity: string;
  cause: string;
  confidence: number;
  confidence_type: string;
  status: string;
  created_sim_time: string;
  updated_sim_time: string | null;
  resolved_sim_time: string | null;
  actual_flow: number | null;
  expected_flow: number | null;
  upper_bound: number | null;
  excess_flow_lph: number;
  duration_minutes: number;
  excess_volume_litres: number;
  estimated_cost: number;
  currency: string;
  sensor_quality: string;
  auto_recovered: boolean;
  recommendation: string | null;
  evidence: {
    diagnosis?: { label?: string; confidence?: number; evidence?: string[]; confidence_type?: string };
    localisation?: {
      primary_node?: string | null;
      path?: string[];
      candidates?: string[];
      unevaluated?: string[];
      evidence_quality?: string;
      note?: string;
      evidence?: string[];
    };
  };
}

export interface IncidentDetail extends Incident {
  timeline: { sim_time: string; event_type: string; message: string }[];
  supporting_readings: {
    sim_time: string;
    actual: number | null;
    expected: number | null;
    lower: number | null;
    upper: number | null;
    residual: number | null;
    detector_state: string;
  }[];
}

export interface Recommendation {
  incident_id: number;
  node_id: string;
  node_name: string;
  severity: string;
  cause: string;
  action: string;
  reason: string;
  priority: number;
  excess_flow_lph: number;
  estimated_cost: number;
  created_sim_time: string | null;
}

export interface TankStatus {
  capacity_litres: number;
  level_pct: number;
  current_volume_litres: number;
  reserve_pct: number;
  reserve_volume_litres: number;
  avg_consumption_lph: number | null;
  hours_to_reserve: number | null;
  sample_intervals: number;
  simplified: boolean;
  note: string;
  assumptions?: Record<string, unknown>;
}

export interface NetworkNodeDef {
  id: string;
  name: string;
  node_type: string;
  parent_id: string | null;
  rooms: number;
  meter: boolean;
  unmetered_frac: number;
  unmetered_lph: number;
  children: string[];
  is_leaf: boolean;
  reading: NodeReading | null;
}

export interface NetworkTopology {
  nodes: NetworkNodeDef[];
  roots: string[];
  tank_node: string;
  unit: string;
  interval_minutes: number;
}

export interface AIStatus {
  model: {
    model_name: string;
    fitted: boolean;
    n_samples: number;
    features: string[];
    train_metrics: Record<string, number>;
    fallback_reason: string | null;
  };
  data_mode: string;
  detector: Record<string, unknown>;
  retrain: { running: boolean; last_error: string | null; started_at: string | null };
  note: string;
}

export interface BenchmarkLatest {
  id: number;
  created_at: string;
  status: string;
  seeds: string;
  params: Record<string, unknown> | null;
  metrics: Record<string, any> | null;
  counts: Record<string, any> | null;
  extra: {
    composition?: Record<string, number>;
    episodes?: { total: number; detected: number; localised_correct: number };
    per_seed?: any[];
    settings?: Record<string, unknown>;
    notes?: string[];
    disclaimer?: string;
  } | null;
  error: string | null;
  disclaimer: string;
}

export interface TimelineEvent {
  sim_time: string;
  event_type: string;
  message: string;
}
