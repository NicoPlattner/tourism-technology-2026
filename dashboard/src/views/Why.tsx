import { useState } from 'react';
import type { ViewProps } from '../App';
import { MiniChart, SeasonChart, WeekdayBias } from '../components/charts';
import { Confidence } from '../components/ui';
import { approx, range, signedN, signedPct } from '../analysis/format';
import type { Reason } from '../analysis/insights';

const ICON: Record<Reason['kind'], string> = { data: '⚠', weather: '☂', holidays: '🎒', event: '★', weekday: '📅', forecast: '≈', unknown: '?' };

export default function Why({ ds, model }: ViewProps) {
  const { eps, acc } = model;
  const [sel, setSel] = useState(eps[0]?.id);
  const ep = eps.find((e) => e.id === sel) ?? eps[0];
  const pad = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

  return (
    <div className="view">
      <header className="view-head">
        <p className="eyebrow">Why?</p>
        <h1>What explains the gaps between forecast and reality</h1>
        <p className="lead">We look at every stretch of days where the actual stays were more than 10% away from the forecast and test the usual suspects against open data: weather, school holidays in our source markets, events, a systematic error in the forecast — or simply missing data.</p>
      </header>

      <div className="why-layout">
        <aside className="ep-list" aria-label="Surprises">
          {eps.map((e) => (
            <button key={e.id} className={`ep ${e.id === ep?.id ? 'on' : ''}`} onClick={() => setSel(e.id)}>
              <span className={`dir ${e.direction}`}>{e.direction === 'gap' ? 'gap' : signedPct(e.rel)}</span>
              <span className="ep-main">
                <b>{range(e.start, e.end)}</b>
                <small>{e.reasons[0].title}</small>
              </span>
              <Confidence c={e.confidence} />
            </button>
          ))}
        </aside>

        {ep && (
          <section className="card ep-detail">
            <p className="eyebrow">{range(ep.start, ep.end)} · {ep.days.length} day{ep.days.length > 1 ? 's' : ''}</p>
            <h2>{ep.direction === 'gap' ? 'No stays were reported' : <>{signedN(ep.diff)} guest nights ({signedPct(ep.rel)}) {ep.direction === 'above' ? 'more' : 'fewer'} than forecast</>}</h2>
            <SeasonChart ds={ds} acc={acc} from={pad(ep.start, -10)} to={pad(ep.end, 10)} height={220} on={{ actual: true, forecast: true, open: true, previous: false, beds: false }} highlight={[{ start: ep.start, end: ep.end, tone: ep.direction }]} />
            <h3>Most likely reasons</h3>
            <ol className="reasons">
              {ep.reasons.map((r, i) => (
                <li key={i} className={i === 0 ? 'lead-reason' : ''}>
                  <span className="r-icon" aria-hidden="true">{ICON[r.kind]}</span>
                  <div className="r-body">
                    <p className="r-title">{r.title}</p>
                    <p>{r.detail}</p>
                    {r.evidence.length > 0 && <p className="evidence">{r.evidence.map((e, j) => <span key={j}><b>{e.source}</b> {e.text}</span>)}</p>}
                  </div>
                  <div className="r-score" title="How well this reason fits the data">
                    <span className="sb-track"><span className="sb-fill" style={{ width: `${Math.round(r.score * 100)}%` }} /></span>
                    <small>{r.score >= 0.7 ? 'strong' : r.score >= 0.45 ? 'plausible' : 'weak'}</small>
                  </div>
                </li>
              ))}
            </ol>
            <p className="footnote">Confidence: <Confidence c={ep.confidence} /> — {ep.confidence === 'high' ? 'the data points clearly to this reason.' : ep.confidence === 'medium' ? 'plausible, but other factors (bookings, prices) could also play a role.' : 'the data we have does not explain this well — worth asking partners.'}</p>
          </section>
        )}
      </div>

      <section className="grid2">
        <div className="card">
          <h2>Is the forecast always off on certain days?</h2>
          <p className="muted">Average gap between actual stays and forecast, per weekday, over {acc.daysCompared} days. A bar that sticks out is a pattern you can correct — not bad luck.</p>
          <WeekdayBias acc={acc} />
        </div>
        <div className="card">
          <h2>All surprises at a glance</h2>
          <div className="mini-grid">
            {eps.slice(0, 6).map((e) => (
              <button key={e.id} className="mini-card" onClick={() => { setSel(e.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                <span className="mini-head"><b>{range(e.start, e.end)}</b><span className={`dir ${e.direction}`}>{e.direction === 'gap' ? 'gap' : signedPct(e.rel)}</span></span>
                <MiniChart days={ds.days.filter((d) => d.date >= pad(e.start, -3) && d.date <= pad(e.end, 3))} />
                <small className="muted">{e.reasons[0].title} · {approx(Math.abs(e.diff))} nights</small>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
