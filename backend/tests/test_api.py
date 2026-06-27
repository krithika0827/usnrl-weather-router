# Route validation & 500-error degradation tests — Owner: Joseph
"""Endpoint-level tests for POST /api/v1/forecast.

Covers input validation (all the 422 rules) and the response envelope. The
weather fetch is stubbed via monkeypatch so these tests skip the network and
focus on the API contract, not upstream behaviour (that's in test_weather.py).
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.weather_data import WaypointForecast

client = TestClient(app)

VALID = {"waypoints": [{"lat": 36.85, "lon": -76.30, "eta": "2026-06-08T12:00:00Z"}]}


@pytest.fixture
def stub_weather(monkeypatch):
    """Replace the real fetch with canned data so endpoint tests skip the network."""
    async def _fake(waypoints):
        return [
            WaypointForecast(
                lat=wp.lat, lon=wp.lon, eta=wp.eta,
                temperature_f=70.0, wind_speed_mph=8.0,
                precipitation_in=0.0, humidity_pct=60,
            )
            for wp in waypoints
        ]
    monkeypatch.setattr("app.services.open_meteo.fetch_forecasts", _fake)


def test_health():
    """Health probe returns ok."""
    assert client.get("/health").json() == {"status": "ok"}


def test_forecast_happy_path_envelope(stub_weather):
    """A valid route returns 200 with weather plus stubbed summary/validation."""
    r = client.post("/api/v1/forecast", json=VALID)
    assert r.status_code == 200
    body = r.json()
    assert body["route"][0]["temperature_f"] == 70.0
    assert body["summary"] is None      # stubbed for Krithika (Week 4)
    assert body["validation"][0]["severity"] == "warning"
    assert body["validation"][0]["field"] == "summary"
    assert "Summary is missing" in body["validation"][0]["message"]

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


def test_rejects_bad_eta_format():
    """A non-ISO-8601 eta is rejected with 422."""
    bad = {"waypoints": [{"lat": 36.85, "lon": -76.30, "eta": "not-a-date"}]}
    assert client.post("/api/v1/forecast", json=bad).status_code == 422
