"""Quick end-to-end smoke test (not part of the pytest suite)."""

from __future__ import annotations

import datetime as dt

from app.config import settings
from app.database import init_db
from app.ml.expected_use import ExpectedUseModel
from app.ml.training import generate_healthy_history
from app.runtime import set_model
from app.simulator import Simulator

init_db()
print("generating history...")
start = dt.datetime.fromisoformat(settings.sim_epoch_iso) - dt.timedelta(days=settings.history_days)
df = generate_healthy_history(seed=settings.training_seed, days=settings.history_days, sim_start=start)
print("history rows:", len(df))
model = ExpectedUseModel().fit(df)
print("model:", model.model_name, "fallback:", model.fallback_reason, "metrics:", model.train_metrics)
set_model(model)

sim = Simulator(model=model)
print("session:", sim.session_id, "sim_time:", sim.sim_time)
print("main_inlet expected:", sim.latest()["nodes"]["main_inlet"]["expected"],
      "actual:", sim.latest()["nodes"]["main_inlet"]["actual"])

# normal operations: advance 10 intervals
for _ in range(10):
    sim.step()
print("normal main actual:", [round(t["nodes"]["main_inlet"]["actual"], 1) for t in list(sim.ticks)[-3:]])

# inject a leak at floor_b2
sim.inject_fault("pipe_leak", "floor_b2", intensity_lph=60, onset="sudden", duration_minutes=240)
for i in range(8):
    sim.step()
node = sim.latest()["nodes"]["floor_b2"]
print("floor_b2 after leak:", node["actual"], "expected:", node["expected"],
      "state:", node["detector_state"], "excess_lph:", node["excess_lph"])

from app.database import session_scope
from app.models import Incident
with session_scope() as db:
    incs = db.query(Incident).all()
    print("incidents:")
    for i in incs:
        print("  ", i.id, i.node_id, i.severity, i.cause, "excess_lph", round(i.excess_flow_lph, 1),
              "vol", round(i.excess_volume_litres, 1), "cost", round(i.estimated_cost, 2))

sim.flush_persist()
print("OK")
