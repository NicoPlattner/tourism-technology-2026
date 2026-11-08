import {
  parseDemand,
  type DataField,
  type DemandQuery,
} from "../campaigns/demand/contracts";
import {
  MARKETS,
  type SourceMarket,
  type TravelDates,
} from "../campaigns/types";

export interface ForecastDay {
  date: string;
  forecast: number;
  low: number | null;
  high: number | null;
  capacity: number | null;
  official: number | null;
  grade: string;
  events: string;
}
export interface ForecastData {
  daily: ForecastDay[];
  generated?: string;
  capacityBasis: string;
  sources: string[];
}
export interface HistoricalMonth {
  month: string;
  actual: number;
  forecast: number;
  tracking: number | null;
}
export interface Driver {
  name: string;
  nights: number;
  low: number | null;
  high: number | null;
  grade: string;
  kind: string;
}
export interface HistoryData {
  monthly: HistoricalMonth[];
  drivers: Driver[];
  method: string;
}
export interface MarketData extends DemandQuery {
  distribution?: DataField<Record<string, number>>;
  weekly?: DataField<Record<string, number>>;
  age?: DataField<Record<string, number>>;
}
export const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const nonnegative = (v: unknown): v is number => finite(v) && v >= 0;
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function validDate(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !Number.isNaN(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v
  );
}
export function validPeriod(dates: TravelDates) {
  return (
    validDate(dates.start) &&
    validDate(dates.end) &&
    dates.start >= "2024-01-01" &&
    dates.end <= "2027-12-31" &&
    dates.start <= dates.end
  );
}
export function parseForecast(raw: unknown, dates: TravelDates): ForecastData {
  if (!object(raw) || !Array.isArray(raw.daily) || !object(raw.meta))
    throw new Error("The forecast response is incomplete.");
  const seen = new Set<string>();
  const daily = raw.daily
    .map((r: unknown): ForecastDay => {
      if (
        !object(r) ||
        !validDate(r.date) ||
        !nonnegative(r.forecast_ours) ||
        seen.has(r.date)
      )
        throw new Error(
          "The forecast contains invalid or duplicate daily values.",
        );
      seen.add(r.date);
      const band =
        nonnegative(r.p10) &&
        nonnegative(r.p90) &&
        r.p10 <= r.forecast_ours &&
        r.p90 >= r.forecast_ours;
      return {
        date: r.date,
        forecast: r.forecast_ours,
        low: band ? (r.p10 as number) : null,
        high: band ? (r.p90 as number) : null,
        capacity:
          nonnegative(r.capacity_est) && r.capacity_est > 0
            ? r.capacity_est
            : null,
        official: nonnegative(r.forecast_official_tr53)
          ? r.forecast_official_tr53
          : null,
        grade: typeof r.grade === "string" ? r.grade : "—",
        events: typeof r.events === "string" ? r.events : "",
      };
    })
    .filter((r) => r.date >= dates.start && r.date <= dates.end)
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    daily,
    generated:
      typeof raw.meta.generated === "string" ? raw.meta.generated : undefined,
    capacityBasis:
      typeof raw.meta.capacity === "string"
        ? raw.meta.capacity
        : "Capacity basis not supplied by the API.",
    sources: Array.isArray(raw.meta.sources)
      ? raw.meta.sources.filter((v): v is string => typeof v === "string")
      : [],
  };
}
export function summarizeForecast(rows: ForecastDay[], dates: TravelDates) {
  const known = rows.filter((r) => r.capacity !== null);
  const capacity = known.reduce((s, r) => s + r.capacity!, 0);
  const nightsWithCapacity = known.reduce((s, r) => s + r.forecast, 0);
  const expectedDays = validPeriod(dates)
    ? (Date.parse(dates.end) - Date.parse(dates.start)) / 86400000 + 1
    : 0;
  return {
    nights: rows.reduce((s, r) => s + r.forecast, 0),
    coverage: rows.length,
    expectedDays,
    occupancy: capacity ? nightsWithCapacity / capacity : null,
    spare: capacity
      ? known.reduce((s, r) => s + Math.max(0, r.capacity! - r.forecast), 0)
      : null,
    capacityDays: known.length,
    tightDays: known.filter((r) => r.forecast / r.capacity! >= 0.95).length,
    spareDays: known.filter((r) => r.forecast / r.capacity! < 0.8).length,
  };
}
export function parseHistory(raw: unknown): HistoryData {
  if (
    !object(raw) ||
    !Array.isArray(raw.monthly) ||
    !Array.isArray(raw.drivers)
  )
    throw new Error("Historical analysis is unavailable.");
  const monthly = raw.monthly
    .map((r: unknown): HistoricalMonth => {
      if (
        !object(r) ||
        typeof r.month !== "string" ||
        !/^\d{4}-\d{2}$/.test(r.month) ||
        !nonnegative(r.actual) ||
        !nonnegative(r.forecast_tvb)
      )
        throw new Error("Invalid historical monthly values.");
      return {
        month: r.month,
        actual: r.actual,
        forecast: r.forecast_tvb,
        tracking: finite(r.tracking_signal) ? r.tracking_signal : null,
      };
    })
    .sort((a, b) => a.month.localeCompare(b.month));
  const drivers = raw.drivers
    .map((r: unknown): Driver => {
      if (!object(r) || typeof r.driver !== "string" || !finite(r.stays_total))
        throw new Error("Invalid deviation drivers.");
      return {
        name: r.driver,
        nights: r.stays_total,
        low: finite(r.ci80_low) ? r.ci80_low : null,
        high: finite(r.ci80_high) ? r.ci80_high : null,
        grade: typeof r.grade === "string" ? r.grade : "—",
        kind: typeof r.kind === "string" ? r.kind : "",
      };
    })
    .sort((a, b) => Math.abs(b.nights) - Math.abs(a.nights));
  return {
    monthly,
    drivers,
    method:
      object(raw.summary) && typeof raw.summary.method === "string"
        ? raw.summary.method
        : "Model associations; not proven causal effects.",
  };
}
function numericField(
  v: unknown,
  transform: (value: Record<string, unknown>) => Record<string, number>,
): DataField<Record<string, number>> | undefined {
  if (
    !object(v) ||
    !object(v.value) ||
    typeof v.method !== "string" ||
    typeof v.is_estimate !== "boolean" ||
    !["A", "B", "C", "D"].includes(String(v.grade))
  )
    return;
  const values = transform(v.value);
  return Object.keys(values).length
    ? {
        value: values,
        method: v.method,
        grade: v.grade as "A" | "B" | "C" | "D",
        is_estimate: v.is_estimate,
      }
    : undefined;
}
export function parseMarket(
  raw: unknown,
  market: SourceMarket,
  dates: TravelDates,
): MarketData {
  const query = parseDemand(raw, market, dates);
  const r = raw as Record<string, unknown>;
  const lead =
    object(r.booking_lead_time) && object(r.booking_lead_time.value)
      ? r.booking_lead_time.value
      : {};
  const distribution = numericField(
    { ...query.booking_lead_time, value: lead.share_by_days_ahead },
    (value) =>
      Object.fromEntries(
        Object.entries(value).filter((entry): entry is [string, number] => {
          const [k, v] = entry;
          return (
            ["0d", "8d", "31d", "61d", "90d", "180d"].includes(k) &&
            nonnegative(v) &&
            v <= 1
          );
        }),
      ),
  );
  const weekly = numericField(r.weekly_nights, (value) =>
    Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, number] =>
          validDate(entry[0]) && nonnegative(entry[1]),
      ),
    ),
  );
  const age = numericField(r.age_profile, (value) =>
    Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, number] =>
          entry[0].startsWith("age_") && nonnegative(entry[1]) && entry[1] <= 1,
      ),
    ),
  );
  return { ...query, distribution, weekly, age };
}
export function historicalSummary(rows: HistoricalMonth[]) {
  const actual = rows.reduce((s, r) => s + r.actual, 0),
    forecast = rows.reduce((s, r) => s + r.forecast, 0);
  return {
    actual,
    forecast,
    bias: actual ? (forecast - actual) / actual : null,
    weightedError: actual
      ? rows.reduce((s, r) => s + Math.abs(r.forecast - r.actual), 0) / actual
      : null,
  };
}
export const API_BASE = () =>
  new URL("c04-api/", new URL(import.meta.env.BASE_URL, window.location.href));
export async function getData<T>(
  path: string,
  signal: AbortSignal,
  parse: (raw: unknown) => T,
): Promise<T> {
  const response = await fetch(new URL(path, API_BASE()), { signal });
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? "No data is available for this selection."
        : "The data service is unavailable. Please retry.",
    );
  return parse(await response.json());
}
export { MARKETS };
