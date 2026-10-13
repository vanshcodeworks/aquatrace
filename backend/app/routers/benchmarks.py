"""Benchmark endpoints (run in a background thread; never block the API)."""

from __future__ import annotations

import datetime as dt
import json
import threading

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from ..database import session_scope
from ..models import BenchmarkRun
from ..schemas import BenchmarkRequest
from ..services import benchmark_service

router = APIRouter(prefix="/api/benchmarks", tags=["benchmarks"])


def _run_worker(run_id: int, seeds: list[int], days: int):
    try:
        result = benchmark_service.run_benchmark(seeds=seeds, days=days)
        with session_scope() as db:
            row = db.get(BenchmarkRun, run_id)
            if row:
                row.status = "DONE"
                row.metrics = json.dumps(result["metrics"])
                row.counts = json.dumps(result["counts"])
                row.composition = json.dumps({
                    "composition": result["composition"],
                    "episodes": result["episodes"],
                    "per_seed": result["per_seed"],
                    "settings": result["settings"],
                    "notes": result["notes"],
                    "disclaimer": result["disclaimer"],
                })
    except Exception as exc:  # pragma: no cover
        with session_scope() as db:
            row = db.get(BenchmarkRun, run_id)
            if row:
                row.status = "FAILED"
                row.error = f"{type(exc).__name__}: {exc}"


@router.post("/run")
def run(req: BenchmarkRequest):
    with session_scope() as db:
        row = BenchmarkRun(
            status="RUNNING",
            seeds=",".join(str(s) for s in req.seeds),
            params=json.dumps({"seeds": req.seeds, "days": req.days}),
        )
        db.add(row)
        db.flush()
        run_id = row.id
    threading.Thread(target=_run_worker, args=(run_id, req.seeds, req.days), daemon=True).start()
    return {"ok": True, "run_id": run_id, "status": "RUNNING"}


def _serialize(row: BenchmarkRun) -> dict:
    def load(x):
        try:
            return json.loads(x) if x else None
        except json.JSONDecodeError:
            return None
    return {
        "id": row.id,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "status": row.status,
        "seeds": row.seeds,
        "params": load(row.params),
        "metrics": load(row.metrics),
        "counts": load(row.counts),
        "extra": load(row.composition),
        "error": row.error,
        "disclaimer": "SIMULATION BENCHMARKS — NOT FIELD-VALIDATED PERFORMANCE.",
    }


@router.get("/latest")
def latest():
    with session_scope() as db:
        row = db.execute(select(BenchmarkRun).order_by(BenchmarkRun.id.desc())).scalars().first()
        if not row:
            raise HTTPException(status_code=404, detail="No benchmark has been run yet")
        return _serialize(row)


@router.get("/{run_id}")
def get_run(run_id: int):
    with session_scope() as db:
        row = db.get(BenchmarkRun, run_id)
        if not row:
            raise HTTPException(status_code=404, detail="Benchmark run not found")
        return _serialize(row)
