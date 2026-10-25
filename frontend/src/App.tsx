import { Moon, Sun } from "lucide-react";
import { useMemo, useState } from "react";

import { useMeta } from "./api/queries";
import { ErrorState, LoadingPage } from "./components/ui";
import { fmtDayTime } from "./lib/format";
import { setThemeMode, useThemeMode } from "./lib/theme";
import { useUrlState } from "./lib/urlState";
import { AccuracyView } from "./views/AccuracyView";
import { DayAheadView } from "./views/DayAheadView";
import { ExplorerView } from "./views/ExplorerView";
import { MethodView } from "./views/MethodView";

const TABS = [
  { id: "day", label: "Day-ahead" },
  { id: "accuracy", label: "Accuracy" },
  { id: "explorer", label: "Explorer" },
  { id: "method", label: "Methodology" },
] as const;

const GATE_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const CUSTOM = "custom";

export default function App() {
  const meta = useMeta();
  const theme = useThemeMode();
  const [tab, setTab] = useUrlState("tab", "day");
  const [gateParam, setGate] = useUrlState("gate", meta.data?.default_gate ?? "09:20");
  const defaultDate = meta.data?.delivery_dates[Math.floor(meta.data.delivery_dates.length / 2)] ?? "";
  const [dateParam, setDate] = useUrlState("date", defaultDate);
  const [customOpen, setCustomOpen] = useState(false);

  const gate = GATE_RE.test(gateParam) ? gateParam : (meta.data?.default_gate ?? "09:20");
  const date = meta.data?.delivery_dates.includes(dateParam) ? dateParam : defaultDate;
  const preset = meta.data?.gate_presets.find((p) => p.time === gate);
  const showCustom = customOpen || !preset;
  const gateLabel = preset ? preset.label.replace(/\s*\(\d\d:\d\d\)$/, "") : "Custom deadline";

  const activeTab = useMemo(() => (TABS.some((t) => t.id === tab) ? tab : "day"), [tab]);

  const openDay = (d: string) => {
    setDate(d);
    setTab("day");
    window.scrollTo({ top: 0 });
  };

  const onGateSelect = (value: string) => {
    if (value === CUSTOM) {
      setCustomOpen(true);
      if (preset) setGate("11:00");
    } else {
      setCustomOpen(false);
      setGate(value);
    }
  };

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="appbar">
        <div className="appbar-inner">
          <div className="brand">
            <img src="/favicon.svg" alt="" width={26} height={26} />
            <span className="brand-name">WindSight</span>
            <span className="brand-divider" aria-hidden="true" />
            <span className="brand-context">GB day-ahead wind</span>
          </div>

          <nav className="nav" aria-label="Primary">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`nav-link ${activeTab === t.id ? "is-active" : ""}`}
                aria-current={activeTab === t.id ? "page" : undefined}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="appbar-tools">
            <label className="control-label" htmlFor="gate-select">
              Deadline
            </label>
            <select
              id="gate-select"
              className="select"
              value={showCustom ? CUSTOM : gate}
              onChange={(e) => onGateSelect(e.target.value)}
              disabled={!meta.data}
            >
              {meta.data?.gate_presets.map((p) => (
                <option key={p.time} value={p.time}>
                  {p.label}
                </option>
              ))}
              <option value={CUSTOM}>Custom time</option>
            </select>
            {showCustom && (
              <input
                type="time"
                className="select time-input"
                aria-label="Custom deadline, UK time"
                value={gate}
                step={300}
                onChange={(e) => GATE_RE.test(e.target.value) && setGate(e.target.value)}
              />
            )}
            <button
              type="button"
              className="icon-btn"
              onClick={() => setThemeMode(theme === "dark" ? "light" : "dark")}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              title={theme === "dark" ? "Light theme" : "Dark theme"}
            >
              {theme === "dark" ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </header>

      <main id="main" className="page">
        {meta.error && <ErrorState error={meta.error} onRetry={() => meta.refetch()} />}
        {meta.isPending && <LoadingPage />}
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
        <div className="footer-inner">
          <span>Source: Elexon BMRS, datasets FUELHH (wind outturn) and WINDFOR (wind forecast).</span>
          {meta.data && (
            <span>
              Snapshot to {fmtDayTime(meta.data.coverage.last_publish)} UK · v{meta.data.version} ·{" "}
              <a href="/api/docs" target="_blank" rel="noreferrer">
                API reference
              </a>
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}
