// Data sources and how they are combined into one day-by-day model.
// Every source is a small adapter; adding a new one (mobile network data,
// guest cards, prices, lift counts …) means adding an entry here and, if it
// adds a new kind of signal, a field on `Day`.

import partner from './partner/sample-tvb-feratel.json';
import openForecast from './open/forecast-day.json';
import openMonthly from './open/stays-month.json';
import openEvents from './open/events.json';
import openHolidays from './open/holidays.json';
import openWeather from './open/weather.json';
import type { Dataset, Day, MarketHoliday, SourceInfo, Weather } from './types';

export const MARKET_NAMES: Record<string, string> = {
  DE: 'Germany', NL: 'Netherlands', CH: 'Switzerland', AT: 'Austria', BE: 'Belgium', SE: 'Sweden', PL: 'Poland', CZ: 'Czechia',
};

// Illustrative guest mix until the Feratel nationality breakdown is connected.
export const MARKET_MIX: Record<string, number> = { DE: 0.46, NL: 0.12, CH: 0.08, AT: 0.07, BE: 0.05, SE: 0.04, PL: 0.03, CZ: 0.02 };

export const BASE_SOURCES: SourceInfo[] = [
  { id: 'stays', name: 'Overnight stays — actual, forecast, previous year', provider: 'TVB Paznaun-Ischgl / Feratel', answers: 'How many guests stayed, and how many do we expect?', status: 'sample', licence: 'Partner data (TTF Data Space)', update: 'daily', coverage: '244 days · 1 Jun 2026 – 30 Jan 2027' },
  { id: 'beds', name: 'Available bed capacity', provider: 'TVB Paznaun-Ischgl / Feratel', answers: 'How close are we to full?', status: 'sample', licence: 'Partner data (TTF Data Space)', update: 'daily', coverage: '88 days · 1 Nov 2026 – 27 Jan 2027' },
  { id: 'open-forecast', name: 'Open overnight-stay forecast (region Paznaun-Ischgl)', provider: 'JOANNEUM RESEARCH · TU Wien · Uni Klagenfurt · Austria Tourism', answers: 'Does an independent model expect the same?', status: 'snapshot', licence: 'Open data', update: 'monthly', url: 'https://naechtigungen.pol.joanneum.at/docs' },
  { id: 'monthly', name: 'Official monthly overnight stays since 2022', provider: 'Austria Tourism open data (via forecast API)', answers: 'Is the daily data consistent with official totals?', status: 'snapshot', licence: 'Open data', update: 'monthly', url: 'https://naechtigungen.pol.joanneum.at/docs' },
  { id: 'holidays', name: 'School and public holidays in our source markets', provider: 'OpenHolidays API', answers: 'Who is on holiday — and when?', status: 'snapshot', licence: 'ODbL', update: 'yearly', url: 'https://www.openholidaysapi.org/' },
  { id: 'weather', name: 'Weather in Ischgl — past and 16-day forecast', provider: 'Open-Meteo', answers: 'Did rain or fresh snow change plans?', status: 'snapshot', licence: 'CC BY 4.0', update: 'hourly', url: 'https://open-meteo.com/' },
  { id: 'events', name: 'Events in the region', provider: 'Open forecast model event list · TVB calendar', answers: 'Was there a reason to come?', status: 'snapshot', licence: 'Open data', update: 'when planned', url: 'https://naechtigungen.pol.joanneum.at/docs' },
  { id: 'mobile', name: 'Mobile network presence data', provider: 'e.g. Hutchison Drei / A1 (via TTF Data Space)', answers: 'How many day visitors and where do they come from?', status: 'planned', licence: 'Partner data', update: 'daily' },
  { id: 'guestcard', name: 'Guest card usage & guest nationality', provider: 'Feratel guest registration', answers: 'Which markets are behind a gap?', status: 'planned', licence: 'Partner data', update: 'daily' },
  { id: 'prices', name: 'Availability and prices of partner hotels', provider: 'e.g. Lux Active / channel manager', answers: 'Are we too expensive on weak days?', status: 'planned', licence: 'Partner data', update: 'daily' },
  { id: 'lifts', name: 'Lift openings and skier counts', provider: 'Silvrettaseilbahn AG', answers: 'Did the slopes open on time?', status: 'planned', licence: 'Partner data', update: 'daily' },
];

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

function holidayIndex(rows: typeof openHolidays.rows) {
  // coverage = regions on holiday / regions the market ever lists for school holidays
  const regionsPerMarket: Record<string, Set<string>> = {};
  for (const h of rows) if (h.type === 'school' && h.regions) for (const r of h.regions) (regionsPerMarket[h.market] ||= new Set()).add(r);
  return (date: string): MarketHoliday[] => {
    const byMarket: Record<string, { name: string; regions: Set<string>; nationwide: boolean }> = {};
    for (const h of rows) {
      if (h.start > date || h.end < date) continue;
      const m = (byMarket[h.market] ||= { name: h.name ?? '', regions: new Set(), nationwide: false });
      if (!h.regions) { m.nationwide = true; m.name = h.name ?? m.name; } else { h.regions.forEach((r: string) => m.regions.add(r)); if (!m.name) m.name = h.name ?? ''; }
    }
    return Object.entries(byMarket).map(([market, m]) => ({
      market, name: m.name,
      coverage: m.nationwide ? 1 : Math.min(1, m.regions.size / Math.max(1, regionsPerMarket[market]?.size || 1)),
    }));
  };
}

export interface PartnerFile {
  today: string;
  stays: { rows: [string, number | null, number | null, number | null][] };
  beds: { rows: [string, number | null][] };
  sample?: boolean;
  provider?: string;
}

export const SAMPLE = partner as unknown as PartnerFile;

export function buildDataset(p: PartnerFile = SAMPLE, overrides: { openForecast?: [string, number][]; weather?: (string | number)[][]; retrieved?: Record<string, string>; uploaded?: string } = {}): Dataset {
  const fc = new Map((overrides.openForecast ?? (openForecast.rows as [string, number][])).map(([d, v]) => [d, v]));
  const wx = new Map((overrides.weather ?? openWeather.rows).map((r) => [r[0] as string, r]));
  const ev = new Map<string, string[]>();
  for (const [d, name] of openEvents.rows as [string, string][]) (ev.get(d) ?? ev.set(d, []).get(d)!).push(name);
  const beds = new Map(p.beds.rows);
  const hol = holidayIndex(openHolidays.rows);

  const days: Day[] = p.stays.rows.map(([date, actual, forecast, py]) => {
    const w = wx.get(date);
    const weather: Weather | null = w ? { precip: Number(w[1]), snow: Number(w[2]), tmax: Number(w[3]), tmin: Number(w[4]), sun: Number(w[5]), isForecast: !!w[6] } : null;
    const b = beds.has(date) ? beds.get(date)! : null;
    const flags: Day['flags'] = [];
    const f = forecast ?? fc.get(date) ?? null;
    if (actual === 0 && (f ?? 0) > 200) flags.push('zero-stays');
    if (beds.has(date) && b == null) flags.push('missing-beds');
    return {
      date, actual: date < p.today ? actual : null, forecast, openForecast: fc.get(date) ?? null, previousYear: py, beds: b,
      weather, holidays: hol(date), events: ev.get(date) ?? [], flags,
    };
  });

  const r = overrides.retrieved ?? {};
  const sources = BASE_SOURCES.map((s) => {
    if (s.id === 'stays' || s.id === 'beds') return overrides.uploaded ? { ...s, status: 'connected' as const, provider: `${s.provider} — ${overrides.uploaded}` } : s;
    if (s.id === 'open-forecast') return { ...s, status: r.forecast ? 'live' as const : s.status, retrieved: r.forecast ?? openForecast.retrieved };
    if (s.id === 'weather') return { ...s, status: r.weather ? 'live' as const : s.status, retrieved: r.weather ?? openWeather.retrieved };
    if (s.id === 'holidays') return { ...s, retrieved: openHolidays.retrieved };
    if (s.id === 'monthly') return { ...s, retrieved: openMonthly.retrieved };
    if (s.id === 'events') return { ...s, retrieved: openEvents.retrieved };
    return s;
  });

  return { today: p.today, days, sources, marketMix: MARKET_MIX, sampleData: !overrides.uploaded && !!p.sample };
}

// The monthly series is official statistics up to the last published month;
// later months in the same API are model values. Statistics Austria publishes
// with a delay of about two months.
export const OFFICIAL_UNTIL = '2026-08';
export const officialMonthly: [string, number][] = (openMonthly.rows as [string, number][]).filter(([m]) => m <= OFFICIAL_UNTIL);

/** Refresh the open sources live in the browser (CORS-enabled APIs). */
export async function refreshOpenData(): Promise<{ openForecast?: [string, number][]; weather?: (string | number)[][]; retrieved: Record<string, string> }> {
  const retrieved: Record<string, string> = {};
  const out: { openForecast?: [string, number][]; weather?: (string | number)[][]; retrieved: Record<string, string> } = { retrieved };
  const timeout = (ms: number) => { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };
  await Promise.allSettled([
    fetch('https://naechtigungen.pol.joanneum.at/v1/forecast/day/?region=TR53&min_date=2026-06-01&max_date=2027-01-30&limit=1000', { signal: timeout(8000) })
      .then((r) => r.json()).then((d) => {
        if (d.forecast_data?.length > 200) { out.openForecast = d.forecast_data.map((x: { date: string; stays: number }) => [x.date, Math.round(x.stays)]); retrieved.forecast = new Date().toISOString(); }
      }),
    fetch('https://api.open-meteo.com/v1/forecast?latitude=47.0127&longitude=10.2917&elevation=1377&past_days=10&forecast_days=16&daily=precipitation_sum,snowfall_sum,temperature_2m_max,temperature_2m_min,sunshine_duration&timezone=Europe%2FVienna', { signal: timeout(8000) })
      .then((r) => r.json()).then((d) => {
        const today = new Date().toISOString().slice(0, 10);
        const merged = new Map(openWeather.rows.map((x) => [x[0] as string, x]));
        d.daily.time.forEach((t: string, i: number) => merged.set(t, [t, d.daily.precipitation_sum[i], d.daily.snowfall_sum[i], d.daily.temperature_2m_max[i], d.daily.temperature_2m_min[i], Math.round((d.daily.sunshine_duration[i] ?? 0) / 360) / 10, t >= today ? 1 : 0]));
        out.weather = [...merged.values()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
        retrieved.weather = new Date().toISOString();
      }),
  ]);
  return out;
}

/** Parse a partner CSV export: date;actual;forecast;previous_year;beds (any order, ; or ,). */
export function parsePartnerCsv(text: string, base: PartnerFile): PartnerFile {
  const lines = text.trim().split(/\r?\n/);
  const sep = lines[0].includes(';') ? ';' : ',';
  const head = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/["\s]/g, '_'));
  const col = (names: string[]) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const iDate = col(['date', 'datum', 'tag']);
  const iAct = col(['actual', 'ist', 'nächtigungen', 'naechtigungen', 'stays']);
  const iFc = col(['forecast', 'prognose']);
  const iPy = col(['previous', 'vorjahr', 'py']);
  const iBeds = col(['beds', 'betten', 'capacity', 'kapazität']);
  if (iDate < 0) throw new Error('No date column found (expected "date" or "Datum").');
  const num = (v?: string) => { if (v == null || v.trim() === '') return null; const n = Number(v.replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
  const norm = (d: string) => { const t = d.trim().replace(/"/g, ''); const m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : t.slice(0, 10); };
  const stays = new Map(base.stays.rows.map((r) => [r[0], [...r] as [string, number | null, number | null, number | null]]));
  const beds = new Map(base.beds.rows);
  for (const line of lines.slice(1)) {
    const c = line.split(sep);
    const d = norm(c[iDate] ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const row = stays.get(d) ?? [d, null, null, null];
    if (iAct >= 0) row[1] = num(c[iAct]);
    if (iFc >= 0) row[2] = num(c[iFc]);
    if (iPy >= 0) row[3] = num(c[iPy]);
    stays.set(d, row);
    if (iBeds >= 0) beds.set(d, num(c[iBeds]));
  }
  return { ...base, sample: false, stays: { rows: [...stays.values()].sort((a, b) => a[0].localeCompare(b[0])) }, beds: { rows: [...beds.entries()].sort((a, b) => a[0].localeCompare(b[0])) } };
}

export function toCsv(ds: Dataset): string {
  const head = 'date;actual;forecast;previous_year;beds';
  return [head, ...ds.days.map((d) => [d.date, d.actual ?? '', d.forecast ?? '', d.previousYear ?? '', d.beds ?? ''].join(';'))].join('\n');
}

export { addDays };
