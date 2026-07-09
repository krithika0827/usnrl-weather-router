# Narrative generation agent - Owners: Krithika (prompt) + Ryan (wiring)
"""Create a concise operational weather discussion from route weather data.

This module keeps the LLM boundary small: route data comes in as structured
values, and the generator returns one summary string that the critic can check.
The current implementation is deterministic so tests and demos work without an
API key; it is also written in the same format an LLM prompt should produce.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any


def generate_weather_summary(route: list[Any]) -> str:
    """Generate an operational route forecast discussion."""
    points = [_point_to_dict(point) for point in route]
    points = [point for point in points if point]

    if not points:
        return (
            "No waypoint weather data is available. A forecaster should review "
            "the route input and rerun the forecast before dissemination."
        )

    missing_fields = _missing_weather_fields(points)
    available_points = [
        point
        for point in points
        if any(_is_number(point.get(field)) for field in WEATHER_FIELDS)
    ]

    if not available_points:
        return (
            f"Route weather guidance covers {len(points)} waypoint(s), but no "
            "temperature, wind, humidity, or precipitation values are available. "
            "Use caution and verify the upstream weather source before using this "
            "product operationally."
        )

    temps = _values(available_points, "temperature_f")
    winds = _values(available_points, "wind_speed_mph")
    humidity = _values(available_points, "humidity_pct")
    precip = _values(available_points, "precipitation_in")

    start = available_points[0]
    end = available_points[-1]
    summary_parts = [
        (
            "Route guidance covers "
            f"{len(points)} waypoint(s) from {_format_eta(start.get('eta'))} "
            f"near {_format_lat_lon(start)} to {_format_eta(end.get('eta'))} "
            f"near {_format_lat_lon(end)}."
        ),
        _temperature_sentence(temps),
        _wind_sentence(winds),
        _precipitation_sentence(precip),
        _humidity_sentence(humidity),
        _hazard_sentence(temps, winds, precip, missing_fields),
    ]

    if missing_fields:
        summary_parts.append(
            "Some waypoint metrics are unavailable, so the narrative should be "
            "reviewed against the table before release."
        )

    return " ".join(part for part in summary_parts if part)


WEATHER_FIELDS = (
    "temperature_f",
    "wind_speed_mph",
    "precipitation_in",
    "humidity_pct",
)


def _point_to_dict(point: Any) -> dict:
    if hasattr(point, "model_dump"):
        return point.model_dump()
    if isinstance(point, dict):
        return point
    return {}


def _missing_weather_fields(points: list[dict]) -> set[str]:
    missing = set()
    for point in points:
        for field in WEATHER_FIELDS:
            if point.get(field) is None:
                missing.add(field)
    return missing


def _values(points: list[dict], field: str) -> list[float]:
    return [float(point[field]) for point in points if _is_number(point.get(field))]


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _format_eta(value: Any) -> str:
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M UTC")
    if isinstance(value, str):
        return value.replace("T", " ").replace("Z", " UTC")
    return "the requested ETA"


def _format_lat_lon(point: dict) -> str:
    lat = point.get("lat")
    lon = point.get("lon")
    if _is_number(lat) and _is_number(lon):
        return f"{float(lat):.2f}, {float(lon):.2f}"
    return "the route"


def _format_range(values: list[float], unit: str, decimals: int = 1) -> str:
    low = min(values)
    high = max(values)
    separator = "" if unit == "%" else " "
    if _has_no_range(values):
        return f"{low:.{decimals}f}{separator}{unit}"
    return f"{low:.{decimals}f} to {high:.{decimals}f}{separator}{unit}"


def _has_no_range(values: list[float]) -> bool:
    return abs(min(values) - max(values)) < 0.05


def _temperature_sentence(temps: list[float]) -> str:
    if not temps:
        return "Temperature guidance is unavailable for this route."

    maximum = max(temps)
    if maximum >= 95:
        descriptor = "hot"
    elif maximum >= 80:
        descriptor = "warm"
    elif min(temps) <= 32:
        descriptor = "freezing"
    elif min(temps) <= 50:
        descriptor = "cool"
    else:
        descriptor = "mild"

    if _has_no_range(temps):
        return f"Temperatures are expected to be {descriptor} near {_format_range(temps, 'F')}."

    return f"Temperatures are expected to be {descriptor}, ranging from {_format_range(temps, 'F')}."


def _wind_sentence(winds: list[float]) -> str:
    if not winds:
        return "Wind guidance is unavailable for this route."

    maximum = max(winds)
    if maximum >= 35:
        descriptor = "high winds"
    elif maximum >= 20:
        descriptor = "breezy winds"
    else:
        descriptor = "light winds"

    if _has_no_range(winds):
        return f"Wind conditions indicate {descriptor} near {_format_range(winds, 'mph')}."

    return f"Wind conditions indicate {descriptor}, with speeds from {_format_range(winds, 'mph')}."


def _precipitation_sentence(precip: list[float]) -> str:
    if not precip:
        return "Precipitation guidance is unavailable for this route."

    total = sum(precip)
    maximum = max(precip)
    if total <= 0:
        return "No measurable accumulation is indicated at the route waypoints."

    if maximum >= 0.25:
        intensity = "moderate precipitation"
    else:
        intensity = "light precipitation"

    if _has_no_range(precip):
        return (
            f"{intensity.capitalize()} is possible along the route, with waypoint "
            f"amounts near {_format_range(precip, 'in', decimals=2)}."
        )

    return (
        f"{intensity.capitalize()} is possible along the route, with waypoint "
        f"amounts from {_format_range(precip, 'in', decimals=2)}."
    )


def _humidity_sentence(humidity: list[float]) -> str:
    if not humidity:
        return "Humidity guidance is unavailable for this route."

    if _has_no_range(humidity):
        return f"Relative humidity is near {_format_range(humidity, '%', decimals=0)}."

    return f"Relative humidity ranges from {_format_range(humidity, '%', decimals=0)}."


def _hazard_sentence(
    temps: list[float],
    winds: list[float],
    precip: list[float],
    missing_fields: set[str],
) -> str:
    hazards = []
    if winds and max(winds) >= 35:
        hazards.append("high wind impacts")
    if precip and max(precip) >= 0.25:
        hazards.append("wet travel conditions")
    if temps and min(temps) <= 32:
        hazards.append("freezing temperatures")
    if temps and max(temps) >= 95:
        hazards.append("heat stress")

    if hazards:
        return "Primary forecast concerns are " + ", ".join(hazards) + "."
    if missing_fields:
        return "No specific weather hazard is identified from the available metrics."
    return "Overall operational weather risk appears limited based on the provided metrics."
