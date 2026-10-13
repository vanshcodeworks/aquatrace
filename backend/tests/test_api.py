"""API integration tests using FastAPI TestClient."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client(trained_model):
    from app.main import create_app
    from app.runtime import get_simulator

    app = create_app(train_on_startup=False)
    with TestClient(app) as c:
        get_simulator().model = trained_model
        yield c


def _reset(client, scenario="normal"):
    return client.post("/api/simulation/reset", json={"scenario": scenario})


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["data_mode"] == "SIMULATED"


def test_network(client):
    r = client.get("/api/network")
    assert r.status_code == 200
    body = r.json()
    assert any(n["id"] == "main_inlet" for n in body["nodes"])
    assert all("reading" in n for n in body["nodes"])


def test_simulation_state_and_controls(client):
    _reset(client)
    assert client.post("/api/simulation/start").json()["status"] == "RUNNING"
    assert client.post("/api/simulation/pause").json()["status"] == "PAUSED"
    assert client.post("/api/simulation/resume").json()["status"] == "RUNNING"
    before = client.get("/api/simulation/state").json()["sim_time"]
    client.post("/api/simulation/step")
    after = client.get("/api/simulation/state").json()["sim_time"]
    assert before != after
    assert client.post("/api/simulation/speed", json={"speed": 15}).json()["speed"] == 15


def test_telemetry_latest_and_history(client):
    _reset(client)
    client.post("/api/simulation/step")
    latest = client.get("/api/telemetry/latest").json()
    assert "main_inlet" in latest["nodes"]
    assert latest["unit"] == "L/interval"
    hist = client.get("/api/telemetry/history", params={"node": "main_inlet", "limit": 10}).json()
    assert hist["node_id"] == "main_inlet"
    assert len(hist["series"]) >= 1


def test_scenario_selection(client):
    r = client.post("/api/simulation/scenario", json={"scenario": "hidden_leak", "node_id": "floor_b2", "intensity_lph": 80})
    assert r.status_code == 200
    assert r.json()["scenario"] == "hidden_leak"
    assert len(r.json()["faults"]) == 1
    bad = client.post("/api/simulation/scenario", json={"scenario": "does_not_exist"})
    assert bad.status_code == 422


def test_inject_fault_api(client):
    _reset(client)
    ok = client.post("/api/simulation/inject-fault", json={
        "fault_type": "pipe_leak", "node_id": "floor_b2", "intensity_lph": 60, "duration_minutes": 180
    })
    assert ok.status_code == 200
    bad = client.post("/api/simulation/inject-fault", json={
        "fault_type": "pipe_leak", "node_id": "ghost", "intensity_lph": 60
    })
    assert bad.status_code == 422
    neg = client.post("/api/simulation/inject-fault", json={
        "fault_type": "pipe_leak", "node_id": "floor_b2", "intensity_lph": -3
    })
    assert neg.status_code == 422


def test_leak_demo_creates_incident_through_detector(client):
    _reset(client)
    assert client.post("/api/simulation/run-leak-demo").status_code == 200
    client.post("/api/simulation/scenario", json={"scenario": "hidden_leak", "node_id": "floor_b2", "intensity_lph": 150})
    for _ in range(6):
        client.post("/api/simulation/step")
    incidents = client.get("/api/incidents").json()["items"]
    assert any(i["node_id"] == "floor_b2" for i in incidents)


def test_incident_lifecycle_endpoints(client):
    _reset(client)
    client.post("/api/simulation/scenario", json={"scenario": "hidden_leak", "node_id": "floor_b2", "intensity_lph": 150})
    for _ in range(6):
        client.post("/api/simulation/step")
    items = client.get("/api/incidents").json()["items"]
    assert items
    inc_id = items[0]["id"]
    assert client.get(f"/api/incidents/{inc_id}").status_code == 200
    assert client.post(f"/api/incidents/{inc_id}/acknowledge", json={}).json()["status"] == "ACKNOWLEDGED"
    assert client.post(f"/api/incidents/{inc_id}/resolve", json={"note": "fixed"}).json()["status"] == "RESOLVED"


def test_ai_status_and_everything_else(client):
    status = client.get("/api/ai/status").json()
    assert "model" in status and "detector" in status
    assert client.get("/api/tank/status").status_code == 200
    assert client.get("/api/recommendations").status_code == 200
    assert client.get("/api/export/incidents").status_code == 200
    assert client.get("/api/export/telemetry").status_code == 200


def test_network_error_unknown_node_history(client):
    r = client.get("/api/telemetry/history", params={"node": "nope"})
    assert r.status_code == 200
    assert r.json()["series"] == []
