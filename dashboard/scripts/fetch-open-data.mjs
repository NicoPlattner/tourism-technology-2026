// Fetches the open data the dashboard combines with the TVB/Feratel data and
// stores snapshots in src/data/open/. Run: node scripts/fetch-open-data.mjs
// The app also refreshes the forecast, weather and holidays live in the browser.
import { writeFile } from 'node:fs/promises';

const OUT = new URL('../src/data/open/', import.meta.url);
const UA = { 'User-Agent': 'paznaun-demand-radar (TTF Hackathon 2026)' };
const REGION = 'TR53'; // Paznaun - Ischgl in the overnight-stay forecast model
const FROM = '2026-06-01', TO = '2027-01-30'; // the 244 days of the challenge data
const ISCHGL = { lat: 47.0127, lon: 10.2917, elevation: 1377 };
const MARKETS = ['DE', 'NL', 'CH', 'BE', 'AT', 'SE', 'PL', 'CZ'];

const get = async (url, tries = 5) => {
  for (let i = 0; ; i++) {
    const r = await fetch(url, { headers: UA });
    if (r.ok) return r.json();
    if (r.status !== 429 || i >= tries) throw new Error(`${r.status} ${url}`);
    await new Promise((ok) => setTimeout(ok, 15000 * (i + 1))); // rate limited: back off
  }
};
const ONLY = process.argv[2]; // optional: "weather" to refresh only the weather
const save = (name, data) => writeFile(new URL(name, OUT), JSON.stringify({ retrieved: new Date().toISOString(), ...data }, null, 0));

if (!ONLY) {
// 1. Overnight-stay forecast (JOANNEUM RESEARCH, TU Wien, Uni Klagenfurt, Austria Tourism)
const day = await get(`https://naechtigungen.pol.joanneum.at/v1/forecast/day/?region=${REGION}&min_date=${FROM}&max_date=${TO}&limit=1000`);
await save('forecast-day.json', { source: 'naechtigungen.pol.joanneum.at', region: REGION, rows: day.forecast_data.map((r) => [r.date, Math.round(r.stays)]) });
const month = await get(`https://naechtigungen.pol.joanneum.at/v1/forecast/month/?region=${REGION}&limit=1000`);
await save('stays-month.json', { source: 'naechtigungen.pol.joanneum.at', region: REGION, rows: month.forecast_data.filter((r) => r.region === REGION && r.date >= '2022-05-01').map((r) => [r.date.slice(0, 7), Math.round(r.stays)]) });
const ev = await get('https://naechtigungen.pol.joanneum.at/v1/events/?limit=250000');
await save('events.json', { source: 'naechtigungen.pol.joanneum.at', rows: ev.forecast_data.filter((r) => r.region === REGION && r.events).map((r) => [r.date, r.events.replace(/^M_event_/, '')]) });

// 2. School and public holidays in the source markets (OpenHolidays API)
const holidays = [];
for (const c of MARKETS) {
  const qs = `countryIsoCode=${c}&languageIsoCode=EN&validFrom=2026-05-01&validTo=2027-03-31`;
  const [school, pub] = await Promise.all([get(`https://openholidaysapi.org/SchoolHolidays?${qs}`), get(`https://openholidaysapi.org/PublicHolidays?${qs}`)]);
  for (const h of school) holidays.push({ market: c, type: 'school', name: h.name?.[0]?.text, start: h.startDate, end: h.endDate, regions: h.nationwide ? null : (h.subdivisions || []).map((s) => s.shortName || s.code) });
  for (const h of pub) if (h.nationwide) holidays.push({ market: c, type: 'public', name: h.name?.[0]?.text, start: h.startDate, end: h.endDate, regions: null });
}
const subdivisions = {};
for (const c of ['DE', 'NL', 'CH', 'BE', 'AT']) {
  try { subdivisions[c] = (await get(`https://openholidaysapi.org/Subdivisions?countryIsoCode=${c}&languageIsoCode=EN`)).length; } catch { /* optional */ }
}
await save('holidays.json', { source: 'openholidaysapi.org', markets: MARKETS, subdivisions, rows: holidays });

}

// 3. Weather in Ischgl (Open-Meteo: archive + forecast)
const daily = 'precipitation_sum,snowfall_sum,temperature_2m_max,temperature_2m_min,sunshine_duration';
const today = new Date().toISOString().slice(0, 10);
const arch = await get(`https://archive-api.open-meteo.com/v1/archive?latitude=${ISCHGL.lat}&longitude=${ISCHGL.lon}&elevation=${ISCHGL.elevation}&start_date=${FROM}&end_date=${today}&daily=${daily}&timezone=Europe%2FVienna`);
const fc = await get(`https://api.open-meteo.com/v1/forecast?latitude=${ISCHGL.lat}&longitude=${ISCHGL.lon}&elevation=${ISCHGL.elevation}&past_days=10&forecast_days=16&daily=${daily}&timezone=Europe%2FVienna`);
const rows = {};
for (const src of [arch, fc]) {
  src.daily.time.forEach((t, i) => {
    const v = [src.daily.precipitation_sum[i], src.daily.snowfall_sum[i], src.daily.temperature_2m_max[i], src.daily.temperature_2m_min[i], Math.round((src.daily.sunshine_duration[i] ?? 0) / 360) / 10];
    if (v[0] != null) rows[t] = [t, ...v, src === fc && t >= today ? 1 : 0];
  });
}
await save('weather.json', { source: 'open-meteo.com', place: 'Ischgl', columns: ['date', 'precip_mm', 'snow_cm', 'tmax', 'tmin', 'sun_h', 'is_forecast'], rows: Object.values(rows).sort((a, b) => a[0].localeCompare(b[0])) });
console.log('open data snapshots written');
