# Structured tabular schemas
"""Output schemas. Source of truth for the *output* half of docs/API_CONTRACT.md.

Units are temperature °F, wind knots/degrees, precipitation inches, humidity %.
This is the shape the frontend renders, the summary generator describes, and
the validation agents check.
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class WaypointForecast(BaseModel):
    """Weather for one waypoint. Every weather field is nullable so a missing
    data source degrades gracefully instead of failing the whole request."""

    lat: float
    lon: float
    eta: datetime

    temperature_f: Optional[float] = None
    wind_speed_knots: Optional[float] = None
    wind_direction_deg: Optional[float] = None
    precipitation_in: Optional[float] = None
    humidity_pct: Optional[int] = None


class Severity(str, Enum):
    info = "info"
    warning = "warning"
    error = "error"


class SummaryMode(str, Enum):
    """Supported routes for generating the forecast narrative."""

    deterministic = "deterministic"
    gemini = "gemini"


class ValidationIssue(BaseModel):
    """A consistency finding produced by the review agents."""

    severity: Severity = Severity.info
    field: str = Field(..., description="Which part of the product the issue concerns.")
    message: str


class ForecastResponse(BaseModel):
    """The full product returned to the client."""

    route: list[WaypointForecast]
    # Filled by the summary generator; null when summary generation is skipped.
    summary: Optional[str] = None
    # The generator that actually produced `summary`; Gemini fallbacks report
    # `deterministic` so the frontend can communicate it clearly.
    summary_mode: SummaryMode = SummaryMode.deterministic
    # Filled by the review agents; empty when there is nothing to report.
    validation: list[ValidationIssue] = Field(default_factory=list)
