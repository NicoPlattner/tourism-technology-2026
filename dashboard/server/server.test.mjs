// End-to-end test of the API against a fake Google (node --test).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const calls = { grants: [], revoked: [], reports: [] };
let refreshValid = true;
const jwt = (o) => ['e30', Buffer.from(JSON.stringify(o)).toString('base64url'), 'sig'].join('.');

const fakeGoogle = createServer(async (req, res) => {
  let body = '';
  for await (const c of req) body += c;
  const json = (status, o) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/token') {
    const f = new URLSearchParams(body);
    calls.grants.push(f.get('grant_type'));
    if (f.get('client_secret') !== 'test-secret') return json(401, { error: 'invalid_client' });
    if (f.get('grant_type') === 'authorization_code') {
      if (f.get('redirect_uri') !== 'postmessage') return json(400, { error: 'redirect_uri_mismatch' });
      if (f.get('code') !== 'good-code') return json(400, { error: 'invalid_grant' });
      // expires_in 30 s is inside the 60 s safety margin, so the next call refreshes.
      return json(200, { access_token: 'access-1', expires_in: 30, refresh_token: 'refresh-secret', scope: 'openid email https://www.googleapis.com/auth/analytics.readonly', id_token: jwt({ sub: 'user-1', email: 'nico@example.com' }) });
    }
    if (f.get('refresh_token') !== 'refresh-secret' || !refreshValid) return json(400, { error: 'invalid_grant' });
    return json(200, { access_token: 'access-2', expires_in: 3600 });
  }
  if (url.pathname === '/revoke') { calls.revoked.push(new URLSearchParams(body).get('token')); return json(200, {}); }
  if (!/^Bearer access-/.test(req.headers.authorization ?? '')) return json(401, { error: { message: 'bad token' } });
  if (url.pathname === '/v1beta/accountSummaries') {
    return json(200, { accountSummaries: [
      { displayName: 'TVB Paznaun-Ischgl', propertySummaries: [{ property: 'properties/111', displayName: 'Ischgl Web' }, { property: 'properties/333', displayName: 'Galtür Web' }] },
    ] });
  }
  const m = url.pathname.match(/^\/v1beta\/properties\/(\d+):runRealtimeReport$/);
  if (m) {
    calls.reports.push(m[1]);
    const dim = JSON.parse(body).dimensions?.[0]?.name;
    if (!dim) return json(200, { rows: [{ metricValues: [{ value: '4' }] }] });
    return json(200, { rows: [{ dimensionValues: [{ value: dim === 'country' ? 'Netherlands' : 'Home' }], metricValues: [{ value: '4' }] }] });
  }
  json(404, {});
});

let api, base, dataDir;
before(async () => {
  await new Promise((r) => fakeGoogle.listen(0, r));
  const g = `http://127.0.0.1:${fakeGoogle.address().port}`;
  dataDir = await mkdtemp(join(tmpdir(), 'ga-api-'));
  Object.assign(process.env, { GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', DATA_DIR: dataDir, GOOGLE_OAUTH_URL: g, GA_ADMIN_URL: g, GA_DATA_URL: g });
  const { start } = await import('./server.mjs');
  api = await start(0);
  // Requests arrive with the deployment path in front, as from the ingress.
  base = `http://127.0.0.1:${api.address().port}/some/branch/api`;
});
after(() => { api?.close(); fakeGoogle.close(); });

const call = async (method, path, body) => {
  const res = await fetch(base + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};

test('connect, pick, read realtime data, survive refresh, revoke', async () => {
  let r = await call('GET', '/ga');
  assert.deepEqual(r.body, { configured: true, accounts: [], connections: [] });

  r = await call('POST', '/ga/accounts', { code: 'good-code' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.account, { id: 'user-1', email: 'nico@example.com' });
  assert.deepEqual(r.body.properties.map((p) => p.id), ['111', '333']);

  // Nothing is connected until properties are picked.
  r = await call('GET', '/ga');
  assert.equal(r.body.connections.length, 0);
  assert.ok(!JSON.stringify(r.body).includes('refresh'), 'tokens never leave the server');

  r = await call('POST', '/ga/connections', { accountId: 'user-1', propertyIds: ['333', 'not-mine'] });
  assert.deepEqual(r.body.connections.map((c) => [c.property.id, c.accountId]), [['333', 'user-1']]);

  // The refresh token is stored, encrypted.
  const file = await readFile(join(dataDir, 'ga.json'), 'utf8');
  assert.ok(file.includes('user-1') && !file.includes('refresh-secret'));

  // The first access token is near expiry, so this uses the refresh token.
  r = await call('GET', '/ga/realtime/333');
  assert.equal(r.status, 200);
  assert.equal(r.body.activeUsers, 4);
  assert.deepEqual(r.body.countries, [{ name: 'Netherlands', value: 4 }]);
  assert.deepEqual(calls.grants, ['authorization_code', 'refresh_token']);

  r = await call('GET', '/ga/realtime/111');
  assert.equal(r.status, 404, 'only connected properties can be read');

  // Revoked at Google: the account is flagged instead of silently failing.
  refreshValid = false;
  const { start } = await import('./server.mjs');
  api.close();
  api = await start(0); // a restart reloads from disk and forgets cached access tokens
  base = `http://127.0.0.1:${api.address().port}/api`;
  r = await call('GET', '/ga');
  assert.equal(r.body.connections.length, 1, 'connections survive a restart');
  r = await call('GET', '/ga/realtime/333');
  assert.equal(r.status, 401);
  r = await call('GET', '/ga');
  assert.match(r.body.accounts[0].error, /reconnect/);

  // Reconnecting the same account clears the error.
  refreshValid = true;
  r = await call('POST', '/ga/accounts', { code: 'good-code' });
  r = await call('GET', '/ga');
  assert.equal(r.body.accounts[0].error, undefined);

  r = await call('DELETE', '/ga/connections/333');
  assert.equal(r.body.connections.length, 0);
  r = await call('DELETE', '/ga/accounts/user-1');
  assert.deepEqual(r.body.accounts, []);
  assert.deepEqual(calls.revoked, ['refresh-secret']);
});

test('rejects bad input', async () => {
  let r = await call('POST', '/ga/accounts', { code: 'bad-code' });
  assert.equal(r.status, 400);
  const res = await fetch(`${base}/ga/accounts`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{"code":"good-code"}' });
  assert.equal(res.status, 415, 'form posts from other sites are refused');
  r = await call('POST', '/ga/connections', { accountId: 'nobody', propertyIds: ['1'] });
  assert.equal(r.status, 404);
});
