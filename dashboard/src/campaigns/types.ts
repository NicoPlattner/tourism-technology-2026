import type { CaptionMetadata } from "./captions/contracts";
export type SourceMarket = "DE" | "NL" | "BE" | "AT";
export type TravelPeriod = "q1-2027" | "q2-2027" | "winter-2026-27";
export type CampaignLanguage = "de" | "nl" | "fr";
export interface DateRange {
  start: string;
  end: string;
  label: string;
}
export interface CampaignAsset {
  id: string;
  src: string;
  alt: string;
  source: "ORIGINAL_ILLUSTRATION" | "AI_GENERATED" | "APPROVED_UPLOAD";
  credit: string;
  description: string;
}
export interface CampaignRecommendation {
  id: string;
  market: SourceMarket;
  country: string;
  period: TravelPeriod;
  title: string;
  ageGroup: string;
  segment: string;
  assumedLeadDays: number;
  travel: DateRange;
  campaign: DateRange;
  publishingDates: string[];
  timezone: "Europe/Vienna";
  platform: "Instagram";
  theme: string;
  language: CampaignLanguage;
  languageLabel: string;
  caption: string;
  hashtags: string[];
  reasoning: string;
  detailedReasoning: string[];
  assumptions: string[];
  asset: CampaignAsset;
  captionMetadata: CaptionMetadata;
  fictional: boolean;
  variation: boolean;
}
export interface CampaignDataProvider {
  getRecommendation(
    market: SourceMarket,
    period: TravelPeriod,
  ): Promise<CampaignRecommendation>;
}
export interface CampaignApproval {
  campaignId: string;
  approvedAt: string;
  publishingDates: string[];
  caption: string;
  hashtags?: string[];
  captionSource?: "ai" | "demo";
  status: "APPROVED_MOCK";
}
export const MARKETS: { code: SourceMarket; name: string; language: string }[] =
  [
    { code: "DE", name: "Germany", language: "Deutsch" },
    { code: "NL", name: "Netherlands", language: "Nederlands" },
    { code: "BE", name: "Belgium", language: "Français" },
    { code: "AT", name: "Austria", language: "Deutsch" },
  ];
export const TRAVEL_PERIODS: {
  id: TravelPeriod;
  label: string;
  range: string;
}[] = [
  { id: "q1-2027", label: "Q1 2027", range: "January–March" },
  { id: "q2-2027", label: "Q2 2027", range: "April–June" },
  { id: "winter-2026-27", label: "Winter 2026/27", range: "December–March" },
];
