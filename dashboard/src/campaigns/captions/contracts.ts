import { socialProfile } from "../socialProfile";
import { creativeCandidates, seasonFromTravelDate, type AssetCandidate } from "../assetCatalog";
import type { SocialPlatform, CaptionLength } from "../socialProfile";
export interface CaptionMetadata {
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
}
export interface AiCaption extends GeneratedCaption {
  assetId?: string;
  platform?: GeneratedCreative["platform"];
  creativeReason?: string;
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
      (key) => ![...required, "visualDescription", "assetId", "platform", "targetCaptionLength", "tone", "generationMode", "travelPeriod", "travelDates", "candidateAssets"].includes(key),
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
    if (value.generationMode !== "creative" || typeof value.travelPeriod !== "string" || !/^(q[1-4]-2027|winter-2026-27)$/.test(value.travelPeriod) ||
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
  if (!object(value) || Object.keys(value).sort().join(",") !== "assetId,caption,creativeReason,hashtags,language,platform") throw fail();
  const asset = metadata.candidateAssets?.find(candidate => candidate.id === value.assetId);
  if (!asset || value.platform !== metadata.platform?.toLowerCase() || typeof value.creativeReason !== "string" ||
      !value.creativeReason.trim() || Array.from(value.creativeReason.trim()).length > 240) throw fail();
  const caption = validateGenerated({caption:value.caption,hashtags:value.hashtags,language:value.language},metadata.language,metadata.targetCaptionLength);
  const text = caption.caption.toLowerCase();
  // Conservative deterministic checks for obvious visual contradictions, not semantic proof.
  const catPattern = metadata.language.startsWith("fr") ? /\b(?:chat|chats|chaton|miaou)\b/u : metadata.language.startsWith("nl") ? /\b(?:kat|katten|kitten|miauw)\b/u : /\b(?:cat|cats|kitten|katze|katzen|kater|miau)\b/u;
  if (!asset.ageGroup.startsWith("18–") && catPattern.test(text)) throw fail();
  if (asset.season !== "winter" && /\b(?:ski|skiing|skifahren|skifahrt|skifahrer|snowboard|snowboarding|piste|pisten|pistes|skien|skiën)\b/u.test(text)) throw fail();
  return { ...caption, assetId:asset.id, platform:value.platform as GeneratedCreative["platform"],creativeReason:value.creativeReason.trim() };
}
export function validateProviderResult(value: unknown, metadata: CaptionMetadata): GeneratedCaption | GeneratedCreative {
  return metadata.generationMode === "creative" ? validateCreative(value,metadata) : validateGenerated(value,metadata.language,metadata.targetCaptionLength);
}
