// Analytics API (/api/v1): read access to the connected Google Analytics
// properties for other tools, protected by a bearer token
// (ANALYTICS_API_TOKEN). Every response is flat JSON (one object per row,
// numbers as numbers) and says per section whether data is there yet and why
// not, because a new GA4 property fills in gradually:
//
//   realtime  last 30 minutes, available immediately (geo, device, pages,
//             events, audiences)
//   history   the realtime data, collected by this server every few minutes
//             and kept, so there is history from the day a property is
//             connected, without waiting for GA's standard reports
//   insights  GA's standard reports (demographics: age, gender, interests,
//             language; geography; acquisition; content; timing). These
//             usually fill in 24–48 h after a property starts collecting;
//             demographics also need Google signals.
//   report / realtime (POST)  any GA Data API query, passed through.
//
// No dependencies. The server hands in how to reach Google and the stored
// connections.

import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DEMOGRAPHICS_NOTE = 'Age, gender and interests come from Google signals. Turn it on in GA (Admin → Data collection and modification → Data collection → Google signals, and allow granular demographic data); it is not retroactive. GA withholds rows below privacy thresholds, so small sites may see few or no rows. Not available in realtime.';
const STANDARD_NOTE = 'No rows for this date range yet. Standard (non-realtime) reports usually fill in 24–48 hours after a new property starts collecting data; until then use /realtime and /history.';
const HISTORY_NOTE = 'Collected by this server from the realtime report and kept; complete only for the minutes it observed (see coverage). activeUserMinutes adds up users active in each minute (a measure of attention); peakActiveUsers is the most users active in one minute.';

// ---------- report definitions

const AUDIENCE = ['activeUsers', 'newUsers', 'sessions', 'engagementRate', 'averageSessionDuration', 'keyEvents'];
const ACQUISITION = ['sessions', 'activeUsers', 'newUsers', 'engagementRate', 'keyEvents'];
const desc = (metric) => [{ metric: { metricName: metric }, desc: true }];

// [section, name, dimensions, metrics, extra]
const INSIGHTS = [
  ['overview', null, [], ['activeUsers', 'newUsers', 'sessions', 'engagedSessions', 'engagementRate', 'averageSessionDuration', 'sessionsPerUser', 'screenPageViews', 'eventCount', 'keyEvents']],
  ['trend', null, ['date'], ['activeUsers', 'newUsers', 'sessions', 'screenPageViews', 'keyEvents'], { orderBys: [{ dimension: { dimensionName: 'date' } }], limit: 400 }],
  ['demographics', 'age', ['userAgeBracket'], AUDIENCE],
  ['demographics', 'gender', ['userGender'], AUDIENCE],
  ['demographics', 'ageAndGender', ['userAgeBracket', 'userGender'], AUDIENCE],
  ['demographics', 'interests', ['brandingInterest'], AUDIENCE],
  ['demographics', 'language', ['language'], AUDIENCE],
  ['demographics', 'newVsReturning', ['newVsReturning'], AUDIENCE],
  ['geography', 'country', ['country', 'countryId'], AUDIENCE],
  ['geography', 'region', ['country', 'region'], AUDIENCE],
  ['geography', 'city', ['country', 'region', 'city'], AUDIENCE],
  ['technology', 'device', ['deviceCategory'], AUDIENCE],
  ['technology', 'operatingSystem', ['operatingSystem'], AUDIENCE],
  ['technology', 'browser', ['browser'], AUDIENCE],
  ['acquisition', 'channel', ['sessionDefaultChannelGroup'], ACQUISITION],
  ['acquisition', 'sourceMedium', ['sessionSource', 'sessionMedium'], ACQUISITION],
  ['acquisition', 'campaign', ['sessionCampaignName'], ACQUISITION],
  ['acquisition', 'firstUserChannel', ['firstUserDefaultChannelGroup'], ['newUsers', 'activeUsers', 'keyEvents']],
  ['content', 'landingPage', ['landingPage'], ACQUISITION],
  ['content', 'page', ['pageTitle', 'pagePath'], ['screenPageViews', 'activeUsers', 'keyEvents']],
  ['content', 'event', ['eventName'], ['eventCount', 'activeUsers', 'keyEvents']],
  ['timing', 'dayOfWeek', ['dayOfWeek', 'dayOfWeekName'], ['activeUsers', 'sessions', 'keyEvents'], { orderBys: [{ dimension: { dimensionName: 'dayOfWeek' } }] }],
  ['timing', 'hour', ['hour'], ['activeUsers', 'sessions', 'keyEvents'], { orderBys: [{ dimension: { dimensionName: 'hour' } }] }],
  ['timing', 'dayAndHour', ['dayOfWeek', 'dayOfWeekName', 'hour'], ['activeUsers', 'sessions', 'keyEvents'], { limit: 200 }],
];

const RT_METRICS = ['activeUsers', 'eventCount', 'screenPageViews', 'keyEvents'];
const REALTIME = [
  ['totals', [], RT_METRICS],
  ['last5Minutes', [], ['activeUsers'], { minuteRanges: [{ name: 'last5Minutes', startMinutesAgo: 4, endMinutesAgo: 0 }] }],
  ['perMinute', ['minutesAgo'], ['activeUsers', 'eventCount', 'screenPageViews'], { limit: 100 }],
  ['country', ['country', 'countryId'], RT_METRICS],
  ['city', ['country', 'city'], RT_METRICS],
  ['device', ['deviceCategory'], RT_METRICS],
  ['platform', ['platform'], RT_METRICS],
  ['page', ['unifiedScreenName'], RT_METRICS],
  // Realtime: event name only goes with event metrics, audiences only with users.
  ['event', ['eventName'], ['eventCount', 'keyEvents']],
  ['audience', ['audienceName'], ['activeUsers']],
];

// What the collector keeps per minute: [name, dimensions, metrics]. Values are
// stored as [activeUsers, eventCount, screenPageViews, keyEvents].
const COLLECT = [
  ['country', ['country'], RT_METRICS],
  ['city', ['city', 'country'], RT_METRICS],
  ['device', ['deviceCategory'], RT_METRICS],
  ['platform', ['platform'], RT_METRICS],
  ['page', ['unifiedScreenName'], RT_METRICS],
  ['event', ['eventName'], ['eventCount', 'keyEvents']],
];
const HIST_LABEL = { country: 'country', city: 'city', device: 'deviceCategory', platform: 'platform', page: 'unifiedScreenName', event: 'eventName' };

// ---------- helpers

const isUnknown = (v) => v == null || /^\(not set\)$|^\(other\)$|^unknown$|^\(data not available\)$|^$/i.test(String(v));
const round = (n) => (Number.isInteger(n) ? n : Math.round(n * 10_000) / 10_000);

/** GA response -> { rows: [{ dim: value, metric: number }], totals } */
export function flatten(res) {
  const dims = (res.dimensionHeaders ?? []).map((h) => h.name);
  const mets = (res.metricHeaders ?? []).map((h) => h.name);
  const toRows = (rows = []) => rows.map((r) => {
    const o = {};
    dims.forEach((d, i) => { o[d] = r.dimensionValues?.[i]?.value ?? null; });
    mets.forEach((m, i) => { o[m] = round(Number(r.metricValues?.[i]?.value ?? 0)); });
    return o;
  });
  const out = { rows: toRows(res.rows), rowCount: res.rowCount ?? res.rows?.length ?? 0 };
  const totals = toRows(res.totals)[0];
  if (totals) {
    for (const d of dims) delete totals[d];
    out.totals = totals;
  }
  return out;
}

/** Adds `share` (0–1) of the first metric to each row. */
function withShare(rows, metric, total) {
  const sum = total || rows.reduce((s, r) => s + (r[metric] ?? 0), 0);
  return sum ? rows.map((r) => ({ ...r, share: round((r[metric] ?? 0) / sum) })) : rows;
}

const asList = (a, key) => (Array.isArray(a) ? a.map((x) => (typeof x === 'string' ? { [key]: x } : x)) : undefined);

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

const DATE = /^(\d{4}-\d{2}-\d{2}|today|yesterday|\d{1,4}daysAgo)$/;
const minuteKey = (ms) => new Date(Math.floor(ms / 60_000) * 60_000).toISOString();
const hourKey = (iso) => `${iso.slice(0, 13)}:00:00.000Z`;

// ---------- OpenAPI description and Swagger UI (public: they describe the API, no data)

const SWAGGER_UI = 'https://unpkg.com/swagger-ui-dist@5.17.14';

/** The OpenAPI 3.1 description; `server` is this deployment's absolute /api/v1 URL. */
export function openapiSpec(server, retentionDays = 180) {
  const id = { name: 'id', in: 'path', required: true, description: 'GA4 property id from GET /properties, or `default` for the first connected property.', schema: { type: 'string', pattern: '^(default|[0-9]+)$', maxLength: 32, default: 'default' } };
  const freshParam = { name: 'fresh', in: 'query', required: false, description: 'Set to 1 to skip the server cache.', schema: { type: 'string', enum: ['1', 'true'] } };
  const date = (name, def) => ({ name, in: 'query', required: false, description: 'YYYY-MM-DD, `today`, `yesterday` or `NdaysAgo`.', schema: { type: 'string', pattern: '^(\\d{4}-\\d{2}-\\d{2}|today|yesterday|\\d{1,4}daysAgo)$', maxLength: 10, default: def } });
  const json = (schema, example) => ({ content: { 'application/json': { schema, ...(example && { example }) } } });
  const err = (description) => ({ description, ...json({ $ref: '#/components/schemas/Error' }) });
  const errors = {
    401: err('Missing or wrong bearer token.'),
    403: err('The analytics API is switched off in the dashboard (Integrations → Google Analytics → Analytics API).'),
    404: err('Property not connected.'),
    502: err('Google Analytics returned an error, e.g. the Google connection needs to be renewed.'),
    503: err('The server has no ANALYTICS_API_TOKEN configured.'),
  };
  const ok = (description, schema, example) => ({ 200: { description, ...json(schema, example) }, ...errors });
  const op = (operationId, summary, description, parameters, responses, extra = {}) => ({ operationId, summary, description, parameters, responses, ...extra });
  const queryBody = (realtime) => ({
    required: true,
    ...json({
      type: 'object',
      description: `A GA4 ${realtime ? 'runRealtimeReport' : 'runReport'} request. dimensions and metrics may be plain names.${realtime ? '' : ' startDate / endDate are a shortcut for dateRanges (default 28daysAgo – today).'}`,
      required: ['metrics'],
      properties: {
        dimensions: { type: 'array', items: { oneOf: [{ type: 'string' }, { type: 'object' }] }, maxItems: 9 },
        metrics: { type: 'array', items: { oneOf: [{ type: 'string' }, { type: 'object' }] }, minItems: 1, maxItems: 10 },
        ...(realtime ? { minuteRanges: { type: 'array', items: { type: 'object' } } } : {
          startDate: { type: 'string', default: '28daysAgo' },
          endDate: { type: 'string', default: 'today' },
          dateRanges: { type: 'array', items: { type: 'object' } },
        }),
        dimensionFilter: { type: 'object' },
        orderBys: { type: 'array', items: { type: 'object' } },
        limit: { type: 'integer', minimum: 1, maximum: 250000 },
      },
      additionalProperties: true,
    }, realtime
      ? { dimensions: ['country', 'city'], metrics: ['activeUsers'] }
      : { dimensions: ['country', 'userAgeBracket', 'userGender'], metrics: ['activeUsers', 'keyEvents'], startDate: '28daysAgo' }),
  });

  return {
    openapi: '3.1.0',
    info: {
      title: 'Demand Radar analytics API',
      version: '1.0.0',
      description: 'Read access to the Google Analytics (GA4) properties connected in the Demand Radar dashboard, for marketing and campaign tools.\n\n'
        + '- **Auth:** `Authorization: Bearer <ANALYTICS_API_TOKEN>` on every endpoint except this description.\n'
        + '- **On/off:** switched in the dashboard under Integrations → Google Analytics → Analytics API (403 while off).\n'
        + '- **Rows** are flat objects (`{"country":"Austria","activeUsers":12,"share":0.4}`); each report section has a `status` (`ok`, `empty`, `error`) and a `note` explaining missing data.\n'
        + '- **New properties:** standard reports fill in after 24–48 h; age, gender and interests need Google signals and enough users (GA privacy thresholds, flagged `thresholded: true`). Use realtime and history meanwhile.',
    },
    servers: [{ url: server }],
    security: [{ bearerAuth: [] }],
    tags: [{ name: 'Properties' }, { name: 'Live and history' }, { name: 'Reports' }, { name: 'Custom queries' }, { name: 'About' }],
    paths: {
      '/': { get: op('getOverview', 'API overview', 'Endpoint list and whether the API is switched on. No token needed.', [], { 200: { description: 'Overview', ...json({ type: 'object', properties: { name: { type: 'string' }, enabled: { type: 'boolean' }, endpoints: { type: 'object' } } }) } }, { tags: ['About'], security: [] }) },
      '/properties': { get: op('listProperties', 'Connected properties', 'GA4 properties connected in the dashboard.', [], ok('Properties', { type: 'object', properties: { properties: { type: 'array', items: { $ref: '#/components/schemas/Property' } } } }, { properties: [{ id: '563193335', name: 'traffic', account: 'Tourism Technology', collectingSince: '2026-11-08T00:51:45.658Z' }] }), { tags: ['Properties'] }) },
      '/properties/{id}/realtime': {
        get: op('getRealtime', 'Live visitors (last 30 minutes)', 'Active users in the last 30 and 5 minutes, per-minute trend, and breakdowns by country, city, device, platform, page, event and audience. No demographics or traffic sources (GA does not offer them in realtime). Cached 30 s.', [id, freshParam], ok('Realtime snapshot', { $ref: '#/components/schemas/Realtime' }), { tags: ['Live and history'] }),
        post: op('queryRealtime', 'Custom live query', 'Any GA4 realtime query. Realtime dimensions: country, city, deviceCategory, platform, unifiedScreenName, eventName, audienceName, minutesAgo, … Metrics: activeUsers, eventCount, screenPageViews, keyEvents. eventName only combines with event metrics; audienceName only with activeUsers.', [id], ok('Rows', { $ref: '#/components/schemas/QueryResult' }), { tags: ['Custom queries'], requestBody: queryBody(true) }),
      },
      '/properties/{id}/history': { get: op('getHistory', 'Visitor history', `Realtime data recorded by this server every 10 minutes while the API is on (kept ${retentionDays} days): totals, daily, hourly, and breakdowns by country, city, device, platform, page and event. activeUserMinutes adds up users active in each minute; peakActiveUsers is the most users in one minute.`, [id, { name: 'days', in: 'query', required: false, description: `Number of days back from now to include (1–${retentionDays}). Out-of-range values are clamped.`, schema: { type: 'integer', minimum: 1, maximum: retentionDays, default: 7 } }], ok('History', { $ref: '#/components/schemas/History' }), { tags: ['Live and history'] }) },
      '/properties/{id}/insights': { get: op('getInsights', 'Audience & marketing insights', 'GA standard reports in one call: overview, daily trend, demographics (age, gender, age × gender, interests, language, new vs returning), geography (country, region, city), technology, acquisition (channel, source/medium, campaign, first-user channel), content (landing pages, pages, events) and timing (weekday, hour, weekday × hour), plus highlights and next steps. Cached 10 min.', [id, date('startDate', '28daysAgo'), date('endDate', 'today'), { name: 'limit', in: 'query', required: false, description: 'Rows per breakdown (1–250).', schema: { type: 'integer', minimum: 1, maximum: 250, default: 50 } }, freshParam], { ...ok('Insights', { $ref: '#/components/schemas/Insights' }), 400: err('Invalid date.') }, { tags: ['Reports'] }) },
      '/properties/{id}/metadata': { get: op('getMetadata', 'Available data fields', 'Every dimension and metric the property supports, including custom definitions (custom: true). Use the apiName values in custom queries.', [id, freshParam], ok('Fields', { type: 'object', properties: { property: { $ref: '#/components/schemas/Property' }, dimensions: { type: 'array', items: { $ref: '#/components/schemas/Field' } }, metrics: { type: 'array', items: { $ref: '#/components/schemas/Field' } } } }), { tags: ['Reports'] }) },
      '/properties/{id}/report': { post: op('queryReport', 'Custom report', 'Any GA4 report query (runReport), e.g. demographics by country or item performance (itemId, itemName with itemsViewed, itemsPurchased, itemRevenue). Field names: GET /metadata or https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema', [id], { ...ok('Rows', { $ref: '#/components/schemas/QueryResult' }), 400: err('Invalid query (e.g. unknown or incompatible fields).') }, { tags: ['Custom queries'], requestBody: queryBody(false) }) },
    },
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', description: 'The ANALYTICS_API_TOKEN deployment secret.' } },
      schemas: {
        Error: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
        Property: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, account: { type: 'string' }, collectingSince: { type: ['string', 'null'], format: 'date-time' } } },
        Field: { type: 'object', properties: { apiName: { type: 'string' }, uiName: { type: 'string' }, category: { type: 'string' }, custom: { type: 'boolean' }, description: { type: 'string' } } },
        Row: { type: 'object', description: 'Dimension values as strings, metrics as numbers, share (0–1) of the first metric.', additionalProperties: { oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'null' }] } },
        Section: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['ok', 'empty', 'error'] },
            rows: { type: 'array', items: { $ref: '#/components/schemas/Row' } },
            totals: { type: 'object', additionalProperties: { type: 'number' } },
            rowCount: { type: 'integer' },
            thresholded: { type: 'boolean', description: 'GA withheld rows below its privacy thresholds.' },
            note: { type: 'string', description: 'Why data is missing or limited.' },
            error: { type: 'string' },
          },
          required: ['status'],
        },
        Realtime: {
          type: 'object',
          properties: {
            property: { $ref: '#/components/schemas/Property' },
            generatedAt: { type: 'string', format: 'date-time' },
            summary: { type: 'object', properties: { activeUsers30Minutes: { type: 'integer' }, activeUsers5Minutes: { type: 'integer' }, eventCount: { type: 'integer' }, screenPageViews: { type: 'integer' }, keyEvents: { type: 'integer' }, topCountry: { type: ['string', 'null'] }, topCity: { type: ['string', 'null'] }, topDevice: { type: ['string', 'null'] }, topPage: { type: ['string', 'null'] } } },
            breakdowns: { type: 'object', description: 'perMinute, country, city, device, platform, page, event, audience', additionalProperties: { $ref: '#/components/schemas/Section' } },
          },
          example: { summary: { activeUsers30Minutes: 1, activeUsers5Minutes: 1, eventCount: 3, screenPageViews: 1, keyEvents: 0, topCountry: 'Austria', topCity: 'Salzburg', topDevice: 'desktop', topPage: 'Paznaun-Ischgl Fan Page · unofficial' } },
        },
        HistoryMetrics: { type: 'object', properties: { activeUserMinutes: { type: 'integer' }, eventCount: { type: 'integer' }, screenPageViews: { type: 'integer' }, keyEvents: { type: 'integer' } } },
        History: {
          type: 'object',
          properties: {
            property: { $ref: '#/components/schemas/Property' },
            range: { type: 'object', properties: { from: { type: 'string', format: 'date-time' }, to: { type: 'string', format: 'date-time' }, days: { type: 'integer' } } },
            collector: { type: 'object', properties: { intervalMinutes: { type: 'integer' }, collectingSince: { type: ['string', 'null'] }, lastRun: { type: ['string', 'null'] }, lastError: { type: 'string' }, retentionDays: { type: 'integer' } } },
            coverage: { type: 'object', properties: { minutesObserved: { type: 'integer' }, minutesInRange: { type: 'integer' } } },
            status: { type: 'string', enum: ['ok', 'empty'] },
            totals: { allOf: [{ $ref: '#/components/schemas/HistoryMetrics' }, { type: 'object', properties: { peakActiveUsers: { type: 'integer' } } }] },
            daily: { type: 'array', items: { type: 'object', properties: { date: { type: 'string', format: 'date' }, minutesObserved: { type: 'integer' }, peakActiveUsers: { type: 'integer' } } } },
            hourly: { type: 'array', items: { type: 'object', properties: { hour: { type: 'string', format: 'date-time' }, minutesObserved: { type: 'integer' }, peakActiveUsers: { type: 'integer' } } } },
            breakdowns: { type: 'object', description: 'country, city, device, platform, page, event — rows with the dimension plus HistoryMetrics and share.', additionalProperties: { type: 'array', items: { $ref: '#/components/schemas/Row' } } },
          },
          example: { status: 'ok', totals: { activeUserMinutes: 1, eventCount: 3, screenPageViews: 1, keyEvents: 0, peakActiveUsers: 1 }, breakdowns: { country: [{ country: 'Austria', activeUserMinutes: 1, eventCount: 3, screenPageViews: 1, keyEvents: 0, share: 1 }] } },
        },
        Insights: {
          type: 'object',
          properties: {
            property: { $ref: '#/components/schemas/Property' },
            dateRange: { type: 'object', properties: { startDate: { type: 'string' }, endDate: { type: 'string' } } },
            timeZone: { type: 'string' },
            dataAvailability: { type: 'object', properties: { standardReports: { type: 'string' }, demographics: { type: 'string', enum: ['ok', 'not yet'] } } },
            highlights: { type: 'object', description: 'Top values per area (topCountries, topCities, topAgeBrackets, gender, topAgeAndGender, topInterests, topLanguages, newVsReturning, topChannels, topSources, topCampaigns, topLandingPages, topDevices, busiestDays, busiestHours); areas without data are left out.', additionalProperties: { type: 'array', items: { type: 'object' } } },
            nextSteps: { type: 'array', items: { type: 'string' } },
            overview: { type: 'object', properties: { status: { type: 'string' }, metrics: { type: 'object', additionalProperties: { type: 'number' } }, note: { type: 'string' } } },
            trend: { $ref: '#/components/schemas/Section' },
            demographics: { type: 'object', description: 'age, gender, ageAndGender, interests, language, newVsReturning', additionalProperties: { $ref: '#/components/schemas/Section' } },
            geography: { type: 'object', description: 'country, region, city', additionalProperties: { $ref: '#/components/schemas/Section' } },
            technology: { type: 'object', description: 'device, operatingSystem, browser', additionalProperties: { $ref: '#/components/schemas/Section' } },
            acquisition: { type: 'object', description: 'channel, sourceMedium, campaign, firstUserChannel', additionalProperties: { $ref: '#/components/schemas/Section' } },
            content: { type: 'object', description: 'landingPage, page, event', additionalProperties: { $ref: '#/components/schemas/Section' } },
            timing: { type: 'object', description: 'dayOfWeek, hour, dayAndHour', additionalProperties: { $ref: '#/components/schemas/Section' } },
            quota: { type: 'object', description: 'Remaining GA API quota.', additionalProperties: { type: 'number' } },
          },
        },
        QueryResult: { type: 'object', properties: { property: { $ref: '#/components/schemas/Property' }, rows: { type: 'array', items: { $ref: '#/components/schemas/Row' } }, totals: { type: 'object' }, rowCount: { type: 'integer' }, metadata: { type: 'object', description: 'GA response metadata, e.g. subjectToThresholding.' }, quota: { type: 'object' } } },
      },
    },
  };
}

const DOCS_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Demand Radar analytics API</title>
  <link rel="stylesheet" href="${SWAGGER_UI}/swagger-ui.css" />
  <style>body { margin: 0; background: #fff; } .topbar { display: none; }</style>
</head>
<body>
  <div id="ui"></div>
  <script src="${SWAGGER_UI}/swagger-ui-bundle.js" crossorigin></script>
  <script>
    // openapi.json sits next to this page, also under a branch path and with a trailing slash.
    const spec = new URL('openapi.json', location.href.replace(/\\/docs\\/?([?#].*)?$/, '/'));
    SwaggerUIBundle({ url: spec.href, dom_id: '#ui', persistAuthorization: true, deepLinking: true, tryItOutEnabled: true });
  </script>
</body>
</html>
`;

// ---------- the module

export function createAnalytics({ token, dataDir, dataUrl, google, HttpError, connections, accessTokenFor, isEnabled = () => true, collectMs = 600_000, retentionDays = 180 }) {
  const digest = (s) => createHash('sha256').update(String(s)).digest();
  const expected = token ? digest(token) : null;

  function authorize(req) {
    if (!expected) throw new HttpError(503, 'The analytics API is disabled: the server has no ANALYTICS_API_TOKEN.');
    const m = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.authorization ?? '');
    if (!m || !timingSafeEqual(digest(m[1]), expected)) {
      const e = new HttpError(401, 'Missing or invalid bearer token (Authorization: Bearer <token>).');
      e.headers = { 'WWW-Authenticate': 'Bearer realm="analytics"' };
      throw e;
    }
    if (!isEnabled()) throw new HttpError(403, 'The analytics API is switched off. Switch it on in the dashboard: Integrations → Google Analytics → Analytics API.');
  }

  function property(id) {
    const list = connections();
    const c = id === 'default' ? list[0] : list.find((x) => x.property.id === id);
    if (!c) throw new HttpError(404, list.length ? `Property ${id} is not connected. See GET /api/v1/properties.` : 'No Google Analytics property is connected yet: connect one under Integrations in the dashboard.');
    return c.property;
  }

  // Google errors about the *Google* connection must not look like a bad bearer token.
  async function ga(propertyId, method, body) {
    let accessToken;
    try { accessToken = await accessTokenFor(propertyId); } catch (e) {
      if (e.status === 401 || e.status === 403) throw new HttpError(502, `Google Analytics connection: ${e.message}`);
      throw e;
    }
    try {
      return await google(`${dataUrl}/v1beta/properties/${encodeURIComponent(propertyId)}${method}`, body === undefined
        ? { headers: { Authorization: `Bearer ${accessToken}` } }
        : { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch (e) {
      if (e.status === 401 || e.status === 403) throw new HttpError(502, `Google Analytics: ${e.message}`);
      throw e;
    }
  }
  const runReport = (pid, body) => ga(pid, ':runReport', body);
  const runRealtime = (pid, body) => ga(pid, ':runRealtimeReport', body);

  // Short-lived cache so dashboards polling the API do not use up GA quota.
  const cache = new Map();
  function cached(key, ttl, fresh, fn) {
    const hit = cache.get(key);
    if (!fresh && hit && Date.now() - hit.at < ttl) return hit.value;
    const value = fn();
    cache.set(key, { at: Date.now(), value });
    value.catch(() => cache.delete(key));
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    return value;
  }

  /** Runs one report and describes it: ok | empty | error, with a note. */
  async function section(run, body, { note, primary, share = true }) {
    try {
      const res = await run(body);
      const flat = flatten(res);
      const metric = primary ?? body.metrics[0].name;
      const out = { status: flat.rows.length ? 'ok' : 'empty', ...flat };
      if (share && body.dimensions?.length) out.rows = withShare(flat.rows, metric, flat.totals?.[metric]);
      if (res.metadata?.subjectToThresholding) out.thresholded = true;
      if (res.metadata?.dataLossFromOtherRow) out.otherRowDataLoss = true;
      if (!flat.rows.length || out.thresholded) out.note = note;
      return { out, res };
    } catch (e) {
      return { out: { status: 'error', error: e.message, ...(note && { note }) } };
    }
  }

  // ---------- realtime snapshot

  async function realtimeSnapshot(prop) {
    const now = Date.now();
    const results = await pool(REALTIME, 4, ([, dims, mets, extra]) => section((b) => runRealtime(prop.id, b), {
      dimensions: dims.map((name) => ({ name })),
      metrics: mets.map((name) => ({ name })),
      ...(dims.length && { metricAggregations: ['TOTAL'], orderBys: desc(mets[0]), limit: 250 }),
      ...extra,
    }, { note: 'Nobody was active on the site in the last 30 minutes.', share: dims[0] !== 'minutesAgo' }));
    const out = {};
    REALTIME.forEach(([name], i) => { out[name] = results[i].out; });
    if (out.perMinute.rows) {
      out.perMinute.rows = out.perMinute.rows
        .map((r) => ({ minute: minuteKey(now - Number(r.minutesAgo) * 60_000), ...r }))
        .sort((a, b) => Number(b.minutesAgo) - Number(a.minutesAgo));
    }
    const t = out.totals.rows?.[0] ?? {};
    return {
      property: prop,
      source: 'GA4 Realtime API (last 30 minutes)',
      generatedAt: new Date(now).toISOString(),
      summary: {
        activeUsers30Minutes: t.activeUsers ?? 0,
        activeUsers5Minutes: out.last5Minutes.rows?.[0]?.activeUsers ?? 0,
        eventCount: t.eventCount ?? 0,
        screenPageViews: t.screenPageViews ?? 0,
        keyEvents: t.keyEvents ?? 0,
        topCountry: top(out.country, 'country'),
        topCity: top(out.city, 'city'),
        topDevice: top(out.device, 'deviceCategory'),
        topPage: top(out.page, 'unifiedScreenName'),
      },
      breakdowns: Object.fromEntries(Object.entries(out).filter(([k]) => !['totals', 'last5Minutes'].includes(k))),
      notes: ['Realtime has no demographics (age, gender, interests) and no traffic sources; see /insights.'],
    };
  }

  // ---------- insights (standard reports)

  async function insights(prop, start, end, limit) {
    const results = await pool(INSIGHTS, 4, ([s, , dims, mets, extra]) => section((b) => runReport(prop.id, b), {
      dateRanges: [{ startDate: start, endDate: end }],
      dimensions: dims.map((name) => ({ name })),
      metrics: mets.map((name) => ({ name })),
      ...(dims.length && { metricAggregations: ['TOTAL'], orderBys: desc(mets[0]), limit }),
      returnPropertyQuota: s === 'overview',
      ...extra,
    }, { note: s === 'demographics' ? DEMOGRAPHICS_NOTE : STANDARD_NOTE }));

    const sections = {};
    let meta = {}, quota;
    INSIGHTS.forEach(([s, name], i) => {
      const { out, res } = results[i];
      if (s === 'overview') {
        sections.overview = { status: out.status, ...(out.rows?.[0] ? { metrics: out.rows[0] } : {}), ...(out.note && { note: out.note }), ...(out.error && { error: out.error }) };
        meta = res?.metadata ?? {};
        quota = res?.propertyQuota;
      } else if (!name) sections[s] = out;
      else (sections[s] ??= {})[name] = out;
    });
    if (sections.overview.metrics && !sections.overview.metrics.activeUsers) {
      sections.overview.status = 'empty';
      sections.overview.note = STANDARD_NOTE;
    }

    const d = sections.demographics, g = sections.geography, a = sections.acquisition, c = sections.content, tm = sections.timing;
    const highlights = {
      topCountries: tops(g.country, 'country', 5),
      topCities: tops(g.city, 'city', 5, (r) => `${r.city}, ${r.country}`),
      topAgeBrackets: tops(d.age, 'userAgeBracket', 3),
      gender: tops(d.gender, 'userGender', 3),
      topAgeAndGender: tops(d.ageAndGender, 'userAgeBracket', 3, (r) => `${r.userGender} ${r.userAgeBracket}`, (r) => !isUnknown(r.userGender)),
      topInterests: tops(d.interests, 'brandingInterest', 10),
      topLanguages: tops(d.language, 'language', 3),
      newVsReturning: tops(d.newVsReturning, 'newVsReturning', 2),
      topChannels: tops(a.channel, 'sessionDefaultChannelGroup', 5),
      topSources: tops(a.sourceMedium, 'sessionSource', 5, (r) => `${r.sessionSource} / ${r.sessionMedium}`),
      topCampaigns: tops(a.campaign, 'sessionCampaignName', 5),
      topLandingPages: tops(c.landingPage, 'landingPage', 5),
      topDevices: tops(sections.technology.device, 'deviceCategory', 3),
      busiestDays: tops(tm.dayOfWeek, 'dayOfWeekName', 3, undefined, undefined, 'activeUsers'),
      busiestHours: tops(tm.hour, 'hour', 3, undefined, undefined, 'activeUsers'),
    };
    for (const [k, v] of Object.entries(highlights)) if (!v.length) delete highlights[k];

    const demographicsOk = [d.age, d.gender, d.ageAndGender, d.interests].some((x) => x.status === 'ok' && x.rows.some((r) => !isUnknown(Object.values(r)[0])));
    const nextSteps = [];
    if (sections.overview.status !== 'ok') nextSteps.push('Standard reports have no data for this range yet (normal for a property set up in the last 24–48 hours). Use GET /realtime and GET /history meanwhile.');
    if (!demographicsOk) nextSteps.push(`No demographic rows yet. ${DEMOGRAPHICS_NOTE}`);
    if (Object.values(d).some((x) => x.thresholded) || Object.values(g).some((x) => x.thresholded)) nextSteps.push('Some rows are withheld by GA privacy thresholds (thresholded: true). More traffic, a longer date range or the "Device-based" reporting identity (GA Admin → Reporting identity) reduce this.');
    if (a.campaign?.status === 'ok' && a.campaign.rows.every((r) => isUnknown(r.sessionCampaignName) || r.sessionCampaignName === '(direct)' || r.sessionCampaignName === '(organic)' || r.sessionCampaignName === '(referral)')) nextSteps.push('No tagged campaigns yet: add utm_source / utm_medium / utm_campaign to campaign links to compare them here.');

    return {
      property: prop,
      source: 'GA4 Data API (standard reports)',
      generatedAt: new Date().toISOString(),
      dateRange: { startDate: start, endDate: end },
      ...(meta.timeZone && { timeZone: meta.timeZone }),
      ...(meta.currencyCode && { currencyCode: meta.currencyCode }),
      dataAvailability: {
        standardReports: sections.overview.status,
        demographics: demographicsOk ? 'ok' : 'not yet',
      },
      highlights,
      nextSteps,
      ...sections,
      ...(quota && { quota: Object.fromEntries(Object.entries(quota).map(([k, v]) => [k, v?.remaining])) }),
    };
  }

  // ---------- realtime history (collector)

  const FILE = join(dataDir, 'analytics-history.json');
  /** { [propertyId]: { since, lastRun?, lastError?, minutes: { [iso]: Rec }, hours: { [iso]: Rec & { n, peak } } } }
   *  Rec = { total: [users, events, views, keyEvents], country: { name: [...] }, ... } */
  let hist = {};
  let writing = Promise.resolve();
  const persist = () => {
    writing = writing.then(async () => {
      await mkdir(dataDir, { recursive: true });
      const tmp = `${FILE}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(hist), { mode: 0o600 });
      await rename(tmp, FILE);
    }).catch((e) => console.error('could not save analytics history:', e.message));
    return writing;
  };
  async function loadHistory() {
    try { hist = JSON.parse(await readFile(FILE, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') console.error('analytics history unreadable, starting fresh:', e.message); hist = {}; }
  }

  const add = (a = [0, 0, 0, 0], b) => a.map((x, i) => x + (b[i] ?? 0));
  function fold(target, rec) {
    // rec is one minute, or an hour (with n minutes and its peak).
    target.n = (target.n ?? 0) + (rec.n ?? 1);
    target.peak = Math.max(target.peak ?? 0, rec.peak ?? rec.total?.[0] ?? 0);
    target.total = add(target.total, rec.total ?? []);
    for (const [g] of COLLECT) {
      if (!rec[g]) continue;
      const into = (target[g] ??= {});
      for (const [k, v] of Object.entries(rec[g])) into[k] = add(into[k], v);
    }
  }

  async function collectProperty(prop) {
    const h = (hist[prop.id] ??= { since: new Date().toISOString(), minutes: {}, hours: {} });
    const groups = [['total', [], RT_METRICS], ...COLLECT];
    const errors = [];
    await pool(groups, 3, async ([g, dims, mets]) => {
      const now = Date.now();
      let res;
      try {
        res = await runRealtime(prop.id, {
          dimensions: ['minutesAgo', ...dims].map((name) => ({ name })),
          metrics: mets.map((name) => ({ name })),
          limit: 10_000,
        });
      } catch (e) { errors.push(`${g}: ${e.message}`); return; }
      // Every minute in the window is observed, with or without rows. Minute 0
      // is still running and is picked up by the next run.
      const seen = {};
      for (let ago = 1; ago < 30; ago++) seen[minuteKey(now - ago * 60_000)] = g === 'total' ? [0, 0, 0, 0] : {};
      for (const r of res.rows ?? []) {
        const ago = Number(r.dimensionValues?.[0]?.value);
        const key = minuteKey(now - ago * 60_000);
        if (!(key in seen)) continue;
        const v = RT_METRICS.map((name) => Number(r.metricValues?.[mets.indexOf(name)]?.value ?? 0));
        if (g === 'total') seen[key] = v;
        else {
          const label = dims.map((_, i) => r.dimensionValues?.[i + 1]?.value || '(not set)').join(', ');
          seen[key][label] = add(seen[key][label], v);
        }
      }
      for (const [key, v] of Object.entries(seen)) (h.minutes[key] ??= {})[g] = v;
    });
    // Minutes that have left the 30-minute window are final: fold into hours.
    const cutoff = Date.now() - 31 * 60_000;
    for (const [key, rec] of Object.entries(h.minutes)) {
      if (Date.parse(key) >= cutoff) continue;
      if (rec.total) fold((h.hours[hourKey(key)] ??= {}), rec);
      delete h.minutes[key];
    }
    const oldest = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
    for (const key of Object.keys(h.hours)) if (key < oldest) delete h.hours[key];
    h.lastRun = new Date().toISOString();
    if (errors.length) h.lastError = errors.join('; '); else delete h.lastError;
  }

  let collecting = null;
  async function collect() {
    if (!isEnabled()) return;
    if (collecting) return collecting;
    collecting = (async () => {
      const props = connections().map((c) => c.property);
      for (const id of Object.keys(hist)) if (!props.some((p) => p.id === id)) hist[id].disconnected = true;
      for (const p of props) {
        if (hist[p.id]) delete hist[p.id].disconnected;
        await collectProperty(p).catch((e) => { (hist[p.id] ??= { since: new Date().toISOString(), minutes: {}, hours: {} }).lastError = e.message; });
      }
      if (props.length) await persist();
    })().finally(() => { collecting = null; });
    return collecting;
  }

  function history(prop, days) {
    const h = hist[prop.id];
    const to = Date.now();
    const from = to - days * 86_400_000;
    const fromHour = hourKey(new Date(from).toISOString());
    const hours = {};
    if (h) {
      for (const [k, v] of Object.entries(h.hours)) if (k >= fromHour) hours[k] = v;
      // Include the minutes not yet folded, so the newest data shows too.
      for (const [k, rec] of Object.entries(h.minutes)) if (rec.total) fold((hours[hourKey(k)] = structuredClone(hours[hourKey(k)] ?? {})), rec);
    }
    const all = {};
    for (const v of Object.values(hours)) fold(all, v);
    const metrics = (v = [0, 0, 0, 0]) => ({ activeUserMinutes: v[0], eventCount: v[1], screenPageViews: v[2], keyEvents: v[3] });
    const hourly = Object.keys(hours).sort().map((k) => ({ hour: k, minutesObserved: hours[k].n, peakActiveUsers: hours[k].peak, ...metrics(hours[k].total) }));
    const daily = {};
    for (const r of hourly) {
      const d = (daily[r.hour.slice(0, 10)] ??= { date: r.hour.slice(0, 10), minutesObserved: 0, peakActiveUsers: 0, activeUserMinutes: 0, eventCount: 0, screenPageViews: 0, keyEvents: 0 });
      d.minutesObserved += r.minutesObserved;
      d.peakActiveUsers = Math.max(d.peakActiveUsers, r.peakActiveUsers);
      for (const m of ['activeUserMinutes', 'eventCount', 'screenPageViews', 'keyEvents']) d[m] += r[m];
    }
    const breakdown = (g) => {
      const sortBy = g === 'event' ? 'eventCount' : 'activeUserMinutes';
      const rows = Object.entries(all[g] ?? {}).map(([k, v]) => {
        const row = { [HIST_LABEL[g]]: k, ...metrics(v) };
        if (g === 'city') { const i = k.lastIndexOf(', '); Object.assign(row, { city: k.slice(0, i), country: k.slice(i + 2) }); delete row.unifiedScreenName; }
        return row;
      }).sort((a, b) => b[sortBy] - a[sortBy]);
      return withShare(rows, sortBy);
    };
    const totals = metrics(all.total);
    return {
      property: prop,
      source: 'Realtime reports collected by this server',
      generatedAt: new Date(to).toISOString(),
      range: { from: new Date(from).toISOString(), to: new Date(to).toISOString(), days },
      collector: {
        intervalMinutes: Math.round(collectMs / 60_000),
        collectingSince: h?.since ?? null,
        lastRun: h?.lastRun ?? null,
        ...(h?.lastError && { lastError: h.lastError }),
        retentionDays,
      },
      coverage: { minutesObserved: all.n ?? 0, minutesInRange: Math.round((to - Math.max(from, Date.parse(h?.since ?? new Date(to).toISOString()) - 30 * 60_000)) / 60_000) },
      status: totals.activeUserMinutes || totals.eventCount ? 'ok' : 'empty',
      note: HISTORY_NOTE,
      totals: { ...totals, peakActiveUsers: all.peak ?? 0 },
      daily: Object.values(daily),
      hourly,
      breakdowns: Object.fromEntries(COLLECT.map(([g]) => [g, breakdown(g)])),
    };
  }

  // ---------- passthrough queries

  function reportBody(body, realtime) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Send a GA Data API request body as JSON.');
    const out = { ...body };
    out.dimensions = asList(body.dimensions, 'name') ?? [];
    out.metrics = asList(body.metrics, 'name');
    if (!out.metrics?.length) throw new HttpError(400, 'Add at least one metric, e.g. {"metrics":["activeUsers"]}.');
    if (!realtime) {
      out.dateRanges = body.dateRanges ?? [{ startDate: body.startDate ?? '28daysAgo', endDate: body.endDate ?? 'today' }];
      delete out.startDate; delete out.endDate;
      out.returnPropertyQuota = true;
    }
    return out;
  }
  async function query(prop, body, realtime) {
    const req = reportBody(body, realtime);
    const res = await (realtime ? runRealtime : runReport)(prop.id, req);
    return {
      property: prop,
      generatedAt: new Date().toISOString(),
      ...flatten(res),
      ...(res.metadata && { metadata: res.metadata }),
      ...(res.propertyQuota && { quota: Object.fromEntries(Object.entries(res.propertyQuota).map(([k, v]) => [k, v?.remaining])) }),
    };
  }

  async function metadata(prop) {
    const res = await ga(prop.id, '/metadata');
    const pick = (x) => ({ apiName: x.apiName, uiName: x.uiName, category: x.category, ...(x.customDefinition && { custom: true }), description: x.description });
    return { property: prop, dimensions: (res.dimensions ?? []).map(pick), metrics: (res.metrics ?? []).map(pick) };
  }

  // ---------- routes

  const q = (req) => new URL(req.url, 'http://x').searchParams;
  const fresh = (req) => ['1', 'true'].includes(q(req).get('fresh') ?? '');
  const prop = (m) => property(decodeURIComponent(m[1]));
  const guarded = (fn) => async (m, body, req) => { authorize(req); return fn(m, body, req); };

  const index = {
    name: 'Demand Radar analytics API',
    auth: 'Every endpoint below needs the header Authorization: Bearer <ANALYTICS_API_TOKEN>.',
    propertyId: 'A connected GA4 property id from /properties, or "default" for the first connected property.',
    endpoints: {
      'GET /api/v1/properties': 'Connected Google Analytics properties.',
      'GET /api/v1/properties/{id}/realtime': 'Last 30 minutes: active users, per-minute trend, country, city, device, platform, pages, events, audiences. Cached 30 s.',
      'GET /api/v1/properties/{id}/history?days=7': 'Realtime data collected by this server since the property was connected: daily, hourly, by country, city, device, platform, page, event.',
      'GET /api/v1/properties/{id}/insights?startDate=28daysAgo&endDate=today&limit=50': 'Standard reports: overview, trend, demographics (age, gender, age×gender, interests, language, new vs returning), geography (country, region, city), technology, acquisition (channel, source/medium, campaign), content (landing pages, pages, events), timing (weekday, hour, weekday×hour), highlights and next steps. Cached 10 min.',
      'GET /api/v1/properties/{id}/metadata': 'Every dimension and metric the property supports, including custom definitions.',
      'POST /api/v1/properties/{id}/report': 'Any GA4 runReport query, e.g. {"dimensions":["country","userAgeBracket"],"metrics":["activeUsers"],"startDate":"7daysAgo"}.',
      'POST /api/v1/properties/{id}/realtime': 'Any GA4 runRealtimeReport query, e.g. {"dimensions":["city"],"metrics":["activeUsers"]}.',
    },
    query: 'Add ?fresh=1 to skip the cache.',
    openapi: 'GET /api/v1/openapi.json (OpenAPI 3.1, public)',
    swagger: 'GET /api/v1/docs (Swagger UI, public; paste the token under Authorize)',
    docs: 'https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema',
  };

  // Absolute /api/v1 URL of this deployment, from the request (behind the ingress and Pangolin).
  function serverUrl(req) {
    const full = new URL(req.url, 'http://x').pathname;
    const prefix = full.slice(0, full.indexOf('/api/'));
    const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost').split(',')[0].trim();
    const local = /^(localhost|127\.|\[::1\])/.test(host);
    const proto = String(req.headers['x-forwarded-proto'] ?? (local ? 'http' : 'https')).split(',')[0].trim();
    return `${proto}://${host}${prefix}/api/v1`;
  }

  const routes = [
    ['GET', /^\/api\/v1\/?$/, () => ({ ...index, enabled: !!expected && isEnabled() })],
    ['GET', /^\/api\/v1\/openapi\.json$/, (_m, _b, req) => openapiSpec(serverUrl(req), retentionDays)],
    ['GET', /^\/api\/v1\/docs$/, () => ({ rawBody: DOCS_HTML, type: 'text/html; charset=utf-8' })],
    ['GET', /^\/api\/v1\/properties$/, guarded(() => ({ properties: connections().map((c) => ({ ...c.property, collectingSince: hist[c.property.id]?.since ?? null })) }))],
    ['GET', /^\/api\/v1\/properties\/([^/]+)\/realtime$/, guarded((m, _b, req) => {
      const p = prop(m);
      return cached(`rt:${p.id}`, 30_000, fresh(req), () => realtimeSnapshot(p));
    })],
    ['GET', /^\/api\/v1\/properties\/([^/]+)\/insights$/, guarded((m, _b, req) => {
      const p = prop(m);
      const s = q(req);
      const start = s.get('startDate') ?? '28daysAgo', end = s.get('endDate') ?? 'today';
      if (!DATE.test(start) || !DATE.test(end)) throw new HttpError(400, 'startDate / endDate: YYYY-MM-DD, today, yesterday or NdaysAgo.');
      const limit = Math.min(Math.max(Number(s.get('limit')) || 50, 1), 250);
      return cached(`in:${p.id}:${start}:${end}:${limit}`, 600_000, fresh(req), () => insights(p, start, end, limit));
    })],
    ['GET', /^\/api\/v1\/properties\/([^/]+)\/history$/, guarded((m, _b, req) => {
      const days = Math.min(Math.max(Number(q(req).get('days')) || 7, 1), retentionDays);
      return history(prop(m), days);
    })],
    ['GET', /^\/api\/v1\/properties\/([^/]+)\/metadata$/, guarded((m, _b, req) => {
      const p = prop(m);
      return cached(`md:${p.id}`, 3_600_000, fresh(req), () => metadata(p));
    })],
    ['POST', /^\/api\/v1\/properties\/([^/]+)\/report$/, guarded((m, body) => query(prop(m), body, false))],
    ['POST', /^\/api\/v1\/properties\/([^/]+)\/realtime$/, guarded((m, body) => query(prop(m), body, true))],
  ];

  let timer;
  return {
    routes,
    collect,
    tokenConfigured: !!expected,
    collectingSince: () => Object.values(hist).map((h) => h.since).sort()[0] ?? null,
    async start() {
      clearInterval(timer);
      await loadHistory();
      // First run shortly after start, then every collectMs (under 30 min so no minute is missed).
      const first = setTimeout(() => collect().catch((e) => console.error('analytics collect:', e.message)), 5_000);
      first.unref();
      timer = setInterval(() => collect().catch((e) => console.error('analytics collect:', e.message)), collectMs);
      timer.unref();
    },
    stop() { clearInterval(timer); return writing; },
  };
}

function top(sec, dim) {
  const r = sec?.rows?.find((x) => !isUnknown(x[dim]));
  return r ? r[dim] : null;
}
function tops(sec, dim, n, label = (r) => r[dim], keep = () => true, metric) {
  if (sec?.status !== 'ok') return [];
  let rows = sec.rows.filter((r) => !isUnknown(r[dim]) && keep(r));
  if (metric) rows = [...rows].sort((a, b) => b[metric] - a[metric]);
  return rows.slice(0, n).map((r) => {
    const { share } = r;
    const m = metric ?? Object.keys(r).find((k) => typeof r[k] === 'number' && k !== 'share');
    return { value: label(r), [m]: r[m], ...(share !== undefined && !metric && { share }) };
  });
}
