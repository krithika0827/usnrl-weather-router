# Forecast triggering endpoints — Owner: Joseph
"""POST /api/v1/forecast.

Validates a route and returns a forecast product for each waypoint, with real
weather fetched from Open-Meteo (see services/open_meteo.py). Weather fields
degrade to null on upstream failure rather than failing the whole request.

`summary` is generated from the route weather table.
`validation` runs the validation workflow against the route data and summary.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from app.agents.graph import run_validation_with_summary_fallback
from app.models.waypoint import RouteRequest
from app.models.weather_data import ForecastResponse, SummaryMode, WaypointForecast
from app.services import open_meteo
from app.services.summary_generator import generate_summary

router = APIRouter()


class SummaryRequest(BaseModel):
    """Current editable route table sent by the frontend for summary refresh."""

    route: list[WaypointForecast]
    vehicle_name: str | None = None
    route_name: str | None = None
    summary_mode: SummaryMode = SummaryMode.deterministic


@router.post("/forecast", response_model=ForecastResponse)
async def create_forecast(request: RouteRequest) -> ForecastResponse:
    """Validate a route and return a forecast product for each waypoint."""
    route = await open_meteo.fetch_forecasts(request.waypoints)

    generation = await generate_summary(
        route,
        request.vehicle_name,
        request.route_name,
        request.summary_mode,
    )

    validation_result = run_validation_with_summary_fallback(
        route,
        generation.summary,
        generation.mode,
        request.vehicle_name,
        request.route_name,
    )

    validation = validation_result["validation"]

    if generation.warning:
        validation.insert(0, {
            "severity": "warning",
            "field": "summary",
            "message": generation.warning,
        })

    return ForecastResponse(
        route=route,
        summary=validation_result["summary"],
        summary_mode=validation_result["summary_mode"],
        validation=validation,
    )


@router.post("/summary", response_model=ForecastResponse)
async def create_summary(request: SummaryRequest) -> ForecastResponse:
    """Generate a summary from already-loaded or manually edited weather data."""
    route = request.route

    generation = await generate_summary(
        route,
        request.vehicle_name,
        request.route_name,
        request.summary_mode,
    )

    validation_result = run_validation_with_summary_fallback(
        route,
        generation.summary,
        generation.mode,
        request.vehicle_name,
        request.route_name,
    )

    validation = validation_result["validation"]

    if generation.warning:
        validation.insert(0, {
            "severity": "warning",
            "field": "summary",
            "message": generation.warning,
        })

    return ForecastResponse(
        route=route,
        summary=validation_result["summary"],
        summary_mode=validation_result["summary_mode"],
        validation=validation,
    )