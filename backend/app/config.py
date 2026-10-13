"""Central configuration for AquaTrace.

All units are documented here and used consistently across the backend.

Units
-----
- Flow readings are litres per 15-minute interval (``L/interval``).
  1 L/interval == 4 L/hour.
- Tank capacity and volumes are litres (``L``).
- Cost is expressed per kilolitre (``kL``, 1 kL == 1000 L).
- Timestamps are simulated *hotel-local* naive datetimes, serialised as ISO-8601
  strings with a ``sim-local`` label in the API (no timezone math is performed,
  because the simulator drives its own clock).
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ[name])
    except (KeyError, ValueError):
        return default


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ[name])
    except (KeyError, ValueError):
        return default


def _env_list(name: str, default: tuple[str, ...]) -> tuple[str, ...]:
    raw = os.environ.get(name)
    if not raw:
        return default
    return tuple(item.strip() for item in raw.split(",") if item.strip())


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = BACKEND_DIR / "aquatrace.db"


@dataclass
class Settings:
    """Runtime settings. Overridable with environment variables."""

    # --- Persistence -----------------------------------------------------
    db_path: str = os.environ.get("AQUATRACE_DB", str(DEFAULT_DB_PATH))

    # --- Simulation ------------------------------------------------------
    interval_minutes: int = 15
    # real seconds per tick at speed == 1.0. Higher speed -> smaller value.
    base_real_seconds_per_tick: float = 2.0
    default_seed: int = 42
    # Start of the simulated world. A fixed, deterministic point in time.
    sim_epoch_iso: str = "2026-01-15T00:00:00"
    # Days of healthy synthetic history used to fit the expected-use model.
    history_days: int = 21
    # Seed used *only* for the training history (kept separate from run seed).
    training_seed: int = 20260115
    # Auto-start the simulator loop on boot (useful for hosted demos).
    auto_start: bool = _env_bool("AQUATRACE_AUTOSTART", False)

    # --- Detection -------------------------------------------------------
    persistence_readings: int = 3
    recovery_readings: int = 4
    band_tolerance_pct: float = 0.05      # fraction above the upper band
    min_excess_lph: float = 8.0           # ignore tiny residuals (L/hour)
    critical_excess_pct: float = 0.15     # residual % of expected for CRITICAL
    cusum_threshold: float = 4.0
    cusum_slack: float = 0.5
    mass_balance_tolerance_pct: float = 0.08
    stale_after_readings: int = 2

    # --- Financial / tank assumptions (illustrative, configurable) -------
    cost_per_kilolitre: float = _env_float("AQUATRACE_COST_PER_KL", 150.0)
    currency_symbol: str = os.environ.get("AQUATRACE_CURRENCY", "\u20b9")
    tank_capacity_litres: float = _env_float("AQUATRACE_TANK_CAPACITY", 50000.0)
    tank_reserve_pct: float = 20.0
    tank_start_level_pct: float = 92.0
    # Municipal / tanker replenishment used by the simplified tank model.
    tank_refill_lph: float = 0.0  # 0 => no continuous inflow modelled

    # --- CORS ------------------------------------------------------------
    # Explicit origins via AQUATRACE_CORS_ORIGINS (comma-separated), plus a
    # regex that accepts any Vercel deployment (production and preview URLs).
    cors_origins: tuple[str, ...] = _env_list(
        "AQUATRACE_CORS_ORIGINS",
        (
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ),
    )
    cors_origin_regex: str = os.environ.get(
        "AQUATRACE_CORS_ORIGIN_REGEX",
        r"https://[a-zA-Z0-9-]+\.vercel\.app",
    )

    # --- Bounds ----------------------------------------------------------
    max_telemetry_rows_export: int = 200_000
    max_history_default: int = 400

    # --- Hotel -----------------------------------------------------------
    total_rooms: int = 80
    guests_per_room: float = 2.0


settings = Settings()
