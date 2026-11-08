import { useDemand } from "../campaigns/demand/useDemand";
import { withDemand } from "../campaigns/demand/recommendation";
import { DEFAULT_TRAVEL_DATES } from "../campaigns/travelDates";
import { SEASONAL_ASSETS } from "../campaigns/seasonalAssets";
import TargetAgeSelector from "../campaigns/components/TargetAgeSelector";
import { DEFAULT_TARGET_AUDIENCE, type TargetAudience } from "../campaigns/types";
import { useCaptionAssistant } from "../campaigns/captions/useCaptionAssistant";
import { useEffect, useState } from "react";
import type { ViewProps } from "../App";
import type {
  CampaignDataProvider,
  CampaignRecommendation,
  SourceMarket,
  TravelDates,
} from "../campaigns/types";
import { campaignDataProvider } from "../campaigns/mockCampaignData";
import SourceMarketMap from "../campaigns/components/SourceMarketMap";
import TravelPeriodSelector from "../campaigns/components/TravelPeriodSelector";
import CampaignPlanner from "../campaigns/components/CampaignPlanner";
import { receive } from "../campaigns/management/model";
import { updateCampaigns } from "../campaigns/management/store";
import "../campaigns/overview.css";

// Creative previews are immediate; demand evidence is fetched separately and never replaced by mock metrics.
export default function Overview({
  provider = campaignDataProvider, go,
}: ViewProps & { provider?: CampaignDataProvider }) {
  const [market, setMarket] = useState<SourceMarket>("DE");
  const [targetAudience, setTargetAudience] = useState<TargetAudience>(DEFAULT_TARGET_AUDIENCE);
  const period = "custom" as const;
  const [travelDates, setTravelDates] = useState<TravelDates>(DEFAULT_TRAVEL_DATES);
  const [campaign, setCampaign] = useState<CampaignRecommendation | null>(() => provider.getImmediateRecommendation?.("DE", period, DEFAULT_TARGET_AUDIENCE, DEFAULT_TRAVEL_DATES) || null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    if (provider.getImmediateRecommendation) {
      setCampaign(provider.getImmediateRecommendation(market, period, targetAudience, travelDates));
      setError("");
      return;
    }
    setCampaign(null);
    setError("");
    provider
      .getRecommendation(market, period, targetAudience, travelDates)
      .then((result) => {
        if (current) {
          if (result.market !== market || result.period !== period || result.travel.start !== travelDates.start || result.travel.end !== travelDates.end || result.captionMetadata.ageMin !== targetAudience.ageMin || result.captionMetadata.ageMax !== targetAudience.ageMax) {
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
  }, [market, period, travelDates, targetAudience, provider, retry]);
  const baseCampaign =
    campaign?.market === market && campaign.period === period && campaign.travel.start === travelDates.start && campaign.travel.end === travelDates.end && campaign.captionMetadata.ageMin === targetAudience.ageMin && campaign.captionMetadata.ageMax === targetAudience.ageMax ? campaign : provider.getImmediateRecommendation?.(market, period, targetAudience, travelDates) || null;
  const demand = useDemand(travelDates);
  const query = demand.data[market];
  const dataStatus = query ? query.nights.value > 0 && query.guests.value > 0 ? "ready" : "empty" : demand.errors[market] ? "error" : "loading";
  const currentCampaign = baseCampaign ? withDemand(baseCampaign,query,dataStatus) : null;
  const assistant = useCaptionAssistant(currentCampaign);
  const selectedAsset = assistant.result?.assetId ? SEASONAL_ASSETS.find(asset => asset.id === assistant.result?.assetId) : undefined;
  const visibleCampaign = currentCampaign
    ? {
        ...currentCampaign,
        reasoningSource: assistant.result?.campaignReasoning ? "ai" as const : currentCampaign.reasoningSource,
        reasoning: assistant.result?.campaignReasoning || currentCampaign.reasoning,
        asset: selectedAsset ? { id:selectedAsset.id,src:selectedAsset.path,alt:selectedAsset.visualDescription,
          source:"AI_GENERATED" as const,credit:currentCampaign.asset.credit,description:selectedAsset.visualDescription } : currentCampaign.asset,
        theme: selectedAsset?.creativeTheme || currentCampaign.theme,
        captionMetadata: selectedAsset ? { ...currentCampaign.captionMetadata,
          assetId: selectedAsset.id, activity: selectedAsset.activity,
          creativeTheme: selectedAsset.creativeTheme, visualDescription: selectedAsset.visualDescription,
        } : currentCampaign.captionMetadata,
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
          <TravelPeriodSelector value={travelDates} onChange={setTravelDates} />
          <TargetAgeSelector value={targetAudience} onChange={setTargetAudience} />
        </div>
      </div>
      <div className="cp-demo-strip">
        <span className={`status ${dataStatus === "ready" ? "connected" : "sample"}`}>{dataStatus === "ready" ? "API demand" : dataStatus === "loading" ? "Loading demand" : "Demand unavailable"}</span>
        <p role={dataStatus === "error" ? "alert" : undefined} aria-live="polite">
          {dataStatus === "ready" ? "Data-informed planning · estimates and proxy methods apply. Creative images and initial captions remain illustrative." : dataStatus === "loading" ? "Loading evidence for the selected market and dates. The creative preview is available immediately." : demand.errors[market] || "No guest nights for this market and period. Choose different dates."}
        </p>
        {dataStatus === "error" && <button className="link" onClick={demand.retry}>Retry demand data</button>}
      </div>
      <div className="cp-layout">
        <SourceMarketMap selected={market} onSelect={setMarket} demand={demand.data} dates={travelDates} loading={demand.loading} />
        {currentCampaign ? (
          <CampaignPlanner
            campaign={visibleCampaign!}
            assistant={assistant}
            onReview={() => { updateCampaigns(state => receive(state, visibleCampaign!, assistant.result?.creativeReason)); go("actions"); }}
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

    </div>
  );
}
