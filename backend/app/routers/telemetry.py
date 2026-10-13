"""Telemetry endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from ..network import NODE_BY_ID
from ..runtime import get_simulator

router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])


@router.get("/latest")
def latest():
    sim = get_simulator()
    data = sim.latest()
    return {
        **data,
        "status": sim.status,
        "speed": sim.speed,
        "unit": "L/interval",
        "interval_minutes": 15,
    }


@router.get("/history")
def history(node: str | None = None, limit: int = 200):
    sim = get_simulator()
    limit = max(1, min(limit, 4000))
    if node and node not in NODE_BY_ID:
        # return empty rather than 500
        return {"node_id": node, "series": [], "unit": "L/interval", "error": "unknown node"}
    return sim.history(node_id=node, limit=limit)
