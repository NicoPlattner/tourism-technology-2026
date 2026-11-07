import { useRef, useState } from 'react';
import type { ViewProps } from '../App';
import { toCsv } from '../data/sources';
import type { SourceStatus } from '../data/types';

const STATUS: Record<SourceStatus, string> = { connected: 'Connected', live: 'Live', snapshot: 'Open data', sample: 'Sample', planned: 'Next' };

export default function Sources({ ds, model, onUpload, uploaded }: ViewProps & { onUpload: (f: File) => Promise<void>; uploaded?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const handle = async (f?: File | null) => {
    if (!f) return;
    setError(null);
    try { await onUpload(f); } catch (e) { setError((e as Error).message); }
  };
  const template = () => {
    const url = URL.createObjectURL(new Blob([toCsv(ds)], { type: 'text/csv;charset=utf-8' }));
    Object.assign(document.createElement('a'), { href: url, download: 'template.csv' }).click();
    URL.revokeObjectURL(url);
  };
  const active = ds.sources.filter((s) => s.status !== 'planned');
  const next = ds.sources.filter((s) => s.status === 'planned');

  return (
    <div className="view">
      <section className="grid2">
        <div className={`card drop ${drag ? 'drag' : ''}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files?.[0]); }}>
          <h2>Upload export</h2>
          <p className="muted small">CSV · date, actual, forecast, previous_year, beds</p>
          <div className="row">
            <button className="btn" onClick={() => input.current?.click()}>Choose file</button>
            <button className="btn ghost" onClick={template}>Template</button>
          </div>
          <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => handle(e.target.files?.[0])} />
          {uploaded && <p className="ok-msg">✓ {uploaded}</p>}
          {error && <p className="warn">{error}</p>}
        </div>
        <div className="card">
          <h2>Data health</h2>
          <ul className="checks">
            {model.quality.items.filter((i) => i.label !== 'History length').map((i) => (
              <li key={i.label} className={i.ok ? 'ok' : 'bad'}>
                <span aria-hidden="true">{i.ok ? '✓' : '!'}</span>
                <b>{i.label}</b>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="card">
        <h2>Sources</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Source</th><th>Provider</th><th>Licence</th><th>Status</th></tr></thead>
            <tbody>
              {active.map((s) => (
                <tr key={s.id}>
                  <td>{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a> : s.name}</td>
                  <td className="muted">{s.provider}</td>
                  <td className="muted">{s.licence}</td>
                  <td><span className={`status ${s.status}`}>{STATUS[s.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="next-src">Next: {next.map((s) => <span key={s.id}>{s.name}</span>)}</p>
      </section>
    </div>
  );
}
