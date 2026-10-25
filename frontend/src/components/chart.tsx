import type { ReactNode } from "react";

import type { ChartTheme } from "../lib/theme";

export interface TooltipRow {
  label: string;
  value: ReactNode;
  color?: string;
  emphasis?: boolean;
}

interface RechartsTooltipProps<T> {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: T }>;
  label?: unknown;
}

/**
 * Build a Recharts `content` renderer from a function that turns the hovered datum into rows.
 * Keeps every chart's tooltip visually identical.
 */
export function tooltipContent<T>(build: (datum: T, label: unknown) => { title: string; rows: TooltipRow[] } | null) {
  return function TooltipRenderer(props: unknown) {
    const { active, payload, label } = props as RechartsTooltipProps<T>;
    if (!active || !payload?.length) return null;
    const built = build(payload[0]!.payload, label);
    if (!built || built.rows.length === 0) return null;
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip-title">{built.title}</div>
        {built.rows.map((row) => (
          <div key={row.label} className={`chart-tooltip-row ${row.emphasis ? "is-emphasis" : ""}`}>
            <span>
              {row.color && <i style={{ background: row.color }} />}
              {row.label}
            </span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
    );
  };
}

/** Shared axis styling: quiet ticks, no axis lines. */
export function axisProps(theme: ChartTheme) {
  return {
    tick: { fill: theme.axis, fontSize: 11.5 },
    axisLine: false,
    tickLine: false,
  } as const;
}

export const CHART_MARGIN = { top: 8, right: 8, bottom: 0, left: 0 };

/**
 * Direct label drawn just past the last point of a line (name + value), so readers don't
 * have to look across to a legend. `above` places it above or below the point to keep two
 * neighbouring labels apart.
 */
export function endLabel({
  lastIndex,
  name,
  color,
  above,
  format,
}: {
  lastIndex: number;
  name: string;
  color: string;
  above: boolean;
  format: (v: number) => string;
}) {
  return function EndLabel(props: unknown) {
    const { x, y, index, value } = props as { x?: number; y?: number; index?: number; value?: number | null };
    if (index !== lastIndex || x == null || y == null || value == null) return <g />;
    const nameY = above ? y - 20 : y + 16;
    return (
      <g className="end-label">
        <text x={x + 8} y={nameY} fill={color} fontSize={11.5} fontWeight={600}>
          {name}
        </text>
        <text x={x + 8} y={nameY + 14} fill={color} fontSize={11.5} opacity={0.8}>
          {format(value)}
        </text>
      </g>
    );
  };
}
