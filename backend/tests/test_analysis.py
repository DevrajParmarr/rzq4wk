from __future__ import annotations

from datetime import date, time

import numpy as np
import pandas as pd
import pytest

from app.analysis import (
    InvalidRequestError,
    apply_band,
    cutoffs_for_targets,
    decision_cutoff,
    delivery_window,
    error_metrics,
    latest_forecast_asof,
    parse_gate,
    trailing_ratios,
)
from app.data import clean_actuals, clean_forecasts

from .conftest import ACTUAL_MW, TZ

UTC = "UTC"


def ts(value: str) -> pd.Timestamp:
    return pd.Timestamp(value, tz=UTC)


# --------------------------------------------------------------------------- gate & calendar


@pytest.mark.parametrize("gate", ["9:20", "24:00", "09:60", "0920", ""])
def test_parse_gate_rejects_malformed(gate: str) -> None:
    with pytest.raises(InvalidRequestError):
        parse_gate(gate)


def test_parse_gate_accepts_hhmm() -> None:
    assert parse_gate("09:20") == time(9, 20)


def test_delivery_window_handles_clock_change() -> None:
    start, end = delivery_window(date(2026, 3, 29), TZ)  # clocks go forward: 23h day
    assert (end - start) == pd.Timedelta(hours=23)
    start, end = delivery_window(date(2026, 10, 25), TZ)  # clocks go back: 25h day
    assert (end - start) == pd.Timedelta(hours=25)


def test_decision_cutoff_is_previous_day_in_local_time() -> None:
    assert decision_cutoff(date(2026, 1, 15), time(9, 20), TZ) == ts("2026-01-14 09:20")
    # In summer 09:20 BST is 08:20 UTC
    assert decision_cutoff(date(2026, 6, 16), time(9, 20), TZ) == ts("2026-06-15 08:20")


def test_vectorised_cutoffs_map_targets_to_their_local_delivery_day() -> None:
    targets = pd.Series(
        [
            ts("2026-01-15 00:00"),  # first period of 15 Jan
            ts("2026-01-15 23:00"),  # last hour of 15 Jan
            ts("2026-06-15 23:30"),  # 00:30 BST on 16 Jun -> belongs to 16 Jun
        ]
    ).astype("datetime64[ns, UTC]")
    cutoffs = cutoffs_for_targets(targets, time(9, 20), TZ)
    assert list(cutoffs) == [ts("2026-01-14 09:20"), ts("2026-01-14 09:20"), ts("2026-06-15 08:20")]


# --------------------------------------------------------------------------- forecast selection


def _forecasts(rows: list[tuple[str, str, float]]) -> pd.DataFrame:
    return clean_forecasts(pd.DataFrame(rows, columns=["publishTime", "startTime", "generation"]))


def _targets(pairs: list[tuple[str, str]]) -> pd.DataFrame:
    return pd.DataFrame({"start_time": [ts(s) for s, _ in pairs], "cutoff": [ts(c) for _, c in pairs]}).astype(
        "datetime64[ns, UTC]"
    )


def test_latest_forecast_never_uses_publishes_after_cutoff() -> None:
    forecasts = _forecasts(
        [
            ("2026-01-14T07:30:00Z", "2026-01-15T12:00:00Z", 100.0),
            ("2026-01-14T09:30:00Z", "2026-01-15T12:00:00Z", 999.0),  # after the cutoff
            ("2026-01-14T04:30:00Z", "2026-01-15T12:00:00Z", 50.0),
        ]
    )
    out = latest_forecast_asof(forecasts, _targets([("2026-01-15 12:00", "2026-01-14 09:20")]))
    assert out.loc[0, "forecast"] == 100.0
    assert out.loc[0, "publish_time"] == ts("2026-01-14 07:30")


def test_publish_exactly_at_cutoff_is_available() -> None:
    forecasts = _forecasts([("2026-01-14T09:20:00Z", "2026-01-15T12:00:00Z", 42.0)])
    out = latest_forecast_asof(forecasts, _targets([("2026-01-15 12:00", "2026-01-14 09:20")]))
    assert out.loc[0, "forecast"] == 42.0


def test_missing_forecast_yields_nan_not_a_neighbouring_target() -> None:
    forecasts = _forecasts([("2026-01-14T07:30:00Z", "2026-01-15T13:00:00Z", 42.0)])
    out = latest_forecast_asof(forecasts, _targets([("2026-01-15 12:00", "2026-01-14 09:20")]))
    assert np.isnan(out.loc[0, "forecast"])
    assert pd.isna(out.loc[0, "publish_time"])


def test_empty_targets_are_supported() -> None:
    forecasts = _forecasts([("2026-01-14T07:30:00Z", "2026-01-15T13:00:00Z", 42.0)])
    out = latest_forecast_asof(forecasts, _targets([]))
    assert out.empty and {"forecast", "publish_time"} <= set(out.columns)


# --------------------------------------------------------------------------- cleaning


def test_clean_actuals_keeps_latest_revision() -> None:
    raw = pd.DataFrame(
        {
            "startTime": ["2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z", "2026-01-01T00:30:00Z"],
            "publishTime": ["2026-01-01T00:30:00Z", "2026-01-01T02:00:00Z", "2026-01-01T01:00:00Z"],
            "generation": [10, 12, "bad"],
        }
    )
    out = clean_actuals(raw)
    assert len(out) == 1  # non-numeric generation dropped
    assert out.loc[0, "actual"] == 12


# --------------------------------------------------------------------------- metrics


def test_error_metrics_known_values() -> None:
    forecast = pd.Series([110.0, 90.0, 100.0, 120.0])
    actual = pd.Series([100.0, 100.0, 100.0, 100.0])
    m = error_metrics(forecast, actual)
    assert m["n"] == 4
    assert m["mae"] == pytest.approx(10.0)
    assert m["bias"] == pytest.approx(5.0)
    assert m["rmse"] == pytest.approx(np.sqrt((100 + 100 + 0 + 400) / 4))
    assert m["nmae_pct"] == pytest.approx(10.0)
    assert m["over_forecast_pct"] == pytest.approx(50.0)
    assert m["max_abs_error"] == pytest.approx(20.0)


def test_error_metrics_ignores_unpaired_rows_and_handles_empty() -> None:
    m = error_metrics(pd.Series([1.0, np.nan]), pd.Series([np.nan, 2.0]))
    assert m["n"] == 0 and m["mae"] is None


def test_band_orientation_and_floor_at_zero() -> None:
    # Errors (forecast - actual) between -100 (P10) and +300 (P90):
    low, high = apply_band(pd.Series([1000.0, 200.0]), (-100.0, 300.0))
    assert list(low) == [700.0, 0.0]  # forecast - P90(error), floored at 0 MW
    assert list(high) == [1100.0, 300.0]


def test_trailing_ratio_uses_only_settled_days() -> None:
    days = [date(2026, 1, d) for d in range(1, 11)]
    frame = pd.DataFrame(
        {
            "delivery_date": days,
            "forecast": [100.0] * 10,
            # Day 9 (D-1 for D=10) is wildly different and must be ignored for D=10.
            "actual": [80.0] * 8 + [1000.0, 80.0],
        }
    )
    ratios = trailing_ratios(frame, [date(2026, 1, 10), date(2026, 1, 1)])
    assert ratios[date(2026, 1, 10)] == pytest.approx(0.8)  # uses Jan 2..Jan 8
    assert ratios[date(2026, 1, 1)] == 1.0  # no history -> no adjustment


# --------------------------------------------------------------------------- service on synthetic data


def test_day_ahead_selects_last_publish_before_gate(analytics) -> None:
    result = analytics.day_ahead(date(2026, 1, 3), "09:20")
    points = result["forecast_points"]
    assert len(points) == 24
    # The 07:30 publish on 2 Jan forecasts 1000 + 200 + 7.5
    assert set(points["forecast"]) == {1207.5}
    assert result["forecast_publish_time"] == ts("2026-01-02 07:30")
    assert result["decision_cutoff"] == ts("2026-01-02 09:20")


def test_later_gate_picks_up_later_publish(analytics) -> None:
    points = analytics.day_ahead(date(2026, 1, 3), "09:50")["forecast_points"]
    assert set(points["forecast"]) == {1209.5}


def test_day_ahead_rejects_out_of_scope_dates(analytics) -> None:
    with pytest.raises(InvalidRequestError):
        analytics.day_ahead(date(2026, 1, 1), "09:20")  # decided on 31 Dec: out of scope


def test_accuracy_covers_all_delivery_days(analytics) -> None:
    acc = analytics.accuracy("09:20")
    assert [row["delivery_date"] for row in acc["daily"]] == [date(2026, 1, d) for d in (2, 3, 4)]
    assert acc["metrics"]["n"] == 72
    assert acc["metrics"]["bias"] > 0  # synthetic forecasts are always above ACTUAL_MW
    assert len(acc["by_hour"]) == 24


def test_horizon_view_respects_minimum_age(analytics) -> None:
    frame = analytics.horizon_frame(6.0)
    age = (frame["start_time"] - frame["publish_time"]).dt.total_seconds() / 3600
    assert (age >= 6.0).all()
    assert frame["actual"].eq(ACTUAL_MW).all()
