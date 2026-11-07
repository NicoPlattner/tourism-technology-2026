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
test("Q1 campaigns use assigned adult audiences, localized copy and distinct creative", async () => {
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
  assert.equal(new Set(campaigns.map((c) => c.asset.src)).size, 4);
  for (const c of campaigns) {
    assert.ok(Number(c.ageGroup.split("–")[0]) >= 18);
    assert.ok(c.caption.length > 20);
    assert.equal(c.fictional, true);
    assert.equal(c.asset.source, "ORIGINAL_ILLUSTRATION");
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
        assert.ok(c.asset.id.endsWith("spring"));
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

test("all 12 saved campaign captions have matching metadata, valid localized output and AI provenance", () => {
  assert.equal(Object.keys(savedCaptions).length, 12);
  for (const period of TRAVEL_PERIODS) for (const market of MARKETS) {
    const c = provider.getImmediateRecommendation(market.code, period.id);
    const saved = savedCaptions[c.id as keyof typeof savedCaptions];
    assert.equal(saved.metadataKey, metadataKey(c.captionMetadata));
    assert.equal(c.captionContent.source, "pre_generated");
    assert.ok(Number.isFinite(Date.parse(c.captionContent.generatedAt!)));
    validateGenerated({ caption: c.captionContent.text, hashtags: c.captionContent.hashtags, language: c.captionContent.language }, c.language);
    assert.equal(c.caption, c.captionContent.text);
    c.captionContent.hashtags.push("#LocalMutation");
    assert.ok(!provider.getImmediateRecommendation(market.code, period.id).hashtags.includes("#LocalMutation"));
  }
});
