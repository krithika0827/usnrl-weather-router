"""Choose deterministic or Gemini generation for route weather summaries."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from typing import Any

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
    """Make the route data and the no-invention rule explicit for Gemini."""
    route_data = [
        point.model_dump(mode="json") if hasattr(point, "model_dump") else point
        for point in route
    ]
    return (
        "Write a concise operational weather discussion for the supplied route. "
        "Use only facts and numeric values in ROUTE_DATA. Do not estimate, invent, "
        "or add weather conditions that are not supported by the data. Mention "
        "missing values as unavailable. Return only the discussion, with no heading, "
        "bullet list, disclaimer, or markdown.\n\n"
        f"VEHICLE_NAME: {vehicle_name or 'Not provided'}\n"
        f"ROUTE_NAME: {route_name or 'Not provided'}\n"
        f"ROUTE_DATA: {json.dumps(route_data, separators=(',', ':'))}"
    )
