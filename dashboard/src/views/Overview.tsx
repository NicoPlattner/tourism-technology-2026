import { useState } from 'react';
import type { ViewProps } from '../App';
import { SeasonChart, Legend, type SeriesKey } from '../components/charts';
import { Confidence } from '../components/ui';
import RotatingCircle from '../components/RotatingCircle';
import { approx, pct, shortDate, signedPct } from '../analysis/format';

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

export default function Overview({ ds, model, go }: ViewProps) {
  const { seasons, cap, actions } = model;
  const [on, setOn] = useState<Record<SeriesKey, boolean>>({ actual: true, forecast: true, previous: false, beds: true, open: false });

  const past = ds.days.filter((d) => d.date < ds.today);
  const actual = seasons.reduce((a, s) => a + s.actual, 0);
  const fcPast = past.reduce((a, d) => a + (d.forecast ?? 0), 0);
  const next = ds.days.filter((d) => d.date >= ds.today && d.date < addDays(ds.today, 30));
  const nextFc = next.reduce((a, d) => a + (d.forecast ?? 0), 0);
  const nextPy = next.reduce((a, d) => a + (d.previousYear ?? 0), 0);
  const full = cap.filter((c) => c.occupancy >= 0.85).length;
  const cap30 = cap.filter((c) => c.date < addDays(ds.today, 30));
  const occ30 = cap30.reduce((a, c) => a + c.expected, 0) / Math.max(1, cap30.reduce((a, c) => a + c.beds, 0));
  const ev = ds.days.find((d) => d.date >= ds.today && d.events.length);
  const opening = ev ? { date: ev.date, name: ev.events[0], days: Math.round((Date.parse(ev.date) - Date.parse(ds.today)) / 864e5) } : null;

  // next school holiday per partner market
  const nextHol = Object.keys(ds.marketMix).map((m) => {
    const days = ds.days.filter((d) => d.date >= ds.today && d.holidays.some((h) => h.market === m && h.coverage > 0.3));
    return days.length ? { m, start: days[0].date, name: days[0].holidays.find((h) => h.market === m)!.name } : null;
  }).filter(Boolean) as { m: string; start: string; name: string }[];

  return (
    <div className="view">
      <section className="hero-dark">
        <div className="hero-copy">
          <p className="eyebrow light">Winter 2026/27</p>
          <h1 className="mega">{opening ? <>{opening.days} days<br />to opening</> : <>Season<br />ahead</>}</h1>
          {opening && <p className="hero-sub">{opening.name} · {shortDate(opening.date)}</p>}
        </div>
        <RotatingCircle text="Relax • If you can •" size={210} tone="dark">
          <span className="rc-num">{full}</span>
          <span className="rc-label">days near full</span>
        </RotatingCircle>
      </section>

      <section className="kpis">
        <Kpi label="Season so far" value={approx(actual)} delta={actual / fcPast - 1} note="vs forecast" onClick={() => go('season')} />
        <Kpi label="Next 30 days" value={approx(nextFc)} delta={nextFc / nextPy - 1} note="vs last year" onClick={() => go('season')} />
        <Kpi label="Beds booked" value={pct(occ30)} note="avg. next 30 days" onClick={() => go('capacity')} />
        <button className="kpi" onClick={() => go('season')}>
          <span className="k-label">Next holidays</span>
          {nextHol.map((h) => <span key={h.m} className="k-line"><b>{h.m}</b> {h.start <= ds.today ? 'now' : shortDate(h.start)}</span>)}
        </button>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Season</h2>
          <Legend on={on} toggle={(k) => setOn({ ...on, [k]: !on[k] })} />
        </div>
        <SeasonChart ds={ds} acc={model.acc} on={on} height={320} />
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Next steps</h2>
          <button className="link" onClick={() => go('actions')}>All {actions.length} →</button>
        </div>
        <ol className="steps-min">
          {actions.slice(0, 3).map((a, i) => (
            <li key={a.id}>
              <span className="n">{i + 1}</span>
              <span className="t">{a.title}</span>
              <span className="w">{a.where}</span>
              <Confidence c={a.confidence} />
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Kpi({ label, value, delta, note, accent, onClick }: { label: string; value: string; delta?: number; note?: string; accent?: boolean; onClick: () => void }) {
  return (
    <button className={`kpi ${accent ? 'accent' : ''}`} onClick={onClick}>
      <span className="k-label">{label}</span>
      <strong>{value}</strong>
      <span className="k-sub">{delta != null && <b className={delta >= 0 ? 'pos' : 'neg'}>{signedPct(delta)}</b>} {note}</span>
    </button>
  );
}
