import { creativeRequest } from "./creativeRequest";
import { useCallback, useRef, useState } from "react";
import { CaptionClient } from "./client";
import { metadataKey, type AiCaption } from "./contracts";
import type { CampaignRecommendation } from "../types";
const endpoint = new URL(
  "api/marketing/generate-caption",
  new URL(import.meta.env.BASE_URL, window.location.href),
).toString();
export const captionClient = new CaptionClient(endpoint);
interface State {
  result?: AiCaption;
  pending: boolean;
  error: string;
}
export function useCaptionAssistant(
  campaign: CampaignRecommendation | null,
  client = captionClient,
) {
  const requestMetadata = campaign ? creativeRequest(campaign) : undefined;
  const key = campaign ? campaign.id + metadataKey(requestMetadata!) : "";
  const [states, setStates] = useState<Record<string, State>>({});
  const pending = useRef(new Set<string>());
  const cached = campaign ? client.getCached(requestMetadata!, campaign.id) : undefined;
  const visible = states[key] || { result: cached, pending: false, error: "" };
  const unavailable = (!!campaign?.dataStatus && campaign.dataStatus !== "ready") || campaign?.windowRecommendation?.status === "loading" || campaign?.windowRecommendation?.timingAvailable === false;
  const regenerate = useCallback(() => {
    if (unavailable || !campaign || !requestMetadata || pending.current.has(key)) return;
    pending.current.add(key);
    const previous = client.getCached(requestMetadata!, campaign.id);
    const update = (state: State) => setStates(old => ({ ...old, [key]: state }));
    update({ result: previous, pending: true, error: "" });
    client.generate(requestMetadata!, true, campaign.id)
      .then(result => update({ result, pending: false, error: "" }))
      .catch(error => update({ result: previous, pending: false,
        error: error instanceof Error ? error.message : "Regeneration failed. Please retry." }))
      .finally(() => pending.current.delete(key));
  }, [key, campaign, client, unavailable]);
  return { ...visible, regenerate, unavailable,
    source: visible.result ? "live_ai" as const : campaign?.captionContent.source || "demo_fallback" as const,
  };
}
export type CaptionAssistantState = ReturnType<typeof useCaptionAssistant>;
