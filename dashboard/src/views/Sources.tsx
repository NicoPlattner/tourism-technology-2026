import { useEffect, useState } from 'react';
import type { ViewProps } from '../App';
import { connectGoogleAnalytics, disconnectGoogleAnalytics, GA_CLIENT_ID, listProperties, loadGis, type GaState } from '../data/googleAnalytics';
import type { SourceStatus } from '../data/types';

const STATUS: Record<SourceStatus, string> = { connected: 'Connected', live: 'Live', snapshot: 'Open data', sample: 'Sample', planned: 'Next' };

export default function Sources({ model, ds, ga, setGa }: ViewProps & { ga: GaState; setGa: (s: GaState) => void }) {
  const [gisError, setGisError] = useState<string | null>(null);
  // Load Google sign-in up front so the popup opens straight from the click.
  useEffect(() => { if (GA_CLIENT_ID) loadGis().catch((e: Error) => setGisError(e.message)); }, []);

  const connect = async () => {
    setGa({ status: 'connecting' });
    try {
      const token = await connectGoogleAnalytics(await loadGis());
      setGa({ status: 'connected', token });
      try { setGa({ status: 'connected', token, properties: await listProperties(token) }); }
      catch (e) { setGa({ status: 'connected', token, error: (e as Error).message }); }
    } catch (e) { setGa({ status: 'idle', error: (e as Error).message }); }
  };
  const disconnect = () => {
    if (ga.status === 'connected') disconnectGoogleAnalytics(ga.token);
    setGa({ status: 'idle' });
  };
  const error = gisError ?? ('error' in ga ? ga.error : undefined);
  const active = ds.sources.filter((s) => s.status !== 'planned');
  const next = ds.sources.filter((s) => s.status === 'planned');

  return (
    <div className="view">
      <section className="grid2">
        <div className="card ga">
          <h2>Google Analytics</h2>
          <p className="muted small">Read-only access to your GA4 properties · web demand signals next to stays</p>
          {ga.status === 'connected' ? (
            <>
              <p className="ok-msg">✓ Connected</p>
              {ga.properties && (ga.properties.length ? (
                <ul className="ga-props">
                  {ga.properties.map((p) => <li key={p.id}><b>{p.name}</b> <span className="muted small">{p.account} · {p.id}</span></li>)}
                </ul>
              ) : <p className="muted small">No GA4 properties on this Google account.</p>)}
              <div className="row"><button className="btn ghost" onClick={disconnect}>Disconnect</button></div>
            </>
          ) : (
            <div className="row">
              <button className="btn" onClick={connect} disabled={!GA_CLIENT_ID || ga.status === 'connecting'}>
                {ga.status === 'connecting' ? 'Connecting…' : 'Connect Google Analytics'}
              </button>
            </div>
          )}
          {!GA_CLIENT_ID && <p className="warn">Google sign-in is not configured (VITE_GOOGLE_CLIENT_ID).</p>}
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
