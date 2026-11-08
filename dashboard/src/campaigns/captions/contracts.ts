import type { WindowEvidence } from "../opportunity/ranking";
import { validTravelDates } from "../travelDates";
import type { TourismContext } from "../demand/contracts";
import { socialProfile } from "../socialProfile";
import { creativeCandidates, seasonFromTravelDate, type AssetCandidate } from "../assetCatalog";
import type { SocialPlatform, CaptionLength } from "../socialProfile";
export interface CaptionMetadata {
  sourceSnapshot?: string;
  opportunityEvidence?: WindowEvidence;
  tourismContext?: TourismContext;
  country: string;
  language: string;
  ageMin: number;
  ageMax: number;
  season: string;
  activity: string;
  destination: string;
  creativeTheme: string;
  objective: string;
  generationMode?: "creative";
  travelPeriod?: string;
  travelDates?: { start: string; end: string; };
  candidateAssets?: AssetCandidate[];
  assetId?: string;
  visualDescription?: string;
  platform?: SocialPlatform;
  targetCaptionLength?: CaptionLength;
  tone?: string;
}
export interface GeneratedCaption {
  caption: string;
  hashtags: string[];
  language: string;
}
export interface GeneratedCreative extends GeneratedCaption {
  assetId: string;
  platform: "tiktok" | "instagram" | "facebook";
  creativeReason: string;
  campaignReasoning?: string;
}
export interface AiCaption extends GeneratedCaption {
  assetId?: string;
  platform?: GeneratedCreative["platform"];
  creativeReason?: string;
  campaignReasoning?: string;
  source: "ai";
}
export class CaptionError extends Error {
  constructor(
    message: string,
    readonly code = "INVALID_METADATA",
    readonly status = 422,
  ) {
    super(message);
  }
}
const required = [
  "country",
  "language",
  "ageMin",
  "ageMax",
  "season",
  "activity",
  "destination",
  "creativeTheme",
  "objective",
];
const limits: Record<string, number> = {
  country: 80,
  language: 35,
  season: 60,
  activity: 160,
  destination: 120,
  creativeTheme: 200,
  objective: 120,
  visualDescription: 600,
  assetId: 120,
};
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
export function normalizeMetadata(value: unknown): CaptionMetadata {
  if (
    !object(value) ||
    required.some((key) => !(key in value)) ||
    Object.keys(value).some(
      (key) => ![...required, "visualDescription", "assetId", "platform", "targetCaptionLength", "tone", "generationMode", "travelPeriod", "travelDates", "candidateAssets", "tourismContext", "opportunityEvidence", "sourceSnapshot"].includes(key),
    )
  )
    throw new CaptionError("Provide the supported campaign metadata fields.");
  const result: Record<string, unknown> = {};
  for (const [key, max] of Object.entries(limits)) {
    const raw = value[key];
    if ((key === "visualDescription" || key === "assetId") && raw === undefined) continue;
    if (typeof raw !== "string") throw new CaptionError(`${key} must be text.`);
    const text = raw.normalize("NFKC").trim().replace(/\s+/g, " ");
    if (!text || text.length > max || /[\u0000-\u0008\u000e-\u001f]/.test(text))
      throw new CaptionError(`${key} must contain 1–${max} valid characters.`);
    result[key] = text;
  }
  for (const key of ["ageMin", "ageMax"]) {
    const age = value[key];
    if (
      typeof age !== "number" ||
      !Number.isInteger(age) ||
      age < 18 ||
      age > 100
    )
      throw new CaptionError("Campaign audiences must be adults aged 18–100.");
    result[key] = age;
  }
  if ((result.ageMin as number) > (result.ageMax as number))
    throw new CaptionError("ageMin cannot exceed ageMax.");
  if (!/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(result.language as string))
    throw new CaptionError("language must be a BCP 47 language code.");
  try {
    result.language = new Intl.Locale(result.language as string).toString();
  } catch {
    throw new CaptionError("Invalid language code.");
  }
  if (value.platform !== undefined || value.targetCaptionLength !== undefined || value.tone !== undefined) {
    if (!["TikTok", "Instagram", "Facebook"].includes(value.platform as string) ||
        !object(value.targetCaptionLength) || Object.keys(value.targetCaptionLength).sort().join(",") !== "max,min" ||
        !Number.isInteger(value.targetCaptionLength.min) || !Number.isInteger(value.targetCaptionLength.max) ||
        (value.targetCaptionLength.min as number) < 1 || (value.targetCaptionLength.max as number) > 350 ||
        (value.targetCaptionLength.min as number) > (value.targetCaptionLength.max as number) ||
        typeof value.tone !== "string" || !value.tone.trim() || value.tone.length > 600)
      throw new CaptionError("Provide a valid platform, caption length and tone together.");
    result.platform = value.platform;
    result.targetCaptionLength = { min: value.targetCaptionLength.min, max: value.targetCaptionLength.max };
    result.tone = value.tone.normalize("NFKC").trim().replace(/\s+/g, " ");
  }
  if (value.generationMode !== undefined || value.candidateAssets !== undefined || value.travelDates !== undefined || value.travelPeriod !== undefined) {
    if (value.generationMode !== "creative" || typeof value.travelPeriod !== "string" || !/^(q[1-4]-2027|winter-2026-27|custom)$/.test(value.travelPeriod) ||
        !object(value.travelDates) || Object.keys(value.travelDates).sort().join(",") !== "end,start" ||
        ![value.travelDates.start,value.travelDates.end].every(date => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date) ||
        (value.travelDates.start as string) > (value.travelDates.end as string) || !value.platform || !value.tone || !value.targetCaptionLength)
      throw new CaptionError("Provide creative targeting, platform and valid travel dates.");
    const season = seasonFromTravelDate(value.travelDates.start as string);
    if (season !== result.season) throw new CaptionError("The campaign season must match the target travel dates.");
    let candidates: AssetCandidate[];
    try { candidates = creativeCandidates(result.ageMin as number,season); }
    catch { throw new CaptionError("No compatible creative assets exist for this audience."); }
    if (!Array.isArray(value.candidateAssets) || value.candidateAssets.length !== candidates.length ||
        candidates.some(candidate => !(value.candidateAssets as unknown[]).some((raw: unknown) => object(raw) &&
          Object.keys(raw).sort().join(",") === Object.keys(candidate).sort().join(",") &&
          Object.entries(candidate).every(([key,value]) => raw[key] === value))))
      throw new CaptionError("Use the compatible assets from the campaign library without altering their metadata.");
    const profile = socialProfile(result.ageMin as number);
    if (candidates[0].ageGroup !== `${result.ageMin}–${result.ageMax}` || result.platform !== profile.platform)
      throw new CaptionError("Use the platform recommended for the selected adult audience.");
    result.assetId = candidates[0].id;
    result.activity = candidates[0].activity;
    result.creativeTheme = candidates[0].creativeTheme;
    result.visualDescription = candidates[0].visualDescription;
    result.generationMode = "creative";
    result.travelPeriod = value.travelPeriod;
    result.travelDates = { start:value.travelDates.start, end:value.travelDates.end };
    result.candidateAssets = candidates;
  }
  if (value.tourismContext !== undefined) {
    const context = value.tourismContext;
    const keys = "averageStayNights,demandGrade,destination,end,guestNights,guests,isEstimate,leadTimeDays,leadTimeGrade,leadTimeMethod,origin,reasons,source,start,stayGrade,stayMethod";
    if (!object(context) || Object.keys(context).sort().join(",") !== keys || context.source !== "c04-api" || context.destination !== "Paznaun-Ischgl" ||
        typeof context.origin !== "string" || !["DE","25","62","AT"].includes(context.origin) ||
        !object(value.travelDates) || context.start !== value.travelDates.start || context.end !== value.travelDates.end ||
        !["demandGrade","leadTimeGrade","stayGrade"].every(key => ["A","B","C","D"].includes(String(context[key]))) || typeof context.isEstimate !== "boolean" ||
        !["guestNights","guests","leadTimeDays"].every(key => typeof context[key] === "number" && Number.isFinite(context[key]) && (context[key] as number) >= 0 && (context[key] as number) <= 1e9) ||
        !Number.isInteger(context.leadTimeDays) || (context.leadTimeDays as number) > 730 ||
        !(context.averageStayNights === null || (typeof context.averageStayNights === "number" && Number.isFinite(context.averageStayNights) && context.averageStayNights >= 0 && context.averageStayNights <= 1000)) ||
        !["leadTimeMethod","stayMethod"].every(key => typeof context[key] === "string" && (context[key] as string).length <= 300) ||
        !Array.isArray(context.reasons) || context.reasons.length > 5 || context.reasons.some(reason => typeof reason !== "string" || reason.length > 240))
      throw new CaptionError("Provide bounded tourism evidence for the selected period.");
    const originForCountry: Record<string,string> = {Germany:"DE",Netherlands:"25",Belgium:"62",Austria:"AT"};
    if (context.origin !== originForCountry[result.country as string]) throw new CaptionError("Tourism evidence must match the selected country.");
    result.tourismContext = { ...context, reasons: [...context.reasons] };
  }
  if (value.opportunityEvidence !== undefined) {
    const evidence = value.opportunityEvidence;
    if (!object(evidence) || Object.keys(evidence).sort().join(",") !== "analysisEnd,analysisStart,awarenessBufferDays,days,end,estimatedOccupancy,leadOpportunityPassed,marketEvidence,spareBedNights,start" ||
        !object(value.travelDates) || !value.tourismContext || evidence.start !== value.travelDates.start || evidence.end !== value.travelDates.end ||
        typeof evidence.analysisStart !== "string" || typeof evidence.analysisEnd !== "string" || !validTravelDates({start:evidence.analysisStart,end:evidence.analysisEnd}) ||
        evidence.analysisStart > (evidence.start as string) || evidence.analysisEnd < (evidence.end as string) ||
        ![3,5,7].includes(evidence.days as number) || (Date.parse(evidence.end as string)-Date.parse(evidence.start as string))/86400000+1 !== evidence.days ||
        typeof evidence.estimatedOccupancy !== "number" || !Number.isFinite(evidence.estimatedOccupancy) || evidence.estimatedOccupancy < 0 || evidence.estimatedOccupancy >= 1 ||
        typeof evidence.spareBedNights !== "number" || !Number.isFinite(evidence.spareBedNights) || evidence.spareBedNights < 0 || evidence.spareBedNights > 1e10 ||
        !Number.isInteger(evidence.awarenessBufferDays) || (evidence.awarenessBufferDays as number) < 0 || (evidence.awarenessBufferDays as number) > 30 ||
        typeof evidence.marketEvidence !== "boolean" || typeof evidence.leadOpportunityPassed !== "boolean")
      throw new CaptionError("Provide valid forecast-window evidence within the selected analysis period.");
    result.opportunityEvidence = {...evidence};
  }
  if(value.sourceSnapshot !== undefined){
    if(typeof value.sourceSnapshot !== "string" || !value.sourceSnapshot.trim() || value.sourceSnapshot.length>400)throw new CaptionError("Provide a valid data snapshot identifier.");
    result.sourceSnapshot=value.sourceSnapshot.trim();
  }
  return result as unknown as CaptionMetadata;
}
export function metadataKey(metadata: CaptionMetadata): string {
  const normalized = normalizeMetadata(metadata);
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(normalized).sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
}
export function validateGenerated(
  value: unknown,
  language: string,
  length = { min: 1, max: 220 },
): GeneratedCaption {
  const fail = () =>
    new CaptionError(
      "The AI returned an incomplete or invalid caption. Please retry.",
      "INVALID_AI_RESPONSE",
      502,
    );
  if (
    !object(value) ||
    Object.keys(value).sort().join(",") !== "caption,hashtags,language"
  )
    throw fail();
  if (
    typeof value.caption !== "string" ||
    !value.caption.trim() ||
    Array.from(value.caption.trim()).length > length.max ||
    Array.from(value.caption.trim()).length < length.min ||
    /(?:^|\s)#[\p{L}\p{N}_]+/u.test(value.caption)
  )
    throw fail();
  if (typeof value.language !== "string" || value.language !== language)
    throw fail();
  if (
    !Array.isArray(value.hashtags) ||
    value.hashtags.length < 2 ||
    value.hashtags.length > 4 ||
    value.hashtags.some(
      (tag) =>
        typeof tag !== "string" ||
        Array.from(tag).length > 60 ||
        !/^#[\p{L}\p{M}\p{N}_]+$/u.test(tag),
    )
  )
    throw fail();
  if (
    new Set(value.hashtags.map((tag) => (tag as string).toLowerCase())).size !==
    value.hashtags.length
  )
    throw fail();
  return {
    caption: value.caption.trim(),
    hashtags: [...value.hashtags] as string[],
    language: value.language,
  };
}
export function validateAiCaption(value: unknown, language: string, length?: CaptionLength, metadata?: CaptionMetadata): AiCaption {
  if (metadata?.generationMode === "creative") {
    if (!object(value) || value.source !== "ai") throw new CaptionError("Invalid creative response.","INVALID_AI_RESPONSE",502);
    const {source: _source,...creative} = value;
    return {...validateCreative(creative,metadata),source:"ai"};
  }
  if (
    !object(value) ||
    value.source !== "ai" ||
    Object.keys(value).some(
      (key) => !["caption", "hashtags", "language", "source"].includes(key),
    )
  )
    throw new CaptionError(
      "The caption service returned an invalid response.",
      "INVALID_AI_RESPONSE",
      502,
    );
  return {
    ...validateGenerated(
      {
        caption: value.caption,
        hashtags: value.hashtags,
        language: value.language,
      },
      language,
      length,
    ),
    source: "ai",
  };
}
export function validateCreative(value: unknown, metadata: CaptionMetadata): GeneratedCreative {
  const fail = () => new CaptionError("The AI returned an invalid or incompatible creative. Your previous post is unchanged.","INVALID_AI_RESPONSE",502);
  if (!object(value) || Object.keys(value).sort().join(",") !== (metadata.tourismContext ? "assetId,campaignReasoning,caption,creativeReason,hashtags,language,platform" : "assetId,caption,creativeReason,hashtags,language,platform")) throw fail();
  if (metadata.tourismContext && (typeof value.campaignReasoning !== "string" || Array.from(value.campaignReasoning.trim()).length < 160 || Array.from(value.campaignReasoning.trim()).length > 420)) throw fail();
  const asset = metadata.candidateAssets?.find(candidate => candidate.id === value.assetId);
  if (!asset || value.platform !== metadata.platform?.toLowerCase() || typeof value.creativeReason !== "string" ||
      !value.creativeReason.trim() || Array.from(value.creativeReason.trim()).length > 240) throw fail();
  const caption = validateGenerated({caption:value.caption,hashtags:value.hashtags,language:value.language},metadata.language,metadata.targetCaptionLength);
  const text = caption.caption.toLowerCase();
  // Conservative deterministic checks for obvious visual contradictions, not semantic proof.
  const catPattern = metadata.language.startsWith("fr") ? /\b(?:chat|chats|chaton|miaou)\b/u : metadata.language.startsWith("nl") ? /\b(?:kat|katten|kitten|miauw)\b/u : /\b(?:cat|cats|kitten|katze|katzen|kater|miau)\b/u;
  if (!asset.ageGroup.startsWith("18–") && catPattern.test(text)) throw fail();
  if (asset.season !== "winter" && /\b(?:ski|skiing|skifahren|skifahrt|skifahrer|snowboard|snowboarding|piste|pisten|pistes|skien|skiën)\b/u.test(text)) throw fail();
  return { ...caption, assetId:asset.id, platform:value.platform as GeneratedCreative["platform"],creativeReason:value.creativeReason.trim(), ...(metadata.tourismContext ? { campaignReasoning:(value.campaignReasoning as string).trim() } : {}) };
}
export function validateProviderResult(value: unknown, metadata: CaptionMetadata): GeneratedCaption | GeneratedCreative {
  return metadata.generationMode === "creative" ? validateCreative(value,metadata) : validateGenerated(value,metadata.language,metadata.targetCaptionLength);
}
