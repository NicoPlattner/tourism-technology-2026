import { useState } from "react";
import type { ForecastDay, HistoricalMonth, Driver } from "./data";
export const num = (n: number | null | undefined, digits = 0) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-GB", { maximumFractionDigits: digits }).format(
        n,
      );
export const percent = (n: number | null | undefined) =>
  n == null ? "—" : `${num(n * 100, 1)}%`;
export const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
const short = (n: number) =>
  n >= 1000000
    ? `${num(n / 1000000, 1)}m`
    : n >= 1000
      ? `${num(n / 1000, 1)}k`
      : num(n);
const ticks = [0, 0.25, 0.5, 0.75, 1];
const W = 760,
  H = 280,
  L = 54,
  R = 18,
  T = 18,
  B = 40;
function segments(
  rows: ForecastDay[],
  value: (r: ForecastDay) => number | null,
) {
  const groups: ForecastDay[][] = [];
  let group: ForecastDay[] = [];
  for (const row of rows) {
    if (
      value(row) === null ||
      (group.length &&
        Date.parse(row.date) - Date.parse(group[group.length - 1].date) >
          86400000)
    ) {
      if (group.length) groups.push(group);
      group = [];
    }
    if (value(row) !== null) group.push(row);
  }
  if (group.length) groups.push(group);
  return groups;
}
export function ForecastChart({ rows }: { rows: ForecastDay[] }) {
  const [capacity, setCapacity] = useState(true),
    [band, setBand] = useState(true),
    [official, setOfficial] = useState(false);
  const [selected, setSelected] = useState(0);
  if (!rows.length)
    return (
      <p className="di-empty">
        No daily forecast in this period. Market estimates may still be
        available below.
      </p>
    );
  const max =
    Math.max(
      1,
      ...rows.flatMap((r) => [
        r.forecast,
        capacity ? r.capacity || 0 : 0,
        band ? r.high || 0 : 0,
        official ? r.official || 0 : 0,
      ]),
    ) * 1.08;
  const first = Date.parse(rows[0].date),
    span = Math.max(86400000, Date.parse(rows[rows.length - 1].date) - first);
  const x = (r: ForecastDay) =>
      L + ((Date.parse(r.date) - first) / span) * (W - L - R),
    y = (n: number) => T + (1 - n / max) * (H - T - B);
  const path = (group: ForecastDay[], value: (r: ForecastDay) => number) =>
    group
      .map(
        (r, i) =>
          `${i ? "L" : "M"}${x(r).toFixed(1)},${y(value(r)).toFixed(1)}`,
      )
      .join(" ");
  const row = rows[Math.min(selected, rows.length - 1)];
  return (
    <>
      <div className="di-chart-options" aria-label="Forecast series">
        <span>
          <i className="di-dot" />
          Forecast
        </span>
        <label>
          <input
            type="checkbox"
            checked={band}
            onChange={(e) => setBand(e.target.checked)}
          />
          80% prediction band
        </label>
        <label>
          <input
            type="checkbox"
            checked={capacity}
            onChange={(e) => setCapacity(e.target.checked)}
          />
          Estimated capacity
        </label>
        <label>
          <input
            type="checkbox"
            checked={official}
            onChange={(e) => setOfficial(e.target.checked)}
          />
          Official TR53 forecast
        </label>
      </div>
      <div className="di-svg-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Daily forecast guest nights, prediction range and estimated bed capacity"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={L}
                x2={W - R}
                y1={y(t * max)}
                y2={y(t * max)}
                className="di-gridline"
              />
              <text x={L - 10} y={y(t * max) + 4} textAnchor="end">
                {short(t * max)}
              </text>
            </g>
          ))}
          {band &&
            segments(rows, (r) => r.low).map((group, i) => (
              <path
                key={`band${i}`}
                d={`${path(group, (r) => r.high!)} ${[...group]
                  .reverse()
                  .map((r) => `L${x(r)},${y(r.low!)}`)
                  .join(" ")} Z`}
                fill="#f8dce5"
              />
            ))}
          {capacity &&
            segments(rows, (r) => r.capacity).map((g, i) => (
              <path
                key={`cap${i}`}
                d={path(g, (r) => r.capacity!)}
                fill="none"
                stroke="#303943"
                strokeWidth="2"
                strokeDasharray="5 4"
              />
            ))}
          {official &&
            segments(rows, (r) => r.official).map((g, i) => (
              <path
                key={`off${i}`}
                d={path(g, (r) => r.official!)}
                fill="none"
                stroke="#3c7898"
                strokeWidth="2"
              />
            ))}
          {segments(rows, (r) => r.forecast).map((g, i) => (
            <path
              key={i}
              d={path(g, (r) => r.forecast)}
              fill="none"
              stroke="#bb1c3f"
              strokeWidth="2.5"
            />
          ))}
          <line
            x1={x(row)}
            x2={x(row)}
            y1={T}
            y2={H - B}
            stroke="#8e99a4"
            strokeDasharray="3 3"
          />
          <circle cx={x(row)} cy={y(row.forecast)} r="4" fill="#bb1c3f" />
          {[
            ...new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1]),
          ].map((i, index) => (
            <text
              key={i}
              x={x(rows[i])}
              y={H - 12}
              textAnchor={
                index === 0 ? "start" : i === rows.length - 1 ? "end" : "middle"
              }
            >
              {dateLabel(rows[i].date)}
            </text>
          ))}
        </svg>
      </div>
      <div className="di-inspect">
        <label htmlFor="di-forecast-day">Inspect forecast date</label>
        <input
          id="di-forecast-day"
          type="range"
          min="0"
          max={rows.length - 1}
          value={Math.min(selected, rows.length - 1)}
          onChange={(e) => setSelected(Number(e.target.value))}
          aria-valuetext={dateLabel(row.date)}
        />
      </div>
      <p className="di-chart-readout" aria-live="polite">
        <strong>{dateLabel(row.date)}</strong>
        <span>{num(row.forecast)} forecast nights</span>
        <span>
          {row.capacity === null
            ? "Capacity unavailable"
            : `${percent(row.forecast / row.capacity)} estimated utilisation`}
        </span>
        <span>
          80% band:{" "}
          {row.low === null
            ? "unavailable"
            : `${num(row.low)}–${num(row.high)}`}
        </span>
      </p>
      <details className="di-table-details">
        <summary>View daily figures</summary>
        <div className="di-table-wrap">
          <table>
            <caption>Daily outlook · Paznaun-Ischgl, all origins</caption>
            <thead>
              <tr>
                <th>Date</th>
                <th>Forecast nights</th>
                <th>80% range</th>
                <th>Capacity estimate</th>
                <th>Utilisation</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.date}>
                  <th>{dateLabel(r.date)}</th>
                  <td>{num(r.forecast)}</td>
                  <td>
                    {r.low === null ? "—" : `${num(r.low)}–${num(r.high)}`}
                  </td>
                  <td>{num(r.capacity)}</td>
                  <td>
                    {r.capacity === null
                      ? "—"
                      : percent(r.forecast / r.capacity)}
                  </td>
                  <td>{r.grade}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
export function MonthlyChart({ rows }: { rows: HistoricalMonth[] }) {
  if (!rows.length)
    return <p className="di-empty">No historical monthly figures available.</p>;
  const max = Math.max(1, ...rows.flatMap((r) => [r.actual, r.forecast])) * 1.1;
  const slot = (W - L - R) / rows.length,
    y = (v: number) => T + (1 - v / max) * (H - T - B);
  return (
    <>
      <div className="di-chart-options">
        <span>
          <i className="di-dot" />
          Actual nights
        </span>
        <span>
          <i className="di-dot di-dot-dark" />
          TVB forecast
        </span>
      </div>
      <div className="di-svg-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Historical monthly actual guest nights compared with the TVB forecast"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={L}
                x2={W - R}
                y1={y(t * max)}
                y2={y(t * max)}
                className="di-gridline"
              />
              <text x={L - 10} y={y(t * max) + 4} textAnchor="end">
                {short(t * max)}
              </text>
            </g>
          ))}
          {rows.map((r, i) => (
            <g key={r.month}>
              <rect
                x={L + i * slot + slot * 0.18}
                y={y(r.actual)}
                width={slot * 0.29}
                height={H - B - y(r.actual)}
                fill="#bb1c3f"
              >
                <title>
                  {r.month}: {num(r.actual)} actual nights
                </title>
              </rect>
              <rect
                x={L + i * slot + slot * 0.53}
                y={y(r.forecast)}
                width={slot * 0.29}
                height={H - B - y(r.forecast)}
                fill="#303943"
              >
                <title>
                  {r.month}: {num(r.forecast)} TVB forecast nights
                </title>
              </rect>
              <text x={L + (i + 0.5) * slot} y={H - 12} textAnchor="middle">
                {new Date(`${r.month}-01`).toLocaleDateString("en-GB", {
                  month: "short",
                  timeZone: "UTC",
                })}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <details className="di-table-details">
        <summary>View monthly figures and forecast bias</summary>
        <div className="di-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Actual nights</th>
                <th>TVB forecast</th>
                <th>Forecast bias¹</th>
                <th>Tracking signal</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.month}>
                  <th>{r.month}</th>
                  <td>{num(r.actual)}</td>
                  <td>{num(r.forecast)}</td>
                  <td>
                    {r.actual
                      ? percent((r.forecast - r.actual) / r.actual)
                      : "—"}
                  </td>
                  <td>
                    {num(r.tracking, 1)}
                    {r.tracking !== null && Math.abs(r.tracking) > 4
                      ? " · systematic bias"
                      : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
export function DriverChart({ drivers }: { drivers: Driver[] }) {
  const shown = drivers.slice(0, 7),
    max = Math.max(1, ...shown.map((d) => Math.abs(d.nights)));
  return (
    <div className="di-drivers">
      {shown.length ? (
        shown.map((d) => (
          <div className="di-driver" key={d.name}>
            <div className="di-driver-label">
              <span>{d.name}</span>
              <b>
                {d.nights > 0 ? "+" : ""}
                {num(d.nights)}
              </b>
            </div>
            <div className="di-diverging" aria-hidden="true">
              <i
                className={d.nights >= 0 ? "positive" : "negative"}
                style={{
                  width: `${(Math.abs(d.nights) / max) * 50}%`,
                  left:
                    d.nights >= 0
                      ? "50%"
                      : `${50 - (Math.abs(d.nights) / max) * 50}%`,
                }}
              />
            </div>
            <small>
              Grade {d.grade} · {d.kind} · 80% interval {num(d.low)} to{" "}
              {num(d.high)}
            </small>
          </div>
        ))
      ) : (
        <p className="di-empty">No driver estimates available.</p>
      )}
    </div>
  );
}
export function CapacityCalendar({ rows }: { rows: ForecastDay[] }) {
  const [picked, setPicked] = useState<string>("");
  const months = [...new Set(rows.map((r) => r.date.slice(0, 7)))],
    row = rows.find((r) => r.date === picked);
  return (
    <>
      <div className="di-chart-options">
        <span>
          <i className="di-dot di-dot-soft" />
          Below 80%
        </span>
        <span>
          <i className="di-dot di-dot-mid" />
          80–95%
        </span>
        <span>
          <i className="di-dot" />
          95% or more
        </span>
        <span>
          <i className="di-dot di-dot-missing" />
          No capacity data
        </span>
      </div>
      {row && (
        <p className="di-chart-readout" aria-live="polite">
          <strong>{dateLabel(row.date)}</strong>
          <span>{num(row.forecast)} forecast nights</span>
          <span>
            {row.capacity === null
              ? "Capacity unavailable"
              : `${num(row.capacity)} estimated beds · ${percent(row.forecast / row.capacity)} utilisation`}
          </span>
        </p>
      )}
      <div className="di-months">
        {months.map((month) => {
          const days = rows.filter((r) => r.date.startsWith(month));
          const offset =
            (new Date(`${month}-01T12:00:00Z`).getUTCDay() + 6) % 7;
          const firstDay = Number(days[0].date.slice(8));
          return (
            <div className="di-month" key={month}>
              <h3>
                {new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-GB", {
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </h3>
              <div className="di-calendar-grid">
                {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                  <span key={`weekday${i}`} className="di-weekday">
                    {d}
                  </span>
                ))}
                {Array.from({ length: offset + firstDay - 1 }, (_, i) => (
                  <span key={`empty${i}`} />
                ))}
                {Array.from(
                  {
                    length:
                      Number(days[days.length - 1].date.slice(8)) -
                      firstDay +
                      1,
                  },
                  (_, i) => {
                    const n = firstDay + i,
                      r = days.find((d) => Number(d.date.slice(8)) === n),
                      occupancy = r?.capacity ? r.forecast / r.capacity : null;
                    const color =
                      occupancy === null
                        ? "missing"
                        : occupancy < 0.8
                          ? "spare"
                          : occupancy < 0.95
                            ? "normal"
                            : "tight";
                    return r ? (
                      <button
                        type="button"
                        className={`di-day ${color}`}
                        key={n}
                        aria-pressed={picked === r.date}
                        aria-label={`${dateLabel(r.date)}: ${occupancy === null ? "capacity unavailable" : percent(occupancy) + " estimated utilisation"}`}
                        onClick={() => setPicked(r.date)}
                        title={
                          occupancy === null
                            ? "No capacity data"
                            : percent(occupancy)
                        }
                      >
                        {n}
                      </button>
                    ) : (
                      <span
                        className="di-day missing"
                        key={n}
                        title="No forecast data"
                      >
                        {n}
                      </span>
                    );
                  },
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!months.length && (
        <p className="di-empty">
          No daily capacity data in this period. Try November 2026–April 2027.
        </p>
      )}
    </>
  );
}
export function ShareBars({
  values,
  labels,
}: {
  values: Record<string, number>;
  labels?: Record<string, string>;
}) {
  return (
    <div className="di-share-bars">
      {Object.entries(values).map(([key, value]) => (
        <div key={key}>
          <div>
            <span>{labels?.[key] || key.replace("age_", "")}</span>
            <b>{percent(value)}</b>
          </div>
          <div className="di-track">
            <i style={{ width: `${Math.min(1, Math.max(0, value)) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
