// Explicit development operation only. Never runs on build or page load.
import { readFile, writeFile } from "node:fs/promises";
import { MockCampaignDataProvider } from "../src/campaigns/mockCampaignData.ts";
import { MARKETS, TRAVEL_PERIODS } from "../src/campaigns/types.ts";
import { metadataKey } from "../src/campaigns/captions/contracts.ts";
import { configuredCaptionProvider } from "../server/provider.ts";
import type { CampaignCaption } from "../src/campaigns/types.ts";
const provider = configuredCaptionProvider();
const campaigns = new MockCampaignDataProvider();
const output: Record<string, {metadataKey: string; caption: CampaignCaption}> = {};
const generated = new Map<string, CampaignCaption>();
const file = new URL("../src/campaigns/captions/preGenerated.json", import.meta.url);
const existing = JSON.parse(await readFile(file, "utf8")) as typeof output;
let failures = 0;
for (const period of TRAVEL_PERIODS) for (const market of MARKETS) {
  const campaign = campaigns.getImmediateRecommendation(market.code, period.id);
  const key = metadataKey(campaign.captionMetadata);
  let caption = generated.get(key) || (existing[campaign.id]?.metadataKey === key ? existing[campaign.id].caption : undefined);
  if (!caption) {
    // One request per missing entry. Failed entries remain explicit demo previews.
    let result;
    try { result = await provider.generate(campaign.captionMetadata); }
    catch (error) { failures++; console.warn(campaign.id, error instanceof Error ? error.message : "Generation failed"); continue; }
    caption = { text: result.caption, hashtags: result.hashtags, language: result.language,
      source: "pre_generated", generatedAt: new Date().toISOString() };
    generated.set(key, caption);
  }
  output[campaign.id] = { metadataKey: key, caption };
  console.log(campaign.id, caption.text);
}
// Share a validated output across periods with identical metadata, including resumed runs.
for (const period of TRAVEL_PERIODS) for (const market of MARKETS) {
  const c = campaigns.getImmediateRecommendation(market.code, period.id);
  if (output[c.id]) continue;
  const key = metadataKey(c.captionMetadata);
  const matching = Object.values(output).find(entry => entry.metadataKey === key);
  if (matching) output[c.id] = structuredClone(matching);
}
await writeFile(file, JSON.stringify(output, null, 2) + "\n");

if (failures) { console.warn(`${failures} captions remain demo previews. Run explicitly again to generate missing entries; matching outputs are reused.`); process.exitCode = 1; }
