"""Choose deterministic or Gemini generation for route weather summaries."""

from __future__ import annotations

import asyncio
import json
import math
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.agents.graph import run_validation
from app.agents.specialized.generator import generate_weather_summary
from app.core.config import settings
from app.models.weather_data import SummaryMode


@dataclass(frozen=True)
class SummaryGenerationResult:
    summary: str
    mode: SummaryMode
    warning: str | None = None


async def generate_summary(
    route: list[Any],
    vehicle_name: str | None,
    route_name: str | None,
    mode: SummaryMode,
) -> SummaryGenerationResult:
    """Generate a summary, falling back to the local generator if Gemini fails."""
    deterministic_summary = lambda: generate_weather_summary(
        route, vehicle_name=vehicle_name, route_name=route_name
    )

    if mode == SummaryMode.deterministic:
        return SummaryGenerationResult(
            summary=deterministic_summary(), mode=SummaryMode.deterministic
        )

    if not settings.gemini_api_key:
        return SummaryGenerationResult(
            summary=deterministic_summary(),
            mode=SummaryMode.deterministic,
            warning="Gemini was selected but GEMINI_API_KEY is not configured; generated the deterministic summary instead.",
        )

    try:
        summary = await asyncio.to_thread(
            _generate_with_gemini, route, vehicle_name, route_name
        )
        return SummaryGenerationResult(summary=summary, mode=SummaryMode.gemini)
    except Exception:
        # Do not expose provider details or secrets to the client. The existing
        # validation graph makes the fallback visible to the user.
        return SummaryGenerationResult(
            summary=deterministic_summary(),
            mode=SummaryMode.deterministic,
            warning="Gemini summary generation was unavailable; generated the deterministic summary instead.",
        )


def _generate_with_gemini(
    route: list[Any], vehicle_name: str | None, route_name: str | None
) -> str:
    from google import genai

    client = genai.Client(api_key=settings.gemini_api_key)
    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=_build_gemini_prompt(route, vehicle_name, route_name),
    )
    summary = (response.text or "").strip()
    if not summary:
        raise ValueError("Gemini returned an empty summary")
    return summary


def _build_gemini_prompt(
    route: list[Any], vehicle_name: str | None, route_name: str | None
) -> str:
    """Ask Gemini for an operational synthesis instead of a waypoint readout."""
    route_data = _route_data(route)
    route_findings = [
        finding
        # The existing critic runs its waypoint-to-waypoint checks only when a
        # summary is present. This neutral internal text activates those route
        # checks while every summary-specific finding is filtered out below.
        for finding in run_validation(route, "Route data analysis.")
        if finding.get("field") != "summary"
    ]
    route_overview = _route_overview(route_data)
    return (
        "Write one concise naval operational weather situation (roughly 90-140 words) "
        "for the supplied route. Use future-focused transit language: introduce the "
        "route duration and distance, describe the dominant expected conditions, then "
        "call out only meaningful changes and operational concerns from ROUTE_FINDINGS. "
        "This should read like a forecaster's narrative briefing, not a table readout. "
        "Summarize ranges and trends; do NOT enumerate every waypoint or repeat each "
        "waypoint's latitude, longitude, ETA, and measurements. Use ROUTE_OVERVIEW as "
        "the primary source; use ROUTE_DATA only when needed to explain a material trend. "
        "Use only supplied facts and numeric values. Do not estimate or invent fronts, "
        "sea state, clouds, gusts, locations, or any other conditions not in the data. "
        "Mention missing values as unavailable. Return only the discussion, with no "
        "heading, bullet list, disclaimer, markdown, or source citations.\n\n"
        f"VEHICLE_NAME: {vehicle_name or 'Not provided'}\n"
        f"ROUTE_NAME: {route_name or 'Not provided'}\n"
        f"ROUTE_OVERVIEW: {json.dumps(route_overview, separators=(',', ':'))}\n"
        f"ROUTE_FINDINGS: {json.dumps(route_findings, separators=(',', ':'))}\n"
        f"ROUTE_DATA: {json.dumps(route_data, separators=(',', ':'))}"
    )


def _route_data(route: list[Any]) -> list[dict[str, Any]]:
    return [
        point.model_dump(mode="json") if hasattr(point, "model_dump") else point
        for point in route
        if isinstance(point, dict) or hasattr(point, "model_dump")
    ]


def _route_overview(route_data: list[dict[str, Any]]) -> dict[str, Any]:
    """Calculate the route-level facts Gemini needs for a concise discussion."""
    overview: dict[str, Any] = {"waypoint_count": len(route_data)}
    if route_data:
        overview["start_eta"] = route_data[0].get("eta")
        overview["end_eta"] = route_data[-1].get("eta")

    duration_hours = _route_duration_hours(route_data)
    if duration_hours is not None:
        overview["duration_hours"] = round(duration_hours, 1)

    distance_miles = _route_distance_miles(route_data)
    if distance_miles is not None:
        overview["distance_miles"] = round(distance_miles, 1)

    metric_fields = {
        "temperature_f": "temperature_f",
        "wind_knots": "wind_speed_knots",
        "humidity_pct": "humidity_pct",
        "precipitation_in": "precipitation_in",
    }
    overview["ranges"] = {
        label: value_range
        for label, field in metric_fields.items()
        if (value_range := _numeric_range(route_data, field)) is not None
    }
    return overview


def _numeric_range(route_data: list[dict[str, Any]], field: str) -> dict[str, float] | None:
    values = [
        float(point[field])
        for point in route_data
        if isinstance(point.get(field), (int, float)) and not isinstance(point.get(field), bool)
    ]
    if not values:
        return None
    return {"min": min(values), "max": max(values)}


def _route_duration_hours(route_data: list[dict[str, Any]]) -> float | None:
    if len(route_data) < 2:
        return None
    try:
        start = _parse_eta(route_data[0].get("eta"))
        end = _parse_eta(route_data[-1].get("eta"))
    except (TypeError, ValueError):
        return None
    return (end - start).total_seconds() / 3600


def _parse_eta(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    raise TypeError("ETA is not a datetime or ISO-8601 string")


def _route_distance_miles(route_data: list[dict[str, Any]]) -> float | None:
    distance = 0.0
    valid_segments = 0
    for start, end in zip(route_data, route_data[1:]):
        try:
            start_lat, start_lon = float(start["lat"]), float(start["lon"])
            end_lat, end_lon = float(end["lat"]), float(end["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        distance += _haversine_miles(start_lat, start_lon, end_lat, end_lon)
        valid_segments += 1
    return distance if valid_segments else None


def _haversine_miles(start_lat: float, start_lon: float, end_lat: float, end_lon: float) -> float:
    radius_miles = 3958.8
    lat_delta = math.radians(end_lat - start_lat)
    lon_delta = math.radians(end_lon - start_lon)
    arc = (
        math.sin(lat_delta / 2) ** 2
        + math.cos(math.radians(start_lat))
        * math.cos(math.radians(end_lat))
        * math.sin(lon_delta / 2) ** 2
    )
    return 2 * radius_miles * math.asin(math.sqrt(arc))
