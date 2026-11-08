import CaptionAssistant from "./CaptionAssistant";
import type { CaptionAssistantState } from "../captions/useCaptionAssistant";
import type { CampaignRecommendation } from "../types";
export function InstagramIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r=".8" fill="currentColor" />
    </svg>
  );
}
export function PlatformIcon({ platform }: { platform: CampaignRecommendation["platform"] }) {
  if (platform === "Instagram") return <span data-platform-icon={platform}><InstagramIcon /></span>;
  return <svg data-platform-icon={platform} width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    {platform === "Facebook" ? <path d="M14 22v-9h3l.5-4H14V7c0-1 .3-2 2-2h2V1.5A22 22 0 0 0 15 1c-3 0-5 2-5 5v3H7v4h3v9z" /> : <path d="M16 2h-4v13a3 3 0 1 1-3-3V8a7 7 0 1 0 7 7V8a10 10 0 0 0 5 1V5c-3 0-5-2-5-3z" />}
  </svg>;
}
export default function SocialPostPreview({
  campaign,
  assistant,
}: {
  campaign: CampaignRecommendation;
  assistant: CaptionAssistantState;
}) {
  return (
    <section
      className="cp-social"
      aria-label={`${campaign.country} ${campaign.platform} post preview`}
    >
      <div className="cp-social-header">
        <span className="cp-social-avatar" aria-hidden="true">
          i.
        </span>
        <div>
          <strong>ischgl_inspiration</strong>
          <span>{campaign.platform} concept · {campaign.languageLabel}</span>
        </div>
        <PlatformIcon platform={campaign.platform} />
        <span className="cp-social-dots" aria-hidden="true">
          ···
        </span>
      </div>
      <img
        className="cp-social-image"
        src={campaign.asset.src}
        alt={campaign.asset.alt}
      />
      <div className="cp-social-copy">
        <div className="cp-social-marks" aria-hidden="true">
          <span>♡ &nbsp; ◯ &nbsp; ↗</span>
          <span>♧</span>
        </div>
        <CaptionAssistant campaign={campaign} assistant={assistant} />
        <small>
          {campaign.asset.source === "ORIGINAL_ILLUSTRATION"
            ? "Original meme-inspired illustration"
            : campaign.asset.source === "AI_GENERATED"
              ? "AI-generated concept · requires review"
              : "Uploaded campaign asset"}{" "}
          · fictional concept
        </small>
      </div>
    </section>
  );
}
