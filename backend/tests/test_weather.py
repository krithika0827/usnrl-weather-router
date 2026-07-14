# Open-Meteo mock API responses — Owner: Joseph
"""Service-layer tests for the weather fetch + NOAA fallback logic.

Both upstream APIs are mocked with respx, so these tests make no real network
calls and are deterministic. Covers: Open-Meteo mapping at the ETA hour, the
NOAA fallback when Open-Meteo fails, full degradation to null, and order/units.
"""

import asyncio

import httpx
import respx

from app.core.config import settings
from app.models.waypoint import Waypoint
from app.services import open_meteo

WP = Waypoint(lat=36.85, lon=-76.30, eta="2026-06-08T12:00:00Z")

_OPEN_METEO_OK = {
    "hourly": {
        "time": ["2026-06-08T11:00", "2026-06-08T12:00", "2026-06-08T13:00"],
        "temperature_2m": [69.0, 70.9, 72.0],
        "wind_speed_10m": [12.0, 13.0, 14.0],
        "wind_direction_10m": [30.0, 45.0, 60.0],
        "precipitation": [0.0, 0.0, 0.1],
        "relative_humidity_2m": [70, 67, 65],
    }
}

_NOAA_POINTS = {"properties": {"forecastHourly": "https://api.weather.gov/hourly/test"}}
_NOAA_HOURLY = {"properties": {"periods": [
    {"startTime": "2026-06-08T12:00:00+00:00", "temperature": 72, "temperatureUnit": "F",
     "windSpeed": "10 mph", "windDirection": "NE", "relativeHumidity": {"value": 55}},
]}}


def _run(waypoints):
    """Run the async fetch synchronously for a plain pytest function."""
    return asyncio.run(open_meteo.fetch_forecasts(waypoints))


@respx.mock
def test_open_meteo_maps_eta_hour_in_us_units():
    """Open-Meteo data is mapped at the ETA hour, in US units."""
    respx.get(settings.open_meteo_url).mock(return_value=httpx.Response(200, json=_OPEN_METEO_OK))
    [wx] = _run([WP])
    assert wx.temperature_f == 70.9   # the 12:00 ETA hour, not 11:00 / 13:00
    assert wx.wind_speed_mph == 13.0
    assert wx.wind_direction_deg == 45.0
    assert wx.precipitation_in == 0.0
    assert wx.humidity_pct == 67


@respx.mock
def test_falls_back_to_noaa_when_open_meteo_fails():
    """When Open-Meteo errors, NOAA fills temp/wind/humidity (precip stays null)."""
    respx.get(settings.open_meteo_url).mock(side_effect=httpx.ConnectError("down"))
    respx.get(url__regex=r"https://api\.weather\.gov/points/.*").mock(
        return_value=httpx.Response(200, json=_NOAA_POINTS))
    respx.get("https://api.weather.gov/hourly/test").mock(
        return_value=httpx.Response(200, json=_NOAA_HOURLY))
    [wx] = _run([WP])
    assert wx.temperature_f == 72.0
    assert wx.wind_speed_mph == 10.0
    assert wx.wind_direction_deg == 45
    assert wx.humidity_pct == 55
    assert wx.precipitation_in is None


@respx.mock
def test_both_upstreams_down_degrades_to_null():
    """If both Open-Meteo and NOAA fail, weather fields are null (never a crash)."""
    respx.get(settings.open_meteo_url).mock(side_effect=httpx.ConnectError("down"))
    respx.get(url__regex=r"https://api\.weather\.gov/.*").mock(side_effect=httpx.ConnectError("down"))
    [wx] = _run([WP])
    assert wx.temperature_f is None and wx.wind_speed_mph is None
    assert wx.wind_direction_deg is None and wx.humidity_pct is None
    assert wx.precipitation_in is None
    assert wx.lat == WP.lat and wx.eta == WP.eta   # waypoint identity preserved


@respx.mock
def test_multiple_waypoints_preserve_input_order():
    """Concurrent fetches return results in the same order as the input."""
    respx.get(settings.open_meteo_url).mock(return_value=httpx.Response(200, json=_OPEN_METEO_OK))
    wps = [WP, Waypoint(lat=32.78, lon=-79.93, eta="2026-06-09T10:00:00Z")]
    out = _run(wps)
    assert [w.lat for w in out] == [36.85, 32.78]


@respx.mock
def test_large_route_survives_uncaught_fetch_error():
    """A fetch error the per-waypoint handler doesn't catch degrades to null for
    that waypoint instead of failing the whole route (regression: an unexpected
    error used to escape asyncio.gather and 500 the entire request)."""
    respx.get(settings.open_meteo_url).mock(side_effect=RuntimeError("boom"))
    wps = [Waypoint(lat=21.31, lon=-157.86, eta="2026-06-08T00:00:00Z") for _ in range(100)]
    out = _run(wps)
    assert len(out) == 100
    assert all(w.temperature_f is None and w.wind_speed_mph is None for w in out)
    assert all(w.lat == 21.31 for w in out)   # waypoint identity preserved


def test_concurrency_is_capped(monkeypatch):
    """No more than _MAX_CONCURRENCY upstream requests run at once, so a long
    route can't open hundreds of connections in a single burst."""
    active = 0
    peak = 0

    async def fake_get(self, url, **kwargs):
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0.01)   # hold the slot so overlap is observable
        active -= 1
        return httpx.Response(200, json=_OPEN_METEO_OK, request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)
    wps = [WP for _ in range(50)]
    out = _run(wps)
    assert len(out) == 50
    assert all(w.temperature_f == 70.9 for w in out)   # success path, not degraded
    assert 1 < peak <= open_meteo._MAX_CONCURRENCY
