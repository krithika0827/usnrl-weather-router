# Shared agent state definitions — Owner: Ryan

from typing import List, Optional, TypedDict, Union

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

    # Stores the AI summary text.
    summary: Optional[str]

    # Stores all validation findings.
    validation: List[ValidationFinding]