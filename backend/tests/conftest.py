"""Pytest fixtures. Uses an isolated SQLite DB and a light trained model."""

from __future__ import annotations

import datetime as dt
import os
import pathlib

# --- isolate the database BEFORE importing any app module -------------------
_TEST_DB = pathlib.Path(__file__).parent / "test_aquatrace.db"
for suffix in ("", "-wal", "-shm"):
    p = pathlib.Path(str(_TEST_DB) + suffix)
    if p.exists():
        p.unlink()
os.environ["AQUATRACE_DB"] = str(_TEST_DB)

import pytest  # noqa: E402

from app.config import settings  # noqa: E402
from app.database import init_db  # noqa: E402
from app.ml.expected_use import ExpectedUseModel  # noqa: E402
from app.ml.training import generate_healthy_history  # noqa: E402
from app.runtime import set_model  # noqa: E402
from app.simulator import Simulator  # noqa: E402

TEST_HISTORY_DAYS = 6


@pytest.fixture(scope="session", autouse=True)
def _init_database():
    init_db()


@pytest.fixture(scope="session")
def trained_model() -> ExpectedUseModel:
    start = dt.datetime.fromisoformat(settings.sim_epoch_iso) - dt.timedelta(days=TEST_HISTORY_DAYS)
    df = generate_healthy_history(seed=1234, days=TEST_HISTORY_DAYS, sim_start=start)
    model = ExpectedUseModel().fit(df)
    set_model(model)
    return model


@pytest.fixture
def sim(trained_model) -> Simulator:
    return Simulator(model=trained_model)
