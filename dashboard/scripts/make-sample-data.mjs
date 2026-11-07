// Builds the SAMPLE partner dataset (TVB Paznaun-Ischgl / Feratel) until the
// real export from the TTF Data Space is loaded. Shape mirrors the challenge:
//   244 days of overnight stays (1 Jun 2026 – 30 Jan 2027): actual (until
//   yesterday), the partner forecast and the previous year,
//   88 days of bed capacity for the early winter (1 Nov 2026 – 27 Jan 2027).
// It is calibrated to REAL open data so the story is plausible:
//   - daily shape from the open overnight-stay forecast (region TR53),
//   - monthly totals of summer 2026 and of the previous year from the official
//     monthly statistics,
//   - deviations driven by the real Ischgl weather and real school holidays.
// Run: node scripts/make-sample-data.mjs
import { readFile, writeFile } from 'node:fs/promises';

const dir = new URL('../src/data/', import.meta.url);
const read = async (p) => JSON.parse(await readFile(new URL(p, dir), 'utf8'));
const forecast = await read('open/forecast-day.json');
const monthly = Object.fromEntries((await read('open/stays-month.json')).rows);
const weather = Object.fromEntries((await read('open/weather.json')).rows.map((r) => [r[0], r]));
const holidays = (await read('open/holidays.json')).rows;

const TODAY = '2026-11-07';
let seed = 20261107;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const noise = (a) => (rnd() * 2 - 1) * a;
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const inHoliday = (d, market, nameRe) => holidays.some((h) => h.market === market && h.type === 'school' && h.start <= d && h.end >= d && (!nameRe || nameRe.test(h.name)));

const days = forecast.rows.map(([date, stays]) => ({ date, base: stays }));

// ---- actual stays (until yesterday), with explainable effects
for (const r of days) {
  if (r.date >= TODAY) continue;
  let f = 1 + noise(0.035);
  const w = weather[r.date], wPrev = weather[addDays(r.date, -1)];
  const summer = r.date < '2026-10-01';
  if (summer && ((w && w[1] >= 15) || (wPrev && wPrev[1] >= 20))) f -= 0.11; // heavy rain: short-notice guests stay away
  if (inHoliday(r.date, 'NL', /autumn/i)) f += 0.16; // Dutch autumn holidays (partner market)
  if (inHoliday(r.date, 'BE', /all saints/i)) f += 0.12; // Belgian All Saints holidays (partner market)
  r.actual = r.base * f;
}
// calibrate summer months to the official monthly totals
for (const m of ['2026-06', '2026-07', '2026-08']) {
  const sel = days.filter((r) => r.date.startsWith(m));
  const sum = sel.reduce((a, r) => a + r.actual, 0);
  if (monthly[m]) sel.forEach((r) => { r.actual *= monthly[m] / sum; });
}
// a reporting gap: one partner did not deliver for three days
for (const d of ['2026-09-21', '2026-09-22', '2026-09-23']) days.find((r) => r.date === d).actual = 0;

// ---- previous year, same weekday, scaled to last year's official monthly totals
const pyMonth = (m) => `${Number(m.slice(0, 4)) - 1}${m.slice(4)}`;
for (const r of days) {
  let f = 1 + noise(0.05);
  if (r.date >= '2026-12-01' && r.date <= '2026-12-18') f += 0.16; // last year's early-December snow start
  r.py = r.base * f;
}
for (const m of [...new Set(days.map((r) => r.date.slice(0, 7)))]) {
  const sel = days.filter((r) => r.date.startsWith(m));
  const total = monthly[pyMonth(m)];
  const sum = sel.reduce((a, r) => a + r.py, 0);
  const full = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
  if (total) sel.forEach((r) => { r.py *= (total * (sel.length / full)) / sum; });
}

// ---- partner forecast: close to the open model, with its own errors
for (const r of days) {
  let f = 1 + noise(0.03);
  if (r.date >= '2026-12-01' && r.date <= '2026-12-20') f -= 0.04;
  r.fc = r.base * f;
}

// ---- bed capacity, early winter (88 days): hotels open step by step
const bedsOn = (d) => {
  if (d < '2026-11-20') return 3200;
  if (d < '2026-11-26') return 6400;
  if (d < '2026-11-30') return 8200; // opening weekend, many hotels still closed
  if (d < '2026-12-12') return 16500;
  return 23800;
};
const beds = [];
for (let i = 0; i < 88; i++) {
  const d = addDays('2026-11-01', i);
  beds.push([d, d === '2026-12-24' ? null : bedsOn(d) + Math.round(noise(120))]);
}

const out = {
  provider: 'TVB Paznaun-Ischgl / Feratel',
  sample: true,
  note: 'Sample data shaped like the challenge data. Replace with the TTF Data Space export (CSV upload in the dashboard).',
  today: TODAY,
  stays: { columns: ['date', 'actual', 'forecast', 'previous_year'], rows: days.map((r) => [r.date, r.actual == null ? null : Math.round(r.actual), Math.round(r.fc), Math.round(r.py)]) },
  beds: { columns: ['date', 'beds'], rows: beds },
};
await writeFile(new URL('partner/sample-tvb-feratel.json', dir), JSON.stringify(out));
console.log('sample partner data written:', out.stays.rows.length, 'days of stays,', beds.length, 'days of beds');
