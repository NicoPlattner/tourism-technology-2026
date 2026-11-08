export interface DataSnapshot { key:string; snapshot?:string; generatedAt?:string; today?:string }
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
export function parseSnapshot(value:unknown):DataSnapshot {
  if(!object(value)||!object(value.freshness))return {key:'unversioned'};
  const raw=value.freshness;
  const text=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=120?v:undefined;
  const snapshot=text(raw.snapshot),generatedAt=text(raw.generated_at),today=text(raw.today);
  return {snapshot,generatedAt,today,key:[snapshot||'unversioned',generatedAt||'',today||''].join('|')};
}
