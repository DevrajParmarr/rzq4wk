import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useDayAhead } from "../api/queries";
import type { Meta } from "../api/types";
import { ErrorBox, Kpi, LegendDot, Loading, Panel, Toggle } from "../components/ui";
import { type DayChartRow, dayAheadCsv, mergeDayAhead } from "../lib/chartData";
import { fmtDayTime, fmtGW, fmtGWh, fmtHours, fmtLongDate, fmtMW, fmtPct, fmtShortDate, fmtTime } from "../lib/format";
import { type ChartTheme, useChartTheme } from "../lib/theme";

interface Props {
  meta: Meta;
  gate: string;
  gateLabel: string;
  date: string;
  onDateChange: (date: string) => void;
}

export function DayAheadView({ meta, gate, gateLabel, date, onDateChange }: Props) {
  const theme = useChartTheme();
  const [showActual, setShowActual] = useState(true);
  const [showAdjusted, setShowAdjusted] = useState(false);
  const { data, error, isPending, isFetching, refetch } = useDayAhead(date, gate);

  const dates = meta.delivery_dates;
  const idx = dates.indexOf(date);
  const rows = useMemo(() => (data ? mergeDayAhead(data.forecast_points, data.actual_points) : []), [data]);
  const ticks = useMemo(() => rows.filter((r) => new Date(r.t).getUTCMinutes() === 0).map((r) => r.t).filter((_, i) => i % 3 === 0), [rows]);

  const s = data?.summary;
  const dayError = s?.forecast_mwh != null && s.actual_mwh ? ((s.forecast_mwh - s.actual_mwh) / s.actual_mwh) * 100 : null;

  const downloadCsv = () => {
    if (!data) return;
    const blob = new Blob([dayAheadCsv(data.forecast_points)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `windsight_${data.delivery_date}_gate-${gate.replace(":", "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="view">
      <div className="toolbar">
        <div className="date-nav" role="group" aria-label="Delivery day">
          <button type="button" className="btn btn-icon" onClick={() => onDateChange(dates[idx - 1]!)} disabled={idx <= 0} aria-label="Previous day">
            ‹
          </button>
          <select value={date} onChange={(e) => onDateChange(e.target.value)} aria-label="Select delivery day">
            {dates.map((d) => (
              <option key={d} value={d}>
                Delivery {fmtLongDate(d)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => onDateChange(dates[idx + 1]!)}
            disabled={idx < 0 || idx >= dates.length - 1}
            aria-label="Next day"
          >
            ›
          </button>
        </div>
        <div className="toolbar-right">
          <Toggle label="Show outturn (hindsight)" checked={showActual} onChange={setShowActual} />
          <Toggle label="Adjusted forecast (beta)" checked={showAdjusted} onChange={setShowAdjusted} />
          <button type="button" className="btn btn-small" onClick={downloadCsv} disabled={!data}>
            Download CSV
          </button>
        </div>
      </div>

      {error && <ErrorBox error={error} onRetry={() => refetch()} />}
      {isPending && !error && <Loading label="Loading delivery day…" />}

      {data && s && (
        <>
          <div className="decision-strip" aria-live="polite">
            <div>
              <span className="strip-label">Decision deadline</span>
              <strong>{fmtDayTime(data.decision_cutoff)}</strong>
              <span className="strip-muted">{gateLabel}</span>
            </div>
            <div>
              <span className="strip-label">Latest forecast available</span>
              <strong>{data.forecast_publish_time ? `Published ${fmtDayTime(data.forecast_publish_time)}` : "None"}</strong>
              <span className="strip-muted">Elexon WINDFOR</span>
            </div>
            <div>
              <span className="strip-label">Lead time to delivery</span>
              <strong>
                {fmtHours(data.lead_time_range_h[0])} – {fmtHours(data.lead_time_range_h[1])}
              </strong>
              <span className="strip-muted">Delivery {fmtShortDate(data.delivery_date)}, 00:00–24:00 UK</span>
            </div>
          </div>

          <div className={`kpi-grid ${isFetching ? "is-refreshing" : ""}`}>
            <Kpi
              label="Wind forecast for the day"
              value={fmtGWh(s.forecast_mwh)}
              sub={`Peak ${fmtGW(s.peak_forecast_mw, false, 1)} · trough ${fmtGW(s.min_forecast_mw, false, 1)}`}
              tone="accent"
            />
            <Kpi
              label="80% likely range"
              value={`${s.low_mwh != null ? Math.round(s.low_mwh / 1000) : "–"}–${fmtGWh(s.high_mwh, 0)}`}
              sub="Hourly P10–P90 from January errors"
            />
            <Kpi
              label="Adjusted forecast (beta)"
              value={fmtGWh(s.adjusted_mwh)}
              sub={s.adjust_ratio != null ? `Forecast × ${s.adjust_ratio.toFixed(2)} (trailing 7 settled days)` : "–"}
            />
            {showActual ? (
              <>
                <Kpi
                  label="Actual outturn"
                  value={fmtGWh(s.actual_mwh)}
                  sub={dayError != null ? `Forecast was ${dayError >= 0 ? "+" : ""}${fmtPct(dayError, 1)} vs actual` : "–"}
                  tone={dayError != null && dayError > 10 ? "warn" : "neutral"}
                />
                <Kpi
                  label="Hourly mean abs. error"
                  value={fmtMW(s.metrics.mae)}
                  sub={`Adjusted: ${fmtMW(s.adjusted_metrics.mae)}`}
                  tone={
                    s.adjusted_metrics.mae != null && s.metrics.mae != null && s.adjusted_metrics.mae < s.metrics.mae ? "good" : "neutral"
                  }
                />
              </>
            ) : (
              <Kpi label="Outturn hidden" value="—" sub="Toggle 'Show outturn' to compare with actuals" />
            )}
          </div>

          <Panel
            title="Wind generation: forecast at decision time vs outturn"
            subtitle="National wind, MW. Times in UK local time."
            actions={
              <div className="legend">
                <LegendDot color={theme.forecast} label="Forecast at deadline" />
                <LegendDot color={theme.band} label="80% likely range" area />
                {showAdjusted && <LegendDot color={theme.adjusted} label="Adjusted forecast" dashed />}
                {showActual && <LegendDot color={theme.actual} label="Actual outturn" />}
              </div>
            }
          >
            <div className="chart chart-tall">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                  <CartesianGrid stroke={theme.grid} vertical={false} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    ticks={ticks}
                    tickFormatter={(t: number) => fmtTime(t)}
                    stroke={theme.axis}
                    fontSize={12}
                  />
                  <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)} GW`} stroke={theme.axis} fontSize={12} width={56} />
                  <Tooltip
                    content={(p) => (
                      <DayTooltip {...(p as unknown as TipProps)} theme={theme} showActual={showActual} showAdjusted={showAdjusted} />
                    )}
                  />
                  <Area
                    dataKey="band"
                    stroke="none"
                    fill={theme.band}
                    fillOpacity={0.45}
                    connectNulls
                    isAnimationActive={false}
                    name="80% range"
                  />
                  <Line dataKey="forecast" stroke={theme.forecast} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
                  {showAdjusted && (
                    <Line
                      dataKey="adjusted"
                      stroke={theme.adjusted}
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  )}
                  {showActual && (
                    <Line dataKey="actual" stroke={theme.actual} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="footnote">
              The forecast shown is the latest Elexon WINDFOR publish available at the deadline. Nothing published after it is
              used. The shaded range comes from January forecast errors on the other delivery days, so it reflects how far
              outturn typically lands from this forecast.
            </p>
          </Panel>
        </>
      )}
    </div>
  );
}

interface TipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: DayChartRow }>;
  label?: number;
}

function DayTooltip({
  active,
  payload,
  label,
  theme,
  showActual,
  showAdjusted,
}: TipProps & { theme: ChartTheme; showActual: boolean; showAdjusted: boolean }) {
  if (!active || !payload?.length || label === undefined) return null;
  const raw = payload[0]!.payload;
  const row = { ...raw, actual: showActual ? raw.actual : null, adjusted: showAdjusted ? raw.adjusted : null };
  if (row.forecast == null && row.actual == null) return null;
  return (
    <div className="tooltip" style={{ background: theme.tooltipBg, borderColor: theme.tooltipBorder }}>
      <div className="tooltip-title">{fmtDayTime(label)}</div>
      {row.forecast != null && (
        <div className="tooltip-row">
          <span style={{ color: theme.forecast }}>Forecast</span>
          <strong>{fmtMW(row.forecast)}</strong>
        </div>
      )}
      {row.band && (
        <div className="tooltip-row">
          <span>80% range</span>
          <strong>
            {fmtMW(row.band[0])} – {fmtMW(row.band[1])}
          </strong>
        </div>
      )}
      {row.adjusted != null && (
        <div className="tooltip-row">
          <span style={{ color: theme.adjusted }}>Adjusted</span>
          <strong>{fmtMW(row.adjusted)}</strong>
        </div>
      )}
      {row.actual != null && (
        <div className="tooltip-row">
          <span>Actual</span>
          <strong>{fmtMW(row.actual)}</strong>
        </div>
      )}
      {row.actual != null && row.forecast != null && (
        <div className="tooltip-row">
          <span>Error (fcst − actual)</span>
          <strong style={{ color: row.forecast - row.actual > 0 ? theme.over : theme.under }}>
            {fmtMW(row.forecast - row.actual, true)}
          </strong>
        </div>
      )}
    </div>
  );
}
