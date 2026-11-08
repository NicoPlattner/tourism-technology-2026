import { useCallback, useEffect, useState } from 'react';
import { gaApi, type GaConnection, type GaRealtime } from '../data/googleAnalytics';

const fmt = (n: number) => n.toLocaleString('en-GB');
const REFRESH_MS = 60_000;

interface Data { realtime?: GaRealtime; error?: string; loading?: boolean }

// Live numbers for one connected GA4 property from the Realtime report, read
// through the server. Google keeps realtime data for the last 30 minutes only.
export default function GoogleAnalyticsData({ connections }: { connections: GaConnection[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [data, setData] = useState<Data>({});
  const conn = connections.find((c) => c.property.id === selectedId) ?? connections[0];
  const id = conn?.property.id;

  const load = useCallback(async (propertyId: string) => {
    setData((d) => ({ ...d, loading: true }));
    try { setData({ realtime: await gaApi.realtime(propertyId) }); }
    catch (e) { setData({ error: (e as Error).message }); }
  }, []);

  useEffect(() => {
    if (!id) return;
    setData({});
    load(id);
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(id); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [id, load]);

  if (!conn) {
    return (
      <div className="card ga-data">
        <h2>Website data</h2>
        <p className="muted">Connect a Google Analytics property to see its live data here.</p>
      </div>
    );
  }

  const rt = data.realtime;
  return (
    <div className="card ga-data" aria-busy={data.loading}>
      <div className="ga-data-head">
        <h2>Website data</h2>
        <button className="ga-link" onClick={() => load(conn.property.id)} disabled={data.loading}>{data.loading ? 'Loading…' : 'Refresh'}</button>
      </div>
      {connections.length > 1 && (
        <div className="ga-tabs" role="tablist" aria-label="Property">
          {connections.map((c) => (
            <button key={c.property.id} role="tab" aria-selected={c === conn} className={c === conn ? 'active' : ''} onClick={() => setSelectedId(c.property.id)}>
              {c.property.name}
            </button>
          ))}
        </div>
      )}

      <h3 className="ga-sub">Right now <span className="muted small">· last 30 minutes</span></h3>
      {rt ? (
        <>
          <p className="ga-big"><b>{fmt(rt.activeUsers)}</b> active {rt.activeUsers === 1 ? 'user' : 'users'}</p>
          {rt.activeUsers > 0 && (
            <div className="ga-tops">
              <Top title="Countries" rows={rt.countries} />
              <Top title="Pages" rows={rt.pages} />
            </div>
          )}
          <p className="muted small ga-updated">Updated {new Date(rt.updated).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · refreshes every minute</p>
        </>
      ) : data.error ? <p className="warn small">{data.error}</p> : <p className="muted small">Loading…</p>}
    </div>
  );
}

function Top({ title, rows }: { title: string; rows: { name: string; value: number }[] }) {
  return (
    <div>
      <h4>{title}</h4>
      {rows.length ? (
        <ol>{rows.map((r) => <li key={r.name}><span>{r.name}</span><b>{fmt(r.value)}</b></li>)}</ol>
      ) : <p className="muted small">—</p>}
    </div>
  );
}
