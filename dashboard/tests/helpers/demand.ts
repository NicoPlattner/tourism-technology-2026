import type { Page } from '@playwright/test';
export function demandFixture(origin='DE', start='2027-02-15', end='2027-02-21', overrides: {nights?:number;stay?:number|null;lead?:number;holiday?:string} = {}) {
  const field = <T>(value:T,method='API fixture estimate',grade='C') => ({value,is_estimate:true,method,grade});
  const lead = overrides.lead ?? ({DE:60,'25':14,'62':35,AT:21}[origin] || 60);
  const nights = overrides.nights ?? ({DE:61143,'25':41208,'62':7963,AT:5439}[origin] || 0);
  return {destination:'Paznaun-Ischgl',origin,from:start,to:end,guests:field(Math.round(nights/5)),nights:field(nights),
    length_of_stay:field(overrides.stay === undefined ? 5.2 : overrides.stay,'nights / guests'),
    booking_lead_time:field({median_days_ahead:lead,book_by_for_half_of_first_arrivals:'2026-10-03'},'TVB Paznaun arrival-month proxy','B'),
    reasons:{push:field(overrides.holiday ? [{from:start,to:end,holidays:overrides.holiday,days:7,max_push_multiplier:1.9}] : []),
      pull:field({destination_used:'Paznaun-Ischgl',events:[],season_open_days:7,days:7,snow_depth_cm_mean:74,snow_is_typical_not_observed:true,easter_window_days:0,christmas_window_days:0})},
    sources:['Statistik Austria (CC BY 4.0)','TVB Paznaun-Ischgl (TTF 2026 data licence)']};
}
export function forecastFixture(start:string,end:string,occupancy=.5) {
  const daily=[];
  for(let date=start;date<=end;date=new Date(Date.parse(date)+86400000).toISOString().slice(0,10)) daily.push({date,forecast_ours:1000*occupancy,capacity_est:1000,forecast_official_tr53:600,capacity_basis:'same weekday last year'});
  return {meta:{destination:'Paznaun-Ischgl'},daily};
}
export async function mockDemand(page:Page) {
  await page.route('**/c04-api/meta',route=>route.fulfill({json:{freshness:{snapshot:'test-snapshot-1',generated_at:'2026-11-08T08:52Z',today:'2026-11-08'}}}));
  await page.route('**/c04-api/forecast?**',route=>{
    const p=new URL(route.request().url()).searchParams;
    return route.fulfill({json:forecastFixture(p.get('start')!,p.get('end')!)});
  });
  await page.route('**/c04-api/actions?**',route=>route.fulfill({json:[]}));
  await page.route('**/c04-api/query?**', route => {
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill({json:demandFixture(params.get('origin')!,params.get('start')!,params.get('end')!)});
  });
}
