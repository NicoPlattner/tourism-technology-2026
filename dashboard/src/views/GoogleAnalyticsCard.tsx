import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import {
  connectGoogleAnalytics, disconnectGoogleAnalytics, GA_CLIENT_ID, listProperties, loadGis,
  type GaProperty, type GaState, type GaToken,
} from '../data/googleAnalytics';

const msg = (e: unknown) => (e as Error).message;

// Several GA4 properties can be connected, from one or more Google accounts.
// Every property is picked explicitly after the Google login; none is added
// automatically. Removing a property revokes its token once nothing uses it.
export default function GoogleAnalyticsCard({ ga, setGa }: { ga: GaState; setGa: Dispatch<SetStateAction<GaState>> }) {
  const [gisError, setGisError] = useState<string | null>(null);
  // Load Google sign-in up front so the popup opens straight from the click.
  useEffect(() => { if (GA_CLIENT_ID) loadGis().catch((e) => setGisError(msg(e))); }, []);

  const revokeIfUnused = (token: GaToken, s: GaState) => {
    if (!s.connections.some((c) => c.token.accessToken === token.accessToken)) disconnectGoogleAnalytics(token);
  };

  const add = async () => {
    setGa((s) => ({ ...s, connecting: true, picking: undefined, error: undefined }));
    let token: GaToken;
    try { token = await connectGoogleAnalytics(await loadGis()); }
    catch (e) { return setGa((s) => ({ ...s, connecting: false, error: msg(e) })); }
    setGa((s) => ({ ...s, connecting: false, picking: { token } }));
    try {
      const properties = await listProperties(token);
      setGa((s) => (s.picking?.token === token ? { ...s, picking: { token, properties } } : s));
    } catch (e) {
      setGa((s) => ({ ...s, picking: undefined, error: msg(e) }));
      disconnectGoogleAnalytics(token);
    }
  };

  const pick = (token: GaToken, property: GaProperty) =>
    setGa((s) => ({ ...s, picking: undefined, connections: [...s.connections, { property, token }] }));

  const cancel = () => {
    if (ga.picking) revokeIfUnused(ga.picking.token, ga);
    setGa((s) => ({ ...s, picking: undefined }));
  };

  const remove = (id: string) => {
    const gone = ga.connections.find((c) => c.property.id === id);
    const rest = ga.connections.filter((c) => c.property.id !== id);
    if (gone) revokeIfUnused(gone.token, { ...ga, connections: rest });
    setGa((s) => ({ ...s, connections: s.connections.filter((c) => c.property.id !== id) }));
  };

  const connectedIds = new Set(ga.connections.map((c) => c.property.id));
  const choices = ga.picking?.properties?.filter((p) => !connectedIds.has(p.id));
  const error = gisError ?? ga.error;

  return (
    <div className="card ga">
      <h2>Google Analytics</h2>

      {ga.connections.length > 0 && (
        <ul className="ga-conns" aria-label="Connected properties">
          {ga.connections.map((c) => (
            <li key={c.property.id}>
              <div className="ga-conn-head">
                <div>
                  <b>{c.property.name}</b>
                  <div className="muted small">{c.property.account} · property {c.property.id}</div>
                </div>
                <button className="ga-remove" onClick={() => remove(c.property.id)} aria-label={`Remove ${c.property.name}`}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {ga.picking ? (
        <div className="ga-picker">
          {!choices ? <p className="muted small">Loading properties…</p> : choices.length ? (
            <>
              <p><b>Choose the property to add</b></p>
              <ul className="ga-props" aria-label="Google Analytics properties">
                {choices.map((p) => (
                  <li key={p.id}>
                    <button className="ga-pick" onClick={() => pick(ga.picking!.token, p)}>
                      <b>{p.name}</b> <span className="muted small">{p.account} · {p.id}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : <p className="muted small">No further GA4 properties on this Google account.</p>}
          <div className="row"><button className="btn ghost" onClick={cancel}>Cancel</button></div>
        </div>
      ) : (
        <div className="row">
          <button className={ga.connections.length ? 'btn ghost' : 'btn'} onClick={add} disabled={!GA_CLIENT_ID || ga.connecting}>
            {ga.connecting ? 'Connecting…' : ga.connections.length ? 'Add property' : 'Connect Google Analytics'}
          </button>
        </div>
      )}

      {!GA_CLIENT_ID && <p className="warn">Google sign-in is not configured (VITE_GOOGLE_CLIENT_ID).</p>}
      {error && <p className="warn">{error}</p>}
    </div>
  );
}
