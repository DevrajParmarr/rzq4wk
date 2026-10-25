import { fmtDayTime, fmtHours, fmtTime } from "../lib/format";

interface Props {
  publishes: string[];
  cutoff: string;
  usedPublish: string | null;
  gateLabel: string;
  leadRange: [number | null, number | null];
}

/** Minutes after UK local midnight, so markers line up with the wall clock the desk uses. */
function minuteOfDay(iso: string): number {
  const [h, m] = fmtTime(iso).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

const pct = (iso: string) => `${(minuteOfDay(iso) / 1440) * 100}%`;
const HOURS = [0, 6, 12, 18, 24];

/**
 * The decision day (D-1) as a 24-hour track: every forecast publish, the auction deadline,
 * and which publish was the latest available when bids closed.
 */
export function DecisionTimeline({ publishes, cutoff, usedPublish, gateLabel, leadRange }: Props) {
  const cutoffMs = Date.parse(cutoff);
  const late = publishes.filter((p) => Date.parse(p) > cutoffMs).length;

  return (
    <div className="timeline">
      <p className="timeline-caption">
        {gateLabel} bids closed <strong>{fmtDayTime(cutoff)}</strong>. The latest forecast available was the{" "}
        <strong>{usedPublish ? fmtTime(usedPublish) : "–"} publish</strong>, {fmtHours(leadRange[0])} to {fmtHours(leadRange[1])}{" "}
        ahead of delivery.
        {late > 0 && <span className="muted"> {late} later forecasts arrived too late to use.</span>}
      </p>

      <div className="timeline-chart" aria-hidden="true">
        <div className="timeline-track">
          {HOURS.map((h) => (
            <span key={h} className="timeline-hour" style={{ left: `${(h / 24) * 100}%` }}>
              {String(h).padStart(2, "0")}:00
            </span>
          ))}
          <span className="timeline-gate" style={{ left: pct(cutoff) }}>
            <span className="timeline-gate-label">Gate {fmtTime(cutoff)}</span>
          </span>
          {publishes.map((p) => {
            const state = p === usedPublish ? "used" : Date.parse(p) > cutoffMs ? "late" : "early";
            return (
              <span key={p} className={`timeline-pub is-${state}`} style={{ left: pct(p) }} title={`Published ${fmtTime(p)}`}>
                <span className="timeline-pub-label">{fmtTime(p)}</span>
              </span>
            );
          })}
        </div>
        <div className="timeline-legend">
          <span>
            <i className="dot is-used" /> Used
          </span>
          <span>
            <i className="dot is-early" /> Superseded
          </span>
          <span>
            <i className="dot is-late" /> After gate
          </span>
        </div>
      </div>
    </div>
  );
}
