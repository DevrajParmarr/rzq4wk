import type { ActualPoint, ForecastPoint } from "../api/types";

export interface DayChartRow {
  t: number;
  actual: number | null;
  forecast: number | null;
  adjusted: number | null;
  band: [number, number] | null;
}

/**
 * Merge hourly forecast points and half-hourly actuals onto one time axis (epoch ms).
 * Forecast-only fields are null on the :30 rows; lines use connectNulls to stay continuous.
 */
export function mergeDayAhead(forecasts: ForecastPoint[], actuals: ActualPoint[]): DayChartRow[] {
  const rows = new Map<number, DayChartRow>();
  const row = (t: number): DayChartRow => {
    let r = rows.get(t);
    if (!r) {
      r = { t, actual: null, forecast: null, adjusted: null, band: null };
      rows.set(t, r);
    }
    return r;
  };
  for (const a of actuals) row(Date.parse(a.time)).actual = a.actual;
  for (const f of forecasts) {
    const r = row(Date.parse(f.time));
    r.forecast = f.forecast;
    r.adjusted = f.adjusted;
    r.band = f.low !== null && f.high !== null ? [f.low, f.high] : null;
  }
  return [...rows.values()].sort((a, b) => a.t - b.t);
}

export interface SeriesRow {
  t: number;
  actual: number | null;
  forecast: number | null;
}

export function mergeSeries(
  forecasts: { time: string; forecast: number | null }[],
  actuals: ActualPoint[],
): SeriesRow[] {
  const rows = new Map<number, SeriesRow>();
  for (const a of actuals) rows.set(Date.parse(a.time), { t: Date.parse(a.time), actual: a.actual, forecast: null });
  for (const f of forecasts) {
    const t = Date.parse(f.time);
    const existing = rows.get(t);
    if (existing) existing.forecast = f.forecast;
    else rows.set(t, { t, actual: null, forecast: f.forecast });
  }
  return [...rows.values()].sort((a, b) => a.t - b.t);
}

/** Drop empty bins at either end of a histogram (keeps interior gaps). */
export function trimEmptyBins<T extends { count: number }>(bins: T[]): T[] {
  const first = bins.findIndex((b) => b.count > 0);
  if (first === -1) return [];
  let last = bins.length - 1;
  while (last > first && bins[last]!.count === 0) last--;
  return bins.slice(first, last + 1);
}

/** Hourly forecast table as CSV (UTC timestamps, MW). */
export function dayAheadCsv(points: ForecastPoint[]): string {
  const header = "start_time_utc,forecast_mw,adjusted_mw,p10_mw,p90_mw,forecast_publish_time_utc,actual_mw,error_mw";
  const cell = (v: number | string | null) => (v === null ? "" : String(v));
  const lines = points.map((p) =>
    [p.time, p.forecast, p.adjusted, p.low, p.high, p.publish_time, p.actual, p.error].map(cell).join(","),
  );
  return [header, ...lines].join("\n");
}
