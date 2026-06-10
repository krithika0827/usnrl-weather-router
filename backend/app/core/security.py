# Guardrails / CORS rules — Owner: Joseph
"""CORS configuration so the browser frontend (a different origin) can call this
API. Without it, the browser blocks Reece's requests. Origins are the common
React/Vite dev servers; tighten to the real deployed origin for production.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

ALLOWED_ORIGINS = ["http://localhost:3000", "http://localhost:5173"]


def configure_cors(app: FastAPI) -> None:
    """Allow the frontend dev origins to call this API from the browser."""
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_methods=["*"],
        allow_headers=["*"],
    )
