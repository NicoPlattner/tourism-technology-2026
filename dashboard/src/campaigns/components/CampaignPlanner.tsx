import ArrowIcon from "./ArrowIcon";
import type { CampaignApproval, CampaignRecommendation } from "../types";
import { displayRange } from "../mockCampaignData";
import CampaignReasoning from "./CampaignReasoning";
import SocialPostPreview, { InstagramIcon } from "./SocialPostPreview";
export default function CampaignPlanner({
  campaign,
  approval,
  onReview,
}: {
  campaign: CampaignRecommendation;
  approval?: CampaignApproval;
  onReview: () => void;
}) {
  return (
    <section className="card cp-planner" aria-labelledby="cp-planner-heading">
      <div className="card-head">
        <div>
          <p className="eyebrow">02 / A story for your market</p>
          <h2 id="cp-planner-heading">AI campaign planner</h2>
        </div>
        <span className={`status ${approval ? "connected" : "snapshot"}`}>
          {approval ? "Approved · demo" : "Mock proposal"}
        </span>
      </div>
      <div className="cp-plan-title">
        <span className="cp-market-code">{campaign.market}</span>
        <div>
          <h3>{campaign.country}</h3>
        </div>
        <span className="cp-platform">
          <InstagramIcon /> Instagram
        </span>
      </div>
      <dl className="cp-summary">
        <div>
          <dt>Target audience</dt>
          <dd>{campaign.ageGroup} years</dd>
          <small>{campaign.segment}</small>
        </div>
        <div>
          <dt>Booking lead time</dt>
          <dd>
            {campaign.assumedLeadDays} days <span>assumed</span>
          </dd>
          <small>Fictional booking behavior</small>
        </div>
        <div>
          <dt>Guests travel</dt>
          <dd>{campaign.travel.label}</dd>
          <small>{displayRange(campaign.travel)}</small>
        </div>
        <div className="cp-campaign-dates">
          <dt>Recommended campaign</dt>
          <dd>{displayRange(campaign.campaign)}</dd>
          <small>Marketing runs before travel</small>
        </div>
      </dl>
      <CampaignReasoning campaign={campaign} />
      <SocialPostPreview campaign={campaign} />
      <div className="cp-plan-action">
        <button className="btn" onClick={onReview}>
          Review &amp; Schedule <ArrowIcon />
        </button>
        <span className={approval ? "cp-approved" : "muted"} role="status">
          {approval
            ? "✓ Approved locally · no real publishing"
            : "Human review first. Nothing publishes automatically."}
        </span>
      </div>
    </section>
  );
}
