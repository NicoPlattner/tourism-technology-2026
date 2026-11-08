import { seasonalAsset, seasonForPeriod } from "./seasonalAssets";
import { socialProfile, demoCaption } from "./socialProfile";
import { DEFAULT_TARGET_AUDIENCE, TARGET_AGES, type TargetAudience } from "./types";
import savedCaptions from "./captions/preGenerated.json";
import { metadataKey } from "./captions/contracts";
import type { CampaignCaption } from "./types";
import type {
  CampaignAsset,
  CampaignDataProvider,
  CampaignLanguage,
  CampaignRecommendation,
  DateRange,
  SourceMarket,
  TravelPeriod,
} from "./types";
interface MarketScenario {
  country: string;
  lead: number;
  language: CampaignLanguage;
  languageLabel: string;
  travel: DateRange;
  winterTravel: DateRange;
  springTravel: DateRange;
  holidayAssumption: string;
}
const SCENARIOS: Record<SourceMarket, MarketScenario> = {
  DE: {
    country: "Germany",
    lead: 60,
    language: "de",
    languageLabel: "German",
    travel: { start: "2027-02-15", end: "2027-02-21", label: "February 2027" },
    winterTravel: {
      start: "2027-02-15",
      end: "2027-02-21",
      label: "February 2027 · winter escape",
    },
    springTravel: {
      start: "2027-04-12",
      end: "2027-04-18",
      label: "April 2027 · spring variation",
    },
    holidayAssumption:
      "Semester-break dates vary by university. A February opportunity is an illustrative planning assumption, not a verified holiday calendar.",
  },
  NL: {
    country: "Netherlands",
    lead: 14,
    language: "nl",
    languageLabel: "Dutch",
    travel: {
      start: "2027-03-22",
      end: "2027-03-28",
      label: "Late March 2027",
    },
    winterTravel: {
      start: "2027-03-22",
      end: "2027-03-28",
      label: "Late March 2027 · winter finale",
    },
    springTravel: {
      start: "2027-04-23",
      end: "2027-04-29",
      label: "Late April 2027 · spring variation",
    },
    holidayAssumption:
      "No Dutch holiday or event is treated as verified. The short booking window and audience preference are fictional historical-behavior assumptions.",
  },
  BE: {
    country: "Belgium",
    lead: 35,
    language: "fr",
    languageLabel: "French",
    travel: { start: "2027-02-15", end: "2027-02-21", label: "February 2027" },
    winterTravel: {
      start: "2027-02-15",
      end: "2027-02-21",
      label: "February 2027 · winter escape",
    },
    springTravel: {
      start: "2027-05-14",
      end: "2027-05-20",
      label: "May 2027 · spring variation",
    },
    holidayAssumption:
      "Belgian winter breaks differ by community. No exact break or event is verified; the February window is a fictional planning scenario. Dutch can be supplied as another language variant.",
  },
  AT: {
    country: "Austria",
    lead: 21,
    language: "de",
    languageLabel: "German",
    travel: { start: "2027-01-15", end: "2027-01-17", label: "January 2027" },
    winterTravel: {
      start: "2027-01-15",
      end: "2027-01-17",
      label: "January 2027 · winter weekend",
    },
    springTravel: {
      start: "2027-05-21",
      end: "2027-05-23",
      label: "May 2027 · spring variation",
    },
    holidayAssumption:
      "The weekend timing is a demo assumption, not evidence of a confirmed public holiday, live event or offer.",
  },
};
export const shiftDate = (date: string, days: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
export const displayDate = (date: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Vienna",
  }).format(new Date(date.length === 10 ? `${date}T12:00:00Z` : date));
export const displayRange = (range: DateRange) =>
  `${displayDate(range.start)} – ${displayDate(range.end)}`;
export const displayPublishingDate = (date: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Vienna",
  }).format(new Date(date));
export class MockCampaignDataProvider implements CampaignDataProvider {
  async getRecommendation(market: SourceMarket, period: TravelPeriod, targetAudience = DEFAULT_TARGET_AUDIENCE): Promise<CampaignRecommendation> {
    return this.getImmediateRecommendation(market, period, targetAudience);
  }
  getImmediateRecommendation(
    market: SourceMarket,
    period: TravelPeriod,
    targetAudience: TargetAudience = DEFAULT_TARGET_AUDIENCE,
  ): CampaignRecommendation {
    const scenario = SCENARIOS[market];
    if (!scenario || !["q1-2027", "q2-2027", "q3-2027", "q4-2027", "winter-2026-27"].includes(period))
      throw new Error("Choose a supported source market and travel period.");
    if (!TARGET_AGES.some(age => age.ageMin === targetAudience.ageMin && age.ageMax === targetAudience.ageMax))
      throw new Error("Choose a supported adult target audience.");
    const ageGroup = `${targetAudience.ageMin}–${targetAudience.ageMax}`;
    const season = seasonForPeriod(period);
    const spring = season === "spring";
    const travel = {
      ...(season === "summer" ? { start: "2027-07-12", end: "2027-07-18", label: "July 2027 · summer" } : season === "autumn" ? { start: "2027-10-11", end: "2027-10-17", label: "October 2027 · autumn" } : spring
        ? scenario.springTravel
        : period === "winter-2026-27"
          ? scenario.winterTravel
          : scenario.travel),
    };
    const start = shiftDate(travel.start, -scenario.lead);
    const end = shiftDate(start, 7);
    // Three fictional publishing slots, 18:00 Europe/Vienna. Offset is +01 in winter and +02 in April/May.
    const offset = start >= "2027-03-28" ? "+02:00" : "+01:00";
    const publishingDates = [0, 3, 6].map(
      (days) => `${shiftDate(start, days)}T18:00:00${offset}`,
    );
    const visual = seasonalAsset(targetAudience.ageMin, season);
    const asset: CampaignAsset = {
      id: visual.id, src: visual.path, alt: visual.visualDescription,
      source: "AI_GENERATED",
      credit: "AI-generated campaign concept; not a photograph of verified destination conditions, actual visitors or identifiable facilities.",
      description: visual.visualDescription,
    };
    const profile = socialProfile(targetAudience.ageMin);
    const genericCaption = demoCaption(scenario.language, targetAudience.ageMin);
    const recommendation: CampaignRecommendation = {
      id: `campaign-${market}-${period}-${targetAudience.ageMin}-${targetAudience.ageMax}-v1`,
      market,
      country: scenario.country,
      period,
      title: `${scenario.country}: a ${season} Alpine escape`,
      ageGroup,
      marketingPreferences: { country: scenario.country, travelPeriod: period, targetAudience: {...targetAudience} },
      assumedLeadDays: scenario.lead,
      travel,
      campaign: { start, end, label: "Recommended promotion window" },
      publishingDates,
      timezone: "Europe/Vienna",
      platform: profile.platform,
      theme: visual.creativeTheme,
      language: scenario.language,
      languageLabel: scenario.languageLabel,
      caption: genericCaption,
      hashtags: ["#PaznaunIschgl", "#AlpineInspiration"],
      reasoning: `You’re targeting travelers aged ${ageGroup} from ${scenario.country}. The illustrative ${scenario.lead}-day booking lead time places promotion ahead of the selected ${season} travel period. Caption personalization uses your selected audience and the displayed AI-generated concept.`,
      detailedReasoning: [
        `${profile.platform}, the writing voice and caption length are illustrative demo heuristics, not measured audience preferences.`,
        `Selected target audience: ages ${ageGroup}. This is your marketing preference, not a demographic finding from tourism data.`,
        `Timing: target arrival ${displayDate(travel.start)} minus ${scenario.lead} assumed booking days gives ${displayDate(start)}. This 8-day promotion window ends before the target travel period.`,
        spring
          ? "Spring calendar overlap is unverified. This is a fictional travel window, not a confirmed holiday or event opportunity."
          : scenario.holidayAssumption,
        "The supplied historical-booking narrative is an assumption, not an analysis of the dashboard’s live or uploaded overnight-stay data.",
      ],
      assumptions: [
        "The audience is selected by the user. Booking lead time and behavior are illustrative mock assumptions, independent of tourism forecasts.",
        "Publishing at 18:00 Europe/Vienna is illustrative, not account engagement analysis.",
        "Seasonal conditions, trail access, lift operation and availability require checking before a real campaign.",
        "Approval and scheduling are simulated locally; nothing is sent to social media.",
      ],
      asset,
      captionContent: {
        text: genericCaption,
        hashtags: ["#PaznaunIschgl", "#AlpineInspiration"],
        language: scenario.language,
        source: "demo_fallback",
      },
      captionMetadata: {
        ...profile,
        country: scenario.country,
        language: scenario.language,
        ageMin: targetAudience.ageMin,
        ageMax: targetAudience.ageMax,
        season,
        assetId: visual.id,
        activity: visual.activity,
        destination: "Paznaun-Ischgl",
        creativeTheme: visual.creativeTheme,
        objective: "inspire_travel",
        visualDescription: asset.alt,
      },
      fictional: true,
      variation: season !== "winter",
    };
    const stored = (savedCaptions as Record<string, { metadataKey: string; caption: CampaignCaption }>)[recommendation.id];
    if (stored?.metadataKey === metadataKey(recommendation.captionMetadata)) {
      recommendation.captionContent = structuredClone(stored.caption);
      recommendation.caption = stored.caption.text;
      recommendation.hashtags = [...stored.caption.hashtags];
    }
    return recommendation;
  }
}
export const campaignDataProvider: CampaignDataProvider =
  new MockCampaignDataProvider();
