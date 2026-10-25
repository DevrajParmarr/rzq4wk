"""Convert analysis outputs (pandas/numpy objects) into JSON-friendly Python values."""

from __future__ import annotations

import math
from datetime import date, datetime
from typing import Any

import numpy as np
import pandas as pd

FLOAT_DECIMALS = 2


def to_jsonable(value: Any) -> Any:
    if isinstance(value, pd.DataFrame):
        frame = value.rename(columns={"start_time": "time"})
        return [to_jsonable(row) for row in frame.to_dict(orient="records")]
    if isinstance(value, dict):
        return {key: to_jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_jsonable(item) for item in value]
    if value is None or value is pd.NaT:
        return None
    if isinstance(value, pd.Timestamp):
        return value.to_pydatetime()
    if isinstance(value, (datetime, date, str, bool)):
        return value
    if isinstance(value, (np.integer, int)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        number = float(value)
        return None if math.isnan(number) or math.isinf(number) else round(number, FLOAT_DECIMALS)
    return value
