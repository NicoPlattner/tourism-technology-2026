// Explicit development operation only. Never runs on build or page load.
import { writeFile } from "node:fs/promises";
import { MockCampaignDataProvider } from "../src/campaigns/mockCampaignData.ts";
import { MARKETS, TRAVEL_PERIODS } from "../src/campaigns/types.ts";
import { metadataKey } from "../src/campaigns/captions/contracts.ts";
import { configuredCaptionProvider } from "../server/provider.ts";
import type { CampaignCaption } from "../src/campaigns/types.ts";
const provider = configuredCaptionProvider();
const campaigns = new MockCampaignDataProvider();
const output: Record<string, {metadataKey: string; caption: CampaignCaption}> = {};
const generated = new Map<string, CampaignCaption>();
for (const period of TRAVEL_PERIODS) for (const market of MARKETS) {
  const campaign = campaigns.getImmediateRecommendation(market.code, period.id);
  const key = metadataKey(campaign.captionMetadata);
  let caption = generated.get(key);
  if (!caption) {
    // Fail rather than silently labelling demo text as AI output.
    const result = await provider.generate(campaign.captionMetadata);
    caption = { text: result.caption, hashtags: result.hashtags, language: result.language,
      source: "pre_generated", generatedAt: new Date().toISOString() };
    generated.set(key, caption);
  }
  output[campaign.id] = { metadataKey: key, caption };
  console.log(campaign.id, caption.text);
}
await writeFile(new URL("../src/campaigns/captions/preGenerated.json", import.meta.url), JSON.stringify(output, null, 2) + "\n");
