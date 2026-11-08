import { test,expect } from '@playwright/test';
import { mockDemand,forecastFixture,demandFixture } from './helpers/demand';
const definition=(page:import('@playwright/test').Page,label:string)=>page.getByText(label,{exact:true}).locator('..').getByRole('definition');
test.beforeEach(async({page})=>{
 await mockDemand(page);
 await page.route('https://naechtigungen.pol.joanneum.at/**',r=>r.fulfill({json:{forecast_data:[]}}));
 await page.route('https://api.open-meteo.com/**',r=>r.fulfill({json:{daily:{time:[]}}}));
});
async function dates(page:import('@playwright/test').Page,start:string,end:string){
 await page.getByLabel('Travel start date',{exact:true}).fill(start);await page.getByLabel('Travel end date',{exact:true}).fill(end);
}
test('broad analysis selects a shorter country-aware window, recalculates promotion and transfers that window',async({page})=>{
 const requests:any[]=[];
 await page.route('**/c04-api/actions?**',route=>route.fulfill({json:[
  {kind:'win demand',market_code:'25',from:'2027-01-12',to:'2027-01-16',days:5,score:1000},
  {kind:'win demand',market_code:'62',from:'2027-01-02',to:'2027-01-06',days:5,score:1000},
 ]}));
 await page.route('**/api/marketing/generate-caption',route=>{
  const m=route.request().postDataJSON();requests.push(m);
  return route.fulfill({json:{source:'ai',assetId:m.candidateAssets[0].id,language:m.language,platform:m.platform.toLowerCase(),caption:'Januari in Paznaun: bergen, vrienden en tijd voor elkaar. Kom mee! 🏔️',hashtags:['#Ischgl','#Paznaun'],creativeReason:'Een winterse uitnodiging die bij de gekozen periode past.',campaignReasoning:'This five-day destination window has estimated occupancy of 50%, with capacity based on the prior year. The selected Dutch market has supporting action scores. A 14-day booking-lead proxy and seven-day awareness buffer guide promotion before arrival.'}});
 });
 await page.goto('./');await page.getByRole('button',{name:'Select Netherlands',exact:true}).click();
 await dates(page,'2027-01-01','2027-01-21');
 await expect(definition(page,'Recommended travel dates')).toHaveText('12 Jan 2027 – 16 Jan 2027');
 await expect(definition(page,'Analysis period')).toHaveText('1 Jan 2027 – 21 Jan 2027');
 await expect(definition(page,'Recommended campaign')).toHaveText('22 Dec 2026 – 29 Dec 2026');
 await expect(page.locator('.cp-window-reason')).toContainText('50% forecast occupancy');
 await expect(page.locator('.cp-heat-key')).toContainText('2027-01-01 – 2027-01-21');
 await page.getByRole('button',{name:'Regenerate',exact:true}).click();
 await expect(page.locator('.cp-caption-source')).toHaveText('AI generated');
 expect(requests[0].travelDates).toEqual({start:'2027-01-12',end:'2027-01-16'});
 expect(requests[0].tourismContext).toMatchObject({origin:'25',start:'2027-01-12',end:'2027-01-16'});
 expect(requests[0].opportunityEvidence).toMatchObject({analysisStart:'2027-01-01',analysisEnd:'2027-01-21',days:5,marketEvidence:true,awarenessBufferDays:7});
 await page.getByRole('button',{name:'Select Belgium',exact:true}).click();
 await expect(definition(page,'Recommended travel dates')).toHaveText('2 Jan 2027 – 6 Jan 2027');
 await page.getByRole('button',{name:'Select Netherlands',exact:true}).click();
 await expect(definition(page,'Recommended travel dates')).toHaveText('12 Jan 2027 – 16 Jan 2027');
 await page.screenshot({path:'test-results/recommended-travel-window.png',fullPage:true});
 await page.getByRole('button',{name:'Review & Schedule'}).click();
 await expect(page.locator('.am-campaign.is-open .am-objective')).toContainText('12 Jan 2027 – 16 Jan 2027');
 await expect(page.locator('.am-campaign.is-open .am-post').first()).toContainText('22 Dec 2026');
});
test('unknown capacity and past periods never become optimized travel dates; AI creative preview remains available',async({page})=>{
 await page.route('**/c04-api/forecast?**',route=>{
  const p=new URL(route.request().url()).searchParams;const f=forecastFixture(p.get('start')!,p.get('end')!);
  return route.fulfill({json:{...f,daily:f.daily.map(d=>({...d,capacity_est:null}))}});
 });
 await page.goto('./');
 await expect(definition(page,'Recommended travel dates')).toHaveText('No supported window');
 await expect(definition(page,'Recommended campaign')).toHaveText('—');
 await expect(page.getByRole('button',{name:'Review & Schedule'})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Regenerate',exact:true})).toBeEnabled();
 await expect(page.locator('.cp-window-status')).toContainText('Analysis-period creative preview only');
 await page.unroute('**/c04-api/forecast?**');
 await page.route('**/c04-api/forecast?**',route=>{const p=new URL(route.request().url()).searchParams;return route.fulfill({json:forecastFixture(p.get('start')!,p.get('end')!)});});
 await dates(page,'2026-10-01','2026-10-14');
 await expect(page.locator('.cp-window-status')).toContainText('No future travel dates');
 await expect(definition(page,'Recommended travel dates')).toHaveText('No supported window');
});
test('late forecast results cannot replace a newer recommendation; passed lead-time opportunity is flagged',async({page})=>{
 await page.route('**/c04-api/query?**',route=>{const p=new URL(route.request().url()).searchParams;return route.fulfill({json:demandFixture(p.get('origin')!,p.get('start')!,p.get('end')!,{lead:135})});});
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 await page.route('**/c04-api/forecast?**',async route=>{
  const p=new URL(route.request().url()).searchParams;
  if(p.get('start')==='2027-01-01')await gate;
  return route.fulfill({json:forecastFixture(p.get('start')!,p.get('end')!)});
 });
 await page.goto('./');await expect(page.locator('.cp-window-status')).toContainText('Booking lead-time opportunity has passed');
 await dates(page,'2027-01-01','2027-01-21');
 await expect(definition(page,'Recommended travel dates')).toHaveText('Finding a window…');
 await dates(page,'2027-04-01','2027-04-21');
 await expect(definition(page,'Recommended travel dates')).toHaveText('1 Apr 2027 – 5 Apr 2027');
 release();
 await expect(definition(page,'Recommended travel dates')).toHaveText('1 Apr 2027 – 5 Apr 2027');
});
