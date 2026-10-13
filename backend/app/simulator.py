"""The AquaTrace simulation engine — the single source of truth.

One deterministic engine drives the whole application. The dashboard never
generates its own data; every value it shows originates here.
"""

from __future__ import annotations

import datetime as dt
import json
import threading
from collections import deque
from typing import Deque, Dict, List, Optional

import numpy as np
from sqlalchemy import select

from .config import settings
from .database import session_scope
from .demand import (
    FeatureGenerator,
    OperationalFeatures,
    leaf_truth,
    LITRES_PER_KG_LAUNDRY,
)
from .faults import (
    FLOW_FAULTS,
    SENSOR_DRIFT,
    SENSOR_MISSING,
    FaultInstance,
    build_fault_from_scenario,
)
from .ml.detector import (
    AnomalyDetector,
    DetectorResult,
    CRITICAL,
    HEALTHY,
    OFFLINE,
    STALE,
    WARNING,
)
from .ml.diagnosis import diagnose
from .ml.expected_use import ExpectedUseModel
from .ml.localisation import localise
from .models import Incident, InjectedFault, SimulationSession, TelemetryReading
from .network import (
    NODE_BY_ID,
    ROOTS,
    children_of,
    evaluation_order,
    is_leaf,
    parent_of,
)
from .services import incident_service as inc

STOPPED = "STOPPED"
RUNNING = "RUNNING"
PAUSED = "PAUSED"


class Simulator:
    def __init__(self, model: ExpectedUseModel | None = None) -> None:
        self.lock = threading.RLock()
        self.model = model or ExpectedUseModel()
        self.detector = AnomalyDetector()
        self.timeline: List[dict] = []
        self.demo_active = False
        self._persist_buffer: List[dict] = []
        self.reset(seed=settings.default_seed, scenario="normal")

    # ------------------------------------------------------------------ setup
    def reset(
        self,
        seed: Optional[int] = None,
        scenario: str = "normal",
        start_iso: Optional[str] = None,
    ) -> None:
        with self.lock:
            self.seed = settings.default_seed if seed is None else int(seed)
            self.rng = np.random.default_rng(self.seed)
            self.scenario_id = scenario
            self.status = STOPPED
            self.speed = 1.0
            self.start_time = (
                dt.datetime.fromisoformat(start_iso)
                if start_iso
                else dt.datetime.fromisoformat(settings.sim_epoch_iso)
            )
            self.sim_time = self.start_time
            self.feature_gen = FeatureGenerator(
                self.rng, settings.total_rooms, settings.guests_per_room
            )
            self.faults: List[FaultInstance] = []
            self.hist: Dict[str, Deque[float]] = {
                nid: deque(maxlen=200) for nid in evaluation_order() if NODE_BY_ID[nid].node_type != "TANK"
            }
            self.ticks: Deque[dict] = deque(maxlen=4000)
            self.detector.reset()
            self.detector_results: Dict[str, DetectorResult] = {}
            self.recovery_counter: Dict[str, int] = {}
            self.tank_level_pct = settings.tank_start_level_pct
            self.timeline = []
            self.demo_active = False
            self.fault_counter = 0
            self._persist_buffer = []
            self._create_session_row()
            # prime one reading *at* the start time so the dashboard is never
            # empty, without advancing the clock.
            self.sim_time = self.start_time - dt.timedelta(minutes=settings.interval_minutes)
            self._advance(persist=False)

    def _create_session_row(self) -> None:
        with session_scope() as db:
            row = SimulationSession(
                scenario=self.scenario_id,
                seed=self.seed,
                status=self.status,
                speed=self.speed,
                sim_time=self.sim_time,
                model_name=self.model.model_name,
            )
            db.add(row)
            db.flush()
            self.session_id = row.id

    # ------------------------------------------------------------- controls
    def start(self) -> None:
        with self.lock:
            if self.status == STOPPED:
                self.status = RUNNING
            elif self.status == PAUSED:
                self.status = RUNNING
            self._sync_session()

    def pause(self) -> None:
        with self.lock:
            if self.status == RUNNING:
                self.status = PAUSED
            self._sync_session()

    def resume(self) -> None:
        self.start()

    def stop(self) -> None:
        with self.lock:
            self.status = STOPPED
            self._sync_session()

    def set_speed(self, speed: float) -> None:
        with self.lock:
            if speed <= 0:
                raise ValueError("speed must be > 0")
            self.speed = float(speed)
            self._sync_session()

    def step(self) -> None:
        with self.lock:
            self._advance(persist=True)

    def _sync_session(self) -> None:
        with session_scope() as db:
            row = db.get(SimulationSession, self.session_id)
            if row:
                row.status = self.status
                row.speed = self.speed
                row.scenario = self.scenario_id
                row.sim_time = self.sim_time

    def loop_forever(self) -> None:
        """Blocking loop run in a worker thread; advances time while RUNNING."""
        import time as _time

        while True:
            speed = self.speed if self.status == RUNNING else 1.0
            interval = settings.base_real_seconds_per_tick / max(speed, 0.01)
            _time.sleep(max(0.02, interval))
            try:
                if self.status == RUNNING:
                    with self.lock:
                        self._advance(persist=True)
            except Exception as exc:  # pragma: no cover
                self._log("ERROR", f"Simulation tick failed: {exc}")

    # --------------------------------------------------------------- faults
    def inject_fault(
        self,
        fault_type: str,
        node_id: str,
        intensity_lph: float = 0.0,
        onset: str = "sudden",
        duration_minutes: Optional[int] = None,
        intermittent: bool = False,
        start_delay_intervals: int = 0,
        params: Optional[Dict] = None,
    ) -> dict:
        with self.lock:
            if node_id not in NODE_BY_ID:
                raise ValueError(f"Unknown node: {node_id}")
            if NODE_BY_ID[node_id].node_type == "TANK":
                raise ValueError("Cannot inject a flow fault into the tank node")
            if intensity_lph < 0:
                raise ValueError("intensity must be non-negative")
            if onset not in ("sudden", "gradual"):
                raise ValueError("onset must be 'sudden' or 'gradual'")
            if duration_minutes is not None and duration_minutes <= 0:
                raise ValueError("duration must be positive")

            start = self.sim_time + dt.timedelta(minutes=settings.interval_minutes * start_delay_intervals)
            end = start + dt.timedelta(minutes=duration_minutes) if duration_minutes else None

            fault = FaultInstance(
                node_id=node_id,
                fault_type=fault_type,
                intensity_lph=float(intensity_lph),
                start_sim_time=start,
                onset=onset,
                intermittent=intermittent,
                duration_minutes=duration_minutes,
                end_sim_time=end,
                params=dict(params or {}),
                source="manual",
            )
            if fault_type == SENSOR_MISSING:
                fault.sensor_state = "OFFLINE"
            if fault_type == SENSOR_DRIFT:
                fault.drift_lph = float(intensity_lph)
            self._register_fault(fault)
            return self._fault_dict(fault)

    def _register_fault(self, fault: FaultInstance) -> None:
        self.fault_counter += 1
        with session_scope() as db:
            row = InjectedFault(
                session_id=self.session_id,
                node_id=fault.node_id,
                fault_type=fault.fault_type,
                intensity_lph=fault.intensity_lph,
                start_sim_time=fault.start_sim_time,
                end_sim_time=fault.end_sim_time,
                onset=fault.onset,
                intermittent=fault.intermittent,
                duration_minutes=fault.duration_minutes,
                status="ACTIVE",
                seed=self.seed,
            )
            db.add(row)
            db.flush()
            fault.db_id = row.id  # type: ignore[attr-defined]
        self.faults.append(fault)
        self._log("FAULT_INJECTED", f"{fault.fault_type} at {inc.node_name(fault.node_id)} ({fault.intensity_lph:.0f} L/h)")

    def remove_fault(self, fault_db_id: Optional[int] = None, node_id: Optional[str] = None) -> int:
        with self.lock:
            removed = 0
            for f in self.faults:
                if fault_db_id is not None and getattr(f, "db_id", None) != fault_db_id:
                    continue
                if node_id is not None and f.node_id != node_id:
                    continue
                f.end_sim_time = self.sim_time
                removed += 1
                with session_scope() as db:
                    row = db.get(InjectedFault, getattr(f, "db_id", None))
                    if row:
                        row.status = "REMOVED"
                        row.end_sim_time = self.sim_time
            if node_id:
                self._log("FAULT_REMOVED", f"Fault removed at {inc.node_name(node_id)}")
            return removed

    def clear_faults(self) -> None:
        with self.lock:
            for f in self.faults:
                f.end_sim_time = self.sim_time
        with session_scope() as db:
            from sqlalchemy import select
            for row in db.execute(select(InjectedFault).where(InjectedFault.session_id == self.session_id)).scalars():
                if row.status == "ACTIVE":
                    row.status = "REMOVED"

    def active_faults(self) -> List[dict]:
        return [self._fault_dict(f) for f in self.faults if f.is_active(self.sim_time)]

    def _fault_dict(self, f: FaultInstance) -> dict:
        return {
            "id": getattr(f, "db_id", None),
            "node_id": f.node_id,
            "node_name": inc.node_name(f.node_id),
            "fault_type": f.fault_type,
            "intensity_lph": f.intensity_lph,
            "onset": f.onset,
            "intermittent": f.intermittent,
            "start_sim_time": f.start_sim_time.isoformat(),
            "end_sim_time": f.end_sim_time.isoformat() if f.end_sim_time else None,
            "active": f.is_active(self.sim_time),
        }

    def select_scenario(self, scenario_id: str, **params) -> dict:
        with self.lock:
            self.scenario_id = scenario_id
            self.clear_faults()
            self.faults = []
            fault = build_fault_from_scenario(scenario_id, self.sim_time, **params)
            if fault is not None:
                self._register_fault(fault)
            self._sync_session()
            return {"scenario": scenario_id, "faults": self.active_faults()}

    # ----------------------------------------------------------- leak demo
    def start_leak_demo(self) -> dict:
        with self.lock:
            self.reset(seed=settings.default_seed, scenario="hidden_leak")
            # faults begin a few intervals in so normal operation is visible first
            self.inject_fault(
                fault_type="pipe_leak",
                node_id="floor_b2",
                intensity_lph=60.0,
                onset="sudden",
                duration_minutes=240,
                start_delay_intervals=4,
            )
            self.demo_active = True
            self.status = RUNNING
            self.speed = 12.0
            self._sync_session()
            self._log("DEMO_START", "Leak demo started: normal operations, then a leak in Wing B · Floor 2.")
            return {"status": self.status, "scenario": self.scenario_id, "speed": self.speed}

    def simulate_remediation(self) -> dict:
        with self.lock:
            n = self.remove_fault(node_id="floor_b2")
            if n == 0:
                n = self.remove_fault(node_id="wing_b")
            self._log("REMEDIATION", "Corrective action simulated: injected fault removed.")
            return {"removed": n}

    # --------------------------------------------------------------- engine
    def _advance(self, persist: bool = True) -> dict:
        self.sim_time = self.sim_time + dt.timedelta(minutes=settings.interval_minutes)
        features = self.feature_gen.features_at(self.sim_time)

        # legitimate high-demand scenario multiplies operational signals
        mult = 1.0
        for f in self.faults:
            mult *= f.demand_multiplier_active(self.sim_time)
        if mult != 1.0:
            features.occupancy_rooms *= mult
            features.guests *= mult
            features.meals_served *= mult
            features.laundry_kg *= mult
            features.floor_occupancy = {k: v * mult for k, v in features.floor_occupancy.items()}

        leaf = leaf_truth(features)

        # -- true physical flow (propagation) -----------------------------
        true_flow: Dict[str, float] = {}
        sensor_missing: Dict[str, bool] = {}
        for node_id in evaluation_order():
            node = NODE_BY_ID[node_id]
            if node.node_type == "TANK":
                continue
            child_sum = sum(true_flow.get(c, 0.0) for c in children_of(node_id))
            own = leaf.get(node_id, 0.0) if is_leaf(node_id) else 0.0
            unmetered = node.unmetered_lph / 4.0
            excess = sum(
                f.flow_excess(self.sim_time, features)
                for f in self.faults
                if f.node_id == node_id
            )
            true_flow[node_id] = max(0.0, child_sum + own + unmetered + excess)
            sensor_missing[node_id] = any(
                f.is_sensor_missing(self.sim_time) and f.node_id == node_id for f in self.faults
            )

        # -- reported (metered) readings ----------------------------------
        reported: Dict[str, Optional[float]] = {}
        for node_id, node in NODE_BY_ID.items():
            if node.node_type == "TANK":
                continue
            if not node.meter:
                reported[node_id] = None
                continue
            if sensor_missing.get(node_id):
                reported[node_id] = None
                continue
            base = true_flow[node_id]
            noise = float(self.rng.normal(0.0, max(0.3, base * 0.02)))
            drift = sum(
                f.measurement_bias(self.sim_time)
                for f in self.faults
                if f.node_id == node_id and f.fault_type == SENSOR_DRIFT
            )
            reported[node_id] = max(0.0, base + noise + drift)

        # -- expected-use predictions -------------------------------------
        expected: Dict[str, tuple] = {}
        for node_id in true_flow:
            hist = self.hist[node_id]
            hint = hist[-1] if hist else float(true_flow[node_id])
            from .ml.features import lags_from_history
            lags = lags_from_history(list(hist), hint)
            lo, mid, hi = self.model.predict_one(node_id, features, lags)
            expected[node_id] = (lo, mid, hi)

        # -- mass balance per parent --------------------------------------
        mass_balance: Dict[str, dict] = {}
        for node_id, node in NODE_BY_ID.items():
            kids = [c for c in children_of(node_id) if NODE_BY_ID[c].meter]
            if not kids:
                continue
            p = reported.get(node_id)
            child_vals = [reported.get(c) for c in kids]
            if p is None or any(v is None for v in child_vals):
                mass_balance[node_id] = {"ok": True, "pct": 0.0}
                continue
            unmetered = node.unmetered_lph / 4.0
            implied = p - sum(child_vals) - unmetered
            pct = abs(implied) / max(p, 1.0)
            mass_balance[node_id] = {
                "ok": pct <= settings.mass_balance_tolerance_pct,
                "pct": pct,
            }

        # -- detection + readings -----------------------------------------
        tick_nodes: Dict[str, dict] = {}
        for node_id in true_flow:
            node = NODE_BY_ID[node_id]
            actual = reported[node_id]
            lo, mid, hi = expected[node_id]
            sensor_state = "OFFLINE" if sensor_missing.get(node_id) else "OK"
            result = self.detector.update(
                node_id, actual, mid, lo, hi, sensor_state=sensor_state, hour=self.sim_time.hour
            )
            self.detector_results[node_id] = result
            tick_nodes[node_id] = {
                "node_id": node_id,
                "node_name": node.name,
                "node_type": node.node_type,
                "actual": None if actual is None else round(actual, 2),
                "expected": round(mid, 2),
                "lower": round(lo, 2),
                "upper": round(hi, 2),
                "residual": None if actual is None else round(actual - mid, 2),
                "residual_pct": round(result.residual_pct, 4),
                "excess_lph": round(result.excess_lph, 2),
                "sensor_state": sensor_state,
                "detector_state": result.state,
                "persist_count": result.persist_count,
                "mass_balance_ok": mass_balance.get(node_id, {}).get("ok", True),
                "mass_balance_pct": round(mass_balance.get(node_id, {}).get("pct", 0.0), 4),
                "evidence": result.evidence,
            }
            if actual is not None:
                self.hist[node_id].append(float(actual))
            else:
                self.hist[node_id].append(float(mid))

        tick = {
            "sim_time": self.sim_time.isoformat(),
            "features": {
                "occupancy_rooms": round(features.occupancy_rooms, 1),
                "meals_served": round(features.meals_served, 1),
                "laundry_kg": round(features.laundry_kg, 2),
                "dow": features.dow,
                "hour": features.hour,
            },
            "nodes": tick_nodes,
        }
        self.ticks.append(tick)
        self._update_tank(true_flow.get("main_inlet", 0.0))
        self._process_incidents(features)
        if persist:
            self._buffer_persist(tick)
        return tick

    def _update_tank(self, inflow_interval: float) -> None:
        consumed_pct = (inflow_interval / settings.tank_capacity_litres) * 100.0
        self.tank_level_pct = max(0.0, self.tank_level_pct - consumed_pct)
        if self.tank_level_pct < 30.0:
            self.tank_level_pct = 90.0
            self._log("TANK_REFILL", "Tank replenished by the pumping schedule (simplified model).")

    def _process_incidents(self, features: OperationalFeatures) -> None:
        abnormal = {n for n, r in self.detector_results.items() if r.state in (WARNING, CRITICAL)}
        with session_scope() as db:
            for node_id, result in self.detector_results.items():
                if node_id == "tank":
                    continue
                # only raise an incident at the deepest abnormal node so one
                # leak produces one incident, not one per upstream meter.
                if result.incident_eligible and any(
                    c in abnormal for c in children_of(node_id)
                ):
                    continue
                open_inc = inc.has_open_incident(db, self.session_id, node_id)
                if result.incident_eligible:
                    diag = self._diagnose(node_id, result, features)
                    loc = localise(self.detector_results).to_dict()
                    if not open_inc:
                        inc.create_incident(
                            db, self.session_id, self.sim_time, node_id, result.state,
                            diag.to_dict(), result.actual, result.expected, result.upper,
                            result.excess_lph, result.state,
                            localisation=loc,
                            recommendation=self._recommendation_text(diag.cause, node_id),
                        )
                        self._log("INCIDENT", f"Incident raised at {inc.node_name(node_id)} ({diag.label}).")
                    else:
                        self._accumulate_open(db, node_id, result)
                else:
                    if open_inc:
                        if result.state == HEALTHY:
                            self.recovery_counter[node_id] = self.recovery_counter.get(node_id, 0) + 1
                            if self.recovery_counter.get(node_id, 0) >= settings.recovery_readings:
                                self._mark_node_recovered(db, node_id)
                        else:
                            self.recovery_counter[node_id] = 0
                            self._accumulate_open(db, node_id, result)
                    else:
                        self.recovery_counter[node_id] = 0

    def _accumulate_open(self, db, node_id: str, result: DetectorResult) -> None:
        row = db.execute(
            select(Incident).where(
                Incident.session_id == self.session_id,
                Incident.node_id == node_id,
                Incident.status.in_(inc.OPEN_STATES),
            )
        ).scalars().first()
        if row:
            if result.excess_lph > 0:
                row.excess_flow_lph = round(result.excess_lph, 2)
            row.actual_flow = result.actual
            row.expected_flow = result.expected
            inc.accumulate(row, self.sim_time, settings.interval_minutes)

    def _mark_node_recovered(self, db, node_id: str) -> None:
        rows = db.execute(
            select(Incident).where(
                Incident.session_id == self.session_id,
                Incident.node_id == node_id,
                Incident.status.in_(inc.OPEN_STATES),
            )
        ).scalars().all()
        for row in rows:
            inc.mark_recovered(db, row, self.sim_time)
        if rows:
            self._log("RECOVERY", f"Flow at {inc.node_name(node_id)} returned to the expected band.")

    def _diagnose(self, node_id: str, result: DetectorResult, features: OperationalFeatures):
        # sensor-drift evidence lives in the *parent* mass balance, because a
        # drifting child meter no longer agrees with its parent meter.
        parent = parent_of(node_id)
        tick = self.ticks[-1]["nodes"] if self.ticks else {}
        src = tick.get(parent) if parent else None
        if src is None:
            src = tick.get(node_id, {})
        context = {
            "mass_balance_ok": src.get("mass_balance_ok", True),
            "mass_balance_pct": src.get("mass_balance_pct", 0.0),
        }
        if NODE_BY_ID[node_id].node_type == "LAUNDRY" and features.laundry_kg > 0.1:
            context["laundry_ratio"] = (result.actual or 0.0) / features.laundry_kg
            context["laundry_baseline"] = LITRES_PER_KG_LAUNDRY
        return diagnose(node_id, result, features, context)

    def _recommendation_text(self, cause: str, node_id: str) -> str:
        name = inc.node_name(node_id)
        mapping = {
            "possible_pipe_leak": f"Inspect {name}: excess flow has persisted. Check pipework and joints.",
            "possible_running_cistern": f"Inspect fixtures on {name}: repeated refill bursts suggest a running cistern.",
            "possible_open_tap": f"Inspect and close/repair the outlet on {name}: sustained excess flow.",
            "possible_laundry_inefficiency": "Review the laundry process: water use per kilogram exceeds the configured baseline.",
            "possible_sensor_drift": f"Check sensor calibration at {name}: branch reading disagrees with the parent meter.",
            "high_but_legitimate_demand": f"Monitor {name}: elevated use appears to match recorded activity.",
            "sensor_data_unavailable": f"Restore monitoring at {name} before drawing conclusions.",
        }
        return mapping.get(cause, f"Investigate {name}.")

    # ------------------------------------------------------------ telemetry
    def latest(self) -> dict:
        with self.lock:
            tick = self.ticks[-1] if self.ticks else {"sim_time": self.sim_time.isoformat(), "nodes": {}, "features": {}}
            return {
                "sim_time": tick["sim_time"],
                "features": tick.get("features", {}),
                "nodes": tick["nodes"],
            }

    def history(self, node_id: Optional[str] = None, limit: int = 200) -> dict:
        with self.lock:
            ticks = list(self.ticks)[-max(1, min(limit, settings.max_history_default * 10)):]
        if node_id:
            series = []
            for t in ticks:
                n = t["nodes"].get(node_id)
                if n:
                    series.append({"sim_time": t["sim_time"], **n})
            return {"node_id": node_id, "series": series, "unit": "L/interval"}
        return {
            "unit": "L/interval",
            "ticks": [
                {
                    "sim_time": t["sim_time"],
                    "features": t["features"],
                    "nodes": {
                        nid: {
                            "actual": n["actual"], "expected": n["expected"],
                            "lower": n["lower"], "upper": n["upper"],
                            "detector_state": n["detector_state"],
                        }
                        for nid, n in t["nodes"].items()
                    },
                }
                for t in ticks
            ],
        }

    def state(self) -> dict:
        with self.lock:
            return {
                "status": self.status,
                "speed": self.speed,
                "scenario": self.scenario_id,
                "seed": self.seed,
                "sim_time": self.sim_time.isoformat(),
                "data_source": "SIMULATED",
                "session_id": self.session_id,
                "model_name": self.model.model_name,
                "active_faults": self.active_faults(),
                "tank_level_pct": round(self.tank_level_pct, 2),
                "demo_active": self.demo_active,
            }

    def timeline_events(self) -> List[dict]:
        return list(self.timeline)

    # ------------------------------------------------------------ persist
    def _buffer_persist(self, tick: dict) -> None:
        self._persist_buffer.append(tick)
        if len(self._persist_buffer) >= 5:
            self.flush_persist()

    def flush_persist(self) -> None:
        if not self._persist_buffer:
            return
        buf, self._persist_buffer = self._persist_buffer, []
        sim_time = dt.datetime.fromisoformat(buf[-1]["sim_time"])
        with session_scope() as db:
            for t in buf:
                ts = dt.datetime.fromisoformat(t["sim_time"])
                label = next(
                    (f.fault_type for f in self.faults if f.is_active(ts) and f.node_id in t["nodes"]),
                    None,
                )
                for node_id, n in t["nodes"].items():
                    fault_here = next(
                        (f.fault_type for f in self.faults
                         if f.is_active(ts) and f.node_id == node_id), None
                    )
                    db.add(TelemetryReading(
                        session_id=self.session_id,
                        node_id=node_id,
                        sim_time=ts,
                        actual_flow=n["actual"],
                        expected_flow=n["expected"],
                        lower_bound=n["lower"],
                        upper_bound=n["upper"],
                        residual=n["residual"],
                        occupancy_rooms=t["features"].get("occupancy_rooms"),
                        meals_served=t["features"].get("meals_served"),
                        laundry_kg=t["features"].get("laundry_kg"),
                        sensor_state=n["sensor_state"],
                        detector_state=n["detector_state"],
                        fault_label=fault_here,
                    ))

    def _log(self, event_type: str, message: str) -> None:
        self.timeline.append({
            "sim_time": self.sim_time.isoformat(),
            "event_type": event_type,
            "message": message,
        })
        self.timeline = self.timeline[-200:]

    # ---------------------------------------------------------- tank helper
    def tank_snapshot(self) -> dict:
        with self.lock:
            cap = settings.tank_capacity_litres
            volume = cap * self.tank_level_pct / 100.0
            recent = list(self.ticks)[-96:]  # last 24 h
            flow = [t["nodes"].get("main_inlet", {}).get("actual") for t in recent]
            flow = [f for f in flow if f is not None]
            avg_per_interval = (sum(flow) / len(flow)) if flow else None
            avg_lph = avg_per_interval * 4.0 if avg_per_interval is not None else None
            reserve_volume = cap * settings.tank_reserve_pct / 100.0
            available = max(0.0, volume - reserve_volume)
            hours_to_reserve = (available / avg_lph) if avg_lph and avg_lph > 0 else None
            return {
                "capacity_litres": cap,
                "level_pct": round(self.tank_level_pct, 2),
                "current_volume_litres": round(volume, 1),
                "reserve_pct": settings.tank_reserve_pct,
                "reserve_volume_litres": round(reserve_volume, 1),
                "avg_consumption_lph": round(avg_lph, 2) if avg_lph is not None else None,
                "hours_to_reserve": round(hours_to_reserve, 2) if hours_to_reserve is not None else None,
                "sample_intervals": len(flow),
                "simplified": True,
                "note": "Simplified projection: assumes the recent average consumption rate continues and ignores pumping schedule details.",
            }
