import { useMemo, useState } from 'react';
import type { ViewProps } from '../App';
import { approx, dayLabel, n, pct } from '../analysis/format';
import type { CapacityDay } from '../analysis/insights';

const LEGEND = [
  { label: '< 50%', c: '#eef0f3' },
  { label: '50–85%', c: '#f2b3c1' },
  { label: '85–100%', c: '#bb1c3f' },
  { label: '> 100%', c: '#4a0816' },
];
const color = (o: number) => (o > 1 ? '#4a0816' : o >= 0.85 ? '#bb1c3f' : o >= 0.5 ? '#f2b3c1' : '#eef0f3');
const monthLabel = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export default function Capacity({ ds, model }: ViewProps) {
  const { cap } = model;
  const months = useMemo(() => [...new Set(cap.map((c) => c.date.slice(0, 7)))], [cap]);
  const [mi, setMi] = useState(0);
  const month = months[mi];
  const byDate = useMemo(() => new Map(cap.map((c) => [c.date, c])), [cap]);
  const [picked, setPicked] = useState<CapacityDay | undefined>();

  if (!month) return <div className="view"><p className="muted">No bed data ahead.</p></div>;
  const [y, m] = month.split('-').map(Number);
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const cells = [...Array(offset).fill(null), ...Array.from({ length: daysIn }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  const inMonth = cap.filter((c) => c.date.startsWith(month));
  const sel = picked && picked.date.startsWith(month) ? picked : inMonth.reduce((a, b) => (b.occupancy > (a?.occupancy ?? -1) ? b : a), inMonth[0]);
  const day = sel ? ds.days.find((d) => d.date === sel.date) : undefined;

  return (
    <div className="view grid-cap">
      <section className="card">
        <div className="pager">
          <button className="pg" onClick={() => setMi(Math.max(0, mi - 1))} disabled={mi === 0} aria-label="Previous month">‹</button>
          <h2>{monthLabel(month)}</h2>
          <button className="pg" onClick={() => setMi(Math.min(months.length - 1, mi + 1))} disabled={mi === months.length - 1} aria-label="Next month">›</button>
          <span className="pg-dots">{months.map((x, i) => <i key={x} className={i === mi ? 'on' : ''} onClick={() => setMi(i)} />)}</span>
        </div>
        <div className="month" role="grid" aria-label={`Share of beds booked, ${monthLabel(month)}`}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d} className="mh">{d}</span>)}
          {cells.map((date, i) => {
            if (!date) return <span key={`e${i}`} />;
            const c = byDate.get(date);
            const dark = c && c.occupancy >= 0.85;
            return c ? (
              <button key={date} role="gridcell" className={`mcell ${sel?.date === date ? 'picked' : ''} ${c.flags.length ? 'flag' : ''}`} style={{ background: color(c.occupancy) }} onClick={() => setPicked(c)} title={`${dayLabel(date)}: ${pct(c.occupancy)}`}>
                <span className={dark ? 'light' : ''}>{Number(date.slice(8))}</span>
                <b className={dark ? 'light' : ''}>{pct(c.occupancy)}</b>
              </button>
            ) : <span key={date} className="mcell none"><span>{Number(date.slice(8))}</span></span>;
          })}
        </div>
        <div className="occ-legend">{LEGEND.map((l) => <span key={l.label}><i style={{ background: l.c }} />{l.label}</span>)}</div>
      </section>

      {sel && day && (
        <section className="card day-card" aria-live="polite">
          <p className="eyebrow">{dayLabel(sel.date)}</p>
          <p className="big">{pct(sel.occupancy)}</p>
          <dl className="kv">
            <div><dt>Guests</dt><dd>{approx(sel.expected)}</dd></div>
            <div><dt>Beds</dt><dd>{n(sel.beds)}{sel.flags.includes('missing-beds') ? ' *' : ''}</dd></div>
            {day.previousYear != null && <div><dt>Last year</dt><dd>{n(day.previousYear)}</dd></div>}
          </dl>
          <p className="chips">
            {day.holidays.filter((h) => h.coverage > 0.2).map((h) => <span key={h.market}>🎒 {h.market}</span>)}
            {day.events.map((e) => <span key={e}>★ {e}</span>)}
          </p>
          {sel.flags.includes('missing-beds') && <p className="muted small">* estimated, data missing</p>}
        </section>
      )}
    </div>
  );
}
