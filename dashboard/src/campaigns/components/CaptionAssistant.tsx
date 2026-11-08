import { useEffect, useState } from "react";
import type { CampaignRecommendation } from "../types";
import type { CaptionAssistantState } from "../captions/useCaptionAssistant";
export default function CaptionAssistant({
  campaign,
  assistant,
}: {
  campaign: CampaignRecommendation;
  assistant: CaptionAssistantState;
}) {
  const [copyStatus, setCopyStatus] = useState("");
  const result = assistant.result;
  const caption = result?.caption || campaign.caption;
  const hashtags = result?.hashtags || campaign.hashtags;
  useEffect(() => {
    setCopyStatus("");
  }, [caption, hashtags.join(" "), campaign.id]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        `${caption}\n\n${hashtags.join(" ")}`,
      );
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Copy unavailable. Select and copy the caption text.");
    }
  };
  return (
    <>
      <div className="cp-caption-top">
        <span className={`cp-caption-source ${assistant.source === "demo_fallback" ? "demo" : "ai"}`}>
          {assistant.source === "live_ai" ? "AI generated" : assistant.source === "pre_generated" ? "Pre-generated AI caption" : "Demo preview"}
        </span>

      </div>
      <small className="cp-caption-copy-status">{campaign.platform} · {campaign.captionMetadata.targetCaptionLength?.min}–{campaign.captionMetadata.targetCaptionLength?.max} characters · demo recommendation</small>
      <p className="cp-caption-text" lang={campaign.language}>
        {caption}
      </p>
      <p className="cp-hashtags" lang={campaign.language}>
        {hashtags.join(" ")}
      </p>
      {assistant.source === "demo_fallback" && <p className="cp-caption-copy-status">Demo voice for ages {campaign.ageGroup} · {campaign.platform}. Regenerate for AI personalization.</p>}
      <div className="cp-caption-actions">
        <button
          className="link"
          onClick={assistant.regenerate}
          disabled={assistant.pending}
          title="Generate a new caption with AI"
          aria-label={assistant.pending ? "Regenerating caption" : assistant.error ? "Retry" : "Regenerate"}
        >
          <svg className={assistant.pending ? "cp-caption-spinner" : ""} width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M13 6a5 5 0 1 0 0 4M13 2v4H9" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          {assistant.pending ? "Regenerating…" : assistant.error ? "Retry" : "Regenerate"}
        </button>
        <button className="link" onClick={() => void copy()}>
          Copy caption
        </button>
      </div>
      {assistant.error && (
        <p className="cp-caption-error" role="status">
          {assistant.error}
          {" Your previous caption is unchanged."}
        </p>
      )}
      {copyStatus && (
        <p className="cp-caption-copy-status" role="status">
          {copyStatus}
        </p>
      )}
    </>
  );
}
