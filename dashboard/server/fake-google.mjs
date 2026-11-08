// A fake Google (OAuth token/revoke, Analytics Admin and Data APIs) for the API tests.
import { createServer } from 'node:http';

export async function startFakeGoogle() {
  const calls = { grants: [], revoked: [], reports: [], standard: [] };
  const control = { refreshValid: true, realtimeEmpty: false };
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
    const req = JSON.parse(body);
    const dims = (req.dimensions ?? []).map((d) => d.name);
    // The analytics API asks for named dimensions and metrics; answer in GA's shape.
    if (dims[0] === 'minutesAgo' || req.metrics.length > 1 || dims.length > 1 || req.minuteRanges) {
      const value = { country: 'Netherlands', countryId: 'NL', city: 'Amsterdam', deviceCategory: 'mobile', platform: 'web', unifiedScreenName: 'Ski pass prices', eventName: 'page_view', audienceName: 'All Users' };
      const minutes = dims[0] === 'minutesAgo' ? ['00', '03', '12'] : [null];
      return json(200, {
        dimensionHeaders: dims.map((name) => ({ name })),
        metricHeaders: req.metrics.map((x) => ({ name: x.name, type: 'TYPE_INTEGER' })),
        rows: control.realtimeEmpty ? [] : minutes.map((min) => ({
          dimensionValues: dims.map((d) => ({ value: d === 'minutesAgo' ? min : value[d] })),
          metricValues: req.metrics.map((x) => ({ value: x.name === 'activeUsers' ? '2' : '5' })),
        })),
        ...(req.metricAggregations && { totals: [{ dimensionValues: dims.map(() => ({ value: 'RESERVED_TOTAL' })), metricValues: req.metrics.map((x) => ({ value: x.name === 'activeUsers' ? '2' : '5' })) }] }),
      });
    }
    const dim = dims[0];
    if (!dim) return json(200, { rows: [{ metricValues: [{ value: '4' }] }] });
    return json(200, { rows: [{ dimensionValues: [{ value: dim === 'country' ? 'Netherlands' : 'Home' }], metricValues: [{ value: '4' }] }] });
  }
  const r = url.pathname.match(/^\/v1beta\/properties\/(\d+):runReport$/);
  if (r) {
    calls.standard.push(JSON.parse(body));
    const req = JSON.parse(body);
    const dims = (req.dimensions ?? []).map((d) => d.name);
    if (dims.includes('notADimension')) return json(400, { error: { message: 'Field notADimension is not a valid dimension.' } });
    // Demographics are empty, like on a new property without Google signals.
    const empty = dims.some((d) => ['userAgeBracket', 'userGender', 'brandingInterest'].includes(d));
    const value = { country: 'Netherlands', countryId: 'NL', date: '20261108', sessionDefaultChannelGroup: 'Organic Search', sessionSource: 'google', sessionMedium: 'organic', dayOfWeek: '0', dayOfWeekName: 'Sunday', hour: '20' };
    return json(200, {
      dimensionHeaders: dims.map((name) => ({ name })),
      metricHeaders: req.metrics.map((x) => ({ name: x.name, type: x.name === 'engagementRate' ? 'TYPE_FLOAT' : 'TYPE_INTEGER' })),
      rows: empty ? [] : [{ dimensionValues: dims.map((d) => ({ value: value[d] ?? 'x' })), metricValues: req.metrics.map((x) => ({ value: x.name === 'engagementRate' ? '0.612345678' : '10' })) }],
      rowCount: empty ? 0 : 1,
      metadata: { currencyCode: 'EUR', timeZone: 'Europe/Vienna', ...(dims.includes('country') && { subjectToThresholding: true }) },
      ...(req.returnPropertyQuota && { propertyQuota: { tokensPerDay: { consumed: 5, remaining: 199995 } } }),
    });
  }
  if (/^\/v1beta\/properties\/\d+\/metadata$/.test(url.pathname)) {
    return json(200, { dimensions: [{ apiName: 'userAgeBracket', uiName: 'Age', category: 'Demographics', description: 'Age brackets' }, { apiName: 'customUser:tier', uiName: 'Tier', category: 'Custom', customDefinition: true }], metrics: [{ apiName: 'activeUsers', uiName: 'Active users', category: 'User' }] });
  }
  json(404, {});
});

  await new Promise((r) => fakeGoogle.listen(0, r));
  return { url: `http://127.0.0.1:${fakeGoogle.address().port}`, calls, control, close: () => fakeGoogle.close() };
}
