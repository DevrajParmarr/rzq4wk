import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";

const meta = {
  version: "0.1.0",
  timezone: "Europe/London",
  default_gate: "09:20",
  gate_presets: [{ time: "09:20", label: "EPEX SPOT GB day-ahead auction (09:20)", description: "" }],
  decision_start: "2026-01-01",
  decision_end: "2026-01-02",
  delivery_dates: ["2026-01-02", "2026-01-03"],
  coverage: {
    actuals_from: "2026-01-01T00:00:00Z",
    actuals_to: "2026-01-03T23:30:00Z",
    actual_rows: 144,
    forecast_rows: 100,
    forecast_publishes: 8,
    first_publish: "2025-12-31T02:30:00Z",
    last_publish: "2026-01-02T22:30:00Z",
  },
  sources: {},
};

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}

describe("App", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/?tab=method");
  });
  afterEach(() => vi.unstubAllGlobals());

  it("loads metadata and renders the method page from the URL state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(meta), { status: 200, headers: { "Content-Type": "application/json" } })),
    );
    renderApp();
    expect(await screen.findByText("The decision this tool supports")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Method & data" })).toHaveAttribute("aria-selected", "true");
  });

  it("surfaces API errors with a retry action", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: "Data snapshot unavailable" }), { status: 503 })),
    );
    renderApp();
    expect(await screen.findByText("Data snapshot unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
