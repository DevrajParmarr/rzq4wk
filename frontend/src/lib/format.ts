// Formatting helpers. All wall-clock times are shown in UK local time, the market's time zone.

export const UK_TZ = "Europe/London";

const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: UK_TZ, hour: "2-digit", minute: "2-digit" });
const dayTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: UK_TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: UK_TZ, weekday: "short", day: "numeric", month: "short" });
const longDayFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const shortDateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });

const isMissing = (v: number | null | undefined): v is null | undefined =>
  v === null || v === undefined || Number.isNaN(v);

export const fmtTime = (iso: string | number) => timeFmt.format(new Date(iso));
export const fmtDayTime = (iso: string | number) => dayTimeFmt.format(new Date(iso));
export const fmtDay = (iso: string | number) => dayFmt.format(new Date(iso));

/** Calendar dates ("2026-01-15") are zone-less: format them in UTC so they never shift. */
export const fmtLongDate = (isoDate: string) => longDayFmt.format(new Date(`${isoDate}T00:00:00Z`));
export const fmtShortDate = (isoDate: string) => shortDateFmt.format(new Date(`${isoDate}T00:00:00Z`));

export function fmtMW(v: number | null | undefined, signed = false): string {
  if (isMissing(v)) return "–";
  const rounded = Math.round(v);
  const sign = signed && rounded > 0 ? "+" : "";
  return `${sign}${rounded.toLocaleString("en-GB")} MW`;
}

export function fmtGW(v: number | null | undefined, signed = false, digits = 2): string {
  if (isMissing(v)) return "–";
  const sign = signed && v > 0 ? "+" : "";
  return `${sign}${(v / 1000).toFixed(digits)} GW`;
}

/** MWh -> GWh with one decimal. */
export function fmtGWh(v: number | null | undefined, digits = 1): string {
  if (isMissing(v)) return "–";
  return `${(v / 1000).toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits })} GWh`;
}

export function fmtPct(v: number | null | undefined, digits = 0): string {
  if (isMissing(v)) return "–";
  return `${v.toFixed(digits)}%`;
}

export function fmtHours(v: number | null | undefined): string {
  if (isMissing(v)) return "–";
  return `${Number.isInteger(v) ? v : v.toFixed(1)} h`;
}

/** Relative change from a to b as a percentage (negative = reduction). */
export function pctChange(from: number | null | undefined, to: number | null | undefined): number | null {
  if (isMissing(from) || isMissing(to) || from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

/** Add whole days to an ISO calendar date. */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
