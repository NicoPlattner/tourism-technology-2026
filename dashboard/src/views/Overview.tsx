import { useCaptionAssistant } from "../campaigns/captions/useCaptionAssistant";
import { useEffect, useState } from "react";
import type { ViewProps } from "../App";
import type {
  CampaignApproval,
  CampaignDataProvider,
  CampaignRecommendation,
  SourceMarket,
  TravelPeriod,
} from "../campaigns/types";
import { campaignDataProvider } from "../campaigns/mockCampaignData";
import SourceMarketMap from "../campaigns/components/SourceMarketMap";
import TravelPeriodSelector from "../campaigns/components/TravelPeriodSelector";
import CampaignPlanner from "../campaigns/components/CampaignPlanner";
import CampaignReviewDialog from "../campaigns/components/CampaignReviewDialog";
import "../campaigns/overview.css";

// The provider boundary is the only part that needs replacing for a real campaign service.
// Dashboard data and other pages remain independent of these explicitly fictional scenarios.
export default function Overview({
  provider = campaignDataProvider,
}: ViewProps & { provider?: CampaignDataProvider }) {
  const [market, setMarket] = useState<SourceMarket>("DE");
  const [period, setPeriod] = useState<TravelPeriod>("q1-2027");
  const [campaign, setCampaign] = useState<CampaignRecommendation | null>(null);
  const [approvals, setApprovals] = useState<Record<string, CampaignApproval>>(
    {},
  );
  const [review, setReview] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    setCampaign(null);
    setError("");
    setReview(false);
    provider
      .getRecommendation(market, period)
      .then((result) => {
        if (current) {
          if (result.market !== market || result.period !== period) {
            setError(
              "The campaign service returned a different market or period. Please retry.",
            );
            return;
          }
          setCampaign(result);
        }
      })
      .catch(() => {
        if (current)
          setError(
            "The campaign recommendation could not be loaded. Your approvals are unchanged.",
          );
      });
    return () => {
      current = false;
    };
  }, [market, period, provider, retry]);
  const currentCampaign =
    campaign?.market === market && campaign.period === period ? campaign : null;
  const assistant = useCaptionAssistant(currentCampaign?.captionMetadata);
  const visibleCampaign = currentCampaign
    ? {
        ...currentCampaign,
        caption: assistant.result?.caption || currentCampaign.caption,
        hashtags: assistant.result?.hashtags || currentCampaign.hashtags,
      }
    : null;
  const storedApproval = visibleCampaign
    ? approvals[visibleCampaign.id]
    : undefined;
  const visibleApproval =
    storedApproval &&
    visibleCampaign &&
    storedApproval.caption === visibleCampaign.caption &&
    JSON.stringify(storedApproval.hashtags) ===
      JSON.stringify(visibleCampaign.hashtags)
      ? storedApproval
      : undefined;
  const approve = () => {
    if (!visibleCampaign) return;
    setApprovals((previous) => ({
      ...previous,
      [visibleCampaign.id]: {
        campaignId: visibleCampaign.id,
        approvedAt: new Date().toISOString(),
        publishingDates: [...visibleCampaign.publishingDates],
        caption: visibleCampaign.caption,
        hashtags: [...visibleCampaign.hashtags],
        captionSource: assistant.result ? "ai" : "demo",
        status: "APPROVED_MOCK",
      },
    }));
  };
  return (
    <div className="view cp-overview">
      <div className="cp-view-heading">
        <div className="view-head">
          <p className="eyebrow">Destination intelligence</p>
          <h1>Campaign overview</h1>
          <p className="lead">
            The right audience. The right moment. A story worth sharing.
          </p>
        </div>
        <TravelPeriodSelector value={period} onChange={setPeriod} />
      </div>
      <div className="cp-demo-strip">
        <span className="status sample">Campaign demo</span>
        <p>
          Fictional audiences, booking patterns and campaign recommendations.
          Independent of the dashboard’s real and uploaded data.
        </p>
      </div>
      <div className="cp-layout">
        <SourceMarketMap selected={market} onSelect={setMarket} />
        {currentCampaign ? (
          <CampaignPlanner
            campaign={visibleCampaign!}
            approval={visibleApproval}
            assistant={assistant}
            onReview={() => setReview(true)}
          />
        ) : (
          <section className="card cp-loading" aria-live="polite">
            {error ? (
              <>
                <h2>Let’s try that again.</h2>
                <p role="alert">{error}</p>
                <button
                  className="btn"
                  onClick={() => setRetry((previous) => previous + 1)}
                >
                  Retry recommendation
                </button>
              </>
            ) : (
              <>
                <span className="cp-loading-symbol" aria-hidden="true">
                  ✦
                </span>
                <h2>Finding your campaign</h2>
                <p>Connecting the selected market and travel period…</p>
              </>
            )}
          </section>
        )}
      </div>
      {review && currentCampaign && (
        <CampaignReviewDialog
          campaign={visibleCampaign!}
          approval={visibleApproval}
          captionSource={assistant.result ? "ai" : "demo"}
          onApprove={approve}
          onClose={() => setReview(false)}
        />
      )}
    </div>
  );
}
