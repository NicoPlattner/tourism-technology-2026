import {test} from "node:test";
import assert from "node:assert/strict";
import {creativeCandidates,seasonFromTravelDate} from "../src/campaigns/assetCatalog.ts";
import {creativeRequest} from "../src/campaigns/captions/creativeRequest.ts";
import {MockCampaignDataProvider} from "../src/campaigns/mockCampaignData.ts";
import {CaptionError,normalizeMetadata,validateCreative} from "../src/campaigns/captions/contracts.ts";
import {OpenAICompatibleCaptionProvider,readProviderConfig} from "../server/provider.ts";
import {createCaptionServer} from "../server/http.ts";
import {CaptionClient} from "../src/campaigns/captions/client.ts";
const input=()=>creativeRequest(new MockCampaignDataProvider().getImmediateRecommendation("DE","q3-2027",{ageMin:35,ageMax:44}));
const result=()=>({assetId:"summer-45-60",caption:"Ein grüner Panoramaweg führt den Blick durch die Alpen. Dieses Bild lädt dazu ein, eine gemeinsame Auszeit zu planen und neue Perspektiven zu entdecken. 🌿",hashtags:["#Alpen","#Ischgl"],language:"de",platform:"instagram",creativeReason:"Der Panoramaweg passt zur sommerlichen Auszeit und zur einladenden Bildidee."});
const response=(value:unknown)=>new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{content:JSON.stringify(value)}}]}),{headers:{"Content-Type":"application/json"}});
const config=()=>readProviderConfig({OPENAI_API_KEY:"test-key-not-a-real-credential",CAPTION_MODEL:"test-model"});
test("travel dates and audience prioritize relevant compatible candidates without exposing image binaries",()=>{
 assert.equal(seasonFromTravelDate("2027-03-22"),"winter");assert.equal(seasonFromTravelDate("2027-07-12"),"summer");
 assert.deepEqual(creativeCandidates(18,"summer").map(a=>a.id),["summer-18-24"]);
 assert.deepEqual(creativeCandidates(35,"summer").map(a=>a.id),["summer-35-44","summer-45-60"]);
 assert.deepEqual(creativeCandidates(45,"winter").map(a=>a.id),["winter-45-60"]);
 const candidates=creativeCandidates(25,"spring");assert.equal(candidates[0].id,"spring-25-34");
 assert.ok(candidates.every(a=>a.season==="spring"&&!a.ageGroup.startsWith("18–")));
 assert.ok(!JSON.stringify(candidates).includes(".webp"));
});
test("creative metadata rejects altered catalogue entries, invalid dates, incompatible season and platform",()=>{
 const m=input();assert.equal(normalizeMetadata(m).generationMode,"creative");
 for(const bad of [
  {...m,candidateAssets:[{...m.candidateAssets![0],id:"invented"}]},
  {...m,candidateAssets:m.candidateAssets!.map(a=>({...a,visualDescription:"A made-up visual"}))},
  {...m,travelDates:{start:"2027-02-30",end:"2027-03-01"}},
  {...m,season:"winter"}, {...m,platform:"Facebook"}, {...m,ageMax:46},
 ]) assert.throws(()=>normalizeMetadata(bad),CaptionError);
});
test("one model request receives compact compatible candidates and returns a complete matching pair",async()=>{
 const m=input();let calls=0;
 const provider=new OpenAICompatibleCaptionProvider(config(),async(_url,options)=>{
  calls++;const body=JSON.parse(options!.body as string);const received=JSON.parse(body.messages[1].content);
  assert.deepEqual(received.candidateAssets,m.candidateAssets);assert.deepEqual(received.travelDates,m.travelDates);
  assert.equal(received.travelPeriod,"q3-2027");assert.equal(received.ageMin,35);
  assert.match(body.messages[0].content,/AI Creative Director/);
  assert.deepEqual(body.response_format.json_schema.schema.properties.assetId.enum,["summer-35-44","summer-45-60"]);
  return response(result());
 });
 const generated=await provider.generate(m);assert.equal(calls,1);assert.equal(generated.assetId,"summer-45-60");assert.equal(generated.platform,"instagram");assert.equal(generated.source,"ai");
});
test("creative validation rejects wrong asset, platform, language and obvious visual contradictions",()=>{
 const m=input();assert.equal(validateCreative(result(),m).assetId,"summer-45-60");
 for(const bad of [
  {...result(),assetId:"winter-35-44"}, {...result(),assetId:"invented"}, {...result(),platform:"facebook"},
  {...result(),language:"fr"}, {...result(),creativeReason:""}, {...result(),caption:"Die Katze begleitet diese Reise. "+result().caption},
  {...result(),caption:"Skifahren und Pisten stehen im Mittelpunkt. "+result().caption},
 ]) assert.throws(()=>validateCreative(bad,m),CaptionError);
});
test("caption endpoint supports creative mode with one upstream request and strict response provenance",async()=>{
 let calls=0;const provider=new OpenAICompatibleCaptionProvider(config(),async()=>{calls++;return response(result());});
 const server=createCaptionServer(()=>provider);await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 try {
  const address=server.address() as {port:number};
  const response=await fetch(`http://127.0.0.1:${address.port}/api/marketing/generate-caption`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input())});
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{...result(),source:"ai"});assert.equal(calls,1);
 } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test("cache holds a complete pair and a rejected regeneration preserves both parts",async()=>{
 let calls=0;const client=new CaptionClient("/api",async()=>new Response(JSON.stringify({...result(),assetId:++calls===1?"summer-45-60":"winter-45-60",source:"ai"}),{headers:{"Content-Type":"application/json"}}));
 const m=input();await client.generate(m,true,"summer-campaign");await assert.rejects(client.generate(m,true,"summer-campaign"),CaptionError);
 assert.equal(client.getCached(m,"summer-campaign")?.assetId,"summer-45-60");assert.equal(client.getCached(m,"summer-campaign")?.caption,result().caption);
 assert.equal(calls,2);
});
test("concurrent explicit creative requests share one model request even with cache bypass",async()=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);let calls=0;
 const client=new CaptionClient("/api",async()=>{calls++;await gate;return new Response(JSON.stringify({...result(),source:"ai"}),{headers:{"Content-Type":"application/json"}});});
 const a=client.generate(input(),true,"summer-pair");const b=client.generate(input(),true,"summer-pair");release();
 assert.deepEqual(await a,await b);assert.equal(calls,1);
});
