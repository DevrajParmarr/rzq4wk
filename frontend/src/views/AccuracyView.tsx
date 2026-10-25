import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useAccuracy } from "../api/queries";
import { ErrorBox, Kpi, LegendDot, Loading, Panel } from "../components/ui";
import { trimEmptyBins } from "../lib/chartData";
import { fmtGW, fmtGWh, fmtHours, fmtMW, fmtPct, fmtShortDate, pctChange } from "../lib/format";
import { useChartTheme } from "../lib/theme";

interface Props {
  gate: string;
  gateLabel: string;
  onOpenDay: (date: string) => void;
}

const gwTick = (v: number) => `${(v / 1000).toFixed(1)} GW`;

/** Recharts passes the bar's datum either directly or under `payload`, depending on version. */
function deliveryDateOf(entry: unknown): string | undefined {
  const e = entry as { delivery_date?: string; payload?: { delivery_date?: string } } | null;
  return e?.payload?.delivery_date ?? e?.delivery_date;
}

export function AccuracyView({ gate, gateLabel, onOpenDay }: Props) {
  const theme = useChartTheme();
  const { data, error, isPending, isFetching, refetch } = useAccuracy(gate);

  const daily = useMemo(
    () =>
      (data?.daily ?? []).map((d) => ({
        ...d,
        label: fmtShortDate(d.delivery_date),
        forecast_gwh: d.forecast_mwh != null ? d.forecast_mwh / 1000 : null,
        actual_gwh: d.actual_mwh != null ? d.actual_mwh / 1000 : null,
      })),
    [data],
  );
  const histogram = useMemo(() => trimEmptyBins(data?.histogram ?? []).map((b) => ({ ...b, mid: (b.from_mw + b.to_mw) / 2 })), [data]);
  const openFromBar = (entry: unknown) => {
    const date = deliveryDateOf(entry);
    if (date) onOpenDay(date);
  };

  if (error) return <ErrorBox error={error} onRetry={() => refetch()} />;
  if (isPending || !data) return <Loading label="Computing accuracy across January…" />;

  const m = data.metrics;
  const adj = data.adjusted_metrics;
  const improvement = pctChange(m.mae, adj.mae);
  const [leadMin, leadMax] = data.lead_time_range_h;

  return (
    <div className={`view ${isFetching ? "is-refreshing" : ""}`}>
      <div className="insight">
        <div className="insight-icon" aria-hidden="true">
          !
        </div>
        <div>
          <strong>
            At the {gate} deadline, the forecast over-estimated wind in {fmtPct(m.over_forecast_pct)} of hours, by{" "}
            {fmtGW(m.bias, false)} on average.
          </strong>{" "}
          Every over-forecast is wind that must be bought back later, usually at intraday or imbalance prices.
          {improvement != null && improvement < 0 && (
            <>
              {" "}
              A simple correction learned from the previous 7 settled days cuts the mean absolute error by{" "}
              <strong>{fmtPct(-improvement)}</strong>, from {fmtMW(m.mae)} to {fmtMW(adj.mae)}.
            </>
          )}
        </div>
      </div>

      <div className="kpi-grid kpi-grid-8">
        <Kpi label="Mean absolute error" value={fmtMW(m.mae)} sub={`${fmtPct(m.nmae_pct, 1)} of mean outturn`} tone="accent" />
        <Kpi label="Bias (forecast − actual)" value={fmtMW(m.bias, true)} sub="Positive = forecast too high" tone="warn" />
        <Kpi label="RMSE" value={fmtMW(m.rmse)} sub="Penalises large misses" />
        <Kpi label="P90 absolute error" value={fmtMW(m.p90_abs_error)} sub="9 in 10 hours are within this" />
        <Kpi label="Worst hour" value={fmtMW(m.max_abs_error)} sub="Largest single miss" />
        <Kpi label="Over-forecast hours" value={fmtPct(m.over_forecast_pct)} sub={`${m.n} hours evaluated`} tone="warn" />
        <Kpi label="80% range coverage" value={fmtPct(data.band_coverage_pct, 1)} sub="Target 80%, out-of-sample by day" tone="good" />
        <Kpi
          label="Adjusted forecast MAE"
          value={fmtMW(adj.mae)}
          sub={improvement != null ? `${fmtPct(improvement, 0)} vs raw forecast` : "–"}
          tone={improvement != null && improvement < 0 ? "good" : "neutral"}
        />
      </div>

      <div className="grid-2">
        <Panel
          title="Daily wind energy: forecast vs actual"
          subtitle="GWh per delivery day. Click a day to open it."
          actions={
            <div className="legend">
              <LegendDot color={theme.forecast} label="Forecast" area />
              <LegendDot color={theme.actual} label="Actual" area />
            </div>
          }
        >
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={1}>
                <CartesianGrid stroke={theme.grid} vertical={false} />
                <XAxis dataKey="label" stroke={theme.axis} fontSize={11} interval={3} />
                <YAxis stroke={theme.axis} fontSize={12} width={44} />
                <Tooltip
                  cursor={{ fill: theme.grid, opacity: 0.5 }}
                  contentStyle={{ background: theme.tooltipBg, borderColor: theme.tooltipBorder, borderRadius: 8 }}
                  formatter={(v, name) => [`${Number(v).toFixed(1)} GWh`, name === "forecast_gwh" ? "Forecast" : "Actual"]}
                />
                <Bar dataKey="forecast_gwh" fill={theme.forecast} radius={[3, 3, 0, 0]} isAnimationActive={false} cursor="pointer" onClick={openFromBar} />
                <Bar dataKey="actual_gwh" fill={theme.actual} radius={[3, 3, 0, 0]} isAnimationActive={false} cursor="pointer" onClick={openFromBar} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel
          title="How accuracy decays with lead time"
          subtitle={
            <>
              Latest forecast at least <em>h</em> hours old. The shaded band is the {fmtHours(leadMin)}–{fmtHours(leadMax)} lead time that
              applies at the {gate} deadline.
            </>
          }
          actions={
            <div className="legend">
              <LegendDot color={theme.forecast} label="MAE" />
              <LegendDot color={theme.over} label="Bias" dashed />
            </div>
          }
        >
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.by_horizon} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={theme.grid} vertical={false} />
                {leadMin != null && leadMax != null && (
                  <ReferenceArea x1={Math.max(0, leadMin)} x2={Math.min(48, leadMax)} fill={theme.decision} fillOpacity={0.08} />
                )}
                <XAxis dataKey="horizon_h" type="number" domain={[0, 48]} ticks={[0, 6, 12, 18, 24, 30, 36, 42, 48]} stroke={theme.axis} fontSize={12} unit="h" />
                <YAxis tickFormatter={gwTick} stroke={theme.axis} fontSize={12} width={60} />
                <Tooltip
                  contentStyle={{ background: theme.tooltipBg, borderColor: theme.tooltipBorder, borderRadius: 8 }}
                  labelFormatter={(h) => `Forecast ≥ ${h} h old`}
                  formatter={(v, name) => [fmtMW(Number(v)), name === "mae" ? "MAE" : "Bias"]}
                />
                <Line dataKey="mae" stroke={theme.forecast} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                <Line dataKey="bias" stroke={theme.over} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Error by hour of delivery" subtitle="Forecast at the deadline, by UK hour of day">
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.by_hour} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={theme.grid} vertical={false} />
                <XAxis dataKey="hour" stroke={theme.axis} fontSize={12} tickFormatter={(h: number) => `${String(h).padStart(2, "0")}:00`} interval={2} />
                <YAxis tickFormatter={gwTick} stroke={theme.axis} fontSize={12} width={60} />
                <Tooltip
                  contentStyle={{ background: theme.tooltipBg, borderColor: theme.tooltipBorder, borderRadius: 8 }}
                  labelFormatter={(h) => `${String(h).padStart(2, "0")}:00 UK`}
                  formatter={(v, name) => [fmtMW(Number(v)), name === "mae" ? "MAE" : "Bias"]}
                />
                <Bar dataKey="mae" fill={theme.forecast} fillOpacity={0.85} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Line dataKey="bias" stroke={theme.over} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel
          title="Distribution of hourly errors"
          subtitle={`Forecast − actual. P10 ${fmtMW(data.error_quantiles.p10 ?? null, true)}, median ${fmtMW(data.error_quantiles.p50 ?? null, true)}, P90 ${fmtMW(data.error_quantiles.p90 ?? null, true)}`}
          actions={
            <div className="legend">
              <LegendDot color={theme.over} label="Over-forecast (short risk)" area />
              <LegendDot color={theme.under} label="Under-forecast" area />
            </div>
          }
        >
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histogram} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={1}>
                <CartesianGrid stroke={theme.grid} vertical={false} />
                <XAxis dataKey="mid" stroke={theme.axis} fontSize={12} tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}`} unit=" GW" interval={1} />
                <YAxis stroke={theme.axis} fontSize={12} width={36} allowDecimals={false} />
                <ReferenceLine x={0} stroke={theme.muted} />
                <Tooltip
                  cursor={{ fill: theme.grid, opacity: 0.5 }}
                  contentStyle={{ background: theme.tooltipBg, borderColor: theme.tooltipBorder, borderRadius: 8 }}
                  labelFormatter={(_, p) => {
                    const b = p?.[0]?.payload as { from_mw: number; to_mw: number } | undefined;
                    return b ? `${fmtMW(b.from_mw, true)} to ${fmtMW(b.to_mw, true)}` : "";
                  }}
                  formatter={(v) => [`${v} hours`, "Count"]}
                />
                <Bar dataKey="count" isAnimationActive={false} radius={[2, 2, 0, 0]}>
                  {histogram.map((b) => (
                    <Cell key={b.mid} fill={b.mid >= 0 ? theme.over : theme.under} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Delivery-day scorecard" subtitle={`${gateLabel}. Click a row to inspect the day.`}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Delivery day</th>
                <th className="num">Forecast</th>
                <th className="num">80% range</th>
                <th className="num">Actual</th>
                <th className="num">Energy error</th>
                <th className="num">Hourly MAE</th>
                <th className="num">Bias</th>
                <th className="num">Adjusted MAE</th>
              </tr>
            </thead>
            <tbody>
              {data.daily.map((d) => {
                const energyErr = pctChange(d.actual_mwh, d.forecast_mwh);
                const inRange = d.actual_mwh != null && d.low_mwh != null && d.high_mwh != null && d.actual_mwh >= d.low_mwh && d.actual_mwh <= d.high_mwh;
                return (
                  <tr key={d.delivery_date} onClick={() => onOpenDay(d.delivery_date)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpenDay(d.delivery_date)}>
                    <td>{fmtShortDate(d.delivery_date)}</td>
                    <td className="num">{fmtGWh(d.forecast_mwh)}</td>
                    <td className="num muted">
                      {fmtGWh(d.low_mwh, 0)} – {fmtGWh(d.high_mwh, 0)}
                    </td>
                    <td className="num">
                      {fmtGWh(d.actual_mwh)} {!inRange && <span className="pill pill-warn" title="Actual outside the 80% range">outside</span>}
                    </td>
                    <td className={`num ${energyErr != null && energyErr > 0 ? "text-over" : "text-under"}`}>
                      {energyErr != null ? `${energyErr > 0 ? "+" : ""}${energyErr.toFixed(1)}%` : "–"}
                    </td>
                    <td className="num">{fmtMW(d.mae)}</td>
                    <td className="num">{fmtMW(d.bias, true)}</td>
                    <td className={`num ${d.adjusted_mae != null && d.mae != null && d.adjusted_mae < d.mae ? "text-good" : ""}`}>{fmtMW(d.adjusted_mae)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
