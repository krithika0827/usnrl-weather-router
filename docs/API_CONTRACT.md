# API Contract (DRAFT — for team review)

This is the single shape every lane builds against:

- **Reece (frontend)** renders this output.
- **Joseph (backend)** produces it from Open-Meteo.
- **Krithika (AI)** generates `summary` *from* the `route` table.
- **Ryan (agents)** fills `validation` by checking `summary` against `route`.

The response envelope is stable: deterministic weather retrieval fills `route`,
the summary generator fills `summary`, and the validation graph fills
`validation`.

---

## Endpoint

`POST /api/v1/forecast`

### Input

A route is an ordered list of waypoints. Each is a coordinate plus an estimated
time of arrival (ISO 8601, UTC).

```json
{
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
| `waypoints` | at least 1 |
| ordering | `eta` values non-decreasing (in chronological order) |

### Output

```json
{
  "route": [
    {
      "lat": 36.85,
      "lon": -76.30,
      "eta": "2026-06-10T14:00:00Z",
      "temperature_f": 75.4,
      "wind_speed_mph": 11.2,
      "precipitation_in": 0.0,
      "humidity_pct": 65
    }
  ],
  "summary": "Route guidance covers 1 waypoint(s) from 2026-06-10 14:00 UTC near 36.85, -76.30. Temperatures are expected to be mild, ranging from 75.4 F. Wind conditions indicate light winds, with speeds from 11.2 mph. No measurable accumulation is indicated at the route waypoints. Relative humidity ranges from 65%. Overall operational weather risk appears limited based on the provided metrics.",
  "validation": []
}
```

**Field notes:**

| Field | Type | Filled by | Notes |
|-------|------|-----------|-------|
| `route[].lat/lon/eta` | echo of input | Joseph | identifies the waypoint |
| `route[].temperature_f` | number \| null | Joseph | Fahrenheit (°F) |
| `route[].wind_speed_mph` | number \| null | Joseph | miles per hour |
| `route[].precipitation_in` | number \| null | Joseph | inches |
| `route[].humidity_pct` | integer \| null | Joseph | relative humidity % |
| `summary` | string \| null | Krithika | Generated forecast discussion from the route table |
| `validation` | array | Ryan | Review-agent findings |

Every weather field is **nullable**: if a source is unavailable for a waypoint,
that field is `null` rather than failing the whole request (proposal §4 —
"99% graceful degradation").

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

## What each person can do against this now

- **Reece** — build the table/map/forecast-box against this JSON using a mocked
  response; no backend needed.
- **Joseph** — implement the Open-Meteo fetch that fills the weather fields.
- **Krithika** — design the prompt that turns the `route` table into `summary`.
- **Ryan** — design review agents that read `route` + `summary` and emit
  `validation` entries.
