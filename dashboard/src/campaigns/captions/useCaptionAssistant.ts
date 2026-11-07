import { useCallback, useEffect, useRef, useState } from "react";
import { CaptionClient } from "./client";
import { metadataKey, type AiCaption, type CaptionMetadata } from "./contracts";
const endpoint = new URL(
  "api/marketing/generate-caption",
  new URL(import.meta.env.BASE_URL, window.location.href),
).toString();
export const captionClient = new CaptionClient(endpoint);
interface State {
  key: string;
  result?: AiCaption;
  pending: boolean;
  error: string;
}
export function useCaptionAssistant(
  metadata: CaptionMetadata | undefined,
  client = captionClient,
) {
  const key = metadata ? metadataKey(metadata) : "";
  const activeKey = useRef(key);
  activeKey.current = key;
  const serial = useRef(0);
  const [state, setState] = useState<State>({
    key: "",
    pending: false,
    error: "",
  });
  useEffect(() => {
    const request = ++serial.current;
    let active = true;
    if (!metadata) {
      setState({ key: "", pending: false, error: "" });
      return;
    }
    const cached = client.getCached(metadata);
    setState({ key, result: cached, pending: !cached, error: "" });
    if (!cached)
      client
        .generate(metadata)
        .then((result) => {
          if (active && activeKey.current === key && serial.current === request)
            setState({ key, result, pending: false, error: "" });
        })
        .catch((error) => {
          if (active && activeKey.current === key && serial.current === request)
            setState({
              key,
              pending: false,
              error:
                error instanceof Error
                  ? error.message
                  : "AI captions are unavailable. Please retry.",
            });
        });
    return () => {
      active = false;
    };
  }, [key, client]);
  const regenerate = useCallback(() => {
    if (!metadata) return;
    const request = ++serial.current;
    const previous = client.getCached(metadata);
    setState({ key, result: previous, pending: true, error: "" });
    client
      .generate(metadata, true)
      .then((result) => {
        if (activeKey.current === key && serial.current === request)
          setState({ key, result, pending: false, error: "" });
      })
      .catch((error) => {
        if (activeKey.current === key && serial.current === request)
          setState({
            key,
            result: previous,
            pending: false,
            error:
              error instanceof Error
                ? error.message
                : "Regeneration failed. Please retry.",
          });
      });
  }, [key, client, metadata]);
  useEffect(
    () => () => {
      activeKey.current = "";
      serial.current++;
    },
    [],
  );
  const cached = metadata ? client.getCached(metadata) : undefined;
  const visible =
    state.key === key
      ? state
      : { key, result: cached, pending: !!metadata && !cached, error: "" };
  return { ...visible, regenerate };
}
export type CaptionAssistantState = ReturnType<typeof useCaptionAssistant>;
