import TargetAgeSelector from "../campaigns/components/TargetAgeSelector";
import { DEFAULT_TARGET_AUDIENCE, type TargetAudience } from "../campaigns/types";
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
  const [targetAudience, setTargetAudience] = useState<TargetAudience>(DEFAULT_TARGET_AUDIENCE);
  const [period, setPeriod] = useState<TravelPeriod>("q1-2027");
  const [campaign, setCampaign] = useState<CampaignRecommendation | null>(() => provider.getImmediateRecommendation?.("DE", "q1-2027") || null);
  const [approvals, setApprovals] = useState<Record<string, CampaignApproval>>(
    {},
  );
  const [review, setReview] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    if (provider.getImmediateRecommendation) {
      setCampaign(provider.getImmediateRecommendation(market, period, targetAudience));
      setError("");
      setReview(false);
      return;
    }
    setCampaign(null);
    setError("");
    setReview(false);
    provider
      .getRecommendation(market, period, targetAudience)
      .then((result) => {
        if (current) {
          if (result.market !== market || result.period !== period || result.captionMetadata.ageMin !== targetAudience.ageMin || result.captionMetadata.ageMax !== targetAudience.ageMax) {
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
  }, [market, period, targetAudience, provider, retry]);
  const currentCampaign =
    campaign?.market === market && campaign.period === period && campaign.captionMetadata.ageMin === targetAudience.ageMin && campaign.captionMetadata.ageMax === targetAudience.ageMax ? campaign : provider.getImmediateRecommendation?.(market, period, targetAudience) || null;
  const assistant = useCaptionAssistant(currentCampaign);
  const visibleCampaign = currentCampaign
    ? {
        ...currentCampaign,
        caption: assistant.result?.caption || currentCampaign.caption,
        hashtags: assistant.result?.hashtags || currentCampaign.hashtags,
        captionContent: assistant.result ? {
          text: assistant.result.caption,
          hashtags: assistant.result.hashtags,
          language: assistant.result.language,
          source: "live_ai" as const,
        } : currentCampaign.captionContent,
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
        captionSource: assistant.source,
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
        <div className="cp-controls">
          <TravelPeriodSelector value={period} onChange={setPeriod} />
          <TargetAgeSelector value={targetAudience} onChange={setTargetAudience} />
        </div>
      </div>
      <div className="cp-demo-strip">
        <span className="status sample">Campaign demo</span>
        <p>
          Illustrative booking patterns and campaign recommendations. You choose the target audience.
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
          captionSource={assistant.source}
          onApprove={approve}
          onClose={() => setReview(false)}
        />
      )}
    </div>
  );
}
