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
//   DATA_DIR      where ga.json is stored (default ./data)
//   STORE_PERSISTENT  'false' if DATA_DIR is lost on restart (shown in the UI)
//   PORT          default 8787
//   ANALYTICS_API_TOKEN  bearer token for the analytics API (/api/v1, see
//                 analytics.mjs); switched on and off in the dashboard
//   ANALYTICS_COLLECT_MS  how often realtime data is collected (default 10 min)
//   GOOGLE_OAUTH_URL, GA_ADMIN_URL, GA_DATA_URL  overridable for tests

import { createServer } from 'node:http';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createAnalytics } from './analytics.mjs';

const env = process.env;
const CLIENT_ID = env.GOOGLE_CLIENT_ID ?? '';
const CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET ?? '';
const DATA_DIR = env.DATA_DIR ?? './data';
const OAUTH = env.GOOGLE_OAUTH_URL ?? 'https://oauth2.googleapis.com';
const ADMIN = env.GA_ADMIN_URL ?? 'https://analyticsadmin.googleapis.com';
const DATA = env.GA_DATA_URL ?? 'https://analyticsdata.googleapis.com';
const CHECK_MS = Number(env.CHECK_INTERVAL_MS ?? 3_600_000);
const configured = !!(CLIENT_ID && CLIENT_SECRET);
// false when DATA_DIR does not survive a restart (e.g. an emptyDir).
let persistent = env.STORE_PERSISTENT !== 'false';
let storageError = null;

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

/** @type {{ accounts: { id: string, email: string, refresh: string, error?: string }[], connections: { property: { id: string, name: string, account: string }, accountId: string }[], analyticsApi?: { enabled: boolean } }} */
let store = { accounts: [], connections: [] };
const access = new Map(); // accountId -> { token, expiresAt } (memory only)

// File store under DATA_DIR (a volume in the cluster).
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

const backend = fileBackend;

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
    const e = new HttpError([400, 401, 403].includes(res.status) ? res.status : 502, json?.error?.message || json?.error_description || json?.error || `Google returned ${res.status}`);
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
  persistent,
  ...(storageError && { storageError }),
  accounts: store.accounts.map(({ id, email, error }) => ({ id, email, ...(error && { error }) })),
  connections: store.connections,
  analyticsApi: { enabled: !!store.analyticsApi?.enabled, tokenConfigured: analytics.tokenConfigured, collectingSince: analytics.collectingSince() },
});

const account = (id) => {
  const a = store.accounts.find((x) => x.id === id);
  if (!a) throw new HttpError(404, 'Unknown Google account.');
  return a;
};

// The token-protected analytics API for other tools (/api/v1).
const analytics = createAnalytics({
  token: env.ANALYTICS_API_TOKEN?.trim() ?? '',
  dataDir: DATA_DIR,
  dataUrl: DATA,
  google,
  HttpError,
  connections: () => store.connections,
  accessTokenFor: (propertyId) => {
    const c = store.connections.find((x) => x.property.id === propertyId);
    if (!c) throw new HttpError(404, 'This property is not connected.');
    return accessToken(account(c.accountId));
  },
  isEnabled: () => !!store.analyticsApi?.enabled,
  collectMs: Number(env.ANALYTICS_COLLECT_MS ?? 600_000),
});
export const collectAnalytics = () => analytics.collect();

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

  // Switch the analytics API (/api/v1) on or off for everyone.
  ['POST', /^\/api\/ga\/analytics-api$/, async (_m, body) => {
    if (typeof body.enabled !== 'boolean') throw new HttpError(400, 'Send {"enabled": true} or {"enabled": false}.');
    store.analyticsApi = { enabled: body.enabled };
    await save();
    if (body.enabled) analytics.collect().catch((e) => console.error('analytics collect:', e.message));
    return publicState();
  }],

  // Sign out everywhere: revoke every account and forget everything.
  ['DELETE', /^\/api\/ga$/, async () => {
    await Promise.all(store.accounts.map(revoke));
    store = { accounts: [], connections: [], analyticsApi: store.analyticsApi };
    await save();
    return publicState();
  }],

  ...analytics.routes,
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
    // The analytics API is for other tools, also in browsers: it allows any
    // origin, which is safe because it needs the bearer token (no cookies).
    // The dashboard's own routes stay same-origin.
    const cors = path.startsWith('/api/v1') ? {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Max-Age': '600',
    } : {};
    const send = (status, body, headers = {}) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...cors, ...headers });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'OPTIONS' && path.startsWith('/api/v1')) { res.writeHead(204, cors); return res.end(); }
    try {
      const route = routes.find(([method, re]) => method === req.method && re.test(path));
      if (!route) return send(404, { error: 'Not found.' });
      send(200, await route[2](path.match(route[1]), await readJson(req), req));
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status >= 500) console.error(req.method, path, e.message);
      send(status, { error: status === 500 ? 'Server error.' : e.message }, e.headers);
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
  await analytics.start();
  // Fail visibly, not silently, if the store cannot be written.
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(join(DATA_DIR, '.write-test'), 'ok');
    await rm(join(DATA_DIR, '.write-test'));
  } catch (e) {
    storageError = `The server cannot write its storage (${e.code ?? e.message}); connections are lost when it restarts.`;
    persistent = false;
    console.error(storageError);
  }
  const server = createApp();
  await new Promise((r) => server.listen(port, r));
  const timer = setInterval(check, CHECK_MS);
  timer.unref();
  server.on('close', () => { clearInterval(timer); analytics.stop(); });
  console.log(`demand-radar api on :${server.address().port}${configured ? '' : ' (Google client not configured)'}`);
  return server;
}

// Run when executed directly. Compare real paths: Kubernetes mounts
// ConfigMap files as symlinks, so argv[1] differs from the module URL.
const isMain = (() => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isMain) {
  const server = await start();
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => writing.then(() => process.exit(0))));
}
