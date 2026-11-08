import { ASSET_CATALOG, type AssetCandidate, type CampaignSeason } from "./assetCatalog";
import type { TravelPeriod } from "./types";
export type { CampaignSeason } from "./assetCatalog";
export interface SeasonalCampaignAsset extends AssetCandidate { path: string; source: "ai_generated"; }
const paths: Record<string,string> = {
  "winter-18-24": new URL("./assets/seasonal/winter-18-24.webp", import.meta.url).href,
  "winter-25-34": new URL("./assets/seasonal/winter-25-34.webp", import.meta.url).href,
  "winter-35-44": new URL("./assets/seasonal/winter-35-44.webp", import.meta.url).href,
  "winter-45-60": new URL("./assets/seasonal/winter-45-60.webp", import.meta.url).href,
  "spring-18-24": new URL("./assets/seasonal/spring-18-24.webp", import.meta.url).href,
  "spring-25-34": new URL("./assets/seasonal/spring-25-34.webp", import.meta.url).href,
  "spring-35-44": new URL("./assets/seasonal/spring-35-44.webp", import.meta.url).href,
  "spring-45-60": new URL("./assets/seasonal/spring-45-60.webp", import.meta.url).href,
  "summer-18-24": new URL("./assets/seasonal/summer-18-24.webp", import.meta.url).href,
  "summer-25-34": new URL("./assets/seasonal/summer-25-34.webp", import.meta.url).href,
  "summer-35-44": new URL("./assets/seasonal/summer-35-44.webp", import.meta.url).href,
  "summer-45-60": new URL("./assets/seasonal/summer-45-60.webp", import.meta.url).href,
  "autumn-18-24": new URL("./assets/seasonal/autumn-18-24.webp", import.meta.url).href,
  "autumn-25-34": new URL("./assets/seasonal/autumn-25-34.webp", import.meta.url).href,
  "autumn-35-44": new URL("./assets/seasonal/autumn-35-44.webp", import.meta.url).href,
  "autumn-45-60": new URL("./assets/seasonal/autumn-45-60.webp", import.meta.url).href,
};
export const SEASONAL_ASSETS: SeasonalCampaignAsset[] = ASSET_CATALOG.map(asset => ({...asset,path:paths[asset.id]}));
export function seasonForPeriod(period: TravelPeriod): CampaignSeason {
  return period === "q2-2027" ? "spring" : period === "q3-2027" ? "summer" : period === "q4-2027" ? "autumn" : "winter";
}
export function seasonalAsset(ageMin: number, season: CampaignSeason): SeasonalCampaignAsset {
  const asset = SEASONAL_ASSETS.find(asset => asset.season === season && asset.ageGroup.startsWith(`${ageMin}–`));
  if (!asset) throw new Error("No campaign visual exists for this audience and season.");
  return structuredClone(asset);
}
