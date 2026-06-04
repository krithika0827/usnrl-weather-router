# Structured tabular schemas — Owner: Joseph
"""Output schemas. Source of truth for the *output* half of docs/API_CONTRACT.md.

Units are US standard: temperature °F, wind mph, precipitation inches, humidity %.
This is the shape Reece renders, Krithika summarizes, and Ryan validates.
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
    wind_speed_mph: Optional[float] = None
    precipitation_in: Optional[float] = None
    humidity_pct: Optional[int] = None


class Severity(str, Enum):
    info = "info"
    warning = "warning"
    error = "error"


class ValidationIssue(BaseModel):
    """A consistency finding produced by the review agents (Ryan, Week 5)."""

    severity: Severity = Severity.info
    field: str = Field(..., description="Which part of the product the issue concerns.")
    message: str


class ForecastResponse(BaseModel):
    """The full product returned to the client."""

    route: list[WaypointForecast]
    # Filled by Krithika's AI discussion (Week 4); null until then.
    summary: Optional[str] = None
    # Filled by Ryan's review agents (Week 5); empty until then.
    validation: list[ValidationIssue] = Field(default_factory=list)
