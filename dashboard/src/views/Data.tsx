import { useState } from "react";
import type { ViewProps } from "../App";
import { useDataSnapshot } from "../campaigns/demand/useDataSnapshot";
import {
  MARKETS,
  historicalSummary,
  summarizeForecast,
  validPeriod,
  type MarketData,
} from "../analytics/data";
import {
  useForecast,
  useHistory,
  useMarket,
  type Resource,
} from "../analytics/useAnalysis";
import {
  CapacityCalendar,
  DriverChart,
  ForecastChart,
  MonthlyChart,
  ShareBars,
  dateLabel,
  num,
  percent,
} from "../analytics/charts";
import type { SourceMarket, TravelDates } from "../campaigns/types";
import "./data-overview.css";

const PRESETS = [
  { label: "Winter 2026/27", start: "2026-11-01", end: "2027-04-30" },
  { label: "January–March 2027", start: "2027-01-01", end: "2027-03-31" },
  { label: "Summer 2027", start: "2027-05-01", end: "2027-09-30" },
];
const BOOKING_LABELS = {
  "0d": "0–7 days",
  "8d": "8–30 days",
  "31d": "31–60 days",
  "61d": "61–89 days",
  "90d": "90–179 days",
  "180d": "180+ days",
};
function Arrow({ down = false }: { down?: boolean }) {
  return (
    <svg
      className="di-arrow"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={down ? { transform: "rotate(90deg)" } : undefined}
    >
      <path d="M3 13 13 3M3 3h10v10" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function State<T>({
  resource,
  children,
}: {
  resource: Resource<T>;
  children: (data: T) => React.ReactNode;
}) {
  if (resource.loading)
    return (
      <div className="di-loading" role="status">
        <i />
        Loading analysis…
      </div>
    );
  if (resource.error || !resource.data)
    return (
      <div className="di-error" role="alert">
        <p>{resource.error || "No data available."}</p>
        <button type="button" className="btn ghost" onClick={resource.retry}>
          Retry data
        </button>
      </div>
    );
  return <>{children(resource.data)}</>;
}
function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="di-metric">
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function DataNote({ query }: { query: MarketData }) {
  return (
    <p className="di-note">
      Grade {query.nights.grade} ·{" "}
      {query.nights.is_estimate
        ? "Estimated demand"
        : "Observed / modelled demand"}{" "}
      · {query.nights.method}
    </p>
  );
}
export default function Data(_props: ViewProps) {
  const snapshot = useDataSnapshot();
  const [dates, setDates] = useState<TravelDates>(PRESETS[0]);
  const [draft, setDraft] = useState<TravelDates>(PRESETS[0]);
  const [market, setMarket] = useState<SourceMarket>("DE");
  const [season, setSeason] = useState("winter 25/26");
  const [dateError, setDateError] = useState("");
  const forecast = useForecast(dates, snapshot.key),
    history = useHistory(season, snapshot.key);
  const germany = useMarket("DE", dates, snapshot.key),
    netherlands = useMarket("NL", dates, snapshot.key);
  const belgium = useMarket("BE", dates, snapshot.key),
    austria = useMarket("AT", dates, snapshot.key);
  const markets = { DE: germany, NL: netherlands, BE: belgium, AT: austria };
  const selected = markets[market],
    name = MARKETS.find((m) => m.code === market)!.name;
  const completeMarkets = MARKETS.every((m) => !!markets[m.code].data);
  const marketTotal = MARKETS.reduce(
    (sum, m) => sum + (markets[m.code].data?.nights.value || 0),
    0,
  );
  const marketMax = Math.max(
    1,
    ...MARKETS.map((m) => markets[m.code].data?.nights.value || 0),
  );
  function applyDates(next: TravelDates) {
    setDraft(next);
    setDates(next);
    setDateError("");
  }
  return (
    <div className="view dr-data">
      <div className="di-page-head">
        <div className="view-head">
          <p className="eyebrow">Destination intelligence / Paznaun-Ischgl</p>
          <h1>Data</h1>
          <p className="lead">
            Understand the season. Find the gaps. Know your audience.
          </p>
        </div>
        <span className="di-source-badge">
          Tourism API ·{" "}
          {snapshot.generatedAt
            ? `snapshot ${snapshot.generatedAt.slice(0, 10)}`
            : "precomputed analysis"}
        </span>
      </div>
      <form
        className="di-filters"
        onSubmit={(e) => {
          e.preventDefault();
          if (!validPeriod(draft)) {
            setDateError(
              "Choose a valid period between 1 Jan 2024 and 31 Dec 2027. The end must follow the start.",
            );
            return;
          }
          applyDates(draft);
        }}
      >
        <label className="di-preset">
          Analysis period
          <select
            aria-label="Analysis period preset"
            value={
              PRESETS.find(
                (p) => p.start === dates.start && p.end === dates.end,
              )?.label || "Custom dates"
            }
            onChange={(e) => {
              const preset = PRESETS.find((p) => p.label === e.target.value);
              if (preset) applyDates(preset);
            }}
          >
            {PRESETS.map((p) => (
              <option key={p.label}>{p.label}</option>
            ))}
            <option disabled>Custom dates</option>
          </select>
        </label>
        <label>
          From
          <input
            type="date"
            aria-label="Analysis start date"
            min="2024-01-01"
            max="2027-12-31"
            required
            value={draft.start}
            onChange={(e) => setDraft({ ...draft, start: e.target.value })}
          />
        </label>
        <label>
          To
          <input
            type="date"
            aria-label="Analysis end date"
            min="2024-01-01"
            max="2027-12-31"
            required
            value={draft.end}
            onChange={(e) => setDraft({ ...draft, end: e.target.value })}
          />
        </label>
        <button className="btn" type="submit">
          Apply dates <Arrow />
        </button>
        <label>
          Origin market
          <select
            aria-label="Origin market"
            value={market}
            onChange={(e) => setMarket(e.target.value as SourceMarket)}
          >
            {MARKETS.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        {dateError && (
          <p className="di-filter-error" role="alert">
            {dateError}
          </p>
        )}
      </form>
      <nav className="dr-data-links" aria-label="Data sections">
        <a href="#season">
          Season outlook <Arrow down />
        </a>
        <a href="#capacity">
          Beds & capacity <Arrow down />
        </a>
        <a href="#markets">
          Market intelligence <Arrow down />
        </a>
        <a href="#why">
          Deviations <Arrow down />
        </a>
      </nav>

      <section
        id="season"
        className="dr-data-section"
        aria-labelledby="data-season-heading"
      >
        <div className="di-section-head">
          <div>
            <p className="eyebrow">01 / The bigger picture</p>
            <h2 id="data-season-heading">Season</h2>
          </div>
          <span>
            All origins · {dateLabel(dates.start)} – {dateLabel(dates.end)}
          </span>
        </div>
        <State resource={forecast}>
          {(data) => {
            const summary = summarizeForecast(data.daily, dates);
            const peak = [...data.daily].sort(
              (a, b) => b.forecast - a.forecast,
            )[0];
            return (
              <>
                <div className="di-metrics">
                  <Metric
                    label="Forecast guest nights"
                    value={data.daily.length ? num(summary.nights) : "—"}
                    note={`${summary.coverage} of ${summary.expectedDays} selected days covered`}
                  />
                  <Metric
                    label="Estimated utilisation"
                    value={percent(summary.occupancy)}
                    note={`Capacity-weighted · ${summary.capacityDays} days with capacity`}
                  />
                  <Metric
                    label="Potential spare bed-nights"
                    value={num(summary.spare)}
                    note="Sum of positive daily capacity gaps · estimate"
                  />
                  <Metric
                    label="High-pressure days"
                    value={summary.capacityDays ? num(summary.tightDays) : "—"}
                    note="At least 95% of estimated bed capacity"
                  />
                </div>
                <article className="card di-chart-card">
                  <div className="di-card-head">
                    <div>
                      <h3>How the season takes shape</h3>
                      <p>
                        Daily guest nights, with the model’s uncertainty and
                        estimated bed supply.
                      </p>
                    </div>
                    <span className="di-tag">Destination total</span>
                  </div>
                  {summary.coverage !== summary.expectedDays && (
                    <p className="di-notice">
                      Partial coverage: {summary.coverage} of{" "}
                      {summary.expectedDays} days. Totals include only the
                      available forecast days; missing dates are not treated as
                      zero.
                    </p>
                  )}
                  <ForecastChart
                    key={`${dates.start}:${dates.end}`}
                    rows={data.daily}
                  />
                  <p className="di-note">
                    Forecast, not bookings on hand. The shaded band is an 80%
                    prediction interval. Capacity is estimated from last year;
                    utilisation is not live occupancy.
                  </p>
                </article>
                {!!data.daily.length && (
                  <div className="di-signal">
                    <p className="eyebrow light">The outlook at a glance</p>
                    <div>
                      <p>
                        <strong>
                          {summary.capacityDays ? num(summary.spareDays) : "—"}
                        </strong>
                        days below 80% estimated utilisation
                        {!summary.capacityDays ? " · capacity unavailable" : ""}
                      </p>
                      <p>
                        <strong>{peak ? dateLabel(peak.date) : "—"}</strong>
                        highest forecast demand · {num(peak?.forecast)} nights
                      </p>
                      <p>
                        <strong>{percent(summary.occupancy)}</strong>forecast
                        nights ÷ estimated bed-nights, across matched days
                      </p>
                    </div>
                  </div>
                )}
              </>
            );
          }}
        </State>
      </section>

      <section
        id="capacity"
        className="dr-data-section"
        aria-labelledby="data-beds-heading"
      >
        <div className="di-section-head">
          <div>
            <p className="eyebrow">02 / Room to grow</p>
            <h2 id="data-beds-heading">Beds</h2>
          </div>
          <span>Destination total · daily utilisation estimates</span>
        </div>
        <State resource={forecast}>
          {(data) => (
            <article className="card di-chart-card">
              <div className="di-card-head">
                <div>
                  <h3>Where capacity opens up</h3>
                  <p>Select a day to inspect the forecast and bed estimate.</p>
                </div>
                <span className="di-tag">Capacity estimate</span>
              </div>
              <CapacityCalendar
                key={`${dates.start}:${dates.end}`}
                rows={data.daily}
              />
              <p className="di-note">
                {data.capacityBasis} Missing capacity is shown in grey. Values
                can exceed 100% when forecast demand is above the estimated
                supply.
              </p>
            </article>
          )}
        </State>
      </section>

      <section
        id="markets"
        className="dr-data-section"
        aria-labelledby="data-markets-heading"
      >
        <div className="di-section-head">
          <div>
            <p className="eyebrow">03 / Know your audience</p>
            <h2 id="data-markets-heading">Market intelligence</h2>
          </div>
          <span>{name} selected · analysis period above</span>
        </div>
        <div className="di-two-col">
          <article className="card di-chart-card">
            <div className="di-card-head">
              <div>
                <h3>The four source markets</h3>
                <p>
                  Guest-night estimates for the same analysis period. Select a
                  market to explore it.
                </p>
              </div>
            </div>
            <div className="di-market-bars">
              {MARKETS.map((m) => {
                const resource = markets[m.code],
                  query = resource.data;
                return (
                  <div key={m.code}>
                    <button
                      type="button"
                      className={`di-market-row ${market === m.code ? "selected" : ""}`}
                      aria-pressed={market === m.code}
                      onClick={() => setMarket(m.code)}
                    >
                      <span className="di-market-code">{m.code}</span>
                      <span>
                        {m.name}
                        <small>
                          {query
                            ? `Grade ${query.nights.grade} · ${query.nights.is_estimate ? "estimate" : "observed / modelled"}`
                            : resource.loading
                              ? "Loading…"
                              : "Unavailable"}
                        </small>
                      </span>
                      <b>{query ? num(query.nights.value) : "—"}</b>
                      <span className="di-market-track">
                        <i
                          style={{
                            width: `${((query?.nights.value || 0) / marketMax) * 100}%`,
                          }}
                        />
                      </span>
                    </button>
                    {resource.error && (
                      <div className="di-inline-error">
                        <span>{resource.error}</span>
                        <button type="button" onClick={resource.retry}>
                          Retry {m.name}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="di-note">
              {completeMarkets
                ? `${num(marketTotal)} combined nights across these four markets. `
                : "Some markets are unavailable. "}
              Shares here are among these four origins only, not the
              destination’s entire market mix.
            </p>
          </article>
          <article className="card di-chart-card">
            <div className="di-card-head">
              <div>
                <h3>{name} in focus</h3>
                <p>
                  Country-specific demand · {dateLabel(dates.start)} –{" "}
                  {dateLabel(dates.end)}
                </p>
              </div>
              <span className="di-tag">{market}</span>
            </div>
            <State resource={selected}>
              {(query) => (
                <>
                  <div className="di-focus-metrics">
                    <Metric
                      label="Guest nights"
                      value={num(query.nights.value)}
                      note="Selected origin and period"
                    />
                    <Metric
                      label="Guests"
                      value={num(query.guests.value)}
                      note="API arrival / guest estimate"
                    />
                    <Metric
                      label="Average stay"
                      value={
                        query.length_of_stay.value === null
                          ? "—"
                          : `${num(query.length_of_stay.value, 1)} nights`
                      }
                      note={query.length_of_stay.method}
                    />
                    <Metric
                      label="Median booking lead"
                      value={`${query.booking_lead_time.value.median_days_ahead} days`}
                      note="Arrival-month proxy, not country-specific bookings"
                    />
                  </div>
                  <DataNote query={query} />
                </>
              )}
            </State>
          </article>
        </div>
        <div className="di-two-col">
          <article className="card di-chart-card">
            <div className="di-card-head">
              <div>
                <h3>When do guests book?</h3>
                <p>{name} · distribution by days before arrival</p>
              </div>
            </div>
            <State resource={selected}>
              {(query) => (
                <>
                  {query.distribution ? (
                    <ShareBars
                      values={query.distribution.value}
                      labels={BOOKING_LABELS}
                    />
                  ) : (
                    <p className="di-empty">
                      Booking distribution is not available for this selection.
                    </p>
                  )}
                  <p className="di-note">
                    Grade {query.booking_lead_time.grade} ·{" "}
                    {query.booking_lead_time.method}. The distribution is
                    weighted by arrival month; it is not measured separately for
                    this country.
                  </p>
                </>
              )}
            </State>
          </article>
          <article className="card di-chart-card">
            <div className="di-card-head">
              <div>
                <h3>Audience age profile</h3>
                <p>{name} · comparable-region proxy</p>
              </div>
            </div>
            <State resource={selected}>
              {(query) => (
                <>
                  {query.age ? (
                    <ShareBars values={query.age.value} />
                  ) : (
                    <p className="di-empty">
                      Age profile is unavailable for this selection.
                    </p>
                  )}
                  <p className="di-note">
                    {query.age
                      ? `Grade ${query.age.grade} · ${query.age.method}. `
                      : ""}
                    This is an estimated profile from a comparable ski region,
                    not observed visitor ages in Paznaun-Ischgl. The API chooses
                    the season using the start month.
                  </p>
                </>
              )}
            </State>
          </article>
        </div>
        <State resource={selected}>
          {(query) => (
            <article className="card di-context">
              <h3>What’s happening around the trip?</h3>
              <div className="di-two-col">
                <div>
                  <h4>Origin calendar</h4>
                  {query.reasons.push.value.length ? (
                    <ul>
                      {query.reasons.push.value.slice(0, 3).map((reason, i) => (
                        <li key={i}>
                          <strong>
                            {reason.holidays
                              .replace(/school: /g, "")
                              .replace(/public: /g, "")}
                          </strong>
                          <span>
                            {dateLabel(reason.from)} – {dateLabel(reason.to)} ·{" "}
                            {reason.days} matching days
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="di-note">
                      No major origin holiday trigger returned for this period.
                    </p>
                  )}
                </div>
                <div>
                  <h4>Destination calendar</h4>
                  <p>
                    {query.reasons.pull.value.season_open_days} of{" "}
                    {query.reasons.pull.value.days} days marked open in the
                    season calendar.
                  </p>
                  {query.reasons.pull.value.events.length ? (
                    <ul>
                      {query.reasons.pull.value.events
                        .slice(0, 3)
                        .map((event, i) => (
                          <li key={i}>
                            <strong>{event.event}</strong>
                            <span>{dateLabel(event.date)}</span>
                          </li>
                        ))}
                    </ul>
                  ) : (
                    <p className="di-note">
                      No events returned for this period.
                    </p>
                  )}
                </div>
              </div>
              <p className="di-note">
                Calendar associations help explain timing; they are not proof of
                additional demand. A season calendar does not guarantee
                operating conditions.
              </p>
            </article>
          )}
        </State>
      </section>

      <section
        id="why"
        className="dr-data-section"
        aria-labelledby="data-deviations-heading"
      >
        <div className="di-section-head">
          <div>
            <p className="eyebrow">04 / Learn from the past</p>
            <h2 id="data-deviations-heading">Deviations</h2>
          </div>
          <label className="di-history-filter">
            Historical comparison
            <select
              aria-label="Historical comparison season"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
            >
              <option value="winter 25/26">Winter 2025/26</option>
              <option value="summer 26">Summer 2026</option>
            </select>
          </label>
        </div>
        <p className="di-note di-history-scope">
          Historical analysis uses the full comparison season selected here,
          independently of the analysis period and origin above.
        </p>
        <State resource={history}>
          {(data) => {
            const summary = historicalSummary(data.monthly);
            return (
              <>
                <div className="di-metrics di-metrics-three">
                  <Metric
                    label="Actual guest nights"
                    value={data.monthly.length ? num(summary.actual) : "—"}
                    note="Historical destination total · TVB / feratel"
                  />
                  <Metric
                    label="Net forecast bias¹"
                    value={percent(summary.bias)}
                    note="Positive = TVB forecast exceeded actual nights"
                  />
                  <Metric
                    label="Monthly weighted error"
                    value={percent(summary.weightedError)}
                    note="Absolute monthly errors ÷ total actual nights"
                  />
                </div>
                <div className="di-two-col di-history-grid">
                  <article className="card di-chart-card">
                    <div className="di-card-head">
                      <div>
                        <h3>Expectation versus reality</h3>
                        <p>{season} · all origins, destination total</p>
                      </div>
                    </div>
                    <MonthlyChart rows={data.monthly} />
                    <p className="di-note">
                      ¹ Forecast bias = (TVB forecast − actual) ÷ actual.
                      Monthly totals can hide larger daily errors; weighted
                      error here is monthly, not daily.
                    </p>
                  </article>
                  <article className="card di-chart-card">
                    <div className="di-card-head">
                      <div>
                        <h3>Drivers behind the gap</h3>
                        <p>Largest modelled associations, in guest nights</p>
                      </div>
                    </div>
                    <DriverChart drivers={data.drivers} />
                    <p className="di-note">
                      Positive = more stays than forecast; negative = fewer.
                      These contributions are associations, not proven causes,
                      and do not necessarily sum to the overall gap.
                    </p>
                    <details className="di-method">
                      <summary>Model method and confidence</summary>
                      <p>{data.method}</p>
                    </details>
                  </article>
                </div>
              </>
            );
          }}
        </State>
      </section>
      <details className="card di-provenance">
        <summary>Data sources, coverage & methods</summary>
        <p>
          The page reads precomputed tourism outputs from the existing C04 API.
          No model training or data refresh job is started by opening this page.
        </p>
        <p>
          Market queries cover 2024–2027. Daily forecast and capacity cover
          winter 2026/27 only; other periods can have market estimates without
          daily bed data. A = observed or well-tested model, B = validated
          method, C = estimate/proxy, D = rough fallback.
        </p>
        <p>
          Snapshot: {snapshot.snapshot || "not supplied"} · generated:{" "}
          {snapshot.generatedAt || forecast.data?.generated || "not supplied"}
        </p>
        <ul>
          {[
            ...new Set([
              ...(forecast.data?.sources || []),
              ...(selected.data?.sources || []),
            ]),
          ].map((source) => (
            <li key={source}>{source}</li>
          ))}
        </ul>
        <a
          href={new URL(
            "c04-api/docs",
            new URL(import.meta.env.BASE_URL, window.location.href),
          ).toString()}
          target="_blank"
          rel="noreferrer"
        >
          Explore the API documentation
        </a>
      </details>
    </div>
  );
}
