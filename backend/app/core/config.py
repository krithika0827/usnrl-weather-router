# Pydantic BaseSettings (API keys, env variables) — Owner: Joseph
"""System-wide configuration, loaded from environment / .env.

Open-Meteo needs no API key, so defaults work out of the box; values can be
overridden via environment variables (see .env.example).
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    open_meteo_url: str = "https://api.open-meteo.com/v1/forecast"
    request_timeout_s: float = 10.0

    # Optional Gemini API configuration. When no key is configured, requests
    # selecting Gemini safely fall back to the deterministic generator.
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-3.5-flash"

    # NOAA fallback (US coverage only). NOAA requires a descriptive User-Agent.
    noaa_points_url: str = "https://api.weather.gov/points"
    noaa_user_agent: str = "usnrl-weather-router (https://github.com/krithika0827/usnrl-weather-router)"


settings = Settings()
