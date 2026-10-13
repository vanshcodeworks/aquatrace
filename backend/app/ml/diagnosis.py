"""Rules-based, explainable cause classifier.

This is a heuristic diagnosis engine, not a physically confirmed fault
detector. Confidence values are explicitly a *heuristic evidence score*
in [0, 1] defined below, NOT a statistically calibrated probability:

    score = 0.30 * persistence_score
          + 0.30 * magnitude_score
          + 0.20 * pattern_score
          + 0.20 * consistency_score

each component is a normalised signal from the detector / mass-balance check.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

from ..demand import OperationalFeatures
from ..network import NODE_BY_ID
from .detector import DetectorResult, HEALTHY, WATCH, WARNING, CRITICAL, STALE, OFFLINE

PIPE_LEAK = "possible_pipe_leak"
RUNNING_CISTERN = "possible_running_cistern"
OPEN_TAP = "possible_open_tap"
LAUNDRY_INEFFICIENCY = "possible_laundry_inefficiency"
SENSOR_DRIFT = "possible_sensor_drift"
HIGH_LEGITIMATE = "high_but_legitimate_demand"
SENSOR_ISSUE = "sensor_data_unavailable"
NORMAL = "normal"
INSUFFICIENT = "insufficient_evidence"

CAUSE_LABELS = {
    PIPE_LEAK: "Possible pipe leak",
    RUNNING_CISTERN: "Possible running cistern",
    OPEN_TAP: "Possible open tap",
    LAUNDRY_INEFFICIENCY: "Possible laundry inefficiency",
    SENSOR_DRIFT: "Possible sensor drift",
    HIGH_LEGITIMATE: "High but potentially legitimate demand",
    SENSOR_ISSUE: "Sensor data unavailable",
    NORMAL: "No fault indicated",
    INSUFFICIENT: "Insufficient evidence",
}


@dataclass
class Diagnosis:
    cause: str
    label: str
    confidence: float
    is_heuristic: bool = True
    evidence: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "cause": self.cause,
            "label": self.label,
            "confidence": round(self.confidence, 3),
            "confidence_type": "heuristic_evidence_score" if self.is_heuristic else "calibrated_probability",
            "evidence": self.evidence,
        }


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def diagnose(
    node_id: str,
    result: DetectorResult,
    features: OperationalFeatures,
    context: Optional[Dict] = None,
) -> Diagnosis:
    ctx = context or {}
    node = NODE_BY_ID.get(node_id)
    node_type = node.node_type if node else "FLOOR"
    evidence: List[str] = list(result.evidence)

    if result.state in (OFFLINE, STALE) or result.actual is None:
        return Diagnosis(
            cause=SENSOR_ISSUE, label=CAUSE_LABELS[SENSOR_ISSUE],
            confidence=0.9, evidence=evidence or ["Node is not reporting usable data."],
        )

    if result.state in (HEALTHY, WATCH):
        return Diagnosis(cause=NORMAL, label=CAUSE_LABELS[NORMAL], confidence=0.2, evidence=evidence)

    persist = _clamp(result.persist_count / 6.0)
    mag = _clamp(abs(result.residual_pct) / 0.4)
    mass_ok = 1.0 if ctx.get("mass_balance_ok", True) else 0.3
    consistency = mass_ok if result.state in (WARNING, CRITICAL) else 0.2

    # --- sensor drift: parent/child mass-balance disagreement ------------
    if not ctx.get("mass_balance_ok", True):
        evidence.append(
            f"Parent inflow disagrees with the sum of child meters by {ctx.get('mass_balance_pct', 0)*100:.1f}%."
        )
        score = 0.30 * persist + 0.30 * mag + 0.20 * mass_ok + 0.20 * _clamp(ctx.get("mass_balance_pct", 0) / 0.2)
        return Diagnosis(SENSOR_DRIFT, CAUSE_LABELS[SENSOR_DRIFT], _clamp(score), evidence=evidence)

    # --- laundry inefficiency --------------------------------------------
    ratio = ctx.get("laundry_ratio")
    baseline = ctx.get("laundry_baseline", 12.0)
    if node_type == "LAUNDRY" and ratio is not None and baseline > 0:
        excess_ratio = ratio / baseline - 1.0
        if excess_ratio > 0.2:
            evidence.append(
                f"Water use per kilogram of laundry is {ratio:.1f} L/kg versus a "
                f"configured baseline of {baseline:.1f} L/kg."
            )
            score = 0.30 * persist + 0.30 * _clamp(excess_ratio / 0.6) + 0.20 * mag + 0.20 * 0.8
            return Diagnosis(LAUNDRY_INEFFICIENCY, CAUSE_LABELS[LAUNDRY_INEFFICIENCY], _clamp(score), evidence=evidence)

    # --- running cistern: periodic bursts --------------------------------
    if result.burst_score >= 0.45 and node_type in ("FLOOR", "WING"):
        evidence.append(
            f"Repeated burst pattern detected ({result.burst_score*100:.0f}% of recent intervals elevated), "
            "consistent with cyclic fixture refill."
        )
        score = 0.30 * persist + 0.30 * result.burst_score + 0.20 * result.burst_score + 0.20 * consistency
        return Diagnosis(RUNNING_CISTERN, CAUSE_LABELS[RUNNING_CISTERN], _clamp(score), evidence=evidence)

    # --- night flow -> leak ----------------------------------------------
    if result.night_flow:
        evidence.append("Sustained excess flow occurred overnight when the branch should be quiet.")
        score = 0.30 * persist + 0.30 * mag + 0.20 * 0.9 + 0.20 * consistency
        return Diagnosis(PIPE_LEAK, CAUSE_LABELS[PIPE_LEAK], _clamp(score), evidence=evidence)

    # --- sustained residual on a branch ----------------------------------
    if node_type in ("FLOOR", "WING"):
        if result.excess_lph < 25.0:
            evidence.append(
                f"Small, sustained excess flow ({result.excess_lph:.1f} L/h) without periodic bursts."
            )
            score = 0.30 * persist + 0.30 * (1 - _clamp(result.excess_lph / 25.0)) + 0.20 * 0.7 + 0.20 * consistency
            return Diagnosis(OPEN_TAP, CAUSE_LABELS[OPEN_TAP], _clamp(score), evidence=evidence)
        evidence.append(
            f"Sustained excess flow of {result.excess_lph:.1f} L/h on a monitored branch."
        )
        score = 0.30 * persist + 0.30 * mag + 0.20 * 0.8 + 0.20 * consistency
        return Diagnosis(PIPE_LEAK, CAUSE_LABELS[PIPE_LEAK], _clamp(score), evidence=evidence)

    # --- high but legitimate (kitchen / main during busy operations) ------
    if node_type in ("KITCHEN", "MAIN") and features.meals_served > 0:
        evidence.append(
            "Elevated use coincides with high recorded meal/occupancy activity; may be legitimate."
        )
        return Diagnosis(HIGH_LEGITIMATE, CAUSE_LABELS[HIGH_LEGITIMATE], 0.35, evidence=evidence)

    return Diagnosis(INSUFFICIENT, CAUSE_LABELS[INSUFFICIENT], 0.25, evidence=evidence)
