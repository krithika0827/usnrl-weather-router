# NOAA API client (fallback) — Owner: Joseph
"""Best-effort NOAA backup used when Open-Meteo fails for a waypoint.

NOAA (api.weather.gov) covers the US only and takes two calls: /points/{lat,lon}
returns a per-location hourly-forecast URL, which is then fetched for the
periods. It reports temperature/wind/humidity but not a precipitation amount in
inches, so `precipitation_in` is left null here. If NOAA can't help (e.g. a
waypoint outside US coverage), the weather fields come back null — partial data
beats failing the whole request.
"""

from __future__ import annotations

import re
from datetime import datetime

import httpx

from app.core.config import settings
from app.models.waypoint import Waypoint
from app.models.weather_data import WaypointForecast

_HEADERS = {"User-Agent": settings.noaa_user_agent, "Accept": "application/geo+json"}


async def fetch_fallback(client: httpx.AsyncClient, wp: Waypoint) -> WaypointForecast:
    """Try NOAA for one waypoint; return null-field forecast if it can't help."""
    null = WaypointForecast(lat=wp.lat, lon=wp.lon, eta=wp.eta)
    try:
        hourly_url = await _hourly_url(client, wp)
        resp = await client.get(hourly_url, headers=_HEADERS)
        resp.raise_for_status()
        periods = resp.json()["properties"]["periods"]
        return _from_periods(wp, periods) if periods else null
    except (httpx.HTTPError, KeyError, ValueError, IndexError):
        return null


async def _hourly_url(client: httpx.AsyncClient, wp: Waypoint) -> str:
    """Resolve a waypoint to its NOAA hourly-forecast URL via the points API."""
    resp = await client.get(f"{settings.noaa_points_url}/{wp.lat},{wp.lon}", headers=_HEADERS)
    resp.raise_for_status()
    return resp.json()["properties"]["forecastHourly"]


def _from_periods(wp: Waypoint, periods: list[dict]) -> WaypointForecast:
    """Map the NOAA hourly period nearest the waypoint's ETA onto our schema."""
    period = min(periods, key=lambda p: abs(datetime.fromisoformat(p["startTime"]) - wp.eta))
    return WaypointForecast(
        lat=wp.lat,
        lon=wp.lon,
        eta=wp.eta,
        temperature_f=_temp_f(period),
        wind_speed_mph=_mph(period.get("windSpeed")),
        wind_direction_deg=_direction_deg(period.get("windDirection")),
        precipitation_in=None,  # NOAA hourly gives probability %, not an inch amount.
        humidity_pct=(period.get("relativeHumidity") or {}).get("value"),
    )


def _temp_f(period: dict) -> float | None:
    """Return the period's temperature in °F (NOAA US forecasts are already °F)."""
    temp = period.get("temperature")
    return float(temp) if temp is not None and period.get("temperatureUnit") == "F" else None


def _mph(wind_speed: str | None) -> float | None:
    """Parse NOAA's textual wind speed (e.g. '10 mph') into a number."""
    match = re.search(r"\d+", wind_speed or "")
    return float(match.group()) if match else None


def _direction_deg(direction: str | None) -> float | None:
    """Convert NOAA cardinal wind direction text to degrees."""
    if direction is None:
        return None

    directions = {
        "N": 0,
        "NNE": 22.5,
        "NE": 45,
        "ENE": 67.5,
        "E": 90,
        "ESE": 112.5,
        "SE": 135,
        "SSE": 157.5,
        "S": 180,
        "SSW": 202.5,
        "SW": 225,
        "WSW": 247.5,
        "W": 270,
        "WNW": 292.5,
        "NW": 315,
        "NNW": 337.5,
    }
    return directions.get(direction.strip().upper())
