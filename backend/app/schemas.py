"""Public API contract (pydantic models). Also drives the OpenAPI docs at /api/docs."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field


class ErrorMetrics(BaseModel):
    n: int = Field(description="Number of paired forecast/actual hourly observations")
    mae: float | None = Field(description="Mean absolute error, MW")
    rmse: float | None = Field(description="Root mean squared error, MW")
    bias: float | None = Field(description="Mean error (forecast - actual), MW. Positive = over-forecast")
    nmae_pct: float | None = Field(description="MAE as % of mean actual generation")
    p50_abs_error: float | None = Field(description="Median absolute error, MW")
    p90_abs_error: float | None = Field(description="90th percentile absolute error, MW")
    max_abs_error: float | None = Field(description="Worst absolute error, MW")
    over_forecast_pct: float | None = Field(description="% of periods where forecast exceeded actual")
    correlation: float | None = Field(description="Pearson correlation of forecast vs actual")


class GatePreset(BaseModel):
    time: str
    label: str
    description: str


class DataCoverage(BaseModel):
    actuals_from: datetime
    actuals_to: datetime
    actual_rows: int
    forecast_rows: int
    forecast_publishes: int
    first_publish: datetime
    last_publish: datetime


class MetaResponse(BaseModel):
    version: str
    timezone: str
    default_gate: str
    gate_presets: list[GatePreset]
    decision_start: date
    decision_end: date
    delivery_dates: list[date]
    coverage: DataCoverage
    sources: dict[str, str]


class ForecastPoint(BaseModel):
    time: datetime
    forecast: float | None
    adjusted: float | None = Field(description="Forecast scaled by the trailing 7-day actual/forecast ratio")
    low: float | None = Field(description="P10 of expected actual (empirical 80% range, lower edge)")
    high: float | None = Field(description="P90 of expected actual (empirical 80% range, upper edge)")
    publish_time: datetime | None
    actual: float | None
    error: float | None


class ActualPoint(BaseModel):
    time: datetime
    actual: float | None


class DaySummary(BaseModel):
    forecast_mwh: float | None
    low_mwh: float | None
    high_mwh: float | None
    actual_mwh: float | None
    adjusted_mwh: float | None
    adjust_ratio: float | None
    peak_forecast_mw: float | None
    min_forecast_mw: float | None
    metrics: ErrorMetrics
    adjusted_metrics: ErrorMetrics


class BandQuantiles(BaseModel):
    error_p10: float
    error_p90: float


class DayAheadResponse(BaseModel):
    delivery_date: date
    gate: str
    decision_cutoff: datetime
    forecast_publish_time: datetime | None = Field(description="Publish time of the latest forecast used")
    decision_day_publishes: list[datetime] = Field(description="Every forecast publish time on the decision day D-1")
    lead_time_range_h: list[float | None]
    band_quantiles: BandQuantiles | None
    summary: DaySummary
    forecast_points: list[ForecastPoint]
    actual_points: list[ActualPoint]


class HistogramBin(BaseModel):
    from_mw: float
    to_mw: float
    count: int


class DailyAccuracy(BaseModel):
    delivery_date: date
    mae: float | None
    bias: float | None
    adjusted_mae: float | None
    forecast_mwh: float | None
    actual_mwh: float | None
    low_mwh: float | None
    high_mwh: float | None


class HourAccuracy(BaseModel):
    hour: int
    mae: float | None
    bias: float | None
    n: int


class HorizonAccuracy(BaseModel):
    horizon_h: float
    mae: float | None
    rmse: float | None
    bias: float | None
    n: int


class AccuracyResponse(BaseModel):
    gate: str
    delivery_start: date
    delivery_end: date
    metrics: ErrorMetrics
    adjusted_metrics: ErrorMetrics
    lead_time_range_h: list[float | None]
    band_coverage_pct: float | None = Field(description="% of actuals inside the leave-one-day-out 80% range")
    error_quantiles: dict[str, float]
    histogram: list[HistogramBin]
    daily: list[DailyAccuracy]
    by_hour: list[HourAccuracy]
    by_horizon: list[HorizonAccuracy]


class SeriesForecastPoint(BaseModel):
    time: datetime
    forecast: float | None
    publish_time: datetime | None


class SeriesResponse(BaseModel):
    start: datetime
    end: datetime
    horizon_h: float
    metrics: ErrorMetrics
    forecast_points: list[SeriesForecastPoint]
    actual_points: list[ActualPoint]
