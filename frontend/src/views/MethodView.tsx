import type { Meta } from "../api/types";
import { Panel } from "../components/ui";
import { fmtDayTime, fmtLongDate } from "../lib/format";

export function MethodView({ meta }: { meta: Meta }) {
  const c = meta.coverage;
  return (
    <div className="view method">
      <div className="grid-2">
        <Panel title="The decision this tool supports">
          <ul className="prose">
            <li>
              Day-ahead power for delivery day <strong>D</strong> is bought at an auction on <strong>D−1</strong>. EPEX SPOT's GB
              hourly auction closes at <strong>09:20</strong> UK time, and Nord Pool's N2EX GB auction closes at{" "}
              <strong>09:50</strong>.
            </li>
            <li>
              The volume to buy is roughly demand minus the expected wind output. Any wind shortfall must be covered later in
              intraday trading or the imbalance market.
            </li>
            <li>
              The forecast that matters is therefore the <strong>latest one published before the deadline</strong>, not the
              most accurate one ever published.
            </li>
          </ul>
        </Panel>

        <Panel title="How a forecast is selected">
          <ul className="prose">
            <li>
              Elexon publishes a WINDFOR forecast curve about 8 times a day: 02:30, 04:30, 07:30, 09:30, 11:30, 15:30, 18:30
              and 22:30 UK time.
            </li>
            <li>
              For every hour of D, the tool takes the most recent forecast for that hour with a publish time at or before the
              deadline on D−1. This is an as-of join, so there is no look-ahead.
            </li>
            <li>
              At 09:20 this is the 07:30 publish. The 09:30 publish arrives 10 minutes too late, but it does reach N2EX
              bidders before 09:50.
            </li>
            <li>Lead time from the deadline to delivery is about 15 to 39 hours.</li>
          </ul>
        </Panel>

        <Panel title="Accuracy measures">
          <ul className="prose">
            <li>
              <strong>Error</strong> is forecast minus actual, in MW, on the hourly timestamps where both datasets have a
              value. A positive error means wind came in below plan, leaving the buyer short.
            </li>
            <li>
              <strong>MAE</strong> is the typical size of a miss. <strong>RMSE</strong> penalises large misses.{" "}
              <strong>Bias</strong> is the systematic offset. <strong>P90 absolute error</strong> is a practical sizing
              figure: 9 in 10 hours fall within it.
            </li>
            <li>
              <strong>80% range:</strong> the empirical P10 and P90 of errors on the other delivery days, applied to the
              day's forecast. Coverage is checked out of sample, one day at a time.
            </li>
            <li>
              <strong>Adjusted forecast (beta):</strong> the forecast multiplied by the actual-to-forecast energy ratio of
              the 7 most recent delivery days that were fully settled at the deadline (D−8 to D−2).
            </li>
          </ul>
        </Panel>

        <Panel title="Data and limitations">
          <ul className="prose">
            <li>
              Actuals come from Elexon FUELHH, fuel type WIND, half-hourly. Forecasts come from Elexon WINDFOR, hourly. Both
              are national level and in MW.
            </li>
            <li>
              The snapshot holds {c.actual_rows.toLocaleString("en-GB")} actual half-hours and{" "}
              {c.forecast_rows.toLocaleString("en-GB")} forecast rows from {c.forecast_publishes} publishes. Publishes run
              from {fmtDayTime(c.first_publish)} to {fmtDayTime(c.last_publish)}.
            </li>
            <li>
              Scope covers decisions made from {fmtLongDate(meta.decision_start)} to {fmtLongDate(meta.decision_end)}, so
              delivery runs to the following day.
            </li>
            <li>
              Metered outturn excludes wind curtailed for grid constraints, while the forecast does not. This is a likely
              cause of the persistent positive bias, and the adjusted forecast corrects for it from recent history.
            </li>
            <li>
              The 80% range is calibrated within the January pilot, so some information comes from other January days. A
              production version would calibrate on a rolling window of past data only.
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
