# QA critique agent / validation — Owner: Ryan

import re
from typing import Any, List

from app.agents.state import ValidationFinding, ValidationState


# Initial thresholds for detecting sudden changes between waypoints.
TEMPERATURE_SPIKE_F = 30
WIND_SPIKE_MPH = 35
HUMIDITY_SPIKE_PCT = 40
PRECIPITATION_SPIKE_IN = 1.0

# Allows small formatting differences between route data and summary text.
NUMBER_TOLERANCE = 0.05


def _point_to_dict(point: Any) -> dict:
    # Converts a Pydantic waypoint into a dictionary.
    if hasattr(point, "model_dump"):
        return point.model_dump()

    # Keeps dictionary waypoints unchanged.
    if isinstance(point, dict):
        return point

    # Returns an empty dictionary for unsupported data.
    return {}


def _add_finding(
    findings: List[ValidationFinding],
    severity: str,
    field: str,
    message: str,
) -> None:
    # Adds one structured validation issue.
    findings.append({
        "severity": severity,
        "field": field,
        "message": message,
    })


def _matches_known_value(value: float, known_values: list[float]) -> bool:
    # Checks if a summary number appears in the route data.
    return any(abs(value - known_value) <= NUMBER_TOLERANCE for known_value in known_values)


def _add_summary_number_warning(
    findings: List[ValidationFinding],
    value: float,
    unit: str,
) -> None:
    # Adds a warning when the summary uses a weather number not found in the route data.
    _add_finding(
        findings,
        "warning",
        "summary",
        (
            f"Summary includes {value:g} {unit}, but that value is not present "
            "in the route weather data."
        ),
    )


def _check_summary_weather_numbers(
    findings: List[ValidationFinding],
    summary: str,
    temperatures: list[float],
    winds: list[float],
    precipitation_values: list[float],
    humidity_values: list[float],
) -> None:
    # Checks weather numbers in the summary against raw route data.
    unit_values = {
        "f": temperatures,
        "mph": winds,
        "in": precipitation_values,
        "%": humidity_values,
    }

    unit_boundary = r"(?=\s|[.,;:]|$)"

    range_pattern = re.compile(
        r"(-?\d+(?:\.\d+)?)\s*(?:to|-)\s*(-?\d+(?:\.\d+)?)\s*(f|mph|in|%)"
        + unit_boundary,
        re.IGNORECASE,
    )

    checked_spans = []

    for match in range_pattern.finditer(summary):
        checked_spans.append(match.span())
        unit = match.group(3).lower()
        known_values = unit_values.get(unit, [])

        for value_text in [match.group(1), match.group(2)]:
            value = float(value_text)
            if known_values and not _matches_known_value(value, known_values):
                _add_summary_number_warning(findings, value, unit)

    single_pattern = re.compile(
        r"(-?\d+(?:\.\d+)?)\s*(f|mph|in|%)" + unit_boundary,
        re.IGNORECASE,
    )

    for match in single_pattern.finditer(summary):
        if any(start <= match.start() < end for start, end in checked_spans):
            continue

        value = float(match.group(1))
        unit = match.group(2).lower()
        known_values = unit_values.get(unit, [])

        if known_values and not _matches_known_value(value, known_values):
            _add_summary_number_warning(findings, value, unit)


def _summary_needs_regeneration(findings: List[ValidationFinding]) -> bool:
    # Suggests summary regeneration when summary validation issues are found.
    for finding in findings:
        if finding["field"] == "summary" and "Summary is missing" not in finding["message"]:
            return True

    return False


def validate_summary_against_route(state: ValidationState) -> dict:
    # Gets route data from the graph state.
    raw_route = state.get("route", [])

    # Converts route points into dictionaries.
    route = [_point_to_dict(point) for point in raw_route]

    # Gets the AI-generated narrative summary.
    summary = state.get("summary")

    # Stores all validation findings.
    findings: List[ValidationFinding] = []

    if not route:
        # Stops validation if route data is missing.
        _add_finding(
            findings,
            "error",
            "route",
            "Route data is missing or empty.",
        )
        return {"validation": findings}

    if summary is None or summary.strip() == "":
        # Warns when there is no narrative to compare.
        _add_finding(
            findings,
            "warning",
            "summary",
            "Summary is missing. Only route data was validated.",
        )

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
        # Reports unsupported route point values.
        if not point:
            _add_finding(
                findings,
                "error",
                f"route[{index}]",
                "Waypoint format is invalid or unsupported.",
            )
            continue

        for field in required_fields:
            # Reports fields that do not exist.
            if field not in point:
                _add_finding(
                    findings,
                    "error",
                    f"route[{index}].{field}",
                    f"Missing required field: {field}.",
                )
                continue

            # Weather API failures may produce null metrics.
            if field in {
                "temperature_f",
                "wind_speed_mph",
                "precipitation_in",
                "humidity_pct",
            } and point[field] is None:
                _add_finding(
                    findings,
                    "warning",
                    f"route[{index}].{field}",
                    f"Weather metric {field} is unavailable.",
                )

        lat = point.get("lat")
        lon = point.get("lon")
        temp = point.get("temperature_f")
        wind = point.get("wind_speed_mph")
        wind_direction = point.get("wind_direction_deg")
        precipitation = point.get("precipitation_in")
        humidity = point.get("humidity_pct")

        # Checks valid coordinate ranges.
        if lat is not None and not -90 <= lat <= 90:
            _add_finding(
                findings,
                "error",
                f"route[{index}].lat",
                "Latitude must be between -90 and 90.",
            )

        if lon is not None and not -180 <= lon <= 180:
            _add_finding(
                findings,
                "error",
                f"route[{index}].lon",
                "Longitude must be between -180 and 180.",
            )

        # Checks unrealistic temperature values.
        if temp is not None and not -80 <= temp <= 140:
            _add_finding(
                findings,
                "warning",
                f"route[{index}].temperature_f",
                "Temperature value looks unrealistic and should be reviewed.",
            )

        # Wind speed cannot be negative.
        if wind is not None and wind < 0:
            _add_finding(
                findings,
                "error",
                f"route[{index}].wind_speed_mph",
                "Wind speed cannot be negative.",
            )
        elif wind is not None and wind > 100:
            _add_finding(
                findings,
                "warning",
                f"route[{index}].wind_speed_mph",
                "Wind speed is unusually high and should be reviewed.",
            )

        # Wind direction must stay within 0 to 360 degrees when available.
        if wind_direction is not None and not 0 <= wind_direction <= 360:
            _add_finding(
                findings,
                "error",
                f"route[{index}].wind_direction_deg",
                "Wind direction must be between 0 and 360 degrees.",
            )

        # Precipitation cannot be negative.
        if precipitation is not None and precipitation < 0:
            _add_finding(
                findings,
                "error",
                f"route[{index}].precipitation_in",
                "Precipitation cannot be negative.",
            )

        # Humidity must stay within its valid percentage range.
        if humidity is not None and not 0 <= humidity <= 100:
            _add_finding(
                findings,
                "error",
                f"route[{index}].humidity_pct",
                "Humidity must be between 0 and 100.",
            )

    # Collects available values for narrative comparisons.
    temperatures = [
        point["temperature_f"]
        for point in route
        if point.get("temperature_f") is not None
    ]
    winds = [
        point["wind_speed_mph"]
        for point in route
        if point.get("wind_speed_mph") is not None
    ]
    precipitation_values = [
        point["precipitation_in"]
        for point in route
        if point.get("precipitation_in") is not None
    ]
    humidity_values = [
        point["humidity_pct"]
        for point in route
        if point.get("humidity_pct") is not None
    ]

    if summary:
        # Uses lowercase text for keyword comparisons.
        summary_lower = summary.lower()

        total_precipitation = sum(precipitation_values)
        maximum_wind = max(winds) if winds else None
        minimum_temperature = min(temperatures) if temperatures else None
        maximum_temperature = max(temperatures) if temperatures else None

        rain_words = [
            "rain",
            "raining",
            "precipitation",
            "showers",
            "storm",
            "wet conditions",
        ]
        dry_words = [
            "dry",
            "no rain",
            "no precipitation",
            "clear and dry",
        ]
        strong_wind_words = [
            "strong wind",
            "strong winds",
            "high wind",
            "high winds",
            "windy",
            "gusty",
        ]
        calm_wind_words = [
            "calm",
            "light wind",
            "light winds",
        ]
        hot_words = [
            "hot",
            "very warm",
            "high temperatures",
        ]
        cold_words = [
            "cold",
            "freezing",
            "very cold",
            "low temperatures",
        ]

        # Flags rain language when the data shows no precipitation.
        if (
            precipitation_values
            and total_precipitation == 0
            and any(word in summary_lower for word in rain_words)
        ):
            _add_finding(
                findings,
                "warning",
                "summary",
                "Summary mentions rain or precipitation, but route precipitation values are 0.",
            )

        # Flags dry language when precipitation is present.
        if (
            precipitation_values
            and total_precipitation > 0
            and any(word in summary_lower for word in dry_words)
        ):
            _add_finding(
                findings,
                "warning",
                "summary",
                "Summary describes dry conditions, but precipitation is present in the route data.",
            )

        # Flags strong-wind language when wind values are low.
        if (
            maximum_wind is not None
            and maximum_wind < 20
            and any(word in summary_lower for word in strong_wind_words)
        ):
            _add_finding(
                findings,
                "warning",
                "summary",
                "Summary describes strong winds, but route wind speeds remain below 20 mph.",
            )

        # Flags calm-wind language when wind values are high.
        if (
            maximum_wind is not None
            and maximum_wind >= 35
            and any(word in summary_lower for word in calm_wind_words)
        ):
            _add_finding(
                findings,
                "warning",
                "summary",
                "Summary describes calm or light winds, but the route contains high wind speeds.",
            )

        # Flags hot-weather language when temperatures are low.
        if (
            maximum_temperature is not None
            and maximum_temperature < 70
            and any(word in summary_lower for word in hot_words)
        ):
            _add_finding(
                findings,
                "warning",
                "summary",
                "Summary describes hot conditions, but route temperatures remain below 70°F.",
            )

        # Flags cold-weather language when temperatures are warm.
        if (
            minimum_temperature is not None
            and minimum_temperature > 60
            and any(word in summary_lower for word in cold_words)
        ):
            _add_finding(
                findings,
                "warning",
                "summary",
                "Summary describes cold conditions, but route temperatures remain above 60°F.",
            )

        # Flags weather numbers in the summary that do not exist in route data.
        _check_summary_weather_numbers(
            findings,
            summary,
            temperatures,
            winds,
            precipitation_values,
            humidity_values,
        )

        # Compares consecutive waypoints for sudden changes.
        for index in range(1, len(route)):
            previous = route[index - 1]
            current = route[index]

            previous_waypoint = index
            current_waypoint = index + 1
            waypoint_range = f"waypoints[{previous_waypoint}-{current_waypoint}]"

            previous_temp = previous.get("temperature_f")
            current_temp = current.get("temperature_f")

            previous_wind = previous.get("wind_speed_mph")
            current_wind = current.get("wind_speed_mph")

            previous_humidity = previous.get("humidity_pct")
            current_humidity = current.get("humidity_pct")

            previous_precipitation = previous.get("precipitation_in")
            current_precipitation = current.get("precipitation_in")

            # Flags a sudden temperature change.
            if (
                previous_temp is not None
                and current_temp is not None
                and abs(current_temp - previous_temp) >= TEMPERATURE_SPIKE_F
            ):
                _add_finding(
                    findings,
                    "warning",
                    f"{waypoint_range}.temperature_f",
                    (
                        "Temperature changes by "
                        f"{abs(current_temp - previous_temp):.1f}°F "
                        f"between waypoint {previous_waypoint} and waypoint {current_waypoint}."
                    ),
                )

            # Flags a sudden wind-speed change.
            if (
                previous_wind is not None
                and current_wind is not None
                and abs(current_wind - previous_wind) >= WIND_SPIKE_MPH
            ):
                _add_finding(
                    findings,
                    "warning",
                    f"{waypoint_range}.wind_speed_mph",
                    (
                        "Wind speed changes by "
                        f"{abs(current_wind - previous_wind):.1f} mph "
                        f"between waypoint {previous_waypoint} and waypoint {current_waypoint}."
                    ),
                )

            # Flags a sudden humidity change.
            if (
                previous_humidity is not None
                and current_humidity is not None
                and abs(current_humidity - previous_humidity) >= HUMIDITY_SPIKE_PCT
            ):
                _add_finding(
                    findings,
                    "warning",
                    f"{waypoint_range}.humidity_pct",
                    (
                        "Humidity changes by "
                        f"{abs(current_humidity - previous_humidity)} percentage points "
                        f"between waypoint {previous_waypoint} and waypoint {current_waypoint}."
                    ),
                )

            # Flags a sudden precipitation change.
            if (
                previous_precipitation is not None
                and current_precipitation is not None
                and abs(current_precipitation - previous_precipitation)
                >= PRECIPITATION_SPIKE_IN
            ):
                _add_finding(
                    findings,
                    "warning",
                    f"{waypoint_range}.precipitation_in",
                    (
                        "Precipitation changes by "
                        f"{abs(current_precipitation - previous_precipitation):.2f} inches "
                        f"between waypoint {previous_waypoint} and waypoint {current_waypoint}."
                    ),
                )

    if summary and _summary_needs_regeneration(findings):
        _add_finding(
            findings,
            "warning",
            "summary",
            "Summary may need to be regenerated after fixing validation issues.",
        )

    # Returns all validation findings.
    return {"validation": findings}