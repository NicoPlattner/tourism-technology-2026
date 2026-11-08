import { useState } from "react";
import saved from "./model-performance.json";
import { dateLabel, percent, num } from "./charts";

type Metric = "daily_wmape" | "monthly_mape" | "peak_wmape";
const METRICS: Record<Metric, { label: string; definition: string }> = {
  daily_wmape: {
    label: "Daily weighted error",
    definition:
      "Daily wMAPE = sum of absolute daily errors ÷ sum of actual guest nights on evaluated days.",
  },
  monthly_mape: {
    label: "Monthly average error",
    definition:
      "Monthly MAPE = unweighted mean of absolute monthly percentage errors. This measures monthly totals, not daily accuracy.",
  },
  peak_wmape: {
    label: "Peak-day weighted error",
    definition:
      "Daily wMAPE restricted to Christmas/New Year, February holiday peaks and the Easter window, as defined by the saved evaluator.",
  },
};
export default function ModelPerformance() {
  const [metric, setMetric] = useState<Metric>("daily_wmape");
  const max =
    Math.max(
      0.01,
      ...saved.windows.flatMap((w) => [
        w.models.ours.metrics[metric] ?? 0,
        w.models.provider.metrics[metric] ?? 0,
      ]),
    ) * 1.12;
  return (
    <section
      id="performance"
      className="dr-data-section"
      aria-labelledby="data-performance-heading"
    >
      <div className="di-section-head">
        <div>
          <p className="eyebrow">04 / Test the forecast</p>
          <h2 id="data-performance-heading">Model performance</h2>
        </div>
        <span>Saved backtest · same evaluation windows</span>
      </div>
      <article className="card di-chart-card">
        <div className="di-card-head">
          <div>
            <h3>Our model versus the challenge provider</h3>
            <p>
              Recorded errors against actual Paznaun-Ischgl guest nights. Lower
              is better.
            </p>
          </div>
          <span className="di-tag">Historical backtest</span>
        </div>
        <p className="di-notice">
          <strong>Comparison has limits.</strong> The TVB forecast’s creation
          date is unknown, and common-day coverage is not recorded in the saved
          results. These are reported backtest scores, not proof of equal
          forecast lead times or an independently verified winner.
        </p>
        <div
          className="di-performance-controls"
          role="group"
          aria-label="Performance metric"
        >
          {(Object.keys(METRICS) as Metric[]).map((key) => (
            <button
              type="button"
              key={key}
              aria-pressed={metric === key}
              onClick={() => setMetric(key)}
            >
              {METRICS[key].label}
            </button>
          ))}
        </div>
        <p className="di-note">{METRICS[metric].definition}</p>
        <div
          className="di-performance-chart"
          role="figure"
          aria-label={`${METRICS[metric].label}: our model versus TVB across identical named evaluation windows`}
        >
          <div className="di-performance-key">
            <span>
              <i className="di-dot" />
              Our ensemble model
            </span>
            <span>
              <i className="di-dot di-dot-dark" />
              Challenge provider · TVB
            </span>
          </div>
          {saved.windows.map((window) => {
            const ours = window.models.ours.metrics[metric],
              provider = window.models.provider.metrics[metric];
            const both = ours !== null && provider !== null;
            return (
              <div className="di-performance-window" key={window.id}>
                <div className="di-performance-period">
                  <h4>{window.label}</h4>
                  <p>
                    {dateLabel(window.start)} – {dateLabel(window.end)}
                  </p>
                </div>
                {[
                  { label: "Our model", score: ours, kind: "ours" },
                  {
                    label: "Challenge provider (TVB)",
                    score: provider,
                    kind: "provider",
                  },
                ].map((row) => (
                  <div className="di-performance-bar" key={row.kind}>
                    <span>{row.label}</span>
                    <div className="di-performance-track">
                      <i
                        className={row.kind}
                        style={{
                          width:
                            row.score === null
                              ? "0%"
                              : `${(row.score / max) * 100}%`,
                        }}
                      />
                    </div>
                    <strong>
                      {row.score === null ? "Unavailable" : percent(row.score)}
                    </strong>
                  </div>
                ))}
                <p className="di-performance-result">
                  {!both
                    ? "No paired score for this metric; no ranking shown."
                    : ours === provider
                      ? "Equal reported error."
                      : `${ours! < provider! ? "Our model" : "TVB"} has lower reported error by ${num(Math.abs(ours! - provider!) * 100, 2)} percentage points.`}
                </p>
              </div>
            );
          })}
          <div className="di-performance-axis" aria-hidden="true">
            <span>0%</span>
            <span>{percent(max / 2)}</span>
            <span>{percent(max)}</span>
          </div>
        </div>
        <p className="di-note">
          These fixed historical windows are independent of the date and origin
          filters above. No future forecast is scored as accurate before actual
          guest nights are known. Missing peak-day scores remain unavailable.
        </p>
        <details className="di-table-details">
          <summary>
            Exact reported scores, evaluation periods and provenance
          </summary>
          <div className="di-table-wrap">
            <table>
              <caption>
                Saved results · error percentages rounded for display
              </caption>
              <thead>
                <tr>
                  <th>Evaluation period</th>
                  <th>Model</th>
                  <th>Daily wMAPE</th>
                  <th>Monthly MAPE</th>
                  <th>Peak-day wMAPE</th>
                </tr>
              </thead>
              <tbody>
                {saved.windows.flatMap((window) =>
                  [
                    { label: "Our ensemble model", data: window.models.ours },
                    {
                      label: "TVB challenge-provider forecast",
                      data: window.models.provider,
                    },
                  ].map((row) => (
                    <tr key={`${window.id}:${row.label}`}>
                      <th>
                        {window.start} – {window.end}
                      </th>
                      <td>{row.label}</td>
                      <td>{percent(row.data.metrics.daily_wmape)}</td>
                      <td>{percent(row.data.metrics.monthly_mape)}</td>
                      <td>{percent(row.data.metrics.peak_wmape)}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
          <div className="di-performance-provenance">
            <p>
              Source: <code>{saved.source}</code>. Evaluation code:{" "}
              <code>{saved.evaluator}</code>. These values are exported directly
              from the saved CSV; no training is run by this page.
            </p>
            <p>
              The evaluator declares a training cutoff of 31 October 2025 for
              both windows. It uses observed TVB / feratel actuals available
              within each window. Daily error masks missing predictions
              separately per model, so identical evaluated days cannot be
              confirmed from the aggregate file. The exact number of paired days
              and the TVB forecast vintage are unavailable.
            </p>
            <p>
              Our selected model is{" "}
              <code>ours_ens (winter: + lgbm push-pull)</code>; provider
              baseline is <code>partner_fc (TVB forecast)</code>. Other
              baselines and in-sample official forecasts are excluded from this
              comparison.
            </p>
            <p>
              Source SHA-256: <code>{saved.source_sha256}</code>
            </p>
          </div>
        </details>
      </article>
    </section>
  );
}
