"""Shared feature engineering for the expected-use model."""

from __future__ import annotations

import math
from typing import Dict, Optional

from ..demand import OperationalFeatures, INTERVALS_PER_HOUR
from ..network import NODES, NODE_BY_ID

NODE_CODES: Dict[str, int] = {n.id: i for i, n in enumerate(NODES)}
NODE_TYPE_CODES: Dict[str, int] = {
    "MAIN": 0, "WING": 1, "FLOOR": 2, "KITCHEN": 3, "LAUNDRY": 4, "TANK": 5
}

FEATURE_COLUMNS = [
    "hour_sin", "hour_cos", "dow",
    "occupancy_rooms", "occupancy_local", "meals_served", "laundry_kg",
    "node_code", "node_type_code", "node_rooms",
]

CATEGORICAL_FEATURES = ["node_code", "node_type_code"]


def lags_from_history(history: list[float], expected_hint: float) -> Dict[str, float]:
    """history is a chronological list of actual readings (per interval)."""
    def get(i: int, default: float) -> float:
        idx = len(history) - i
        if idx < 0 or idx >= len(history):
            return default
        v = history[idx]
        return default if v is None else float(v)

    hint = expected_hint if expected_hint == expected_hint else 0.0
    lag_1 = get(1, hint)
    lag_4 = get(4, hint)
    lag_96 = get(96, hint)
    recent = [history[j] for j in range(max(0, len(history) - 4), len(history)) if history[j] is not None]
    roll_4 = sum(recent) / len(recent) if recent else hint
    return {"lag_1": lag_1, "lag_4": lag_4, "lag_96": lag_96, "roll_4": roll_4}


def feature_row(
    node_id: str,
    features: OperationalFeatures,
    lags: Dict[str, float] | None = None,
) -> Dict[str, float]:
    """Exogenous feature vector.

    Deliberately excludes recent-actual lag features: using them would let the
    model learn to follow an ongoing leak and mask the anomaly. Expected use is
    therefore driven purely by calendar and operational context.
    """
    node = NODE_BY_ID.get(node_id)
    hour_angle = 2 * math.pi * (features.hour / 24.0)
    if node is not None and node.node_type == "FLOOR":
        occupancy_local = float(features.floor_occupancy.get(node_id, 0.0))
    else:
        occupancy_local = float(features.occupancy_rooms)
    return {
        "hour_sin": math.sin(hour_angle),
        "hour_cos": math.cos(hour_angle),
        "dow": float(features.dow),
        "occupancy_rooms": float(features.occupancy_rooms),
        "occupancy_local": occupancy_local,
        "meals_served": float(features.meals_served),
        "laundry_kg": float(features.laundry_kg),
        "node_code": float(NODE_CODES.get(node_id, 0)),
        "node_type_code": float(NODE_TYPE_CODES.get(node.node_type if node else "FLOOR", 2)),
        "node_rooms": float(node.rooms if node else 0),
    }
