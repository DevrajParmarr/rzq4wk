import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useSeries } from "../api/queries";
import type { Meta } from "../api/types";
import { axisProps, tooltipContent, type TooltipRow } from "../components/chart";
import { ErrorState, LegendItem, LoadingPage, PageHeader, Panel, Stat, StatGroup } from "../components/ui";
import { gwLabel, mergeSeries, niceTicks, type SeriesRow } from "../lib/chartData";
import { addDays, fmtDay, fmtDayTime, fmtMW, fmtNumber, fmtPct, fmtTime } from "../lib/format";
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

  const yTicks = useMemo(() => niceTicks(Math.max(0, ...rows.flatMap((r) => [r.actual ?? 0, r.forecast ?? 0]))), [rows]);

  const renderTooltip = useMemo(
    () =>
      tooltipContent<SeriesRow>((row, label) => {
        const out: TooltipRow[] = [];
        if (row.forecast != null) out.push({ label: "Forecast", value: fmtMW(row.forecast), color: theme.forecast });
        if (row.actual != null) out.push({ label: "Actual", value: fmtMW(row.actual), color: theme.actual });
        if (row.forecast != null && row.actual != null)
          out.push({ label: "Forecast error", value: fmtMW(row.forecast - row.actual, true), emphasis: true });
        return { title: fmtDayTime(Number(label)), rows: out };
      }),
    [theme],
  );

  return (
    <div className="view">
      <PageHeader
        eyebrow="Analysis"
        title="Forecast explorer"
        description="Pick a period and how far ahead the forecast was made. Accuracy falls as the horizon grows."
      />

      <Panel>
        <div className="controls">
          <label className="field">
            <span className="field-label">From</span>
            <input
              className="select"
              type="date"
              value={startDate}
              min={minDate}
              max={maxDate}
              onChange={(e) => e.target.value && setStartDate(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">To</span>
            <input
              className="select"
              type="date"
              value={endDate}
              min={minDate}
              max={maxDate}
              onChange={(e) => e.target.value && setEndDate(e.target.value)}
            />
          </label>
          <label className="field field-grow">
            <span className="field-label">
              Forecast made at least <output className="field-value">{horizon} h ahead</output>
            </span>
            <input
              className="range"
              type="range"
              min={0}
              max={48}
              step={1}
              value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))}
              aria-valuetext={`${horizon} hours`}
            />
            <span className="range-scale" aria-hidden="true">
              <span>0 h</span>
              <span>12 h</span>
              <span>24 h</span>
              <span>36 h</span>
              <span>48 h</span>
            </span>
          </label>
        </div>
        {!rangeValid && <p className="field-error">The start date must be on or before the end date.</p>}
      </Panel>

      {error && <ErrorState error={error} onRetry={() => refetch()} />}
      {isPending && rangeValid && !error && <LoadingPage />}

      {data && (
        <>
          <StatGroup busy={isFetching}>
            <Stat
              label="Average hourly miss"
              value={fmtNumber(data.metrics.mae)}
              unit="MW"
              detail={`${fmtPct(data.metrics.nmae_pct, 1)} of average output`}
            />
            <Stat label="Bias" value={`${(data.metrics.bias ?? 0) > 0 ? "+" : ""}${fmtNumber(data.metrics.bias)}`} unit="MW" detail="Forecast minus actual" />
            <Stat label="P90 absolute error" value={fmtNumber(data.metrics.p90_abs_error)} unit="MW" detail="9 in 10 hours within" />
          </StatGroup>

          <Panel
            title="Actual vs forecast wind"
            description={`${fmtDay(data.start)} to ${fmtDay(Date.parse(data.end) - 1)} · ${data.metrics.n} hours · MW`}
            actions={
              <div className="legend">
                <LegendItem color={theme.actual} label="Actual" />
                <LegendItem color={theme.forecast} label={`Forecast, at least ${data.horizon_h} h old`} />
              </div>
            }
          >
            <div className={`chart chart-lg ${isFetching ? "is-busy" : ""}`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={theme.grid} vertical={false} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    ticks={ticks}
                    tickFormatter={(t: number) => fmtDay(t)}
                    {...axisProps(theme)}
                    dy={6}
                  />
                  <YAxis ticks={yTicks} domain={[0, yTicks[yTicks.length - 1] ?? "auto"]} tickFormatter={gwLabel} {...axisProps(theme)} width={56} />
                  <Tooltip content={renderTooltip} cursor={{ stroke: theme.cursor }} />
                  <Line type="monotone" dataKey="actual" stroke={theme.actual} strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
                  <Line type="monotone" dataKey="forecast" stroke={theme.forecast} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
