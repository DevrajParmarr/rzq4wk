import { useMemo, useState } from "react";
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
import { Disclosure, ErrorState, LegendItem, LoadingPage, PageHeader, Panel, Segmented, Tag } from "../components/ui";
import { gwLabel, niceTicks, trimEmptyBins } from "../lib/chartData";
import { fmtGWh, fmtHours, fmtMW, fmtNumber, fmtPct, fmtShortDate, pctChange } from "../lib/format";
import { type ChartTheme, useChartTheme } from "../lib/theme";

interface Props {
  gate: string;
  gateLabel: string;
  onOpenDay: (date: string) => void;
}

type Breakdown = "lead" | "hour" | "distribution";

const BREAKDOWNS: { value: Breakdown; label: string }[] = [
  { value: "lead", label: "Lead time" },
  { value: "hour", label: "Hour of day" },
  { value: "distribution", label: "Distribution" },
];

/** Recharts passes the bar's datum either directly or under `payload`, depending on version. */
function deliveryDateOf(entry: unknown): string | undefined {
  const e = entry as { delivery_date?: string; payload?: { delivery_date?: string } } | null;
  return e?.payload?.delivery_date ?? e?.delivery_date;
}

const signedPct = (p: number | null) => (p == null ? "–" : `${p > 0 ? "+" : ""}${p.toFixed(1)}%`);

export function AccuracyView({ gate, gateLabel, onOpenDay }: Props) {
  const theme = useChartTheme();
  const [breakdown, setBreakdown] = useState<Breakdown>("lead");
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

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isPending || !data) return <LoadingPage />;

  const openFromBar = (entry: unknown) => {
    const d = deliveryDateOf(entry);
    if (d) onOpenDay(d);
  };
  const outsideDays = data.daily.filter(
    (d) => d.actual_mwh != null && d.low_mwh != null && d.high_mwh != null && (d.actual_mwh < d.low_mwh || d.actual_mwh > d.high_mwh),
  ).length;

  return (
    <div className={`view ${isFetching ? "is-busy" : ""}`}>
      <PageHeader
        eyebrow={`January 2026 pilot · ${gateLabel} ${gate}`}
        title="How accurate was the forecast?"
        description={`${data.daily.length} delivery days, ${fmtShortDate(data.delivery_start)} to ${fmtShortDate(data.delivery_end)}. Forecast available at the deadline vs actual wind.`}
      />

      <Findings data={data} />

      <Panel
        title="Daily wind energy"
        description="Select a day to open it"
        actions={
          <div className="legend">
            <LegendItem color={theme.forecast} label="Forecast" variant="area" />
            <LegendItem color={theme.actual} label="Actual" variant="area" />
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
                    { label: "Actual", value: fmtGWh(d.actual_mwh), color: theme.actual },
                    { label: "Forecast vs actual", value: signedPct(pctChange(d.actual_mwh, d.forecast_mwh)), emphasis: true },
                  ],
                }))}
              />
              <Bar dataKey="forecast_gwh" fill={theme.forecast} radius={[2, 2, 0, 0]} isAnimationActive={false} cursor="pointer" onClick={openFromBar} />
              <Bar dataKey="actual_gwh" fill={theme.actual} radius={[2, 2, 0, 0]} isAnimationActive={false} cursor="pointer" onClick={openFromBar} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel
        title="Where the error comes from"
        description={BREAKDOWN_CAPTION[breakdown](data, gate)}
        actions={<Segmented label="Error breakdown" value={breakdown} options={BREAKDOWNS} onChange={setBreakdown} />}
      >
        {breakdown === "lead" && (
          <div className="legend chart-legend">
            <LegendItem color={theme.forecast} label="Average miss" />
            <LegendItem color={theme.over} label="Bias (forecast minus actual)" variant="dash" />
          </div>
        )}
        <div className="chart">
          {breakdown === "lead" && <LeadTimeChart data={data} theme={theme} />}
          {breakdown === "hour" && <HourChart data={data} theme={theme} />}
          {breakdown === "distribution" && <DistributionChart data={data} theme={theme} />}
        </div>
      </Panel>

      <Disclosure title="Detailed accuracy metrics" summary={`${data.metrics.n} hourly observations, forecast vs adjusted`}>
        <MetricsTable data={data} />
      </Disclosure>

      <Disclosure
        title="Day-by-day scorecard"
        summary={`${data.daily.length} days${outsideDays ? `, ${outsideDays} outside the likely range` : ""}`}
      >
        <Scorecard data={data} onOpenDay={onOpenDay} />
      </Disclosure>
    </div>
  );
}

// --------------------------------------------------------------------------- findings

function Findings({ data }: { data: Accuracy }) {
  const m = data.metrics;
  const improvement = pctChange(m.mae, data.adjusted_metrics.mae);
  return (
    <section className="findings" aria-label="Key findings">
      <div className="finding">
        <div className="finding-title">Forecast runs high</div>
        <div className="finding-figure">
          {fmtPct(m.over_forecast_pct)}
          <span> of hours</span>
        </div>
        <p>On average {fmtNumber((m.bias ?? 0) / 1000, 2)} GW above actual wind: volume that must be bought back later.</p>
      </div>
      <div className="finding">
        <div className="finding-title">Typical hourly miss</div>
        <div className="finding-figure">
          {fmtNumber((m.mae ?? 0) / 1000, 2)}
          <span> GW</span>
        </div>
        <p>{fmtPct(m.nmae_pct, 0)} of average output. Nine hours in ten within {fmtNumber((m.p90_abs_error ?? 0) / 1000, 1)} GW.</p>
      </div>
      <div className="finding">
        <div className="finding-title">Simple fix available</div>
        <div className="finding-figure">
          {improvement != null ? fmtNumber(Math.abs(improvement), 0) : "–"}
          <span>% smaller error</span>
        </div>
        <p>Scaling the forecast by its record over the last 7 settled days, with no look-ahead.</p>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------- breakdown charts

const BREAKDOWN_CAPTION: Record<Breakdown, (d: Accuracy, gate: string) => string> = {
  lead: (d, gate) =>
    `Error grows the earlier the forecast is made. Shaded: ${fmtHours(d.lead_time_range_h[0])} to ${fmtHours(d.lead_time_range_h[1])}, the lead time at the ${gate} deadline.`,
  hour: () => "Average error by hour of delivery, UK time.",
  distribution: (d) =>
    `Most hours are over-forecast. Median error ${fmtMW(d.error_quantiles.p50 ?? null, true)}; 80% of hours between ${fmtMW(d.error_quantiles.p10 ?? null, true)} and ${fmtMW(d.error_quantiles.p90 ?? null, true)}.`,
};

function LeadTimeChart({ data, theme }: { data: Accuracy; theme: ChartTheme }) {
  const [leadMin, leadMax] = data.lead_time_range_h;
  const ticks = niceTicks(Math.max(0, ...data.by_horizon.flatMap((d) => [d.mae ?? 0, d.bias ?? 0])), 4);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data.by_horizon} margin={CHART_MARGIN}>
        <CartesianGrid stroke={theme.grid} vertical={false} />
        {leadMin != null && leadMax != null && (
          <ReferenceArea x1={Math.max(0, leadMin)} x2={Math.min(48, leadMax)} fill={theme.decision} fillOpacity={theme.decisionOpacity} stroke="none" />
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
        <YAxis ticks={ticks} domain={[0, ticks[ticks.length - 1] ?? "auto"]} tickFormatter={gwLabel} {...axisProps(theme)} width={56} />
        <Tooltip
          cursor={{ stroke: theme.cursor }}
          content={tooltipContent<Accuracy["by_horizon"][number]>((d) => ({
            title: `Forecast made ${d.horizon_h} h or more ahead`,
            rows: [
              { label: "Average miss", value: fmtMW(d.mae), color: theme.forecast },
              { label: "Bias", value: fmtMW(d.bias, true), color: theme.over },
            ],
          }))}
        />
        <Line dataKey="mae" stroke={theme.forecast} strokeWidth={2.25} dot={false} isAnimationActive={false} />
        <Line dataKey="bias" stroke={theme.over} strokeWidth={1.75} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function HourChart({ data, theme }: { data: Accuracy; theme: ChartTheme }) {
  const ticks = niceTicks(Math.max(0, ...data.by_hour.map((d) => d.mae ?? 0)), 4);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data.by_hour} margin={CHART_MARGIN}>
        <CartesianGrid stroke={theme.grid} vertical={false} />
        <XAxis dataKey="hour" tickFormatter={(h: number) => `${String(h).padStart(2, "0")}:00`} {...axisProps(theme)} interval={2} dy={6} />
        <YAxis ticks={ticks} domain={[0, ticks[ticks.length - 1] ?? "auto"]} tickFormatter={gwLabel} {...axisProps(theme)} width={56} />
        <Tooltip
          cursor={{ fill: theme.grid }}
          content={tooltipContent<Accuracy["by_hour"][number]>((d) => ({
            title: `${String(d.hour).padStart(2, "0")}:00 to ${String((d.hour + 1) % 24).padStart(2, "0")}:00`,
            rows: [
              { label: "Average miss", value: fmtMW(d.mae), color: theme.forecast },
              { label: "Bias", value: fmtMW(d.bias, true) },
            ],
          }))}
        />
        <Bar dataKey="mae" fill={theme.forecast} fillOpacity={0.85} radius={[2, 2, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function DistributionChart({ data, theme }: { data: Accuracy; theme: ChartTheme }) {
  const bins = trimEmptyBins(data.histogram).map((b) => ({ ...b, mid: (b.from_mw + b.to_mw) / 2 }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={bins} margin={CHART_MARGIN} barCategoryGap={1}>
        <CartesianGrid stroke={theme.grid} vertical={false} />
        <XAxis dataKey="mid" tickFormatter={(v: number) => gwLabel(Math.round(v / 250) * 250)} {...axisProps(theme)} interval={2} dy={6} />
        <YAxis {...axisProps(theme)} width={56} allowDecimals={false} tickFormatter={(v: number) => `${v} h`} />
        <Tooltip
          cursor={{ fill: theme.grid }}
          content={tooltipContent<(typeof bins)[number]>((b) => ({
            title: b.mid >= 0 ? "Forecast too high" : "Forecast too low",
            rows: [
              { label: "Error", value: `${fmtMW(b.from_mw, true)} to ${fmtMW(b.to_mw, true)}` },
              { label: "Hours", value: String(b.count), emphasis: true },
            ],
          }))}
        />
        <Bar dataKey="count" isAnimationActive={false} radius={[2, 2, 0, 0]}>
          {bins.map((b) => (
            <Cell key={b.mid} fill={b.mid >= 0 ? theme.over : theme.under} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// --------------------------------------------------------------------------- detail tables

const METRIC_ROWS: { key: keyof ErrorMetrics; label: string; hint: string; fmt: (v: number | null) => string }[] = [
  { key: "mae", label: "Mean absolute error", hint: "Typical size of an hourly miss", fmt: (v) => fmtMW(v) },
  { key: "rmse", label: "Root mean square error", hint: "Weights large misses more heavily", fmt: (v) => fmtMW(v) },
  { key: "bias", label: "Bias", hint: "Forecast minus actual, on average", fmt: (v) => fmtMW(v, true) },
  { key: "p90_abs_error", label: "P90 absolute error", hint: "9 in 10 hours fall within this", fmt: (v) => fmtMW(v) },
  { key: "max_abs_error", label: "Largest miss", hint: "Worst single hour", fmt: (v) => fmtMW(v) },
  { key: "nmae_pct", label: "Normalised MAE", hint: "MAE as a share of mean output", fmt: (v) => fmtPct(v, 1) },
  { key: "over_forecast_pct", label: "Hours over-forecast", hint: "Forecast above actual", fmt: (v) => fmtPct(v, 0) },
];

function MetricsTable({ data }: { data: Accuracy }) {
  const m = data.metrics;
  const adj = data.adjusted_metrics;
  return (
    <div className="table-scroll">
      <table className="table table-compact">
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col" className="num">
              Forecast
            </th>
            <th scope="col" className="num">
              Adjusted (beta)
            </th>
          </tr>
        </thead>
        <tbody>
          {METRIC_ROWS.map((row) => {
            const raw = m[row.key] as number | null;
            const fixed = adj[row.key] as number | null;
            const better =
              raw != null &&
              fixed != null &&
              (row.key === "bias" ? Math.abs(fixed) < Math.abs(raw) : row.key !== "over_forecast_pct" && fixed < raw);
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
              <div className="metric-name">Likely-range coverage</div>
              <div className="metric-hint">Share of hours inside the 80% range, tested out of sample</div>
            </th>
            <td className="num">{fmtPct(data.band_coverage_pct, 1)}</td>
            <td className="num muted">–</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Scorecard({ data, onOpenDay }: { data: Accuracy; onOpenDay: (date: string) => void }) {
  return (
    <div className="table-scroll">
      <table className="table table-rows">
        <thead>
          <tr>
            <th scope="col">Delivery day</th>
            <th scope="col" className="num">
              Forecast
            </th>
            <th scope="col" className="num">
              Actual
            </th>
            <th scope="col" className="num">
              Forecast vs actual
            </th>
            <th scope="col" className="num">
              Average miss
            </th>
            <th scope="col" className="num">
              Adjusted miss
            </th>
          </tr>
        </thead>
        <tbody>
          {data.daily.map((d) => {
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
                <td>
                  {fmtShortDate(d.delivery_date)} {outside && <Tag tone="warning">Outside range</Tag>}
                </td>
                <td className="num">{fmtGWh(d.forecast_mwh)}</td>
                <td className="num">{fmtGWh(d.actual_mwh)}</td>
                <td className="num">{signedPct(pctChange(d.actual_mwh, d.forecast_mwh))}</td>
                <td className="num">{fmtMW(d.mae)}</td>
                <td className={`num ${d.adjusted_mae != null && d.mae != null && d.adjusted_mae < d.mae ? "tone-positive" : ""}`}>
                  {fmtMW(d.adjusted_mae)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
