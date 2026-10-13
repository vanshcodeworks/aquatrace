"""CSV / JSON export endpoints."""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

from ..services import export_service

router = APIRouter(prefix="/api/export", tags=["export"])


@router.get("/telemetry", response_class=PlainTextResponse)
def export_telemetry(session_id: int | None = None, node_id: str | None = None):
    csv_text = export_service.telemetry_csv(session_id=session_id, node_id=node_id)
    return PlainTextResponse(
        csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=aquatrace_telemetry.csv"},
    )


@router.get("/incidents", response_class=PlainTextResponse)
def export_incidents(session_id: int | None = None, format: str = "csv"):
    if format == "json":
        return PlainTextResponse(
            __import__("json").dumps(export_service.incidents_json(session_id=session_id), indent=2),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=aquatrace_incidents.json"},
        )
    return PlainTextResponse(
        export_service.incidents_csv(session_id=session_id),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=aquatrace_incidents.csv"},
    )
