# LLM evaluation / hallucination audit tests — Owner: Ryan

from datetime import datetime, timezone

from app.agents.graph import run_validation
from app.models.weather_data import WaypointForecast


def make_waypoint(
    temperature_f=70,
    wind_speed_mph=10,
    precipitation_in=0,
    humidity_pct=50,
):
    # Creates a reusable sample waypoint.
    return WaypointForecast(
        lat=36.85,
        lon=-76.30,
        eta=datetime(2026, 6, 8, 12, 0, tzinfo=timezone.utc),
        temperature_f=temperature_f,
        wind_speed_mph=wind_speed_mph,
        precipitation_in=precipitation_in,
        humidity_pct=humidity_pct,
    )


def test_empty_route_returns_error():
    # Checks that an empty route is rejected.
    findings = run_validation([], "Clear conditions expected.")

    assert any(
        finding["severity"] == "error"
        and finding["field"] == "route"
        for finding in findings
    )


def test_missing_summary_returns_warning():
    # Checks that a missing summary produces a warning.
    findings = run_validation([make_waypoint()], None)

    assert any(
        finding["severity"] == "warning"
        and finding["field"] == "summary"
        for finding in findings
    )


def test_rain_summary_with_zero_precipitation_returns_warning():
    # Checks for a contradiction between rain text and dry data.
    findings = run_validation(
        [make_waypoint(precipitation_in=0)],
        "Rain and showers are expected along the route.",
    )

    assert any(
        finding["field"] == "summary"
        and "precipitation values are 0" in finding["message"]
        for finding in findings
    )


def test_negative_precipitation_returns_error():
    # Checks that negative precipitation is invalid.
    findings = run_validation(
        [make_waypoint(precipitation_in=-1)],
        "Dry weather is expected.",
    )

    assert any(
        finding["severity"] == "error"
        and finding["field"] == "route[0].precipitation_in"
        for finding in findings
    )


def test_invalid_humidity_returns_error():
    # Checks that humidity outside 0 to 100 is invalid.
    findings = run_validation(
        [make_waypoint(humidity_pct=120)],
        "Warm conditions are expected.",
    )

    assert any(
        finding["severity"] == "error"
        and finding["field"] == "route[0].humidity_pct"
        for finding in findings
    )


def test_temperature_spike_returns_warning():
    # Checks for a large temperature change between waypoints.
    route = [
        make_waypoint(temperature_f=60),
        make_waypoint(temperature_f=100),
    ]

    findings = run_validation(route, "Temperatures will vary along the route.")

    assert any(
        finding["severity"] == "warning"
        and finding["field"] == "route[1].temperature_f"
        and "Temperature changes by" in finding["message"]
        for finding in findings
    )


def test_wind_spike_returns_warning():
    # Checks for a large wind-speed change between waypoints.
    route = [
        make_waypoint(wind_speed_mph=5),
        make_waypoint(wind_speed_mph=50),
    ]

    findings = run_validation(route, "Wind conditions will change.")

    assert any(
        finding["severity"] == "warning"
        and finding["field"] == "route[1].wind_speed_mph"
        and "Wind speed changes by" in finding["message"]
        for finding in findings
    )


def test_valid_route_returns_no_findings():
    # Checks that normal data and matching text pass validation.
    findings = run_validation(
        [make_waypoint()],
        "Mild temperatures, light winds, and dry conditions are expected.",
    )

    assert findings == []