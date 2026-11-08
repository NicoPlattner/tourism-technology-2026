// End-to-end test of the API against a fake Google (node --test).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startFakeGoogle } from './fake-google.mjs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let api, base, dataDir, google, calls, collectAnalytics;
const TOKEN = 'test-analytics-token-123';
before(async () => {
  google = await startFakeGoogle();
  calls = google.calls;
  const g = google.url;
  dataDir = await mkdtemp(join(tmpdir(), 'ga-api-'));
  Object.assign(process.env, { GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', DATA_DIR: dataDir, GOOGLE_OAUTH_URL: g, GA_ADMIN_URL: g, GA_DATA_URL: g, ANALYTICS_API_TOKEN: TOKEN, ANALYTICS_COLLECT_MS: '3600000' });
  const { start } = await import('./server.mjs');
  ({ collectAnalytics } = await import('./server.mjs'));
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
  assert.deepEqual(r.body, { configured: true, persistent: true, accounts: [], connections: [], analyticsApi: { enabled: false, tokenConfigured: true, collectingSince: null } });

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

const v1 = async (method, path, { token = TOKEN, body } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}/v1${path}`, { method, headers, body: body && JSON.stringify(body) });
  return { status: res.status, headers: res.headers, body: await res.json() };
};

test('analytics API: token, on/off switch, realtime, insights, history, queries', async () => {
  let r = await v1('GET', '', { token: null });
  assert.equal(r.status, 200, 'the index is public');
  assert.equal(r.body.enabled, false);

  r = await v1('GET', '/properties', { token: null });
  assert.equal(r.status, 401);
  assert.match(r.headers.get('www-authenticate'), /Bearer/);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  r = await v1('GET', '/properties', { token: 'wrong' });
  assert.equal(r.status, 401);
  r = await v1('GET', '/properties');
  assert.equal(r.status, 403, 'off until switched on in the dashboard');

  r = await call('POST', '/ga/analytics-api', { enabled: 'yes' });
  assert.equal(r.status, 400);
  r = await call('POST', '/ga/analytics-api', { enabled: true });
  assert.equal(r.body.analyticsApi.enabled, true);

  r = await v1('GET', '/properties/default/realtime');
  assert.equal(r.status, 404, 'nothing connected yet');
  await call('POST', '/ga/accounts', { code: 'good-code' });
  await call('POST', '/ga/connections', { accountId: 'user-1', propertyIds: ['111'] });
  r = await v1('GET', '/properties');
  assert.deepEqual(r.body.properties.map((p) => p.id), ['111']);

  // Realtime: flat rows with names, shares and a summary.
  r = await v1('GET', '/properties/default/realtime');
  assert.equal(r.status, 200);
  assert.equal(r.body.property.id, '111');
  assert.equal(r.body.summary.topCountry, 'Netherlands');
  assert.equal(r.body.summary.eventCount, 5);
  assert.equal(r.body.summary.activeUsers5Minutes, 2);
  assert.deepEqual(r.body.breakdowns.city.rows[0], { country: 'Netherlands', city: 'Amsterdam', activeUsers: 2, eventCount: 5, screenPageViews: 5, keyEvents: 5, share: 1 });
  assert.equal(r.body.breakdowns.perMinute.rows.length, 3);
  for (const [k, sec] of Object.entries(r.body.breakdowns)) assert.equal(sec.status, 'ok', `realtime ${k}: ${sec.error}`);
  assert.deepEqual(r.body.breakdowns.event.rows[0], { eventName: 'page_view', eventCount: 5, keyEvents: 5, share: 1 });
  assert.ok(r.body.breakdowns.perMinute.rows[0].minute);
  r = await v1('GET', '/properties/333/realtime');
  assert.equal(r.status, 404);

  // Insights: demographics are empty on a new property and say why.
  r = await v1('GET', '/properties/111/insights?startDate=7daysAgo');
  assert.equal(r.status, 200);
  assert.equal(r.body.dateRange.startDate, '7daysAgo');
  assert.equal(r.body.timeZone, 'Europe/Vienna');
  assert.equal(r.body.overview.metrics.activeUsers, 10);
  assert.equal(r.body.overview.metrics.engagementRate, 0.6123);
  assert.equal(r.body.demographics.age.status, 'empty');
  assert.match(r.body.demographics.age.note, /Google signals/);
  assert.equal(r.body.dataAvailability.demographics, 'not yet');
  assert.equal(r.body.geography.country.thresholded, true);
  assert.equal(r.body.highlights.topCountries[0].value, 'Netherlands');
  assert.equal(r.body.highlights.topSources[0].value, 'google / organic');
  assert.equal(r.body.highlights.busiestDays[0].value, 'Sunday');
  assert.equal(r.body.quota.tokensPerDay, 199995);
  assert.ok(r.body.nextSteps.some((s) => /Google signals/.test(s)));
  const before = calls.standard.length;
  await v1('GET', '/properties/111/insights?startDate=7daysAgo');
  assert.equal(calls.standard.length, before, 'cached');
  r = await v1('GET', '/properties/111/insights?startDate=last-week');
  assert.equal(r.status, 400);

  // History: collected minutes add up once, however often they are seen.
  await collectAnalytics();
  await collectAnalytics();
  r = await v1('GET', '/properties/111/history/?days=1');
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'ok');
  assert.equal(r.body.totals.eventCount, 10, 'minutes 3 and 12; the running minute 0 is skipped');
  assert.equal(r.body.totals.activeUserMinutes, 4);
  assert.equal(r.body.totals.peakActiveUsers, 2);
  assert.deepEqual(r.body.breakdowns.city[0], { city: 'Amsterdam', country: 'Netherlands', activeUserMinutes: 4, eventCount: 10, screenPageViews: 10, keyEvents: 10, share: 1 });
  assert.equal(r.body.daily.reduce((s, d) => s + d.eventCount, 0), 10);
  assert.equal(r.body.collector.lastError, undefined);
  assert.deepEqual(r.body.breakdowns.event[0], { eventName: 'page_view', activeUserMinutes: 0, eventCount: 10, screenPageViews: 0, keyEvents: 10, share: 1 });
  assert.ok((await readFile(join(dataDir, 'analytics-history.json'), 'utf8')).includes('Amsterdam'));

  // Any query, passed through.
  r = await v1('POST', '/properties/111/report', { body: { dimensions: ['country'], metrics: ['activeUsers'], startDate: 'yesterday' } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.rows, [{ country: 'Netherlands', activeUsers: 10 }]);
  assert.deepEqual(calls.standard.at(-1).dateRanges, [{ startDate: 'yesterday', endDate: 'today' }]);
  r = await v1('POST', '/properties/111/report', { body: { dimensions: ['notADimension'], metrics: ['activeUsers'] } });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /not a valid dimension/);
  r = await v1('POST', '/properties/111/realtime', { body: { dimensions: ['city'], metrics: ['activeUsers', 'eventCount'] } });
  assert.equal(r.body.rows[0].city, 'Amsterdam');
  r = await v1('GET', '/properties/111/metadata');
  assert.equal(r.body.dimensions[1].custom, true);

  // Browsers on other sites may call it (with the token).
  const pre = await fetch(`${base}/v1/properties`, { method: 'OPTIONS' });
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get('access-control-allow-headers'), /Authorization/);
  const adminPre = await fetch(`${base}/ga`, { method: 'OPTIONS' });
  assert.equal(adminPre.headers.get('access-control-allow-origin'), null, 'dashboard routes stay same-origin');

  r = await call('POST', '/ga/analytics-api', { enabled: false });
  assert.equal(r.body.analyticsApi.enabled, false);
  r = await v1('GET', '/properties');
  assert.equal(r.status, 403);
});
