import { useRef, useState } from 'react';
import type { ViewProps } from '../App';
import { toCsv } from '../data/sources';
import type { SourceStatus } from '../data/types';

const STATUS: Record<SourceStatus, { label: string; tip: string }> = {
  connected: { label: 'Connected', tip: 'Your own data, loaded' },
  live: { label: 'Live', tip: 'Fetched just now from the open API' },
  snapshot: { label: 'Open data', tip: 'Open data snapshot, refreshed when the app loads if the API is reachable' },
  sample: { label: 'Sample', tip: 'Sample data in the shape of the partner export — replace with the real file' },
  planned: { label: 'Next', tip: 'Ready to plug in' },
};

export default function Sources({ ds, model, onUpload, uploaded }: ViewProps & { onUpload: (f: File) => Promise<void>; uploaded?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const groups: { title: string; sub: string; ids: SourceStatus[] }[] = [
    { title: 'Partner data', sub: 'From TVB Paznaun-Ischgl and Feratel via the TTF Data Space', ids: ['sample', 'connected'] },
    { title: 'Open data we combine it with', sub: 'Free, documented, no key needed', ids: ['live', 'snapshot'] },
    { title: 'Ready to add next', sub: 'Each one answers a question the team asks today', ids: ['planned'] },
  ];
  const handle = async (f?: File | null) => {
    if (!f) return;
    setError(null);
    try { await onUpload(f); } catch (e) { setError((e as Error).message); }
  };
  const template = () => {
    const url = URL.createObjectURL(new Blob([toCsv(ds)], { type: 'text/csv;charset=utf-8' }));
    Object.assign(document.createElement('a'), { href: url, download: 'demand-radar-template.csv' }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="view">
      <header className="view-head">
        <p className="eyebrow">Data</p>
        <h1>Where the numbers come from — and how good they are</h1>
        <p className="lead">The radar combines the partner data with open sources. Each source is a small connector; adding one does not change the screens you already know — it adds evidence to the “Why?” and the ranking of next steps.</p>
      </header>

      <section className="grid2">
        <div className="card">
          <h2>Data health</h2>
          <ul className="checks">
            {model.quality.items.map((i) => (
              <li key={i.label} className={i.ok ? 'ok' : 'bad'}>
                <span aria-hidden="true">{i.ok ? '✓' : '!'}</span>
                <div><b>{i.label}</b><p className="muted">{i.detail}</p></div>
              </li>
            ))}
          </ul>
        </div>
        <div className={`card drop ${drag ? 'drag' : ''}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files?.[0]); }}>
          <h2>Load the real export</h2>
          <p>Drop the CSV export from the TTF Data Space here — overnight stays, forecast, previous year and beds. Columns may be called <code>date / Datum</code>, <code>actual / Nächtigungen</code>, <code>forecast / Prognose</code>, <code>previous_year / Vorjahr</code>, <code>beds / Betten</code>; separator <code>;</code> or <code>,</code>.</p>
          <p className="muted small">The file stays in your browser — nothing is uploaded to a server.</p>
          <div className="row">
            <button className="btn" onClick={() => input.current?.click()}>Choose CSV file</button>
            <button className="btn ghost" onClick={template}>Download template</button>
          </div>
          <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => handle(e.target.files?.[0])} />
          {uploaded && <p className="ok-msg">✓ Loaded <b>{uploaded}</b> — all views now use your data.</p>}
          {error && <p className="warn">{error}</p>}
        </div>
      </section>

      {groups.map((g) => {
        const items = ds.sources.filter((s) => g.ids.includes(s.status));
        if (!items.length) return null;
        return (
          <section key={g.title}>
            <h2 className="section-title">{g.title} <small>{g.sub}</small></h2>
            <div className="sources">
              {items.map((s) => (
                <article key={s.id} className={`card source ${s.status}`}>
                  <div className="s-top">
                    <span className={`status ${s.status}`} title={STATUS[s.status].tip}>{STATUS[s.status].label}</span>
                    {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" className="link small">Docs ↗</a>}
                  </div>
                  <h3>{s.name}</h3>
                  <p className="s-q">“{s.answers}”</p>
                  <dl className="s-meta">
                    <div><dt>From</dt><dd>{s.provider}</dd></div>
                    <div><dt>Licence</dt><dd>{s.licence}</dd></div>
                    <div><dt>Updated</dt><dd>{s.update}{s.retrieved ? ` · last fetched ${new Date(s.retrieved).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</dd></div>
                    {s.coverage && <div><dt>Covers</dt><dd>{s.coverage}</dd></div>}
                  </dl>
                </article>
              ))}
            </div>
          </section>
        );
      })}

      <section className="card concept">
        <h2>How the radar helps the team</h2>
        <ol className="steps">
          <li><b>See</b> — one timeline puts actual stays, two forecasts, last year and beds side by side, with holidays, weather and events underneath.</li>
          <li><b>Understand</b> — every gap to the forecast is tested against the usual suspects, with evidence and a confidence level instead of a guess.</li>
          <li><b>Look ahead</b> — the forecast is corrected for the patterns we measured; weekends close to full and weeks behind last year show up weeks in advance.</li>
          <li><b>Act</b> — ranked next steps with what, when, where and why, ready for the Monday meeting or the board.</li>
          <li><b>Grow</b> — new sources plug in as connectors (mobile network data, guest nationality, prices, lift counts) and immediately add evidence.</li>
        </ol>
      </section>
    </div>
  );
}
