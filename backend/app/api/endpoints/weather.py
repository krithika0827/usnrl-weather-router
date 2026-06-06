# Forecast triggering endpoints — Owner: Joseph
"""POST /api/v1/forecast.

Validates a route and returns a forecast product for each waypoint, with real
weather fetched from Open-Meteo (see services/open_meteo.py). Weather fields
degrade to null on upstream failure rather than failing the whole request.

`summary` (Krithika) and `validation` (Ryan) are intentionally stubbed null/[].
"""

from fastapi import APIRouter

from app.models.waypoint import RouteRequest
from app.models.weather_data import ForecastResponse
from app.services import open_meteo

router = APIRouter()


@router.post("/forecast", response_model=ForecastResponse)
async def create_forecast(request: RouteRequest) -> ForecastResponse:
    """Validate a route and return a forecast product for each waypoint."""
    route = await open_meteo.fetch_forecasts(request.waypoints)
    return ForecastResponse(route=route, summary=None, validation=[])
