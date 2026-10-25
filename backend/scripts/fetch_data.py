"""Download the Elexon snapshot used by the app.

Usage (from the backend directory):
    python -m scripts.fetch_data

The window is derived from the configured decision period: decisions made on
``decision_start .. decision_end`` concern delivery on the following day, so we
need actuals up to ``decision_end + 1`` and every forecast published before the
last delivery day ends (plus a day of margin either side for the explorer view).
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, time, timedelta

import pandas as pd

from app.config import get_settings
from app.data import ACTUALS_FILE, FORECASTS_FILE
from app.elexon import ElexonClient

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("fetch_data")


async def main() -> None:
    settings = get_settings()
    settle_from = settings.decision_start - timedelta(days=1)
    settle_to = settings.decision_end + timedelta(days=1)
    publish_from = datetime.combine(settings.decision_start - timedelta(days=2), time(0), tzinfo=UTC)
    publish_to = datetime.combine(settings.decision_end + timedelta(days=2), time(0), tzinfo=UTC)

    async with ElexonClient(settings.elexon_base_url) as client:
        actuals, forecasts = await asyncio.gather(
            client.wind_actuals(settle_from, settle_to),
            client.wind_forecasts(publish_from, publish_to),
        )

    settings.data_dir.mkdir(parents=True, exist_ok=True)
    actuals_df = pd.DataFrame(actuals)[
        ["startTime", "publishTime", "settlementDate", "settlementPeriod", "fuelType", "generation"]
    ].sort_values("startTime")
    forecasts_df = pd.DataFrame(forecasts)[["publishTime", "startTime", "generation"]].sort_values(
        ["publishTime", "startTime"]
    )
    actuals_df.to_csv(settings.data_dir / ACTUALS_FILE, index=False)
    forecasts_df.to_csv(settings.data_dir / FORECASTS_FILE, index=False)
    logger.info(
        "Saved %d actual rows (%s .. %s) and %d forecast rows from %d publishes to %s",
        len(actuals_df),
        actuals_df["startTime"].min(),
        actuals_df["startTime"].max(),
        len(forecasts_df),
        forecasts_df["publishTime"].nunique(),
        settings.data_dir,
    )


if __name__ == "__main__":
    asyncio.run(main())
