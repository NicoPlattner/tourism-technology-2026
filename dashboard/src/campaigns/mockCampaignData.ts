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
const deWinter = new URL("./assets/de-winter.svg", import.meta.url).href;
const nlWinter = new URL("./assets/nl-winter.svg", import.meta.url).href;
const beWinter = new URL("./assets/be-winter.svg", import.meta.url).href;
const atWinter = new URL("./assets/at-winter.svg", import.meta.url).href;
const deSpring = new URL("./assets/de-spring.svg", import.meta.url).href;
const nlSpring = new URL("./assets/nl-spring.svg", import.meta.url).href;
const beSpring = new URL("./assets/be-spring.svg", import.meta.url).href;
const atSpring = new URL("./assets/at-spring.svg", import.meta.url).href;
interface MarketScenario {
  country: string;
  title: string;
  ageGroup: string;
  segment: string;
  lead: number;
  language: CampaignLanguage;
  languageLabel: string;
  theme: string;
  travel: DateRange;
  winterTravel: DateRange;
  springTravel: DateRange;
  caption: string;
  springCaption: string;
  hashtags: string[];
  springHashtags: string[];
  reasoning: string;
  holidayAssumption: string;
  springReasoning: string;
  image: string;
  springImage: string;
  alt: string;
  springAlt: string;
}
const SCENARIOS: Record<SourceMarket, MarketScenario> = {
  DE: {
    country: "Germany",
    title: "Exams off. Alpine mode on.",
    ageGroup: "18–26",
    segment: "University students & young adults",
    lead: 60,
    language: "de",
    languageLabel: "German",
    theme: "Gen Z meme marketing",
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
    caption:
      "POV: Klausuren vorbei und direkt ab auf die Piste. ⛷️🐈❄️ Zeit für deinen Ischgl-Moment mit der Crew.",
    springCaption:
      "POV: Lernmodus aus, Alpenmodus an. 🐈🏔️ Frühlingsluft statt Bibliothek — wer kommt mit nach Ischgl?",
    hashtags: ["#Ischgl", "#KlausurenVorbei", "#SkiMitDerCrew"],
    springHashtags: ["#Ischgl", "#Alpenmodus", "#Frühlingsauszeit"],
    reasoning:
      "This fictional student audience is paired with a possible February semester-break window. An assumed 60-day booking lead puts the campaign in December, well before arrival.",
    holidayAssumption:
      "Semester-break dates vary by university. A February opportunity is an illustrative planning assumption, not a verified holiday calendar.",
    springReasoning:
      "This generated mock variation pairs young adults with an April mountain escape. The assumed 60-day lead moves promotion to February; spring travel and university breaks still need verification.",
    image: deWinter,
    springImage: deSpring,
    alt: "Original spinning white cat in goggles skiing in an illustrated snowy Alpine landscape",
    springAlt:
      "Original playful white cat with a backpack on an illustrated spring Alpine trail",
  },
  NL: {
    country: "Netherlands",
    title: "Out of office. Into the Alps.",
    ageGroup: "29–40",
    segment: "Millennials, couples & friend groups",
    lead: 14,
    language: "nl",
    languageLabel: "Dutch",
    theme: "Nostalgic internet humor",
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
    caption:
      "Tijd om de bergen in te gaan! ⛷️❄️ Nog een meeting? Liever een berg. Verzamel je favoriete mensen voor een spontane trip naar Ischgl.",
    springCaption:
      "Nog een meeting? Liever een berg. 🐈🏔️ Tijd voor frisse Alpenlucht en een spontane lente-escape naar Ischgl met je favoriete mensen.",
    hashtags: ["#Ischgl", "#EvenHelemaalWeg", "#Wintersport"],
    springHashtags: ["#Ischgl", "#LenteInDeBergen", "#EvenHelemaalWeg"],
    reasoning:
      "A fictional millennial audience and an assumed short, 14-day booking window suggest a spontaneous late-March escape. Promotion starts in March, close to the planned visit.",
    holidayAssumption:
      "No Dutch holiday or event is treated as verified. The short booking window and audience preference are fictional historical-behavior assumptions.",
    springReasoning:
      "This generated mock variation swaps the late-season ski trip for a late-April mountain break. A 14-day assumed lead recommends April promotion without claiming any confirmed school holiday.",
    image: nlWinter,
    springImage: nlSpring,
    alt: "Original unimpressed beige cat with a snowboard in a snowy Alpine scene, inspired by nostalgic internet humor",
    springAlt:
      "Original unimpressed beige cat taking a spring Alpine picnic break beside a backpack",
  },
  BE: {
    country: "Belgium",
    title: "The mountains. But make it sigma.",
    ageGroup: "18–24",
    segment: "Young adult travelers",
    lead: 35,
    language: "fr",
    languageLabel: "French",
    theme: "Absurdist Gen Z humor",
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
    caption:
      "Quand le ski devient un vrai moment sigma. 🏔️🍗❄️ La team, la neige et une escapade à Ischgl qui sort de l’ordinaire.",
    springCaption:
      "Mode pause alpine : activé. 🍗🏔️ La team, l’air frais et une escapade printanière à Ischgl qui sort de l’ordinaire.",
    hashtags: ["#Ischgl", "#MomentSigma", "#EscapadeAuSki"],
    springHashtags: ["#Ischgl", "#PauseAlpine", "#EscapadeDePrintemps"],
    reasoning:
      "A fictional adult Gen Z segment and a potential February travel window support playful French-language content. The assumed 35-day lead schedules the campaign in January.",
    holidayAssumption:
      "Belgian winter breaks differ by community. No exact break or event is verified; the February window is a fictional planning scenario. Dutch can be supplied as another language variant.",
    springReasoning:
      "This generated mock variation targets an adult May escape, with an assumed 35-day lead placing promotion in April. Potential spring breaks are unverified and no actual event is advertised.",
    image: beWinter,
    springImage: beSpring,
    alt: "Original golden cartoon chicken nugget with sunglasses riding a red sledge through illustrated Alpine snow",
    springAlt:
      "Original golden cartoon nugget with sunglasses and a backpack on a green spring Alpine lookout",
  },
  AT: {
    country: "Austria",
    title: "Less everyday. More mountain.",
    ageGroup: "25–35",
    segment: "Domestic weekend travelers",
    lead: 21,
    language: "de",
    languageLabel: "German",
    theme: "Local winter humor",
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
    caption:
      "Raus aus dem Alltag, rein in den Schnee. Dein nächster Wintertrip wartet! 🏔️ Ein Wochenende Alpenmodus in Ischgl — wer ist dabei?",
    springCaption:
      "Raus aus dem Alltag, rein in die Bergluft. 🏔️ Ein Frühlingswochenende Alpenmodus in Ischgl — wer ist dabei?",
    hashtags: ["#Ischgl", "#KurzMalWeg", "#Alpenmodus"],
    springHashtags: ["#Ischgl", "#Frühlingsauszeit", "#KurzMalWeg"],
    reasoning:
      "A fictional domestic weekend audience fits a short January getaway. An assumed 21-day booking lead places promotion in December; convenience is a creative hypothesis, not measured behavior.",
    holidayAssumption:
      "The weekend timing is a demo assumption, not evidence of a confirmed public holiday, live event or offer.",
    springReasoning:
      "This generated mock variation focuses on an Austrian May weekend outdoors. A 21-day assumed booking lead places promotion in late April; no public holiday or event is claimed.",
    image: atWinter,
    springImage: atSpring,
    alt: "Original cheerful Alpine marmot in a red beanie skiing down an illustrated snowy slope",
    springAlt:
      "Original cheerful Alpine marmot in a red beanie hiking through a spring mountain meadow",
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
  async getRecommendation(market: SourceMarket, period: TravelPeriod): Promise<CampaignRecommendation> {
    return this.getImmediateRecommendation(market, period);
  }
  getImmediateRecommendation(
    market: SourceMarket,
    period: TravelPeriod,
  ): CampaignRecommendation {
    const scenario = SCENARIOS[market];
    if (!scenario || !["q1-2027", "q2-2027", "winter-2026-27"].includes(period))
      throw new Error("Choose a supported source market and travel period.");
    const spring = period === "q2-2027";
    const travel = {
      ...(spring
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
    const asset: CampaignAsset = {
      id: `${market.toLowerCase()}-${spring ? "spring" : "winter"}`,
      src: spring ? scenario.springImage : scenario.image,
      alt: spring ? scenario.springAlt : scenario.alt,
      source: "ORIGINAL_ILLUSTRATION",
      credit:
        "Original artwork created for this prototype. No third-party meme photographs.",
      description:
        "Meme-inspired fictional illustration; not a photograph or a representation of verified resort conditions.",
    };
    const recommendation: CampaignRecommendation = {
      id: `campaign-${market}-${period}-v1`,
      market,
      country: scenario.country,
      period,
      title: spring
        ? `${scenario.country}: a spring Alpine escape`
        : scenario.title,
      ageGroup: scenario.ageGroup,
      segment: scenario.segment,
      assumedLeadDays: scenario.lead,
      travel,
      campaign: { start, end, label: "Recommended promotion window" },
      publishingDates,
      timezone: "Europe/Vienna",
      platform: "Instagram",
      theme: spring
        ? "Meme-inspired spring escape · mock variation"
        : scenario.theme,
      language: scenario.language,
      languageLabel: scenario.languageLabel,
      caption: spring ? scenario.springCaption : scenario.caption,
      hashtags: [...(spring ? scenario.springHashtags : scenario.hashtags)],
      reasoning: spring ? scenario.springReasoning : scenario.reasoning,
      detailedReasoning: [
        `Audience: ${scenario.ageGroup}-year-old ${scenario.segment.toLowerCase()} are an assigned fictional marketing segment, not inferred guest demographics.`,
        `Timing: target arrival ${displayDate(travel.start)} minus ${scenario.lead} assumed booking days gives ${displayDate(start)}. This 8-day promotion window ends before the target travel period.`,
        spring
          ? "Spring calendar overlap is unverified. This is a fictional travel window, not a confirmed holiday or event opportunity."
          : scenario.holidayAssumption,
        "The supplied historical-booking narrative is an assumption, not an analysis of the dashboard’s live or uploaded overnight-stay data.",
      ],
      assumptions: [
        "Fictional campaign scenario. Audience, lead time and booking behavior are demo assumptions.",
        "Publishing at 18:00 Europe/Vienna is illustrative, not account engagement analysis.",
        ...(spring
          ? [
              "Spring variation: weather, snow cover, lift operation and available experiences are not verified.",
            ]
          : [
              "Snow cover, lift operation, availability and holiday calendars require checking before any real campaign.",
            ]),
        "Approval and scheduling are simulated locally; nothing is sent to Instagram.",
      ],
      asset,
      captionContent: {
        text: spring ? scenario.springCaption : scenario.caption,
        hashtags: [...(spring ? scenario.springHashtags : scenario.hashtags)],
        language: scenario.language,
        source: "demo_fallback",
      },
      captionMetadata: {
        country: scenario.country,
        language: scenario.language,
        ageMin: Number(scenario.ageGroup.split("–")[0]),
        ageMax: Number(scenario.ageGroup.split("–")[1]),
        season: spring ? "spring" : "winter",
        activity: spring
          ? "Alpine mountain getaway"
          : "skiing and winter sports",
        destination: "Paznaun-Ischgl",
        creativeTheme: spring ? "Meme-inspired spring escape" : scenario.theme,
        objective: "inspire_travel",
        visualDescription: asset.alt,
      },
      fictional: true,
      variation: spring,
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
