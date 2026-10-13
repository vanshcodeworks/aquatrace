"""Health, network, tank and recommendations endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from .. import __version__
from ..config import settings
from ..network import topology
from ..runtime import get_simulator
from ..services import recommendation_service, tank_service

router = APIRouter(prefix="/api", tags=["core"])


@router.get("/health")
def health():
    sim = get_simulator()
    return {
        "status": "ok",
        "data_mode": "SIMULATED",
        "model_name": sim.model.model_name,
        "version": __version__,
        "db": settings.db_path,
    }


@router.get("/network")
def network():
    sim = get_simulator()
    latest = sim.latest()
    topo = topology()
    for node in topo["nodes"]:
        reading = latest["nodes"].get(node["id"])
        node["reading"] = reading
    return topo


@router.get("/tank/status")
def tank_status():
    return tank_service.tank_status(get_simulator())


@router.get("/recommendations")
def recommendations(limit: int = 12):
    limit = max(1, min(limit, 50))
    return {"items": recommendation_service.build_recommendations(limit)}
