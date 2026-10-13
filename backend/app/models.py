"""SQLAlchemy ORM entities for AquaTrace."""

from __future__ import annotations

import datetime as dt

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from .database import Base


class SimulationSession(Base):
    __tablename__ = "simulation_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    started_at = Column(DateTime, default=dt.datetime.utcnow, nullable=False)
    scenario = Column(String(64), default="normal", nullable=False)
    seed = Column(Integer, default=42, nullable=False)
    status = Column(String(16), default="STOPPED", nullable=False)
    speed = Column(Float, default=1.0, nullable=False)
    sim_time = Column(DateTime, nullable=False)
    model_name = Column(String(64), nullable=True)


class TelemetryReading(Base):
    __tablename__ = "telemetry_readings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("simulation_sessions.id"), index=True)
    node_id = Column(String(32), index=True, nullable=False)
    sim_time = Column(DateTime, index=True, nullable=False)

    # litres per 15-minute interval
    actual_flow = Column(Float, nullable=True)          # None => missing reading
    expected_flow = Column(Float, nullable=True)
    lower_bound = Column(Float, nullable=True)
    upper_bound = Column(Float, nullable=True)
    residual = Column(Float, nullable=True)

    # operational context (features)
    occupancy_rooms = Column(Float, nullable=True)
    meals_served = Column(Float, nullable=True)
    laundry_kg = Column(Float, nullable=True)

    # quality + detection
    sensor_state = Column(String(16), default="OK", nullable=False)
    detector_state = Column(String(16), default="HEALTHY", nullable=False)
    # evaluation-only ground truth (never used as an inference feature)
    fault_label = Column(String(32), nullable=True)


class InjectedFault(Base):
    __tablename__ = "injected_faults"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("simulation_sessions.id"), index=True)
    node_id = Column(String(32), nullable=False)
    fault_type = Column(String(32), nullable=False)
    intensity_lph = Column(Float, default=0.0, nullable=False)
    start_sim_time = Column(DateTime, nullable=False)
    end_sim_time = Column(DateTime, nullable=True)
    onset = Column(String(16), default="sudden", nullable=False)  # sudden|gradual
    intermittent = Column(Boolean, default=False, nullable=False)
    duration_minutes = Column(Integer, nullable=True)
    status = Column(String(16), default="ACTIVE", nullable=False)  # ACTIVE|REMOVED
    seed = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=dt.datetime.utcnow, nullable=False)


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("simulation_sessions.id"), index=True)
    node_id = Column(String(32), nullable=False)
    severity = Column(String(16), nullable=False)
    cause = Column(String(48), nullable=False)
    confidence = Column(Float, default=0.0, nullable=False)
    status = Column(String(20), default="OPEN", nullable=False)

    created_sim_time = Column(DateTime, nullable=False)
    updated_sim_time = Column(DateTime, nullable=True)
    resolved_sim_time = Column(DateTime, nullable=True)

    actual_flow = Column(Float, nullable=True)
    expected_flow = Column(Float, nullable=True)
    upper_bound = Column(Float, nullable=True)
    excess_flow_lph = Column(Float, default=0.0, nullable=False)
    duration_minutes = Column(Float, default=0.0, nullable=False)
    excess_volume_litres = Column(Float, default=0.0, nullable=False)
    estimated_cost = Column(Float, default=0.0, nullable=False)

    sensor_quality = Column(String(16), default="OK", nullable=False)
    evidence = Column(Text, nullable=True)          # JSON
    recommendation = Column(Text, nullable=True)
    auto_recovered = Column(Boolean, default=False, nullable=False)
    notes = Column(Text, nullable=True)

    events = relationship(
        "IncidentEvent", back_populates="incident", cascade="all, delete-orphan"
    )


class IncidentEvent(Base):
    __tablename__ = "incident_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    incident_id = Column(Integer, ForeignKey("incidents.id"), index=True)
    sim_time = Column(DateTime, nullable=False)
    event_type = Column(String(32), nullable=False)
    message = Column(Text, nullable=False)

    incident = relationship("Incident", back_populates="events")


class Recommendation(Base):
    __tablename__ = "recommendations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("simulation_sessions.id"), index=True)
    incident_id = Column(Integer, ForeignKey("incidents.id"), nullable=True)
    node_id = Column(String(32), nullable=False)
    priority = Column(Float, default=0.0, nullable=False)
    severity = Column(String(16), nullable=False)
    action = Column(Text, nullable=False)
    reason = Column(Text, nullable=False)
    excess_flow_lph = Column(Float, default=0.0, nullable=False)
    estimated_cost = Column(Float, default=0.0, nullable=False)
    created_sim_time = Column(DateTime, nullable=False)


class BenchmarkRun(Base):
    __tablename__ = "benchmark_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    created_at = Column(DateTime, default=dt.datetime.utcnow, nullable=False)
    status = Column(String(16), default="RUNNING", nullable=False)  # RUNNING|DONE|FAILED
    seeds = Column(String(64), nullable=False)
    params = Column(Text, nullable=True)      # JSON
    metrics = Column(Text, nullable=True)     # JSON
    counts = Column(Text, nullable=True)      # JSON
    composition = Column(Text, nullable=True)  # JSON
    error = Column(Text, nullable=True)


class ModelMetadata(Base):
    __tablename__ = "model_metadata"

    id = Column(Integer, primary_key=True, autoincrement=True)
    model_name = Column(String(48), nullable=False)   # LIGHTGBM_QUANTILE | HISTORICAL_STATS_FALLBACK
    trained_at = Column(DateTime, default=dt.datetime.utcnow, nullable=False)
    n_samples = Column(Integer, default=0, nullable=False)
    features = Column(Text, nullable=True)   # JSON
    metrics = Column(Text, nullable=True)    # JSON
    active = Column(Boolean, default=True, nullable=False)
    notes = Column(Text, nullable=True)
