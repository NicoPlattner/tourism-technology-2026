import {test} from 'node:test';
import assert from 'node:assert/strict';
import {suggestTravelDates} from '../src/campaigns/opportunity/suggestion';
import {withTravelWindow} from '../src/campaigns/opportunity/recommendation';
import {MockCampaignDataProvider} from '../src/campaigns/mockCampaignData';
import {demandFixture} from './helpers/demand';
import {parseDemand} from '../src/campaigns/demand/contracts';
import {creativeRequest} from '../src/campaigns/captions/creativeRequest';
import {normalizeMetadata} from '../src/campaigns/captions/contracts';
import {buildMessages} from '../server/prompt';
test('suggested dates use a bounded mean-stay heuristic and never leave the future analysis range',()=>{
 assert.deepEqual(suggestTravelDates({start:'2027-09-07',end:'2027-10-31'},3.7,'2026-11-08'),{start:'2027-09-07',end:'2027-09-10'});
 assert.deepEqual(suggestTravelDates({start:'2026-11-01',end:'2026-11-09'},7,'2026-11-08'),{start:'2026-11-08',end:'2026-11-09'});
 assert.equal(suggestTravelDates({start:'2026-10-01',end:'2026-10-31'},5,'2026-11-08'),undefined);
});
test('suggestion is labeled, schedules from the API lead time and cannot masquerade as occupancy evidence',()=>{
 const analysis={start:'2027-09-07',end:'2027-10-31'},suggestedDates={start:'2027-09-07',end:'2027-09-10'};
 const query=parseDemand(demandFixture('DE',suggestedDates.start,suggestedDates.end,{lead:3,stay:3.7}),'DE',suggestedDates);
 const c=withTravelWindow(new MockCampaignDataProvider().getImmediateRecommendation('DE','custom',undefined,analysis),query,'ready',{key:'test',status:'suggested',suggestedDates,query,message:''},'2026-11-08',7);
 assert.equal(c.windowRecommendation?.status,'suggested');assert.equal(c.campaign.start,'2027-08-28');assert.equal(c.campaign.end,'2027-09-04');
 assert.match(c.reasoning,/could not be extracted/);assert.equal(c.captionMetadata.opportunityEvidence,undefined);
 const m=normalizeMetadata(creativeRequest(c));assert.equal(m.windowSuggestion?.basis,'heuristic-not-extracted');assert.match(buildMessages(m)[0].content,/not data-extracted or optimal/);
 assert.throws(()=>normalizeMetadata({...m,windowSuggestion:{...m.windowSuggestion!,start:'2027-09-01'}}));
});
