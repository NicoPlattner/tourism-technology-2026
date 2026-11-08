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
export interface AiCaption extends GeneratedCaption {
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
      (key) => ![...required, "visualDescription", "assetId", "platform", "targetCaptionLength", "tone"].includes(key),
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
export function validateAiCaption(value: unknown, language: string, length?: CaptionLength): AiCaption {
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
