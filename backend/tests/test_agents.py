# LLM evaluation / hallucination audit tests — Owner: Ryan

from datetime import datetime, timezone

from app.agents.graph import run_validation
from app.agents.specialized.generator import generate_weather_summary
from app.models.weather_data import WaypointForecast


def make_waypoint(
    temperature_f=70,
    wind_speed_mph=10,
    wind_direction_deg=45,
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
        wind_direction_deg=wind_direction_deg,
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


def test_negative_wind_speed_returns_error():
    # Checks that negative wind speed is invalid.
    findings = run_validation(
        [make_waypoint(wind_speed_mph=-5)],
        "Light winds are expected.",
    )

    assert any(
        finding["severity"] == "error"
        and finding["field"] == "route[0].wind_speed_mph"
        and "Wind speed cannot be negative" in finding["message"]
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


def test_invalid_latitude_returns_error():
    # Checks that latitude outside the valid range is invalid.
    bad_waypoint = make_waypoint()
    bad_waypoint.lat = 120

    findings = run_validation(
        [bad_waypoint],
        "Mild weather is expected.",
    )

    assert any(
        finding["severity"] == "error"
        and finding["field"] == "route[0].lat"
        and "Latitude must be between -90 and 90" in finding["message"]
        for finding in findings
    )


def test_invalid_longitude_returns_error():
    # Checks that longitude outside the valid range is invalid.
    bad_waypoint = make_waypoint()
    bad_waypoint.lon = 200

    findings = run_validation(
        [bad_waypoint],
        "Mild weather is expected.",
    )

    assert any(
        finding["severity"] == "error"
        and finding["field"] == "route[0].lon"
        and "Longitude must be between -180 and 180" in finding["message"]
        for finding in findings
    )


def test_unrealistic_temperature_returns_warning():
    # Checks that unrealistic temperature values are flagged.
    findings = run_validation(
        [make_waypoint(temperature_f=150)],
        "Very hot weather is expected.",
    )

    assert any(
        finding["severity"] == "warning"
        and finding["field"] == "route[0].temperature_f"
        and "Temperature value looks unrealistic" in finding["message"]
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


def test_generator_creates_summary_from_route_data():
    # Checks that the summary uses the route metrics and avoids placeholder text.
    summary = generate_weather_summary([
        make_waypoint(
            temperature_f=68,
            wind_speed_mph=12,
            precipitation_in=0,
            humidity_pct=55,
        ),
        make_waypoint(
            temperature_f=74,
            wind_speed_mph=18,
            precipitation_in=0,
            humidity_pct=62,
        ),
    ])

    assert "68.0 to 74.0 F" in summary
    assert "northeast winds" in summary
    assert "12.0 to 18.0 mph" in summary
    assert "No measurable accumulation" in summary
    assert "placeholder" not in summary.lower()
    assert run_validation([make_waypoint()], summary) == []


def test_generator_mentions_vehicle_and_route_names():
    # Checks that optional frontend metadata appears in the narrative.
    summary = generate_weather_summary(
        [make_waypoint()],
        vehicle_name="Borealis",
        route_name="Kessel Run",
    )

    assert "Borealis" in summary
    assert "Kessel Run" in summary


def test_generator_uses_single_value_wording_when_there_is_no_range():
    # Checks that identical values are not described as ranges.
    route = [
        make_waypoint(
            temperature_f=1,
            wind_speed_mph=1,
            precipitation_in=1,
            humidity_pct=1,
        ),
        make_waypoint(
            temperature_f=1,
            wind_speed_mph=1,
            precipitation_in=1,
            humidity_pct=1,
        ),
    ]

    summary = generate_weather_summary(route)

    assert "ranging from 1.0 F" not in summary
    assert "with speeds from 1.0 mph" not in summary
    assert "amounts from 1.00 in" not in summary
    assert "Relative humidity ranges from 1%" not in summary
    assert "near 1.0 F" in summary
    assert "light northeast winds near 1.0 mph" in summary
    assert "amounts near 1.00 in" in summary
    assert "Relative humidity is near 1%" in summary


def test_generator_notes_missing_weather_data():
    # Checks graceful summary text when weather providers return null metrics.
    summary = generate_weather_summary([
        make_waypoint(
            temperature_f=None,
            wind_speed_mph=None,
            wind_direction_deg=None,
            precipitation_in=None,
            humidity_pct=None,
        )
    ])

    assert "no temperature, wind, humidity, or precipitation values are available" in summary