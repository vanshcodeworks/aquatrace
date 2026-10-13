"""Honest, simulator-based benchmark evaluation.

Everything here is computed from freshly generated simulated streams (per
seed). Injected faults provide the ground truth; the same online detector used
by the app is scored against it. Baselines are fixed-threshold and same-hour
historical. No values are hardcoded.

SIMULATION BENCHMARKS — NOT FIELD-VALIDATED PERFORMANCE.
"""

from __future__ import annotations

import datetime as dt
import json
from collections import deque
from dataclasses import dataclass
from typing import Dict, List, Optional

import numpy as np

from ..config import settings
from ..demand import FeatureGenerator, OperationalFeatures, leaf_truth, INTERVALS_PER_HOUR
from ..faults import (
    PIPE_LEAK, OPEN_TAP, RUNNING_CISTERN, LAUNDRY_INEFFICIENCY,
    CISTERN_CYCLE, CISTERN_ON,
)
from ..ml.detector import AnomalyDetector, WARNING, CRITICAL
from ..ml.expected_use import ExpectedUseModel
from ..ml.features import lags_from_history
from ..network import NODE_BY_ID, ancestors, children_of, evaluation_order, is_leaf

FLOOR_NODES = [n for n in NODE_BY_ID if NODE_BY_ID[n].node_type == "FLOOR"]


@dataclass
class Episode:
    node_id: str
    fault_type: str
    start_idx: int
    end_idx: int
    intensity_lph: float


def _unmetered(node_id: str) -> float:
    return NODE_BY_ID[node_id].unmetered_lph / 4.0


def _propagate(leaf: Dict[str, float], excess: Dict[str, float]) -> Dict[str, float]:
    true: Dict[str, float] = {}
    for node_id in evaluation_order():
        node = NODE_BY_ID[node_id]
        if node.node_type == "TANK":
            continue
        child_sum = sum(true.get(c, 0.0) for c in children_of(node_id))
        own = leaf.get(node_id, 0.0) if is_leaf(node_id) else 0.0
        true[node_id] = max(0.0, child_sum + own + _unmetered(node_id) + excess.get(node_id, 0.0))
    return true


def _episode_excess(ep: Episode, rel: int, feats: OperationalFeatures) -> float:
    if ep.fault_type in (PIPE_LEAK, OPEN_TAP):
        return ep.intensity_lph / INTERVALS_PER_HOUR
    if ep.fault_type == RUNNING_CISTERN:
        return (ep.intensity_lph / INTERVALS_PER_HOUR) * 2.5 if rel % CISTERN_CYCLE < CISTERN_ON else 0.0
    if ep.fault_type == LAUNDRY_INEFFICIENCY:
        return feats.laundry_kg * ep.intensity_lph
    return 0.0


def _build_schedule(T: int) -> List[Episode]:
    types = [
        ("floor_b2", PIPE_LEAK, 60.0),
        ("floor_b1", OPEN_TAP, 40.0),
        ("floor_a1", RUNNING_CISTERN, 45.0),
        ("laundry", LAUNDRY_INEFFICIENCY, 14.0),
    ]
    seg = T // (len(types) + 1)
    out: List[Episode] = []
    for k, (node, ft, intensity) in enumerate(types):
        start = seg * (k + 1)
        out.append(Episode(node, ft, start, min(T - 1, start + seg // 2), intensity))
    return out


def _reference_stats(days: int, seed: int) -> dict:
    rng = np.random.default_rng(seed)
    fg = FeatureGenerator(rng, settings.total_rooms, settings.guests_per_room)
    n = days * 96
    node_sum: Dict[str, float] = {}
    node_cnt: Dict[str, int] = {}
    hour_sum: Dict[tuple, float] = {}
    hour_sq: Dict[tuple, float] = {}
    hour_cnt: Dict[tuple, int] = {}
    ratios: List[float] = []
    for i in range(n):
        t = dt.datetime.fromisoformat(settings.sim_epoch_iso) + dt.timedelta(minutes=15 * i)
        feats = fg.features_at(t)
        leaf = leaf_truth(feats)
        true = _propagate(leaf, {})
        for nid, val in true.items():
            node_sum[nid] = node_sum.get(nid, 0.0) + val
            node_cnt[nid] = node_cnt.get(nid, 0) + 1
            key = (nid, feats.hour)
            hour_sum[key] = hour_sum.get(key, 0.0) + val
            hour_sq[key] = hour_sq.get(key, 0.0) + val * val
            hour_cnt[key] = hour_cnt.get(key, 0) + 1
            if NODE_BY_ID[nid].node_type == "FLOOR" and feats.occupancy_rooms > 0:
                ratios.append(val / feats.occupancy_rooms)
    node_mean = {nid: node_sum[nid] / node_cnt[nid] for nid in node_sum}
    hour_mean = {k: hour_sum[k] / hour_cnt[k] for k in hour_sum}
    hour_std = {
        k: float(np.sqrt(max(0.0, hour_sq[k] / hour_cnt[k] - hour_mean[k] ** 2)))
        for k in hour_sum
    }
    ratio_p95 = float(np.quantile(ratios, 0.95)) if ratios else 0.0
    return {
        "node_mean": node_mean,
        "hour_mean": hour_mean,
        "hour_std": hour_std,
        "ratio_p95": ratio_p95,
    }


def _run_seed(seed: int, days: int, model: ExpectedUseModel, ref: dict) -> dict:
    rng = np.random.default_rng(seed)
    fg = FeatureGenerator(rng, settings.total_rooms, settings.guests_per_room)
    T = days * 96
    schedule = _build_schedule(T)
    detector = AnomalyDetector()
    hist: Dict[str, deque] = {n: deque(maxlen=200) for n in evaluation_order() if NODE_BY_ID[n].node_type != "TANK"}

    # truth: node anom if it is the target or an ancestor of an active episode
    def truth_at(idx: int) -> Dict[str, bool]:
        labels = {n: False for n in hist}
        for ep in schedule:
            if ep.start_idx <= idx <= ep.end_idx:
                labels[ep.node_id] = True
                for a in ancestors(ep.node_id):
                    labels[a] = True
        return labels

    counts = {m: {"tp": 0, "fp": 0, "fn": 0, "tn": 0} for m in ("aquatrace", "fixed", "historical")}
    wape_num = 0.0
    wape_den = 0.0
    target_flagged: Dict[int, Optional[int]] = {}
    deepest_flag: Dict[int, Optional[str]] = {}

    for i in range(T):
        t = dt.datetime.fromisoformat(settings.sim_epoch_iso) + dt.timedelta(minutes=15 * i)
        feats = fg.features_at(t)
        leaf = leaf_truth(feats)
        excess = {ep.node_id: _episode_excess(ep, i - ep.start_idx, feats)
                  for ep in schedule if ep.start_idx <= i <= ep.end_idx}
        true = _propagate(leaf, excess)
        labels = truth_at(i)

        preds: Dict[str, bool] = {}
        for nid in true:
            base = true[nid]
            reported = max(0.0, base + float(rng.normal(0, max(0.3, base * 0.02))))
            lags = lags_from_history(list(hist[nid]), reported)
            lo, mid, hi = model.predict_one(nid, feats, lags)
            res = detector.update(nid, reported, mid, lo, hi, sensor_state="OK", hour=feats.hour)
            preds[nid] = res.state in (WARNING, CRITICAL)
            hist[nid].append(reported)

            if not labels[nid]:
                wape_num += abs(reported - mid)
                wape_den += abs(reported)

        # baselines
        for nid in true:
            base = true[nid]
            reported = list(hist[nid])[-1]
            fixed_pred = reported > ref["node_mean"].get(nid, 0.0) * 1.5
            hs = ref["hour_mean"].get((nid, feats.hour))
            hstd = ref["hour_std"].get((nid, feats.hour), 0.0)
            hist_pred = hs is not None and reported > hs + 2.0 * hstd
            for m, pred in (("aquatrace", preds[nid]), ("fixed", fixed_pred), ("historical", hist_pred)):
                if labels[nid] and pred:
                    counts[m]["tp"] += 1
                elif labels[nid] and not pred:
                    counts[m]["fn"] += 1
                elif not labels[nid] and pred:
                    counts[m]["fp"] += 1
                else:
                    counts[m]["tn"] += 1

        for k, ep in enumerate(schedule):
            if ep.start_idx <= i <= ep.end_idx:
                if preds.get(ep.node_id) and target_flagged.get(k) is None:
                    target_flagged[k] = i - ep.start_idx
                abnormal = [n for n in true if preds.get(n) and NODE_BY_ID[n].node_type != "TANK"]
                if abnormal:
                    deepest = max(abnormal, key=lambda n: len(ancestors(n)))
                    if deepest_flag.get(k) is None:
                        deepest_flag[k] = deepest

    def prf(c):
        tp, fp, fn = c["tp"], c["fp"], c["fn"]
        precision = tp / (tp + fp) if (tp + fp) else 0.0
        recall = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
        return precision, recall, f1

    metrics = {}
    for m, c in counts.items():
        p, r, f1 = prf(c)
        metrics[m] = {"precision": p, "recall": r, "f1": f1, **c}

    # incident-level (episode-level) detection
    episodes_detected = sum(1 for k in target_flagged if target_flagged[k] is not None)
    delays = [v for v in target_flagged.values() if v is not None]
    localised_correct = sum(
        1 for k, ep in enumerate(schedule)
        if deepest_flag.get(k) == ep.node_id
    )
    by_intensity: Dict[str, dict] = {}
    for ep in schedule:
        key = f"{ep.fault_type}@{int(ep.intensity_lph)}"
        by_intensity.setdefault(key, {"total": 0, "detected": 0})
        by_intensity[key]["total"] += 1

    return {
        "seed": seed,
        "T": T,
        "counts": counts,
        "metrics": metrics,
        "wape_num": wape_num,
        "wape_den": wape_den,
        "episodes_total": len(schedule),
        "episodes_detected": episodes_detected,
        "delays": delays,
        "localised_correct": localised_correct,
        "schedule": [ep.__dict__ for ep in schedule],
        "deepest": deepest_flag,
    }


def run_benchmark(seeds: List[int], days: int = 4) -> dict:
    model = _model_ref
    if model is None or not model.fitted:
        raise RuntimeError("Expected-use model is not trained yet")
    ref = _reference_stats(days=3, seed=seeds[0] + 999)

    agg_counts = {m: {"tp": 0, "fp": 0, "fn": 0, "tn": 0} for m in ("aquatrace", "fixed", "historical")}
    wape_num = wape_den = 0.0
    delays: List[int] = []
    episodes_total = episodes_detected = localised_correct = 0
    composition: Dict[str, int] = {}
    per_seed = []

    for seed in seeds:
        r = _run_seed(seed, days, model, ref)
        for m in agg_counts:
            for k in agg_counts[m]:
                agg_counts[m][k] += r["counts"][m][k]
        wape_num += r["wape_num"]
        wape_den += r["wape_den"]
        delays.extend(r["delays"])
        episodes_total += r["episodes_total"]
        episodes_detected += r["episodes_detected"]
        localised_correct += r["localised_correct"]
        for ep in r["schedule"]:
            composition[ep["fault_type"]] = composition.get(ep["fault_type"], 0) + 1
        per_seed.append({
            "seed": seed,
            "aquatrace": r["metrics"]["aquatrace"],
            "episodes_detected": r["episodes_detected"],
            "episodes_total": r["episodes_total"],
        })

    def prf(c):
        tp, fp, fn = c["tp"], c["fp"], c["fn"]
        precision = tp / (tp + fp) if (tp + fp) else 0.0
        recall = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
        return precision, recall, f1

    metrics = {}
    for m, c in agg_counts.items():
        p, r, f1 = prf(c)
        readings = sum(c.values())
        metrics[m] = {
            "precision": round(p, 4), "recall": round(r, 4), "f1": round(f1, 4),
            "false_positive_rate": round(c["fp"] / (c["fp"] + c["tn"]), 4) if (c["fp"] + c["tn"]) else 0.0,
            "true_positives": c["tp"], "false_positives": c["fp"],
            "false_negatives": c["fn"], "true_negatives": c["tn"],
        }

    days_eval = days * len(seeds)
    median_delay = float(np.median(delays)) if delays else None
    metrics["aquatrace"]["median_detection_delay_intervals"] = median_delay
    metrics["aquatrace"]["mean_detection_delay_intervals"] = round(float(np.mean(delays)), 2) if delays else None
    metrics["aquatrace"]["detection_rate_by_intensity"] = "see composition/per-seed"
    metrics["aquatrace"]["episode_detection_rate"] = round(episodes_detected / episodes_total, 4) if episodes_total else 0.0
    metrics["aquatrace"]["localisation_accuracy"] = round(localised_correct / episodes_detected, 4) if episodes_detected else 0.0
    metrics["aquatrace"]["expected_use_wape"] = round(wape_num / wape_den, 4) if wape_den else None
    metrics["aquatrace"]["false_alarms_per_simulated_day"] = round(
        agg_counts["aquatrace"]["fp"] / days_eval, 2
    ) if days_eval else None

    return {
        "settings": {
            "seeds": seeds, "days_per_seed": days, "total_simulated_days": days_eval,
            "interval_minutes": settings.interval_minutes,
            "persistence_readings": settings.persistence_readings,
            "evaluation_unit": "reading (node x interval) for TP/FP/FN/TN; episode for detection rate/delay.",
        },
        "metrics": metrics,
        "counts": agg_counts,
        "composition": composition,
        "episodes": {"total": episodes_total, "detected": episodes_detected,
                     "localised_correct": localised_correct},
        "per_seed": per_seed,
        "disclaimer": "SIMULATION BENCHMARKS — NOT FIELD-VALIDATED PERFORMANCE.",
        "notes": [
            "Ground truth comes from injected simulated faults; results do not reflect real deployments.",
            "Every fault propagates to upstream meters, so ancestor readings are labelled anomalous too.",
            "WAPE is computed only over healthy (non-anomalous) readings.",
        ],
    }


# set by main during startup
_model_ref: Optional[ExpectedUseModel] = None


def set_model(model: ExpectedUseModel) -> None:
    global _model_ref
    _model_ref = model
