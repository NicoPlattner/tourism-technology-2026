import { useEffect, useState } from 'react';
import { MARKETS, type SourceMarket, type TravelDates } from '../types';
import { DemandClient } from './client';
import type { DemandQuery } from './contracts';
const client = new DemandClient(new URL('c04-api/query',new URL(import.meta.env.BASE_URL,window.location.href)).toString());
export function useDemand(dates:TravelDates,snapshot="unversioned") {
  const key = `${snapshot}:${dates.start}:${dates.end}`;
  const [retry,setRetry] = useState(0);
  const [state,setState] = useState<{key:string; data:Partial<Record<SourceMarket,DemandQuery>>; errors:Partial<Record<SourceMarket,string>>; loading:boolean}>({key:'',data:{},errors:{},loading:true});
  useEffect(() => {
    let active = true;
    setState({key,data:{},errors:{},loading:true});
    if(snapshot === "loading")return ()=>{active=false;};
    const jobs = MARKETS.map(async market => {
      try {
        const query = await client.query(market.code,dates,snapshot);
        if (active) setState(old => ({...old,data:{...old.data,[market.code]:query}}));
      } catch(error) {
        if (active) setState(old => ({...old,errors:{...old.errors,[market.code]:error instanceof Error ? error.message : 'Demand data unavailable.'}}));
      }
    });
    Promise.allSettled(jobs).then(() => { if (active) setState(old => ({...old,loading:false})); });
    return () => { active = false; };
  },[key,retry]);
  const visible: Pick<typeof state,"data"|"errors"|"loading"> = state.key === key ? state : {data:{},errors:{},loading:true};
  return {...visible, retry:() => setRetry(n=>n+1)};
}
