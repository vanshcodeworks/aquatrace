"""Hierarchical localisation of an anomaly.

Traverses from the main inlet toward abnormal child branches using the meter
hierarchy. Stops at the lowest node that the available readings can justify.
Returns supporting evidence, alternatives and unevaluated (missing-data) nodes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

from ..network import ROOTS, NODE_BY_ID, ancestors, children_of
from .detector import DetectorResult, WARNING, CRITICAL, OFFLINE, STALE

_ABNORMAL = {WARNING, CRITICAL}
_UNAVAILABLE = {OFFLINE, STALE}


@dataclass
class Localisation:
    primary_node: str | None
    path: List[str]
    candidates: List[str]
    unevaluated: List[str]
    evidence_quality: str
    note: str
    evidence: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "primary_node": self.primary_node,
            "path": self.path,
            "candidates": self.candidates,
            "unevaluated": self.unevaluated,
            "evidence_quality": self.evidence_quality,
            "note": self.note,
            "evidence": self.evidence,
        }


def localise(results: Dict[str, DetectorResult]) -> Localisation:
    abnormal = {n for n, r in results.items() if r.state in _ABNORMAL}
    unevaluated = sorted(n for n, r in results.items() if r.state in _UNAVAILABLE)

    if not abnormal:
        return Localisation(
            primary_node=None, path=[], candidates=[], unevaluated=unevaluated,
            evidence_quality="n/a", note="No abnormal node is currently above the warning threshold.",
        )

    # deepest abnormal nodes (no abnormal child) form the candidate set
    candidates = sorted(
        n for n in abnormal if not any(c in abnormal for c in children_of(n))
    )
    # prefer flow nodes over the root when a child is also abnormal
    flow_candidates = [c for c in candidates if NODE_BY_ID[c].node_type != "TANK"]
    if flow_candidates:
        candidates = flow_candidates

    # pick the candidate with the largest excess flow as the primary location
    primary = max(candidates, key=lambda n: results[n].excess_lph) if candidates else None

    path: List[str] = []
    if primary:
        path = list(reversed(ancestors(primary))) + [primary]
    else:
        path = list(ROOTS)

    evidence: List[str] = []
    for n in candidates:
        r = results[n]
        evidence.append(
            f"{n}: {r.state}, excess {r.excess_lph:.1f} L/h over {r.persist_count} readings."
        )
    if unevaluated:
        evidence.append(
            "Localisation is less reliable because readings are unavailable at: "
            + ", ".join(unevaluated) + "."
        )

    # evidence quality
    if unevaluated:
        quality = "lower"
        note = "Missing readings reduce confidence; inspect the affected branch directly."
    elif primary and NODE_BY_ID[primary].node_type == "FLOOR":
        quality = "medium"
        note = "Floor-level localisation only; the meter hierarchy does not support room-level precision."
    else:
        quality = "medium"
        note = "Localised to a monitored branch; confirm on site."

    if len(candidates) > 1:
        note += " Multiple branches are abnormal; the largest excess is reported first."

    return Localisation(
        primary_node=primary, path=path, candidates=sorted(candidates),
        unevaluated=unevaluated, evidence_quality=quality, note=note, evidence=evidence,
    )
