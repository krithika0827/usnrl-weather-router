# QA critique agent / validation — Owner: Ryan
from typing import List

from app.agents.state import ValidationFinding, ValidationState


def validate_summary_against_route(state: ValidationState) -> dict:
    # Gets route data from the graph state.
    route = state.get("route", [])

    # Gets AI summary from the graph state.
    summary = state.get("summary")

    # Stores all validation issues found.
    findings: List[ValidationFinding] = []

    if not route:
        # Adds an error if route data is missing.
        findings.append({
            "severity": "error",
            "field": "route",
            "message": "Route data is missing or empty."
        })

        # Returns early because there is no route to validate.
        return {"validation": findings}

    if summary is None or summary.strip() == "":
        # Adds a warning if summary is missing.
        findings.append({
            "severity": "warning",
            "field": "summary",
            "message": "Summary is missing. Validation only checked route data."
        })

    required_fields = [
        "lat",
        "lon",
        "eta",
        "temperature_f",
        "wind_speed_mph",
        "precipitation_in",
        "humidity_pct",
    ]

    for index, point in enumerate(route):
        # Checks each waypoint for missing fields.
        for field in required_fields:
            if field not in point:
                findings.append({
                    "severity": "error",
                    "field": f"route[{index}].{field}",
                    "message": f"Missing required field: {field}."
                })

    if summary:
        # Adds all precipitation values.
        total_precip = sum(
            float(point.get("precipitation_in") or 0)
            for point in route
        )

        # Words that suggest rain.
        rain_words = ["rain", "raining", "precipitation", "showers", "storm"]

        if total_precip == 0 and any(word in summary.lower() for word in rain_words):
            # Warns if summary mentions rain but data shows no precipitation.
            findings.append({
                "severity": "warning",
                "field": "summary",
                "message": "Summary mentions rain or precipitation, but route precipitation values are 0."
            })

    for index, point in enumerate(route):
        # Gets weather values for simple range checks.
        temp = point.get("temperature_f")
        wind = point.get("wind_speed_mph")
        humidity = point.get("humidity_pct")

        if temp is not None and (temp < -80 or temp > 140):
            findings.append({
                "severity": "warning",
                "field": f"route[{index}].temperature_f",
                "message": "Temperature value looks unrealistic."
            })

        if wind is not None and wind > 100:
            findings.append({
                "severity": "warning",
                "field": f"route[{index}].wind_speed_mph",
                "message": "Wind speed is very high and should be reviewed."
            })

        if humidity is not None and (humidity < 0 or humidity > 100):
            findings.append({
                "severity": "error",
                "field": f"route[{index}].humidity_pct",
                "message": "Humidity must be between 0 and 100."
            })

    # Returns all validation findings.
    return {"validation": findings}