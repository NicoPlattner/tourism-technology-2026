// End-to-end test of the API against a fake Google (node --test).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startFakeGoogle } from './fake-google.mjs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let api, base, dataDir, google, calls;
before(async () => {
  google = await startFakeGoogle();
  calls = google.calls;
  const g = google.url;
  dataDir = await mkdtemp(join(tmpdir(), 'ga-api-'));
  Object.assign(process.env, { GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', DATA_DIR: dataDir, GOOGLE_OAUTH_URL: g, GA_ADMIN_URL: g, GA_DATA_URL: g });
  const { start } = await import('./server.mjs');
  api = await start(0);
  // Requests arrive with the deployment path in front, as from the ingress.
  base = `http://127.0.0.1:${api.address().port}/some/branch/api`;
});
after(() => { api?.close(); google.close(); });

const call = async (method, path, body) => {
  const res = await fetch(base + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};

test('connect, pick, read realtime data, survive refresh, revoke', async () => {
  let r = await call('GET', '/ga');
  assert.deepEqual(r.body, { configured: true, persistent: true, accounts: [], connections: [] });

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
  google.control.refreshValid = false;
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
  google.control.refreshValid = true;
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
