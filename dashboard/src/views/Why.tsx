import { useState } from 'react';
import type { ViewProps } from '../App';
import { SeasonChart } from '../components/charts';
import { Confidence } from '../components/ui';
import { range, signedN, signedPct } from '../analysis/format';
import type { Reason } from '../analysis/insights';

const ICON: Record<Reason['kind'], string> = { data: '⚠', weather: '☂', holidays: '🎒', event: '★', weekday: '•', forecast: '≈', unknown: '?' };
const pad = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

export default function Why({ ds, model }: ViewProps) {
  const { eps, acc } = model;
  const [sel, setSel] = useState(eps[0]?.id);
  const ep = eps.find((e) => e.id === sel) ?? eps[0];
  if (!ep) return <div className="view"><p className="muted">No deviations above 10%.</p></div>;
  const top = ep.reasons[0];

  return (
    <div className="view why-layout">
      <aside className="ep-list" aria-label="Deviations">
        {eps.map((e) => (
          <button key={e.id} className={`ep ${e.id === ep.id ? 'on' : ''}`} onClick={() => setSel(e.id)}>
            <span className={`dir ${e.direction}`}>{e.direction === 'gap' ? 'gap' : signedPct(e.rel)}</span>
            <b>{range(e.start, e.end)}</b>
            <span className="ep-icon" title={e.reasons[0].title}>{ICON[e.reasons[0].kind]}</span>
          </button>
        ))}
      </aside>

      <section className="card ep-detail">
        <div className="card-head">
          <div>
            <p className="eyebrow">{range(ep.start, ep.end)}</p>
            <h2>{ep.direction === 'gap' ? 'No data reported' : `${signedN(ep.diff)} nights · ${signedPct(ep.rel)}`}</h2>
          </div>
          <Confidence c={ep.confidence} />
        </div>
        <SeasonChart ds={ds} acc={acc} from={pad(ep.start, -10)} to={pad(ep.end, 10)} height={240}
          on={{ actual: true, forecast: true, open: false, previous: false, beds: false }} highlight={[{ start: ep.start, end: ep.end, tone: ep.direction }]} />
        <div className="reason-main">
          <span className="r-icon" aria-hidden="true">{ICON[top.kind]}</span>
          <div>
            <p className="r-title">{top.title}</p>
            {top.evidence.length > 0 && <p className="evidence">{top.evidence.map((e, j) => <span key={j}><b>{e.source}</b> {e.text}</span>)}</p>}
          </div>
        </div>
        {ep.reasons.length > 1 && (
          <p className="also">Also: {ep.reasons.slice(1).map((r) => <span key={r.title}>{ICON[r.kind]} {r.title}</span>)}</p>
        )}
      </section>
    </div>
  );
}
