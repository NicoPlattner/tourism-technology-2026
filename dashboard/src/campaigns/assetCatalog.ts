import catalog from "./assetCatalog.json";
export type CampaignSeason = "winter" | "spring" | "summer" | "autumn";
export interface AssetCandidate {
  id: string;
  ageGroup: string;
  season: CampaignSeason;
  activity: string;
  creativeTheme: string;
  visualDescription: string;
}
interface CatalogAsset extends AssetCandidate { source: "ai_generated"; activityFamily: string; }
export const ASSET_CATALOG = catalog as CatalogAsset[];
// Calendar-season defaults follow the selected arrival date, not the promotion dates.
export function seasonFromTravelDate(start: string): CampaignSeason {
  const month = Number(start.slice(5,7));
  return month <= 2 || month === 12 ? "winter" : month <= 5 ? "spring" : month <= 8 ? "summer" : "autumn";
}
export function creativeCandidates(ageMin: number, season: CampaignSeason): AssetCandidate[] {
  const primary = ASSET_CATALOG.find(asset => asset.season === season && asset.ageGroup.startsWith(`${ageMin}–`));
  if (!primary) throw new Error("No compatible creative assets exist.");
  const candidates = [primary, ...ASSET_CATALOG.filter(asset => asset.id !== primary.id &&
    asset.season === season && asset.activityFamily === primary.activityFamily &&
    !asset.ageGroup.startsWith("18–") && ageMin !== 18)];
  return candidates.map(({id,ageGroup,season,activity,creativeTheme,visualDescription}) =>
    ({id,ageGroup,season,activity,creativeTheme,visualDescription}));
}
