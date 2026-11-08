import type { SocialPlatform } from "./socialProfile";
import type { CaptionMetadata } from "./captions/contracts";
export type SourceMarket = "DE" | "NL" | "BE" | "AT";
export type TravelPeriod = "q1-2027" | "q2-2027" | "q3-2027" | "q4-2027" | "winter-2026-27";
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
export interface TargetAudience { ageMin: number; ageMax: number; }
export interface MarketingPreferences {
  country: string;
  travelPeriod: TravelPeriod;
  targetAudience: TargetAudience;
}
export const TARGET_AGES = [
  { ageMin: 18, ageMax: 24 },
  { ageMin: 25, ageMax: 34 },
  { ageMin: 35, ageMax: 44 },
  { ageMin: 45, ageMax: 60 },
] as const;
export const DEFAULT_TARGET_AUDIENCE: TargetAudience = TARGET_AGES[0];
export interface CampaignCaption {
  text: string;
  hashtags: string[];
  language: string;
  source: "pre_generated" | "live_ai" | "demo_fallback";
  generatedAt?: string;
}
export interface CampaignRecommendation {
  id: string;
  market: SourceMarket;
  country: string;
  period: TravelPeriod;
  title: string;
  ageGroup: string;
  marketingPreferences: MarketingPreferences;
  assumedLeadDays: number;
  travel: DateRange;
  campaign: DateRange;
  publishingDates: string[];
  timezone: "Europe/Vienna";
  platform: SocialPlatform;
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
  captionContent: CampaignCaption;
  fictional: boolean;
  variation: boolean;
}
export interface CampaignDataProvider {
  getImmediateRecommendation?(market: SourceMarket, period: TravelPeriod, targetAudience?: TargetAudience): CampaignRecommendation;
  getRecommendation(
    market: SourceMarket,
    period: TravelPeriod,
    targetAudience?: TargetAudience,
  ): Promise<CampaignRecommendation>;
}
export interface CampaignApproval {
  campaignId: string;
  approvedAt: string;
  publishingDates: string[];
  caption: string;
  hashtags?: string[];
  captionSource?: CampaignCaption["source"];
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
  { id: "q3-2027", label: "Q3 2027", range: "July–September" },
  { id: "q4-2027", label: "Q4 2027", range: "October–December" },
  { id: "winter-2026-27", label: "Winter 2026/27", range: "December–March" },
];
