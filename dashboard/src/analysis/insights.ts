// Turns the combined day-by-day model into findings a destination team can act
// on. Every finding carries what it is based on and how sure we are.

import type { Dataset, Day } from '../data/types';
import { MARKET_NAMES } from '../data/sources';
import { approx, daysBetween, range, signedPct, weekday, WEEKDAYS, shortDate } from './format';

export type Confidence = 'high' | 'medium' | 'low';
export interface Evidence { source: string; text: string }
export interface Reason { kind: 'data' | 'weather' | 'holidays' | 'event' | 'weekday' | 'forecast' | 'unknown'; title: string; detail: string; score: number; evidence: Evidence[] }

const MIN_FC = 300; // ignore tiny off-season days where percentages explode

// ------------------------------------------------------------------ accuracy
export interface Accuracy {
  daysCompared: number;
  mape: number; // mean absolute % error of the partner forecast
  bias: number; // mean signed error (actual vs forecast)
  byWeekday: { dow: number; bias: number; n: number }[];
  saturdayBias: number;
}

export function accuracy(ds: Dataset): Accuracy {
  const days = ds.days.filter((d) => d.actual != null && d.actual > 0 && (d.forecast ?? 0) > MIN_FC);
  const err = days.map((d) => (d.actual! - d.forecast!) / d.forecast!);
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const byWeekday = [1, 2, 3, 4, 5, 6, 0].map((dow) => {
    const e = days.filter((d) => weekday(d.date) === dow).map((d) => (d.actual! - d.forecast!) / d.forecast!);
    return { dow, bias: mean(e), n: e.length };
  });
  return { daysCompared: days.length, mape: mean(err.map(Math.abs)), bias: mean(err), byWeekday, saturdayBias: byWeekday.find((w) => w.dow === 6)?.bias ?? 0 };
}

/** The partner forecast, corrected for the systematic weekday pattern we measured. */
export function corrected(d: Day, acc: Accuracy) {
  if (d.forecast == null) return null;
  const w = acc.byWeekday.find((x) => x.dow === weekday(d.date));
  const adj = w && w.n >= 8 && Math.abs(w.bias) > 0.025 ? w.bias : 0;
  return d.forecast * (1 + adj);
}

// ------------------------------------------------------------------ deviations
export interface Episode {
  id: string;
  start: string;
  end: string;
  days: Day[];
  direction: 'above' | 'below' | 'gap';
  diff: number; // stays actual - forecast over the episode
  rel: number;
  reasons: Reason[];
  confidence: Confidence;
  headline: string;
}

function weightedHolidays(days: Day[], mix: Record<string, number>) {
  const per: Record<string, { name: string; weight: number; days: number }> = {};
  for (const d of days) for (const h of d.holidays) {
    const w = (mix[h.market] ?? 0) * h.coverage;
    if (w <= 0) continue;
    const p = (per[h.market] ||= { name: h.name, weight: 0, days: 0 });
    p.weight += w / days.length; p.days += 1;
  }
  return Object.entries(per).sort((a, b) => b[1].weight - a[1].weight);
}

function explain(ep: Omit<Episode, 'reasons' | 'confidence' | 'headline' | 'id'>, ds: Dataset, acc: Accuracy, allDays: Day[]): Reason[] {
  const reasons: Reason[] = [];
  const days = ep.days;
  if (ep.direction === 'gap') {
    reasons.push({ kind: 'data', title: 'Missing report, not missing guests', detail: `${days.length} day${days.length > 1 ? 's' : ''} report zero stays while the forecast expected about ${approx(days.reduce((a, d) => a + (d.forecast ?? 0), 0) / days.length)} a day and the days around look normal. Most likely a partner did not deliver data.`, score: 0.95, evidence: [{ source: 'TVB / Feratel', text: 'zero values in the stays data' }] });
    return reasons;
  }
  // weather: rain on the day or the day before
  const prev = (d: Day) => allDays.find((x) => x.date === shortPrev(d.date));
  const rainy = days.filter((d) => (d.weather?.precip ?? 0) >= 15 || (prev(d)?.weather?.precip ?? 0) >= 20);
  const snowy = days.filter((d) => (d.weather?.snow ?? 0) >= 10);
  if (ep.direction === 'below' && rainy.length) {
    const share = rainy.length / days.length;
    reasons.push({ kind: 'weather', title: 'Heavy rain', detail: `${rainy.length} of ${days.length} days had heavy rain in Ischgl (up to ${Math.max(...rainy.map((d) => d.weather?.precip ?? 0)).toFixed(0)} mm). Short-notice guests tend to stay away.`, score: 0.35 + 0.5 * share, evidence: rainy.slice(0, 3).map((d) => ({ source: 'Open-Meteo', text: `${shortDate(d.date)}: ${d.weather?.precip.toFixed(0)} mm` })) });
  }
  if (ep.direction === 'above' && snowy.length) {
    reasons.push({ kind: 'weather', title: 'Fresh snow', detail: `${snowy.length} day(s) with ${Math.max(...snowy.map((d) => d.weather?.snow ?? 0)).toFixed(0)} cm of fresh snow.`, score: 0.3 + 0.4 * (snowy.length / days.length), evidence: snowy.slice(0, 3).map((d) => ({ source: 'Open-Meteo', text: `${shortDate(d.date)}: ${d.weather?.snow.toFixed(0)} cm` })) });
  }
  // holidays in source markets
  const hol = weightedHolidays(days, ds.marketMix);
  if (hol.length) {
    const top = hol.slice(0, 3);
    const total = top.reduce((a, [, h]) => a + h.weight, 0);
    if (ep.direction === 'above' && total > 0.02) {
      reasons.push({ kind: 'holidays', title: `School holidays in ${top.map(([m]) => MARKET_NAMES[m] ?? m).join(', ')}`, detail: `${top.map(([m, h]) => `${MARKET_NAMES[m] ?? m} (${h.name}, ${h.days} of ${days.length} days)`).join('; ')}. These markets bring about ${Math.round(top.reduce((a, [m]) => a + (ds.marketMix[m] ?? 0), 0) * 100)}% of our guests.`, score: Math.min(0.9, 0.3 + total * 4), evidence: top.map(([m, h]) => ({ source: 'OpenHolidays', text: `${m}: ${h.name}` })) });
    }
  }
  // events
  const evDays = allDays.filter((d) => d.events.length && daysBetween(d.date, ep.start) <= 2 && daysBetween(ep.end, d.date) <= 2);
  if (evDays.length) reasons.push({ kind: 'event', title: evDays[0].events[0], detail: `Event on ${shortDate(evDays[0].date)}.`, score: ep.direction === 'above' ? 0.6 : 0.2, evidence: [{ source: 'Event list', text: `${shortDate(evDays[0].date)}: ${evDays[0].events.join(', ')}` }] });
  // systematic weekday pattern
  const sat = days.filter((d) => weekday(d.date) === 6).length;
  if (sat && sat / days.length >= 0.5 && Math.abs(acc.saturdayBias) > 0.03 && Math.sign(acc.saturdayBias) === (ep.direction === 'above' ? 1 : -1)) {
    reasons.push({ kind: 'weekday', title: 'The forecast is always off on Saturdays', detail: `Across ${acc.byWeekday.find((w) => w.dow === 6)?.n} Saturdays the actual stays were ${signedPct(acc.saturdayBias)} versus the forecast — a pattern, not a surprise.`, score: 0.55, evidence: [{ source: 'Forecast check', text: `Saturday bias ${signedPct(acc.saturdayBias)}` }] });
  }
  // the open model disagreed with the partner forecast
  const fcSum = days.reduce((a, d) => a + (d.forecast ?? 0), 0);
  const openSum = days.reduce((a, d) => a + (d.openForecast ?? 0), 0);
  const actSum = days.reduce((a, d) => a + (d.actual ?? 0), 0);
  if (openSum > 0 && Math.abs(actSum - openSum) < Math.abs(actSum - fcSum) * 0.6) {
    reasons.push({ kind: 'forecast', title: 'Our forecast was off, the open model was closer', detail: `The independent open forecast expected ${approx(openSum)} stays, closer to the ${approx(actSum)} that happened than our forecast (${approx(fcSum)}).`, score: 0.45, evidence: [{ source: 'Open forecast', text: `${approx(openSum)} vs ${approx(fcSum)}` }] });
  }
  if (!reasons.length || Math.max(...reasons.map((r) => r.score)) < 0.4) {
    reasons.push({ kind: 'unknown', title: 'No clear reason in the data we have', detail: 'Neither weather, holidays nor events explain this. Check bookings by channel and market, or price changes of partner hotels — data we can add next.', score: 0.25, evidence: [] });
  }
  return reasons.sort((a, b) => b.score - a.score);
}

const shortPrev = (iso: string) => new Date(Date.parse(`${iso}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);

export function episodes(ds: Dataset, acc: Accuracy): Episode[] {
  const past = ds.days.filter((d) => d.actual != null && (d.forecast ?? 0) > MIN_FC);
  const out: Episode[] = [];
  let cur: { dir: Episode['direction']; days: Day[] } | null = null;
  const flush = () => {
    if (!cur) return;
    const big = cur.dir === 'gap' || cur.days.length >= 2 || Math.abs((cur.days[0].actual! - cur.days[0].forecast!) / cur.days[0].forecast!) > 0.25;
    if (big) {
      const days = cur.days;
      const fc = days.reduce((a, d) => a + d.forecast!, 0), act = days.reduce((a, d) => a + d.actual!, 0);
      const base = { start: days[0].date, end: days[days.length - 1].date, days, direction: cur.dir, diff: act - fc, rel: (act - fc) / fc };
      const reasons = explain(base, ds, acc, ds.days);
      const top = reasons[0];
      const confidence: Confidence = top.score >= 0.7 ? 'high' : top.score >= 0.45 ? 'medium' : 'low';
      const what = cur.dir === 'gap' ? 'No stays reported' : `${signedPct(base.rel)} vs forecast`;
      out.push({ ...base, id: `${base.start}-${cur.dir}`, reasons, confidence, headline: `${range(base.start, base.end)}: ${what}` });
    }
    cur = null;
  };
  for (const d of past) {
    const rel = (d.actual! - d.forecast!) / d.forecast!;
    const dir: Episode['direction'] | null = d.flags.includes('zero-stays') ? 'gap' : rel > 0.1 ? 'above' : rel < -0.1 ? 'below' : null;
    const last = cur?.days[cur.days.length - 1];
    if (dir && cur && cur.dir === dir && last && daysBetween(last.date, d.date) <= 2) cur.days.push(d);
    else { flush(); if (dir) cur = { dir, days: [d] }; }
  }
  flush();
  return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

// ------------------------------------------------------------------ outlook
export interface CapacityDay { date: string; expected: number; beds: number; occupancy: number; low: number; high: number; weekend: boolean; flags: string[] }
export interface Window { start: string; end: string; forecast: number; previousYear: number; gap: number; rel: number; days: Day[] }

export function capacityOutlook(ds: Dataset, acc: Accuracy): CapacityDay[] {
  let lastBeds: number | null = null;
  return ds.days.filter((d) => d.date >= ds.today && d.forecast != null && (d.beds != null || d.flags.includes('missing-beds'))).map((d) => {
    const exp = corrected(d, acc)!;
    const unc = Math.max(0.04, acc.mape);
    // a missing bed number is estimated from the day before (and flagged)
    const beds = d.beds ?? lastBeds ?? exp;
    lastBeds = beds;
    return {
      date: d.date, expected: exp, beds, occupancy: exp / beds,
      low: (exp * (1 - unc)) / beds, high: (exp * (1 + unc)) / beds,
      weekend: [5, 6].includes(weekday(d.date)), flags: d.flags,
    };
  });
}

/** Future weeks where we expect fewer (or more) guests than last year. */
export function weeksVsLastYear(ds: Dataset, acc: Accuracy): Window[] {
  const fut = ds.days.filter((d) => d.date >= ds.today && d.forecast != null && d.previousYear != null);
  const out: Window[] = [];
  for (let i = 0; i < fut.length; i += 7) {
    const days = fut.slice(i, i + 7);
    const f = days.reduce((a, d) => a + (corrected(d, acc) ?? 0), 0), p = days.reduce((a, d) => a + d.previousYear!, 0);
    out.push({ start: days[0].date, end: days[days.length - 1].date, forecast: f, previousYear: p, gap: f - p, rel: p ? (f - p) / p : 0, days });
  }
  return out;
}

// ------------------------------------------------------------------ data quality
export interface Quality { score: number; items: { label: string; ok: boolean; detail: string }[] }
export function quality(ds: Dataset, acc: Accuracy): Quality {
  const past = ds.days.filter((d) => d.date < ds.today);
  const zero = ds.days.filter((d) => d.flags.includes('zero-stays'));
  const bedsMissing = ds.days.filter((d) => d.flags.includes('missing-beds'));
  const bedsDays = ds.days.filter((d) => d.beds != null).length;
  const reported = past.filter((d) => d.actual != null && !d.flags.includes('zero-stays')).length;
  const agree = ds.days.filter((d) => d.date >= ds.today && d.forecast && d.openForecast);
  const dis = agree.length ? agree.reduce((a, d) => a + Math.abs(d.forecast! - d.openForecast!) / Math.max(1, d.openForecast!), 0) / agree.length : 0;
  const items = [
    { label: 'Stays reported every day', ok: zero.length === 0, detail: zero.length ? `${zero.length} days report zero stays (${range(zero[0].date, zero[zero.length - 1].date)}) — treated as a data gap` : `${reported} of ${past.length} past days complete` },
    { label: 'Bed capacity complete', ok: bedsMissing.length === 0, detail: bedsMissing.length ? `${bedsMissing.length} day(s) without bed numbers (${bedsMissing.map((d) => shortDate(d.date)).join(', ')})` : `${bedsDays} days available` },
    { label: 'Forecast accuracy so far', ok: acc.mape < 0.1, detail: `typically off by ${Math.round(acc.mape * 100)}% per day over ${acc.daysCompared} days` },
    { label: 'Two forecasts agree', ok: dis < 0.06, detail: `our forecast and the open model differ by ${Math.round(dis * 100)}% on average for the coming days` },
    { label: 'History length', ok: false, detail: 'one season of daily data: enough for patterns, too short for trends — confidence is capped at “medium” for long-range advice' },
  ];
  const score = items.filter((i) => i.ok).length / items.length;
  return { score, items };
}

// ------------------------------------------------------------------ actions
export interface Action {
  id: string;
  type: 'fill' | 'steer' | 'forecast' | 'data';
  title: string;
  what: string;
  when: string;
  where: string;
  why: string;
  effect: number; // stays at stake
  leadDays: number; // days until it must be live
  feasibility: number; // 0..1
  confidence: Confidence;
  score: number;
  basedOn: string[];
}

const conf = (c: Confidence) => (c === 'high' ? 1 : c === 'medium' ? 0.65 : 0.35);

export function actions(ds: Dataset, acc: Accuracy, cap: CapacityDay[], weeks: Window[], eps: Episode[]): Action[] {
  const out: Action[] = [];
  // 1. Fill weeks that run behind last year
  for (const w of weeks.filter((x) => x.rel < -0.08 && x.previousYear > 20000).slice(0, 3)) {
    const lead = daysBetween(ds.today, w.start);
    const hol = weightedHolidays(w.days, ds.marketMix).filter(([, h]) => h.weight > 0.004).slice(0, 2);
    const markets = hol.map(([m]) => MARKET_NAMES[m] ?? m);
    const target = hol.length ? hol.map(([m, h]) => `${MARKET_NAMES[m] ?? m} (${h.name}, ${h.days} day${h.days > 1 ? 's' : ''})`).join(' and ') : 'Germany and the Netherlands (largest markets, no holidays then — short breaks)';
    const agree = w.days.every((d) => !d.openForecast || Math.abs((d.forecast! - d.openForecast) / d.openForecast) < 0.12);
    const c: Confidence = agree ? 'medium' : 'low';
    out.push({
      id: `fill-${w.start}`, type: 'fill',
      title: `Win back guests for ${range(w.start, w.end)}`,
      what: markets.length ? `Campaign around the holiday dates in ${markets.join(' and ')}: “early-season ski days” packages` : 'Short-break and ski-opening packages, early-booking price for 3+ nights',
      when: lead > 21 ? `Start now — ${lead} days lead time` : `Urgent — only ${lead} days left`,
      where: target,
      why: `We expect about ${approx(w.forecast)} stays, ${approx(Math.abs(w.gap))} fewer than last year (${signedPct(w.rel)}).`,
      effect: Math.abs(w.gap) * 0.3, leadDays: lead, feasibility: lead > 21 ? 0.85 : lead > 10 ? 0.55 : 0.25, confidence: c, score: 0,
      basedOn: ['TVB forecast vs previous year', 'OpenHolidays', ...(agree ? ['Open forecast agrees'] : ['Open forecast disagrees'])],
    });
  }
  // 2. Steer demand away from (nearly) full days
  const tight = cap.filter((c) => c.occupancy >= 0.85);
  const groups: CapacityDay[][] = [];
  for (const t of tight) { const g = groups[groups.length - 1]; if (g && daysBetween(g[g.length - 1].date, t.date) <= 1) g.push(t); else groups.push([t]); }
  for (const g of groups.slice(0, 3)) {
    const peak = g.reduce((a, b) => (b.occupancy > a.occupancy ? b : a));
    const lead = daysBetween(ds.today, g[0].date);
    const ramp = g[0].beds < 12000;
    out.push({
      id: `steer-${g[0].date}`, type: 'steer',
      title: `${range(g[0].date, g[g.length - 1].date)} is close to full`,
      what: ramp ? 'Ask partner hotels to open a few days earlier; promote Galtür, Kappl and See for the opening weekend' : 'Shift demand to the quieter days around it: “stay Sunday–Thursday” offers, minimum stay on peak nights, no paid ads for these dates',
      when: lead > 14 ? `Agree with partners this week (${lead} days ahead)` : `Now — ${lead} days ahead`,
      where: ramp ? 'Partner hotels and the side valleys' : 'All markets — pause ads for these dates',
      why: peak.occupancy > 1 ? `More guests want to come than there are beds: about ${approx(peak.expected)} for ${approx(peak.beds)} beds on ${shortDate(peak.date)} (${Math.round(peak.occupancy * 100)}%, range ${Math.round(peak.low * 100)}–${Math.round(peak.high * 100)}%). Guests will be turned away.` : `Expected ${Math.round(peak.occupancy * 100)}% of the ${approx(peak.beds)} beds open on ${shortDate(peak.date)} (range ${Math.round(peak.low * 100)}–${Math.round(peak.high * 100)}%).`,
      effect: g.reduce((a, c) => a + Math.max(0, c.expected * (1 + acc.mape) - c.beds * 0.95), 0) + g.length * 150,
      leadDays: lead, feasibility: ramp ? 0.6 : 0.8, confidence: peak.low >= 0.8 ? 'high' : 'medium', score: 0,
      basedOn: ['Bed capacity', 'TVB forecast (weekday-corrected)', 'Forecast accuracy so far'],
    });
  }
  // 3. Fix the systematic weekday error
  if (Math.abs(acc.saturdayBias) > 0.03) {
    out.push({
      id: 'forecast-saturday', type: 'forecast',
      title: 'Correct the forecast for Saturdays',
      what: `Add ${signedPct(acc.saturdayBias)} to Saturday forecasts until the model is retrained`,
      when: 'Before the next planning meeting', where: 'Forecast with Feratel',
      why: `On ${acc.byWeekday.find((w) => w.dow === 6)?.n} Saturdays this season, the actual stays were ${signedPct(acc.saturdayBias)} versus the forecast. Changeover days are under-forecast; capacity warnings on Saturdays come too late.`,
      effect: 400, leadDays: 30, feasibility: 0.95, confidence: 'high', score: 0, basedOn: ['Actual vs forecast, by weekday'],
    });
  }
  // 4. Data fixes
  const gap = eps.find((e) => e.direction === 'gap');
  if (gap) out.push({ id: 'data-gap', type: 'data', title: `Fill the reporting gap ${range(gap.start, gap.end)}`, what: 'Ask the reporting partner to re-send the guest registrations for these days', when: 'This week', where: 'Feratel / partner hotels', why: `${gap.days.length} days show zero stays. Until fixed, September looks ${approx(Math.abs(gap.diff))} stays weaker than it was — and next year's forecast learns from it.`, effect: Math.abs(gap.diff) * 0.2, leadDays: 30, feasibility: 0.9, confidence: 'high', score: 0, basedOn: ['Data quality check'] });
  const missingBeds = ds.days.filter((d) => d.flags.includes('missing-beds'));
  if (missingBeds.length) out.push({ id: 'data-beds', type: 'data', title: `Complete bed capacity for ${missingBeds.map((d) => shortDate(d.date)).join(', ')}`, what: 'Re-export the capacity report for the missing days', when: 'Before Christmas planning', where: 'Feratel', why: 'Without beds we cannot warn whether these days run full.', effect: 150, leadDays: 30, feasibility: 0.95, confidence: 'high', score: 0, basedOn: ['Data quality check'] });

  // rank: effect, lead time, feasibility, confidence
  const maxEffect = Math.max(...out.map((a) => a.effect), 1);
  for (const a of out) {
    const leadOk = a.leadDays >= 21 ? 1 : a.leadDays >= 7 ? 0.7 : 0.4;
    a.score = 0.4 * Math.sqrt(a.effect / maxEffect) + 0.15 * leadOk + 0.2 * a.feasibility + 0.25 * conf(a.confidence);
  }
  return out.sort((a, b) => b.score - a.score);
}

// ------------------------------------------------------------------ seasons
export interface SeasonSummary { label: string; start: string; end: string; actual: number; forecast: number; previousYear: number; complete: boolean }
export function seasons(ds: Dataset): SeasonSummary[] {
  const sum = (from: string, to: string, f: (d: Day) => number | null) => ds.days.filter((d) => d.date >= from && d.date <= to).reduce((a, d) => a + (f(d) ?? 0), 0);
  const def = [
    { label: 'Summer 2026', start: '2026-06-01', end: '2026-09-30' },
    { label: 'Autumn', start: '2026-10-01', end: '2026-11-30' },
    { label: 'Winter 2026/27 (to 30 Jan)', start: '2026-12-01', end: '2027-01-30' },
  ];
  return def.map((s) => ({ ...s, actual: sum(s.start, s.end, (d) => d.actual), forecast: sum(s.start, s.end, (d) => d.forecast), previousYear: sum(s.start, s.end, (d) => d.previousYear), complete: s.end < ds.today }));
}

export function weekdayName(dow: number) { return WEEKDAYS[dow]; }
