import { useEffect, useState } from "react";
import {
  getData,
  parseForecast,
  parseHistory,
  parseMarket,
  validPeriod,
} from "./data";
import { ORIGIN_CODES } from "../campaigns/demand/contracts";
import type { SourceMarket, TravelDates } from "../campaigns/types";

export interface Resource<T> {
  data?: T;
  error?: string;
  loading: boolean;
  retry: () => void;
}
export function useAnalysis<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
  enabled = true,
): Resource<T> {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    data?: T;
    error?: string;
    loading: boolean;
  }>({ key: "", loading: true });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let timedOut = false;
    let active = true;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 15000);
    setState({ key, loading: true });
    load(controller.signal)
      .then((data) => {
        if (active && !controller.signal.aborted)
          setState({ key, data, loading: false });
      })
      .catch((error) => {
        if (active && (!controller.signal.aborted || timedOut))
          setState({
            key,
            loading: false,
            error: timedOut
              ? "The data request timed out. Please retry."
              : error instanceof Error
                ? error.message
                : "Data is unavailable.",
          });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
    // key describes all request inputs; load intentionally uses those same inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt, enabled]);
  return {
    ...(state.key === key && enabled ? state : { loading: true }),
    retry: () => setAttempt((n) => n + 1),
  };
}
export function useForecast(dates: TravelDates, snapshot: string) {
  return useAnalysis(
    `${snapshot}:${dates.start}:${dates.end}`,
    (signal) =>
      getData(
        `forecast?${new URLSearchParams({ start: dates.start, end: dates.end })}`,
        signal,
        (raw) => parseForecast(raw, dates),
      ),
    snapshot !== "loading" && validPeriod(dates),
  );
}
export function useHistory(season: string, snapshot: string) {
  return useAnalysis(
    `${snapshot}:${season}`,
    (signal) =>
      getData(
        `deviations?${new URLSearchParams({ season })}`,
        signal,
        parseHistory,
      ),
    snapshot !== "loading",
  );
}
export function useMarket(
  market: SourceMarket,
  dates: TravelDates,
  snapshot: string,
) {
  return useAnalysis(
    `${snapshot}:${market}:${dates.start}:${dates.end}`,
    (signal) =>
      getData(
        `query?${new URLSearchParams({ destination: "PAZNAUN", origin: ORIGIN_CODES[market], start: dates.start, end: dates.end })}`,
        signal,
        (raw) => parseMarket(raw, market, dates),
      ),
    snapshot !== "loading" && validPeriod(dates),
  );
}
