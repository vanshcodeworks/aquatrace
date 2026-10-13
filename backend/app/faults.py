"""Fault scenarios and reproducible fault injection.

Fault types
-----------
Flow faults (add excess water to a node):
    pipe_leak, running_cistern, open_tap, laundry_inefficiency, high_demand
Measurement faults (do not create physical excess):
    sensor_missing  -> node reading becomes OFFLINE
    sensor_drift    -> node reading is biased over time

``high_demand`` is legitimate operational demand: it is applied as a
multiplier on occupancy/meals/laundry, not as an injected defect.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from .config import settings
from .demand import OperationalFeatures, INTERVALS_PER_HOUR

# ---------------------------------------------------------------------------
# Fault types
# ---------------------------------------------------------------------------
PIPE_LEAK = "pipe_leak"
RUNNING_CISTERN = "running_cistern"
OPEN_TAP = "open_tap"
LAUNDRY_INEFFICIENCY = "laundry_inefficiency"
HIGH_DEMAND = "high_demand"
SENSOR_MISSING = "sensor_missing"
SENSOR_DRIFT = "sensor_drift"

FLOW_FAULTS = {PIPE_LEAK, RUNNING_CISTERN, OPEN_TAP, LAUNDRY_INEFFICIENCY}
SENSOR_FAULTS = {SENSOR_MISSING, SENSOR_DRIFT}

RAMP_INTERVALS = 8        # gradual onset ramp length
CISTERN_CYCLE = 8         # running-cistern burst cycle (intervals)
CISTERN_ON = 2            # intervals "on" per cycle


@dataclass
class FaultInstance:
    node_id: str
    fault_type: str
    intensity_lph: float = 0.0
    start_sim_time: dt.datetime = field(default_factory=dt.datetime.now)
    onset: str = "sudden"
    intermittent: bool = False
    duration_minutes: Optional[int] = None
    end_sim_time: Optional[dt.datetime] = None
    sensor_state: Optional[str] = None
    demand_multiplier: float = 1.0
    drift_lph: float = 0.0
    params: Dict[str, float] = field(default_factory=dict)
    source: str = "manual"

    # -- lifecycle ---------------------------------------------------------
    def is_active(self, sim_time: dt.datetime) -> bool:
        if sim_time < self.start_sim_time:
            return False
        if self.end_sim_time is not None and sim_time >= self.end_sim_time:
            return False
        return True

    def _rel_index(self, sim_time: dt.datetime) -> int:
        delta = sim_time - self.start_sim_time
        return int(delta.total_seconds() // (settings.interval_minutes * 60))

    def _ramp(self, alt: float, rel: int) -> float:
        if self.onset == "gradual":
            return float(min(1.0, (rel + 1) / RAMP_INTERVALS)) * alt
        return alt

    # -- effects -----------------------------------------------------------
    def flow_excess(self, sim_time: dt.datetime, features: OperationalFeatures) -> float:
        """Excess litres added at ``node_id`` for this interval."""
        if not self.is_active(sim_time) or self.fault_type not in {
            PIPE_LEAK, RUNNING_CISTERN, OPEN_TAP, LAUNDRY_INEFFICIENCY
        }:
            return 0.0
        rel = max(0, self._rel_index(sim_time))

        if self.fault_type == LAUNDRY_INEFFICIENCY:
            extra_per_kg = self.params.get("extra_l_per_kg", 14.0)
            return max(0.0, features.laundry_kg) * extra_per_kg

        base = self.intensity_lph / INTERVALS_PER_HOUR
        if self.fault_type == RUNNING_CISTERN or self.intermittent:
            if rel % CISTERN_CYCLE < CISTERN_ON:
                return self._ramp(base * 2.5, rel)
            return 0.0
        return self._ramp(base, rel)

    def measurement_bias(self, sim_time: dt.datetime) -> float:
        """Litres added to the *reported* reading (sensor drift)."""
        if not self.is_active(sim_time) or self.fault_type != SENSOR_DRIFT:
            return 0.0
        rel = max(0, self._rel_index(sim_time))
        return (self.drift_lph / INTERVALS_PER_HOUR) * min(1.0, (rel + 1) / RAMP_INTERVALS) * 4

    def is_sensor_missing(self, sim_time: dt.datetime) -> bool:
        return self.fault_type == SENSOR_MISSING and self.is_active(sim_time)

    def demand_multiplier_active(self, sim_time: dt.datetime) -> float:
        if self.fault_type == HIGH_DEMAND and self.is_active(sim_time):
            return self.demand_multiplier
        return 1.0


# ---------------------------------------------------------------------------
# Scenarios
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class ScenarioSpec:
    id: str
    label: str
    description: str
    expected: str
    default_node: Optional[str]
    default_intensity_lph: float
    fault_type: Optional[str]
    default_onset: str = "sudden"
    default_duration_minutes: int = 360


SCENARIOS: List[ScenarioSpec] = [
    ScenarioSpec(
        "normal", "Normal Operations",
        "Healthy hotel activity with no injected fault.",
        "Demand tracks the expected band; no persistent critical alert.",
        None, 0.0, None,
    ),
    ScenarioSpec(
        "hidden_leak", "Hidden Pipe Leak",
        "Excess flow injected into a monitored branch.",
        "Persistent divergence from expected; localised to the branch.",
        "floor_b2", 60.0, PIPE_LEAK,
    ),
    ScenarioSpec(
        "running_cistern", "Running Cistern",
        "A fixture refills repeatedly, producing periodic bursts.",
        "Bursts visible in the chart; fixture inspection recommended.",
        "floor_a1", 45.0, RUNNING_CISTERN,
    ),
    ScenarioSpec(
        "open_tap", "Open Tap",
        "A continuous excess flow in one branch.",
        "Sustained excess detected and localised to the branch.",
        "floor_b1", 40.0, OPEN_TAP,
    ),
    ScenarioSpec(
        "half_load_laundry", "Half-Load Laundry",
        "Laundry uses more water per kilogram than its baseline.",
        "Water-per-kg ratio abnormal; process review recommended.",
        "laundry", 14.0, LAUNDRY_INEFFICIENCY,
    ),
    ScenarioSpec(
        "busy_hotel", "Busy Hotel / High Kitchen Demand",
        "Legitimate surge in occupancy and meals.",
        "Model explains the peak via activity signals; no false leak.",
        "main_inlet", 0.0, HIGH_DEMAND,
    ),
    ScenarioSpec(
        "missing_sensor", "Missing Sensor Data",
        "One sensor stops reporting.",
        "Node becomes OFFLINE; localisation confidence reduced.",
        "floor_a2", 0.0, SENSOR_MISSING,
    ),
    ScenarioSpec(
        "sensor_drift", "Sensor Drift",
        "A meter slowly biases its reported flow.",
        "Inconsistency with parent meter; drift flagged, not a leak.",
        "floor_b1", 18.0, SENSOR_DRIFT,
    ),
]

SCENARIO_BY_ID = {s.id: s for s in SCENARIOS}


def build_fault_from_scenario(
    scenario_id: str,
    sim_time: dt.datetime,
    node_id: Optional[str] = None,
    intensity_lph: Optional[float] = None,
    onset: Optional[str] = None,
    duration_minutes: Optional[int] = None,
    intermittent: bool = False,
    params: Optional[Dict[str, float]] = None,
) -> Optional[FaultInstance]:
    spec = SCENARIO_BY_ID.get(scenario_id)
    if spec is None or spec.fault_type is None:
        return None
    node = node_id or spec.default_node or "floor_b2"
    intensity = spec.default_intensity_lph if intensity_lph is None else intensity_lph
    onset = onset or spec.default_onset
    dur = spec.default_duration_minutes if duration_minutes is None else duration_minutes
    end = sim_time + dt.timedelta(minutes=dur) if dur else None

    fault = FaultInstance(
        node_id=node,
        fault_type=spec.fault_type,
        intensity_lph=intensity,
        start_sim_time=sim_time,
        onset=onset,
        intermittent=intermittent,
        duration_minutes=dur,
        end_sim_time=end,
        params=dict(params or {}),
        source=scenario_id,
    )
    if spec.fault_type == SENSOR_MISSING:
        fault.sensor_state = "OFFLINE"
    if spec.fault_type == SENSOR_DRIFT:
        fault.drift_lph = intensity
    if spec.fault_type == HIGH_DEMAND:
        fault.demand_multiplier = 1.4
    if spec.fault_type == LAUNDRY_INEFFICIENCY:
        fault.params.setdefault("extra_l_per_kg", intensity or 14.0)
    return fault
