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

  return (
    <div className="timeline">
      <div className="timeline-summary">
        <div>
          <div className="timeline-key">Bids close</div>
          <div className="timeline-val">{fmtDayTime(cutoff)}</div>
          <div className="timeline-sub">{gateLabel}</div>
        </div>
        <div>
          <div className="timeline-key">Forecast used</div>
          <div className="timeline-val">{usedPublish ? `Published ${fmtTime(usedPublish)}` : "None available"}</div>
          <div className="timeline-sub">Latest Elexon WINDFOR before the deadline</div>
        </div>
        <div>
          <div className="timeline-key">Lead time</div>
          <div className="timeline-val">
            {fmtHours(leadRange[0])} to {fmtHours(leadRange[1])}
          </div>
          <div className="timeline-sub">From publish to each delivery hour</div>
        </div>
      </div>

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
              <span key={p} className={`timeline-pub is-${state}`} style={{ left: pct(p) }}>
                <span className="timeline-pub-label">{fmtTime(p)}</span>
              </span>
            );
          })}
        </div>
        <div className="timeline-legend">
          <span>
            <i className="dot is-used" /> Used for bidding
          </span>
          <span>
            <i className="dot is-early" /> Superseded
          </span>
          <span>
            <i className="dot is-late" /> Published after gate closure
          </span>
        </div>
      </div>
      <p className="sr-only">
        {publishes.length} forecasts were published on the decision day. The forecast published at{" "}
        {usedPublish ? fmtTime(usedPublish) : "none"} was the latest available before the {fmtTime(cutoff)} deadline.
      </p>
    </div>
  );
}
