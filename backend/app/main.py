"""FastAPI application: JSON API under /api/v1, optional static frontend at /."""

from __future__ import annotations

import logging
import time
from datetime import UTC, date, datetime
from functools import lru_cache
from typing import Annotated

import pandas as pd
from fastapi import APIRouter, Depends, FastAPI, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app import __version__
from app.analysis import InvalidRequestError, WindAnalytics, parse_gate
from app.config import Settings, get_settings
from app.data import DataUnavailableError, WindData
from app.schemas import (
    AccuracyResponse,
    DataCoverage,
    DayAheadResponse,
    GatePreset,
    MetaResponse,
    SeriesResponse,
)
from app.serialize import to_jsonable

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("windsight")

GATE_PRESETS = [
    GatePreset(
        time="09:20",
        label="EPEX SPOT GB day-ahead auction (09:20)",
        description="Gate closure of the EPEX SPOT GB hourly day-ahead auction, UK time.",
    ),
    GatePreset(
        time="09:50",
        label="Nord Pool N2EX GB day-ahead auction (09:50)",
        description="Gate closure of the Nord Pool N2EX GB day-ahead auction, UK time.",
    ),
]

GateParam = Annotated[
    str | None,
    Query(description="Decision deadline on D-1 in UK local time, HH:MM. Defaults to the configured gate."),
]


@lru_cache
def get_analytics() -> WindAnalytics:
    settings = get_settings()
    started = time.perf_counter()
    data = WindData.load(settings.data_dir)
    logger.info(
        "Loaded %d actual and %d forecast rows in %.0f ms",
        len(data.actuals),
        len(data.forecasts),
        (time.perf_counter() - started) * 1000,
    )
    return WindAnalytics(data, settings.timezone, settings.decision_start, settings.decision_end)


Analytics = Annotated[WindAnalytics, Depends(get_analytics)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


def resolve_gate(gate: str | None, settings: Settings) -> str:
    gate = gate or settings.default_gate
    parse_gate(gate)  # validates, raises InvalidRequestError
    return gate


def as_utc(ts: datetime) -> pd.Timestamp:
    stamp = pd.Timestamp(ts)
    return stamp.tz_localize(UTC) if stamp.tzinfo is None else stamp.tz_convert(UTC)


router = APIRouter(prefix="/api/v1")


@router.get("/health", tags=["ops"])
def health() -> dict[str, str]:
    return {"status": "ok", "version": __version__}


@router.get("/meta", response_model=MetaResponse, tags=["reference"])
def meta(analytics: Analytics, settings: SettingsDep) -> MetaResponse:
    actuals, forecasts = analytics.data.actuals, analytics.data.forecasts
    coverage = DataCoverage(
        actuals_from=actuals["start_time"].min(),
        actuals_to=actuals["start_time"].max(),
        actual_rows=len(actuals),
        forecast_rows=len(forecasts),
        forecast_publishes=int(forecasts["publish_time"].nunique()),
        first_publish=forecasts["publish_time"].min(),
        last_publish=forecasts["publish_time"].max(),
    )
    return MetaResponse(
        version=__version__,
        timezone=settings.timezone,
        default_gate=settings.default_gate,
        gate_presets=GATE_PRESETS,
        decision_start=settings.decision_start,
        decision_end=settings.decision_end,
        delivery_dates=analytics.delivery_dates,
        coverage=coverage,
        sources={
            "actuals": "Elexon BMRS FUELHH (fuelType=WIND)",
            "forecasts": "Elexon BMRS WINDFOR",
        },
    )


@router.get("/day-ahead", response_model=DayAheadResponse, tags=["decision support"])
def day_ahead(
    analytics: Analytics,
    settings: SettingsDep,
    delivery_date: Annotated[date, Query(description="Delivery day D (UK local date)")],
    gate: GateParam = None,
) -> dict:
    """Forecast that was available at gate closure on D-1, its uncertainty range and the outturn."""
    return to_jsonable(analytics.day_ahead(delivery_date, resolve_gate(gate, settings)))


@router.get("/accuracy", response_model=AccuracyResponse, tags=["accuracy"])
def accuracy(analytics: Analytics, settings: SettingsDep, gate: GateParam = None) -> dict:
    """Accuracy of decision-time forecasts across every in-scope delivery day."""
    return to_jsonable(analytics.accuracy(resolve_gate(gate, settings)))


@router.get("/series", response_model=SeriesResponse, tags=["explorer"])
def series(
    analytics: Analytics,
    start: Annotated[datetime, Query(description="Range start (ISO 8601, UTC if no offset)")],
    end: Annotated[datetime, Query(description="Range end, exclusive")],
    horizon_h: Annotated[float, Query(ge=0, le=48, description="Minimum forecast age in hours")] = 4,
) -> dict:
    """Actuals vs the latest forecast published at least ``horizon_h`` hours before each target."""
    return to_jsonable(analytics.series(as_utc(start), as_utc(end), horizon_h))


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title="WindSight API",
        version=__version__,
        description="Day-ahead wind forecast intelligence for GB power procurement (Elexon BMRS data).",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )
    application.add_middleware(GZipMiddleware, minimum_size=1024)
    application.add_middleware(
        CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET"], allow_headers=["*"]
    )

    @application.middleware("http")
    async def timing(request: Request, call_next) -> Response:
        started = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - started) * 1000
        response.headers["Server-Timing"] = f"app;dur={elapsed_ms:.1f}"
        if request.url.path.startswith("/api/"):
            # The snapshot is immutable, so responses can be cached by browsers/CDNs.
            if response.status_code == 200:
                response.headers.setdefault("Cache-Control", "public, max-age=300")
            logger.info("%s %s -> %d (%.1f ms)", request.method, request.url.path, response.status_code, elapsed_ms)
        return response

    @application.exception_handler(InvalidRequestError)
    async def invalid_request(_: Request, exc: InvalidRequestError) -> JSONResponse:
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @application.exception_handler(DataUnavailableError)
    async def data_unavailable(_: Request, exc: DataUnavailableError) -> JSONResponse:
        logger.error("Data unavailable: %s", exc)
        return JSONResponse(status_code=503, content={"detail": "Data snapshot unavailable"})

    application.include_router(router)

    if settings.static_dir and settings.static_dir.is_dir():
        application.mount("/", StaticFiles(directory=settings.static_dir, html=True), name="frontend")
        logger.info("Serving frontend from %s", settings.static_dir)

    return application


app = create_app()
