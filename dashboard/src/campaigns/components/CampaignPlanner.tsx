import type { CaptionAssistantState } from "../captions/useCaptionAssistant";
import ArrowIcon from "./ArrowIcon";
import type { CampaignApproval, CampaignRecommendation } from "../types";
import { displayRange } from "../mockCampaignData";
import CampaignReasoning from "./CampaignReasoning";
import SocialPostPreview, { PlatformIcon } from "./SocialPostPreview";
export default function CampaignPlanner({
  campaign,
  approval,
  onReview,
  assistant,
}: {
  campaign: CampaignRecommendation;
  approval?: CampaignApproval;
  onReview: () => void;
  assistant: CaptionAssistantState;
}) {
  return (
    <section className="card cp-planner" aria-labelledby="cp-planner-heading">
      <div className="card-head">
        <div>
          <p className="eyebrow">02 / A story for your market</p>
          <h2 id="cp-planner-heading">Campaign planner</h2>
        </div>
        <span className={`status ${approval ? "connected" : "snapshot"}`}>
          {approval ? "Approved · demo" : campaign.windowRecommendation?.status === "suggested" ? "Suggested dates" : campaign.windowRecommendation?.status === "unavailable" ? "Analysis-only preview" : campaign.dataStatus === "ready" ? "Data-informed proposal" : "Creative preview"}
        </span>
      </div>
      <div className="cp-plan-title">
        <span className="cp-market-code">{campaign.market}</span>
        <div>
          <h3>{campaign.country}</h3>
        </div>
        <span className="cp-platform">
          <PlatformIcon platform={campaign.platform} /> {campaign.platform}
        </span>
      </div>
      <dl className="cp-summary">
        <div>
          <dt>Selected target audience</dt>
          <dd>{campaign.ageGroup} years</dd>
        </div>
        <div>
          <dt>Booking lead time</dt>
          <dd>{(campaign.dataStatus && campaign.dataStatus !== "ready") || campaign.windowRecommendation?.status === "loading" ? "—" : `${campaign.assumedLeadDays} days`}</dd>
        </div>
        <div>
          <dt>{campaign.windowRecommendation?.status === "suggested" ? "Suggested travel dates" : "Recommended travel dates"}</dt>
          <dd>{campaign.windowRecommendation?.status === "suggested" && campaign.windowRecommendation.suggestedDates ? displayRange({...campaign.windowRecommendation.suggestedDates,label:""}) : campaign.windowRecommendation?.status === "ready" ? displayRange(campaign.travel) : campaign.windowRecommendation?.status === "loading" ? "Finding a window…" : campaign.windowRecommendation ? "No supported window" : displayRange(campaign.travel)}</dd>
        </div>
        <div className="cp-campaign-dates">
          <dt>{campaign.windowRecommendation?.status === "suggested" ? "Suggested campaign" : "Recommended campaign"}</dt>
          <dd>{(campaign.dataStatus && campaign.dataStatus !== "ready") || campaign.windowRecommendation?.timingAvailable === false || (campaign.windowRecommendation && !["ready","suggested"].includes(campaign.windowRecommendation.status)) ? "—" : displayRange(campaign.campaign)}</dd>
        </div>
        {campaign.dataStatus && <><div><dt>Average stay</dt><dd>{campaign.tourismContext?.averageStayNights != null ? `${campaign.tourismContext.averageStayNights.toFixed(1)} nights` : "—"}</dd></div><div><dt>{(campaign.windowRecommendation?.status === "ready" || campaign.windowRecommendation?.timingAvailable === true) ? "Window guest nights · estimate" : "Analysis guest nights · estimate"}</dt><dd>{campaign.tourismContext ? campaign.tourismContext.guestNights.toLocaleString("en-GB") : "—"}</dd></div></>}
        {campaign.analysisPeriod && <div><dt>Analysis period</dt><dd>{displayRange(campaign.analysisPeriod)}</dd></div>}
      </dl>
      {campaign.windowRecommendation?.leadOpportunityPassed && <p className="cp-window-status" role="status">Booking lead-time opportunity has passed. Review a shorter-lead campaign strategy.</p>}
      {!campaign.windowRecommendation?.leadOpportunityPassed && campaign.windowRecommendation?.awarenessStarted && <p className="cp-window-status" role="status">The awareness period has already started.</p>}
      {campaign.windowRecommendation?.status === "unavailable" && <p className="cp-window-status" role="status">{campaign.windowRecommendation.message} Analysis-period creative preview only.</p>}
      {campaign.windowRecommendation?.status === "suggested" && <p className="cp-window-status" role="status">{campaign.windowRecommendation.message}</p>}
      <SocialPostPreview campaign={campaign} assistant={assistant} />
      <div className="cp-plan-action">
        <button className="btn" disabled={(!!campaign.dataStatus && campaign.dataStatus !== "ready") || campaign.windowRecommendation?.timingAvailable === false || (!!campaign.windowRecommendation && !["ready","suggested"].includes(campaign.windowRecommendation.status))} onClick={onReview}>
          Review &amp; Schedule <ArrowIcon />
        </button>
        <span className={approval ? "cp-approved" : "muted"} role="status">
          {approval
            ? "✓ Approved locally · no real publishing"
            : "Human review first. Nothing publishes automatically."}
        </span>
      </div>
      <CampaignReasoning campaign={campaign} />
    </section>
  );
}
