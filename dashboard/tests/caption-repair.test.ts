import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OpenAICompatibleCaptionProvider, readProviderConfig } from '../server/provider';
import { creativeRequest } from '../src/campaigns/captions/creativeRequest';
import { MockCampaignDataProvider } from '../src/campaigns/mockCampaignData';
import { seasonalPreview } from '../src/campaigns/seasonalPreview';
const metadata=creativeRequest(new MockCampaignDataProvider().getImmediateRecommendation('DE','q3-2027',{ageMin:35,ageMax:44}));
const valid={assetId:metadata.candidateAssets![0].id,caption:seasonalPreview('de','summer'),hashtags:['#Paznaun','#Ischgl'],language:'de',platform:'instagram',creativeReason:'Der Bergsee passt zur sommerlichen Auszeit mit Freunden.'};
const config=()=>readProviderConfig({CAPTION_API_KEY:'test-placeholder',CAPTION_MODEL:'test-model',CAPTION_TIMEOUT_MS:'1000'});
const response=(value:unknown)=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}));
test('an undersized Instagram caption is corrected once with precise length feedback',async()=>{
  let calls=0;const signals:unknown[]=[];
  const provider=new OpenAICompatibleCaptionProvider(config(),async(_url,options)=>{
    calls++;signals.push(options?.signal);const body=JSON.parse(String(options?.body));
    if(calls===1)return response({...valid,caption:'x'.repeat(104)});
    assert.equal(body.messages.length,4);
    assert.match(body.messages[3].content,/104 Unicode characters/);
    assert.match(body.messages[3].content,/120–220/);
    assert.match(body.messages[3].content,/Aim for 170/);
    return response(valid);
  });
  assert.equal((await provider.generate(metadata)).caption,valid.caption);
  assert.equal(calls,2);assert.equal(signals[0],signals[1]);
});
test('correction is bounded and invalid second output is still rejected',async()=>{
  let calls=0;
  const provider=new OpenAICompatibleCaptionProvider(config(),async()=>{calls++;return response({...valid,caption:'Still too short.'});});
  await assert.rejects(provider.generate(metadata));assert.equal(calls,2);
});
test('provider authentication failures are not retried as content errors',async()=>{
  let calls=0;const provider=new OpenAICompatibleCaptionProvider(config(),async()=>{calls++;return new Response('{}',{status:401});});
  await assert.rejects(provider.generate(metadata),/credentials/);assert.equal(calls,1);
});
test('all curated Instagram previews match the season, destination and caption length',()=>{
  for(const language of ['de','nl','fr']){
    const values=['winter','spring','summer','autumn'].map(season=>seasonalPreview(language,season as 'winter'));
    assert.equal(new Set(values).size,4);
    for(const text of values){assert.match(text,/Paznaun-Ischgl/);assert.ok(Array.from(text).length>=120 && Array.from(text).length<=220);}
  }
});
