import ArrowIcon from "./ArrowIcon";
import type { CampaignRecommendation } from "../types";
export default function CampaignReasoning({
  campaign,
}: {
  campaign: CampaignRecommendation;
}) {
  return (
    <section className="cp-reasoning" aria-labelledby="cp-reasoning-heading">
      <h3 id="cp-reasoning-heading">
        <span aria-hidden="true">✦</span> Why this campaign?
      </h3>
      {campaign.reasoningSource && <small className="cp-reason-source">{campaign.reasoningSource === "ai" ? "AI reasoning" : "Data summary"}</small>}
      <p>{campaign.reasoning}</p>
      <details key={campaign.id}>
        <summary>
          View detailed reasoning{" "}
          <span>
            <ArrowIcon />
          </span>
        </summary>
        <ul>
          {campaign.detailedReasoning.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
