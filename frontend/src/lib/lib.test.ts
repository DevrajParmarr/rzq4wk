import { describe, expect, it } from "vitest";

import type { ForecastPoint } from "../api/types";
import { dayAheadCsv, mergeDayAhead, mergeSeries, trimEmptyBins } from "./chartData";
import { addDays, fmtGW, fmtGWh, fmtMW, fmtTime, pctChange } from "./format";

const fp = (time: string, forecast: number, low: number | null = forecast - 100, high: number | null = forecast + 100): ForecastPoint => ({
  time,
  forecast,
  adjusted: forecast * 0.9,
  low,
  high,
  publish_time: "2026-01-14T07:30:00Z",
  actual: null,
  error: null,
});

describe("mergeDayAhead", () => {
  it("puts hourly forecasts and half-hourly actuals on one sorted axis", () => {
    const rows = mergeDayAhead(
      [fp("2026-01-15T01:00:00Z", 2000), fp("2026-01-15T00:00:00Z", 1000)],
      [
        { time: "2026-01-15T00:30:00Z", actual: 900 },
        { time: "2026-01-15T00:00:00Z", actual: 950 },
      ],
    );
    expect(rows.map((r) => r.t)).toEqual([
      Date.parse("2026-01-15T00:00:00Z"),
      Date.parse("2026-01-15T00:30:00Z"),
      Date.parse("2026-01-15T01:00:00Z"),
    ]);
    expect(rows[0]).toMatchObject({ actual: 950, forecast: 1000, band: [900, 1100] });
    expect(rows[1]).toMatchObject({ actual: 900, forecast: null, band: null });
    expect(rows[2]).toMatchObject({ actual: null, forecast: 2000 });
  });

  it("omits the band when either edge is missing", () => {
    const [row] = mergeDayAhead([fp("2026-01-15T00:00:00Z", 1000, null, 1200)], []);
    expect(row!.band).toBeNull();
  });
});

describe("mergeSeries", () => {
  it("joins on timestamp", () => {
    const rows = mergeSeries([{ time: "2026-01-15T00:00:00Z", forecast: 5 }], [{ time: "2026-01-15T00:00:00Z", actual: 4 }]);
    expect(rows).toEqual([{ t: Date.parse("2026-01-15T00:00:00Z"), actual: 4, forecast: 5 }]);
  });
});

describe("trimEmptyBins", () => {
  it("trims only leading and trailing empty bins", () => {
    const bins = [0, 0, 3, 0, 2, 0].map((count, i) => ({ count, i }));
    expect(trimEmptyBins(bins).map((b) => b.i)).toEqual([2, 3, 4]);
    expect(trimEmptyBins([{ count: 0 }])).toEqual([]);
  });
});

describe("dayAheadCsv", () => {
  it("writes a header and blank cells for nulls", () => {
    const csv = dayAheadCsv([fp("2026-01-15T00:00:00Z", 1000)]).split("\n");
    expect(csv[0]).toContain("forecast_mw");
    expect(csv[1]).toBe("2026-01-15T00:00:00Z,1000,900,900,1100,2026-01-14T07:30:00Z,,");
  });
});

describe("format helpers", () => {
  it("formats power and energy", () => {
    expect(fmtMW(1234.4)).toBe("1,234 MW");
    expect(fmtMW(250, true)).toBe("+250 MW");
    expect(fmtMW(null)).toBe("–");
    expect(fmtGW(1745.9, true)).toBe("+1.75 GW");
    expect(fmtGWh(278630)).toBe("278.6 GWh");
  });

  it("shows times in UK local time across the clock change", () => {
    expect(fmtTime("2026-01-15T09:20:00Z")).toBe("09:20"); // GMT
    expect(fmtTime("2026-06-15T08:20:00Z")).toBe("09:20"); // BST
  });

  it("computes relative change and date arithmetic", () => {
    expect(pctChange(2000, 1400)).toBeCloseTo(-30);
    expect(pctChange(0, 5)).toBeNull();
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
  });
});
