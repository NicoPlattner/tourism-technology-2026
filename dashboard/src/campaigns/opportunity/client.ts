import type { TravelDates } from '../types';
import { validTravelDates } from '../travelDates';
import type { ForecastDay,MarketAction } from './ranking';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const nonnegative=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
export function parseForecast(value:unknown,analysis:TravelDates):ForecastDay[] {
  if(!object(value)||!object(value.meta)||value.meta.destination!=='Paznaun-Ischgl'||!Array.isArray(value.daily))throw new Error('Daily forecast is unavailable or belongs to another destination.');
  const seen=new Set<string>();
  return value.daily.map(raw=>{
    if(!object(raw)||typeof raw.date!=='string'||!validTravelDates({start:raw.date,end:raw.date})||seen.has(raw.date))throw new Error('The daily forecast contains invalid or duplicate dates.');
    seen.add(raw.date);
    return {date:raw.date,forecast:nonnegative(raw.forecast_ours)?raw.forecast_ours:null,capacity:nonnegative(raw.capacity_est)?raw.capacity_est:null,
      reference:nonnegative(raw.forecast_official_tr53)?raw.forecast_official_tr53:null,capacityBasis:typeof raw.capacity_basis==='string'?raw.capacity_basis.slice(0,240):'Prior-year capacity estimate'};
  }).filter(row=>row.date>=analysis.start&&row.date<=analysis.end);
}
export function parseActions(value:unknown):MarketAction[] {
  if(!Array.isArray(value))throw new Error('Market opportunity evidence is unavailable.');
  return value.flatMap(raw=>{
    if(!object(raw)||raw.kind!=='win demand'||typeof raw.market_code!=='string'||typeof raw.from!=='string'||typeof raw.to!=='string'||!validTravelDates({start:raw.from,end:raw.to})||!nonnegative(raw.score)||!nonnegative(raw.days)||raw.days<1)return [];
    return [{marketCode:raw.market_code,start:raw.from,end:raw.to,score:raw.score,days:raw.days,note:typeof raw.note==='string'?raw.note.slice(0,400):'',
      holidayPart:nonnegative(raw.holiday_part_nights)?raw.holiday_part_nights:undefined,
      basePart:nonnegative(raw.base_part_nights)?raw.base_part_nights:undefined,
      reasonType:raw.reason_type==='holiday-driven'||raw.reason_type==='share-driven'?raw.reason_type:undefined,
      actionType:typeof raw.action_type==='string'?raw.action_type.slice(0,80):undefined,
      freeBlockDays:nonnegative(raw.free_block_days_max)?raw.free_block_days_max:undefined,
      reachDays:nonnegative(raw.reach_days)?raw.reach_days:undefined,
      launchOverdue:typeof raw.launch_overdue==='boolean'?raw.launch_overdue:undefined,
      asOf:typeof raw.as_of==='string'?raw.as_of:undefined,
    }];
  });
}
export class OpportunityClient {
  private cache=new Map<string,{expires:number;value:unknown}>();
  constructor(private base:string,private fetcher:typeof fetch=fetch.bind(globalThis),private timeoutMs=10000){}
  private async get(path:string,dates:TravelDates,snapshot:string):Promise<unknown>{
    const url=new URL(path,this.base);url.search=new URLSearchParams({start:dates.start,end:dates.end,...(path==='actions'?{limit:'500'}:{})}).toString();
    const cacheKey=`${snapshot}:${url.toString()}`;
    const hit=this.cache.get(cacheKey);if(hit&&hit.expires>Date.now())return hit.value;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    try{
      const response=await this.fetcher(url.toString(),{signal:controller.signal});
      if(!response.ok)throw new Error('Daily forecast or capacity data could not be loaded.');
      const value=await response.json();if(this.cache.size>=32)this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(cacheKey,{expires:Date.now()+300000,value});return value;
    }finally{clearTimeout(timer);}
  }
  async load(dates:TravelDates,snapshot=""){
    const [forecast,actions]=await Promise.allSettled([this.get('forecast',dates,snapshot).then(v=>parseForecast(v,dates)),this.get('actions',dates,snapshot).then(parseActions)]);
    if(forecast.status==='rejected')throw new Error('Insufficient daily forecast/capacity data. The analysis creative preview remains available.');
    return {forecast:forecast.value,actions:actions.status==='fulfilled'?actions.value:[],actionsAvailable:actions.status==='fulfilled'};
  }
}
