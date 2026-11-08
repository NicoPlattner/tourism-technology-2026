import { ORIGIN_CODES, parseDemand, type DemandQuery } from './contracts';
import type { SourceMarket, TravelDates } from '../types';
export class DemandClient {
  private cache = new Map<string, {expires:number; result:DemandQuery}>();
  constructor(private endpoint:string, private fetcher:typeof fetch = fetch.bind(globalThis), private timeoutMs=10000) {}
  async query(market:SourceMarket, dates:TravelDates, snapshot=""):Promise<DemandQuery> {
    // The backend clips partially out-of-range queries. Reject them rather than showing partial totals as a full range.
    if (dates.start < '2024-01-01' || dates.end > '2027-12-31') throw new Error('Demand data covers 1 Jan 2024–31 Dec 2027. Choose dates within this range.');
    const key = `${snapshot}:${market}:${dates.start}:${dates.end}`;
    const hit = this.cache.get(key); if (hit && hit.expires > Date.now()) return hit.result;
    const url = new URL(this.endpoint);
    url.search = new URLSearchParams({destination:'PAZNAUN',origin:ORIGIN_CODES[market],start:dates.start,end:dates.end}).toString();
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(),this.timeoutMs);
    try {
      const response = await this.fetcher(url.toString(),{signal:controller.signal});
      if (!response.ok) throw new Error(response.status === 404 ? 'No demand data for this market and period.' : 'Demand data is unavailable. Please retry.');
      const result = parseDemand(await response.json(),market,dates);
      if (this.cache.size >= 64) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key,{result,expires:Date.now()+300000}); return result;
    } catch(error) {
      if (controller.signal.aborted) throw new Error('Demand data timed out. Please retry.');
      throw error;
    } finally { clearTimeout(timer); }
  }
}
