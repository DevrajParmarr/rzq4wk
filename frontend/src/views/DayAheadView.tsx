import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useDayAhead } from "../api/queries";
import type { Meta } from "../api/types";
import { axisProps, tooltipContent, type TooltipRow } from "../components/chart";
import { DecisionTimeline } from "../components/DecisionTimeline";
import { ErrorState, LoadingPage, PageHeader, Panel, SeriesToggle, Stat, StatGroup } from "../components/ui";
import { type DayChartRow, dayAheadCsv, gwLabel, mergeDayAhead, niceTicks } from "../lib/chartData";
import { fmtDayTime, fmtLongDate, fmtMW, fmtNumber, fmtTime } from "../lib/format";
import { useChartTheme } from "../lib/theme";

interface Props {
  meta: Meta;
  gate: string;
  gateLabel: string;
  date: string;
  onDateChange: (date: string) => void;
}

const gwh = (mwh: number | null | undefined) => (mwh == null ? "–" : fmtNumber(mwh / 1000, 1));

export function DayAheadView({ meta, gate, gateLabel, date, onDateChange }: Props) {
  const theme = useChartTheme();
  const [series, setSeries] = useState({ band: true, adjusted: false, actual: true });
  const toggle = (key: keyof typeof series) => setSeries((s) => ({ ...s, [key]: !s[key] }));
  const { data, error, isPending, isFetching, refetch } = useDayAhead(date, gate);

  const dates = meta.delivery_dates;
  const idx = dates.indexOf(date);
  const rows = useMemo(() => (data ? mergeDayAhead(data.forecast_points, data.actual_points) : []), [data]);
  const ticks = useMemo(
    () => rows.filter((r) => fmtTime(r.t).endsWith(":00") && Number(fmtTime(r.t).slice(0, 2)) % 3 === 0).map((r) => r.t),
    [rows],
  );

  const yTicks = useMemo(
    () => niceTicks(Math.max(0, ...rows.flatMap((r) => [r.actual ?? 0, r.forecast ?? 0, r.band?.[1] ?? 0, r.adjusted ?? 0]))),
    [rows],
  );

  const renderTooltip = useMemo(
    () =>
      tooltipContent<DayChartRow>((row, label) => {
        const out: TooltipRow[] = [];
        if (row.forecast != null) out.push({ label: "Forecast", value: fmtMW(row.forecast), color: theme.forecast });
        if (series.band && row.band) out.push({ label: "80% range", value: `${fmtNumber(row.band[0])} – ${fmtMW(row.band[1])}` });
        if (series.adjusted && row.adjusted != null) out.push({ label: "Adjusted", value: fmtMW(row.adjusted), color: theme.adjusted });
        if (series.actual && row.actual != null) out.push({ label: "Outturn", value: fmtMW(row.actual), color: theme.actual });
        if (series.actual && row.actual != null && row.forecast != null)
          out.push({ label: "Forecast error", value: fmtMW(row.forecast - row.actual, true), emphasis: true });
        return { title: fmtDayTime(Number(label)), rows: out };
      }),
    [series, theme],
  );

  const downloadCsv = () => {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([dayAheadCsv(data.forecast_points)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `windsight_${data.delivery_date}_gate-${gate.replace(":", "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const s = data?.summary;
  const energyError = s?.forecast_mwh != null && s.actual_mwh ? ((s.forecast_mwh - s.actual_mwh) / s.actual_mwh) * 100 : null;
  const adjustedBetter = s?.adjusted_metrics.mae != null && s.metrics.mae != null && s.adjusted_metrics.mae < s.metrics.mae;

  return (
    <div className="view">
      <PageHeader
        eyebrow="Delivery day"
        title={fmtLongDate(date)}
        description={`Wind forecast available at the ${gate} ${gateLabel} gate closure, compared with metered outturn.`}
        actions={
          <div className="date-nav" role="group" aria-label="Choose delivery day">
            <button type="button" className="icon-btn" onClick={() => onDateChange(dates[idx - 1]!)} disabled={idx <= 0} aria-label="Previous day">
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <select className="select" value={date} onChange={(e) => onDateChange(e.target.value)} aria-label="Delivery day">
              {dates.map((d) => (
                <option key={d} value={d}>
                  {fmtLongDate(d)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="icon-btn"
              onClick={() => onDateChange(dates[idx + 1]!)}
              disabled={idx < 0 || idx >= dates.length - 1}
              aria-label="Next day"
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        }
      />

      {error && <ErrorState error={error} onRetry={() => refetch()} />}
      {isPending && !error && <LoadingPage />}

      {data && s && (
        <>
          <Panel>
            <DecisionTimeline
              publishes={data.decision_day_publishes}
              cutoff={data.decision_cutoff}
              usedPublish={data.forecast_publish_time}
              gateLabel={gateLabel}
              leadRange={data.lead_time_range_h}
            />
          </Panel>

          <StatGroup busy={isFetching}>
            <Stat
              label="Forecast energy"
              value={gwh(s.forecast_mwh)}
              unit="GWh"
              detail={`Peak ${fmtNumber((s.peak_forecast_mw ?? 0) / 1000, 1)} GW, low ${fmtNumber((s.min_forecast_mw ?? 0) / 1000, 1)} GW`}
            />
            <Stat
              label="80% likely range"
              value={`${s.low_mwh != null ? fmtNumber(s.low_mwh / 1000, 0) : "–"}–${s.high_mwh != null ? fmtNumber(s.high_mwh / 1000, 0) : "–"}`}
              unit="GWh"
              detail="Sum of hourly P10 and P90"
            />
            <Stat
              label="Adjusted forecast"
              value={gwh(s.adjusted_mwh)}
              unit="GWh"
              detail={s.adjust_ratio != null ? `Forecast × ${s.adjust_ratio.toFixed(2)}, trailing 7 days` : undefined}
            />
            <Stat
              label="Metered outturn"
              value={gwh(s.actual_mwh)}
              unit="GWh"
              detail={energyError != null ? `Forecast ${energyError >= 0 ? "+" : ""}${energyError.toFixed(1)}% vs outturn` : undefined}
            />
            <Stat
              label="Mean absolute error"
              value={s.metrics.mae != null ? fmtNumber(s.metrics.mae) : "–"}
              unit="MW"
              detail={
                <>
                  Adjusted <span className={adjustedBetter ? "tone-positive" : ""}>{fmtMW(s.adjusted_metrics.mae)}</span>
                </>
              }
            />
          </StatGroup>

          <Panel
            title="Hourly wind generation"
            description="National wind output in MW, UK local time"
            actions={
              <>
                <div className="series-toggles" role="group" aria-label="Chart series">
                  <span className="legend-item legend-fixed">
                    <span className="swatch swatch-line" style={{ borderTopColor: theme.forecast }} aria-hidden="true" />
                    Forecast
                  </span>
                  <SeriesToggle color={theme.band} variant="area" label="80% range" active={series.band} onToggle={() => toggle("band")} />
                  <SeriesToggle color={theme.adjusted} variant="dash" label="Adjusted" active={series.adjusted} onToggle={() => toggle("adjusted")} />
                  <SeriesToggle color={theme.actual} label="Outturn" active={series.actual} onToggle={() => toggle("actual")} />
                </div>
                <button type="button" className="btn" onClick={downloadCsv}>
                  <Download size={14} aria-hidden="true" />
                  CSV
                </button>
              </>
            }
            footer="Only the latest forecast published before the deadline is used. The 80% range comes from forecast errors on the other January delivery days."
          >
            <div className={`chart chart-lg ${isFetching ? "is-busy" : ""}`}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={theme.grid} vertical={false} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    ticks={ticks}
                    tickFormatter={(t: number) => fmtTime(t)}
                    {...axisProps(theme)}
                    dy={6}
                  />
                  <YAxis ticks={yTicks} domain={[0, yTicks[yTicks.length - 1] ?? "auto"]} tickFormatter={gwLabel} {...axisProps(theme)} width={56} />
                  <Tooltip content={renderTooltip} cursor={{ stroke: theme.cursor, strokeWidth: 1 }} />
                  {series.band && (
                    <Area dataKey="band" stroke="none" fill={theme.band} fillOpacity={theme.bandOpacity} connectNulls isAnimationActive={false} />
                  )}
                  <Line dataKey="forecast" stroke={theme.forecast} strokeWidth={2.25} dot={false} connectNulls isAnimationActive={false} />
                  {series.adjusted && (
                    <Line
                      dataKey="adjusted"
                      stroke={theme.adjusted}
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  )}
                  {series.actual && (
                    <Line dataKey="actual" stroke={theme.actual} strokeWidth={1.75} dot={false} connectNulls isAnimationActive={false} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
