import type { CampaignRecommendation } from "../types";
import { creativeCandidates, seasonFromTravelDate } from "../assetCatalog";
import type { CaptionMetadata } from "./contracts";
export function creativeRequest(campaign: CampaignRecommendation): CaptionMetadata {
  const season = seasonFromTravelDate(campaign.travel.start);
  return {
    ...campaign.captionMetadata,
    generationMode: "creative",
    travelPeriod: campaign.period,
    travelDates: { start: campaign.travel.start, end: campaign.travel.end },
    season,
    candidateAssets: creativeCandidates(campaign.captionMetadata.ageMin, season),
  };
}
