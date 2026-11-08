import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DemandClient } from '../src/campaigns/demand/client';
import { parseDemand, tourismContext, heatColor } from '../src/campaigns/demand/contracts';
import { withDemand } from '../src/campaigns/demand/recommendation';
import { MockCampaignDataProvider } from '../src/campaigns/mockCampaignData';
import { creativeRequest } from '../src/campaigns/captions/creativeRequest';
import { normalizeMetadata, metadataKey, validateCreative } from '../src/campaigns/captions/contracts';
import { buildMessages, captionJsonSchema } from '../server/prompt';
import { demandFixture } from './helpers/demand';
const dates = {start:'2027-02-15',end:'2027-02-21'};
const provider = new MockCampaignDataProvider();
test('API origin codes, strict context matching, weighted lead and mean stay feed actual campaign dates', () => {
  const q = parseDemand(demandFixture('25',dates.start,dates.end,{lead:135,stay:5.83,holiday:'Spring holidays'}),'NL',dates);
  const c = withDemand(provider.getImmediateRecommendation('NL','custom',undefined,dates),q,'ready');
  assert.equal(c.assumedLeadDays,135); assert.equal(c.campaign.start,'2026-10-03');
  assert.equal(c.tourismContext?.averageStayNights,5.83);
  assert.match(c.detailedReasoning.join(' '),/does not expose the most common/);
  assert.match(c.reasoning,/Origin holiday/);
  assert.throws(()=>parseDemand(q,'DE',dates));
  assert.throws(()=>parseDemand({...q,from:'2027-02-01'},'NL',dates));
});
test('missing, empty, invalid data never supplies fictional timing as real evidence', () => {
  const c = provider.getImmediateRecommendation('DE','custom',undefined,dates);
  for (const status of ['error','empty','loading'] as const) {
    const result = withDemand(c,undefined,status);
    assert.equal(result.tourismContext,undefined); assert.equal(result.dataStatus,status);
  }
  assert.throws(()=>parseDemand({...demandFixture(),nights:{value:'100'}},'DE',dates));
  const query=parseDemand(demandFixture('DE',dates.start,dates.end,{stay:null}),'DE',dates);
  assert.equal(tourismContext(query).averageStayNights,null);
});
test('fixed heat scale compares real values consistently across dates and distinguishes missing data', () => {
  assert.notEqual(heatColor(5439),heatColor(61143)); assert.notEqual(heatColor(undefined),heatColor(0));
  assert.equal(heatColor(61143),heatColor(70000));
});
test('demand cache isolates origin and period; unsupported partial ranges are rejected before querying', async () => {
  let calls=0;
  const client=new DemandClient('http://example.test/c04-api/query',async input => {
    calls++; const p=new URL(String(input)).searchParams;
    return new Response(JSON.stringify(demandFixture(p.get('origin')!,p.get('start')!,p.get('end')!)));
  });
  await client.query('DE',dates); await client.query('DE',dates); assert.equal(calls,1);
  await client.query('NL',dates); assert.equal(calls,2);
  await client.query('DE',{start:'2027-03-01',end:'2027-03-07'}); assert.equal(calls,3);
  await assert.rejects(client.query('DE',{start:'2023-12-31',end:'2024-01-07'}),/covers/);
  assert.equal(calls,3);
});
test('tourism evidence reaches LLM messages/schema, cache identity and grounded reasoning validation', () => {
  const c=withDemand(provider.getImmediateRecommendation('DE','custom',undefined,dates),parseDemand(demandFixture(),'DE',dates),'ready');
  const request=normalizeMetadata(creativeRequest(c));
  assert.deepEqual(JSON.parse(buildMessages(request)[1].content).tourismContext,request.tourismContext);
  assert.match(buildMessages(request)[0].content,/not a modal or most-common/);
  assert.match(buildMessages(request)[0].content,/never proof of causality/);
  assert.ok(captionJsonSchema(request).required.includes('campaignReasoning'));
  const changed={...request,tourismContext:{...request.tourismContext!,averageStayNights:2}};
  assert.notEqual(metadataKey(request),metadataKey(changed));
  assert.throws(()=>normalizeMetadata({...request,tourismContext:{...request.tourismContext!,origin:'25'}}));
  assert.throws(()=>normalizeMetadata({...request,tourismContext:{...request.tourismContext!,start:'2027-01-01'}}));
  const creative={assetId:request.candidateAssets![0].id,caption:'Die Katze ist schon bereit für die Berge. Komm mit! 🐱',hashtags:['#Ischgl','#Alpen'],language:'de',platform:'tiktok',creativeReason:'Passende Bildidee.'};
  assert.throws(()=>validateCreative(creative,request));
  const valid={...creative,campaignReasoning:'Estimated demand and an arrival-period lead-time proxy inform this campaign. The average stay helps shape the travel invitation; these figures describe all guests, not the selected age group.'};
  assert.equal(validateCreative(valid,request).campaignReasoning,valid.campaignReasoning);
});
