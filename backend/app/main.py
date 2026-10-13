"""FastAPI application entrypoint for AquaTrace."""

from __future__ import annotations

import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .config import settings
from .database import init_db
from .ml.expected_use import ExpectedUseModel
from .routers import ai as ai_router
from .routers import benchmarks, core, export, incidents, simulation, telemetry
from .runtime import get_simulator, set_model
from .services import benchmark_service


def _train_safely() -> ExpectedUseModel:
    """Train the expected-use model; degrade gracefully if anything fails."""
    try:
        return ai_router.train_and_install()
    except Exception as exc:  # pragma: no cover
        model = ExpectedUseModel()
        model.model_name = "UNTRAINED_FALLBACK"
        model.fallback_reason = f"{type(exc).__name__}: {exc}"
        set_model(model)
        return model


def create_app(train_on_startup: bool = True) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        init_db()
        if train_on_startup:
            model = _train_safely()
        else:
            model = ExpectedUseModel()
            model.model_name = "UNTRAINED"
            set_model(model)

        benchmark_service.set_model(model)
        sim = get_simulator()
        sim.model = model

        thread = threading.Thread(target=sim.loop_forever, name="aquatrace-loop", daemon=True)
        thread.start()
        app.state.sim_thread = thread
        yield
        sim.status = "STOPPED"

    app = FastAPI(
        title="AquaTrace API",
        version=__version__,
        description="AI water-wastage intelligence for hotels — SIMULATED telemetry.",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(core.router)
    app.include_router(simulation.router)
    app.include_router(telemetry.router)
    app.include_router(ai_router.router)
    app.include_router(incidents.router)
    app.include_router(benchmarks.router)
    app.include_router(export.router)

    @app.get("/")
    def root():
        return {
            "name": "AquaTrace",
            "version": __version__,
            "data_mode": "SIMULATED",
            "docs": "/docs",
            "health": "/api/health",
        }

    return app


app = create_app(train_on_startup=True)
