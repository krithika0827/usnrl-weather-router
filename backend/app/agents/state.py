# Shared agent state definitions — Owner: Ryan
from typing import TypedDict, List, Optional


class ValidationFinding(TypedDict):
    # Defines one validation issue.
    severity: str

    # Shows which field has the issue.
    field: str

    # Explains the issue.
    message: str


class ValidationState(TypedDict):
    # Stores the route weather data.
    route: List[dict]

    # Stores the AI summary text.
    summary: Optional[str]

    # Stores all validation findings.
    validation: List[ValidationFinding]