import { useState } from 'react';
import type { ViewProps } from '../App';
import { CapacityCalendar, OCC_LEGEND, SeasonChart } from '../components/charts';
import { approx, dayLabel, n, pct } from '../analysis/format';
import { MARKET_NAMES } from '../data/sources';
import type { CapacityDay } from '../analysis/insights';

export default function Capacity({ ds, model }: ViewProps) {
  const { cap, acc } = model;
  const [picked, setPicked] = useState<CapacityDay | undefined>(() => cap.reduce((a, b) => (b.occupancy > (a?.occupancy ?? 0) ? b : a), cap[0]));
  const tight = cap.filter((c) => c.occupancy >= 0.85);
  const room = cap.filter((c) => c.date >= '2026-12-12' && c.occupancy < 0.65);
  const day = picked ? ds.days.find((d) => d.date === picked.date) : undefined;

  return (
    <div className="view">
      <header className="view-head">
        <p className="eyebrow">Beds</p>
        <h1>Which days run full — and which stay empty</h1>
        <p className="lead">For the {cap.length} days ahead with bed numbers we compare the expected guests with the beds that are open. The forecast is corrected for the weekday pattern we measured, so Saturdays are not underestimated.</p>
      </header>

      <section className="grid-cap">
        <div className="card">
          <div className="card-head"><h2>Expected share of beds booked</h2></div>
          <CapacityCalendar cap={cap} onPick={setPicked} picked={picked?.date} />
          <div className="occ-legend">{OCC_LEGEND.map((l) => <span key={l.label}><i style={{ background: l.c }} />{l.label}</span>)}</div>
        </div>
        <div className="card day-card" aria-live="polite">
          {picked && day ? (
            <>
              <p className="eyebrow">{dayLabel(picked.date)}</p>
              <p className="big">{pct(picked.occupancy)}</p>
              <p className="muted">{picked.occupancy > 1 ? 'more guests than beds' : 'of the beds that are open'} ({n(picked.beds)} beds)</p>
              <p>We expect about <b>{approx(picked.expected)}</b> guests (likely between {approx(picked.low * picked.beds)} and {approx(picked.high * picked.beds)}).</p>
              {day.previousYear != null && <p className="muted">Last year on this weekday: {n(day.previousYear)}</p>}
              {day.holidays.length > 0 && <p>🎒 On holiday: {day.holidays.filter((h) => h.coverage > 0.15).map((h) => MARKET_NAMES[h.market] ?? h.market).join(', ') || '—'}</p>}
              {day.events.map((e) => <p key={e}>★ {e}</p>)}
              {picked.flags.includes('missing-beds') && <p className="warn">Bed numbers missing for this day — the share is estimated from the day before.</p>}
              <p className={`verdict ${picked.occupancy >= 0.85 ? 'tight' : picked.occupancy < 0.5 ? 'room' : ''}`}>
                {picked.occupancy > 1 ? 'Over capacity: guests will be turned away. Stop all promotion for this date, offer the days around it and the side valleys.' : picked.occupancy >= 0.95 ? 'Full. Stop pushing these dates; offer the days around them.' : picked.occupancy >= 0.85 ? 'Close to full. Steer new guests to neighbouring days or the side valleys.' : picked.occupancy < 0.5 ? 'Plenty of room. A good date for offers.' : 'Comfortable.'}
              </p>
            </>
          ) : <p className="muted">Pick a day.</p>}
        </div>
      </section>

      <section className="grid2">
        <div className="card">
          <h2>Close to full <span className="pill">{tight.length}</span></h2>
          <ul className="daylist">
            {tight.map((c) => <li key={c.date}><button onClick={() => setPicked(c)}><span>{dayLabel(c.date)}</span><b>{pct(c.occupancy)}</b></button></li>)}
            {!tight.length && <li className="muted">No day above 85%.</li>}
          </ul>
        </div>
        <div className="card">
          <h2>Room to fill in the high season <span className="pill">{room.length}</span></h2>
          <p className="muted">Days after 12 December below 65% of beds.</p>
          <ul className="daylist">
            {room.slice(0, 12).map((c) => <li key={c.date}><button onClick={() => setPicked(c)}><span>{dayLabel(c.date)}</span><b>{pct(c.occupancy)}</b></button></li>)}
          </ul>
        </div>
      </section>

      <section className="card">
        <h2>Beds opening up — and demand rising</h2>
        <p className="muted">Hotels open step by step before the season starts. When demand rises faster than beds open, the opening weekend runs full even though the valley has room later.</p>
        <SeasonChart ds={ds} acc={acc} from="2026-11-01" to="2027-01-27" height={280} strips={false} on={{ actual: true, forecast: true, open: false, previous: true, beds: true }} />
      </section>
    </div>
  );
}
