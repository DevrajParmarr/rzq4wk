"""Forecast selection and accuracy analytics.

Core idea
---------
A forecast is only useful for a decision if it was *published before* the decision
was taken. For every target period ``t`` we therefore pick, from all WINDFOR
publishes, the latest one whose ``publish_time <= cutoff(t)``:

* **Decision view** - ``cutoff(t)`` is the day-ahead gate closure on the day before
  the delivery day containing ``t`` (UK local time). This is exactly the information
  the trading desk had when it placed its bids.
* **Horizon view** - ``cutoff(t) = t - h``: the latest forecast that was at least
  ``h`` hours old, used to show how accuracy decays with lead time.

Both reduce to an as-of join (``pandas.merge_asof``) grouped by target time.

Conventions
-----------
* ``error = forecast - actual`` (MW). Positive error = over-forecast, i.e. wind came
  in *below* plan and the shortfall must be bought back in intraday/balancing.
* Forecasts are hourly, actuals half-hourly: accuracy is evaluated on the hourly
  timestamps present in both datasets (no interpolation assumptions).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, time, timedelta

import numpy as np
import pandas as pd

from app.data import TS_DTYPE, WindData

GATE_PATTERN = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")
BAND_LOWER_Q = 0.10
BAND_UPPER_Q = 0.90
FORECAST_STEP_H = 1.0  # WINDFOR resolution
ACTUAL_STEP_H = 0.5  # FUELHH resolution
# Trailing window for the adjusted forecast. At gate closure on D-1 the most recent
# fully settled delivery day is D-2, so the window is D-(1+N) .. D-2.
ADJUST_WINDOW_DAYS = 7
ADJUST_SETTLEMENT_LAG_DAYS = 2


class InvalidRequestError(ValueError):
    """Raised for out-of-range or malformed analysis inputs."""


def parse_gate(gate: str) -> time:
    match = GATE_PATTERN.match(gate)
    if not match:
        raise InvalidRequestError(f"Gate time must be HH:MM (24h), got {gate!r}")
    return time(int(match.group(1)), int(match.group(2)))


def local_midnight_utc(day: date, tz: str) -> pd.Timestamp:
    return pd.Timestamp(day).tz_localize(tz).tz_convert("UTC")


def delivery_window(delivery_date: date, tz: str) -> tuple[pd.Timestamp, pd.Timestamp]:
    """UTC [start, end) of a UK delivery day (handles 23h/25h clock-change days)."""
    return local_midnight_utc(delivery_date, tz), local_midnight_utc(delivery_date + timedelta(days=1), tz)


def decision_cutoff(delivery_date: date, gate: time, tz: str) -> pd.Timestamp:
    """Gate closure (UTC) on the day before ``delivery_date``."""
    decision_day = pd.Timestamp(delivery_date - timedelta(days=1)) + pd.Timedelta(hours=gate.hour, minutes=gate.minute)
    return decision_day.tz_localize(tz).tz_convert("UTC")


def cutoffs_for_targets(start_times: pd.Series, gate: time, tz: str) -> pd.Series:
    """Vectorised :func:`decision_cutoff` for many target timestamps (DST-safe)."""
    local_day = start_times.dt.tz_convert(tz).dt.tz_localize(None).dt.normalize()
    naive_cutoff = local_day - pd.Timedelta(days=1) + pd.Timedelta(hours=gate.hour, minutes=gate.minute)
    return (
        naive_cutoff.dt.tz_localize(tz, ambiguous="NaT", nonexistent="shift_forward")
        .dt.tz_convert("UTC")
        .astype(TS_DTYPE)
    )


def latest_forecast_asof(forecasts: pd.DataFrame, targets: pd.DataFrame) -> pd.DataFrame:
    """For each row of ``targets`` (``start_time``, ``cutoff``) attach the latest forecast
    for that ``start_time`` published at or before ``cutoff``.

    Adds ``forecast`` and ``publish_time`` columns (NaN/NaT when nothing qualifies).
    """
    if targets.empty:
        return targets.assign(forecast=pd.Series(dtype=float), publish_time=pd.Series(dtype=TS_DTYPE))
    left = targets.astype({"cutoff": TS_DTYPE, "start_time": TS_DTYPE}).sort_values("cutoff")
    right = forecasts[["publish_time", "start_time", "forecast"]].sort_values("publish_time")
    merged = pd.merge_asof(
        left,
        right,
        left_on="cutoff",
        right_on="publish_time",
        by="start_time",
        direction="backward",
        allow_exact_matches=True,
    )
    return merged.sort_values("start_time").reset_index(drop=True)


def attach_actuals(frame: pd.DataFrame, actuals: pd.DataFrame) -> pd.DataFrame:
    out = frame.merge(actuals[["start_time", "actual"]], on="start_time", how="left")
    out["error"] = out["forecast"] - out["actual"]
    return out


# --------------------------------------------------------------------------- metrics


def error_metrics(forecast: pd.Series, actual: pd.Series) -> dict[str, float | int | None]:
    """Point-forecast accuracy statistics over paired, non-missing observations."""
    mask = forecast.notna() & actual.notna()
    f = forecast[mask].to_numpy(dtype=float)
    a = actual[mask].to_numpy(dtype=float)
    n = int(mask.sum())
    if n == 0:
        return {
            "n": 0,
            "mae": None,
            "rmse": None,
            "bias": None,
            "nmae_pct": None,
            "p50_abs_error": None,
            "p90_abs_error": None,
            "max_abs_error": None,
            "over_forecast_pct": None,
            "correlation": None,
        }
    e = f - a
    abs_e = np.abs(e)
    mean_actual = float(a.mean())
    corr = float(np.corrcoef(f, a)[0, 1]) if n > 2 and f.std() > 0 and a.std() > 0 else None
    return {
        "n": n,
        "mae": float(abs_e.mean()),
        "rmse": float(np.sqrt((e**2).mean())),
        "bias": float(e.mean()),
        "nmae_pct": float(abs_e.mean() / mean_actual * 100) if mean_actual > 0 else None,
        "p50_abs_error": float(np.quantile(abs_e, 0.5)),
        "p90_abs_error": float(np.quantile(abs_e, 0.9)),
        "max_abs_error": float(abs_e.max()),
        "over_forecast_pct": float((e > 0).mean() * 100),
        "correlation": corr,
    }


def error_quantiles(errors: pd.Series) -> tuple[float, float] | None:
    clean = errors.dropna()
    if clean.empty:
        return None
    return float(clean.quantile(BAND_LOWER_Q)), float(clean.quantile(BAND_UPPER_Q))


def apply_band(forecast: pd.Series, quantiles: tuple[float, float] | None) -> tuple[pd.Series, pd.Series]:
    """Empirical 80% range for the actual given the forecast.

    actual = forecast - error, so the P10 of the actual uses the P90 of the error.
    """
    if quantiles is None:
        empty = pd.Series(np.nan, index=forecast.index)
        return empty, empty
    q_lo, q_hi = quantiles
    return (forecast - q_hi).clip(lower=0), (forecast - q_lo).clip(lower=0)


def trailing_ratios(frame: pd.DataFrame, delivery_dates: list[date]) -> dict[date, float]:
    """Per delivery day D: sum(actual) / sum(forecast) over the paired hours of delivery
    days D-(1+N) .. D-2, i.e. only outcomes fully known at D-1 gate closure.

    Falls back to 1.0 (no adjustment) when there is no settled history.
    """
    paired = frame.dropna(subset=["forecast", "actual"])
    daily = paired.groupby("delivery_date")[["forecast", "actual"]].sum()
    ratios: dict[date, float] = {}
    for day in delivery_dates:
        last = day - timedelta(days=ADJUST_SETTLEMENT_LAG_DAYS)
        first = last - timedelta(days=ADJUST_WINDOW_DAYS - 1)
        window = daily[(daily.index >= first) & (daily.index <= last)]
        total_forecast = float(window["forecast"].sum())
        ratios[day] = float(window["actual"].sum()) / total_forecast if total_forecast > 0 else 1.0
    return ratios


# --------------------------------------------------------------------------- analysis service


@dataclass
class WindAnalytics:
    """Stateless-per-request analytics over an immutable :class:`WindData` snapshot."""

    data: WindData
    tz: str
    decision_start: date
    decision_end: date

    def __post_init__(self) -> None:
        self._decision_cache: dict[str, pd.DataFrame] = {}
        self._horizon_cache: dict[float, pd.DataFrame] = {}

    # ----- scope -----

    @property
    def delivery_dates(self) -> list[date]:
        n_days = (self.decision_end - self.decision_start).days + 1
        return [self.decision_start + timedelta(days=i + 1) for i in range(n_days)]

    def evaluation_window(self) -> tuple[pd.Timestamp, pd.Timestamp]:
        start, _ = delivery_window(self.delivery_dates[0], self.tz)
        _, end = delivery_window(self.delivery_dates[-1], self.tz)
        return start, end

    def _target_times(self, start: pd.Timestamp, end: pd.Timestamp) -> pd.Series:
        times = self.data.forecasts["start_time"]
        return pd.Series(np.sort(times[(times >= start) & (times < end)].unique()), name="start_time").astype(TS_DTYPE)

    def validate_delivery_date(self, delivery_date: date) -> None:
        dates = self.delivery_dates
        if not dates[0] <= delivery_date <= dates[-1]:
            raise InvalidRequestError(
                f"Delivery date must be between {dates[0]} and {dates[-1]} (decisions made "
                f"{self.decision_start}..{self.decision_end}), got {delivery_date}"
            )

    # ----- core frames -----

    def decision_frame(self, gate: str) -> pd.DataFrame:
        """Hourly frame over all in-scope delivery days with the forecast available at gate closure.

        Also carries ``adjusted``: the forecast scaled by the trailing actual/forecast
        energy ratio (see :func:`trailing_ratios`), which uses only data that was
        settled before the decision was taken.
        """
        if gate not in self._decision_cache:
            gate_time = parse_gate(gate)
            start, end = self.evaluation_window()
            # Include the history available before the first delivery day for the trailing ratio.
            history_start = max(
                self.data.actuals["start_time"].min(), start - pd.Timedelta(days=ADJUST_WINDOW_DAYS + 2)
            )
            targets = self._target_times(history_start, end).to_frame()
            targets["cutoff"] = cutoffs_for_targets(targets["start_time"], gate_time, self.tz)
            frame = attach_actuals(latest_forecast_asof(self.data.forecasts, targets), self.data.actuals)
            frame["delivery_date"] = frame["start_time"].dt.tz_convert(self.tz).dt.date
            frame["lead_h"] = (frame["start_time"] - frame["publish_time"]).dt.total_seconds() / 3600
            frame["hour"] = frame["start_time"].dt.tz_convert(self.tz).dt.hour

            ratios = trailing_ratios(frame, self.delivery_dates)
            frame = frame[(frame["start_time"] >= start) & (frame["start_time"] < end)].copy()
            frame["adjust_ratio"] = frame["delivery_date"].map(ratios).astype(float)
            frame["adjusted"] = frame["forecast"] * frame["adjust_ratio"]
            frame["adjusted_error"] = frame["adjusted"] - frame["actual"]
            self._decision_cache[gate] = frame.reset_index(drop=True)
        return self._decision_cache[gate]

    def horizon_frame(
        self, horizon_h: float, start: pd.Timestamp | None = None, end: pd.Timestamp | None = None
    ) -> pd.DataFrame:
        """Hourly frame with the latest forecast published at least ``horizon_h`` hours before target."""
        if start is None or end is None:
            if horizon_h in self._horizon_cache:
                return self._horizon_cache[horizon_h]
            start, end = self.evaluation_window()
            cache = True
        else:
            cache = False
        targets = self._target_times(start, end).to_frame()
        targets["cutoff"] = targets["start_time"] - pd.Timedelta(hours=horizon_h)
        frame = attach_actuals(latest_forecast_asof(self.data.forecasts, targets), self.data.actuals)
        if cache:
            self._horizon_cache[horizon_h] = frame
        return frame

    # ----- product views -----

    def day_ahead(self, delivery_date: date, gate: str) -> dict:
        self.validate_delivery_date(delivery_date)
        frame = self.decision_frame(gate)
        day = frame[frame["delivery_date"] == delivery_date].copy()
        others = frame[frame["delivery_date"] != delivery_date]
        # Uncertainty calibrated on the *other* January days (leave-one-day-out).
        quantiles = error_quantiles(others["error"])
        day["low"], day["high"] = apply_band(day["forecast"], quantiles)

        start, end = delivery_window(delivery_date, self.tz)
        actuals = self.data.actuals
        actual_day = actuals[(actuals["start_time"] >= start) & (actuals["start_time"] < end)]

        publishes = day["publish_time"].dropna()
        summary = {
            "forecast_mwh": _energy(day["forecast"], FORECAST_STEP_H),
            "low_mwh": _energy(day["low"], FORECAST_STEP_H),
            "high_mwh": _energy(day["high"], FORECAST_STEP_H),
            "actual_mwh": _energy(actual_day["actual"], ACTUAL_STEP_H) if len(actual_day) else None,
            "adjusted_mwh": _energy(day["adjusted"], FORECAST_STEP_H),
            "adjust_ratio": _opt(day["adjust_ratio"].iloc[0]) if len(day) else None,
            "peak_forecast_mw": _opt(day["forecast"].max()),
            "min_forecast_mw": _opt(day["forecast"].min()),
            "metrics": error_metrics(day["forecast"], day["actual"]),
            "adjusted_metrics": error_metrics(day["adjusted"], day["actual"]),
        }
        return {
            "delivery_date": delivery_date,
            "gate": gate,
            "decision_cutoff": decision_cutoff(delivery_date, parse_gate(gate), self.tz),
            "forecast_publish_time": publishes.max() if len(publishes) else None,
            "lead_time_range_h": [_opt(day["lead_h"].min()), _opt(day["lead_h"].max())],
            "band_quantiles": {"error_p10": quantiles[0], "error_p90": quantiles[1]} if quantiles else None,
            "summary": summary,
            "forecast_points": day[
                ["start_time", "forecast", "adjusted", "low", "high", "publish_time", "actual", "error"]
            ],
            "actual_points": actual_day[["start_time", "actual"]],
        }

    def accuracy(self, gate: str) -> dict:
        frame = self.decision_frame(gate)
        paired = frame.dropna(subset=["forecast", "actual"])

        actuals = self.data.actuals
        actual_day = actuals["start_time"].dt.tz_convert(self.tz).dt.date
        actual_mwh_by_day = actuals.groupby(actual_day)["actual"].sum() * ACTUAL_STEP_H

        daily_rows = []
        covered = total = 0
        for day, group in frame.groupby("delivery_date", sort=True):
            q = error_quantiles(frame.loc[frame["delivery_date"] != day, "error"])
            low, high = apply_band(group["forecast"], q)
            inside = group["actual"].between(low, high) & group["actual"].notna()
            covered += int(inside.sum())
            total += int(group["actual"].notna().sum())
            m = error_metrics(group["forecast"], group["actual"])
            adj = error_metrics(group["adjusted"], group["actual"])
            daily_rows.append(
                {
                    "delivery_date": day,
                    "mae": m["mae"],
                    "bias": m["bias"],
                    "adjusted_mae": adj["mae"],
                    "forecast_mwh": _energy(group["forecast"], FORECAST_STEP_H),
                    "actual_mwh": _opt(actual_mwh_by_day.get(day, np.nan)),
                    "low_mwh": _energy(low, FORECAST_STEP_H),
                    "high_mwh": _energy(high, FORECAST_STEP_H),
                }
            )

        by_hour = [
            {"hour": int(hour), **_subset(error_metrics(g["forecast"], g["actual"]), ("mae", "bias", "n"))}
            for hour, g in paired.groupby("hour", sort=True)
        ]

        errors = paired["error"].to_numpy(dtype=float)
        histogram = _histogram(errors)
        quantile_levels = (0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95)
        quantiles = (
            {f"p{round(q * 100)}": float(np.quantile(errors, q)) for q in quantile_levels} if len(errors) else {}
        )

        return {
            "gate": gate,
            "delivery_start": self.delivery_dates[0],
            "delivery_end": self.delivery_dates[-1],
            "metrics": error_metrics(paired["forecast"], paired["actual"]),
            "adjusted_metrics": error_metrics(paired["adjusted"], paired["actual"]),
            "lead_time_range_h": [_opt(paired["lead_h"].min()), _opt(paired["lead_h"].max())],
            "band_coverage_pct": covered / total * 100 if total else None,
            "error_quantiles": quantiles,
            "histogram": histogram,
            "daily": daily_rows,
            "by_hour": by_hour,
            "by_horizon": self.horizon_curve(),
        }

    def horizon_curve(self, horizons: list[float] | None = None) -> list[dict]:
        horizons = horizons if horizons is not None else [float(h) for h in range(0, 49, 2)]
        rows = []
        for h in horizons:
            frame = self.horizon_frame(h)
            m = error_metrics(frame["forecast"], frame["actual"])
            rows.append({"horizon_h": h, **_subset(m, ("mae", "rmse", "bias", "n"))})
        return rows

    def series(self, start: pd.Timestamp, end: pd.Timestamp, horizon_h: float) -> dict:
        lo, hi = self.data_range()
        start, end = max(start, lo), min(end, hi + pd.Timedelta(minutes=30))
        if start >= end:
            raise InvalidRequestError("Requested range does not overlap the available data")
        if end - start > pd.Timedelta(days=35):
            raise InvalidRequestError("Range too large: max 35 days")
        frame = self.horizon_frame(horizon_h, start, end)
        actuals = self.data.actuals
        actual_rng = actuals[(actuals["start_time"] >= start) & (actuals["start_time"] < end)]
        return {
            "start": start,
            "end": end,
            "horizon_h": horizon_h,
            "metrics": error_metrics(frame["forecast"], frame["actual"]),
            "forecast_points": frame[["start_time", "forecast", "publish_time"]],
            "actual_points": actual_rng[["start_time", "actual"]],
        }

    def data_range(self) -> tuple[pd.Timestamp, pd.Timestamp]:
        a = self.data.actuals["start_time"]
        return a.min(), a.max()


# --------------------------------------------------------------------------- helpers


def _energy(mw: pd.Series, step_h: float) -> float | None:
    clean = mw.dropna()
    return float(clean.sum() * step_h) if len(clean) else None


def _opt(value: float) -> float | None:
    return None if pd.isna(value) else float(value)


def _subset(d: dict, keys: tuple[str, ...]) -> dict:
    return {k: d[k] for k in keys}


def _histogram(errors: np.ndarray, bin_mw: float = 500.0) -> list[dict]:
    if len(errors) == 0:
        return []
    edge = float(np.ceil(np.abs(errors).max() / bin_mw) * bin_mw) or bin_mw
    bins = np.arange(-edge, edge + bin_mw, bin_mw)
    counts, edges = np.histogram(errors, bins=bins)
    return [{"from_mw": float(edges[i]), "to_mw": float(edges[i + 1]), "count": int(c)} for i, c in enumerate(counts)]
