import { useState } from 'react';
import type { ViewProps } from '../App';
import { SeasonChart, Legend, type SeriesKey } from '../components/charts';
import { Confidence, TypeTag } from '../components/ui';
import { approx, range, shortDate, signedPct, dayLabel, pct } from '../analysis/format';
import { corrected } from '../analysis/insights';

export default function Overview({ ds, model, go }: ViewProps) {
  const { seasons, cap, weeks, eps, acc, actions, quality } = model;
  const [on, setOn] = useState<Record<SeriesKey, boolean>>({ actual: true, forecast: true, open: false, previous: true, beds: true });

  const summer = seasons[0];
  const autumnDays = ds.days.filter((d) => d.date >= '2026-10-01' && d.date < ds.today && d.actual != null);
  const autumnRel = autumnDays.reduce((a, d) => a + d.actual!, 0) / Math.max(1, autumnDays.reduce((a, d) => a + (d.forecast ?? 0), 0)) - 1;
  const tightest = cap.reduce((a, b) => (b.occupancy > (a?.occupancy ?? 0) ? b : a), cap[0]);
  const behind = weeks.filter((w) => w.rel < -0.08 && w.previousYear > 20000).sort((a, b) => a.rel - b.rel)[0];
  const next30 = ds.days.filter((d) => d.date >= ds.today && d.date < addDays(ds.today, 30));
  const next30Exp = next30.reduce((a, d) => a + (corrected(d, acc) ?? 0), 0);
  const next30Py = next30.reduce((a, d) => a + (d.previousYear ?? 0), 0);
  const topEps = eps.slice(0, 3);
  const autumnReason = eps.find((e) => e.start >= '2026-10-01' && e.direction === 'above')?.reasons[0];

  return (
    <div className="view">
      <section className="hero">
        <p className="eyebrow">The situation in one minute</p>
        <h1>
          Summer closed <em>{signedPct(summer.actual / summer.forecast - 1)}</em> against forecast. Christmas will be close to full —
          {behind ? <> but <em className="neg">{range(behind.start, behind.end)}</em> runs {Math.abs(Math.round(behind.rel * 100))}% behind last year.</> : ' and the weeks before look solid.'}
        </h1>
        <ul className="story">
          <li><b>Summer 2026:</b> {approx(summer.actual)} overnight stays — {signedPct(summer.actual / summer.forecast - 1)} vs our forecast, {signedPct(summer.actual / summer.previousYear - 1)} vs last summer.</li>
          <li><b>Autumn so far:</b> {signedPct(autumnRel)} vs forecast{autumnReason ? <>, most likely due to <b>{autumnReason.title}</b></> : null}.</li>
          {tightest && <li><b>Tightest day ahead:</b> {dayLabel(tightest.date)} — {tightest.occupancy > 1 ? <>more guests want to come than there are beds (<b>{pct(tightest.occupancy)}</b>)</> : <>about <b>{pct(tightest.occupancy)}</b> of the beds open that day</>}.</li>}
          <li><b>Forecast quality:</b> typically off by {Math.round(acc.mape * 100)}% a day; Saturdays are {acc.saturdayBias > 0 ? 'under' : 'over'}-forecast by {Math.abs(Math.round(acc.saturdayBias * 100))}%.</li>
        </ul>
      </section>

      <section className="kpis">
        <button className="kpi" onClick={() => go('season')}>
          <span className="k-label">Season so far</span>
          <strong>{approx(seasons.reduce((a, s) => a + s.actual, 0))}</strong>
          <span className="k-sub">stays since 1 June · {signedPct(seasons.reduce((a, s) => a + s.actual, 0) / ds.days.filter((d) => d.date < ds.today).reduce((a, d) => a + (d.forecast ?? 0), 0) - 1)} vs forecast</span>
        </button>
        <button className="kpi" onClick={() => go('season')}>
          <span className="k-label">Next 30 days</span>
          <strong>{approx(next30Exp)}</strong>
          <span className="k-sub">stays expected · {signedPct(next30Exp / next30Py - 1)} vs last year</span>
        </button>
        <button className="kpi accent" onClick={() => go('capacity')}>
          <span className="k-label">Days close to full</span>
          <strong>{cap.filter((c) => c.occupancy >= 0.85).length}</strong>
          <span className="k-sub">of the next {cap.length} days above 85% of beds</span>
        </button>
        <button className="kpi" onClick={() => go('data')}>
          <span className="k-label">Data health</span>
          <strong>{Math.round(quality.score * 5)}/5</strong>
          <span className="k-sub">{quality.items.filter((i) => !i.ok).length} checks need attention</span>
        </button>
      </section>

      <section className="grid2">
        <div className="card">
          <div className="card-head">
            <h2>What to do first</h2>
            <button className="link" onClick={() => go('actions')}>All {actions.length} steps →</button>
          </div>
          <ol className="todo">
            {actions.slice(0, 3).map((a) => (
              <li key={a.id}>
                <div className="todo-top"><TypeTag type={a.type} /><Confidence c={a.confidence} /></div>
                <p className="todo-title">{a.title}</p>
                <p className="muted">{a.what}. <i>{a.when}.</i></p>
              </li>
            ))}
          </ol>
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Biggest surprises so far</h2>
            <button className="link" onClick={() => go('why')}>Explain all →</button>
          </div>
          <ul className="surprises">
            {topEps.map((e) => (
              <li key={e.id}>
                <span className={`dir ${e.direction}`}>{e.direction === 'gap' ? 'gap' : signedPct(e.rel)}</span>
                <div>
                  <p className="todo-title">{range(e.start, e.end)}</p>
                  <p className="muted">Most likely: <b>{e.reasons[0].title}</b></p>
                </div>
                <Confidence c={e.confidence} />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>The whole season at a glance</h2>
            <p className="muted">Guests staying overnight per day. Red is what happened, blue what we expected, grey last year, the dark line the beds available. Hover for details.</p>
          </div>
          <button className="link" onClick={() => go('season')}>Open the season view →</button>
        </div>
        <Legend on={on} toggle={(k) => setOn({ ...on, [k]: !on[k] })} />
        <SeasonChart ds={ds} acc={acc} on={on} height={300} strips={false} highlight={topEps.map((e) => ({ start: e.start, end: e.end, tone: e.direction }))} />
        <p className="footnote">Shaded: the biggest surprises. Light area: the future — the blue band shows the range the forecast is usually within. Last update {shortDate(ds.today)}.</p>
      </section>
    </div>
  );
}

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
