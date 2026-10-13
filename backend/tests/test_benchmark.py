"""Benchmark and export tests."""

from __future__ import annotations

from app.services import benchmark_service, export_service


def test_benchmark_runs_and_reports(trained_model):
    benchmark_service.set_model(trained_model)
    result = benchmark_service.run_benchmark(seeds=[1], days=2)
    assert "metrics" in result and "counts" in result
    m = result["metrics"]["aquatrace"]
    assert 0.0 <= m["precision"] <= 1.0
    assert 0.0 <= m["recall"] <= 1.0
    # counts must be integers from an actual run
    assert m["true_positives"] + m["false_negatives"] > 0
    assert result["episodes"]["total"] >= 4
    # baselines are present
    assert "fixed" in result["metrics"] and "historical" in result["metrics"]
    assert "NOT FIELD-VALIDATED" in result["disclaimer"]


def test_export_csv_has_headers(sim):
    sim.inject_fault("pipe_leak", "floor_b2", intensity_lph=120, duration_minutes=120)
    for _ in range(4):
        sim.step()
    sim.flush_persist()
    telemetry = export_service.telemetry_csv(session_id=sim.session_id)
    assert "actual_flow_l_per_interval" in telemetry.splitlines()[0]
    incidents = export_service.incidents_csv(session_id=sim.session_id)
    assert incidents.splitlines()[0].startswith("id,session_id")
