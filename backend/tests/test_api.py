# Route validation & 500-error degradation tests — Owner: Joseph
"""Endpoint-level tests for POST /api/v1/forecast.

Covers input validation (all the 422 rules) and the response envelope. The
weather fetch is stubbed via monkeypatch so these tests skip the network and
focus on the API contract, not upstream behaviour (that's in test_weather.py).
"""

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.weather_data import SummaryMode, WaypointForecast
from app.services import summary_generator

client = TestClient(app)

VALID = {
    "vehicle_name": "Borealis",
    "route_name": "Kessel Run",
    "waypoints": [{"lat": 36.85, "lon": -76.30, "eta": "2026-06-08T12:00:00Z"}],
}


@pytest.fixture
def stub_weather(monkeypatch):
    """Replace the real fetch with canned data so endpoint tests skip the network."""
    async def _fake(waypoints):
        return [
            WaypointForecast(
                lat=wp.lat, lon=wp.lon, eta=wp.eta,
                temperature_f=70.0, wind_speed_knots=7.0,
                wind_direction_deg=45.0,
                precipitation_in=0.0, humidity_pct=60,
            )
            for wp in waypoints
        ]
    monkeypatch.setattr("app.services.open_meteo.fetch_forecasts", _fake)


def test_health():
    """Health probe returns ok."""
    assert client.get("/health").json() == {"status": "ok"}


def test_forecast_happy_path_envelope(stub_weather):
    """A valid route returns 200 with weather, summary, and validation."""
    r = client.post("/api/v1/forecast", json=VALID)
    assert r.status_code == 200
    body = r.json()
    assert body["route"][0]["temperature_f"] == 70.0
    assert "Borealis" in body["summary"]
    assert "Kessel Run" in body["summary"]
    assert "70.0 F" in body["summary"]
    assert body["validation"] == []


def test_forecast_can_skip_summary_generation(stub_weather, monkeypatch):
    """The frontend can load weather first and defer summary generation."""
    async def _fail_generate(*_args, **_kwargs):
        raise AssertionError("forecast should skip summary generation")

    monkeypatch.setattr("app.api.endpoints.weather.generate_summary", _fail_generate)

    r = client.post("/api/v1/forecast?include_summary=false", json=VALID)
    assert r.status_code == 200
    body = r.json()
    assert body["route"][0]["temperature_f"] == 70.0
    assert body["summary"] is None
    assert body["summary_mode"] == "deterministic"
    assert body["validation"] == []


def test_summary_uses_current_table_values_without_fetching(monkeypatch):
    """Summary refresh uses edited route rows instead of fetching new weather."""
    async def _fail_fetch(_waypoints):
        raise AssertionError("summary refresh should not fetch weather")

    monkeypatch.setattr("app.services.open_meteo.fetch_forecasts", _fail_fetch)

    route = [{
        "lat": 36.85,
        "lon": -76.30,
        "eta": "2026-06-08T12:00:00Z",
        "temperature_f": 1.0,
        "wind_speed_knots": 1.0,
        "wind_direction_deg": 45.0,
        "precipitation_in": 1.0,
        "humidity_pct": 1,
    }]

    r = client.post(
        "/api/v1/summary",
        json={
            "vehicle_name": "Borealis",
            "route_name": "Kessel Run",
            "route": route,
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["route"][0]["temperature_f"] == 1.0
    assert "Borealis" in body["summary"]
    assert "Kessel Run" in body["summary"]
    assert "near 1.0 F" in body["summary"]
    assert "light northeast winds near 1.0 knots" in body["summary"]
    assert "amounts near 1.00 in" in body["summary"]
    assert "Relative humidity is near 1%" in body["summary"]


def test_gemini_mode_without_key_falls_back_to_deterministic(monkeypatch):
    """A missing local API key never makes the summary endpoint fail."""
    monkeypatch.setattr("app.services.summary_generator.settings.gemini_api_key", None)
    r = client.post(
        "/api/v1/summary",
        json={
            "route": [{
                "lat": 36.85, "lon": -76.30, "eta": "2026-06-08T12:00:00Z",
                "temperature_f": 70, "wind_speed_knots": 8,
                "wind_direction_deg": 45, "precipitation_in": 0, "humidity_pct": 60,
            }],
            "summary_mode": "gemini",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert "70.0 F" in body["summary"]
    assert body["summary_mode"] == "deterministic"
    assert any("GEMINI_API_KEY" in finding["message"] for finding in body["validation"])


@pytest.mark.asyncio
async def test_gemini_mode_uses_provider_when_configured(monkeypatch):
    """Gemini mode uses the provider result before the validation workflow."""
    monkeypatch.setattr(summary_generator.settings, "gemini_api_key", "test-key")
    monkeypatch.setattr(
        summary_generator,
        "_generate_with_gemini",
        lambda *_args: "Gemini route summary.",
    )
    result = await summary_generator.generate_summary(
        [], None, None, SummaryMode.gemini
    )
    assert result.summary == "Gemini route summary."
    assert result.mode == SummaryMode.gemini
    assert result.warning is None


def test_gemini_prompt_requests_route_level_summary():
    """The Gemini prompt supplies ranges and route findings instead of a table recital."""
    route = [
        WaypointForecast(
            lat=36.85,
            lon=-76.30,
            eta=datetime(2026, 6, 8, 12, 0, tzinfo=timezone.utc),
            temperature_f=70, wind_speed_knots=5, precipitation_in=0, humidity_pct=90,
        ),
        WaypointForecast(
            lat=36.20,
            lon=-76.55,
            eta=datetime(2026, 6, 9, 12, 0, tzinfo=timezone.utc),
            temperature_f=80, wind_speed_knots=15, precipitation_in=0, humidity_pct=45,
        ),
    ]

    prompt = summary_generator._build_gemini_prompt(route, "Borealis", "Kessel Run")

    assert "naval operational weather situation" in prompt
    assert "future-focused transit language" in prompt
    assert "forecaster's narrative briefing" in prompt
    assert "do NOT enumerate every waypoint" in prompt
    assert "ROUTE_OVERVIEW:" in prompt
    assert '"duration_hours":24.0' in prompt
    assert '"distance_miles":' in prompt
    assert "ROUTE_FINDINGS:" in prompt
    assert "Humidity changes by 45 percentage points" in prompt


def test_rejects_latitude_out_of_range():
    """Latitude outside [-90, 90] is rejected with 422."""
    bad = {"waypoints": [{"lat": 200, "lon": 0, "eta": "2026-06-08T12:00:00Z"}]}
    assert client.post("/api/v1/forecast", json=bad).status_code == 422


def test_rejects_out_of_order_etas():
    """Waypoints whose ETAs go backwards in time are rejected with 422."""
    bad = {"waypoints": [
        {"lat": 36.85, "lon": -76.30, "eta": "2026-06-08T20:00:00Z"},
        {"lat": 35.22, "lon": -75.55, "eta": "2026-06-08T10:00:00Z"},
    ]}
    assert client.post("/api/v1/forecast", json=bad).status_code == 422


def test_rejects_empty_waypoints():
    """An empty waypoint list is rejected with 422."""
    assert client.post("/api/v1/forecast", json={"waypoints": []}).status_code == 422


def test_rejects_more_than_50_waypoints():
    """A route with over 50 waypoints is rejected with 422."""
    bad = {"waypoints": [
        {"lat": 36.85, "lon": -76.30, "eta": "2026-06-08T12:00:00Z"}
        for _ in range(51)
    ]}
    assert client.post("/api/v1/forecast", json=bad).status_code == 422


def test_accepts_exactly_50_waypoints(stub_weather):
    """A route at the 50-waypoint cap is accepted."""
    ok = {"waypoints": [
        {"lat": 36.85, "lon": -76.30, "eta": "2026-06-08T12:00:00Z"}
        for _ in range(50)
    ]}
    assert client.post("/api/v1/forecast", json=ok).status_code == 200


def test_rejects_bad_eta_format():
    """A non-ISO-8601 eta is rejected with 422."""
    bad = {"waypoints": [{"lat": 36.85, "lon": -76.30, "eta": "not-a-date"}]}
    assert client.post("/api/v1/forecast", json=bad).status_code == 422
