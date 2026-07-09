# Forecast triggering endpoints — Owner: Joseph
"""POST /api/v1/forecast.

Validates a route and returns a forecast product for each waypoint, with real
weather fetched from Open-Meteo (see services/open_meteo.py). Weather fields
degrade to null on upstream failure rather than failing the whole request.

`summary` (Krithika) is generated from the route weather table.
`validation` (Ryan) runs the validation workflow against the route data and summary.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from app.agents.graph import run_validation
from app.agents.specialized.generator import generate_weather_summary
from app.models.waypoint import RouteRequest
from app.models.weather_data import ForecastResponse, WaypointForecast
from app.services import open_meteo

router = APIRouter()


class SummaryRequest(BaseModel):
    """Current editable route table sent by the frontend for summary refresh."""

    route: list[WaypointForecast]
    vehicle_name: str | None = None
    route_name: str | None = None


@router.post("/forecast", response_model=ForecastResponse)
async def create_forecast(request: RouteRequest) -> ForecastResponse:
    """Validate a route and return a forecast product for each waypoint."""
    route = await open_meteo.fetch_forecasts(request.waypoints)

    summary = generate_weather_summary(
        route,
        vehicle_name=request.vehicle_name,
        route_name=request.route_name,
    )
    validation = run_validation(route, summary)

    return ForecastResponse(route=route, summary=summary, validation=validation)


@router.post("/summary", response_model=ForecastResponse)
async def create_summary(request: SummaryRequest) -> ForecastResponse:
    """Generate a summary from already-loaded or manually edited weather data."""
    route = request.route
    summary = generate_weather_summary(
        route,
        vehicle_name=request.vehicle_name,
        route_name=request.route_name,
    )
    validation = run_validation(route, summary)

    return ForecastResponse(route=route, summary=summary, validation=validation)
