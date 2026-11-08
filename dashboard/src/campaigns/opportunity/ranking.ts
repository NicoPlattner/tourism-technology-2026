import type { SourceMarket, TravelDates } from '../types';
import { shiftDate } from '../mockCampaignData';
export interface ForecastDay { date:string; forecast:number|null; capacity:number|null; reference:number|null; capacityBasis:string }
export interface MarketAction {
  marketCode:string; start:string; end:string; days:number; score:number; note:string;
  holidayPart?:number;basePart?:number;reasonType?:'holiday-driven'|'share-driven';actionType?:string;freeBlockDays?:number;reachDays?:number;launchOverdue?:boolean;asOf?:string;
}
export interface TravelWindow extends TravelDates {
  days:3|5|7; occupancy:number; spareBedNights:number; forecastNights:number; score:number;
  marketEvidence:boolean; referenceGap:number; capacityBasis:string[]; notes:string[]; marketReasons?:string[];
}
export interface WindowEvidence {
  analysisStart:string; analysisEnd:string; start:string; end:string; days:3|5|7;
  estimatedOccupancy:number; spareBedNights:number; marketEvidence:boolean; awarenessBufferDays:number; leadOpportunityPassed:boolean;
}
export interface WindowRecommendation {
  status:'loading'|'ready'|'suggested'|'unavailable';suggestedDates?:TravelDates;timingAvailable?:boolean;window?:TravelWindow;message:string;explanation:string;
  leadOpportunityPassed?:boolean; awarenessStarted?:boolean;
}
// The API publishes Germany and Austria as origin regions, not country totals, in /actions.
export const ACTION_CODES:Record<SourceMarket,readonly string[]> = {
  DE:['DE','80','81','82','83','84','85','53','12'], AT:['AT','01','70','71','72','73','74','75','76','77'], NL:['25'], BE:['62'],
};
export function viennaToday(now = new Date()):string {
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Vienna',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function campaignSchedule(arrival:string, leadDays:number, awarenessDays:number, today:string) {
  const end = shiftDate(arrival,-leadDays), start = shiftDate(end,-awarenessDays);
  return { start,end,leadOpportunityPassed:end < today,awarenessStarted:start < today,
    postDates:[...new Set([0,Math.round(awarenessDays/2),awarenessDays])].map(offset=>shiftDate(start,offset)) };
}
export function awarenessBuffer(value:unknown):number {
  const parsed = Number(value ?? 7);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 30 ? parsed : 7;
}
export function rankWindows(input:{forecast:ForecastDay[];actions:MarketAction[];market:SourceMarket;analysis:TravelDates;averageStay:number|null;today:string;leadDays:number;awarenessDays:number;holidayWindows?:TravelDates[]}):TravelWindow[] {
  const {forecast,actions,market,analysis,averageStay,today}=input;
  const rows = new Map(forecast.map(day=>[day.date,day]));
  const applicable=actions.filter(action=>ACTION_CODES[market].includes(action.marketCode));
  // Scores already include backend holiday/baseline caps and current bookability; never boost them again.
  const opportunityOn=(date:string)=>{
    const byOrigin = new Map<string,MarketAction>();
    for(const action of applicable) if(action.start<=date && action.end>=date && (!byOrigin.has(action.marketCode) || action.days < byOrigin.get(action.marketCode)!.days)) byOrigin.set(action.marketCode,action);
    const rows = byOrigin.has(market) ? [byOrigin.get(market)!] : [...byOrigin.values()];
    return {score:rows.reduce((sum,a)=>{
      let score=a.score;
      if(input.holidayWindows && !input.holidayWindows.some(window=>window.start<=date&&window.end>=date)){
        // The action score can include holidays elsewhere in its merged block.
        // Retain only its weighted regular-demand contribution outside known calendar overlap.
        if(a.holidayPart!==undefined && a.basePart!==undefined){
          const combined=a.holidayPart+.3*a.basePart;
          score*=combined>0?.3*a.basePart/combined:0;
        }else if(a.reasonType==='holiday-driven')score=0;
      }
      return sum+score/((Date.parse(a.end)-Date.parse(a.start))/86400000+1);
    },0),rows};
  };
  const candidates:(TravelWindow & {marketScore:number})[]=[];
  for(let start=analysis.start;start<=analysis.end;start=shiftDate(start,1)){
    if(start<today)continue;
    for(const days of [3,5,7] as const){
      const end=shiftDate(start,days-1); if(end>analysis.end)continue;
      const slice=Array.from({length:days},(_,index)=>rows.get(shiftDate(start,index)));
      // Never infer occupancy from demand alone, or bridge a missing/unknown-capacity day.
      if(slice.some(day=>!day || day.forecast===null || day.capacity===null || day.capacity<=0 || day.forecast>=day.capacity))continue;
      const complete=slice as (ForecastDay & {forecast:number;capacity:number})[];
      const totalCapacity=complete.reduce((sum,day)=>sum+day.capacity,0);
      const totalForecast=complete.reduce((sum,day)=>sum+day.forecast,0);
      const opportunity=complete.map(day=>opportunityOn(day.date));
      candidates.push({start,end,days,occupancy:totalForecast/totalCapacity,spareBedNights:totalCapacity-totalForecast,forecastNights:totalForecast,
        referenceGap:complete.reduce((sum,day)=>sum+Math.max(0,(day.reference??day.forecast)-day.forecast),0)/totalCapacity,
        marketScore:opportunity.reduce((sum,day)=>sum+day.score,0)/days,marketEvidence:opportunity.some(day=>day.rows.length>0),score:0,
        capacityBasis:[...new Set(complete.map(day=>day.capacityBasis).filter(Boolean))],
        notes:[...new Set(opportunity.flatMap(day=>day.rows.map(row=>row.note)).filter(Boolean))],
        marketReasons:[...new Set(opportunity.flatMap(day=>day.rows.map(action=>{
          if(!action.reasonType)return '';
          const basis=action.reasonType==='holiday-driven'?'holiday-driven (calendar association, not proven cause)':'share-driven regular demand (no holiday trigger)';
          return `Origin ${action.marketCode}, broader block ${action.start}–${action.end}: ${basis}${action.actionType?`; ${action.actionType}`:''}${action.freeBlockDays!==undefined&&action.reachDays!==undefined?`; free block ${action.freeBlockDays}d / model reach ${action.reachDays}d (not stay length)`:''}${action.launchOverdue?'; original block launch overdue':''}.`.slice(0,240);
        })).filter(Boolean))].slice(0,3)});
    }
  }
  const maxMarket=Math.max(0,...candidates.map(c=>c.marketScore));
  const maxSpare=Math.max(1,...candidates.map(c=>c.spareBedNights/c.days));
  const preferred=Math.max(3,Math.min(7,averageStay ?? 5));
  for(const candidate of candidates){
    candidate.score=.65*(1-candidate.occupancy)+.15*(maxMarket?candidate.marketScore/maxMarket:0)+.10*(candidate.spareBedNights/candidate.days/maxSpare)+.05*(1-Math.abs(candidate.days-preferred)/7)+.05*Math.min(1,candidate.referenceGap);
  }
  return candidates.sort((a,b)=>{
    const lateA=campaignSchedule(a.start,input.leadDays,input.awarenessDays,today).leadOpportunityPassed;
    const lateB=campaignSchedule(b.start,input.leadDays,input.awarenessDays,today).leadOpportunityPassed;
    return Number(lateA)-Number(lateB) || b.score-a.score || a.start.localeCompare(b.start) || a.days-b.days;
  }).map(({marketScore:_marketScore,...window})=>window);
}
