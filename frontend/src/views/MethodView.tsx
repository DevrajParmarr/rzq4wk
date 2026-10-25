import type { Meta } from "../api/types";
import { PageHeader } from "../components/ui";
import { fmtDayTime, fmtLongDate, fmtNumber } from "../lib/format";

export function MethodView({ meta }: { meta: Meta }) {
  const c = meta.coverage;
  return (
    <div className="view">
      <PageHeader
        eyebrow="Reference"
        title="Methodology"
        description="How forecasts are selected and scored, which data is used, and the limits of this pilot."
      />

      <article className="doc">
        <section>
          <h2>The decision being supported</h2>
          <p>
            Power for delivery day D is bought at auction on the previous day, D−1. The EPEX SPOT GB hourly auction closes at 09:20
            UK time, and the Nord Pool N2EX GB auction closes at 09:50. The volume to buy is broadly demand minus expected wind, and
            any wind shortfall must later be covered in intraday trading or the imbalance market.
          </p>
          <p>
            The forecast that matters is therefore the latest one published before the deadline, not the most accurate forecast
            published afterwards.
          </p>
        </section>

        <section>
          <h2>Selecting the forecast</h2>
          <p>
            Elexon publishes a WINDFOR forecast curve about eight times a day, at roughly 02:30, 04:30, 07:30, 09:30, 11:30, 15:30,
            18:30 and 22:30 UK time. For each hour of D the tool takes the most recent forecast for that hour published at or before
            the deadline on D−1. Nothing published after the deadline is ever used.
          </p>
          <p>
            At a 09:20 deadline this is the 07:30 publish. The 09:30 publish misses the EPEX auction but reaches N2EX bidders in time.
            The lead time from publish to delivery is about 15 to 39 hours.
          </p>
        </section>

        <section>
          <h2>Measuring accuracy</h2>
          <dl className="definitions">
            <dt>Error</dt>
            <dd>
              Forecast minus outturn, in MW, on the hourly timestamps both datasets share. A positive error means wind came in below
              plan, leaving the buyer short.
            </dd>
            <dt>MAE and RMSE</dt>
            <dd>The typical size of an hourly miss, and a version that weights large misses more heavily.</dd>
            <dt>Bias</dt>
            <dd>The average error. A persistent non-zero bias is a correctable, systematic offset.</dd>
            <dt>P90 absolute error</dt>
            <dd>The error that nine hours in ten stay within. A practical figure for sizing a safety margin.</dd>
            <dt>80% likely range</dt>
            <dd>
              The 10th and 90th percentiles of errors on the other delivery days, applied to the day's forecast. Coverage is checked
              out of sample, one day at a time.
            </dd>
            <dt>Adjusted forecast</dt>
            <dd>
              The forecast multiplied by the ratio of outturn to forecast energy over the seven most recent delivery days that were
              fully settled at the deadline, D−8 to D−2. Experimental.
            </dd>
          </dl>
        </section>

        <section>
          <h2>Data and limitations</h2>
          <ul>
            <li>
              Outturn comes from Elexon FUELHH, fuel type WIND, at half-hourly resolution. Forecasts come from Elexon WINDFOR at hourly
              resolution. Both are national figures in MW.
            </li>
            <li>
              The snapshot holds {fmtNumber(c.actual_rows)} half-hours of outturn and {fmtNumber(c.forecast_rows)} forecast values from{" "}
              {c.forecast_publishes} publishes, from {fmtDayTime(c.first_publish)} to {fmtDayTime(c.last_publish)}.
            </li>
            <li>
              Scope covers purchase decisions made from {fmtLongDate(meta.decision_start)} to {fmtLongDate(meta.decision_end)}.
            </li>
            <li>
              Metered outturn excludes wind curtailed for grid constraints, while the forecast does not. This is a likely cause of the
              persistent positive bias.
            </li>
            <li>
              The 80% range is calibrated within the January pilot, so it draws on other January days. A production version would
              calibrate on a rolling window of past data only.
            </li>
          </ul>
        </section>
      </article>
    </div>
  );
}
