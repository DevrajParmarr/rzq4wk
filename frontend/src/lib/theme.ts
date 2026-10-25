import { useEffect, useState } from "react";

// SVG presentation attributes can't reliably read CSS variables, so charts get concrete colours.
const light = {
  actual: "#0f172a",
  forecast: "#2563eb",
  adjusted: "#0d9488",
  band: "#93c5fd",
  over: "#d97706",
  under: "#0891b2",
  grid: "#e2e8f0",
  axis: "#64748b",
  muted: "#94a3b8",
  decision: "#7c3aed",
  tooltipBg: "#ffffff",
  tooltipBorder: "#e2e8f0",
};

const dark: typeof light = {
  actual: "#f1f5f9",
  forecast: "#60a5fa",
  adjusted: "#2dd4bf",
  band: "#1e40af",
  over: "#fbbf24",
  under: "#22d3ee",
  grid: "#1e293b",
  axis: "#94a3b8",
  muted: "#64748b",
  decision: "#a78bfa",
  tooltipBg: "#0f172a",
  tooltipBorder: "#334155",
};

export type ChartTheme = typeof light;

const query = () => window.matchMedia?.("(prefers-color-scheme: dark)");

export function useChartTheme(): ChartTheme {
  const [isDark, setIsDark] = useState(() => query()?.matches ?? false);
  useEffect(() => {
    const mq = query();
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isDark ? dark : light;
}
