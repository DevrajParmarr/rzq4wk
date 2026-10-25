import { useMemo } from "react";

import { useMeta } from "./api/queries";
import { ErrorBox, Loading } from "./components/ui";
import { fmtDayTime } from "./lib/format";
import { useUrlState } from "./lib/urlState";
import { AccuracyView } from "./views/AccuracyView";
import { DayAheadView } from "./views/DayAheadView";
import { ExplorerView } from "./views/ExplorerView";
import { MethodView } from "./views/MethodView";

const TABS = [
  { id: "day", label: "Day-ahead view" },
  { id: "accuracy", label: "Forecast accuracy" },
  { id: "explorer", label: "Explorer" },
  { id: "method", label: "Method & data" },
] as const;

const GATE_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function App() {
  const meta = useMeta();
  const [tab, setTab] = useUrlState("tab", "day");
  const [gateParam, setGate] = useUrlState("gate", meta.data?.default_gate ?? "09:20");
  const defaultDate = meta.data?.delivery_dates[Math.floor(meta.data.delivery_dates.length / 2)] ?? "";
  const [dateParam, setDate] = useUrlState("date", defaultDate);

  const gate = GATE_RE.test(gateParam) ? gateParam : (meta.data?.default_gate ?? "09:20");
  const date = meta.data?.delivery_dates.includes(dateParam) ? dateParam : defaultDate;
  const preset = meta.data?.gate_presets.find((p) => p.time === gate);
  const gateLabel = preset?.label ?? `Custom deadline (${gate} UK)`;

  const activeTab = useMemo(() => (TABS.some((t) => t.id === tab) ? tab : "day"), [tab]);

  const openDay = (d: string) => {
    setDate(d);
    setTab("day");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/favicon.svg" alt="" width={32} height={32} />
          <div>
            <div className="brand-name">WindSight</div>
            <div className="brand-tag">Day-ahead wind intelligence · GB</div>
          </div>
        </div>

        <nav className="tabs" role="tablist" aria-label="Views">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              className={`tab ${activeTab === t.id ? "tab-active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="gate-picker">
          <label htmlFor="gate-select">Decision deadline</label>
          <div className="gate-controls">
            <select
              id="gate-select"
              value={preset ? gate : "custom"}
              onChange={(e) => e.target.value !== "custom" && setGate(e.target.value)}
              disabled={!meta.data}
            >
              {meta.data?.gate_presets.map((p) => (
                <option key={p.time} value={p.time}>
                  {p.label}
                </option>
              ))}
              <option value="custom">Custom time…</option>
            </select>
            {!preset && (
              <input
                type="time"
                aria-label="Custom deadline (UK time)"
                value={gate}
                step={300}
                onChange={(e) => GATE_RE.test(e.target.value) && setGate(e.target.value)}
              />
            )}
            {preset && (
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setGate("11:00")} title="Try another deadline">
                Custom
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="content">
        {meta.error && <ErrorBox error={meta.error} onRetry={() => meta.refetch()} />}
        {meta.isPending && <Loading label="Connecting to WindSight API…" />}
        {meta.data && (
          <>
            {activeTab === "day" && date && (
              <DayAheadView meta={meta.data} gate={gate} gateLabel={gateLabel} date={date} onDateChange={setDate} />
            )}
            {activeTab === "accuracy" && <AccuracyView gate={gate} gateLabel={gateLabel} onOpenDay={openDay} />}
            {activeTab === "explorer" && <ExplorerView meta={meta.data} />}
            {activeTab === "method" && <MethodView meta={meta.data} />}
          </>
        )}
      </main>

      <footer className="footer">
        <span>
          Data: Elexon BMRS, FUELHH wind outturn and WINDFOR forecasts. Pilot scope covers day-ahead decisions made in January 2026.
        </span>
        {meta.data && <span>Last forecast in snapshot: {fmtDayTime(meta.data.coverage.last_publish)} UK · v{meta.data.version}</span>}
      </footer>
    </div>
  );
}
