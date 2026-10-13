"""Process-wide singletons (simulator + trained model)."""

from __future__ import annotations

import threading
from typing import Optional

from .ml.expected_use import ExpectedUseModel
from .simulator import Simulator

_sim: Optional[Simulator] = None
_model: Optional[ExpectedUseModel] = None
_lock = threading.Lock()


def get_model() -> Optional[ExpectedUseModel]:
    return _model


def set_model(model: ExpectedUseModel) -> None:
    global _model
    _model = model


def get_simulator() -> Simulator:
    global _sim
    if _sim is None:
        with _lock:
            if _sim is None:
                _sim = Simulator(model=_model)
    return _sim


def set_simulator(sim: Simulator) -> None:
    global _sim
    _sim = sim
