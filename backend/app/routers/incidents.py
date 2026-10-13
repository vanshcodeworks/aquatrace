"""Incident management endpoints."""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from ..config import settings
from ..database import session_scope
from ..models import Incident, IncidentEvent, TelemetryReading
from ..runtime import get_simulator
from ..schemas import IncidentActionRequest
from ..services import incident_service as inc
from ..services.incident_service import node_name

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


def _serialize(inc_row: Incident) -> dict:
    evidence = {}
    try:
        evidence = json.loads(inc_row.evidence or "{}")
    except json.JSONDecodeError:
        pass
    return {
        "id": inc_row.id,
        "session_id": inc_row.session_id,
        "node_id": inc_row.node_id,
        "node_name": node_name(inc_row.node_id),
        "severity": inc_row.severity,
        "cause": inc_row.cause,
        "confidence": round(inc_row.confidence or 0.0, 3),
        "confidence_type": "heuristic_evidence_score",
        "status": inc_row.status,
        "created_sim_time": inc_row.created_sim_time.isoformat() if inc_row.created_sim_time else None,
        "updated_sim_time": inc_row.updated_sim_time.isoformat() if inc_row.updated_sim_time else None,
        "resolved_sim_time": inc_row.resolved_sim_time.isoformat() if inc_row.resolved_sim_time else None,
        "actual_flow": inc_row.actual_flow,
        "expected_flow": inc_row.expected_flow,
        "upper_bound": inc_row.upper_bound,
        "excess_flow_lph": round(inc_row.excess_flow_lph or 0.0, 2),
        "duration_minutes": round(inc_row.duration_minutes or 0.0, 1),
        "excess_volume_litres": round(inc_row.excess_volume_litres or 0.0, 1),
        "estimated_cost": round(inc_row.estimated_cost or 0.0, 2),
        "currency": settings.currency_symbol,
        "sensor_quality": inc_row.sensor_quality,
        "auto_recovered": inc_row.auto_recovered,
        "recommendation": inc_row.recommendation,
        "evidence": evidence,
    }


@router.get("")
def list_incidents(
    severity: str | None = None,
    status: str | None = None,
    node: str | None = None,
    limit: int = 50,
    offset: int = 0,
):
    limit = max(1, min(limit, 200))
    with session_scope() as db:
        stmt = select(Incident).order_by(Incident.created_sim_time.desc(), Incident.id.desc())
        if severity:
            stmt = stmt.where(Incident.severity == severity.upper())
        if status:
            stmt = stmt.where(Incident.status == status.upper())
        if node:
            stmt = stmt.where(Incident.node_id == node)
        rows = db.execute(stmt.offset(offset).limit(limit)).scalars().all()
        total = db.query(Incident).count()
        return {"items": [_serialize(r) for r in rows], "total": total, "limit": limit, "offset": offset}


@router.get("/{incident_id}")
def incident_detail(incident_id: int):
    with session_scope() as db:
        row = db.get(Incident, incident_id)
        if not row:
            raise HTTPException(status_code=404, detail="Incident not found")
        events = db.execute(
            select(IncidentEvent).where(IncidentEvent.incident_id == incident_id).order_by(IncidentEvent.id)
        ).scalars().all()
        # supporting readings around the incident window
        centre = row.created_sim_time
        readings = db.execute(
            select(TelemetryReading)
            .where(TelemetryReading.node_id == row.node_id)
            .where(TelemetryReading.sim_time >= centre - __import__("datetime").timedelta(hours=2))
            .where(TelemetryReading.sim_time <= centre + __import__("datetime").timedelta(hours=6))
            .order_by(TelemetryReading.sim_time)
            .limit(200)
        ).scalars().all()
        return {
            **_serialize(row),
            "timeline": [
                {"sim_time": e.sim_time.isoformat(), "event_type": e.event_type, "message": e.message}
                for e in events
            ],
            "supporting_readings": [
                {
                    "sim_time": r.sim_time.isoformat(),
                    "actual": r.actual_flow, "expected": r.expected_flow,
                    "lower": r.lower_bound, "upper": r.upper_bound,
                    "residual": r.residual, "detector_state": r.detector_state,
                }
                for r in readings
            ],
        }


def _transition(incident_id: int, new_status: str, note: str | None):
    sim = get_simulator()
    with session_scope() as db:
        row = db.get(Incident, incident_id)
        if not row:
            raise HTTPException(status_code=404, detail="Incident not found")
        inc.transition(db, row, sim.sim_time, new_status, note or f"Marked {new_status} by operator.")
        return _serialize(row)


@router.post("/{incident_id}/acknowledge")
def acknowledge(incident_id: int, req: IncidentActionRequest):
    return _transition(incident_id, "ACKNOWLEDGED", req.note)


@router.post("/{incident_id}/in-progress")
def in_progress(incident_id: int, req: IncidentActionRequest):
    return _transition(incident_id, "IN_PROGRESS", req.note)


@router.post("/{incident_id}/resolve")
def resolve(incident_id: int, req: IncidentActionRequest):
    return _transition(incident_id, "RESOLVED", req.note)


@router.post("/{incident_id}/false-positive")
def false_positive(incident_id: int, req: IncidentActionRequest):
    return _transition(incident_id, "FALSE_POSITIVE", req.note)
