# Lat, Lon, ISO timestamp validation — Owner: Joseph
"""Input schemas. Source of truth for the *input* half of docs/API_CONTRACT.md."""

from datetime import datetime

from pydantic import BaseModel, Field, model_validator


class Waypoint(BaseModel):
    """A single point on a route: a coordinate and an estimated time of arrival."""

    lat: float = Field(..., ge=-90, le=90, description="Latitude in decimal degrees.")
    lon: float = Field(..., ge=-180, le=180, description="Longitude in decimal degrees.")
    eta: datetime = Field(..., description="Estimated time of arrival (ISO 8601, UTC).")


class RouteRequest(BaseModel):
    """An ordered list of waypoints describing a 3-7 day route."""

    waypoints: list[Waypoint] = Field(..., min_length=1, max_length=50)
    vehicle_name: str | None = None
    route_name: str | None = None

    @model_validator(mode="after")
    def _eta_non_decreasing(self) -> "RouteRequest":
        """Reject routes whose waypoint ETAs aren't in chronological order."""
        etas = [wp.eta for wp in self.waypoints]
        for earlier, later in zip(etas, etas[1:]):
            if later < earlier:
                raise ValueError(
                    "Waypoint ETAs must be in non-decreasing chronological order."
                )
        return self
