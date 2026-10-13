"""Incident persistence and lifecycle helpers."""

from __future__ import annotations

import datetime as dt
import json
from typing import Dict, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Incident, IncidentEvent
from ..network import NODE_BY_ID

OPEN_STATES = ("OPEN", "ACKNOWLEDGED", "IN_PROGRESS")


def node_name(node_id: str) -> str:
    node = NODE_BY_ID.get(node_id)
    return node.name if node else node_id


def has_open_incident(session: Session, session_id: int, node_id: str) -> bool:
    stmt = select(Incident.id).where(
        Incident.session_id == session_id,
        Incident.node_id == node_id,
        Incident.status.in_(OPEN_STATES),
    )
    return session.execute(stmt).first() is not None


def add_event(session: Session, incident: Incident, sim_time: dt.datetime, event_type: str, message: str) -> IncidentEvent:
    ev = IncidentEvent(
        incident_id=incident.id, sim_time=sim_time, event_type=event_type, message=message
    )
    session.add(ev)
    return ev


def create_incident(
    session: Session,
    session_id: int,
    sim_time: dt.datetime,
    node_id: str,
    severity: str,
    diagnosis: Dict,
    actual: Optional[float],
    expected: Optional[float],
    upper: Optional[float],
    excess_flow_lph: float,
    sensor_quality: str,
    localisation: Optional[Dict] = None,
    recommendation: Optional[str] = None,
) -> Incident:
    incident = Incident(
        session_id=session_id,
        node_id=node_id,
        severity=severity,
        cause=diagnosis.get("cause", "insufficient_evidence"),
        confidence=float(diagnosis.get("confidence", 0.0)),
        status="OPEN",
        created_sim_time=sim_time,
        updated_sim_time=sim_time,
        actual_flow=actual,
        expected_flow=expected,
        upper_bound=upper,
        excess_flow_lph=max(0.0, excess_flow_lph),
        duration_minutes=0.0,
        excess_volume_litres=0.0,
        estimated_cost=0.0,
        sensor_quality=sensor_quality,
        evidence=json.dumps({"diagnosis": diagnosis, "localisation": localisation or {}}),
        recommendation=recommendation,
    )
    session.add(incident)
    session.flush()
    add_event(
        session, incident, sim_time, "DETECTED",
        f"Persistent anomaly detected at {node_name(node_id)}. Suspected cause: {diagnosis.get('label')}.",
    )
    return incident


def accumulate(incident: Incident, sim_time: dt.datetime, interval_minutes: int) -> None:
    """Add one interval of excess volume/cost while the incident stays active."""
    hours = interval_minutes / 60.0
    incident.duration_minutes = (incident.duration_minutes or 0.0) + interval_minutes
    incident.excess_volume_litres = (incident.excess_volume_litres or 0.0) + max(0.0, incident.excess_flow_lph) * hours
    incident.estimated_cost = (incident.excess_volume_litres / 1000.0) * settings.cost_per_kilolitre
    incident.updated_sim_time = sim_time


def mark_recovered(session: Session, incident: Incident, sim_time: dt.datetime) -> None:
    if not incident.auto_recovered:
        incident.auto_recovered = True
        incident.updated_sim_time = sim_time
        add_event(
            session, incident, sim_time, "RECOVERED",
            "Flow has returned to the expected band for the configured recovery window. "
            "Verify the fix before closing the incident.",
        )


def transition(session: Session, incident: Incident, sim_time: dt.datetime, new_status: str, note: str = "") -> None:
    incident.status = new_status
    incident.updated_sim_time = sim_time
    if new_status in ("RESOLVED", "FALSE_POSITIVE"):
        incident.resolved_sim_time = sim_time
    if note:
        incident.notes = note
    add_event(session, incident, sim_time, new_status, note or f"Status changed to {new_status}.")
