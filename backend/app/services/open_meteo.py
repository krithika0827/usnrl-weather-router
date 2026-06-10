# Async parallel weather data fetching (Open-Meteo) — Owner: Joseph
"""Fetches real weather for each waypoint from the Open-Meteo forecast API.

Open-Meteo returns native US units on request (°F, mph, inches), so no manual
unit conversion is needed. Requests run in parallel (one per waypoint). If a
fetch fails, that waypoint's weather fields come back null rather than failing
the whole request — graceful degradation (NOAA fallback is added in Phase 3).
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import httpx

from app.core.config import settings
from app.models.waypoint import Waypoint
from app.models.weather_data import WaypointForecast
from app.services import noaa

_HOURLY_FIELDS = "temperature_2m,wind_speed_10m,precipitation,relative_humidity_2m"


async def fetch_forecasts(waypoints: list[Waypoint]) -> list[WaypointForecast]:
    """Fetch weather for every waypoint concurrently, preserving input order."""
    async with httpx.AsyncClient(timeout=settings.request_timeout_s) as client:
        tasks = [_fetch_one(client, wp) for wp in waypoints]
        return await asyncio.gather(*tasks)


async def _fetch_one(client: httpx.AsyncClient, wp: Waypoint) -> WaypointForecast:
    """Fetch one waypoint's weather; return null fields if the call fails."""
    try:
        resp = await client.get(settings.open_meteo_url, params=_params(wp))
        resp.raise_for_status()
        return _from_hourly(wp, resp.json())
    except (httpx.HTTPError, KeyError, ValueError):
        # Open-Meteo failed: fall back to NOAA (which nulls out if it can't help).
        return await noaa.fetch_fallback(client, wp)


def _params(wp: Waypoint) -> dict:
    """Build the Open-Meteo query for this waypoint, requesting native US units."""
    eta_date = wp.eta.astimezone(timezone.utc).date().isoformat()
    return {
        "latitude": wp.lat,
        "longitude": wp.lon,
        "hourly": _HOURLY_FIELDS,
        "temperature_unit": "fahrenheit",
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "timezone": "UTC",
        "start_date": eta_date,
        "end_date": eta_date,
    }


def _from_hourly(wp: Waypoint, data: dict) -> WaypointForecast:
    """Map the Open-Meteo hourly arrays onto the waypoint at its ETA hour."""
    hourly = data["hourly"]
    idx = _nearest_index(wp.eta, hourly["time"])
    return WaypointForecast(
        lat=wp.lat,
        lon=wp.lon,
        eta=wp.eta,
        temperature_f=_at(hourly, "temperature_2m", idx),
        wind_speed_mph=_at(hourly, "wind_speed_10m", idx),
        precipitation_in=_at(hourly, "precipitation", idx),
        humidity_pct=_round_int(_at(hourly, "relative_humidity_2m", idx)),
    )


def _nearest_index(eta: datetime, times: list[str]) -> int:
    """Index of the hourly timestamp closest to the waypoint's ETA."""
    target = eta.astimezone(timezone.utc).replace(tzinfo=None)
    parsed = [datetime.fromisoformat(t) for t in times]
    return min(range(len(parsed)), key=lambda i: abs(parsed[i] - target))


def _at(hourly: dict, key: str, idx: int):
    """Safely read one hourly field at the matched index, or None if absent."""
    values = hourly.get(key) or []
    return values[idx] if 0 <= idx < len(values) else None


def _round_int(value):
    """Round a float to an int (humidity %), passing None through unchanged."""
    return int(round(value)) if value is not None else None
