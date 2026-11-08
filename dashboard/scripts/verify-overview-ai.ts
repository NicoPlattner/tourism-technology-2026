// Explicit live smoke check: performs two paid model calls. Run only when requested.
// C04_API_URL must be the complete deployed c04-api base URL; credentials stay in env.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { parseDemand } from '../src/campaigns/demand/contracts';
import { withDemand } from '../src/campaigns/demand/recommendation';
import { MockCampaignDataProvider } from '../src/campaigns/mockCampaignData';
import { creativeRequest } from '../src/campaigns/captions/creativeRequest';
import { createCaptionServer } from '../server/http';
import { configuredCaptionProvider } from '../server/provider';
const base=process.env.C04_API_URL;
if (!base) throw new Error('Set C04_API_URL to a deployed c04-api base URL.');
const server=createCaptionServer(()=>configuredCaptionProvider());
server.listen(0,'127.0.0.1'); await once(server,'listening');
const address=server.address(); assert.ok(address && typeof address !== 'string');
const results=[];
try {
  for(const scenario of [{market:'DE',origin:'DE',age:{ageMin:18,ageMax:24},start:'2027-02-15',end:'2027-02-21'},
    {market:'NL',origin:'25',age:{ageMin:45,ageMax:60},start:'2027-07-12',end:'2027-07-18'}] as const) {
    const params=new URLSearchParams({destination:'PAZNAUN',origin:scenario.origin,start:scenario.start,end:scenario.end});
    const response=await fetch(`${base.replace(/\/$/,'')}/query?${params}`); assert.equal(response.status,200);
    const query=parseDemand(await response.json(),scenario.market,scenario);
    const campaign=withDemand(new MockCampaignDataProvider().getImmediateRecommendation(scenario.market,'custom',scenario.age,scenario),query,'ready');
    const ai=await fetch(`http://127.0.0.1:${address.port}/api/marketing/generate-caption`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(creativeRequest(campaign))});
    const result=await ai.json(); assert.equal(ai.status,200,JSON.stringify(result));
    assert.equal(result.source,'ai'); assert.ok(result.campaignReasoning);
    const length=Array.from(result.caption).length;
    assert.ok(length >= campaign.captionMetadata.targetCaptionLength!.min && length <= campaign.captionMetadata.targetCaptionLength!.max);
    results.push({market:scenario.market,dates:[scenario.start,scenario.end],evidence:campaign.tourismContext,result});
  }
  assert.notEqual(results[0].result.caption,results[1].result.caption);
  console.log(JSON.stringify(results,null,2));
} finally { server.close(); server.closeAllConnections(); }
