import { useEffect, useState } from 'react';
import { GA_CLIENT_ID, gaApi, googleSignIn, loadGis, type GaAccount, type GaProperty, type GaState } from '../data/googleAnalytics';

const msg = (e: unknown) => (e as Error).message;

interface Option { property: GaProperty; accountId: string }

// Connected Google accounts and their GA4 properties. The connection is kept
// by the server, so it is the same on every device and lasts until someone
// disconnects it here. Properties are always picked explicitly.
export default function GoogleAnalyticsCard({ ga, setGa, loadError }: { ga: GaState | null; setGa: (s: GaState) => void; loadError?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<Option[] | 'loading' | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  // Load Google sign-in up front so the popup opens straight from the click.
  useEffect(() => { if (GA_CLIENT_ID) loadGis().catch((e) => setError(msg(e))); }, []);

  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await f(); } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  };

  // Options from every connected Google account, minus what is connected.
  const loadOptions = async (state: GaState, known: Record<string, GaProperty[]> = {}) => {
    const connected = new Set(state.connections.map((c) => c.property.id));
    const lists = await Promise.all(state.accounts.filter((a) => !a.error).map(async (a) => ({ a, props: known[a.id] ?? await gaApi.properties(a.id).catch(() => []) })));
    const seen = new Set<string>();
    const out: Option[] = [];
    for (const { a, props } of lists) for (const p of props) if (!connected.has(p.id) && !seen.has(p.id)) { seen.add(p.id); out.push({ property: p, accountId: a.id }); }
    return out;
  };

  // Google sign-in; the server keeps lasting access for this Google account.
  const signIn = (opts: { selectAccount?: boolean; loginHint?: string; pick?: boolean } = {}) => run(async () => {
    const code = await googleSignIn(await loadGis(), opts);
    const { account, properties } = await gaApi.connectAccount(code);
    const state = await gaApi.state();
    setGa(state);
    if (opts.pick !== false) {
      setChecked(new Set());
      setPicker(await loadOptions(state, { [account.id]: properties }));
    }
  });

  const openPicker = () => {
    if (!ga?.accounts.some((a) => !a.error)) return signIn();
    setChecked(new Set());
    setPicker('loading');
    run(async () => setPicker(await loadOptions(ga)));
  };

  const addChecked = () => run(async () => {
    if (!Array.isArray(picker)) return;
    const byAccount = new Map<string, string[]>();
    for (const o of picker) if (checked.has(o.property.id)) byAccount.set(o.accountId, [...(byAccount.get(o.accountId) ?? []), o.property.id]);
    let state = ga;
    for (const [accountId, ids] of byAccount) state = await gaApi.addConnections(accountId, ids);
    if (state) setGa(state);
    setPicker(null);
  });

  const remove = (id: string) => run(async () => setGa(await gaApi.removeConnection(id)));
  const disconnectAccount = (a: GaAccount) => {
    if (confirm(`Disconnect ${a.email}? Its properties are removed for everyone using this dashboard.`)) run(async () => setGa(await gaApi.disconnectAccount(a.id)));
  };
  const toggle = (id: string) => setChecked((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  if (!ga) {
    return (
      <div className="card ga">
        <h2>Google Analytics</h2>
        {loadError ? <p className="warn">{loadError}</p> : <p className="muted small">Loading…</p>}
      </div>
    );
  }

  const options = Array.isArray(picker) ? picker : [];
  const byGaAccount = new Map<string, Option[]>();
  for (const o of options) byGaAccount.set(o.property.account, [...(byGaAccount.get(o.property.account) ?? []), o]);
  const ready = GA_CLIENT_ID && ga.configured;

  return (
    <div className="card ga">
      <h2>Google Analytics</h2>

      {ga.accounts.map((a) => {
        const conns = ga.connections.filter((c) => c.accountId === a.id);
        return (
          <section key={a.id} className="ga-account" aria-label={`Google account ${a.email}`}>
            <div className="ga-account-head">
              <span className="muted small">Google account</span>
              <b>{a.email}</b>
              <button className="ga-link" onClick={() => disconnectAccount(a)} disabled={busy}>Disconnect</button>
            </div>
            {a.error && (
              <div className="ga-expired" role="status">
                <p>{a.error}</p>
                <button className="btn" onClick={() => signIn({ loginHint: a.email, pick: false })} disabled={busy}>Reconnect</button>
              </div>
            )}
            {conns.length > 0 ? (
              <ul className="ga-conns" aria-label="Connected properties">
                {conns.map((c) => (
                  <li key={c.property.id}>
                    {a.error ? <span className="status sample">Paused</span> : <span className="status connected">Connected</span>}
                    <div>
                      <b>{c.property.name}</b>
                      <div className="muted small">{c.property.account} · {c.property.id}</div>
                    </div>
                    <button className="ga-link" onClick={() => remove(c.property.id)} disabled={busy} aria-label={`Remove ${c.property.name}`}>Remove</button>
                  </li>
                ))}
              </ul>
            ) : <p className="muted small ga-none">No properties added from this account.</p>}
          </section>
        );
      })}

      {picker ? (
        <div className="ga-picker" role="group" aria-label="Add properties">
          <p className="ga-picker-title"><b>Select properties to add</b></p>
          {picker === 'loading' ? <p className="muted small">Loading your properties…</p> : options.length ? (
            [...byGaAccount].map(([gaAccount, opts]) => (
              <fieldset key={gaAccount} className="ga-acct">
                <legend>{gaAccount}</legend>
                {opts.map(({ property: p }) => (
                  <label key={p.id} className="ga-opt">
                    <input type="checkbox" checked={checked.has(p.id)} onChange={() => toggle(p.id)} />
                    <span>{p.name}</span>
                    <span className="muted small">{p.id}</span>
                  </label>
                ))}
              </fieldset>
            ))
          ) : <p className="muted small">All properties of the connected Google accounts are already added.</p>}
          <div className="row">
            <button className="btn" onClick={addChecked} disabled={!checked.size || busy}>{checked.size ? `Add selected (${checked.size})` : 'Add selected'}</button>
            <button className="btn ghost" onClick={() => setPicker(null)}>Cancel</button>
          </div>
          <p className="small ga-other">Property on a different Google account? <button className="ga-link" onClick={() => signIn({ selectAccount: true })} disabled={busy}>Connect another Google account</button></p>
        </div>
      ) : (
        <div className="row">
          <button className={ga.connections.length ? 'btn ghost' : 'btn'} onClick={openPicker} disabled={!ready || busy}>
            {busy ? 'Working…' : ga.accounts.length ? 'Add property' : 'Connect Google Analytics'}
          </button>
        </div>
      )}

      <AnalyticsApi ga={ga} setGa={setGa} />

      {ga.persistent === false && ga.accounts.length > 0 && (
        <p className="muted small">{ga.storageError ?? 'The server has no permanent storage yet: the connection lasts until the API restarts or is redeployed.'}</p>
      )}
      {!GA_CLIENT_ID && <p className="warn">Google sign-in is not configured (VITE_GOOGLE_CLIENT_ID).</p>}
      {GA_CLIENT_ID && !ga.configured && <p className="warn">The server has no Google client secret yet (GOOGLE_CLIENT_SECRET).</p>}
      {error && <p className="warn">{error}</p>}
    </div>
  );
}

const ENDPOINTS: [string, string, string][] = [
  ['GET', 'properties/default/realtime', 'Last 30 minutes: visitors by country, city, device, page, event'],
  ['GET', 'properties/default/history?days=7', 'Realtime data recorded by this server, by hour, day, country, city, device, page'],
  ['GET', 'properties/default/insights', 'Standard reports: age, gender, interests, language, region, channels, campaigns, best days and hours'],
  ['POST', 'properties/default/report', 'Any GA4 query'],
];

// Switch for the analytics API: other tools read the connected properties
// through it with the bearer token set in the deployment.
function AnalyticsApi({ ga, setGa }: { ga: GaState; setGa: (s: GaState) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const state = ga.analyticsApi;
  if (!state) return null;
  const base = new URL('api/v1/', window.location.href).href;

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try { setGa(await gaApi.setAnalyticsApi(!state.enabled)); } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  };
  const copy = () => navigator.clipboard?.writeText(base).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {});

  return (
    <section className="ga-api" aria-label="Analytics API">
      <div className="ga-api-head">
        <div>
          <b>Analytics API</b>
          <div className="muted small">Lets other tools read the connected properties with the API token.</div>
        </div>
        <label className="switch">
          <input type="checkbox" role="switch" checked={state.enabled} onChange={toggle} disabled={busy} aria-label="Analytics API" />
          <span aria-hidden="true" />
          <b className="small">{state.enabled ? 'On' : 'Off'}</b>
        </label>
      </div>
      {state.enabled && (
        <>
          <div className="ga-api-url">
            <code>{base}</code>
            <button className="ga-link" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <p className="muted small">Send <code>Authorization: Bearer &lt;token&gt;</code>. The token is the <code>ANALYTICS_API_TOKEN</code> deployment secret.</p>
          <ul className="ga-api-endpoints">
            {ENDPOINTS.map(([m, path, what]) => (
              <li key={path}><code>{m} {path}</code><span className="muted small">{what}</span></li>
            ))}
          </ul>
          <p className="muted small">
            {state.collectingSince ? `Recording realtime data since ${new Date(state.collectingSince).toLocaleString()}.` : 'Realtime data is recorded every 10 minutes while the API is on.'}
            {' '}Age, gender and interests appear in <code>insights</code> once Google signals is on and GA has processed the data (24–48 h).
          </p>
        </>
      )}
      {!state.tokenConfigured && <p className="warn small">The server has no API token yet: add the ANALYTICS_API_TOKEN secret and redeploy.</p>}
      {error && <p className="warn small">{error}</p>}
    </section>
  );
}
