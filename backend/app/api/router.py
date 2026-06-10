# Combines all routers — Owner: Joseph
"""Aggregates the v1 endpoint routers into a single APIRouter mounted by main."""

from fastapi import APIRouter

from app.api.endpoints import weather

api_router = APIRouter()
api_router.include_router(weather.router, tags=["forecast"])
