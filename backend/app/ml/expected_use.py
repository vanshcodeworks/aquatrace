"""Expected-use model: LightGBM quantile regression with a documented fallback.

Outputs the P10 / P50 / P90 expected consumption band (litres per interval).

If LightGBM cannot be installed or training fails, the model transparently
degrades to a per-node, per-hour historical-quantile estimator. The active
model name is always reported truthfully via ``/api/ai/status``.
"""

from __future__ import annotations

from typing import Dict, Optional, Tuple

import numpy as np
import pandas as pd

from .features import CATEGORICAL_FEATURES, FEATURE_COLUMNS, feature_row


class ExpectedUseModel:
    def __init__(self) -> None:
        self.model_name: str = "UNTRAINED"
        self.fitted: bool = False
        self.n_samples: int = 0
        self.fallback_reason: Optional[str] = None
        self.train_metrics: Dict[str, float] = {}
        self._models: Dict[float, object] = {}
        self._fallback: Dict[Tuple[str, int], Tuple[float, float, float]] = {}
        self._node_fallback: Dict[str, Tuple[float, float, float]] = {}
        self._global: Tuple[float, float, float] = (0.0, 1.0, 2.0)

    # -- fitting -----------------------------------------------------------
    def fit(self, df: pd.DataFrame) -> "ExpectedUseModel":
        self.n_samples = int(len(df))
        try:
            import lightgbm as lgb  # noqa: F401

            X = df[FEATURE_COLUMNS].astype(float)
            y = df["actual"].astype(float)
            for alpha in (0.1, 0.5, 0.9):
                model = lgb.LGBMRegressor(
                    objective="quantile",
                    alpha=alpha,
                    n_estimators=140,
                    num_leaves=31,
                    learning_rate=0.08,
                    min_child_samples=20,
                    subsample=0.9,
                    colsample_bytree=0.9,
                    random_state=7,
                    n_jobs=2,
                    verbose=-1,
                )
                model.fit(X, y, categorical_feature=CATEGORICAL_FEATURES)
                self._models[alpha] = model
            # quick healthy-fit WAPE on training data
            pred = self._models[0.5].predict(X)
            denom = float(np.abs(y).sum()) or 1.0
            self.train_metrics["wape"] = float(np.abs(y.to_numpy() - pred).sum() / denom)
            self.model_name = "LIGHTGBM_QUANTILE"
        except Exception as exc:  # pragma: no cover - depends on environment
            self.fallback_reason = f"{type(exc).__name__}: {exc}"
            self._fit_fallback(df)
            self.model_name = "HISTORICAL_STATS_FALLBACK"
        self.fitted = True
        return self

    def _fit_fallback(self, df: pd.DataFrame) -> None:
        self._fallback = {}
        self._node_fallback = {}
        for (node_id, hour), grp in df.groupby(["node_id", "hour"]):
            q = grp["actual"].quantile([0.1, 0.5, 0.9])
            self._fallback[(node_id, int(hour))] = (float(q[0.1]), float(q[0.5]), float(q[0.9]))
        for node_id, grp in df.groupby("node_id"):
            q = grp["actual"].quantile([0.1, 0.5, 0.9])
            self._node_fallback[node_id] = (float(q[0.1]), float(q[0.5]), float(q[0.9]))
        q = df["actual"].quantile([0.1, 0.5, 0.9])
        self._global = (float(q[0.1]), float(q[0.5]), float(q[0.9]))

    # -- prediction --------------------------------------------------------
    def predict_one(self, node_id, features, lags) -> Tuple[float, float, float]:
        if not self.fitted:
            v = 1.0
            return (0.0, v, v * 1.5)
        if self.model_name == "LIGHTGBM_QUANTILE":
            row = feature_row(node_id, features, lags)
            X = pd.DataFrame([row])[FEATURE_COLUMNS].astype(float)
            lo = float(self._models[0.1].predict(X)[0])
            mid = float(self._models[0.5].predict(X)[0])
            hi = float(self._models[0.9].predict(X)[0])
            lo, mid, hi = sorted((max(0.0, lo), max(0.0, mid), max(0.0, hi)))
            return (lo, mid, hi)
        key = (node_id, int(features.hour))
        if key in self._fallback:
            return self._fallback[key]
        if node_id in self._node_fallback:
            return self._node_fallback[node_id]
        return self._global

    def describe(self) -> dict:
        return {
            "model_name": self.model_name,
            "fitted": self.fitted,
            "n_samples": self.n_samples,
            "features": FEATURE_COLUMNS,
            "train_metrics": self.train_metrics,
            "fallback_reason": self.fallback_reason,
        }
