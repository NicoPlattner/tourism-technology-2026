// A fake Google (OAuth token/revoke, Analytics Admin and Data APIs) for the API tests.
import { createServer } from 'node:http';

export async function startFakeGoogle() {
  const calls = { grants: [], revoked: [], reports: [] };
  const control = { refreshValid: true };
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
    if (f.get('refresh_token') !== 'refresh-secret' || !control.refreshValid) return json(400, { error: 'invalid_grant' });
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

  await new Promise((r) => fakeGoogle.listen(0, r));
  return { url: `http://127.0.0.1:${fakeGoogle.address().port}`, calls, control, close: () => fakeGoogle.close() };
}
