"""Transparent, rule-based action recommendations.

Priority is a weighted, documented score — not an arbitrary confidence sort:

    priority = 100 * (0.35 * severity_weight
                      + 0.25 * excess_norm
                      + 0.20 * cost_norm
                      + 0.10 * persistence_norm
                      + 0.10 * diagnosis_confidence)
"""

from __future__ import annotations

import json
from typing import List

from sqlalchemy import select

from ..config import settings
from ..database import session_scope
from ..models import Incident
from ..network import NODE_BY_ID
from ..services.incident_service import OPEN_STATES, node_name

_SEVERITY_WEIGHT = {"CRITICAL": 1.0, "WARNING": 0.6, "WATCH": 0.3}


def _cause_action(incident: Incident) -> str:
    name = node_name(incident.node_id)
    mapping = {
        "possible_pipe_leak": f"Inspect {name}: excess flow has persisted. Check pipework and joints.",
        "possible_running_cistern": f"Inspect fixtures on {name}: repeated refill bursts suggest a running cistern.",
        "possible_open_tap": f"Inspect and close or repair the outlet on {name}: sustained excess flow.",
        "possible_laundry_inefficiency": "Review the laundry process: water use per kilogram exceeds the configured baseline.",
        "possible_sensor_drift": f"Check sensor calibration at {name}: branch reading disagrees with the parent meter.",
        "high_but_legitimate_demand": f"Monitor {name}: elevated use appears to match recorded activity.",
        "sensor_data_unavailable": f"Restore monitoring at {name} before drawing conclusions.",
    }
    return mapping.get(incident.cause, f"Investigate {name}.")


def build_recommendations(limit: int = 12) -> List[dict]:
    out: List[dict] = []
    with session_scope() as db:
        incidents = db.execute(
            select(Incident).where(Incident.status.in_(OPEN_STATES)).order_by(Incident.severity.desc())
        ).scalars().all()
        for inc in incidents:
            evidence = {}
            try:
                evidence = json.loads(inc.evidence or "{}")
            except json.JSONDecodeError:
                pass
            confidence = float(inc.confidence or 0.0)
            severity_w = _SEVERITY_WEIGHT.get(inc.severity, 0.4)
            excess_norm = min(1.0, (inc.excess_flow_lph or 0.0) / 100.0)
            cost_norm = min(1.0, (inc.estimated_cost or 0.0) / 1000.0)
            persist_norm = min(1.0, (inc.duration_minutes or 0.0) / (settings.interval_minutes * 6))
            priority = 100.0 * (
                0.35 * severity_w + 0.25 * excess_norm + 0.20 * cost_norm
                + 0.10 * persist_norm + 0.10 * confidence
            )
            out.append({
                "incident_id": inc.id,
                "node_id": inc.node_id,
                "node_name": node_name(inc.node_id),
                "severity": inc.severity,
                "cause": inc.cause,
                "action": _cause_action(inc),
                "reason": (
                    f"Severity {inc.severity}; excess {inc.excess_flow_lph:.1f} L/h; "
                    f"estimated cost {settings.currency_symbol}{inc.estimated_cost:.2f}; "
                    f"heuristic evidence score {confidence:.2f}."
                ),
                "priority": round(priority, 1),
                "excess_flow_lph": round(inc.excess_flow_lph or 0.0, 2),
                "estimated_cost": round(inc.estimated_cost or 0.0, 2),
                "created_sim_time": inc.created_sim_time.isoformat() if inc.created_sim_time else None,
            })
    out.sort(key=lambda r: r["priority"], reverse=True)
    return out[:limit]
