import type { ViewProps } from '../App';
import { Confidence, TypeTag, TYPE_LABELS } from '../components/ui';
import { approx } from '../analysis/format';

export default function Actions({ model }: ViewProps) {
  const exportCsv = () => {
    const rows = [['rank', 'type', 'title', 'what', 'when', 'where', 'why', 'nights', 'confidence'],
      ...model.actions.map((a, i) => [i + 1, TYPE_LABELS[a.type], a.title, a.what, a.when, a.where, a.why, Math.round(a.effect), a.confidence])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    Object.assign(document.createElement('a'), { href: url, download: 'next-steps.csv' }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="view">
      <div className="toolbar end">
        <button className="btn ghost" onClick={exportCsv}>CSV</button>
        <button className="btn ghost" onClick={() => window.print()}>Print</button>
      </div>
      <ol className="actions-min">
        {model.actions.map((a, i) => (
          <li key={a.id} className="card">
            <details>
              <summary>
                <span className={`a-rank ${i === 0 ? 'first' : ''}`}>{i + 1}</span>
                <span className="a-title">
                  <TypeTag type={a.type} />
                  <b>{a.title}</b>
                </span>
                <span className="a-where">{a.where}</span>
                <span className="a-nights"><b>{approx(a.effect)}</b><small>nights</small></span>
                <Confidence c={a.confidence} />
              </summary>
              <dl className="a-grid">
                <div><dt>What</dt><dd>{a.what}</dd></div>
                <div><dt>When</dt><dd>{a.when}</dd></div>
                <div><dt>Why</dt><dd>{a.why}</dd></div>
                <div><dt>Data</dt><dd>{a.basedOn.join(' · ')}</dd></div>
              </dl>
            </details>
          </li>
        ))}
      </ol>
    </div>
  );
}
