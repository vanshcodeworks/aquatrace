"""Tank planning estimates (explicitly simplified)."""

from __future__ import annotations

from ..simulator import Simulator


def tank_status(sim: Simulator) -> dict:
    snap = sim.tank_snapshot()
    snap["assumptions"] = {
        "capacity_litres": snap["capacity_litres"],
        "reserve_pct": snap["reserve_pct"],
        "refill_model": "Simplified: pumping replenishes to 90% when the level drops below 30%; continuous inflow is not modelled.",
        "depletion_basis": "Recent average main-inlet consumption over the last 24 simulated hours.",
    }
    return snap
