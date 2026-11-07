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
      aria-label={`${campaign.country} Instagram post preview`}
    >
      <div className="cp-social-header">
        <span className="cp-social-avatar" aria-hidden="true">
          i.
        </span>
        <div>
          <strong>ischgl_inspiration</strong>
          <span>Campaign concept · {campaign.languageLabel}</span>
        </div>
        <InstagramIcon />
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
