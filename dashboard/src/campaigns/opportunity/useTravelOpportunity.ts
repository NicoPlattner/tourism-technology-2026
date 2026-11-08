import {suggestTravelDates} from "./suggestion";
import { useEffect,useState } from 'react';
import type { SourceMarket,TravelDates } from '../types';
import type { DemandQuery } from '../demand/contracts';
import { DemandClient } from '../demand/client';
import { OpportunityClient } from './client';
import { awarenessBuffer,rankWindows,viennaToday,type TravelWindow } from './ranking';
const base=new URL('c04-api/',new URL(import.meta.env.BASE_URL,window.location.href)).toString();
const client=new OpportunityClient(base),demandClient=new DemandClient(new URL('query',base).toString());
export const AWARENESS_DAYS=awarenessBuffer(import.meta.env.VITE_CAMPAIGN_AWARENESS_DAYS);
export interface OpportunityState {key:string;status:'loading'|'ready'|'suggested'|'unavailable';suggestedDates?:TravelDates;window?:TravelWindow;query?:DemandQuery;message:string;actionsAvailable?:boolean}
export function useTravelOpportunity(market:SourceMarket,dates:TravelDates,analysisQuery:DemandQuery|undefined,retry:number,snapshot="unversioned"){
  const today=viennaToday();
  const key=`${snapshot}:${market}:${dates.start}:${dates.end}:${analysisQuery?.length_of_stay.value}:${analysisQuery?.booking_lead_time.value.median_days_ahead}:${today}`;
  const [state,setState]=useState<OpportunityState>({key:'',status:'loading',message:'Finding a travel window…'});
  useEffect(()=>{
    let active=true;setState({key,status:'loading',message:'Finding a travel window…'});
    if(!analysisQuery)return ()=>{active=false;};
    async function suggest(){
      const suggestedDates=suggestTravelDates(dates,analysisQuery!.length_of_stay.value,today);
      if(!suggestedDates){if(active)setState({key,status:'unavailable',message:'No future travel dates remain in this analysis period.'});return;}
      try{
        const query=await demandClient.query(market,suggestedDates,snapshot);
        if(active)setState({key,status:'suggested',suggestedDates,query,message:'Suggested — could not be extracted from the data.'});
      }catch{
        if(active)setState({key,status:'suggested',suggestedDates,message:'Suggested — could not be extracted from the data. Timing data is unavailable.'});
      }
    }
    (async()=>{
      try{
        const data=await client.load(dates,snapshot);
        const ranked=rankWindows({...data,market,analysis:dates,averageStay:analysisQuery.length_of_stay.value,today,leadDays:analysisQuery.booking_lead_time.value.median_days_ahead,awarenessDays:AWARENESS_DAYS,holidayWindows:analysisQuery.reasons.push.value.map(reason=>({start:reason.from,end:reason.to}))});
        const window=ranked[0];
        if(!window){await suggest();return;}
        const query=await demandClient.query(market,{start:window.start,end:window.end},snapshot);
        if(active)setState({key,status:'ready',window,query,actionsAvailable:data.actionsAvailable,message:''});
      }catch{await suggest();}
    })();
    return ()=>{active=false;};
  },[key,retry]);
  return state.key===key?state:{key,status:'loading' as const,message:'Finding a travel window…'};
}
