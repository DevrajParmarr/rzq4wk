import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useSeries } from "../api/queries";
import type { Meta } from "../api/types";
import { ErrorBox, Kpi, LegendDot, Loading, Panel } from "../components/ui";
import { mergeSeries } from "../lib/chartData";
import { addDays, fmtDay, fmtDayTime, fmtMW, fmtPct, fmtTime } from "../lib/format";
import { useChartTheme } from "../lib/theme";
import { useDebounced } from "../lib/urlState";

export function ExplorerView({ meta }: { meta: Meta }) {
  const theme = useChartTheme();
  const minDate = meta.delivery_dates[0]!;
  const maxDate = meta.delivery_dates[meta.delivery_dates.length - 1]!;
  const [startDate, setStartDate] = useState(minDate);
  const [endDate, setEndDate] = useState(addDays(minDate, 6));
  const [horizon, setHorizon] = useState(4);
  const debouncedHorizon = useDebounced(horizon, 250);

  const rangeValid = startDate <= endDate;
  const start = `${startDate}T00:00:00Z`;
  const end = `${addDays(endDate, 1)}T00:00:00Z`;
  const { data, error, isPending, isFetching, refetch } = useSeries(rangeValid ? start : "", rangeValid ? end : "", debouncedHorizon);
  const rows = useMemo(() => (data ? mergeSeries(data.forecast_points, data.actual_points) : []), [data]);
  // One tick per UK midnight, thinned to at most ~10 labels for long ranges.
  const ticks = useMemo(() => {
    const midnights = rows.filter((r) => fmtTime(r.t) === "00:00").map((r) => r.t);
    const step = Math.max(1, Math.ceil(midnights.length / 10));
    return midnights.filter((_, i) => i % step === 0);
  }, [rows]);

  return (
    <div className="view">
      <div className="toolbar">
        <div className="field-row">
          <label className="field">
            <span>From</span>
            <input type="date" value={startDate} min={minDate} max={maxDate} onChange={(e) => e.target.value && setStartDate(e.target.value)} />
          </label>
          <label className="field">
            <span>To</span>
            <input type="date" value={endDate} min={minDate} max={maxDate} onChange={(e) => e.target.value && setEndDate(e.target.value)} />
          </label>
          <label className="field field-slider">
            <span>
              Forecast horizon: <strong>{horizon} h</strong>
            </span>
            <input
              type="range"
              min={0}
              max={48}
              step={1}
              value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))}
              aria-label="Forecast horizon in hours"
            />
          </label>
        </div>
        <p className="toolbar-hint">
          For each hour, the forecast shown is the latest one published at least {horizon} h earlier. Drag the slider to watch
          accuracy degrade.
        </p>
      </div>

      {!rangeValid && <ErrorBox error={new Error("The start date must be on or before the end date.")} />}
      {error && <ErrorBox error={error} onRetry={() => refetch()} />}
      {isPending && rangeValid && !error && <Loading />}

      {data && (
        <>
          <div className={`kpi-grid ${isFetching ? "is-refreshing" : ""}`}>
            <Kpi label="Mean absolute error" value={fmtMW(data.metrics.mae)} sub={`${fmtPct(data.metrics.nmae_pct, 1)} of mean outturn`} tone="accent" />
            <Kpi label="Bias" value={fmtMW(data.metrics.bias, true)} sub="Forecast − actual" />
            <Kpi label="P90 absolute error" value={fmtMW(data.metrics.p90_abs_error)} />
            <Kpi label="Hours compared" value={String(data.metrics.n)} sub={`Horizon ≥ ${data.horizon_h} h`} />
          </div>
          <Panel
            title="Actual vs forecast generation"
            subtitle={`${fmtDay(data.start)} to ${fmtDay(new Date(Date.parse(data.end) - 1).toISOString())} · MW`}
            actions={
              <div className="legend">
                <LegendDot color={theme.actual} label="Actual" />
                <LegendDot color={theme.forecast} label={`Forecast (≥ ${data.horizon_h} h ahead)`} />
              </div>
            }
          >
            <div className="chart chart-tall">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                  <CartesianGrid stroke={theme.grid} vertical={false} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    ticks={ticks}
                    tickFormatter={(t: number) => fmtDay(t)}
                    stroke={theme.axis}
                    fontSize={12}
                  />
                  <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)} GW`} stroke={theme.axis} fontSize={12} width={56} />
                  <Tooltip
                    contentStyle={{ background: theme.tooltipBg, borderColor: theme.tooltipBorder, borderRadius: 8 }}
                    labelFormatter={(t) => fmtDayTime(Number(t))}
                    formatter={(v, name) => [fmtMW(Number(v)), name === "actual" ? "Actual" : "Forecast"]}
                  />
                  <Line dataKey="actual" stroke={theme.actual} strokeWidth={1.8} dot={false} connectNulls isAnimationActive={false} />
                  <Line dataKey="forecast" stroke={theme.forecast} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
