import { useEffect, useRef } from "react";
import type { CampaignApproval, CampaignRecommendation, CampaignCaption } from "../types";
import {
  displayDate,
  displayPublishingDate,
  displayRange,
} from "../mockCampaignData";
export default function CampaignReviewDialog({
  campaign,
  approval,
  onApprove,
  onClose,
  captionSource = "demo_fallback",
}: {
  campaign: CampaignRecommendation;
  approval?: CampaignApproval;
  onApprove: () => void;
  onClose: () => void;
  captionSource?: CampaignCaption["source"];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    if (node && !node.open) node.showModal();
    return () => {
      node?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      className="cp-review"
      ref={dialog}
      aria-labelledby="cp-review-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="cp-review-heading">
        <div>
          <p className="eyebrow">Campaign review / {campaign.market}</p>
          <h2 id="cp-review-title">Ready for a human yes?</h2>
        </div>
        <button
          className="cp-close"
          aria-label="Close campaign review"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="cp-review-content">
        <div className="cp-review-intro">
          <span className="status sample">Fictional demo</span>
          <h3>{campaign.country} campaign</h3>
          <p>
            {campaign.country} · {campaign.ageGroup} years
          </p>
        </div>
        <dl className="cp-review-facts">
          <div>
            <dt>Guests travel</dt>
            <dd>{displayRange(campaign.travel)}</dd>
          </div>
          <div>
            <dt>Campaign window</dt>
            <dd>{displayRange(campaign.campaign)}</dd>
          </div>
          <div>
            <dt>Booking lead</dt>
            <dd>{campaign.assumedLeadDays} days · assumption</dd>
          </div>
          <div>
            <dt>Channel &amp; language</dt>
            <dd>
              {campaign.platform} · {campaign.languageLabel}
            </dd>
          </div>
        </dl>
        <section className="cp-publishing">
          <h3>Proposed publishing dates</h3>
          <p className="small muted">
            Three content slots · {campaign.timezone} · assumed 18:00 posting
            hour
          </p>
          <ol>
            {campaign.publishingDates.map((date, index) => (
              <li key={date}>
                <span>0{index + 1}</span>
                <strong>{displayPublishingDate(date)}</strong>
                <small>
                  {
                    [
                      "Introduce the idea",
                      "Build consideration",
                      "Invite trip planning",
                    ][index]
                  }
                </small>
              </li>
            ))}
          </ol>
        </section>
        <section className="cp-review-post">
          <img src={campaign.asset.src} alt={campaign.asset.alt} />
          <div>
            <h3>
              Caption to approve{" "}
              <span className="cp-caption-source">
                {captionSource === "live_ai" ? "AI generated" : captionSource === "pre_generated" ? "Pre-generated AI caption" : "Generic preview · not age-personalized"}
              </span>
            </h3>
            <p lang={campaign.language}>{campaign.caption}</p>
            <p className="cp-hashtags" lang={campaign.language}>
              {campaign.hashtags.join(" ")}
            </p>
            <small>{campaign.asset.credit}</small>
          </div>
        </section>
        <details className="cp-review-assumptions">
          <summary>Check the assumptions</summary>
          <ul>
            {campaign.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
          <p>{campaign.asset.description}</p>
        </details>
        {approval && (
          <div className="cp-review-confirmation" role="status">
            <strong>✓ Campaign approved locally</strong>
            <p>
              Approved {displayDate(approval.approvedAt)}. The proposed dates
              are saved in this Overview session; no Instagram post or real
              schedule has been created.
            </p>
          </div>
        )}
      </div>
      <div className="cp-review-actions">
        <button className="btn ghost" onClick={onClose}>
          {approval ? "Done" : "Back to planner"}
        </button>
        <button className="btn" onClick={onApprove} disabled={!!approval}>
          {approval ? "Approved locally ✓" : "Approve mock campaign"}
        </button>
      </div>
    </dialog>
  );
}
