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
        <span className={`cp-caption-source ${result ? "ai" : "demo"}`}>
          {result ? "AI caption" : "Demo caption"}
        </span>
        {assistant.pending && (
          <span className="cp-caption-working" role="status">
            <svg
              className="cp-caption-spinner"
              width="11"
              height="11"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="8"
                cy="8"
                r="6"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray="25 13"
              />
            </svg>
            Generating…
          </span>
        )}
      </div>
      <p className="cp-caption-text" lang={campaign.language}>
        {caption}
      </p>
      <p className="cp-hashtags" lang={campaign.language}>
        {hashtags.join(" ")}
      </p>
      <div className="cp-caption-actions">
        <button
          className="link"
          onClick={assistant.regenerate}
          disabled={assistant.pending}
        >
          {assistant.error ? "Retry" : "Regenerate"}
        </button>
        <button className="link" onClick={() => void copy()}>
          Copy caption
        </button>
      </div>
      {assistant.error && (
        <p className="cp-caption-error" role="status">
          {assistant.error}
          {result ? " Your previous AI caption is unchanged." : ""}
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
