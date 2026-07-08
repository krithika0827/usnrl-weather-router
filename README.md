# USNRL Weather Router

Generates weather forecast products along a route of waypoints. A user submits a
list of coordinates + ETAs; the app returns a per-waypoint weather table, an
AI-generated forecast summary, and automated validation findings.

This repo currently has a **working deterministic backend** (real weather, input
validation, graceful degradation), a generated route weather summary, and an
integrated validation workflow that returns findings through the forecast
endpoint.


## Status

| Piece | State | Owner |
|-------|-------|-------|
| `POST /api/v1/forecast` — validation + real weather | ✅ working | Joseph |
| Open-Meteo fetch (US units, async, ETA-matched) | ✅ working | Joseph |
| NOAA fallback + graceful degradation | ✅ working | Joseph |
| Backend tests + CI | ✅ working | Joseph |
| `summary` (AI forecast discussion) | ✅ generated | Krithika |
| `validation` (review-agent findings) | ✅ integrated | Ryan |
| Frontend map | ✅ working | Reece |
| Frontend table | ✅ working | Reece |
| Frontend table ranges | ✅ working | Reece |
| Frontend forecast box | ✅ displays backend summary | Reece |

## Quickstart

Runs the same on macOS and Windows via Docker Desktop:

```bash
cp .env.example .env
docker-compose up --build        # Starts front and back end
```
For front-end testing: navigate to http://localhost:3000/ to access the beta front end.

The following features are currently functional: User input, Weather table, Display value range, Map display.

The weather report is generated from the backend route weather data and remains
editable in the frontend.

----------------------------------------------------------------------------------------------------


For backend testing:
Then open **http://127.0.0.1:8000/docs** for interactive API docs — the easiest
way to try `POST /api/v1/forecast`: click **Try it out**, paste a request body,
and hit **Execute**.

### Example request body
```json
{
  "waypoints": [
    { "lat": 36.85, "lon": -76.30, "eta": "2026-06-08T12:00:00Z" },
    { "lat": 32.78, "lon": -79.93, "eta": "2026-06-09T10:00:00Z" }
  ]
}
```
(Use ETAs within ~16 days — Open-Meteo's forecast horizon. Older/farther dates
return `null` weather rather than erroring — graceful degradation.)

## The API contract

Full shapes and validation rules: [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md).

- **Input:** `{ "waypoints": [ { "lat", "lon", "eta" }, ... ] }` — `eta` is ISO-8601
  UTC, waypoints in chronological order (else `422`).
- **Output:** `{ "route": [ {lat, lon, eta, temperature_f, wind_speed_mph,
  precipitation_in, humidity_pct} ], "summary": "Route guidance covers ...",
  "validation": [ {"severity", "field", "message"} ] }`.

The response shape is stable, so frontend and validation work can rely on the
same envelope even as the summary generator improves.

## Getting started by lane

First, everyone: `docker-compose up backend`, confirm http://localhost:8000/docs
works, then branch off `main` for your part (one reviewer approves before merge).

**Reece — frontend**
1. With the backend running, build the React app in `frontend/src/` (fill `App.js`
   + `components/MapView.js`, `WeatherTable.js`, `ForecastBox.js`, and your
   `package.json` / `Dockerfile`).
2. Call `POST http://localhost:8000/api/v1/forecast` directly — CORS is enabled
   for `localhost:3000` / `:5173`, no mocking needed.
3. Render `route[]` in the table/map. Design the forecast box to handle `summary`
   (null) and `validation` (empty) gracefully — they light up once the AI lanes land.

**Krithika — AI summary**
1. Hit the endpoint to pull real `route` JSON.
2. Design the prompt that turns that weather table into the `summary` discussion,
   in `backend/app/agents/specialized/generator.py`.
3. Keep the generator output consistent with Ryan's validation checks.

**Ryan — validation agents**
1. Build the LangGraph flow in `backend/app/agents/` (`graph.py`, `state.py`,
   `specialized/critic.py`).
2. Read `route` + `summary`, emit `validation[]` findings (`severity`/`field`/
   `message`, per the contract).
3. Start against a sample `route`+`summary` payload until the summary firms up.

**Integration:** `backend/app/api/endpoints/weather.py` calls Krithika's summary
generator, then passes the generated text and route table into Ryan's validation
graph.

## Backend layout (`backend/app/`)

```
main.py              FastAPI app + CORS
api/router.py        aggregates routers
api/endpoints/       weather.py = POST /forecast
core/                config.py (settings), security.py (CORS)
services/            open_meteo.py (primary), noaa.py (fallback)
models/              waypoint.py (input + validation), weather_data.py (output)
tests/               test_api.py (endpoint), test_weather.py (service, mocked)
```

## Tests

```bash
docker compose run --rm backend pytest -q    # 18 tests, fully mocked — no network
```
CI (`.github/workflows/test.yml`) runs the same suite on every push and PR.
