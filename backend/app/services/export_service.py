"""CSV exports for telemetry and incidents, bounded for safety."""

from __future__ import annotations

import csv
import io
import json

from sqlalchemy import select

from ..config import settings
from ..database import session_scope
from ..models import Incident, TelemetryReading


def telemetry_csv(session_id: int | None = None, node_id: str | None = None) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "session_id", "sim_time", "node_id", "actual_flow_l_per_interval",
        "expected_flow", "lower_bound", "upper_bound", "residual",
        "occupancy_rooms", "meals_served", "laundry_kg",
        "sensor_state", "detector_state", "fault_label",
    ])
    with session_scope() as db:
        stmt = select(TelemetryReading).order_by(TelemetryReading.id).limit(settings.max_telemetry_rows_export)
        if session_id is not None:
            stmt = stmt.where(TelemetryReading.session_id == session_id)
        if node_id:
            stmt = stmt.where(TelemetryReading.node_id == node_id)
        for r in db.execute(stmt).scalars():
            writer.writerow([
                r.session_id, r.sim_time.isoformat(), r.node_id, r.actual_flow,
                r.expected_flow, r.lower_bound, r.upper_bound, r.residual,
                r.occupancy_rooms, r.meals_served, r.laundry_kg,
                r.sensor_state, r.detector_state, r.fault_label,
            ])
    return buf.getvalue()


def incidents_csv(session_id: int | None = None) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "id", "session_id", "created_sim_time", "node_id", "severity", "cause",
        "confidence", "status", "actual_flow", "expected_flow", "upper_bound",
        "excess_flow_lph", "duration_minutes", "excess_volume_litres",
        "estimated_cost", "auto_recovered",
    ])
    with session_scope() as db:
        stmt = select(Incident).order_by(Incident.id)
        if session_id is not None:
            stmt = stmt.where(Incident.session_id == session_id)
        for r in db.execute(stmt).scalars():
            writer.writerow([
                r.id, r.session_id, r.created_sim_time.isoformat(), r.node_id,
                r.severity, r.cause, r.confidence, r.status, r.actual_flow,
                r.expected_flow, r.upper_bound, r.excess_flow_lph,
                r.duration_minutes, r.excess_volume_litres, r.estimated_cost,
                r.auto_recovered,
            ])
    return buf.getvalue()


def incidents_json(session_id: int | None = None) -> list[dict]:
    out = []
    with session_scope() as db:
        stmt = select(Incident).order_by(Incident.id)
        if session_id is not None:
            stmt = stmt.where(Incident.session_id == session_id)
        for r in db.execute(stmt).scalars():
            evidence = {}
            try:
                evidence = json.loads(r.evidence or "{}")
            except json.JSONDecodeError:
                pass
            out.append({
                "id": r.id, "session_id": r.session_id,
                "created_sim_time": r.created_sim_time.isoformat(),
                "node_id": r.node_id, "severity": r.severity, "cause": r.cause,
                "confidence": r.confidence, "status": r.status,
                "actual_flow": r.actual_flow, "expected_flow": r.expected_flow,
                "upper_bound": r.upper_bound, "excess_flow_lph": r.excess_flow_lph,
                "duration_minutes": r.duration_minutes,
                "excess_volume_litres": r.excess_volume_litres,
                "estimated_cost": r.estimated_cost, "auto_recovered": r.auto_recovered,
                "evidence": evidence,
            })
    return out
