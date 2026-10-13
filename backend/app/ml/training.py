"""Synthetic healthy-history generation and model fitting.

The integer ``seed`` makes the whole pipeline reproducible. Only *healthy*
periods (no injected faults) are used to train the expected-use model, so
injected faults never contaminate the learned normal-use envelope.
"""

from __future__ import annotations

import datetime as dt
from typing import Dict, List

import numpy as np
import pandas as pd

from ..config import settings
from ..demand import FeatureGenerator, leaf_truth
from ..network import (
    NODE_BY_ID,
    evaluation_order,
    children_of,
    is_leaf,
)
from .features import FEATURE_COLUMNS, feature_row, lags_from_history


def _unmetered_per_interval(node_id: str) -> float:
    node = NODE_BY_ID[node_id]
    return node.unmetered_lph / 4.0


def simulate_actuals(
    feature_gen: FeatureGenerator,
    features,
    rng: np.random.Generator,
) -> Dict[str, float]:
    """Propagate leaf demand up the hierarchy with meter noise (no faults)."""
    leaf = leaf_truth(features)
    actual: Dict[str, float] = {}
    for node_id in evaluation_order():
        node = NODE_BY_ID[node_id]
        if node.node_type == "TANK":
            continue
        child_sum = sum(actual.get(c, 0.0) for c in children_of(node_id))
        own = leaf.get(node_id, 0.0) if is_leaf(node_id) else 0.0
        base = child_sum + own + _unmetered_per_interval(node_id)
        noise = rng.normal(0.0, max(0.4, base * 0.03))
        actual[node_id] = max(0.0, base + noise)
    return actual


def generate_healthy_history(
    seed: int,
    days: int,
    sim_start: dt.datetime,
) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    fg = FeatureGenerator(rng, settings.total_rooms, settings.guests_per_room)
    n = days * 96

    per_node_actual: Dict[str, List[float]] = {nid: [] for nid in evaluation_order() if NODE_BY_ID[nid].node_type != "TANK"}
    feature_rows = []

    for i in range(n):
        t = sim_start + dt.timedelta(minutes=settings.interval_minutes * i)
        feats = fg.features_at(t)
        actual = simulate_actuals(fg, feats, rng)
        feature_rows.append(feats)
        for nid in per_node_actual:
            per_node_actual[nid].append(actual.get(nid, 0.0))

    rows = []
    for nid, series in per_node_actual.items():
        hist: List[float] = []
        for i, feats in enumerate(feature_rows):
            lags = lags_from_history(hist, series[i])
            row = feature_row(nid, feats, lags)
            row["node_id"] = nid
            row["actual"] = series[i]
            rows.append(row)
            hist.append(series[i])

    return pd.DataFrame(rows)
