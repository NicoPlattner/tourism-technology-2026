import { useCallback, useEffect, useState } from 'react';
import { realtime, type GaConnection, type GaRealtime } from '../data/googleAnalytics';

const fmt = (n: number) => n.toLocaleString('en-GB');
const REFRESH_MS = 60_000;

interface Data { realtime?: GaRealtime; error?: string; updated?: Date; loading?: boolean }

// Live numbers for one connected GA4 property from the Realtime report, which
// works right away on a new property. Google keeps realtime data for the last
// 30 minutes only.
export default function GoogleAnalyticsData({ connections }: { connections: GaConnection[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [data, setData] = useState<Data>({});
  const conn = connections.find((c) => c.property.id === selectedId) ?? connections[0];

  const load = useCallback(async (c: GaConnection) => {
    setData((d) => ({ ...d, loading: true }));
    try { setData({ realtime: await realtime(c.token, c.property.id), updated: new Date() }); }
    catch (e) { setData({ error: (e as Error).message, updated: new Date() }); }
  }, []);

  useEffect(() => {
    if (!conn) return;
    setData({});
    load(conn);
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(conn); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [conn, load]);

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
        <button className="ga-link" onClick={() => load(conn)} disabled={data.loading}>{data.loading ? 'Loading…' : 'Refresh'}</button>
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
        </>
      ) : data.error ? <p className="warn small">{data.error}</p> : <p className="muted small">Loading…</p>}

      {data.updated && <p className="muted small ga-updated">Updated {data.updated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · refreshes every minute</p>}
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
