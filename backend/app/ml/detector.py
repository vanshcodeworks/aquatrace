"""Explainable persistent anomaly detector.

Pipeline per reading (all thresholds configurable in ``config.Settings``):
 1. prediction-band exceedance (actual outside [P10, P90])
 2. persistence check (consecutive exceedances)
 3. residual-gap magnitude check
 4. CUSUM-style drift monitor
 5. night-flow investigation
 6. sensor-quality handling (missing readings never treated as zero)
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict, List, Optional

from ..config import settings

HEALTHY = "HEALTHY"
WATCH = "WATCH"
WARNING = "WARNING"
CRITICAL = "CRITICAL"
STALE = "STALE"
OFFLINE = "OFFLINE"

STATUS_ORDER = {HEALTHY: 0, WATCH: 1, WARNING: 2, CRITICAL: 3, STALE: 4, OFFLINE: 5}


@dataclass
class DetectorResult:
    node_id: str
    state: str
    actual: Optional[float]
    expected: Optional[float]
    lower: Optional[float]
    upper: Optional[float]
    residual: Optional[float]
    residual_pct: float
    excess_lph: float
    persist_count: int
    healthy_count: int
    exceed: bool
    cusum: float
    cusum_flag: bool
    burst_score: float
    night_flow: bool
    evidence: List[str] = field(default_factory=list)

    @property
    def incident_eligible(self) -> bool:
        return self.persist_count >= settings.persistence_readings and self.state in (WARNING, CRITICAL)


class _NodeState:
    __slots__ = ("consec_exceed", "consec_healthy", "state", "cusum", "residuals", "last_actual")

    def __init__(self) -> None:
        self.consec_exceed = 0
        self.consec_healthy = 0
        self.state = HEALTHY
        self.cusum = 0.0
        self.residuals: Deque[float] = deque(maxlen=24)
        self.last_actual: Optional[float] = None


class AnomalyDetector:
    def __init__(self) -> None:
        self._state: Dict[str, _NodeState] = {}

    def reset(self) -> None:
        self._state.clear()

    def state_of(self, node_id: str) -> str:
        return self._state.get(node_id, _NodeState()).state

    def update(
        self,
        node_id: str,
        actual: Optional[float],
        expected: Optional[float],
        lower: Optional[float],
        upper: Optional[float],
        sensor_state: str = "OK",
        hour: Optional[int] = None,
    ) -> DetectorResult:
        st = self._state.setdefault(node_id, _NodeState())

        # --- missing data -------------------------------------------------
        if actual is None or sensor_state in ("OFFLINE", "STALE"):
            state = sensor_state if sensor_state in ("OFFLINE", "STALE") else STALE
            st.state = state
            st.consec_exceed = 0
            evidence = [f"No reading available for {node_id}; the last value is not treated as zero."]
            return DetectorResult(
                node_id=node_id, state=state, actual=None, expected=expected,
                lower=lower, upper=upper, residual=None, residual_pct=0.0,
                excess_lph=0.0, persist_count=0, healthy_count=st.consec_healthy,
                exceed=False, cusum=st.cusum, cusum_flag=False, burst_score=0.0,
                night_flow=False, evidence=evidence,
            )

        expected = float(expected or 0.0)
        residual = actual - expected
        residual_pct = residual / expected if expected > 0.5 else 0.0
        residual_lph = residual * 4.0  # L/interval -> L/hour
        min_excess = settings.min_excess_lph
        band_tol = settings.band_tolerance_pct * max(expected, 1.0)

        exceed_up = actual > (upper + band_tol) and residual_lph > min_excess
        exceed_lo = actual < (lower - band_tol) and residual_lph < -min_excess
        exceed = exceed_up or exceed_lo

        if exceed:
            st.consec_exceed += 1
            st.consec_healthy = 0
        else:
            st.consec_exceed = 0
            st.consec_healthy += 1

        # --- CUSUM --------------------------------------------------------
        r = residual / max(expected, 1.0)
        st.cusum = max(0.0, st.cusum + (r - settings.cusum_slack)) if r > 0 else max(0.0, st.cusum + (r + settings.cusum_slack))
        cusum_flag = st.cusum > settings.cusum_threshold

        # --- burst / periodicity -----------------------------------------
        st.residuals.append(residual)
        recent = list(st.residuals)[-16:]
        burst_score = 0.0
        if recent:
            thr = max(min_excess, 0.15 * max(expected, 1.0))
            above = [1 if (v > thr) else 0 for v in recent]
            burst_score = sum(above) / len(above)

        # --- night flow ---------------------------------------------------
        night_flow = bool(
            hour is not None and (1 <= hour <= 4)
            and expected > 1.0 and actual > expected * 1.5 + min_excess
        )

        # --- state machine ------------------------------------------------
        if st.consec_exceed == 0:
            state = HEALTHY
        elif st.consec_exceed == 1:
            state = WATCH
        elif st.consec_exceed < settings.persistence_readings:
            state = WARNING
        else:
            significant = (
                residual_pct >= settings.critical_excess_pct
                or residual_lph >= max(20.0, min_excess * 2)
            )
            state = CRITICAL if significant else WARNING
        st.state = state
        st.last_actual = actual

        evidence: List[str] = []
        if exceed_up:
            evidence.append(
                f"{node_id} actual {actual:.1f} L/interval exceeds upper expected band "
                f"{upper:.1f} by {residual_lph:.1f} L/h."
            )
        if exceed_lo:
            evidence.append(
                f"{node_id} actual {actual:.1f} L/interval is below lower expected band {lower:.1f}."
            )
        if st.consec_exceed >= settings.persistence_readings:
            evidence.append(
                f"Deviation persisted for {st.consec_exceed} consecutive readings "
                f"(threshold {settings.persistence_readings})."
            )
        if cusum_flag:
            evidence.append(f"CUSUM drift statistic {st.cusum:.2f} exceeds {settings.cusum_threshold}.")
        if night_flow:
            evidence.append("Elevated overnight flow detected in a period of low expected activity.")

        return DetectorResult(
            node_id=node_id, state=state, actual=actual, expected=expected,
            lower=lower, upper=upper, residual=residual, residual_pct=residual_pct,
            excess_lph=max(0.0, residual_lph), persist_count=st.consec_exceed,
            healthy_count=st.consec_healthy, exceed=exceed, cusum=st.cusum,
            cusum_flag=cusum_flag, burst_score=burst_score, night_flow=night_flow,
            evidence=evidence,
        )
