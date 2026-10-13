"""Pydantic request/response schemas."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator


class HealthResponse(BaseModel):
    status: str
    data_mode: str
    model_name: str
    version: str
    db: str


class SpeedRequest(BaseModel):
    speed: float = Field(..., gt=0, le=1000)


class ResetRequest(BaseModel):
    seed: Optional[int] = Field(default=None, ge=0, le=2**31 - 1)
    scenario: Optional[str] = None
    start_iso: Optional[str] = None


class ScenarioRequest(BaseModel):
    scenario: str
    node_id: Optional[str] = None
    intensity_lph: Optional[float] = Field(default=None, ge=0)
    onset: Optional[str] = None
    duration_minutes: Optional[int] = Field(default=None, gt=0)
    intermittent: bool = False
    params: Optional[Dict[str, float]] = None

    @field_validator("onset")
    @classmethod
    def _onset(cls, v):
        if v is not None and v not in ("sudden", "gradual"):
            raise ValueError("onset must be 'sudden' or 'gradual'")
        return v


class InjectFaultRequest(BaseModel):
    fault_type: str
    node_id: str
    intensity_lph: float = Field(default=0.0, ge=0)
    onset: str = "sudden"
    duration_minutes: Optional[int] = Field(default=None, gt=0)
    intermittent: bool = False
    start_delay_intervals: int = Field(default=0, ge=0, le=10000)
    params: Optional[Dict[str, float]] = None

    @field_validator("onset")
    @classmethod
    def _onset(cls, v):
        if v not in ("sudden", "gradual"):
            raise ValueError("onset must be 'sudden' or 'gradual'")
        return v


class RemoveFaultRequest(BaseModel):
    fault_db_id: Optional[int] = None
    node_id: Optional[str] = None


class IncidentActionRequest(BaseModel):
    note: Optional[str] = None


class BenchmarkRequest(BaseModel):
    seeds: List[int] = Field(default_factory=lambda: [42, 43])
    days: int = Field(default=4, ge=1, le=14)

    @field_validator("seeds")
    @classmethod
    def _seeds(cls, v):
        if not v:
            raise ValueError("at least one seed is required")
        if len(v) > 6:
            raise ValueError("at most 6 seeds")
        return v


class MessageResponse(BaseModel):
    ok: bool = True
    detail: Optional[str] = None
    data: Optional[Any] = None
