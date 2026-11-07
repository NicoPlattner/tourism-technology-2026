// The API storing its data in a Kubernetes Secret, against a fake Kubernetes
// API and a fake Google (node --test; runs in its own process).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startFakeGoogle } from './fake-google.mjs';

const secrets = new Map(); // name -> secret object
const kubeCalls = [];
let version = 0;
const fakeKube = createServer(async (req, res) => {
  let body = '';
  for await (const c of req) body += c;
  const json = (status, o) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  kubeCalls.push(`${req.method} ${req.url}`);
  if (req.headers.authorization !== 'Bearer sa-token') return json(401, { message: 'Unauthorized' });
  const m = req.url.match(/^\/api\/v1\/namespaces\/radar\/secrets(?:\/([^/]+))?$/);
  if (!m) return json(404, { message: 'not found' });
  if (req.method === 'GET') return secrets.has(m[1]) ? json(200, secrets.get(m[1])) : json(404, { message: 'not found' });
  const obj = JSON.parse(body);
  if (req.method === 'POST') {
    if (secrets.has(obj.metadata.name)) return json(409, { message: 'exists' });
  } else if (req.method === 'PUT') {
    if (secrets.get(m[1])?.metadata.resourceVersion !== obj.metadata.resourceVersion) return json(409, { message: 'conflict' });
  } else return json(405, {});
  obj.metadata.resourceVersion = String(++version);
  secrets.set(obj.metadata.name, obj);
  json(req.method === 'POST' ? 201 : 200, obj);
});

let api, base, google;
before(async () => {
  google = await startFakeGoogle();
  await new Promise((r) => fakeKube.listen(0, r));
  const saDir = await mkdtemp(join(tmpdir(), 'sa-'));
  await writeFile(join(saDir, 'token'), 'sa-token\n');
  await writeFile(join(saDir, 'namespace'), 'radar');
  Object.assign(process.env, {
    GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret',
    GOOGLE_OAUTH_URL: google.url, GA_ADMIN_URL: google.url, GA_DATA_URL: google.url,
    K8S_SECRET_NAME: 'radar-ga-data', K8S_API_URL: `http://127.0.0.1:${fakeKube.address().port}`, K8S_SA_DIR: saDir,
  });
  const { start } = await import('./server.mjs');
  api = await start(0);
  base = `http://127.0.0.1:${api.address().port}/api`;
});
after(() => { api?.close(); google.close(); fakeKube.close(); });

const call = async (method, path, body) => {
  const res = await fetch(base + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};

test('the connection is stored in a Kubernetes Secret and survives a restart', async () => {
  assert.equal(secrets.size, 0, 'nothing is written before something changes');
  await call('POST', '/ga/accounts', { code: 'good-code' });
  await call('POST', '/ga/connections', { accountId: 'user-1', propertyIds: ['111'] });

  const secret = secrets.get('radar-ga-data');
  assert.ok(secret, 'the API created its secret');
  const stored = Buffer.from(secret.data['ga.json'], 'base64').toString('utf8');
  assert.ok(stored.includes('"111"') && !stored.includes('refresh-secret'), 'refresh token is encrypted');
  assert.ok(kubeCalls.includes('POST /api/v1/namespaces/radar/secrets'));
  assert.ok(kubeCalls.includes('PUT /api/v1/namespaces/radar/secrets/radar-ga-data'), 'later saves update in place');

  const { start } = await import('./server.mjs');
  api.close();
  api = await start(0);
  base = `http://127.0.0.1:${api.address().port}/api`;
  const r = await call('GET', '/ga');
  assert.deepEqual(r.body.connections.map((c) => c.property.id), ['111']);
  const rt = await call('GET', '/ga/realtime/111');
  assert.equal(rt.body.activeUsers, 4, 'the stored refresh token still works after the restart');
});
