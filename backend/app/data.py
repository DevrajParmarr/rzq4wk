"""Loading and cleaning the Elexon snapshot into tidy pandas frames.

All timestamps are tz-aware UTC with nanosecond resolution so that joins
(``merge_asof`` in particular) never trip over mismatched dtypes.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pandas as pd

ACTUALS_FILE = "wind_actuals.csv"
FORECASTS_FILE = "wind_forecasts.csv"
TS_DTYPE = "datetime64[ns, UTC]"


class DataUnavailableError(RuntimeError):
    """Raised when the snapshot files are missing."""


def to_utc(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, utc=True).astype(TS_DTYPE)


def clean_actuals(raw: pd.DataFrame) -> pd.DataFrame:
    """One row per half-hour: ``start_time``, ``actual`` (MW), ``publish_time``.

    FUELHH can be re-published for the same period; the latest publish wins.
    """
    df = pd.DataFrame(
        {
            "start_time": to_utc(raw["startTime"]),
            "publish_time": to_utc(raw["publishTime"]),
            "actual": pd.to_numeric(raw["generation"], errors="coerce").astype(float),
        }
    ).dropna(subset=["actual"])
    df = df.sort_values(["start_time", "publish_time"]).drop_duplicates("start_time", keep="last")
    return df.reset_index(drop=True)


def clean_forecasts(raw: pd.DataFrame) -> pd.DataFrame:
    """One row per (publish_time, start_time) with the forecast in MW."""
    df = pd.DataFrame(
        {
            "publish_time": to_utc(raw["publishTime"]),
            "start_time": to_utc(raw["startTime"]),
            "forecast": pd.to_numeric(raw["generation"], errors="coerce").astype(float),
        }
    ).dropna(subset=["forecast"])
    df = df.drop_duplicates(["publish_time", "start_time"], keep="last")
    return df.sort_values(["publish_time", "start_time"]).reset_index(drop=True)


@dataclass(frozen=True)
class WindData:
    actuals: pd.DataFrame
    forecasts: pd.DataFrame

    @classmethod
    def from_raw(cls, actuals_raw: pd.DataFrame, forecasts_raw: pd.DataFrame) -> WindData:
        return cls(actuals=clean_actuals(actuals_raw), forecasts=clean_forecasts(forecasts_raw))

    @classmethod
    def load(cls, data_dir: Path) -> WindData:
        actuals_path = data_dir / ACTUALS_FILE
        forecasts_path = data_dir / FORECASTS_FILE
        missing = [p.name for p in (actuals_path, forecasts_path) if not p.exists()]
        if missing:
            raise DataUnavailableError(
                f"Missing data files {missing} in {data_dir}. Run `python -m scripts.fetch_data`."
            )
        return cls.from_raw(pd.read_csv(actuals_path), pd.read_csv(forecasts_path))
