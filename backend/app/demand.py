"""Physically-plausible, seeded water-demand generation.

Everything here is deterministic for a given ``numpy.random.Generator`` seed so
scenarios are reproducible. Units: litres per 15-minute interval for demand,
litres per hour for hourly profiles.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from typing import Dict

import numpy as np

from .network import LEAF_NODES

INTERVALS_PER_HOUR = 4


def _norm(arr):
    a = np.asarray(arr, dtype=float)
    return a / a.sum()


# litres per hour per *occupied room* (scaled to a realistic resort total)
_ROOM_LPH_RAW = [
    4, 3, 3, 3, 6, 18, 42, 55, 50, 32, 24, 22,
    26, 24, 20, 20, 24, 30, 36, 34, 26, 18, 10, 6,
]
ROOM_LITRES_PER_HOUR = np.asarray(_ROOM_LPH_RAW, dtype=float) * 0.5  # ~268 L/room/day

# fraction of a day's meals per hour (breakfast / lunch / dinner peaks)
MEAL_WEIGHT = _norm([
    0, 0, 0, 0, 0, 0, 5, 12, 14, 8, 2, 2,
    8, 10, 6, 1, 1, 2, 3, 11, 12, 6, 1, 0,
])

# fraction of a day's laundry per hour (working hours)
LAUNDRY_WEIGHT = _norm([
    0, 0, 0, 0, 0, 0, 2, 4, 8, 10, 10, 8,
    7, 8, 8, 8, 7, 5, 3, 2, 1, 0, 0, 0,
])

LITRES_PER_MEAL = 22.0
LITRES_PER_KG_LAUNDRY = 12.0
KG_LAUNDRY_PER_ROOM_DAY = 2.0
MEALS_PER_GUEST_DAY = 2.2


@dataclass
class OperationalFeatures:
    sim_time: dt.datetime
    hour: int
    dow: int
    occupancy_rooms: float
    guests: float
    meals_served: float          # this interval
    laundry_kg: float            # this interval
    floor_occupancy: Dict[str, float] = field(default_factory=dict)


def room_lph(hour: int) -> float:
    return float(ROOM_LITRES_PER_HOUR[hour % 24])


def leaf_truth(features: OperationalFeatures) -> Dict[str, float]:
    """Noise-free demand (L/interval) for each leaf node."""
    demand: Dict[str, float] = {}
    for node_id in LEAF_NODES:
        if node_id.startswith("floor_"):
            occ = features.floor_occupancy.get(node_id, 0.0)
            demand[node_id] = occ * room_lph(features.hour) / INTERVALS_PER_HOUR
        elif node_id == "kitchen":
            demand[node_id] = features.meals_served * LITRES_PER_MEAL
        elif node_id == "laundry":
            demand[node_id] = features.laundry_kg * LITRES_PER_KG_LAUNDRY
    return demand


class FeatureGenerator:
    """Generates a coherent operational-feature stream for a session."""

    def __init__(
        self,
        rng: np.random.Generator,
        total_rooms: int,
        guests_per_room: float = 2.0,
        floor_rooms: Dict[str, int] | None = None,
    ) -> None:
        self.rng = rng
        self.total_rooms = total_rooms
        self.guests_per_room = guests_per_room
        self.floor_rooms = floor_rooms or {
            "floor_a1": 20, "floor_a2": 20, "floor_b1": 20, "floor_b2": 20
        }
        self._occupancy = total_rooms * 0.6

    def _advance_occupancy(self, dow: int) -> float:
        # weekend uplift + slow random walk for check-in / check-out drift
        weekend = 1.0 + (0.14 if dow in (4, 5) else 0.0)
        target = self.total_rooms * 0.6 * weekend
        self._occupancy += (target - self._occupancy) * 0.15
        self._occupancy += self.rng.normal(0, self.total_rooms * 0.02)
        lo = int(self.total_rooms * 0.30)
        return float(np.clip(round(self._occupancy), lo, self.total_rooms))

    def features_at(self, sim_time: dt.datetime) -> OperationalFeatures:
        hour = sim_time.hour
        dow = sim_time.weekday()
        occ = self._advance_occupancy(dow)
        guests = occ * self.guests_per_room

        meals = guests * MEALS_PER_GUEST_DAY * float(MEAL_WEIGHT[hour]) / INTERVALS_PER_HOUR
        meals *= max(0.0, 1.0 + self.rng.normal(0, 0.05))

        laundry = occ * KG_LAUNDRY_PER_ROOM_DAY * float(LAUNDRY_WEIGHT[hour]) / INTERVALS_PER_HOUR
        laundry *= max(0.0, 1.0 + self.rng.normal(0, 0.08))

        # distribute occupied rooms across floors by capacity
        total_floor_rooms = sum(self.floor_rooms.values())
        floor_occ: Dict[str, float] = {}
        remaining = occ
        ids = list(self.floor_rooms.keys())
        for i, nid in enumerate(ids):
            if i == len(ids) - 1:
                share = remaining
            else:
                share = round(occ * self.floor_rooms[nid] / total_floor_rooms)
                remaining -= share
            frac = share / max(1, self.floor_rooms[nid])
            frac = float(np.clip(frac + self.rng.normal(0, 0.04), 0.0, 1.0))
            floor_occ[nid] = frac * self.floor_rooms[nid]

        return OperationalFeatures(
            sim_time=sim_time,
            hour=hour,
            dow=dow,
            occupancy_rooms=occ,
            guests=guests,
            meals_served=max(0.0, meals),
            laundry_kg=max(0.0, laundry),
            floor_occupancy=floor_occ,
        )
