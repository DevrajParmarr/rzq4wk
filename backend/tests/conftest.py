"""Shared fixtures: a small synthetic dataset whose correct answers are known by construction."""

from __future__ import annotations

from datetime import date

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.analysis import WindAnalytics
from app.data import WindData
from app.main import app, get_analytics

TZ = "Europe/London"
PUBLISH_HOURS = (2.5, 7.5, 9.5, 15.5)  # 02:30, 07:30, 09:30, 15:30 UTC (= UK time in winter)
ACTUAL_MW = 1000.0


def forecast_value(publish: pd.Timestamp) -> float:
    """Encode the publish time in the value so tests can see which publish was selected.

    e.g. the 2026-01-01 07:30 publish forecasts 1000 + 1*100 + 7.5 = 1107.5 MW everywhere.
    """
    return ACTUAL_MW + publish.day * 100 + publish.hour + publish.minute / 60


def build_raw() -> tuple[pd.DataFrame, pd.DataFrame]:
    half_hours = pd.date_range("2025-12-30", "2026-01-06", freq="30min", tz="UTC", inclusive="left")
    actuals = pd.DataFrame(
        {
            "startTime": half_hours.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "publishTime": (half_hours + pd.Timedelta(minutes=30)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "generation": ACTUAL_MW,
        }
    )
    rows = []
    for day in pd.date_range("2025-12-30", "2026-01-05", freq="D", tz="UTC"):
        for hour in PUBLISH_HOURS:
            publish = day + pd.Timedelta(hours=hour)
            for target in pd.date_range(day, day + pd.Timedelta(days=3), freq="h", inclusive="left"):
                rows.append(
                    {
                        "publishTime": publish.strftime("%Y-%m-%dT%H:%M:%SZ"),
                        "startTime": target.strftime("%Y-%m-%dT%H:%M:%SZ"),
                        "generation": forecast_value(publish),
                    }
                )
    return actuals, pd.DataFrame(rows)


@pytest.fixture(scope="session")
def wind_data() -> WindData:
    return WindData.from_raw(*build_raw())


@pytest.fixture()
def analytics(wind_data: WindData) -> WindAnalytics:
    return WindAnalytics(wind_data, TZ, date(2026, 1, 1), date(2026, 1, 3))


@pytest.fixture()
def client(analytics: WindAnalytics):
    app.dependency_overrides[get_analytics] = lambda: analytics
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
