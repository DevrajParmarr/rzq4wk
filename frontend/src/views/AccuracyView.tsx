import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useAccuracy } from "../api/queries";
import type { Accuracy, ErrorMetrics } from "../api/types";
import { axisProps, CHART_MARGIN, tooltipContent } from "../components/chart";
import { ErrorState, LegendItem, LoadingPage, PageHeader, Panel, Tag } from "../components/ui";
import { gwLabel, niceTicks, trimEmptyBins } from "../lib/chartData";
import { fmtGWh, fmtHours, fmtMW, fmtNumber, fmtPct, fmtShortDate, pctChange } from "../lib/format";
import { useChartTheme } from "../lib/theme";

interface Props {
  gate: string;
  gateLabel: string;
  onOpenDay: (date: string) => void;
}


/** Recharts passes the bar's datum either directly or under `payload`, depending on version. */
function deliveryDateOf(entry: unknown): string | undefined {
  const e = entry as { delivery_date?: string; payload?: { delivery_date?: string } } | null;
  return e?.payload?.delivery_date ?? e?.delivery_date;
}

const METRIC_ROWS: { key: keyof ErrorMetrics; label: string; hint: string; fmt: (v: number | null) => string }[] = [
  { key: "mae", label: "Mean absolute error", hint: "Typical size of an hourly miss", fmt: (v) => fmtMW(v) },
  { key: "rmse", label: "Root mean square error", hint: "Weights large misses more heavily", fmt: (v) => fmtMW(v) },
  { key: "bias", label: "Bias", hint: "Forecast minus outturn, on average", fmt: (v) => fmtMW(v, true) },
  { key: "p90_abs_error", label: "P90 absolute error", hint: "9 in 10 hours fall within this", fmt: (v) => fmtMW(v) },
  { key: "max_abs_error", label: "Largest miss", hint: "Worst single hour", fmt: (v) => fmtMW(v) },
  { key: "nmae_pct", label: "Normalised MAE", hint: "MAE as a share of mean outturn", fmt: (v) => fmtPct(v, 1) },
  { key: "over_forecast_pct", label: "Hours over-forecast", hint: "Forecast above outturn", fmt: (v) => fmtPct(v, 0) },
];

export function AccuracyView({ gate, gateLabel, onOpenDay }: Props) {
  const theme = useChartTheme();
  const { data, error, isPending, isFetching, refetch } = useAccuracy(gate);

  const daily = useMemo(
    () =>
      (data?.daily ?? []).map((d) => ({
        ...d,
        forecast_gwh: d.forecast_mwh != null ? d.forecast_mwh / 1000 : null,
        actual_gwh: d.actual_mwh != null ? d.actual_mwh / 1000 : null,
      })),
    [data],
  );
  const histogram = useMemo(() => trimEmptyBins(data?.histogram ?? []).map((b) => ({ ...b, mid: (b.from_mw + b.to_mw) / 2 })), [data]);

  const horizonTicks = niceTicks(Math.max(0, ...(data?.by_horizon ?? []).flatMap((d) => [d.mae ?? 0, d.bias ?? 0])), 4);
  const hourTicks = niceTicks(Math.max(0, ...(data?.by_hour ?? []).flatMap((d) => [d.mae ?? 0, d.bias ?? 0])), 4);

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isPending || !data) return <LoadingPage />;

  const openFromBar = (entry: unknown) => {
    const d = deliveryDateOf(entry);
    if (d) onOpenDay(d);
  };

  const m = data.metrics;
  const adj = data.adjusted_metrics;
  const improvement = pctChange(m.mae, adj.mae);
  const [leadMin, leadMax] = data.lead_time_range_h;
  const nDays = data.daily.length;

  return (
    <div className={`view ${isFetching ? "is-busy" : ""}`}>
      <PageHeader
        eyebrow="Pilot review, January 2026"
        title="Forecast accuracy at decision time"
        description={`How well the forecast available at the ${gate} ${gateLabel} deadline predicted metered wind output across ${nDays} delivery days, ${fmtShortDate(data.delivery_start)} to ${fmtShortDate(data.delivery_end)} 2026.`}
      />

      <Findings data={data} improvement={improvement} />

      <div className="grid grid-1-2">
        <Panel title="Accuracy metrics" description={`${m.n} hourly observations`}>
          <table className="table table-compact">
            <thead>
              <tr>
                <th scope="col">Metric</th>
                <th scope="col" className="num">
                  Forecast
                </th>
                <th scope="col" className="num">
                  Adjusted
                </th>
              </tr>
            </thead>
            <tbody>
              {METRIC_ROWS.map((row) => {
                const raw = m[row.key] as number | null;
                const fixed = adj[row.key] as number | null;
                const lowerIsBetter = row.key !== "over_forecast_pct";
                const better =
                  raw != null && fixed != null && (row.key === "bias" ? Math.abs(fixed) < Math.abs(raw) : lowerIsBetter && fixed < raw);
                return (
                  <tr key={row.key}>
                    <th scope="row">
                      <div className="metric-name">{row.label}</div>
                      <div className="metric-hint">{row.hint}</div>
                    </th>
                    <td className="num">{row.fmt(raw)}</td>
                    <td className={`num ${better ? "tone-positive" : ""}`}>{row.fmt(fixed)}</td>
                  </tr>
                );
              })}
              <tr>
                <th scope="row">
                  <div className="metric-name">80% range coverage</div>
                  <div className="metric-hint">Out of sample, target 80%</div>
                </th>
                <td className="num">{fmtPct(data.band_coverage_pct, 1)}</td>
                <td className="num muted">–</td>
              </tr>
            </tbody>
          </table>
        </Panel>

        <Panel
          className="panel-stretch"
          title="Error by forecast lead time"
          description={
            <>
              Latest forecast at least <em>h</em> hours old. The shaded band, {fmtHours(leadMin)} to {fmtHours(leadMax)}, is the lead
              time at the {gate} deadline.
            </>
          }
          actions={
            <div className="legend">
              <LegendItem color={theme.forecast} label="MAE" />
              <LegendItem color={theme.over} label="Bias" variant="dash" />
            </div>
          }
        >
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.by_horizon} margin={CHART_MARGIN}>
                <CartesianGrid stroke={theme.grid} vertical={false} />
                {leadMin != null && leadMax != null && (
                  <ReferenceArea
                    x1={Math.max(0, leadMin)}
                    x2={Math.min(48, leadMax)}
                    fill={theme.decision}
                    fillOpacity={theme.decisionOpacity}
                    stroke="none"
                  />
                )}
                <XAxis
                  dataKey="horizon_h"
                  type="number"
                  domain={[0, 48]}
                  ticks={[0, 6, 12, 18, 24, 30, 36, 42, 48]}
                  tickFormatter={(h: number) => `${h} h`}
                  {...axisProps(theme)}
                  dy={6}
                />
                <YAxis ticks={horizonTicks} domain={[0, horizonTicks[horizonTicks.length - 1] ?? "auto"]} tickFormatter={gwLabel} {...axisProps(theme)} width={56} />
                <Tooltip
                  cursor={{ stroke: theme.cursor }}
                  content={tooltipContent<Accuracy["by_horizon"][number]>((d) => ({
                    title: `Forecast at least ${d.horizon_h} h old`,
                    rows: [
                      { label: "MAE", value: fmtMW(d.mae), color: theme.forecast },
                      { label: "Bias", value: fmtMW(d.bias, true), color: theme.over },
                    ],
                  }))}
                />
                <Line dataKey="mae" stroke={theme.forecast} strokeWidth={2.25} dot={false} isAnimationActive={false} />
                <Line dataKey="bias" stroke={theme.over} strokeWidth={1.75} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel
        title="Daily wind energy"
        description="Forecast at the deadline against metered outturn, GWh per delivery day. Select a day to open it."
        actions={
          <div className="legend">
            <LegendItem color={theme.forecast} label="Forecast" variant="area" />
            <LegendItem color={theme.actual} label="Outturn" variant="area" />
          </div>
        }
      >
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={daily} margin={CHART_MARGIN} barGap={1} barCategoryGap="22%">
              <CartesianGrid stroke={theme.grid} vertical={false} />
              <XAxis dataKey="delivery_date" tickFormatter={(d: string) => fmtShortDate(d)} {...axisProps(theme)} interval={2} dy={6} />
              <YAxis {...axisProps(theme)} width={70} tickFormatter={(v: number) => `${v} GWh`} />
              <Tooltip
                cursor={{ fill: theme.grid }}
                content={tooltipContent<(typeof daily)[number]>((d) => ({
                  title: fmtShortDate(d.delivery_date),
                  rows: [
                    { label: "Forecast", value: fmtGWh(d.forecast_mwh), color: theme.forecast },
                    { label: "Outturn", value: fmtGWh(d.actual_mwh), color: theme.actual },
                    {
                      label: "Difference",
                      value: (() => {
                        const p = pctChange(d.actual_mwh, d.forecast_mwh);
                        return p == null ? "–" : `${p > 0 ? "+" : ""}${p.toFixed(1)}%`;
                      })(),
                      emphasis: true,
                    },
                  ],
                }))}
              />
              <Bar dataKey="forecast_gwh" fill={theme.forecast} radius={[2, 2, 0, 0]} isAnimationActive={false} cursor="pointer" onClick={openFromBar} />
              <Bar dataKey="actual_gwh" fill={theme.actual} radius={[2, 2, 0, 0]} isAnimationActive={false} cursor="pointer" onClick={openFromBar} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid grid-2">
        <Panel
          title="Error by hour of delivery"
          description="UK local hour"
          actions={
            <div className="legend">
              <LegendItem color={theme.forecast} label="MAE" variant="area" />
              <LegendItem color={theme.over} label="Bias" variant="dash" />
            </div>
          }
        >
          <div className="chart chart-sm">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.by_hour} margin={CHART_MARGIN}>
                <CartesianGrid stroke={theme.grid} vertical={false} />
                <XAxis dataKey="hour" tickFormatter={(h: number) => `${String(h).padStart(2, "0")}:00`} {...axisProps(theme)} interval={3} dy={6} />
                <YAxis ticks={hourTicks} domain={[0, hourTicks[hourTicks.length - 1] ?? "auto"]} tickFormatter={gwLabel} {...axisProps(theme)} width={56} />
                <Tooltip
                  cursor={{ fill: theme.grid }}
                  content={tooltipContent<Accuracy["by_hour"][number]>((d) => ({
                    title: `${String(d.hour).padStart(2, "0")}:00 to ${String((d.hour + 1) % 24).padStart(2, "0")}:00`,
                    rows: [
                      { label: "MAE", value: fmtMW(d.mae), color: theme.forecast },
                      { label: "Bias", value: fmtMW(d.bias, true), color: theme.over },
                    ],
                  }))}
                />
                <Bar dataKey="mae" fill={theme.forecast} fillOpacity={0.8} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                <Line dataKey="bias" stroke={theme.over} strokeWidth={1.75} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel
          title="Distribution of hourly errors"
          description={`Forecast minus outturn. Median ${fmtMW(data.error_quantiles.p50 ?? null, true)}, P10 ${fmtMW(data.error_quantiles.p10 ?? null, true)}, P90 ${fmtMW(data.error_quantiles.p90 ?? null, true)}.`}
          actions={
            <div className="legend">
              <LegendItem color={theme.over} label="Over-forecast" variant="area" />
              <LegendItem color={theme.under} label="Under-forecast" variant="area" />
            </div>
          }
        >
          <div className="chart chart-sm">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histogram} margin={CHART_MARGIN} barCategoryGap={1}>
                <CartesianGrid stroke={theme.grid} vertical={false} />
                <XAxis dataKey="mid" tickFormatter={(v: number) => gwLabel(Math.round(v / 250) * 250)} {...axisProps(theme)} interval={2} dy={6} />
                <YAxis {...axisProps(theme)} width={40} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: theme.grid }}
                  content={tooltipContent<(typeof histogram)[number]>((b) => ({
                    title: `${fmtMW(b.from_mw, true)} to ${fmtMW(b.to_mw, true)}`,
                    rows: [{ label: "Hours", value: String(b.count) }],
                  }))}
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

      <Panel title="Delivery-day scorecard" description="Select a row to open the day.">
        <div className="table-scroll">
          <table className="table table-rows">
            <thead>
              <tr>
                <th scope="col">Delivery day</th>
                <th scope="col" className="num">
                  Forecast
                </th>
                <th scope="col" className="num">
                  80% range
                </th>
                <th scope="col" className="num">
                  Outturn
                </th>
                <th scope="col" className="num">
                  Difference
                </th>
                <th scope="col" className="num">
                  MAE
                </th>
                <th scope="col" className="num">
                  Bias
                </th>
                <th scope="col" className="num">
                  Adjusted MAE
                </th>
              </tr>
            </thead>
            <tbody>
              {data.daily.map((d) => {
                const diff = pctChange(d.actual_mwh, d.forecast_mwh);
                const outside =
                  d.actual_mwh != null && d.low_mwh != null && d.high_mwh != null && (d.actual_mwh < d.low_mwh || d.actual_mwh > d.high_mwh);
                return (
                  <tr
                    key={d.delivery_date}
                    onClick={() => onOpenDay(d.delivery_date)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpenDay(d.delivery_date))}
                    tabIndex={0}
                    aria-label={`Open ${fmtShortDate(d.delivery_date)}`}
                  >
                    <td>{fmtShortDate(d.delivery_date)}</td>
                    <td className="num">{fmtGWh(d.forecast_mwh)}</td>
                    <td className="num muted">
                      {fmtNumber((d.low_mwh ?? 0) / 1000, 0)}–{fmtNumber((d.high_mwh ?? 0) / 1000, 0)} GWh
                    </td>
                    <td className="num">
                      {outside && <Tag tone="warning">Outside range</Tag>} {fmtGWh(d.actual_mwh)}
                    </td>
                    <td className="num">{diff == null ? "–" : `${diff > 0 ? "+" : ""}${diff.toFixed(1)}%`}</td>
                    <td className="num">{fmtMW(d.mae)}</td>
                    <td className="num">{fmtMW(d.bias, true)}</td>
                    <td className={`num ${d.adjusted_mae != null && d.mae != null && d.adjusted_mae < d.mae ? "tone-positive" : ""}`}>
                      {fmtMW(d.adjusted_mae)}
                    </td>
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

function Findings({ data, improvement }: { data: Accuracy; improvement: number | null }) {
  const m = data.metrics;
  return (
    <section className="findings" aria-label="Key findings">
      <div className="finding">
        <div className="finding-figure">
          {(m.bias ?? 0) > 0 ? "+" : ""}
          {fmtNumber((m.bias ?? 0) / 1000, 2)}
          <span> GW</span>
        </div>
        <div className="finding-title">Systematic over-forecast</div>
        <p>
          The forecast was above outturn in {fmtPct(m.over_forecast_pct)} of hours. Each shortfall has to be bought back in intraday
          or imbalance markets.
        </p>
      </div>
      <div className="finding">
        <div className="finding-figure">
          {fmtNumber((m.mae ?? 0) / 1000, 2)}
          <span> GW</span>
        </div>
        <div className="finding-title">Typical hourly error</div>
        <p>
          {fmtPct(m.nmae_pct, 1)} of mean outturn. Nine hours in ten were within {fmtNumber((m.p90_abs_error ?? 0) / 1000, 1)} GW of the
          forecast.
        </p>
      </div>
      <div className="finding">
        <div className="finding-figure">
          {improvement != null ? fmtNumber(improvement, 0) : "–"}
          <span>%</span>
        </div>
        <div className="finding-title">Error reduction available</div>
        <p>
          Scaling the forecast by its accuracy over the previous seven settled days cuts the mean absolute error to{" "}
          {fmtNumber((data.adjusted_metrics.mae ?? 0) / 1000, 2)} GW, with no look-ahead.
        </p>
      </div>
    </section>
  );
}
