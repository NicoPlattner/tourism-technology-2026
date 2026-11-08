import { useEffect,useState } from 'react';
import type { SourceMarket,TravelDates } from '../types';
import type { DemandQuery } from '../demand/contracts';
import { DemandClient } from '../demand/client';
import { OpportunityClient } from './client';
import { awarenessBuffer,rankWindows,viennaToday,type TravelWindow } from './ranking';
const base=new URL('c04-api/',new URL(import.meta.env.BASE_URL,window.location.href)).toString();
const client=new OpportunityClient(base),demandClient=new DemandClient(new URL('query',base).toString());
export const AWARENESS_DAYS=awarenessBuffer(import.meta.env.VITE_CAMPAIGN_AWARENESS_DAYS);
export interface OpportunityState {key:string;status:'loading'|'ready'|'unavailable';window?:TravelWindow;query?:DemandQuery;message:string;actionsAvailable?:boolean}
export function useTravelOpportunity(market:SourceMarket,dates:TravelDates,analysisQuery:DemandQuery|undefined,retry:number){
  const today=viennaToday();
  const key=`${market}:${dates.start}:${dates.end}:${analysisQuery?.length_of_stay.value}:${analysisQuery?.booking_lead_time.value.median_days_ahead}:${today}`;
  const [state,setState]=useState<OpportunityState>({key:'',status:'loading',message:'Finding a travel window…'});
  useEffect(()=>{
    let active=true;setState({key,status:'loading',message:'Finding a travel window…'});
    if(!analysisQuery)return ()=>{active=false;};
    (async()=>{
      try{
        const data=await client.load(dates);
        const ranked=rankWindows({...data,market,analysis:dates,averageStay:analysisQuery.length_of_stay.value,today,leadDays:analysisQuery.booking_lead_time.value.median_days_ahead,awarenessDays:AWARENESS_DAYS});
        const window=ranked[0];
        if(!window){if(active)setState({key,status:'unavailable',message:dates.end<today?'No future travel dates remain in this analysis period.':'No eligible future 3-, 5- or 7-day window with complete forecast and spare-capacity estimates.'});return;}
        const query=await demandClient.query(market,{start:window.start,end:window.end});
        if(active)setState({key,status:'ready',window,query,actionsAvailable:data.actionsAvailable,message:''});
      }catch(error){if(active)setState({key,status:'unavailable',message:error instanceof Error?error.message:'Travel-window data is unavailable.'});}
    })();
    return ()=>{active=false;};
  },[key,retry]);
  return state.key===key?state:{key,status:'loading' as const,message:'Finding a travel window…'};
}
