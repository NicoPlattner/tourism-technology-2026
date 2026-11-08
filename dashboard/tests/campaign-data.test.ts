import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  MockCampaignDataProvider,
  shiftDate,
} from "../src/campaigns/mockCampaignData.ts";
import { metadataKey, validateGenerated } from "../src/campaigns/captions/contracts.ts";
import savedCaptions from "../src/campaigns/captions/preGenerated.json";
import { MARKETS, TRAVEL_PERIODS } from "../src/campaigns/types.ts";
const provider = new MockCampaignDataProvider();
test("Q1 campaigns use selected adult audiences, localized copy and distinct creative", async () => {
  const campaigns = await Promise.all(
    MARKETS.map((m) => provider.getRecommendation(m.code, "q1-2027")),
  );
  assert.deepEqual(
    campaigns.map((c) => c.assumedLeadDays),
    [60, 14, 35, 21],
  );
  assert.deepEqual(
    campaigns.map((c) => c.language),
    ["de", "nl", "fr", "de"],
  );
  assert.deepEqual(
    campaigns.map((c) => c.campaign.start.slice(0, 7)),
    ["2026-12", "2027-03", "2027-01", "2026-12"],
  );
  assert.equal(new Set(campaigns.map((c) => c.asset.src)).size, 1);
  for (const c of campaigns) {
    assert.ok(Number(c.ageGroup.split("–")[0]) >= 18);
    assert.ok(c.caption.length > 20);
    assert.equal(c.fictional, true);
    assert.equal(c.asset.source, "AI_GENERATED");
  }
});
for (const period of TRAVEL_PERIODS)
  test(`${period.label}: every recommendation has coherent travel, campaign and publishing dates`, async () => {
    for (const market of MARKETS) {
      const c = await provider.getRecommendation(market.code, period.id);
      assert.equal(
        c.campaign.start,
        shiftDate(c.travel.start, -c.assumedLeadDays),
      );
      assert.ok(c.campaign.end < c.travel.start);
      assert.ok(c.travel.start <= c.travel.end);
      assert.equal(c.publishingDates.length, 3);
      for (const post of c.publishingDates) {
        assert.ok(Number.isFinite(Date.parse(post)));
        assert.ok(post.slice(0, 10) >= c.campaign.start);
        assert.ok(post.slice(0, 10) <= c.campaign.end);
        assert.ok(post.slice(0, 10) < c.travel.start);
      }
      if (period.id === "q2-2027") {
        assert.ok(
          c.travel.start >= "2027-04-01" && c.travel.end <= "2027-06-30",
        );
        assert.equal(c.variation, true);
        assert.ok(c.asset.id.startsWith("spring"));
        assert.ok(!c.travel.label.includes("February"));
      }
    }
  });
test("period variants have independent stable identities and do not mutate previous recommendations", async () => {
  const original = await provider.getRecommendation("DE", "q1-2027");
  const copy = structuredClone(original);
  original.hashtags.push("#ChangedLocally");
  const again = await provider.getRecommendation("DE", "q1-2027");
  assert.deepEqual(again, copy);
  const spring = await provider.getRecommendation("DE", "q2-2027");
  assert.notEqual(spring.id, original.id);
  assert.notEqual(spring.caption, original.caption);
  assert.notEqual(spring.asset.src, original.asset.src);
});
test("the offline map contains real, non-rectangular boundaries for all four markets", async () => {
  const map = JSON.parse(
    await readFile(
      new URL("../src/campaigns/data/europe.json", import.meta.url),
      "utf8",
    ),
  );
  for (const market of MARKETS) {
    const country = map.countries.find(
      (c: { id: string }) => c.id === market.code,
    );
    assert.ok(country);
    assert.ok(country.path.split("L").length > 12);
  }
  assert.ok(map.countries.length > 20);
  assert.match(map.source, /Natural Earth/);
});
test("unsupported requests reject without returning a mismatched campaign", async () => {
  await assert.rejects(provider.getRecommendation("FR" as never, "q1-2027"));
  await assert.rejects(provider.getRecommendation("DE", "unknown" as never));
});

test("all saved campaign captions have matching metadata, valid localized output and AI provenance", () => {
  assert.equal(Object.keys(savedCaptions).length, 20);
  for (const period of TRAVEL_PERIODS) for (const market of MARKETS) {
    const c = provider.getImmediateRecommendation(market.code, period.id);
    const saved = savedCaptions[c.id as keyof typeof savedCaptions];
    assert.ok(saved);
    assert.equal(saved.metadataKey, metadataKey(c.captionMetadata));
    assert.equal(c.captionContent.source, "pre_generated");
    assert.ok(Number.isFinite(Date.parse(c.captionContent.generatedAt!)));
    validateGenerated({ caption: c.captionContent.text, hashtags: c.captionContent.hashtags, language: c.captionContent.language }, c.language, c.captionMetadata.targetCaptionLength);
    assert.equal(c.caption, c.captionContent.text);
    c.captionContent.hashtags.push("#LocalMutation");
    assert.ok(!provider.getImmediateRecommendation(market.code, period.id).hashtags.includes("#LocalMutation"));
  }
});
test("user-selected audience is independent of market data and adapts images while preserving booking dates", () => {
  for (const market of MARKETS) for (const period of TRAVEL_PERIODS) {
    const initial = provider.getImmediateRecommendation(market.code, period.id);
    assert.equal(initial.ageGroup, "18–24");
    for (const audience of [{ageMin:25,ageMax:34},{ageMin:35,ageMax:44},{ageMin:45,ageMax:60}]) {
      const c = provider.getImmediateRecommendation(market.code, period.id, audience);
      assert.deepEqual(c.marketingPreferences.targetAudience, audience);
      assert.equal(c.captionMetadata.ageMin, audience.ageMin);
      assert.equal(c.captionMetadata.ageMax, audience.ageMax);
      assert.equal(c.captionMetadata.visualDescription, c.asset.alt);
      assert.notEqual(c.asset.src, initial.asset.src);
      assert.deepEqual(c.travel, initial.travel);
      assert.equal(c.assumedLeadDays, initial.assumedLeadDays);
      assert.equal(c.captionContent.source, "demo_fallback");
      assert.match(c.reasoning, new RegExp(`${audience.ageMin}–${audience.ageMax}`));
      assert.notEqual(metadataKey(c.captionMetadata), metadataKey(initial.captionMetadata));
      assert.notEqual(c.id, initial.id);
    }
  }
  assert.throws(() => provider.getImmediateRecommendation("DE","q1-2027",{ageMin:17,ageMax:24}));
});
test("all age/platform demo voices have the requested caption lengths and metadata", () => {
  const rules = [[18,24,"TikTok",40,100],[25,34,"Instagram",80,160],[35,44,"Instagram",120,220],[45,60,"Facebook",180,350]] as const;
  for (const market of MARKETS) {
    const voices = new Set<string>();
    for (const [ageMin,ageMax,platform,min,max] of rules) {
      const c=provider.getImmediateRecommendation(market.code,"q1-2027",{ageMin,ageMax});
      assert.equal(c.platform,platform);
      assert.equal(c.captionMetadata.platform,platform);
      assert.deepEqual(c.captionMetadata.targetCaptionLength,{min,max});
      assert.ok(c.captionMetadata.tone);
      validateGenerated({caption:c.caption,hashtags:c.hashtags,language:c.language},c.language,{min,max});
      voices.add(c.caption);
    }
    assert.equal(voices.size,4);
  }
});
test("all sixteen seasonal WebP assets exist, have distinct identities and feed the exact caption metadata", async () => {
  const {SEASONAL_ASSETS, seasonForPeriod} = await import("../src/campaigns/seasonalAssets.ts");
  const {TARGET_AGES} = await import("../src/campaigns/types.ts");
  assert.equal(SEASONAL_ASSETS.length,16);
  assert.equal(new Set(SEASONAL_ASSETS.map(a=>a.id)).size,16);
  for(const asset of SEASONAL_ASSETS) {
    const bytes=await readFile(new URL(asset.path));
    assert.equal(bytes.subarray(0,4).toString(),"RIFF");
    assert.equal(bytes.subarray(8,12).toString(),"WEBP");
    assert.equal(asset.source,"ai_generated");
    assert.ok(asset.visualDescription.length>60);
  }
  for(const period of TRAVEL_PERIODS) for(const age of TARGET_AGES) {
    const c=provider.getImmediateRecommendation("DE",period.id,age);
    const asset=SEASONAL_ASSETS.find(a=>a.id===c.asset.id)!;
    assert.equal(asset.season,seasonForPeriod(period.id));
    assert.equal(asset.ageGroup,c.ageGroup);
    assert.equal(c.captionMetadata.assetId,asset.id);
    assert.equal(c.captionMetadata.activity,asset.activity);
    assert.equal(c.captionMetadata.creativeTheme,asset.creativeTheme);
    assert.equal(c.captionMetadata.visualDescription,asset.visualDescription);
    assert.equal(provider.getImmediateRecommendation("NL",period.id,age).asset.src,c.asset.src);
    assert.equal(provider.getImmediateRecommendation("DE",period.id,age).asset.src,c.asset.src);
    assert.notEqual(metadataKey(c.captionMetadata),metadataKey({...c.captionMetadata,assetId:"changed-visual"}));
  }
});
test("custom calendar dates drive travel, season, timing, preferences and independent campaign identities",async()=>{
  const {creativeRequest}=await import("../src/campaigns/captions/creativeRequest.ts");
  const {normalizeMetadata}=await import("../src/campaigns/captions/contracts.ts");
  const dates={start:"2028-07-15",end:"2028-07-22"};
  const c=provider.getImmediateRecommendation("DE","custom",{ageMin:18,ageMax:24},dates);
  assert.equal(c.travel.start,dates.start);assert.equal(c.travel.end,dates.end);
  assert.equal(c.asset.id,"summer-18-24");assert.equal(c.campaign.start,"2028-05-16");
  assert.deepEqual(c.marketingPreferences.travelDates,dates);
  assert.deepEqual(normalizeMetadata(creativeRequest(c)).travelDates,dates);
  const next=provider.getImmediateRecommendation("DE","custom",{ageMin:18,ageMax:24},{...dates,end:"2028-07-23"});
  assert.notEqual(c.id,next.id);assert.notEqual(metadataKey(creativeRequest(c)),metadataKey(creativeRequest(next)));
  assert.equal(provider.getImmediateRecommendation("NL","custom",{ageMin:18,ageMax:24},dates).travel.start,dates.start);
  assert.throws(()=>provider.getImmediateRecommendation("DE","custom",undefined,{start:"2028-07-22",end:"2028-07-15"}));
  assert.throws(()=>provider.getImmediateRecommendation("DE","custom",undefined,{start:"2027-02-30",end:"2027-03-10"}));
});
test("calendar-based publishing dates resolve Vienna daylight saving for each slot",()=>{
 const c=provider.getImmediateRecommendation("DE","custom",undefined,{start:"2027-05-26",end:"2027-06-02"});
 assert.deepEqual(c.publishingDates,["2027-03-27T18:00:00+01:00","2027-03-30T18:00:00+02:00","2027-04-02T18:00:00+02:00"]);
});
test("selected March–April travel dates switch imagery and AI candidates to spring despite winter promotion dates",async()=>{
 const {creativeRequest}=await import("../src/campaigns/captions/creativeRequest.ts");
 const {normalizeMetadata}=await import("../src/campaigns/captions/contracts.ts");
 const c=provider.getImmediateRecommendation("DE","custom",{ageMin:18,ageMax:24},{start:"2027-03-18",end:"2027-04-20"});
 assert.equal(c.campaign.start,"2027-01-17");assert.equal(c.asset.id,"spring-18-24");
 assert.equal(c.captionMetadata.season,"spring");assert.ok(!c.caption.includes("Winter"));
 const m=normalizeMetadata(creativeRequest(c));assert.equal(m.season,"spring");assert.equal(m.assetId,"spring-18-24");
 assert.ok(m.candidateAssets!.every(asset=>asset.season==="spring"));
});
