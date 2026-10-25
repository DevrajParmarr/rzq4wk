import type { Accuracy, DayAhead, Meta, Series } from "./types";

const API_BASE = `${import.meta.env.VITE_API_BASE ?? ""}/api/v1`;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function getJson<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const qs = query.toString();
  const response = await fetch(`${API_BASE}${path}${qs ? `?${qs}` : ""}`);
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
      else if (body.detail) detail = JSON.stringify(body.detail);
    } catch {
      // keep statusText
    }
    throw new ApiError(detail || `Request failed (${response.status})`, response.status);
  }
  return (await response.json()) as T;
}

export const api = {
  meta: () => getJson<Meta>("/meta"),
  dayAhead: (deliveryDate: string, gate: string) =>
    getJson<DayAhead>("/day-ahead", { delivery_date: deliveryDate, gate }),
  accuracy: (gate: string) => getJson<Accuracy>("/accuracy", { gate }),
  series: (start: string, end: string, horizonH: number) =>
    getJson<Series>("/series", { start, end, horizon_h: horizonH }),
};
