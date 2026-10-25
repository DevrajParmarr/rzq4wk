"""Runtime configuration, overridable through ``WINDSIGHT_*`` environment variables."""

from __future__ import annotations

from datetime import date
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="WINDSIGHT_", env_file=".env", extra="ignore")

    # Where the Elexon snapshot CSVs live (see scripts/fetch_data.py).
    data_dir: Path = BACKEND_DIR / "data"
    # Optional directory with the built React app; served at "/" when present.
    static_dir: Path | None = None

    # GB market days are defined in UK local time.
    timezone: str = "Europe/London"

    # Purchase decisions in scope: decisions made on these dates (inclusive),
    # each one for delivery on the following day.
    decision_start: date = date(2026, 1, 1)
    decision_end: date = date(2026, 1, 31)

    # Default decision deadline: EPEX SPOT GB hourly day-ahead auction gate closure (UK time).
    default_gate: str = "09:20"

    elexon_base_url: str = "https://data.elexon.co.uk/bmrs/api/v1"

    # Allowed browser origins for the API when the frontend is served separately (local dev).
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
