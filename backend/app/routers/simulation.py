"""Simulation control endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..faults import SCENARIOS, SCENARIO_BY_ID
from ..runtime import get_simulator
from ..schemas import (
    InjectFaultRequest,
    RemoveFaultRequest,
    ResetRequest,
    ScenarioRequest,
    SpeedRequest,
)

router = APIRouter(prefix="/api/simulation", tags=["simulation"])


@router.get("/scenarios")
def scenarios():
    return {
        "scenarios": [
            {
                "id": s.id, "label": s.label, "description": s.description,
                "expected": s.expected, "default_node": s.default_node,
                "default_intensity_lph": s.default_intensity_lph,
                "fault_type": s.fault_type,
            }
            for s in SCENARIOS
        ]
    }


@router.get("/state")
def state():
    return get_simulator().state()


@router.post("/start")
def start():
    sim = get_simulator()
    sim.start()
    return sim.state()


@router.post("/pause")
def pause():
    sim = get_simulator()
    sim.pause()
    return sim.state()


@router.post("/resume")
def resume():
    sim = get_simulator()
    sim.resume()
    return sim.state()


@router.post("/stop")
def stop():
    sim = get_simulator()
    sim.stop()
    return sim.state()


@router.post("/speed")
def set_speed(req: SpeedRequest):
    sim = get_simulator()
    sim.set_speed(req.speed)
    return sim.state()


@router.post("/step")
def step():
    sim = get_simulator()
    sim.step()
    return sim.latest()


@router.post("/reset")
def reset(req: ResetRequest):
    sim = get_simulator()
    if req.scenario and req.scenario not in SCENARIO_BY_ID:
        raise HTTPException(status_code=422, detail=f"Unknown scenario: {req.scenario}")
    sim.reset(seed=req.seed, scenario=req.scenario or "normal", start_iso=req.start_iso)
    return sim.state()


@router.post("/scenario")
def select_scenario(req: ScenarioRequest):
    if req.scenario not in SCENARIO_BY_ID:
        raise HTTPException(status_code=422, detail=f"Unknown scenario: {req.scenario}")
    sim = get_simulator()
    try:
        result = sim.select_scenario(
            req.scenario,
            node_id=req.node_id,
            intensity_lph=req.intensity_lph,
            onset=req.onset,
            duration_minutes=req.duration_minutes,
            intermittent=req.intermittent,
            params=req.params,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {**sim.state(), **result}


@router.post("/inject-fault")
def inject_fault(req: InjectFaultRequest):
    sim = get_simulator()
    try:
        fault = sim.inject_fault(
            fault_type=req.fault_type,
            node_id=req.node_id,
            intensity_lph=req.intensity_lph,
            onset=req.onset,
            duration_minutes=req.duration_minutes,
            intermittent=req.intermittent,
            start_delay_intervals=req.start_delay_intervals,
            params=req.params,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {"ok": True, "fault": fault, "state": sim.state()}


@router.post("/remove-fault")
def remove_fault(req: RemoveFaultRequest):
    if req.fault_db_id is None and req.node_id is None:
        raise HTTPException(status_code=422, detail="Provide fault_db_id or node_id")
    sim = get_simulator()
    removed = sim.remove_fault(fault_db_id=req.fault_db_id, node_id=req.node_id)
    return {"ok": True, "removed": removed, "state": sim.state()}


@router.post("/run-leak-demo")
def run_leak_demo():
    sim = get_simulator()
    return sim.start_leak_demo()


@router.post("/simulate-remediation")
def simulate_remediation():
    sim = get_simulator()
    return sim.simulate_remediation()


@router.get("/timeline")
def timeline():
    return {"events": get_simulator().timeline_events()}
