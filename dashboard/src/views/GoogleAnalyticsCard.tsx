import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import {
  connectGoogleAnalytics, disconnectGoogleAnalytics, GA_CLIENT_ID, listProperties, loadGis, tokenValid,
  type GaProperty, type GaState, type GaToken,
} from '../data/googleAnalytics';

const msg = (e: unknown) => (e as Error).message;

// Several GA4 properties can be connected. One Google login is kept for the
// session and reused for adding more properties; a new login is only needed
// when it expires or to add a property from another Google account. Every
// property is picked explicitly; none is added automatically.
export default function GoogleAnalyticsCard({ ga, setGa }: { ga: GaState; setGa: Dispatch<SetStateAction<GaState>> }) {
  const [gisError, setGisError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  // Load Google sign-in up front so the popup opens straight from the click.
  useEffect(() => { if (GA_CLIENT_ID) loadGis().catch((e) => setGisError(msg(e))); }, []);

  const inUse = (s: GaState) => new Set([...s.connections.map((c) => c.token.accessToken), s.session?.token.accessToken]);

  const login = async (chooseAccount = false) => {
    setChecked(new Set());
    setGa((s) => ({ ...s, connecting: true, error: undefined }));
    let token: GaToken;
    try { token = await connectGoogleAnalytics(await loadGis(), { chooseAccount }); }
    catch (e) { return setGa((s) => ({ ...s, connecting: false, error: msg(e) })); }
    // The previous login is replaced; revoke it unless a connection still uses it.
    const old = ga.session?.token;
    if (old && old.accessToken !== token.accessToken && !ga.connections.some((c) => c.token.accessToken === old.accessToken)) disconnectGoogleAnalytics(old);
    setGa((s) => ({ ...s, connecting: false, picking: true, session: { token } }));
    try {
      const properties = await listProperties(token);
      setGa((s) => (s.session?.token === token ? { ...s, session: { token, properties } } : s));
    } catch (e) {
      setGa((s) => ({ ...s, picking: false, error: msg(e) }));
    }
  };

  const openPicker = () => {
    setChecked(new Set());
    if (ga.session?.properties && tokenValid(ga.session.token)) setGa((s) => ({ ...s, picking: true, error: undefined }));
    else login();
  };

  const addChecked = () => {
    const session = ga.session;
    if (!session?.properties) return;
    const add = session.properties.filter((p) => checked.has(p.id)).map((property) => ({ property, token: session.token }));
    setGa((s) => ({ ...s, picking: false, connections: [...s.connections, ...add.filter((a) => !s.connections.some((c) => c.property.id === a.property.id))] }));
    setChecked(new Set());
  };

  const remove = (id: string) => {
    const gone = ga.connections.find((c) => c.property.id === id);
    const rest = { ...ga, connections: ga.connections.filter((c) => c.property.id !== id) };
    if (gone && !inUse(rest).has(gone.token.accessToken)) disconnectGoogleAnalytics(gone.token);
    setGa((s) => ({ ...s, connections: s.connections.filter((c) => c.property.id !== id) }));
  };

  const signOut = () => {
    for (const t of inUse(ga)) if (t) disconnectGoogleAnalytics({ accessToken: t, expiresAt: 0 });
    setChecked(new Set());
    setGa({ connections: [] });
  };

  const toggle = (id: string) => setChecked((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const connectedIds = new Set(ga.connections.map((c) => c.property.id));
  const available = ga.session?.properties?.filter((p) => !connectedIds.has(p.id));
  const byAccount = new Map<string, GaProperty[]>();
  for (const p of available ?? []) byAccount.set(p.account, [...(byAccount.get(p.account) ?? []), p]);
  const error = gisError ?? ga.error;
  const signedIn = !!ga.session || ga.connections.length > 0;

  return (
    <div className="card ga">
      <div className="ga-head">
        <h2>Google Analytics</h2>
        {signedIn && <button className="ga-link" onClick={signOut}>Sign out</button>}
      </div>

      {ga.connections.length > 0 && (
        <ul className="ga-conns" aria-label="Connected properties">
          {ga.connections.map((c) => (
            <li key={c.property.id}>
              <span className="status connected">Connected</span>
              <div className="ga-conn-name">
                <b>{c.property.name}</b>
                <div className="muted small">{c.property.account} · {c.property.id}</div>
              </div>
              <button className="ga-link" onClick={() => remove(c.property.id)} aria-label={`Remove ${c.property.name}`}>Remove</button>
            </li>
          ))}
        </ul>
      )}

      {ga.picking ? (
        <div className="ga-picker" role="group" aria-label="Add properties">
          <p className="ga-picker-title"><b>Select properties to add</b></p>
          {!available ? <p className="muted small">Loading your properties…</p> : available.length ? (
            [...byAccount].map(([account, props]) => (
              <fieldset key={account} className="ga-acct">
                <legend>{account}</legend>
                {props.map((p) => (
                  <label key={p.id} className="ga-opt">
                    <input type="checkbox" checked={checked.has(p.id)} onChange={() => toggle(p.id)} />
                    <span>{p.name}</span>
                    <span className="muted small">{p.id}</span>
                  </label>
                ))}
              </fieldset>
            ))
          ) : <p className="muted small">All properties of this Google account are already connected.</p>}
          <div className="row">
            <button className="btn" onClick={addChecked} disabled={!checked.size}>
              {checked.size ? `Add selected (${checked.size})` : 'Add selected'}
            </button>
            <button className="btn ghost" onClick={() => setGa((s) => ({ ...s, picking: false }))}>Cancel</button>
          </div>
          <p className="small ga-other">Property on a different Google account? <button className="ga-link" onClick={() => login(true)} disabled={ga.connecting}>Use another Google account</button></p>
        </div>
      ) : (
        <div className="row">
          <button className={ga.connections.length ? 'btn ghost' : 'btn'} onClick={openPicker} disabled={!GA_CLIENT_ID || ga.connecting}>
            {ga.connecting ? 'Connecting…' : ga.connections.length ? 'Add property' : 'Connect Google Analytics'}
          </button>
        </div>
      )}

      {!GA_CLIENT_ID && <p className="warn">Google sign-in is not configured (VITE_GOOGLE_CLIENT_ID).</p>}
      {error && <p className="warn">{error}</p>}
    </div>
  );
}
