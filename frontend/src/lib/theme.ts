import { useSyncExternalStore } from "react";

export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "windsight-theme";
const listeners = new Set<() => void>();

function initialMode(): ThemeMode {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

let mode: ThemeMode = initialMode();

export function setThemeMode(next: ThemeMode): void {
  mode = next;
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage can be unavailable (private mode); the theme still applies for this session.
  }
  listeners.forEach((notify) => notify());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribe, () => mode, () => "light");
}

// SVG presentation attributes can't reliably read CSS variables, so charts get concrete colours
// that mirror the tokens in styles.css.
const light = {
  forecast: "#1f5fbf",
  band: "#1f5fbf",
  bandOpacity: 0.13,
  adjusted: "#1d7a55",
  actual: "#15191e",
  over: "#c2621f",
  under: "#2a7ba0",
  grid: "#eceef1",
  axis: "#69727d",
  decision: "#1f5fbf",
  decisionOpacity: 0.06,
  cursor: "#cdd1d6",
};

const dark: typeof light = {
  forecast: "#6ea3f0",
  band: "#6ea3f0",
  bandOpacity: 0.18,
  adjusted: "#4cbf8c",
  actual: "#e7eaee",
  over: "#e8915a",
  under: "#63b3d6",
  grid: "#222830",
  axis: "#8a939e",
  decision: "#6ea3f0",
  decisionOpacity: 0.08,
  cursor: "#343b45",
};

export type ChartTheme = typeof light;

export function useChartTheme(): ChartTheme {
  return useThemeMode() === "dark" ? dark : light;
}
