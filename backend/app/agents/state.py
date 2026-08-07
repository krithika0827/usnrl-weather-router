# Shared agent state definitions — Owner: Ryan

from typing import List, NotRequired, Optional, TypedDict, Union

from app.models.weather_data import WaypointForecast


class ValidationFinding(TypedDict):
    # Defines one validation issue.
    severity: str

    # Shows which field has the issue.
    field: str

    # Explains the issue.
    message: str


class ValidationState(TypedDict):
    # Stores route points as Pydantic models or dictionaries.
    route: List[Union[WaypointForecast, dict]]

    # Stores the generated narrative summary.
    summary: Optional[str]

    # Stores all validation findings.
    validation: List[ValidationFinding]

    # Stores which summary generator produced the current summary.
    summary_mode: NotRequired[str]

    # Stores optional route metadata for deterministic fallback generation.
    vehicle_name: NotRequired[Optional[str]]
    route_name: NotRequired[Optional[str]]

    # Stores a warning when the validation graph replaces a Gemini summary.
    summary_fallback_warning: NotRequired[Optional[str]]