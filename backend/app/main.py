# Application entry point (FastAPI app instance) — Owner: Joseph
"""Boots the FastAPI app and mounts the v1 API.

Run locally:

    cd backend
    uvicorn app.main:app --reload

then open http://127.0.0.1:8000/docs to try POST /api/v1/forecast.
"""

from fastapi import FastAPI

from app.api.router import api_router
from app.core.security import configure_cors

app = FastAPI(
    title="USNRL Weather Router",
    version="0.1.0",
    description="Generates weather forecast products along a route of waypoints.",
)

configure_cors(app)
app.include_router(api_router, prefix="/api/v1")


@app.get("/health", tags=["meta"])
async def health() -> dict[str, str]:
    """Liveness probe for docker-compose / CI."""
    return {"status": "ok"}
