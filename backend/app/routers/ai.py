"""AI / model endpoints."""

from __future__ import annotations

import datetime as dt
import json
import threading

from fastapi import APIRouter

from ..config import settings
from ..database import session_scope
from ..ml.expected_use import ExpectedUseModel
from ..ml.training import generate_healthy_history
from ..models import ModelMetadata
from ..runtime import get_simulator, set_model

router = APIRouter(prefix="/api/ai", tags=["ai"])

_retrain_lock = threading.Lock()
_retrain_state = {"running": False, "last_error": None, "started_at": None}


def train_and_install(history_days: int | None = None, seed: int | None = None) -> ExpectedUseModel:
    days = history_days or settings.history_days
    seed = settings.training_seed if seed is None else seed
    end = dt.datetime.fromisoformat(settings.sim_epoch_iso)
    start = end - dt.timedelta(days=days)
    df = generate_healthy_history(seed=seed, days=days, sim_start=start)
    model = ExpectedUseModel().fit(df)
    with session_scope() as db:
        for row in db.query(ModelMetadata).all():
            row.active = False
        db.add(ModelMetadata(
            model_name=model.model_name,
            n_samples=model.n_samples,
            features=json.dumps(model.describe()["features"]),
            metrics=json.dumps(model.train_metrics),
            active=True,
            notes=model.fallback_reason,
        ))
    set_model(model)
    sim = get_simulator()
    sim.model = model
    return model


def _retrain_worker():
    try:
        _retrain_state["started_at"] = dt.datetime.utcnow().isoformat()
        train_and_install()
        _retrain_state["last_error"] = None
    except Exception as exc:  # pragma: no cover
        _retrain_state["last_error"] = f"{type(exc).__name__}: {exc}"
    finally:
        _retrain_state["running"] = False
        with _retrain_lock:
            pass


@router.get("/status")
def status():
    sim = get_simulator()
    model = sim.model
    return {
        "model": model.describe(),
        "data_mode": "SIMULATED",
        "detector": {
            "persistence_readings": settings.persistence_readings,
            "recovery_readings": settings.recovery_readings,
            "band_tolerance_pct": settings.band_tolerance_pct,
            "min_excess_lph": settings.min_excess_lph,
            "critical_excess_pct": settings.critical_excess_pct,
            "cusum_threshold": settings.cusum_threshold,
            "mass_balance_tolerance_pct": settings.mass_balance_tolerance_pct,
            "pipeline": [
                "prediction-band exceedance",
                "persistence / consecutive-interval check",
                "residual-gap magnitude",
                "CUSUM-style drift monitor",
                "night-flow investigation",
                "sensor-data quality (mass balance)",
            ],
        },
        "retrain": _retrain_state,
        "note": "Confidence values are heuristic evidence scores, not calibrated probabilities.",
    }


@router.post("/retrain")
def retrain():
    with _retrain_lock:
        if not _retrain_state["running"]:
            _retrain_state["running"] = True
            threading.Thread(target=_retrain_worker, daemon=True).start()
    return {"ok": True, "retrain": _retrain_state}
