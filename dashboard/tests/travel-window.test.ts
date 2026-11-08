import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankWindows,campaignSchedule,awarenessBuffer,viennaToday,type ForecastDay } from '../src/campaigns/opportunity/ranking';
import { parseForecast,parseActions,OpportunityClient } from '../src/campaigns/opportunity/client';
import { withTravelWindow } from '../src/campaigns/opportunity/recommendation';
import { MockCampaignDataProvider,shiftDate } from '../src/campaigns/mockCampaignData';
import { demandFixture,forecastFixture } from './helpers/demand';
import { parseDemand } from '../src/campaigns/demand/contracts';
import { creativeRequest } from '../src/campaigns/captions/creativeRequest';
import { normalizeMetadata } from '../src/campaigns/captions/contracts';
const analysis={start:'2027-01-01',end:'2027-01-14'};
const forecast=parseForecast(forecastFixture(analysis.start,analysis.end),analysis);
const input={forecast,analysis,actions:[],market:'NL' as const,averageStay:5.2,today:'2026-11-08',leadDays:19,awarenessDays:7};
test('rolling 3/5/7-day windows stay inside analysis, use lower occupancy and prefer duration near mean stay',()=>{
 const ranked=rankWindows(input);assert.equal(ranked[0].days,5);assert.equal(ranked[0].start,'2027-01-01');
 assert.deepEqual([...new Set(ranked.map(w=>w.days))].sort(),[3,5,7]);
 for(const w of ranked){assert.ok(w.start>=analysis.start&&w.end<=analysis.end);assert.equal((Date.parse(w.end)-Date.parse(w.start))/86400000+1,w.days);}
 const lower=forecast.map(d=>({...d,forecast:d.date>='2027-01-09'&&d.date<='2027-01-11'?100:800}));
 const best=rankWindows({...input,forecast:lower})[0];assert.equal(best.start,'2027-01-09');assert.equal(best.days,3);assert.equal(best.occupancy,.1);
});
test('unknown capacity, missing days, zero availability and past dates do not create optimal windows',()=>{
 assert.deepEqual(rankWindows({...input,forecast:forecast.map(d=>({...d,forecast:1,capacity:null}))}),[]);
 assert.deepEqual(rankWindows({...input,forecast:forecast.map(d=>({...d,forecast:1000}))}),[]);
 assert.deepEqual(rankWindows({...input,today:'2027-01-15'}),[]);
 const sparse=forecast.filter((_,i)=>i%3!==2);assert.deepEqual(rankWindows({...input,forecast:sparse}),[]);
 const future=rankWindows({...input,today:'2027-01-10'});assert.ok(future.every(w=>w.start>='2027-01-10'));
 assert.deepEqual(rankWindows({...input,analysis:{start:'2027-01-01',end:'2027-01-02'}}),[]);
});
test('country and constituent-region scores affect ranking without mixing origins',()=>{
 const regional:ForecastDay[]=[...forecast.slice(0,3),...forecast.slice(9,12)];
 const actions=[{marketCode:'25',start:'2027-01-10',end:'2027-01-12',days:3,score:100,note:''},{marketCode:'62',start:'2027-01-01',end:'2027-01-03',days:3,score:100,note:''},{marketCode:'80',start:'2027-01-10',end:'2027-01-12',days:3,score:90,note:''}];
 assert.equal(rankWindows({...input,forecast:regional,actions})[0].start,'2027-01-10');
 assert.equal(rankWindows({...input,forecast:regional,actions,market:'BE'})[0].start,'2027-01-01');
 assert.equal(rankWindows({...input,forecast:regional,actions,market:'DE'})[0].start,'2027-01-10');
 assert.equal(rankWindows({...input,forecast:regional,actions,market:'AT'})[0].marketEvidence,false);
});
test('scheduling uses awareness buffer before the booking median, flags missed opportunity and handles leap/year boundaries',()=>{
 const s=campaignSchedule('2027-02-15',135,7,'2026-11-08');
 assert.equal(s.start,'2026-09-26');assert.equal(s.end,'2026-10-03');assert.equal(s.leadOpportunityPassed,true);
 assert.deepEqual(s.postDates,['2026-09-26','2026-09-30','2026-10-03']);
 assert.equal(campaignSchedule('2028-03-01',1,0,'2028-02-29').end,'2028-02-29');
 assert.equal(campaignSchedule('2027-01-03',10,7,'2026-11-08').end,'2026-12-24');
 assert.equal(campaignSchedule('2027-02-15',10,7,'2027-02-01').awarenessStarted,true);
 assert.equal(campaignSchedule('2027-02-15',10,7,'2027-02-01').leadOpportunityPassed,false);
 assert.equal(awarenessBuffer('0'),0);assert.equal(awarenessBuffer('14'),14);assert.equal(awarenessBuffer('-1'),7);
 assert.equal(viennaToday(new Date('2026-11-08T23:30:00Z')),'2026-11-09');
});
test('window-specific country evidence, season and campaign timing reach AI; analysis stays separate',()=>{
 const provider=new MockCampaignDataProvider();const window=rankWindows(input)[0];
 const dates={start:window.start,end:window.end};const q=parseDemand(demandFixture('25',dates.start,dates.end,{lead:19,stay:4}),'NL',dates);
 const c=withTravelWindow(provider.getImmediateRecommendation('NL','custom',{ageMin:35,ageMax:44},analysis),q,'ready',{key:'test',status:'ready',window,query:q,message:''},'2026-11-08',14);
 assert.deepEqual(c.analysisPeriod,{...analysis,label:'Selected analysis period'});assert.equal(c.travel.start,window.start);assert.equal(c.travel.end,window.end);
 assert.equal(c.campaign.end,shiftDate(window.start,-19));assert.equal(c.campaign.start,shiftDate(window.start,-33));
 assert.equal(c.publishingDates.length,3);assert.match(c.publishingDates[0],/\+01:00$/);
 const m=normalizeMetadata(creativeRequest(c));assert.equal(m.opportunityEvidence?.analysisEnd,analysis.end);assert.equal(m.tourismContext?.end,window.end);
 assert.throws(()=>normalizeMetadata({...m,opportunityEvidence:{...m.opportunityEvidence!,end:analysis.end}}));
 const unavailable=withTravelWindow(c,q,'ready',{key:'test',status:'unavailable',message:'No capacity'},'2026-11-08',7);
 assert.equal(unavailable.windowRecommendation?.status,'unavailable');assert.equal(unavailable.captionMetadata.opportunityEvidence,undefined);
});
test('forecast/parser preserves missing capacity and drops unrelated action kinds; optional action failure still allows regional ranking',async()=>{
 const f=forecastFixture(analysis.start,analysis.end);f.daily[0].capacity_est=null as unknown as number;
 assert.equal(parseForecast(f,analysis)[0].capacity,null);
 assert.throws(()=>parseForecast({...f,daily:[f.daily[0],f.daily[0]]},analysis));
 assert.deepEqual(parseActions([{kind:'protect yield',score:100}]),[]);
 const client=new OpportunityClient('http://test.invalid/c04-api/',async url=>String(url).includes('/actions')?new Response('{}',{status:500}):new Response(JSON.stringify(f)));
 const loaded=await client.load(analysis);assert.equal(loaded.actionsAvailable,false);assert.ok(rankWindows({...input,...loaded}).length>0);
});

test('ranking prefers a remaining booking opportunity and campaign timestamps respect Vienna DST',()=>{
 const ranked=rankWindows({...input,today:'2026-12-25',leadDays:10});assert.ok(ranked[0].start>='2027-01-04');
 const dates={start:'2027-04-01',end:'2027-04-14'};const window=rankWindows({...input,analysis:dates,forecast:parseForecast(forecastFixture(dates.start,dates.end),dates)})[0];
 const q=parseDemand(demandFixture('25',window.start,window.end,{lead:3}),'NL',window);
 const base=new MockCampaignDataProvider().getImmediateRecommendation('NL','custom',{ageMin:35,ageMax:44},{start:'2027-02-01',end:dates.end});
 const c=withTravelWindow(base,q,'ready',{key:'test',status:'ready',window,query:q,message:''},'2026-11-08',7);
 assert.match(c.publishingDates[0],/2027-03-22T18:00:00\+01:00$/);assert.match(c.publishingDates[2],/2027-03-29T18:00:00\+02:00$/);
 assert.equal(c.captionMetadata.season,'spring');assert.equal(creativeRequest(c).candidateAssets![0].season,'spring');
});
