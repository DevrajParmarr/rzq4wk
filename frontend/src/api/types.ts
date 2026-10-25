// Mirrors backend/app/schemas.py. Timestamps are ISO-8601 UTC strings.

export interface ErrorMetrics {
  n: number;
  mae: number | null;
  rmse: number | null;
  bias: number | null;
  nmae_pct: number | null;
  p50_abs_error: number | null;
  p90_abs_error: number | null;
  max_abs_error: number | null;
  over_forecast_pct: number | null;
  correlation: number | null;
}

export interface GatePreset {
  time: string;
  label: string;
  description: string;
}

export interface Meta {
  version: string;
  timezone: string;
  default_gate: string;
  gate_presets: GatePreset[];
  decision_start: string;
  decision_end: string;
  delivery_dates: string[];
  coverage: {
    actuals_from: string;
    actuals_to: string;
    actual_rows: number;
    forecast_rows: number;
    forecast_publishes: number;
    first_publish: string;
    last_publish: string;
  };
  sources: Record<string, string>;
}

export interface ForecastPoint {
  time: string;
  forecast: number | null;
  adjusted: number | null;
  low: number | null;
  high: number | null;
  publish_time: string | null;
  actual: number | null;
  error: number | null;
}

export interface ActualPoint {
  time: string;
  actual: number | null;
}

export interface DayAhead {
  delivery_date: string;
  gate: string;
  decision_cutoff: string;
  forecast_publish_time: string | null;
  lead_time_range_h: [number | null, number | null];
  band_quantiles: { error_p10: number; error_p90: number } | null;
  summary: {
    forecast_mwh: number | null;
    low_mwh: number | null;
    high_mwh: number | null;
    actual_mwh: number | null;
    adjusted_mwh: number | null;
    adjust_ratio: number | null;
    peak_forecast_mw: number | null;
    min_forecast_mw: number | null;
    metrics: ErrorMetrics;
    adjusted_metrics: ErrorMetrics;
  };
  forecast_points: ForecastPoint[];
  actual_points: ActualPoint[];
}

export interface DailyAccuracy {
  delivery_date: string;
  mae: number | null;
  bias: number | null;
  adjusted_mae: number | null;
  forecast_mwh: number | null;
  actual_mwh: number | null;
  low_mwh: number | null;
  high_mwh: number | null;
}

export interface Accuracy {
  gate: string;
  delivery_start: string;
  delivery_end: string;
  metrics: ErrorMetrics;
  adjusted_metrics: ErrorMetrics;
  lead_time_range_h: [number | null, number | null];
  band_coverage_pct: number | null;
  error_quantiles: Record<string, number>;
  histogram: { from_mw: number; to_mw: number; count: number }[];
  daily: DailyAccuracy[];
  by_hour: { hour: number; mae: number | null; bias: number | null; n: number }[];
  by_horizon: { horizon_h: number; mae: number | null; rmse: number | null; bias: number | null; n: number }[];
}

export interface Series {
  start: string;
  end: string;
  horizon_h: number;
  metrics: ErrorMetrics;
  forecast_points: { time: string; forecast: number | null; publish_time: string | null }[];
  actual_points: ActualPoint[];
}
