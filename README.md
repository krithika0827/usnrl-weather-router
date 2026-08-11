# USNRL Weather Router

Generates weather forecast products along a route of waypoints. A user submits a
list of coordinates and ETAs; the app returns a per-waypoint weather table, a
deterministic or Gemini-generated forecast discussion, and automated validation
findings.

The full stack is working: real weather retrieval with graceful degradation,
summary generation in two modes, a validation workflow, and a React frontend
with a map, an editable weather table, and JSON import/export.

## Setup

Runs the same on macOS and Windows via Docker Desktop.

**1. Create a Gemini API key** at
[aistudio.google.com/apikey](https://aistudio.google.com/apikey). Click **Create
API key**; no billing setup is needed for the free tier.

**2. Create your `.env`** from the repo root:

```bash
cp .env.example .env
```

**3. In `.env`, uncomment and fill these two lines:**

```bash
GEMINI_API_KEY=AIza...your_key_here
GEMINI_MODEL=gemini-3.5-flash
```

The key is read server-side only, by `backend/app/services/summary_generator.py`.
`.env` is gitignored, so it stays out of source control and out of the browser.

**4. Start it:**

```bash
docker compose up --build
```

Then open:

- **App:** http://localhost:3000. A sample route is prefilled; click
  **Run Forecast**.
- **API docs:** http://localhost:8000/docs, health check:
  http://localhost:8000/health

The first forecast asks Gemini for the weather situation. If the key is missing
or the model name is one your key cannot call, the app still works: it falls
back to the deterministic summary and says so in red. Settings are read once at
startup, so after editing `.env` run
`docker compose up -d --force-recreate backend`.

### Running without Docker

```bash
# backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload         # http://127.0.0.1:8000

# frontend
cd frontend
npm install
npm start                             # http://localhost:3000
```

The frontend reads the backend location from `REACT_APP_API_BASE_URL`
(see `frontend/.env.example`, default `http://localhost:8000`).

## Summary modes

Every forecast comes with a written weather situation, from one of two
generators. **Gemini** needs the API key from setup. **Deterministic** runs
locally with no key and no network, so the app is fully usable without Gemini.

Pick either one at any time with the **Regenerate Gemini Summary** and
**Regenerate Deterministic Summary** buttons; the Weather Situation header names
the generator that produced the text you are reading. Against the API, send
`summary_mode` as `gemini` or `deterministic` and check which one comes back in
the response.

### When Gemini falls back

Gemini requests never fail the response. In three cases the backend returns the
deterministic summary instead, reports `summary_mode` as `deterministic`, and
adds a `validation` warning that the frontend shows in red:

| Case | What the app tells the user |
|------|-----------------------------|
| `GEMINI_API_KEY` is not set | Gemini is not configured, so the app fell back to the deterministic generator |
| Gemini errored, timed out, or returned nothing | Gemini was unavailable, so the app fell back to the deterministic generator |
| The Gemini summary contradicted the route data | The Gemini summary did not pass validation, so the app fell back to the deterministic generator |

The third case comes from the validation graph, which re-runs the critic against
the Gemini text before returning it.

## Using the app

1. Enter waypoints (latitude, longitude, ETA), plus an optional route name and
   vehicle name.
2. Run the forecast. The weather table and map render first, then the forecast
   discussion arrives once generation finishes.
3. Edit any table value, then regenerate to rewrite the discussion from your
   edits without refetching weather.
4. **Download** saves the current weather context as JSON; **Upload JSON**
   restores it.

Estimated travel time and distance are computed from the waypoints, and wind
barbs on the map show speed and direction per waypoint.

## Trying the API directly

The easiest path is **http://localhost:8000/docs**: click **Try it out** on
`POST /api/v1/forecast`, paste a request body, and hit **Execute**.

```json
{
  "waypoints": [
    { "lat": 36.85, "lon": -76.30, "eta": "2026-06-08T12:00:00Z" },
    { "lat": 32.78, "lon": -79.93, "eta": "2026-06-09T10:00:00Z" }
  ]
}
```

Use ETAs within about 16 days, which is Open-Meteo's forecast horizon. Dates
outside it return `null` weather values rather than erroring.

## The API contract

Request and response shapes, validation rules, and the fallback cases:
[`docs/API_CONTRACT.md`](docs/API_CONTRACT.md).

- `POST /api/v1/forecast` fetches weather for a route, then generates and
  validates the summary. Add `?include_summary=false` to get the weather table
  immediately with `summary: null`.
- `POST /api/v1/summary` regenerates only `summary`/`validation` from the
  current table values, so manual edits survive and no weather is refetched.

## How a request flows

```
frontend  ->  POST /api/v1/forecast
              services/open_meteo.py   fetch weather per waypoint (NOAA fallback)
              services/summary_generator.py   deterministic or Gemini discussion
              agents/graph.py          validation workflow over route + summary
          <-  { route, summary, summary_mode, validation }
```

The response envelope is stable, so the frontend can rely on the same shape
regardless of which summary generator ran.

## Backend layout (`backend/app/`)

```
main.py                          FastAPI app, CORS, GET /health
api/router.py                    aggregates routers
api/endpoints/weather.py         POST /forecast, POST /summary
api/endpoints/routes.py          waypoint ingestion helpers
core/                            config.py (settings), security.py (CORS)
services/open_meteo.py           primary weather source
services/noaa.py                 fallback weather source
services/summary_generator.py    picks deterministic or Gemini generation
agents/graph.py                  LangGraph validation workflow
agents/state.py                  shared agent state
agents/specialized/generator.py  deterministic forecast discussion
agents/specialized/critic.py     consistency checks that produce validation
agents/specialized/wind_thresholds.py   shared wind constants
tests/                           test_api.py, test_weather.py, test_agents.py
```

## Frontend layout (`frontend/`)

The whole UI lives in `src/App.js` (inputs, map, weather table, forecast box);
`src/components/` currently holds placeholder files. Playwright specs are in
`tests/`, configured by `playwright.config.js`.

## Tests

```bash
# backend: 44 tests, fully mocked, no network
docker compose run --rm backend pytest -q

# frontend end-to-end (needs the backend running on :8000)
cd frontend
npm install
npx playwright install chromium
npm run test:e2e            # headless, skips the live-Gemini spec
npm run test:e2e:gemini     # the one spec that calls the real Gemini API
```

`test:e2e:gemini` spends real API tokens, so it is kept out of the default run.

CI (`.github/workflows/test.yml`) runs both suites on every push and pull
request: backend pytest, and the Playwright suite against a live backend
started by the workflow.
