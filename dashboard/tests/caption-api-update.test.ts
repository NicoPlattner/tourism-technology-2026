import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSnapshot} from '../src/campaigns/demand/freshness';
import {DemandClient} from '../src/campaigns/demand/client';
import {OpportunityClient,parseActions,parseForecast} from '../src/campaigns/opportunity/client';
import {rankWindows} from '../src/campaigns/opportunity/ranking';
import {withTravelWindow} from '../src/campaigns/opportunity/recommendation';
import {MockCampaignDataProvider} from '../src/campaigns/mockCampaignData';
import {normalizeMetadata,metadataKey} from '../src/campaigns/captions/contracts';
import {creativeRequest} from '../src/campaigns/captions/creativeRequest';
import {demandFixture,forecastFixture} from './helpers/demand';
const dates={start:'2027-04-01',end:'2027-04-14'};
test('metadata cache identity follows served snapshot, generated time and backend date with legacy compatibility',()=>{
 assert.equal(parseSnapshot({origins:[]}).key,'unversioned');
 const a=parseSnapshot({freshness:{snapshot:'baked',generated_at:'2026-11-08T08:52Z',today:'2026-11-08'}});
 assert.notEqual(a.key,parseSnapshot({freshness:{snapshot:'new-snapshot',generated_at:'2026-11-08T08:52Z',today:'2026-11-08'}}).key);
 assert.notEqual(a.key,parseSnapshot({freshness:{snapshot:'baked',generated_at:'2026-11-08T10:52Z',today:'2026-11-08'}}).key);
 assert.notEqual(a.key,parseSnapshot({freshness:{snapshot:'baked',generated_at:'2026-11-08T08:52Z',today:'2026-11-09'}}).key);
});
test('snapshot changes invalidate both demand and opportunity caches',async()=>{
 let queries=0,forecast=0;
 const demand=new DemandClient('http://api.test/query',async()=>{queries++;return new Response(JSON.stringify(demandFixture('25',dates.start,dates.end)));});
 await demand.query('NL',dates,'v1');await demand.query('NL',dates,'v1');await demand.query('NL',dates,'v2');assert.equal(queries,2);
 const opportunity=new OpportunityClient('http://api.test/',async url=>{
  if(String(url).includes('/forecast')){forecast++;return new Response(JSON.stringify(forecastFixture(dates.start,dates.end)));}
  return new Response('[]');
 });
 await opportunity.load(dates,'v1');await opportunity.load(dates,'v1');await opportunity.load(dates,'v2');assert.equal(forecast,2);
});
test('new merged share-driven action semantics survive parsing and reach the actual AI evidence',async()=>{
 const actions=parseActions([{kind:'win demand',market_code:'25',from:dates.start,to:dates.end,days:10,score:1400,reason_type:'share-driven',action_type:'midweek offer',free_block_days_max:2,reach_days:7,launch_overdue:true,as_of:'2026-11-08'}]);
 assert.equal(actions[0].days,10);assert.equal(actions[0].reasonType,'share-driven');assert.equal(actions[0].launchOverdue,true);
 const forecast=parseForecast(forecastFixture(dates.start,dates.end),dates);
 const window=rankWindows({forecast,actions,market:'NL',analysis:dates,averageStay:5,today:'2026-11-08',leadDays:19,awarenessDays:7})[0];
 assert.match(window.marketReasons!.join(' '),/no holiday trigger/);assert.match(window.marketReasons!.join(' '),/not stay length/);
 const response=demandFixture('25',window.start,window.end);
 const query=await new DemandClient('http://api.test/query',async()=>new Response(JSON.stringify(response))).query('NL',window);
 const c=withTravelWindow(new MockCampaignDataProvider().getImmediateRecommendation('NL','custom',undefined,dates),query,'ready',{key:'test',status:'ready',window,query,message:''},'2026-11-08',7);
 const request=normalizeMetadata({...creativeRequest(c),sourceSnapshot:'v1'});
 assert.match(request.tourismContext!.reasons.join(' '),/share-driven/);
 assert.notEqual(metadataKey(request),metadataKey({...request,sourceSnapshot:'v2'}));
});

test('a merged action holiday component is not spread into dates without origin-calendar support',()=>{
 const forecast=parseForecast(forecastFixture(dates.start,dates.end),dates);
 const actions=parseActions([{kind:'win demand',market_code:'25',from:dates.start,to:dates.end,days:10,score:1000,reason_type:'holiday-driven',holiday_part_nights:1000,base_part_nights:10}]);
 const input={forecast,actions,market:'NL' as const,analysis:dates,averageStay:3,today:'2026-11-08',leadDays:19,awarenessDays:7};
 assert.equal(rankWindows(input)[0].start,'2027-04-01');
 const supported=rankWindows({...input,holidayWindows:[{start:'2027-04-12',end:'2027-04-14'}]});
 assert.equal(supported[0].start,'2027-04-12');assert.equal(supported[0].end,'2027-04-14');
});
