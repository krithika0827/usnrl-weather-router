# API Contract

This is the single response shape the whole app builds against:

- The frontend renders this output.
- The weather services produce `route` from Open-Meteo, with NOAA as a fallback.
- The summary generator produces `summary` *from* the `route` table.
- The validation graph fills `validation` by checking `summary` against `route`.

The response envelope is stable: deterministic weather retrieval fills `route`,
the summary generator fills `summary`, and the validation graph fills
`validation`.

---

## Endpoints

`POST /api/v1/forecast`

Fetches weather for submitted waypoints, generates a summary, and validates the
full product. Summary generation can be deferred with `include_summary=false`.

### Input

A route is an ordered list of waypoints. Each is a coordinate plus an estimated
time of arrival (ISO 8601, UTC).

```json
{
  "vehicle_name": "Borealis",
  "route_name": "Kessel Run",
  "summary_mode": "deterministic",
  "waypoints": [
    { "lat": 36.85, "lon": -76.30, "eta": "2026-06-10T14:00:00Z" },
    { "lat": 35.22, "lon": -75.55, "eta": "2026-06-10T20:00:00Z" },
    { "lat": 32.78, "lon": -79.93, "eta": "2026-06-11T08:00:00Z" }
  ]
}
```

**Validation rules** (backend enforces; returns `422` on failure):

| Field | Rule |
|-------|------|
| `lat` | number in `[-90, 90]` |
| `lon` | number in `[-180, 180]` |
| `eta` | valid ISO 8601 timestamp |
| `waypoints` | at least 1, at most 50 |
| ordering | `eta` values non-decreasing (in chronological order) |
| `summary_mode` | `deterministic` (default) or `gemini` |

### Query parameters

| Parameter | Default | Effect |
|-----------|---------|--------|
| `include_summary` | `true` | When `false`, skips summary generation and returns `summary: null` straight after the weather fetch. |

The frontend uses `include_summary=false` to render the weather table while the
narrative is still generating, then calls `POST /api/v1/summary` for the summary
itself. `validation` is still populated on this path, but only with route-level
findings; summary findings are omitted because no summary exists yet.

### Output

```json
{
  "route": [
    {
      "lat": 36.85,
      "lon": -76.30,
      "eta": "2026-06-10T14:00:00Z",
      "temperature_f": 75.4,
      "wind_speed_knots": 11.2,
      "wind_direction_deg": 45.0,
      "precipitation_in": 0.0,
      "humidity_pct": 65
    }
  ],
  "summary": "Borealis on route Kessel Run is forecast across 1 waypoint(s) from 2026-06-10 14:00 UTC near 36.85, -76.30 to 2026-06-10 14:00 UTC near 36.85, -76.30. Temperatures are expected to be mild near 75.4 F. Wind conditions indicate light northeast winds near 11.2 knots. No measurable accumulation is indicated at the route waypoints. Relative humidity is near 65%. Overall operational weather risk appears limited based on the provided metrics.",
  "summary_mode": "deterministic",
  "validation": []
}
```

**Field notes:**

| Field | Type | Filled by | Notes |
|-------|------|-----------|-------|
| `route[].lat/lon/eta` | echo of input | weather services | identifies the waypoint |
| `route[].temperature_f` | number \| null | weather services | Fahrenheit (°F) |
| `route[].wind_speed_knots` | number \| null | weather services | knots |
| `route[].wind_direction_deg` | number \| null | weather services | wind direction in degrees |
| `route[].precipitation_in` | number \| null | weather services | inches |
| `route[].humidity_pct` | integer \| null | weather services | relative humidity % |
| `summary` | string \| null | summary generator | Generated forecast discussion from the route table |
| `summary_mode` | string | backend | Generator that actually produced the summary (`deterministic` or `gemini`) |
| `validation` | array | validation graph | Review-agent findings |

Every weather field is **nullable**: if a source is unavailable for a waypoint,
that field is `null` rather than failing the whole request (graceful
degradation).

---

`POST /api/v1/summary`

Regenerates only the weather situation from the current editable table values.
This endpoint does not fetch Open-Meteo or NOAA data, so frontend edits are
preserved.

### Input

```json
{
  "vehicle_name": "Borealis",
  "route_name": "Kessel Run",
  "summary_mode": "gemini",
  "route": [
    {
      "lat": 36.85,
      "lon": -76.30,
      "eta": "2026-06-10T14:00:00Z",
      "temperature_f": 75.4,
      "wind_speed_knots": 11.2,
      "wind_direction_deg": 45.0,
      "precipitation_in": 0.0,
      "humidity_pct": 65
    }
  ]
}
```

### Output

Uses the same `ForecastResponse` envelope as `/forecast`.

When `summary_mode` is `gemini`, the backend sends only the route table and
optional names to Gemini using its server-side `GEMINI_API_KEY`. Three cases
fall back to the deterministic summary, each reporting `summary_mode` as
`deterministic` and adding a `validation` warning that explains which one
happened:

| Case | Warning text starts with |
|------|--------------------------|
| `GEMINI_API_KEY` is not configured | `Gemini was selected but GEMINI_API_KEY is not configured` |
| Gemini errored, timed out, or returned nothing | `Gemini summary generation was unavailable` |
| Gemini answered but the summary contradicted the route data | `Gemini summary failed validation` |

The third case is decided by the validation graph, which re-runs the critic
against the replacement summary before returning.

### `validation` entry shape

```json
{
  "severity": "warning",
  "field": "summary",
  "message": "Mentions rain but precipitation is 0mm at all waypoints."
}
```

`severity` is one of `info` | `warning` | `error`.

---

## Where each part is implemented

| Part | Code |
|------|------|
| Endpoints | `backend/app/api/endpoints/weather.py` |
| Input validation rules | `backend/app/models/waypoint.py` |
| Output schemas | `backend/app/models/weather_data.py` |
| Weather retrieval | `backend/app/services/open_meteo.py`, `backend/app/services/noaa.py` |
| Summary mode selection and Gemini calls | `backend/app/services/summary_generator.py` |
| Deterministic forecast discussion | `backend/app/agents/specialized/generator.py` |
| Validation findings | `backend/app/agents/graph.py`, `backend/app/agents/specialized/critic.py` |
| Frontend rendering | `frontend/src/App.js` |
