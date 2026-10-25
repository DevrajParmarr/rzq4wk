"""Minimal async client for the two Elexon BMRS datasets the product relies on.

* FUELHH  - half-hourly outturn generation by fuel type (we keep ``fuelType == WIND``)
* WINDFOR - wind generation forecasts; every publish holds an hourly forecast curve
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Iterator
from datetime import date, datetime, timedelta
from typing import Any

import httpx

logger = logging.getLogger(__name__)

MAX_RETRIES = 4


def date_chunks(start: date, end: date, days: int) -> Iterator[tuple[date, date]]:
    """Split the inclusive range [start, end] into consecutive chunks of ``days`` days."""
    cursor = start
    while cursor <= end:
        chunk_end = min(cursor + timedelta(days=days - 1), end)
        yield cursor, chunk_end
        cursor = chunk_end + timedelta(days=1)


def datetime_chunks(start: datetime, end: datetime, days: int) -> Iterator[tuple[datetime, datetime]]:
    """Split the half-open range [start, end) into windows of ``days`` days."""
    cursor = start
    while cursor < end:
        chunk_end = min(cursor + timedelta(days=days), end)
        yield cursor, chunk_end
        cursor = chunk_end


def _iso(ts: datetime) -> str:
    return ts.strftime("%Y-%m-%dT%H:%M:%SZ")


class ElexonClient:
    def __init__(self, base_url: str, timeout: float = 60.0) -> None:
        self._client = httpx.AsyncClient(base_url=base_url, timeout=timeout)

    async def __aenter__(self) -> ElexonClient:
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self._client.aclose()

    async def _get(self, path: str, params: dict[str, str]) -> list[dict[str, Any]]:
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                response = await self._client.get(path, params=params)
                response.raise_for_status()
                payload = response.json()
                # Stream endpoints return a bare list; non-stream ones wrap it in {"data": [...]}.
                return payload["data"] if isinstance(payload, dict) else payload
            except (httpx.HTTPError, ValueError) as exc:
                if attempt == MAX_RETRIES:
                    raise
                delay = 2**attempt
                logger.warning("Elexon %s failed (%s), retry %d in %ds", path, exc, attempt, delay)
                await asyncio.sleep(delay)
        raise AssertionError("unreachable")

    async def wind_actuals(self, settlement_from: date, settlement_to: date) -> list[dict[str, Any]]:
        """FUELHH wind outturn for settlement dates in [settlement_from, settlement_to]."""
        tasks = [
            self._get(
                "/datasets/FUELHH/stream",
                {
                    "settlementDateFrom": lo.isoformat(),
                    "settlementDateTo": hi.isoformat(),
                    "fuelType": "WIND",
                },
            )
            for lo, hi in date_chunks(settlement_from, settlement_to, days=7)
        ]
        rows = [row for chunk in await asyncio.gather(*tasks) for row in chunk]
        return [row for row in rows if row.get("fuelType") == "WIND"]

    async def wind_forecasts(self, publish_from: datetime, publish_to: datetime) -> list[dict[str, Any]]:
        """WINDFOR forecasts published in [publish_from, publish_to) (UTC)."""
        tasks = [
            self._get(
                "/datasets/WINDFOR/stream",
                {"publishDateTimeFrom": _iso(lo), "publishDateTimeTo": _iso(hi)},
            )
            for lo, hi in datetime_chunks(publish_from, publish_to, days=7)
        ]
        return [row for chunk in await asyncio.gather(*tasks) for row in chunk]
