import { useState } from 'react';
import type { ViewProps } from '../App';
import { ScoreBar } from '../components/charts';
import { Confidence, TypeTag, TYPE_LABELS } from '../components/ui';
import { approx } from '../analysis/format';
import type { Action } from '../analysis/insights';

export default function Actions({ model }: ViewProps) {
  const [filter, setFilter] = useState<Action['type'] | 'all'>('all');
  const list = model.actions.filter((a) => filter === 'all' || a.type === filter);
  const maxEffect = Math.max(...model.actions.map((a) => a.effect), 1);

  const exportCsv = () => {
    const rows = [['rank', 'type', 'title', 'what', 'when', 'where', 'why', 'stays_at_stake', 'confidence', 'based_on'],
      ...model.actions.map((a, i) => [i + 1, TYPE_LABELS[a.type], a.title, a.what, a.when, a.where, a.why, Math.round(a.effect), a.confidence, a.basedOn.join(' | ')])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    Object.assign(document.createElement('a'), { href: url, download: 'demand-radar-actions.csv' }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="view">
      <header className="view-head">
        <p className="eyebrow">What to do</p>
        <h1>Next steps, ranked</h1>
        <p className="lead">Each step says what, when, where and why — and how it was ranked: how many guest nights are at stake, whether there is still enough time, how easy it is to do, and how sure the data is.</p>
        <div className="toolbar">
          <div className="seg" role="radiogroup" aria-label="Filter">
            {(['all', 'fill', 'steer', 'forecast', 'data'] as const).map((t) => (
              <button key={t} role="radio" aria-checked={filter === t} className={filter === t ? 'on' : ''} onClick={() => setFilter(t)}>{t === 'all' ? 'All' : TYPE_LABELS[t]}</button>
            ))}
          </div>
          <div className="row">
            <button className="btn ghost" onClick={exportCsv}>Download as CSV</button>
            <button className="btn ghost" onClick={() => window.print()}>Print briefing</button>
          </div>
        </div>
      </header>

      <ol className="actions">
        {list.map((a) => (
          <li key={a.id} className="card action">
            <div className="a-rank">{model.actions.indexOf(a) + 1}</div>
            <div className="a-main">
              <div className="a-tags"><TypeTag type={a.type} /><Confidence c={a.confidence} /></div>
              <h2>{a.title}</h2>
              <dl className="a-grid">
                <div><dt>What</dt><dd>{a.what}</dd></div>
                <div><dt>When</dt><dd>{a.when}</dd></div>
                <div><dt>Where</dt><dd>{a.where}</dd></div>
                <div><dt>Why</dt><dd>{a.why}</dd></div>
              </dl>
              <p className="evidence">Based on {a.basedOn.map((b) => <span key={b}>{b}</span>)}</p>
            </div>
            <div className="a-score">
              <p className="big">{approx(a.effect)}</p>
              <p className="muted small">guest nights at stake</p>
              <ScoreBar value={Math.sqrt(a.effect / maxEffect)} label="Effect" />
              <ScoreBar value={a.leadDays >= 21 ? 1 : a.leadDays >= 7 ? 0.7 : 0.4} label="Time left" />
              <ScoreBar value={a.feasibility} label="Easy to do" />
              <ScoreBar value={a.confidence === 'high' ? 1 : a.confidence === 'medium' ? 0.65 : 0.35} label="Confidence" />
            </div>
          </li>
        ))}
      </ol>
      <p className="footnote">Ranking = 40% effect · 25% confidence · 20% ease · 15% time left. Estimates of guest nights at stake are deliberately conservative (we assume a campaign wins back about 30% of a gap).</p>
    </div>
  );
}
