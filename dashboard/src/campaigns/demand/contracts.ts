import type { SourceMarket, TravelDates } from '../types';
export const ORIGIN_CODES: Record<SourceMarket, string> = { DE: 'DE', NL: '25', BE: '62', AT: 'AT' };
export interface DataField<T> { value: T; is_estimate: boolean; method: string; grade: 'A'|'B'|'C'|'D'; note?: string }
export interface DemandQuery {
  destination: string; origin: string; from: string; to: string;
  guests: DataField<number>; nights: DataField<number>; length_of_stay: DataField<number|null>;
  booking_lead_time: DataField<{median_days_ahead: number; book_by_for_half_of_first_arrivals: string}>;
  reasons: {
    push: DataField<{from:string; to:string; holidays:string; days:number; max_push_multiplier:number}[]>;
    pull: DataField<{destination_used:string; events:{date:string;event:string}[]; season_open_days:number; days:number;
      snow_depth_cm_mean:number|null; snow_is_typical_not_observed:boolean; easter_window_days:number; christmas_window_days:number}>;
  };
  sources: string[];
}
// Compact, bounded evidence sent to the caption service; no personal or raw booking records.
export interface TourismContext {
  source: 'c04-api'; destination: 'Paznaun-Ischgl'; origin: string; start: string; end: string;
  guestNights: number; guests: number; averageStayNights: number|null; leadTimeDays: number;
  demandGrade: string; leadTimeGrade: string; stayGrade: string; isEstimate: boolean;
  leadTimeMethod: string; stayMethod: string; reasons: string[];
}
const object = (v: unknown): v is Record<string,unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const nonnegative = (v:unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const text = (v:unknown, max=600): v is string => typeof v === 'string' && v.length <= max;
function field(v:unknown): v is DataField<unknown> {
  return object(v) && typeof v.is_estimate === 'boolean' && text(v.method) && ['A','B','C','D'].includes(String(v.grade));
}
export function parseDemand(value: unknown, market: SourceMarket, dates: TravelDates): DemandQuery {
  const fail = () => new Error('The demand API returned incomplete or mismatched data.');
  if (!object(value) || value.destination !== 'Paznaun-Ischgl' || value.origin !== ORIGIN_CODES[market] || value.from !== dates.start || value.to !== dates.end) throw fail();
  for (const name of ['guests','nights','length_of_stay','booking_lead_time']) if (!field(value[name])) throw fail();
  const guests = value.guests as DataField<unknown>, nights = value.nights as DataField<unknown>, stay = value.length_of_stay as DataField<unknown>, lead = value.booking_lead_time as DataField<unknown>;
  if (!nonnegative(guests.value) || !nonnegative(nights.value) || !(stay.value === null || nonnegative(stay.value)) || !object(lead.value) || !Number.isInteger(lead.value.median_days_ahead) || !nonnegative(lead.value.median_days_ahead) || lead.value.median_days_ahead > 730 || !text(lead.value.book_by_for_half_of_first_arrivals)) throw fail();
  if (!object(value.reasons) || !field(value.reasons.push) || !field(value.reasons.pull)) throw fail();
  const push = value.reasons.push.value, pull = value.reasons.pull.value;
  if (!Array.isArray(push) || push.length > 8 || push.some(p => !object(p) || !text(p.holidays) || !text(p.from) || !text(p.to) || !nonnegative(p.days) || !nonnegative(p.max_push_multiplier))) throw fail();
  if (!object(pull) || !text(pull.destination_used) || !Array.isArray(pull.events) || pull.events.length > 20 || pull.events.some(e => !object(e) || !text(e.event) || !text(e.date)) || !nonnegative(pull.days) || !nonnegative(pull.season_open_days) || !nonnegative(pull.easter_window_days) || !nonnegative(pull.christmas_window_days) || !(pull.snow_depth_cm_mean === null || nonnegative(pull.snow_depth_cm_mean)) || typeof pull.snow_is_typical_not_observed !== 'boolean' || !Array.isArray(value.sources) || !value.sources.every(source => text(source))) throw fail();
  return value as unknown as DemandQuery;
}
export function tourismContext(query: DemandQuery): TourismContext {
  const pull = query.reasons.pull.value;
  const reasons = [
    ...query.reasons.push.value.slice(0,2).map(p => `Origin holiday: ${p.holidays} (${p.from}–${p.to}); calendar association, not a proven cause.`),
    ...pull.events.slice(0,2).map(e => `Listed destination event: ${e.event} (${e.date}); verify before advertising.`),
    ...(pull.season_open_days > 0 ? [`Season calendar marks ${pull.season_open_days} of ${pull.days} selected days open; not a guarantee of conditions.`] : []),
    ...(pull.easter_window_days ? [`Easter window: ${pull.easter_window_days} selected days.`] : []),
    ...(pull.snow_depth_cm_mean !== null && pull.snow_is_typical_not_observed ? ['Snow information is a historical typical value, not current or promised conditions.'] : []),
  ].slice(0,5).map(reason => reason.slice(0,240));
  return { source:'c04-api', destination:'Paznaun-Ischgl', origin:query.origin, start:query.from, end:query.to,
    guestNights:query.nights.value, guests:query.guests.value, averageStayNights:query.length_of_stay.value,
    leadTimeDays:query.booking_lead_time.value.median_days_ahead,
    demandGrade:query.nights.grade, leadTimeGrade:query.booking_lead_time.grade, stayGrade:query.length_of_stay.grade,
    isEstimate:query.nights.is_estimate || query.length_of_stay.is_estimate || query.booking_lead_time.is_estimate,
    leadTimeMethod:query.booking_lead_time.method.slice(0,300), stayMethod:query.length_of_stay.method.slice(0,100), reasons };
}
export const HEAT_COLORS = ['#f8e5eb','#ecc0ce','#db819d','#bd123f','#790b2a'];
export function heatColor(nights: number|undefined): string {
  if (nights === undefined) return '#dce2e7';
  return HEAT_COLORS[nights < 1000 ? 0 : nights < 10000 ? 1 : nights < 50000 ? 2 : nights < 100000 ? 3 : 4];
}
