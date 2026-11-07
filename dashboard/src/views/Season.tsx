import { useState } from 'react';
import type { ViewProps } from '../App';
import { SeasonChart, Legend, type SeriesKey } from '../components/charts';
import { officialMonthly } from '../data/sources';
import { n, signedPct } from '../analysis/format';

const PERIODS = [
  { id: 'all', label: 'All 244 days', from: undefined, to: undefined },
  { id: 'summer', label: 'Summer', from: '2026-06-01', to: '2026-09-30' },
  { id: 'autumn', label: 'Autumn', from: '2026-09-15', to: '2026-11-30' },
  { id: 'winter', label: 'Early winter', from: '2026-11-01', to: '2027-01-30' },
] as const;

export default function Season({ ds, model }: ViewProps) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['id']>('all');
  const [on, setOn] = useState<Record<SeriesKey, boolean>>({ actual: true, forecast: true, open: true, previous: true, beds: true });
  const p = PERIODS.find((x) => x.id === period)!;
  const official = new Map(officialMonthly);

  const months = [...new Set(ds.days.map((d) => d.date.slice(0, 7)))].map((m) => {
    const days = ds.days.filter((d) => d.date.startsWith(m));
    const sum = (f: (d: (typeof days)[number]) => number | null) => days.reduce((a, d) => a + (f(d) ?? 0), 0);
    const actual = sum((d) => d.actual), forecast = sum((d) => d.forecast), py = sum((d) => d.previousYear);
    const complete = days.every((d) => d.date < ds.today);
    return { m, actual, forecast, py, open: sum((d) => d.openForecast), official: official.get(m), complete, started: days.some((d) => d.date < ds.today) };
  });

  return (
    <div className="view">
      <header className="view-head">
        <p className="eyebrow">Season</p>
        <h1>Actual, forecast and last year — day by day</h1>
        <p className="lead">Each line is the number of guests staying overnight on that day. Underneath you see what might explain the ups and downs: school holidays in our main markets (darker = more regions on holiday), weather in Ischgl and events.</p>
      </header>

      <div className="card">
        <div className="toolbar">
          <div className="seg" role="radiogroup" aria-label="Period">
            {PERIODS.map((x) => <button key={x.id} role="radio" aria-checked={period === x.id} className={period === x.id ? 'on' : ''} onClick={() => setPeriod(x.id)}>{x.label}</button>)}
          </div>
          <Legend on={on} toggle={(k) => setOn({ ...on, [k]: !on[k] })} />
        </div>
        <SeasonChart ds={ds} acc={model.acc} on={on} from={p.from} to={p.to} height={400} />
        <div className="howto">
          <span><b>Rows DE, NL, CH, AT, BE:</b> school holidays in that market</span>
          <span><b>Wx:</b> grey = rain, blue = fresh snow</span>
          <span><b>▲</b> events</span>
          <span><b>Red dots at the bottom:</b> days with no data reported</span>
        </div>
      </div>

      <div className="card">
        <h2>Month by month</h2>
        <p className="muted">The “official” column comes from the public monthly statistics — a quick check that the daily data adds up.</p>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Month</th><th>Actual</th><th>Our forecast</th><th>vs forecast</th><th>Last year</th><th>vs last year</th><th>Open model</th><th>Official total</th></tr></thead>
            <tbody>
              {months.map((r) => (
                <tr key={r.m} className={!r.started ? 'future' : ''}>
                  <td>{new Date(`${r.m}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}{!r.complete && r.started ? <small> (so far)</small> : null}</td>
                  <td className="num">{r.started ? n(r.actual) : '–'}</td>
                  <td className="num">{n(r.forecast)}</td>
                  <td className={`num ${r.started && r.complete ? (r.actual >= r.forecast ? 'pos' : 'neg') : ''}`}>{r.complete ? signedPct(r.actual / r.forecast - 1) : '–'}</td>
                  <td className="num">{n(r.py)}</td>
                  <td className={`num ${(r.complete ? r.actual : r.forecast) >= r.py ? 'pos' : 'neg'}`}>{signedPct((r.complete ? r.actual : r.forecast) / r.py - 1)}{!r.complete ? <small> exp.</small> : null}</td>
                  <td className="num">{n(r.open)}</td>
                  <td className="num">{r.official ? <>{n(r.official)} {r.complete && Math.abs(r.official - r.actual) / r.official < 0.01 ? <span className="okmark" title="Daily data matches the official total">✓</span> : null}</> : <small className="muted">not yet published</small>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
