export type ISODate = string; // YYYY-MM-DD

export interface Weather {
  precip: number; // mm
  snow: number; // cm fresh snow
  tmax: number;
  tmin: number;
  sun: number; // hours
  isForecast: boolean;
}

export interface MarketHoliday {
  market: string; // ISO country code
  name: string;
  coverage: number; // 0..1 share of the market's regions on holiday
}

export type Flag = 'zero-stays' | 'missing-beds';

/** One day, with everything we know about it from every source. */
export interface Day {
  date: ISODate;
  actual: number | null; // null = not yet happened or not reported
  forecast: number | null; // partner forecast (TVB / Feratel)
  openForecast: number | null; // open model forecast (JOANNEUM / Austria Tourism)
  previousYear: number | null;
  beds: number | null;
  weather: Weather | null;
  holidays: MarketHoliday[];
  events: string[];
  flags: Flag[];
}

export type SourceStatus = 'connected' | 'live' | 'snapshot' | 'sample' | 'planned';

export interface SourceInfo {
  id: string;
  name: string;
  provider: string;
  answers: string; // the plain-language question this source helps answer
  status: SourceStatus;
  licence: string;
  update: string;
  coverage?: string;
  retrieved?: string;
  url?: string;
}

export interface Dataset {
  today: ISODate;
  days: Day[];
  sources: SourceInfo[];
  marketMix: Record<string, number>;
  sampleData: boolean;
}
