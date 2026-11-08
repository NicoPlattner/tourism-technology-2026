import { useEffect,useState } from 'react';
import { parseSnapshot,type DataSnapshot } from './freshness';
const endpoint=new URL('c04-api/meta',new URL(import.meta.env.BASE_URL,window.location.href)).toString();
export function useDataSnapshot(){
  const [snapshot,setSnapshot]=useState<DataSnapshot>({key:'loading'});
  useEffect(()=>{
    let active=true,sequence=0;
    async function refresh(){
      const request=++sequence,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
      try{
        const response=await fetch(endpoint,{signal:controller.signal,cache:'no-store'});
        if(!response.ok)throw new Error('Freshness unavailable');
        const next=parseSnapshot(await response.json());
        if(active&&request===sequence)setSnapshot(old=>old.key===next.key?old:next);
      }catch{
        // Older APIs or a temporary metadata outage must not block supported data queries.
        if(active&&request===sequence)setSnapshot(old=>old.key==='loading'?{key:'unversioned'}:old);
      }finally{clearTimeout(timer);}
    }
    refresh();
    const visible=()=>{if(document.visibilityState==='visible')void refresh();};
    const interval=setInterval(visible,60000);document.addEventListener('visibilitychange',visible);
    return()=>{active=false;clearInterval(interval);document.removeEventListener('visibilitychange',visible);};
  },[]);
  return snapshot;
}
