// Demand Radar API (its own service next to the static frontend): keeps the Google Analytics connection on the server so it
// stays connected around the clock and is shared by every device.
//
// The browser signs in with Google (authorization code, popup mode) and hands
// the one-time code to this server. The server exchanges it for a refresh
// token, stores it encrypted and uses it to get access tokens when
// needed. Every hour it refreshes each account, so revoked access shows up
// in the dashboard and the refresh token never goes unused.
//
// Node 22, no dependencies. Configuration (environment):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET  OAuth web client (required)
//   K8S_SECRET_NAME  store in this Kubernetes Secret (in-cluster, via the
//                    pod's service account); otherwise a file is used:
//   DATA_DIR      where ga.json is stored (default ./data)
//   PORT          default 8787
//   GOOGLE_OAUTH_URL, GA_ADMIN_URL, GA_DATA_URL  overridable for tests

import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const env = process.env;
const CLIENT_ID = env.GOOGLE_CLIENT_ID ?? '';
const CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET ?? '';
const DATA_DIR = env.DATA_DIR ?? './data';
const OAUTH = env.GOOGLE_OAUTH_URL ?? 'https://oauth2.googleapis.com';
const ADMIN = env.GA_ADMIN_URL ?? 'https://analyticsadmin.googleapis.com';
const DATA = env.GA_DATA_URL ?? 'https://analyticsdata.googleapis.com';
const CHECK_MS = Number(env.CHECK_INTERVAL_MS ?? 3_600_000);
const configured = !!(CLIENT_ID && CLIENT_SECRET);

// ---------- storage: one JSON document, refresh tokens encrypted (AES-256-GCM)

const key = configured ? Buffer.from(hkdfSync('sha256', CLIENT_SECRET, 'demand-radar', 'ga-refresh-token', 32)) : null;

const seal = (text) => {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString('base64')).join('.');
};
const open = (sealed) => {
  try {
    const [iv, tag, body] = sealed.split('.').map((s) => Buffer.from(s, 'base64'));
    const d = createDecipheriv('aes-256-gcm', key, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(body), d.final()]).toString('utf8');
  } catch { return null; } // e.g. the client secret changed
};

/** @type {{ accounts: { id: string, email: string, refresh: string, error?: string }[], connections: { property: { id: string, name: string, account: string }, accountId: string }[] }} */
let store = { accounts: [], connections: [] };
const access = new Map(); // accountId -> { token, expiresAt } (memory only)

// File backend (local dev, tests).
const FILE = join(DATA_DIR, 'ga.json');
const fileBackend = {
  async read() {
    try { return await readFile(FILE, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  },
  async write(text) {
    await mkdir(DATA_DIR, { recursive: true });
    const tmp = `${FILE}.${process.pid}.tmp`;
    await writeFile(tmp, text, { mode: 0o600 });
    await rename(tmp, FILE);
  },
};

// Kubernetes Secret backend: survives restarts and redeploys without a
// persistent volume. The pod's service account may only manage secrets.
function kubeBackend(name) {
  const saDir = env.K8S_SA_DIR ?? '/var/run/secrets/kubernetes.io/serviceaccount';
  const apiUrl = new URL(env.K8S_API_URL ?? 'https://kubernetes.default.svc');
  let version = null;
  const call = async (method, path, body) => {
    const [token, ca] = await Promise.all([readFile(join(saDir, 'token'), 'utf8'), apiUrl.protocol === 'https:' ? readFile(join(saDir, 'ca.crt')) : null]);
    const ns = env.K8S_NAMESPACE ?? (await readFile(join(saDir, 'namespace'), 'utf8')).trim();
    const payload = body ? JSON.stringify(body) : undefined;
    return new Promise((resolve, reject) => {
      const req = (apiUrl.protocol === 'https:' ? httpsRequest : httpRequest)(new URL(`/api/v1/namespaces/${ns}/secrets${path}`, apiUrl), {
        method, ca: ca ?? undefined,
        headers: { Authorization: `Bearer ${token.trim()}`, Accept: 'application/json', ...(payload && { 'Content-Type': 'application/json' }) },
      }, (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => { try { resolve({ status: res.statusCode, json: raw ? JSON.parse(raw) : {} }); } catch (e) { reject(e); } });
      });
      req.on('error', reject);
      req.end(payload);
    });
  };
  const fail = (what, r) => new Error(`${what} secret ${name}: ${r.status} ${r.json?.message ?? ''}`);
  return {
    async read() {
      const r = await call('GET', `/${name}`);
      if (r.status === 404) { version = null; return null; }
      if (r.status !== 200) throw fail('read', r);
      version = r.json.metadata.resourceVersion;
      const data = r.json.data?.['ga.json'];
      return data ? Buffer.from(data, 'base64').toString('utf8') : null;
    },
    async write(text) {
      const body = (v) => ({ apiVersion: 'v1', kind: 'Secret', type: 'Opaque', metadata: { name, ...(v && { resourceVersion: v }), labels: { 'app.kubernetes.io/part-of': 'demand-radar' } }, data: { 'ga.json': Buffer.from(text).toString('base64') } });
      let r = version ? await call('PUT', `/${name}`, body(version)) : await call('POST', '', body(null));
      if (r.status === 409) { await this.read(); r = version ? await call('PUT', `/${name}`, body(version)) : await call('POST', '', body(null)); }
      if (r.status !== 200 && r.status !== 201) throw fail('write', r);
      version = r.json.metadata.resourceVersion;
    },
  };
}

const backend = env.K8S_SECRET_NAME ? kubeBackend(env.K8S_SECRET_NAME) : fileBackend;

async function load() {
  access.clear();
  // A store that exists but cannot be read must not be overwritten: fail
  // loudly instead (the pod restarts and the deploy shows the error).
  const text = await backend.read();
  store = { accounts: [], connections: [], ...(text ? JSON.parse(text) : {}) };
}
let writing = Promise.resolve();
function save() {
  writing = writing.then(() => backend.write(JSON.stringify(store, null, 1))).catch((e) => console.error('could not save store:', e.message));
  return writing;
}

// ---------- Google

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

async function google(url, init = {}) {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new HttpError(res.status === 401 || res.status === 403 ? res.status : 502, json?.error?.message || json?.error_description || json?.error || `Google returned ${res.status}`);
    e.google = json?.error;
    throw e;
  }
  return json;
}

const form = (o) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o) });

/** Exchanges a popup-mode authorization code. Popup codes are bound to
 * 'postmessage' (older clients) or the page origin (newer docs); try both. */
async function exchange(code, origin) {
  let last;
  for (const redirect_uri of ['postmessage', origin].filter(Boolean)) {
    try { return await google(`${OAUTH}/token`, form({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri, grant_type: 'authorization_code' })); }
    catch (e) {
      if (e.google === 'invalid_grant') throw new HttpError(400, 'The Google sign-in code was invalid or has expired — try again.');
      last = e;
      if (e.google !== 'redirect_uri_mismatch') throw e;
    }
  }
  throw last;
}

const claims = (idToken) => JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'));

async function accessToken(account) {
  const cached = access.get(account.id);
  if (cached && cached.expiresAt - Date.now() > 60_000) return cached.token;
  const refresh = open(account.refresh);
  if (!refresh) throw new HttpError(401, 'Stored Google access can no longer be read — reconnect this account.');
  try {
    const t = await google(`${OAUTH}/token`, form({ refresh_token: refresh, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'refresh_token' }));
    access.set(account.id, { token: t.access_token, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 });
    if (account.error) { delete account.error; save(); }
    return t.access_token;
  } catch (e) {
    if (e.google === 'invalid_grant') {
      account.error = 'Google access was revoked or has expired — reconnect this account.';
      save();
      throw new HttpError(401, account.error);
    }
    throw e;
  }
}

async function listProperties(token) {
  const out = [];
  let page = '';
  do {
    const json = await google(`${ADMIN}/v1beta/accountSummaries?pageSize=200${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`, { headers: { Authorization: `Bearer ${token}` } });
    for (const a of json.accountSummaries ?? []) for (const p of a.propertySummaries ?? []) out.push({ id: String(p.property).replace('properties/', ''), name: p.displayName, account: a.displayName });
    page = json.nextPageToken ?? '';
  } while (page);
  return out;
}

async function realtime(token, propertyId) {
  const run = (body) => google(`${DATA}/v1beta/properties/${encodeURIComponent(propertyId)}:runRealtimeReport`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then((j) => j.rows ?? []);
  const num = (r) => Number(r?.metricValues?.[0]?.value ?? 0);
  const top = (rows) => rows.map((r) => ({ name: r.dimensionValues?.[0]?.value || '(not set)', value: num(r) }));
  const [total, countries, pages] = await Promise.all([
    run({ metrics: [{ name: 'activeUsers' }] }),
    run({ dimensions: [{ name: 'country' }], metrics: [{ name: 'activeUsers' }], limit: 5 }),
    run({ dimensions: [{ name: 'unifiedScreenName' }], metrics: [{ name: 'activeUsers' }], limit: 5 }),
  ]);
  return { activeUsers: num(total[0]), countries: top(countries), pages: top(pages), updated: new Date().toISOString() };
}

async function revoke(account) {
  const refresh = open(account.refresh);
  if (refresh) await fetch(`${OAUTH}/revoke`, form({ token: refresh })).catch(() => {});
  access.delete(account.id);
}

// ---------- API

const publicState = () => ({
  configured,
  accounts: store.accounts.map(({ id, email, error }) => ({ id, email, ...(error && { error }) })),
  connections: store.connections,
});

const account = (id) => {
  const a = store.accounts.find((x) => x.id === id);
  if (!a) throw new HttpError(404, 'Unknown Google account.');
  return a;
};

const routes = [
  ['GET', /^\/api\/health$/, () => ({ ok: true })],
  ['GET', /^\/api\/ga$/, () => publicState()],

  // Connect a Google account: exchange the code and keep the refresh token.
  ['POST', /^\/api\/ga\/accounts$/, async (_m, body, req) => {
    if (!configured) throw new HttpError(503, 'The server has no Google client secret configured.');
    if (typeof body.code !== 'string') throw new HttpError(400, 'Missing authorization code.');
    const t = await exchange(body.code, req.headers.origin);
    const { sub, email } = claims(t.id_token ?? '');
    if (!sub) throw new HttpError(502, 'Google did not identify the account.');
    if (!String(t.scope ?? '').includes('analytics.readonly')) throw new HttpError(400, 'Read access to Google Analytics was not granted.');
    let a = store.accounts.find((x) => x.id === sub);
    if (!t.refresh_token && !a) {
      throw new HttpError(409, 'Google did not grant lasting access because access was given before. Remove this app at myaccount.google.com/connections, then connect again.');
    }
    if (!a) store.accounts.push((a = { id: sub, email: email ?? sub, refresh: '' }));
    if (t.refresh_token) a.refresh = seal(t.refresh_token);
    a.email = email ?? a.email;
    delete a.error;
    access.set(sub, { token: t.access_token, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 });
    await save();
    return { account: { id: a.id, email: a.email }, properties: await listProperties(t.access_token) };
  }],

  ['GET', /^\/api\/ga\/accounts\/([^/]+)\/properties$/, async (m) => listProperties(await accessToken(account(decodeURIComponent(m[1]))))],

  // Disconnect a Google account: revoke it and drop its properties.
  ['DELETE', /^\/api\/ga\/accounts\/([^/]+)$/, async (m) => {
    const a = account(decodeURIComponent(m[1]));
    await revoke(a);
    store.accounts = store.accounts.filter((x) => x !== a);
    store.connections = store.connections.filter((c) => c.accountId !== a.id);
    await save();
    return publicState();
  }],

  ['POST', /^\/api\/ga\/connections$/, async (_m, body) => {
    const a = account(String(body.accountId));
    const want = new Set(Array.isArray(body.propertyIds) ? body.propertyIds.map(String) : []);
    if (!want.size) throw new HttpError(400, 'Select at least one property.');
    const props = (await listProperties(await accessToken(a))).filter((p) => want.has(p.id));
    for (const property of props) if (!store.connections.some((c) => c.property.id === property.id)) store.connections.push({ property, accountId: a.id });
    await save();
    return publicState();
  }],

  ['DELETE', /^\/api\/ga\/connections\/([^/]+)$/, async (m) => {
    store.connections = store.connections.filter((c) => c.property.id !== decodeURIComponent(m[1]));
    await save();
    return publicState();
  }],

  ['GET', /^\/api\/ga\/realtime\/([^/]+)$/, async (m) => {
    const c = store.connections.find((x) => x.property.id === decodeURIComponent(m[1]));
    if (!c) throw new HttpError(404, 'This property is not connected.');
    return realtime(await accessToken(account(c.accountId)), c.property.id);
  }],

  // Sign out everywhere: revoke every account and forget everything.
  ['DELETE', /^\/api\/ga$/, async () => {
    await Promise.all(store.accounts.map(revoke));
    store = { accounts: [], connections: [] };
    await save();
    return publicState();
  }],
];

async function readJson(req) {
  if (req.method !== 'POST') return {};
  // JSON only: browsers cannot send it cross-site without a CORS preflight,
  // which this server never answers, so other sites cannot drive the API.
  if (!String(req.headers['content-type']).startsWith('application/json')) throw new HttpError(415, 'Send JSON.');
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 64_000) throw new HttpError(413, 'Too large.'); }
  try { return raw ? JSON.parse(raw) : {}; } catch { throw new HttpError(400, 'Invalid JSON.'); }
}

export function createApp() {
  return createServer(async (req, res) => {
    // The ingress routes <deployment path>/api/* here without rewriting, so
    // drop whatever prefix comes before /api/ (e.g. /my-branch/api/ga).
    const full = new URL(req.url, 'http://x').pathname;
    const at = full.indexOf('/api/');
    const path = at >= 0 ? full.slice(at) : full;
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(body));
    };
    try {
      const route = routes.find(([method, re]) => method === req.method && re.test(path));
      if (!route) return send(404, { error: 'Not found.' });
      send(200, await route[2](path.match(route[1]), await readJson(req), req));
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status >= 500) console.error(req.method, path, e.message);
      send(status, { error: status === 500 ? 'Server error.' : e.message });
    }
  });
}

// Hourly: refresh every account so revoked access is noticed and the refresh
// token stays in use (Google expires refresh tokens unused for six months).
async function check() {
  for (const a of store.accounts) {
    access.delete(a.id);
    await accessToken(a).catch((e) => console.error(`account ${a.email}:`, e.message));
  }
}

export async function start(port = Number(env.PORT ?? 8787)) {
  await load();
  const server = createApp();
  await new Promise((r) => server.listen(port, r));
  const timer = setInterval(check, CHECK_MS);
  timer.unref();
  server.on('close', () => clearInterval(timer));
  console.log(`demand-radar api on :${server.address().port}${configured ? '' : ' (Google client not configured)'}`);
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = await start();
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => writing.then(() => process.exit(0))));
}
