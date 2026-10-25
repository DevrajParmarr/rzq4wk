import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useDayAhead } from "../api/queries";
import type { Meta } from "../api/types";
import { axisProps, tooltipContent, type TooltipRow } from "../components/chart";
import { DecisionTimeline } from "../components/DecisionTimeline";
import { ErrorState, LoadingPage, PageHeader, Panel, SeriesToggle, Stat, StatGroup } from "../components/ui";
import { type DayChartRow, dayAheadCsv, gwLabel, mergeDayAhead, niceTicks } from "../lib/chartData";
import { fmtDay, fmtDayTime, fmtLongDate, fmtMW, fmtNumber, fmtTime } from "../lib/format";
import { useChartTheme } from "../lib/theme";

interface Props {
  meta: Meta;
  gate: string;
  gateLabel: string;
  date: string;
  onDateChange: (date: string) => void;
}

const gwh = (mwh: number | null | undefined, digits = 1) => (mwh == null ? "–" : fmtNumber(mwh / 1000, digits));

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
        if (series.band && row.band) out.push({ label: "Likely range", value: `${fmtNumber(row.band[0])} – ${fmtMW(row.band[1])}` });
        if (series.adjusted && row.adjusted != null) out.push({ label: "Adjusted", value: fmtMW(row.adjusted), color: theme.adjusted });
        if (series.actual && row.actual != null) out.push({ label: "Actual", value: fmtMW(row.actual), color: theme.actual });
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

  return (
    <div className="view">
      <PageHeader
        eyebrow={`Delivery day · ${gateLabel} ${gate}`}
        title={fmtLongDate(date)}
        actions={
          <div className="date-nav" role="group" aria-label="Choose delivery day">
            <button type="button" className="icon-btn" onClick={() => onDateChange(dates[idx - 1]!)} disabled={idx <= 0} aria-label="Previous day">
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <select className="select" value={date} onChange={(e) => onDateChange(e.target.value)} aria-label="Delivery day">
              {dates.map((d) => (
                <option key={d} value={d}>
                  {fmtDay(`${d}T12:00:00Z`)}
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
          <StatGroup busy={isFetching}>
            <Stat
              label="Forecast wind"
              value={gwh(s.forecast_mwh)}
              unit="GWh"
              detail={`Likely ${gwh(s.low_mwh, 0)}–${gwh(s.high_mwh, 0)} GWh (80% range)`}
            />
            <Stat
              label="Actual wind"
              value={gwh(s.actual_mwh)}
              unit="GWh"
              detail={
                energyError == null ? undefined : (
                  <span className={Math.abs(energyError) >= 10 ? "tone-warning" : ""}>
                    Forecast {Math.abs(energyError).toFixed(1)}% too {energyError >= 0 ? "high" : "low"}
                  </span>
                )
              }
            />
            <Stat
              label="Average hourly miss"
              value={s.metrics.mae != null ? fmtNumber(s.metrics.mae) : "–"}
              unit="MW"
              detail={
                s.adjusted_metrics.mae != null ? (
                  <>
                    <span className="tone-positive">{fmtMW(s.adjusted_metrics.mae)}</span> with the adjusted forecast
                  </>
                ) : undefined
              }
            />
          </StatGroup>

          <Panel>
            <DecisionTimeline
              publishes={data.decision_day_publishes}
              cutoff={data.decision_cutoff}
              usedPublish={data.forecast_publish_time}
              gateLabel={gateLabel}
              leadRange={data.lead_time_range_h}
            />
          </Panel>

          <Panel
            title="Hourly wind generation"
            description="MW, UK time"
            actions={
              <>
                <div className="series-toggles" role="group" aria-label="Chart series">
                  <span className="legend-item legend-fixed">
                    <span className="swatch swatch-line" style={{ borderTopColor: theme.forecast }} aria-hidden="true" />
                    Forecast
                  </span>
                  <SeriesToggle color={theme.band} variant="area" label="Likely range" active={series.band} onToggle={() => toggle("band")} />
                  <SeriesToggle color={theme.actual} label="Actual" active={series.actual} onToggle={() => toggle("actual")} />
                  <SeriesToggle color={theme.adjusted} variant="dash" label="Adjusted" active={series.adjusted} onToggle={() => toggle("adjusted")} />
                </div>
                <button type="button" className="btn" onClick={downloadCsv} title="Download the hourly table as CSV">
                  <Download size={14} aria-hidden="true" />
                  CSV
                </button>
              </>
            }
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
