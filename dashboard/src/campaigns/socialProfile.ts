import { seasonalPreview } from "./seasonalPreview";
import type { CampaignSeason } from "./assetCatalog";
export type SocialPlatform = "TikTok" | "Instagram" | "Facebook";
export interface CaptionLength { min: number; max: number; }
export interface SocialProfile {
  platform: SocialPlatform;
  targetCaptionLength: CaptionLength;
  tone: string;
}
// Illustrative creative defaults, not measured platform preferences or demographic facts.
export const SOCIAL_PROFILES: Record<number, SocialProfile> = {
  18: { platform: "TikTok", targetCaptionLength: { min: 40, max: 100 },
    tone: "Short, punchy, meme-friendly. Internet-native vocabulary, playful absurdist humor, short punchlines, a few natural emojis and a casual invitation. Avoid forced slang." },
  25: { platform: "Instagram", targetCaptionLength: { min: 80, max: 160 },
    tone: "Relatable and playful. Conversational lifestyle vocabulary, relatable sarcasm, concise flowing sentences, restrained emojis and a casual invitation to a memorable trip." },
  35: { platform: "Instagram", targetCaptionLength: { min: 120, max: 220 },
    tone: "Experience-focused and informative. Clear conversational vocabulary, light humor, balanced sentences, minimal emojis and informative travel inspiration without invented facts." },
  45: { platform: "Facebook", targetCaptionLength: { min: 180, max: 350 },
    tone: "Descriptive and inviting. Natural conversational vocabulary, subtle wit, descriptive storytelling, occasional emojis and an inviting, informative call to explore. Avoid age stereotypes." },
};
export function socialProfile(ageMin: number): SocialProfile {
  return structuredClone(SOCIAL_PROFILES[ageMin] || SOCIAL_PROFILES[35]);
}
export function demoCaption(language: string, ageMin: number, season: CampaignSeason = "winter") {
  if (ageMin === 35) return seasonalPreview(language, season);
  const copy = language === "nl" ? [
    "POV: je hoofd zit al in de Alpen. Tijd voor een bergidee? 🏔️",
    "Nog één tabblad open, maar in gedachten al in de Alpen. Bewaar dit bergidee voor je volgende trip met je favoriete reisgenoot. 🏔️",
    "Een reis begint soms met een klein idee. Laat dit speelse beeld je inspireren om de Alpen op je eigen tempo te ontdekken en een moment voor jezelf te plannen.",
    "Even afstand nemen van de dagelijkse drukte begint met ruimte voor een nieuw reisidee. Dit speelse beeld nodigt uit om over de Alpen te dromen: het landschap, de kleine momenten en het plezier van samen op pad gaan. Ontdek welk bergverhaal bij jouw volgende reis past. 🏔️",
  ] : language === "fr" ? [
    "POV : ton esprit est déjà dans les Alpes. On rêve au prochain départ ? 🏔️",
    "Encore un onglet ouvert, mais l’esprit déjà dans les Alpes. Garde cette idée pour une prochaine escapade avec ta personne préférée. 🏔️",
    "Un voyage commence parfois par une simple idée. Cette image pleine d’humour invite à imaginer les Alpes à votre rythme, entre découverte et moments à partager.",
    "Prendre un peu de recul sur le quotidien commence parfois par une nouvelle idée de voyage. Cette image malicieuse invite à rêver aux Alpes, à leurs paysages et au plaisir des moments partagés. Laissez-vous inspirer et imaginez l’escapade qui vous ressemble. 🏔️",
  ] : [
    "POV: Kopf noch im Alltag, Gedanken schon in den Alpen. Wer kommt mit? 🏔️",
    "Noch ein Tab offen, aber gedanklich schon in den Alpen. Speichere dir diese Bergidee für den nächsten Trip mit deinem Lieblingsmenschen. 🏔️",
    "Eine Reise beginnt manchmal mit einer kleinen Idee. Dieses augenzwinkernde Bild lädt dazu ein, die Alpen im eigenen Tempo zu entdecken und gemeinsame Erlebnisse zu planen.",
    "Manchmal beginnt die Vorfreude auf eine Reise mit einem kleinen Schmunzeln. Dieses Bild lädt dazu ein, den Alltag gedanklich hinter sich zu lassen und von den Alpen zu träumen: von Landschaften, neuen Eindrücken und gemeinsamen Momenten. Entdecken Sie, welche Berggeschichte zu Ihrer nächsten Auszeit passt. 🏔️",
  ];
  const index = [18,25,35,45].indexOf(ageMin);
  return copy[Math.max(0,index)];
}
