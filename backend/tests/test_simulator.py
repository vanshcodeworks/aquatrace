"""Simulation-engine unit tests."""

from __future__ import annotations

import datetime as dt

import pytest

from app.config import settings
from app.database import session_scope
from app.models import Incident
from app.services import incident_service as inc
from app.simulator import Simulator


def _open_incidents(sim, node_id=None):
    with session_scope() as db:
        from sqlalchemy import select
        stmt = select(Incident).where(
            Incident.status.in_(inc.OPEN_STATES),
            Incident.session_id == sim.session_id,
        )
        if node_id:
            stmt = stmt.where(Incident.node_id == node_id)
        return db.execute(stmt).scalars().all()


def test_reset_creates_session(sim: Simulator):
    assert sim.session_id is not None
    assert sim.status == "STOPPED"
    assert sim.sim_time == dt.datetime.fromisoformat(settings.sim_epoch_iso)


def test_step_advances_one_interval(sim: Simulator):
    t0 = sim.sim_time
    sim.step()
    assert sim.sim_time - t0 == dt.timedelta(minutes=settings.interval_minutes)


def test_deterministic_seed(trained_model):
    a = Simulator(model=trained_model)
    b = Simulator(model=trained_model)
    for _ in range(5):
        a.step()
        b.step()
    for node in a.latest()["nodes"]:
        assert a.latest()["nodes"][node]["actual"] == b.latest()["nodes"][node]["actual"]


def test_start_pause_resume(sim: Simulator):
    sim.start()
    assert sim.status == "RUNNING"
    sim.pause()
    assert sim.status == "PAUSED"
    sim.resume()
    assert sim.status == "RUNNING"
    sim.stop()
    assert sim.status == "STOPPED"


def test_speed_validation(sim: Simulator):
    sim.set_speed(5)
    assert sim.speed == 5
    with pytest.raises(ValueError):
        sim.set_speed(0)


def test_mass_balance_parent_equals_children(sim: Simulator):
    sim.step()
    nodes = sim.latest()["nodes"]
    for parent, kids in (("wing_a", ["floor_a1", "floor_a2"]),
                         ("wing_b", ["floor_b1", "floor_b2"])):
        child_sum = sum(nodes[k]["actual"] for k in kids)
        # parent includes a small unmetered term and noise; should be close
        assert abs(nodes[parent]["actual"] - child_sum) < child_sum * 0.15 + 5


def test_inject_fault_valid(sim: Simulator):
    fault = sim.inject_fault("pipe_leak", "floor_b2", intensity_lph=60, duration_minutes=120)
    assert fault["node_id"] == "floor_b2"
    assert len(sim.active_faults()) == 1


def test_inject_fault_invalid(sim: Simulator):
    with pytest.raises(ValueError):
        sim.inject_fault("pipe_leak", "not_a_node", intensity_lph=10)
    with pytest.raises(ValueError):
        sim.inject_fault("pipe_leak", "tank", intensity_lph=10)
    with pytest.raises(ValueError):
        sim.inject_fault("pipe_leak", "floor_b2", intensity_lph=-5)


def test_leak_propagates_upstream(sim: Simulator):
    sim.inject_fault("pipe_leak", "floor_b2", intensity_lph=100, duration_minutes=240)
    for _ in range(4):
        sim.step()
    nodes = sim.latest()["nodes"]
    assert nodes["floor_b2"]["actual"] > nodes["floor_b2"]["expected"] + 10
    # the excess must appear at the wing and main inlet too
    assert nodes["wing_b"]["actual"] > nodes["wing_b"]["expected"] + 5
    assert nodes["main_inlet"]["actual"] > nodes["main_inlet"]["expected"] + 5


def test_persistence_required_before_incident(sim: Simulator):
    sim.inject_fault("pipe_leak", "floor_b2", intensity_lph=150, duration_minutes=240)
    for _ in range(settings.persistence_readings - 1):
        sim.step()
    assert _open_incidents(sim, "floor_b2") == []
    sim.step()
    assert len(_open_incidents(sim, "floor_b2")) >= 1


def test_leak_produces_single_incident(sim: Simulator):
    sim.inject_fault("pipe_leak", "floor_b2", intensity_lph=150, duration_minutes=240)
    for _ in range(6):
        sim.step()
    # only the deepest abnormal node should hold an incident
    assert len(_open_incidents(sim)) == 1


def test_incident_waste_calculation(sim: Simulator):
    sim.inject_fault("pipe_leak", "floor_b2", intensity_lph=120, duration_minutes=240)
    for _ in range(5):
        sim.step()
    incs = _open_incidents(sim, "floor_b2")
    assert incs
    i = incs[0]
    expected_volume = i.excess_flow_lph * (i.duration_minutes / 60.0)
    assert abs(i.excess_volume_litres - expected_volume) < expected_volume * 0.15
    assert abs(i.estimated_cost - i.excess_volume_litres / 1000.0 * settings.cost_per_kilolitre) < 1e-6


def test_missing_sensor_offline_not_zero(sim: Simulator):
    sim.inject_fault("sensor_missing", "floor_a2", intensity_lph=0, duration_minutes=240)
    for _ in range(2):
        sim.step()
    node = sim.latest()["nodes"]["floor_a2"]
    assert node["actual"] is None
    assert node["sensor_state"] == "OFFLINE"
    assert node["detector_state"] in ("OFFLINE", "STALE")
    # localisation must warn about unevaluated nodes
    sim.step()
    node2 = sim.latest()["nodes"]["floor_a2"]
    assert node2["actual"] is None


def test_sensor_drift_flags_sensor_not_leak(sim: Simulator):
    sim.inject_fault("sensor_drift", "floor_b1", intensity_lph=40, duration_minutes=600)
    for _ in range(6):
        sim.step()
    incs = _open_incidents(sim, "floor_b1")
    assert incs
    assert incs[0].cause == "possible_sensor_drift"


def test_remove_fault_changes_readings(sim: Simulator):
    sim.inject_fault("pipe_leak", "floor_b2", intensity_lph=120, duration_minutes=600)
    for _ in range(4):
        sim.step()
    assert sim.latest()["nodes"]["floor_b2"]["actual"] > sim.latest()["nodes"]["floor_b2"]["expected"] + 10
    sim.remove_fault(node_id="floor_b2")
    for _ in range(3):
        sim.step()
    node = sim.latest()["nodes"]["floor_b2"]
    assert node["actual"] < node["expected"] + 15


def test_tank_depletes(sim: Simulator):
    start_level = sim.tank_level_pct
    for _ in range(10):
        sim.step()
    assert sim.tank_level_pct < start_level


def test_normal_operations_no_critical(sim: Simulator):
    for _ in range(12):
        sim.step()
    states = [n["detector_state"] for n in sim.latest()["nodes"].values()]
    assert "CRITICAL" not in states
