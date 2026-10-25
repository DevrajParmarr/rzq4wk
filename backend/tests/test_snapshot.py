"""Invariants checked against the real January 2026 Elexon snapshot (skipped if absent)."""

from __future__ import annotations

from datetime import date

import pytest

from app.analysis import WindAnalytics
from app.config import get_settings
from app.data import ACTUALS_FILE, DataUnavailableError, WindData

settings = get_settings()
pytestmark = pytest.mark.skipif(
    not (settings.data_dir / ACTUALS_FILE).exists(), reason="Elexon snapshot not downloaded"
)


@pytest.fixture(scope="module")
def real() -> WindAnalytics:
    return WindAnalytics(WindData.load(settings.data_dir), settings.timezone, date(2026, 1, 1), date(2026, 1, 31))


@pytest.mark.parametrize("gate", ["09:20", "09:50", "11:00"])
def test_no_lookahead_and_full_coverage(real: WindAnalytics, gate: str) -> None:
    frame = real.decision_frame(gate)
    assert (frame["publish_time"] <= frame["cutoff"]).all()
    assert frame["forecast"].notna().all()
    assert frame["actual"].notna().all()
    assert frame["delivery_date"].nunique() == 31
    assert len(frame) == 31 * 24


def test_missing_snapshot_raises_clear_error(tmp_path) -> None:
    with pytest.raises(DataUnavailableError):
        WindData.load(tmp_path)
